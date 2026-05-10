"""
License Access Service

Service for managing license-based access control for artwork images.
Handles license verification, expiry checking, and access level determination.
"""

from typing import Optional, Dict, Any, Tuple, Union
from datetime import datetime, timedelta
import logging
from bson import ObjectId

from app.db.database import get_license_collection, get_artwork_collection, get_user_collection
from app.utils.artwork import resolve_artwork_identifier

logger = logging.getLogger(__name__)

# Access level constants
ACCESS_OWNER = "OWNER"
ACCESS_FULL = "FULL_ACCESS"
ACCESS_WATERMARK = "ACCESS_WITH_WM"
ACCESS_LINK_ONLY = "LINK_ONLY"
ACCESS_NONE = "NO_ACCESS"
ACCESS_EXPIRED = "EXPIRED"

# Watermark text
WATERMARK_TEXT = "XDRM protected"


from app.core.license_permissions import PERMISSIONS_MATRIX, LicenseType, get_permissions

class LicenseAccessService:
    """Service for checking license-based access to artworks"""
    
    @staticmethod
    async def get_user_license_for_artwork(
        user_id: str, 
        artwork_identifier: Union[int, str, dict],
        wallet_address: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get the best active license for a user on a specific artwork.
        Returns the highest-tier license if multiple exist.
        """
        try:
            db_licenses = get_license_collection()
            
            or_conditions = []
            if user_id:
                or_conditions.append({"buyer_id": user_id})
                if ObjectId.is_valid(user_id):
                    or_conditions.append({"buyer_id": str(ObjectId(user_id))})
            
            if wallet_address:
                or_conditions.append({"buyer_address": wallet_address.lower()})
            
            if not or_conditions:
                return None
            
            # Resolve artwork to get both token_id and _id if available
            if isinstance(artwork_identifier, dict):
                artwork = artwork_identifier
            else:
                artwork = await resolve_artwork_identifier(artwork_identifier)
                
            if not artwork:
                return None
            
            token_id = artwork.get("token_id")
            artwork_id = str(artwork.get("_id"))
            
            query = {
                "$or": [
                    {"token_id": token_id},
                    {"artwork_id": artwork_id}
                ],
                "$and": [{"$or": or_conditions}]
            }
            
            licenses = await db_licenses.find(query).to_list(length=100)
            if not licenses:
                return None
            
            # Filter and Sort by Priority
            # Priority: Based on permissions (access_to_original > watermarked > link)
            def get_priority(lic):
                lt_str = lic.get("license_type", "PERSONAL_USE")
                try:
                    lt = LicenseType(lt_str)
                    perms = get_permissions(lt)
                    score = 0
                    if perms.access_to_original: score += 10
                    if not perms.watermarked_preview_only: score += 5
                    if perms.commercial_use_allowed: score += 20
                    return score
                except ValueError:
                    return 0

            valid_licenses = []
            for lic in licenses:
                if lic.get("is_active", False):
                    if not LicenseAccessService.is_license_expired(lic):
                        valid_licenses.append(lic)
            
            if not valid_licenses:
                for lic in licenses:
                    if LicenseAccessService.is_license_expired(lic):
                        lic["_is_expired"] = True
                        return lic
                return None
            
            valid_licenses.sort(key=get_priority, reverse=True)
            return valid_licenses[0]
            
        except Exception as e:
            logger.error(f"Error getting user license for artwork: {e}", exc_info=True)
            return None
    
    @staticmethod
    def is_license_expired(license_doc: Dict[str, Any]) -> bool:
        """Check if a license has expired."""
        try:
            end_date = license_doc.get("end_date")
            if end_date:
                if isinstance(end_date, str):
                    end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                return datetime.utcnow() > end_date
            
            start = license_doc.get("purchase_time") or license_doc.get("start_date") or license_doc.get("created_at")
            duration = license_doc.get("duration_days", 30)
            
            if start:
                if isinstance(start, str):
                    start = datetime.fromisoformat(start.replace('Z', '+00:00'))
                elif isinstance(start, datetime):
                    pass
                else:
                    return False
                end_date = start + timedelta(days=duration)
                return datetime.utcnow() > end_date
            
            return False
        except Exception as e:
            logger.error(f"Error checking license expiry: {e}")
            return False
    
    @staticmethod
    async def is_artwork_owner(
        user_id: str,
        artwork_identifier: Union[int, str, dict],
        wallet_address: Optional[str] = None
    ) -> bool:
        """Check if user is the owner or original creator of the artwork."""
        try:
            if isinstance(artwork_identifier, dict):
                artwork = artwork_identifier
            else:
                artwork = await resolve_artwork_identifier(artwork_identifier)
                
            if not artwork:
                return False
            
            # 1. ID match (Database)
            if user_id:
                u_id = str(user_id)
                owner_id = str(artwork.get("owner_id"))
                creator_id = str(artwork.get("creator_id"))
                logger.info(f"🔍 DB ID Check: user_id={u_id}, owner_id={owner_id}, creator_id={creator_id}")
                if owner_id == u_id or creator_id == u_id:
                    return True
            
            # 2. Wallet match (Database)
            if wallet_address:
                network = (artwork.get("network") or "sepolia").lower()
                is_case_sensitive = network in ["solana", "algorand"]
                
                # Normalize based on network
                current_wallet = wallet_address if is_case_sensitive else wallet_address.lower()
                
                # Check standard addresses
                owner_addr = artwork.get("owner_address") or ""
                creator_addr = artwork.get("creator_address") or ""
                
                logger.info(f"🔍 DB Wallet Check: current={current_wallet}, owner_addr={owner_addr}, creator_addr={creator_addr}")
                
                if current_wallet:
                    if owner_addr and (owner_addr == current_wallet or owner_addr.lower() == current_wallet.lower()):
                        return True
                    if creator_addr and (creator_addr == current_wallet or creator_addr.lower() == current_wallet.lower()):
                        return True
                
                # Solana only: Check if wallet is stored in ID fields or specific Solana fields
                if str(artwork.get("owner_id")) == current_wallet or str(artwork.get("creator_id")) == current_wallet:
                    return True
                if artwork.get("owner_solana_address") == current_wallet or artwork.get("creator_solana_address") == current_wallet:
                    return True
            
            # 3. Blockchain check (Fallback for on-chain artworks)
            # Only if DB check failed and it's an on-chain artwork
            if artwork.get("is_on_chain") and wallet_address:
                network = (artwork.get("network") or "sepolia").lower()
                token_id = artwork.get("token_id")
                
                if not token_id:
                    return False
                
                try:
                    # Solana Check
                    if network == "solana":
                        from services.solana_service import solana_service
                        blockchain_owner = await solana_service.get_nft_owner(token_id)
                        if blockchain_owner and blockchain_owner == wallet_address:
                            logger.info(f"☀️ Ownership verified on Solana blockchain for {wallet_address}")
                            return True
                    
                    # 4. Global Wallet-to-User Match (Handle multiple wallets / switched wallets)
                    # If blockchain_owner was found but doesn't match current connected wallet,
                    # check if it belongs to the same user account in our DB.
                    if blockchain_owner and user_id:
                        user_collection = get_user_collection()
                        # Normalize address for search
                        search_addr = blockchain_owner.lower() if network not in ["solana", "algorand"] else blockchain_owner
                        
                        owner_user = await user_collection.find_one({
                            "$or": [
                                {"wallet_address": search_addr},
                                {"solana_wallet_address": search_addr}, # Future proofing
                                {"algorand_wallet_address": search_addr} # Future proofing
                            ]
                        })
                        
                        if owner_user and str(owner_user.get("_id")) == str(user_id):
                            logger.info(f"🔗 Blockchain owner {blockchain_owner} matched with User ID {user_id} via DB lookup")
                            return True
                            
                except Exception as blockchain_err:
                    logger.warning(f"⚠️ Failed to verify ownership on-chain: {blockchain_err}")
                    
            return False
        except Exception as e:
            logger.error(f"Error checking ownership: {e}")
            return False
    
    @staticmethod
    async def get_access_level(
        user_id: Optional[str],
        artwork_identifier: Union[int, str, dict],
        wallet_address: Optional[str] = None
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Determine the effective access level.
        Returns Tuple of (effective_level, license_doc)
        effective_level is mapping back to constants: OWNER, FULL_ACCESS, ACCESS_WITH_WM, LINK_ONLY, NO_ACCESS, EXPIRED
        """
        try:
            if not user_id and not wallet_address:
                return ACCESS_NONE, None
            
            if await LicenseAccessService.is_artwork_owner(user_id, artwork_identifier, wallet_address):
                return ACCESS_OWNER, None
            
            license_doc = await LicenseAccessService.get_user_license_for_artwork(
                user_id, artwork_identifier, wallet_address
            )
            
            if not license_doc:
                return ACCESS_NONE, None
            
            if license_doc.get("_is_expired") or LicenseAccessService.is_license_expired(license_doc):
                return ACCESS_EXPIRED, license_doc
            
            # Map dynamic permissions to legacy access levels for backward compatibility in frontend/DRM
            lt_str = license_doc.get("license_type", "PERSONAL_USE")
            try:
                lt = LicenseType(lt_str)
                perms = get_permissions(lt)
                
                if perms.access_to_original and not perms.watermarked_preview_only:
                    return ACCESS_FULL, license_doc
                elif not perms.watermarked_preview_only:
                    return ACCESS_FULL, license_doc
                elif not perms.access_to_original and perms.watermarked_preview_only:
                    return ACCESS_WATERMARK, license_doc
                else:
                    return ACCESS_LINK_ONLY, license_doc
            except ValueError:
                return ACCESS_LINK_ONLY, license_doc
                
        except Exception as e:
            logger.error(f"Error getting access level: {e}")
            return ACCESS_NONE, None
    
    @staticmethod
    async def verify_license_access(
        user_id: str,
        artwork_identifier: Union[int, str],
        permission_key: str, # Replaced 'required_type' with 'permission_key' (optional refactor)
        wallet_address: Optional[str] = None
    ) -> bool:
        """
        Verify if user has a specific permission.
        Args:
            permission_key: e.g., 'commercial_use_allowed', 'access_to_original', 'download_allowed'
        """
        if await LicenseAccessService.is_artwork_owner(user_id, artwork_identifier, wallet_address):
            return True
            
        license_doc = await LicenseAccessService.get_user_license_for_artwork(user_id, artwork_identifier, wallet_address)
        if not license_doc or LicenseAccessService.is_license_expired(license_doc):
            return False
            
        lt_str = license_doc.get("license_type", "PERSONAL_USE")
        try:
            lt = LicenseType(lt_str)
            perms = get_permissions(lt)
            
            # Check attribute on LicensePermissions model
            val = getattr(perms, permission_key, False)
            return bool(val)
        except (ValueError, AttributeError):
            # Fallback to legacy check if permission_key is one of the old types
            access_level, _ = await LicenseAccessService.get_access_level(user_id, artwork_identifier, wallet_address)
            hierarchy = {ACCESS_FULL: 3, ACCESS_WATERMARK: 2, ACCESS_LINK_ONLY: 1, ACCESS_NONE: 0}
            return hierarchy.get(access_level, 0) >= hierarchy.get(permission_key, 0)

    @staticmethod
    async def revoke_license(
        license_id: str, 
        requester_id: str, 
        requester_wallet: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Revoke an active license. 
        Only the artwork owner/creator can revoke.
        """
        try:
            db_licenses = get_license_collection()
            
            # 1. Get license
            # Try by license_id (internal) or token_id based lookup
            license_doc = await db_licenses.find_one({
                "$or": [
                    {"license_id": license_id},
                    {"id": license_id},
                    {"_id": ObjectId(license_id) if ObjectId.is_valid(license_id) else None}
                ]
            })
            
            if not license_doc:
                return {"success": False, "message": "License not found"}
            
            artwork_identifier = license_doc.get("artwork_id") or license_doc.get("token_id")
            
            # 2. Check if requester is owner
            is_owner = await LicenseAccessService.is_artwork_owner(requester_id, artwork_identifier, requester_wallet)
            if not is_owner:
                return {"success": False, "message": "Unauthorized: Only artwork owner can revoke licenses"}
            
            # 3. Update DB
            update_data = {
                "is_active": False,
                "status": "REVOKED",
                "revoked_at": datetime.utcnow(),
                "revoked_by": requester_id
            }
            
            result = await db_licenses.update_one(
                {"_id": license_doc["_id"]},
                {"$set": update_data}
            )
            
            if result.modified_count == 0 and license_doc.get("is_active") != False:
                return {"success": False, "message": "Failed to update license status"}
                
            return {
                "success": True, 
                "message": "License revoked successfully in platform",
                "license": {**license_doc, **update_data}
            }
            
        except Exception as e:
            logger.error(f"Error revoking license: {e}", exc_info=True)
            return {"success": False, "message": f"Internal error: {str(e)}"}


# Singleton instance
license_access_service = LicenseAccessService()



# Singleton instance
license_access_service = LicenseAccessService()
