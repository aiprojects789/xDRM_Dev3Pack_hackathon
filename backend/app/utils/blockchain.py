import logging

logger = logging.getLogger(__name__)

def normalize_blockchain_address(address: str) -> str:
    """
    Normalize blockchain addresses based on their format.
    EVM (0x...) -> Lowercase
    Solana/Algorand/Other -> Keep original case
    """
    if not address:
        return address
    
    addr = str(address).strip()
    # Check if it's an EVM address (starts with 0x and has hex chars)
    if addr.startswith('0x') and len(addr) >= 40:
        return addr.lower()
    
    # Solana (Base58, 32-44 chars) and Algorand (58 chars) are case-sensitive.
    # We keep them as is.
    return addr
