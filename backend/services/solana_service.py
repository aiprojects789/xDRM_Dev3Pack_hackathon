import logging
from typing import Optional, Dict, Any, List
import asyncio
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.keypair import Keypair
from solders.system_program import ID as SYS_PROGRAM_ID
from solders.transaction import Transaction
from spl.token.instructions import transfer_checked, TransferCheckedParams, get_associated_token_address, transfer, TransferParams, create_associated_token_account
from app.core.config import settings

logger = logging.getLogger(__name__)

class SolanaService:
    def __init__(self):
        import os
        from dotenv import load_dotenv
        load_dotenv(override=True)  # Force reload from .env in case uvicorn cached it
        
        # Priority: .env directly -> settings -> fallback
        self.rpc_url = os.getenv("SOLANA_RPC_URL", getattr(settings, 'SOLANA_RPC_URL', 'https://api.devnet.solana.com'))
        self.client = AsyncClient(self.rpc_url, commitment=Confirmed)
        self.platform_address = getattr(settings, 'SOLANA_PLATFORM_ADDRESS', '')
        self.program_id = getattr(settings, 'SOLANA_PROGRAM_ID', '')
        self.demo_mode = getattr(settings, 'DEMO_MODE', False)
        logger.info(f"✅ SolanaService initialized (Network: {self.rpc_url}, Platform: {self.platform_address}, Demo: {self.demo_mode})")

    def _get_tx_and_meta(self, response_value):
        """Helper to extract transaction data and meta from different solders versions"""
        if not response_value:
            return None, None
            
        tx = None
        meta = None

        # Try common object attributes first
        try:
            # 1. Check if it's the newer nested structure
            # response.value.transaction contains both transaction and meta
            if hasattr(response_value, 'transaction'):
                potential_tx = response_value.transaction
                if hasattr(potential_tx, 'meta') and hasattr(potential_tx, 'transaction'):
                    tx = potential_tx.transaction
                    meta = potential_tx.meta
            
            # 2. Check if they are direct attributes (most common)
            if tx is None or meta is None:
                tx = getattr(response_value, 'transaction', tx)
                meta = getattr(response_value, 'meta', meta)
                
            # 3. Handle dictionary access (if JSON parsed result is returned as dict)
            if (tx is None or meta is None) and isinstance(response_value, dict):
                tx = response_value.get('transaction', tx)
                meta = response_value.get('meta', meta)
        except Exception as e:
            logger.warning(f"⚠️ Error in _get_tx_and_meta parsing: {e}")

        return tx, meta

    def _collect_all_instructions(self, tx_data, meta):
        """Gather top-level + inner instructions into a single list."""
        all_ix = []
        if not tx_data:
            return []

        # 1. Standard/Legacy Transaction Instructions
        if hasattr(tx_data, 'message') and hasattr(tx_data.message, 'instructions'):
            all_ix.extend(tx_data.message.instructions)
        elif isinstance(tx_data, dict) and 'message' in tx_data and 'instructions' in tx_data['message']:
            all_ix.extend(tx_data['message']['instructions'])

        # 2. Versioned Transaction Instructions (stored at root)
        if hasattr(tx_data, 'instructions'):
            all_ix.extend(tx_data.instructions)
        elif isinstance(tx_data, dict) and 'instructions' in tx_data:
            all_ix.extend(tx_data['instructions'])

        # 3. Inner Instructions (logs)
        if meta and hasattr(meta, 'inner_instructions') and meta.inner_instructions:
            for inner in meta.inner_instructions:
                if hasattr(inner, 'instructions'):
                    all_ix.extend(inner.instructions)
                elif isinstance(inner, dict) and 'instructions' in inner:
                    all_ix.extend(inner['instructions'])
        
        return all_ix

    async def get_balance(self, address: str) -> float:
        """Get SOL balance for an address"""
        try:
            pubkey = Pubkey.from_string(address)
            response = await self.client.get_balance(pubkey)
            if response.value is not None:
                return response.value / 1_000_000_000  # Convert lamports to SOL
            return 0.0
        except Exception as e:
            logger.error(f"❌ Failed to get Solana balance for {address}: {e}")
            return 0.0

    async def check_connection_health(self) -> Dict[str, Any]:
        """Check the health of the Solana RPC connection"""
        try:
            if self.demo_mode:
                return {"status": "healthy", "mode": "demo", "network": "solana"}
            
            # Test basic connection by getting slot
            response = await self.client.get_slot()
            if response.value is not None:
                return {
                    "status": "healthy",
                    "network": "solana",
                    "rpc_url": self.rpc_url,
                    "slot": response.value,
                    "program_id": self.program_id
                }
            return {"status": "error", "message": "No response from Solana RPC"}
        except Exception as e:
            logger.error(f"❌ Solana health check failed: {e}")
            return {"status": "error", "message": str(e)}

    async def get_artwork_owner(self, mint_address: str) -> Optional[str]:
        """Alias for get_nft_owner to match Web3Service interface"""
        return await self.get_nft_owner(mint_address)

    async def verify_registration(self, tx_hash: str, mint_address: str, expected_creator: Optional[str] = None) -> Dict[str, Any]:
        """
        Verify that a Metaplex NFT was minted in a specific transaction.
        
        Args:
            tx_hash: Solana transaction signature
            mint_address: The public key of the minted NFT
            expected_creator: Verified address that MUST be the transaction signer/creator
        """
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            
            if not response.value:
                return {"success": False, "error": "Transaction not found"}
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            
            if not meta or not tx_data:
                return {"success": False, "error": "Could not parse transaction data or metadata"}

            if meta.err:
                return {"success": False, "error": f"Transaction failed on-chain: {meta.err}"}

            # 1. Verify Signer (Expected Creator)
            if expected_creator:
                signers = [str(acc.pubkey) for acc in tx_data.message.account_keys if acc.signer]
                if expected_creator not in signers:
                    logger.warning(f"❌ Spoofing detected! Signers {signers} != Expected {expected_creator}")
                    return {"success": False, "error": "Transaction signer does not match expected creator"}

            # 2. Verify Mint Address (Check if it's involved in the transaction)
            account_keys = [str(acc.pubkey) for acc in tx_data.message.account_keys]
            if mint_address not in account_keys:
                return {"success": False, "error": "Mint address not found in transaction accounts"}

            # 3. Check for Metaplex Program ID (Token Metadata Program: metaqbxxUunU7WU8ifzf9no2S4MtxuXQXF7pYAD82)
            metaplex_program_id = "metaqbxxUunU7WU8ifzf9no2S4MtxuXQXF7pYAD82"
            all_instructions = self._collect_all_instructions(tx_data, meta)
            
            is_metaplex_tx = any(
                str(getattr(ix, 'program_id', '')) == metaplex_program_id
                for ix in all_instructions
            )

            if not is_metaplex_tx:
                logger.warning(f"⚠️ Transaction {tx_hash} does not appear to involve Metaplex Metadata program")
                # We might still allow it if it's a simple mint, but Metaplex is preferred for NFTs
            
            return {
                "success": True,
                "token_id": mint_address,
                "mint_address": mint_address,
                "network": "solana"
            }

        except Exception as e:
            logger.error(f"❌ Error verifying Solana registration: {e}")
            return {"success": False, "error": str(e)}

    async def verify_registration_receipt(self, tx_hash: str, expected_creator: str, expected_platform_lamports: int = 0) -> Dict[str, Any]:
        """
        Verify a Solana registration "receipt" transaction.
        
        This verifies:
        1. The transaction succeeded on-chain
        2. It was signed by the expected creator
        3. If a platform fee is expected, verify the SOL transfer to the platform address
        
        This is used when the frontend sends a fee-payment transaction (not a full Metaplex mint).
        The `token_id` returned is a `sol_<hash>` placeholder.
        """
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            
            if not response.value:
                return {"success": False, "error": "Transaction not found on Solana. It may still be processing — try again in a few seconds."}
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            
            if not meta or not tx_data:
                return {"success": False, "error": "Could not parse transaction data or metadata"}

            if meta.err:
                return {"success": False, "error": f"Transaction failed on-chain: {meta.err}"}

            # 1. Verify Signer
            signers = []
            if hasattr(tx_data, 'message') and hasattr(tx_data.message, 'account_keys'):
                signers = [str(acc.pubkey) for acc in tx_data.message.account_keys if acc.signer]
            
            if expected_creator and expected_creator not in signers:
                logger.warning(f"❌ Registration signer mismatch! Signers {signers} != Expected {expected_creator}")
                return {"success": False, "error": "Transaction signer does not match expected creator address"}

            # 2. Verify platform fee payment (if required)
            if expected_platform_lamports > 0 and self.platform_address:
                all_instructions = self._collect_all_instructions(tx_data, meta)
                platform_received = 0
                
                for ix in all_instructions:
                    if hasattr(ix, 'parsed') and isinstance(ix.parsed, dict):
                        if ix.parsed.get('type') == 'transfer':
                            info = ix.parsed.get('info', {})
                            if info.get('destination') == self.platform_address:
                                platform_received += info.get('lamports', 0)
                
                # Allow 1% tolerance for rounding
                if platform_received < expected_platform_lamports * 0.99:
                    return {
                        "success": False,
                        "error": f"Platform fee payment insufficient. Expected ~{expected_platform_lamports} lamports, found {platform_received} lamports"
                    }
                
                logger.info(f"✅ Platform received {platform_received} lamports (expected {expected_platform_lamports})")

            # 3. Try to extract a real mint address from the transaction
            mint_address = await self._extract_mint_from_tx(tx_data, meta, expected_creator)
            
            if mint_address:
                logger.info(f"✅ Extracted real mint address from registration tx: {mint_address}")
                return {
                    "success": True,
                    "token_id": mint_address,
                    "mint_address": mint_address,
                    "is_placeholder": False,
                    "network": "solana"
                }
            
            # Fallback: generate a placeholder ID from the tx hash
            placeholder_id = f"sol_{tx_hash[:32]}"
            logger.info(f"ℹ️ No real mint found in registration tx. Using placeholder: {placeholder_id}")
            return {
                "success": True,
                "token_id": placeholder_id,
                "mint_address": None,
                "is_placeholder": True,
                "network": "solana"
            }

        except Exception as e:
            logger.error(f"❌ Error verifying Solana registration receipt: {e}")
            return {"success": False, "error": str(e)}

    async def _extract_mint_from_tx(self, tx_data, meta, expected_creator: Optional[str] = None) -> Optional[str]:
        """
        Extract a mint address from a Solana transaction.
        Checks for Metaplex minting or standard SPL Token minting instructions.
        """
        try:
            all_instructions = self._collect_all_instructions(tx_data, meta)

            # Strategy 1: Look for SPL Token mint instructions
            for ix in all_instructions:
                if hasattr(ix, 'parsed') and isinstance(ix.parsed, dict):
                    ptype = ix.parsed.get('type')
                    pinfo = ix.parsed.get('info', {})
                    if ptype in ('initializeMint', 'mintTo', 'initializeMint2', 'initializeMint3'):
                        mint = pinfo.get('mint')
                        if mint:
                            logger.info(f"✅ Found mint address via SPL instruction ({ptype}): {mint}")
                            return str(mint)
                
                # Strategy 2: Check raw Metaplex instructions
                elif hasattr(ix, 'data') and isinstance(ix.data, str):
                    if str(getattr(ix, 'program_id', '')) == "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s":
                        accounts = getattr(ix, 'accounts', [])
                        if accounts:
                            for acc in accounts[:3]:
                                if str(acc) != str(expected_creator):
                                    logger.info(f"🎨 Metaplex detected. Guessing mint from accounts: {acc}")
                                    return str(acc)

            # Strategy 3: Analyze Token Balances (Best for complex mints)
            if meta and meta.post_token_balances:
                pre_mints = {str(b.mint) for b in meta.pre_token_balances} if meta.pre_token_balances else set()
                for balance in meta.post_token_balances:
                    mint = str(balance.mint)
                    if mint not in pre_mints:
                        logger.info(f"✅ Found NEW mint address via token balance diff: {mint}")
                        return mint
                
                # Fallback: any mint in post balances that isn't the known creator
                for balance in meta.post_token_balances:
                    mint = str(balance.mint)
                    if mint != str(expected_creator):
                        logger.info(f"✅ Found mint address via post token balance: {mint}")
                        return mint

            return None
        except Exception as e:
            logger.warning(f"⚠️ Error extracting mint from transaction: {e}")
            return None

    async def verify_payment(self, tx_hash: str, expected_recipient: str, expected_amount_sol: float, expected_sender: Optional[str] = None) -> Dict[str, Any]:
        """
        Verify a SOL payment transaction.
        """
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            
            if not response.value:
                return {"success": False, "error": "Transaction not found"}
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            
            if not meta or not tx_data:
                return {"success": False, "error": "Could not parse transaction data or metadata"}

            if meta.err:
                return {"success": False, "error": "Transaction failed on-chain"}

            # Verify sender
            if expected_sender:
                signers = [str(acc.pubkey) for acc in tx_data.message.account_keys if acc.signer]
                if expected_sender not in signers:
                    return {"success": False, "error": "Sender mismatch"}

            # Verify SOL transfer to recipient
            all_instructions = self._collect_all_instructions(tx_data, meta)
            total_transferred = 0
            found_transfer = False
            
            for ix in all_instructions:
                if hasattr(ix, 'parsed') and isinstance(ix.parsed, dict):
                    if ix.parsed.get('type') == 'transfer':
                        info = ix.parsed.get('info', {})
                        if info.get('destination') == expected_recipient:
                            total_transferred += info.get('lamports', 0)
                            found_transfer = True

            actual_sol = total_transferred / 1_000_000_000
            if not found_transfer or actual_sol < expected_amount_sol * 0.99: # Allow small discrepancy
                return {"success": False, "error": f"Payment not found or insufficient. Found: {actual_sol} SOL, Expected: {expected_amount_sol} SOL"}

            return {"success": True, "tx_hash": tx_hash, "amount": actual_sol}
        except Exception as e:
            logger.error(f"❌ Solana payment verification error: {e}")
            return {"success": False, "error": str(e)}

    async def get_nft_owner(self, mint_address: str) -> Optional[str]:
        """Find the current owner of a Solana NFT by checking the largest token account"""
        try:
            # ✅ Handle placeholder IDs (cannot query blockchain for these)
            if not mint_address or str(mint_address).startswith("sol_"):
                logger.info(f"ℹ️ Placeholder Solana ID detected: {mint_address}. Skipping chain lookup.")
                return None

            pubkey = Pubkey.from_string(str(mint_address))
            # Find the largest token account for this mint
            response = await self.client.get_token_largest_accounts(pubkey)
            if not response.value:
                return None
            
            # Get the first (largest) account
            largest_account = response.value[0].address
            
            # Get account info to find the owner
            account_info = await self.client.get_account_info_json_parsed(largest_account)
            if not account_info.value:
                return None
            
            # Extract owner from parsed data
            data = account_info.value.data
            if hasattr(data, 'parsed'):
                return data.parsed.get('info', {}).get('owner')
            
            return None
        except Exception as e:
            logger.error(f"❌ Failed to get Solana NFT owner for {mint_address}: {e}")
            return None

    async def get_nft_metadata(self, mint_address: str) -> Optional[str]:
        """Fetch the metadata URI from the Metaplex Metadata account"""
        try:
            if not mint_address or str(mint_address).startswith("sol_"):
                return None
            
            mint_pubkey = Pubkey.from_string(str(mint_address))
            metadata_program_id = Pubkey.from_string("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
            
            # Derive metadata address
            seeds = [b"metadata", bytes(metadata_program_id), bytes(mint_pubkey)]
            metadata_address, _ = Pubkey.find_program_address(seeds, metadata_program_id)
            
            # Fetch account data
            response = await self.client.get_account_info(metadata_address)
            if not response.value:
                return None
            
            # Decode metadata (simplified extraction)
            data = response.value.data
            try:
                # Basic extraction: look for https:// or ipfs://
                data_str = data.decode('utf-8', errors='ignore')
                import re
                match = re.search(r'(https?://[^\x00]+|ipfs://[^\x00]+)', data_str)
                if match:
                    return match.group(1).strip()
            except:
                pass
            
            return None
        except Exception as e:
            logger.debug(f"ℹ️ Failed to fetch Solana metadata URI for {mint_address}: {e}")
            return None

    async def get_nft_metadata_detailed(self, mint_address: str) -> Dict[str, Any]:
        """Fetch full Metaplex metadata including creators and royalty from the blockchain"""
        try:
            if not mint_address or str(mint_address).startswith("sol_"):
                return {}

            mint_pubkey = Pubkey.from_string(str(mint_address))
            metadata_program_id = Pubkey.from_string("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

            # Derive metadata address
            seeds = [b"metadata", bytes(metadata_program_id), bytes(mint_pubkey)]
            metadata_address, _ = Pubkey.find_program_address(seeds, metadata_program_id)

            # Fetch account data
            response = await self.client.get_account_info(metadata_address)
            
            # Also fetch the current owner of the NFT (Largest Account)
            owner = None
            try:
                # get_token_largest_accounts gives us the ATA currently holding the NFT
                largest_acc_resp = await self.client.get_token_largest_accounts(mint_pubkey)
                if largest_acc_resp.value:
                    ata_address = largest_acc_resp.value[0].address
                    # Now get the owner of this ATA
                    ata_info = await self.client.get_account_info(ata_address)
                    if ata_info.value and len(ata_info.value.data) >= 64:
                        # ATA Layout: Mint (32), Owner (32) ...
                        owner = str(Pubkey.from_bytes(ata_info.value.data[32:64]))
            except Exception as e:
                logger.warning(f"⚠️ Failed to fetch current NFT owner: {e}")

            if not response.value or not response.value.data:
                return {"owner": owner} if owner else {}

            data = response.value.data
            
            # Metaplex metadata extraction (Standard V1 Layout)
            # 0: Key, 1-32: Update Auth, 33-64: Mint
            update_authority = str(Pubkey.from_bytes(data[1:33]))
            
            # Heuristic-based extraction for Name, Symbol, URI and Royalty
            # Offset 65 starts the 'Data' struct
            try:
                # Name (4 bytes length + content)
                name_len = int.from_bytes(data[65:69], 'little')
                name = data[69:69+name_len].decode('utf-8', errors='ignore').strip('\x00')
                
                # Symbol (4 bytes length + content)
                sym_offset = 69 + name_len
                sym_len = int.from_bytes(data[sym_offset:sym_offset+4], 'little')
                symbol = data[sym_offset+4:sym_offset+4+sym_len].decode('utf-8', errors='ignore').strip('\x00')
                
                # URI (4 bytes length + content)
                uri_offset = sym_offset + 4 + sym_len
                uri_len = int.from_bytes(data[uri_offset:uri_offset+4], 'little')
                uri = data[uri_offset+4:uri_offset+4+uri_len].decode('utf-8', errors='ignore').strip('\x00')
                
                # Royalty (2 bytes u16)
                royalty_offset = uri_offset + 4 + uri_len
                royalty_basis_points = int.from_bytes(data[royalty_offset:royalty_offset+2], 'little')
                royalty = royalty_basis_points # Keep as basis points (e.g., 500)
                
                # Creators (1 byte for Option, then 4 bytes for Vec length)
                # But for our simple needs, we'll use the Update Authority as the primary creator
                creator = update_authority
                
            except Exception as parse_err:
                logger.debug(f"ℹ️ Simplified metadata parsing failed, using fallbacks: {parse_err}")
                uri = await self.get_nft_metadata(mint_address)
                creator = update_authority
                royalty = 0

            return {
                "token_id": mint_address,
                "owner": owner or update_authority,
                "creator": creator,
                "royalty_percentage": royalty,
                "metadata_uri": uri,
                "blockchain_status": "full",
                "source": "blockchain"
            }
            
            try:
                # Basic extraction for Creator (very common in Metaplex data)
                # We skip the first 65 bytes (Key, UpdateAuth, Mint)
                potential_data = data[65:]
                # The creators array starts after Name, Symbol, and URI.
                # Since we don't want a full Borsh decoder here, we'll try a heuristic
                # or just use the update authority as the fallback creator.
                creator = str(Pubkey.from_bytes(data[1:33])) # Update Authority is usually the Creator
            except:
                pass

            return {
                "creator": creator,
                "metadata_uri": uri,
                "royalty_percentage": royalty / 100.0 if royalty else 0
            }
        except Exception as e:
            logger.warning(f"⚠️ Error decoding detailed Solana metadata: {e}")
            return {}

    async def get_artwork_info(self, token_id: str):
        """Standard interface for proxy to fetch artwork info from Solana blockchain"""
        owner = await self.get_nft_owner(token_id)
        details = await self.get_nft_metadata_detailed(token_id)
        
        if not owner and not details:
            return None
            
        return {
            "creator": details.get("creator"), 
            "owner": owner,
            "metadata_uri": details.get("metadata_uri"),
            "royalty_percentage": details.get("royalty_percentage", 0),
            "is_licensed": False
        }

    async def verify_transaction(self, tx_hash: str, expected_seller_lamports: int, seller_address: str, platform_address: str, expected_platform_lamports: int = 0, creator_address: Optional[str] = None, expected_royalty_lamports: int = 0) -> Dict[str, Any]:
        """
        Verify a Solana sale transaction by checking for transfers to seller, platform, and optionally creator.
        """
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            
            if not response.value:
                return {"success": False, "error": "Transaction not found"}
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            
            if not meta or not tx_data:
                return {"success": False, "error": "Could not parse transaction data or metadata"}

            if meta.err:
                return {"success": False, "error": "Transaction failed on-chain"}

            # Verify transfers
            seller_received = 0
            platform_received = 0
            creator_received = 0
            
            all_instructions = self._collect_all_instructions(tx_data, meta)

            for ix in all_instructions:
                # 1. Handle UiParsedInstruction (from jsonParsed encoding)
                parsed = None
                if hasattr(ix, 'parsed') and isinstance(ix.parsed, dict):
                    parsed = ix.parsed
                elif isinstance(ix, dict) and 'parsed' in ix:
                    parsed = ix['parsed']
                
                if parsed and parsed.get('type') == 'transfer':
                    info = parsed.get('info', {})
                    dest = str(info.get('destination', ''))
                    lamports = int(info.get('lamports', 0))
                    
                    if dest == str(seller_address):
                        seller_received += lamports
                        logger.info(f"💰 Detected SOL transfer to seller: {lamports} lamports")
                    elif dest == str(platform_address):
                        platform_received += lamports
                        logger.info(f"💰 Detected SOL transfer to platform: {lamports} lamports")
                    elif creator_address and dest == str(creator_address):
                        creator_received += lamports
                        logger.info(f"💰 Detected SOL transfer to creator: {lamports} lamports")
                
                # 2. Handle Partially Decoded instructions (uncommon for simple transfers but possible)
                elif hasattr(ix, 'data') and hasattr(ix, 'program_id'):
                    # This is harder to parse without full decoding, 
                    # but standard System transfers should be 'parsed' already due to jsonParsed.
                    pass

            # Verification logic with 1% buffer for floating point or fee edge cases
            if seller_received < expected_seller_lamports * 0.99:
                return {
                    "success": False, 
                    "error": f"Seller received insufficient funds. Expected ~{expected_seller_lamports}, Found {seller_received}"
                }
            
            if expected_platform_lamports > 0 and platform_received < expected_platform_lamports * 0.99:
                return {
                    "success": False,
                    "error": f"Platform received insufficient fees. Expected ~{expected_platform_lamports}, Found {platform_received}"
                }
                
            if expected_royalty_lamports > 0 and creator_address and creator_received < expected_royalty_lamports * 0.99:
                return {
                    "success": False,
                    "error": f"Creator received insufficient royalty. Expected ~{expected_royalty_lamports}, Found {creator_received}"
                }
            
            return {"success": True, "tx_hash": tx_hash}

        except Exception as e:
            logger.error(f"❌ Solana transaction verification error: {e}")
            return {"success": False, "error": str(e)}

    async def prepare_register_transaction(self, metadata_uri: str, royalty_basis_points: int, from_address: str, is_conversion: bool = False, artwork_price_eth: float = None):
        """Mock transaction preparation for Solana (frontend handles minting)"""
        logger.info(f"☀️ Preparing Solana registration metadata: {metadata_uri}")
        return None  # Frontend handles minting directly on Solana

    async def get_transaction_receipt(self, tx_hash: str):
        """Get a receipt-like object for a Solana transaction"""
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            if not response.value:
                return None
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            if not meta:
                return None

            return {
                "status": 1 if not meta.err else 0,
                "blockNumber": response.value.slot,
                "gasUsed": meta.fee,
                "logs": meta.log_messages
            }
        except Exception as e:
            logger.error(f"❌ Failed to get Solana transaction receipt for {tx_hash}: {e}")
            return None

    async def get_token_id_from_tx(self, tx_hash: str, expected_creator: Optional[str] = None):
        """
        Extract the mint address from a Solana mint transaction.
        Checks for Metaplex minting or standard SPL Token minting.
        Falls back to placeholder ID if no real mint is found.
        """
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            if not response.value:
                return None
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            if not meta or not tx_data:
                return None

            if meta.err:
                logger.error(f"❌ Transaction {tx_hash} failed on-chain")
                return None

            # Try to extract a real mint
            mint = await self._extract_mint_from_tx(tx_data, meta, expected_creator)
            if mint:
                return mint

            # Check if this is a 0-SOL self-transfer placeholder
            if hasattr(tx_data, 'message') and hasattr(tx_data.message, 'instructions'):
                for ix in tx_data.message.instructions:
                    if str(getattr(ix, 'program_id', '')) == "11111111111111111111111111111111" and hasattr(ix, 'parsed'):
                        parsed = ix.parsed
                        if isinstance(parsed, dict) and parsed.get('type') == 'transfer':
                            info = parsed.get('info', {})
                            if info.get('lamports', -1) == 0 and info.get('source') == info.get('destination'):
                                logger.info(f"ℹ️ Recognized 0-SOL self-transfer placeholder. Using hash-based ID.")
                                return f"sol_{tx_hash[:32]}"
            
            # Absolute fallback: generate placeholder from hash
            logger.warning(f"⚠️ Could not identify mint address for {tx_hash}. Using raw hash fallback.")
            return f"sol_{tx_hash[:32]}"

        except Exception as e:
            logger.error(f"❌ Failed to get token ID from Solana transaction {tx_hash}: {e}")
            return None

    async def get_revert_reason(self, tx_hash: str, network: str = "solana"):
        """Get the error message for a failed Solana transaction"""
        try:
            sig = Signature.from_string(tx_hash)
            response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            if not response.value:
                return "Transaction not found"
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            if not meta:
                return "Could not parse transaction metadata"

            if not meta.err:
                return "No error found"
            
            # Extract log messages if available
            if meta.log_messages:
                # Return the last few logs which often contain the error
                return f"Solana Error: {str(meta.err)} - Logs: {meta.log_messages[-3:]}"
            
            return f"Solana Error: {str(meta.err)}"
        except Exception as e:
            return f"Error fetching revert reason: {str(e)}"

    async def transfer_nft(self, mint_address: str, from_address: str, to_address: str) -> Dict[str, Any]:
        """
        Transfer an NFT from one wallet to another using the platform as a delegate.
        Note: The 'from_address' must have delegated the NFT to the platform_address first.
        """
        try:
            # ✅ SAFETY: If already owned by destination, skip transfer but return success
            if str(from_address) == str(to_address):
                logger.info(f"ℹ️ NFT {mint_address} is already owned by {to_address}. Skipping on-chain transfer.")
                return {"success": True, "tx_hash": "ALREADY_OWNED", "note": "Already owned by buyer"}
            if not settings.SOLANA_PLATFORM_PRIVATE_KEY:
                return {"success": False, "error": "Platform private key not configured"}

            platform_keypair = Keypair.from_base58_string(settings.SOLANA_PLATFORM_PRIVATE_KEY)
            mint_pubkey = Pubkey.from_string(mint_address)
            from_pubkey = Pubkey.from_string(from_address)
            to_pubkey = Pubkey.from_string(to_address)
            
            # Get token accounts
            from_ata = get_associated_token_address(from_pubkey, mint_pubkey)
            to_ata = get_associated_token_address(to_pubkey, mint_pubkey)
            
            # Since the platform is the delegate, it signs the transfer
            # We use solders for the transaction and SPL instructions
            from solders.message import Message
            from solders.instruction import Instruction as SoldersInstruction
            
            # Token Program ID for SPL tokens
            TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            
            # Get latest blockhash
            blockhash_resp = await self.client.get_latest_blockhash()
            recent_blockhash = blockhash_resp.value.blockhash
            
            # ✅ CHECK: Ensure Destination ATA exists (Buyer should have created it during purchase)
            try:
                to_ata_info = await self.client.get_account_info(to_ata)
                if not to_ata_info.value:
                    logger.error(f"❌ Destination ATA {to_ata} does not exist. Buyer must create it during purchase.")
                    return {
                        "success": False, 
                        "error": f"Destination token account does not exist. The buyer's wallet should have initialized it during the payment transaction."
                    }
            except Exception as ata_check_err:
                logger.error(f"❌ Error checking buyer ATA: {ata_check_err}")
                return {"success": False, "error": f"Failed to verify destination token account: {str(ata_check_err)}"}

            # Create the transfer instruction
            # spl.token.instructions.transfer returns a solders.instruction.Instruction
            ix = transfer(
                TransferParams(
                    program_id=TOKEN_PROGRAM_ID,
                    source=from_ata,
                    dest=to_ata,
                    owner=platform_keypair.pubkey(), # The platform is the delegate/authority
                    amount=1,
                )
            )
            instructions = [ix] # Use only the transfer instruction
            
            # Build the message and transaction
            message = Message.new_with_blockhash(
                instructions,
                platform_keypair.pubkey(),
                recent_blockhash
            )
            
            tx = Transaction([platform_keypair], message, recent_blockhash)
            
            logger.info(f"🚀 Sending Solana NFT transfer tx: Mint={mint_address}, From={from_address}, To={to_address}")
            logger.info(f"   Authority (Platform): {platform_keypair.pubkey()}")
            
            response = await self.client.send_transaction(tx)
            # signature is a Signature object from solders
            signature = response.value
            tx_hash = str(signature)
            
            # Wait for confirmation to ensure it actually moved
            logger.info(f"⏳ Waiting for NFT transfer confirmation: {tx_hash}")
            confirm_resp = await self.client.confirm_transaction(signature, commitment="confirmed")
            
            if confirm_resp.value[0].err:
                error_msg = f"On-chain transfer failed: {confirm_resp.value[0].err}"
                logger.error(f"❌ {error_msg}")
                return {"success": False, "error": error_msg}

            logger.info(f"✅ Solana NFT transfer successful and confirmed! Hash: {tx_hash}")
            return {"success": True, "tx_hash": tx_hash}
            
        except Exception as e:
            logger.error(f"❌ Solana NFT transfer failed: {str(e)}")
            return {"success": False, "error": str(e)}

    async def verify_purchase_transaction(self, tx_hash: str, expected_buyer: str, expected_seller: str, expected_amount_wei: int) -> Dict[str, Any]:
        """
        Verify a Solana license purchase transaction.
        Note: expected_amount_wei is treated as expected_amount_lamports for Solana.
        """
        try:
            if self.demo_mode:
                return {"success": True, "tx_hash": tx_hash, "mode": "demo"}

            import re
            import base58 # Assuming base58 is available as solders depends on it
            raw_tx_hash = str(tx_hash)
            clean_tx_hash = re.sub(r'[^1-9A-HJ-NP-Za-km-z]', '', raw_tx_hash)
            
            try:
                decoded_bytes = base58.b58decode(clean_tx_hash)
                
                if len(decoded_bytes) != 64:
                    logger.error(f"❌ INVALID SIGNATURE LENGTH: Expected 64 bytes, got {len(decoded_bytes)}")
                    return {"success": False, "error": f"Invalid signature length: decoded to {len(decoded_bytes)} bytes instead of 64"}
                
                sig = Signature.from_bytes(decoded_bytes)
            except Exception as sig_error:
                logger.error(f"❌ Signature decoding failed: {str(sig_error)}")
                return {"success": False, "error": f"Failed to decode string to signature: {str(sig_error)}"}
            
            # ✅ RETRY MECHANISM: Give the blockchain more time to propagate the transaction
            max_retries = 5
            response = None
            
            for attempt in range(max_retries):
                logger.info(f"🔍 Verifying Solana transaction (Attempt {attempt + 1}/{max_retries}): {tx_hash} on {self.rpc_url}")
                # Explicitly passing commitment="confirmed" for clarity
                response = await self.client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0, commitment="confirmed")
                
                if response.value:
                    break
                
                if attempt < max_retries - 1:
                    logger.warning(f"⚠️ Transaction {tx_hash} not found yet. Retrying in 3 seconds...")
                    await asyncio.sleep(3)

            if not response or not response.value:
                logger.error(f"❌ Transaction {tx_hash} NOT FOUND after {max_retries} attempts.")
                return {"success": False, "error": "Transaction not found on Solana. It might still be propagating, please try again in a moment."}
            
            tx_data, meta = self._get_tx_and_meta(response.value)
            
            if not meta or not tx_data:
                return {"success": False, "error": "Could not parse transaction data or metadata"}

            if meta.err:
                return {"success": False, "error": f"Transaction failed on-chain: {meta.err}"}

            # 1. Verify Signer (Buyer)
            signers = [str(acc.pubkey) for acc in tx_data.message.account_keys if acc.signer]
            if expected_buyer and expected_buyer not in signers:
                logger.warning(f"❌ Purchase signer mismatch! Signers {signers} != Expected Buyer {expected_buyer}")
                return {"success": False, "error": "Transaction was not signed by the expected buyer"}

            # 2. Verify Payments
            all_instructions = self._collect_all_instructions(tx_data, meta)
            seller_received = 0
            platform_received = 0
            
            for ix in all_instructions:
                if hasattr(ix, 'parsed') and isinstance(ix.parsed, dict):
                    if ix.parsed.get('type') == 'transfer':
                        info = ix.parsed.get('info', {})
                        dest = info.get('destination')
                        amount = info.get('lamports', 0)
                        
                        if dest == expected_seller:
                            seller_received += amount
                        elif dest == self.platform_address:
                            platform_received += amount
            
            total_received = seller_received + platform_received
            # For Solana, we allow some rounding tolerance (though less likely than EVM gas)
            # expected_amount_wei is the sum of license_fee and platform_fee
            if total_received < expected_amount_wei * 0.99:
                logger.warning(f"⚠️ Insufficient payment found in tx {tx_hash}. Expected ~{expected_amount_wei}, found {total_received}")
                return {
                    "success": False, 
                    "error": f"Insufficient payment found. Expected {expected_amount_wei} lamports, found {total_received} lamports"
                }

            logger.info(f"✅ Solana license purchase verified: {tx_hash}. Total: {total_received} lamports")
            return {
                "success": True,
                "tx_hash": tx_hash,
                "seller_received": seller_received,
                "platform_received": platform_received,
                "total_received": total_received
            }

        except Exception as e:
            logger.error(f"❌ Error verifying Solana purchase: {e}")
            return {"success": False, "error": str(e)}

    async def prepare_simple_license_purchase(self, token_id: str, buyer_address: str, 
                                             license_type: str, total_amount_lamports: int = None,
                                             artwork_price_sol: float = None, license_percentage: float = None,
                                             duration_days: int = 36500, addon_fee_sol: float = 0.0):
        """
        Prepare license purchase parameters for Solana.
        Instead of returning encoded data for a single call, we return the breakdown 
        so the frontend can build multiple SystemProgram.transfer instructions.
        """
        try:
            if self.demo_mode:
                return {
                    "type": "solana",
                    "seller_amount": 0,
                    "platform_amount": 0,
                    "royalty_amount": 0,
                    "platform_address": self.platform_address,
                    "seller_address": buyer_address, # Placeholder
                    "mode": "demo"
                }

            # 1. Resolve owner and addresses
            owner_address = await self.get_nft_owner(token_id)
            if not owner_address:
                # Fallback to database owner if blockchain check fails
                from app.db.database import get_artwork_collection
                artwork = await get_artwork_collection().find_one({"token_id": token_id})
                if artwork:
                    owner_address = artwork.get("owner_address") or artwork.get("creator_address")
            
            if not owner_address:
                raise ValueError("Could NOT determine artwork owner for Solana license purchase")
            
            logger.info(f"🔑 Resolved Solana owner address: {owner_address}")

            # 2. Calculate fees (similar to Web3Service)
            if artwork_price_sol and license_percentage:
                # Use float for precision, then convert to lamports
                artwork_price_lamports = int(artwork_price_sol * 1_000_000_000)
                license_percentage_float = float(license_percentage)
                license_fee_lamports = int(artwork_price_lamports * license_percentage_float / 100)
                
                # Addon fee (Responsible Use)
                addon_fee_lamports = int(addon_fee_sol * 1_000_000_000)

                # Platform Fee
                from app.api.v1.artwork import get_current_global_fee
                platform_fee_percentage = await get_current_global_fee()
                platform_fee_percentage_float = float(platform_fee_percentage)
                
                # Buyer Fee (Added on top)
                buyer_platform_fee_lamports = int(artwork_price_lamports * platform_fee_percentage_float / 100)
                
                # Seller Fee (Deducted from creator's share)
                seller_platform_fee_lamports = int(artwork_price_lamports * platform_fee_percentage_float / 100)
                
                # Safety guard
                if seller_platform_fee_lamports >= license_fee_lamports:
                    seller_platform_fee_lamports = license_fee_lamports // 2
                
                # Distribution
                # Buyer pays: license_fee + buyer_platform_fee + addon_fee
                # Platform receives: buyer_platform_fee + seller_platform_fee + addon_fee (platform holds addon for services)
                # Seller (Creator) receives: license_fee - seller_platform_fee
                
                seller_receive = license_fee_lamports - seller_platform_fee_lamports
                platform_receive = buyer_platform_fee_lamports + seller_platform_fee_lamports + addon_fee_lamports
                
                # Royalty Logic (if secondary license): 
                # For simplicity in simple license, we treat license fee as direct payment to seller minus platform fee.
                # If the seller is NOT the creator, we might want to split royalties, 
                # but currently the contract logic handles royalties for SALES, while licenses are handled as direct fees.
                
                return {
                    "type": "solana",
                    "seller_amount": str(seller_receive),
                    "platform_amount": str(platform_receive),
                    "royalty_amount": "0", # Licenses usually don't have secondary royalties, but can be added
                    "platform_address": self.platform_address,
                    "seller_address": owner_address,
                    "creator_address": owner_address, # Placeholder
                    "total_lamports": str(seller_receive + platform_receive)
                }
            
            elif total_amount_lamports is not None:
                # Fallback to simple split
                platform_fee = (total_amount_lamports * 5) // 100
                return {
                    "type": "solana",
                    "seller_amount": str(total_amount_lamports - platform_fee),
                    "platform_amount": str(platform_fee),
                    "royalty_amount": "0",
                    "platform_address": self.platform_address,
                    "seller_address": owner_address
                }
            
            raise ValueError("Insufficient parameters for fee calculation")

        except Exception as e:
            logger.error(f"❌ Failed to prepare Solana license purchase: {e}")
            raise

    async def prepare_revoke_transaction(self, license_id: str, mint_address: str, licensee_address: str) -> Dict[str, Any]:
        """
        Prepare metadata for a Solana license revocation transaction.
        Uses the standard Solana Memo Program to record the revocation on-chain.
        """
        try:
            memo_program_id = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
            memo_text = f"xDRM Revoke License: {license_id} | Artwork: {mint_address} | Licensee: {licensee_address}"
            
            return {
                "success": True,
                "program_id": memo_program_id,
                "memo": memo_text,
                "instructions": [
                    {
                        "program_id": memo_program_id,
                        "data": memo_text,
                        "accounts": []
                    }
                ]
            }
        except Exception as e:
            logger.error(f"❌ Error preparing Solana revoke metadata: {e}")
            return {"success": False, "error": str(e)}

# Global instance
solana_service = SolanaService()

