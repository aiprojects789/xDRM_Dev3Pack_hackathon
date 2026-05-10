from app.core.config import settings
from fastapi import APIRouter, Depends, HTTPException, status, Query, Form
from typing import Optional, List, Dict, Any
from services.redis_cache_service import cache
from datetime import datetime, timedelta
import json
import asyncio
import logging
import base64
import hashlib
from bson import ObjectId
from collections import defaultdict

from app.db.database import get_license_collection, get_artwork_collection, get_db, get_user_collection, get_transaction_collection
from app.db.models import (
    LicenseCreate, License, LicenseInDB,
    LicenseListResponse, User, LicenseConfig,
    LicenseConfigCreate, LicenseConfigUpdate, LicenseFeeCalculation,
    TransactionType, TransactionStatus
)
from app.core.security import get_current_user, get_current_admin_user, get_current_user_optional
from app.utils.artwork import resolve_artwork_identifier
from app.utils.blockchain import normalize_blockchain_address
from services.user_history_service import UserHistoryService
from services.license_config_service import LicenseConfigService
from .artwork import IPFSService, get_current_global_fee

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/license", tags=["license"])

# ==========================================
# AUTO-CLEANUP MECHANISM FOR PENDING LICENSES
# ==========================================

async def cleanup_old_pending_licenses(
    max_age_hours: int = 24,
    dry_run: bool = False
) -> dict:
    """
    Clean up old pending licenses that were never confirmed.
    
    Args:
        max_age_hours: Maximum age in hours for pending licenses (default: 24 hours)
        dry_run: If True, only count licenses without deleting (default: False)
    
    Returns:
        dict with cleanup statistics
    """
    try:
        db_licenses = get_license_collection()
        
        # Calculate cutoff time
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        # Find old pending licenses
        query = {
            "status": "PENDING",
            "is_active": False,
            "created_at": {"$lt": cutoff_time}
        }
        
        # Count licenses to be cleaned
        count = await db_licenses.count_documents(query)
        
        if count == 0:
            logger.info(f"🧹 No old pending licenses found (older than {max_age_hours} hours)")
            return {
                "success": True,
                "cleaned_count": 0,
                "dry_run": dry_run,
                "max_age_hours": max_age_hours
            }
        
        if dry_run:
            logger.info(f"🧹 [DRY RUN] Would clean {count} old pending licenses (older than {max_age_hours} hours)")
            return {
                "success": True,
                "cleaned_count": count,
                "dry_run": True,
                "max_age_hours": max_age_hours
            }
        
        # Get license IDs for logging
        old_licenses = await db_licenses.find(query).to_list(length=count)
        license_ids = [lic.get("license_id") for lic in old_licenses]
        
        # Delete old pending licenses
        result = await db_licenses.delete_many(query)
        deleted_count = result.deleted_count
        
        logger.info(f"🧹 Cleaned up {deleted_count} old pending licenses (older than {max_age_hours} hours)")
        logger.info(f"   License IDs: {license_ids[:10]}{'...' if len(license_ids) > 10 else ''}")
        
        return {
            "success": True,
            "cleaned_count": deleted_count,
            "license_ids": license_ids,
            "dry_run": False,
            "max_age_hours": max_age_hours,
            "cutoff_time": cutoff_time.isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error cleaning up old pending licenses: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "cleaned_count": 0
        }


async def _get_current_platform_fee_percentage() -> float:
    """Fetch global platform fee percentage from system settings."""
    try:
        # ✅ Unified: use get_current_global_fee from artwork.py to ensure consistency
        fee = await get_current_global_fee()
        return max(0.0, float(fee))
    except Exception as fee_error:
        logger.warning(f"⚠️ Failed to fetch platform fee, defaulting to 2.5%: {fee_error}")
        return 2.5


def _normalize_license_id(raw_license_id: Any) -> int:
    """Normalize license ID to integer."""
    if raw_license_id is None:
        return 0
    try:
        if isinstance(raw_license_id, int):
            return raw_license_id
        text = str(raw_license_id).strip()
        if not text:
            return 0
        if text.isdigit():
            return int(text)
        # Algorand specific logic removed
        return 0
    except (ValueError, TypeError):
        return 0


def _scrub_license_pii(license_data: Dict[str, Any], current_user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Redact PII (emails) from license data if the current_user is not authorized.
    Authorized users:
    - Account Owner (Buyer of the license)
    - Artwork Owner (Seller of the license)
    - Administrators
    """
    if not license_data:
        return license_data

    # If it's a list, scrub each item
    if isinstance(license_data, list):
        return [_scrub_license_pii(item, current_user) for item in license_data]

    # Handle single license dict
    if hasattr(license_data, "model_dump"):
        license_data = license_data.model_dump()
    elif hasattr(license_data, "dict"):
        license_data = license_data.dict()
    elif not isinstance(license_data, dict):
        logger.warning(f"⚠️ unexpected type for _scrub_license_pii: {type(license_data)}")
        return license_data

    is_admin = current_user and current_user.get("role") == "admin"
    
    # Get current user identifiers
    user_id = str(current_user.get("id") or current_user.get("_id") or current_user.get("user_id") or "") if current_user else ""
    user_wallet = normalize_blockchain_address(current_user.get("wallet_address")) if current_user else ""
    
    # Get license identifiers
    buyer_id = str(license_data.get("buyer_id") or "")
    owner_id = str(license_data.get("owner_id") or "")
    buyer_addr = normalize_blockchain_address(license_data.get("buyer_address"))
    owner_addr = normalize_blockchain_address(license_data.get("owner_address"))

    # Check authorization
    is_authorized = is_admin or \
                    (user_id and (user_id == buyer_id or user_id == owner_id)) or \
                    (user_wallet and (user_wallet == buyer_addr or user_wallet == owner_addr))

    if not is_authorized:
        # Redact emails
        if "owner_email" in license_data:
            license_data["owner_email"] = "[REDACTED]"
        if "buyer_email" in license_data:
            license_data["buyer_email"] = "[REDACTED]"
        
        # Redact other sensitive fields if they exist
        for field in ["metadata_uri", "image_uri", "ipfs_hash"]:
            if field in license_data:
                license_data[field] = "[REDACTED]"

    return license_data


# Algorand helper functions removed


class LicenseDocumentService:
    """Service to generate and upload license documents to IPFS"""

    @staticmethod
    def generate_license_document(
        artwork_title: str,
        artwork_token_id: int,
        licensor_address: str,
        licensee_address: str,
        license_type: str,
        duration_days: int,
        start_date: datetime,
        network: str = "solana",
        license_fee: str = "0.1 SOL"
    ) -> dict:
        end_date = start_date + timedelta(days=duration_days)

        # Normalize network name for display
        display_network = "Solana"

        license_document = {
            "license_agreement": {
                "title": f"Artwork License Agreement - {artwork_title}",
                "artwork": {
                    "title": artwork_title,
                    "token_id": artwork_token_id,
                    "blockchain": display_network
                },
                "parties": {
                    "licensor": {
                        "wallet_address": licensor_address,
                        "role": "Artwork Owner & Rights Grantor"
                    },
                    "licensee": {
                        "wallet_address": licensee_address,
                        "role": "License Holder"
                    }
                },
                "license_terms": {
                    "type": license_type,
                    "duration": {
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "duration_days": duration_days
                    },
                    "permissions": LicenseDocumentService.get_permissions_by_type(license_type),
                    "restrictions": LicenseDocumentService.get_restrictions_by_type(license_type),
                    "attribution_required": license_type in ["NON_COMMERCIAL", "RESPONSIBLE_USE"] # Matches "Often" and "May be" in Table 1
                },
                "terms_and_conditions": {
                    "usage_rights": LicenseDocumentService.get_usage_rights(license_type),
                    "termination": "This license automatically expires on the end date or can be revoked by the licensor.",
                    "governing_law": "This agreement is governed by blockchain smart contract terms.",
                    "dispute_resolution": "Disputes will be resolved according to the platform's terms of service."
                },
                "technical_details": {
                    "blockchain": display_network,
                    "network": display_network,
                    "license_fee": license_fee,
                    "created_at": datetime.utcnow().isoformat(),
                    "document_version": "1.0"
                }
            }
        }
        return license_document

    @staticmethod
    def get_permissions_by_type(license_type: str) -> list:
        permissions = {
            "PERSONAL_USE": [
                "View and display the artwork for personal use",
                "Share the artwork in personal social media with attribution",
                "Use as desktop wallpaper or personal device backgrounds"
            ],
            "NON_COMMERCIAL": [
                "Use in educational, non-profit or news projects",
                "Public display in non-commercial settings",
                "Personal and educational usage rights"
            ],
            "COMMERCIAL": [
                "Use in commercial projects and marketing materials",
                "Include in commercial websites and applications",
                "Use for promotional purposes with proper attribution",
                "Standard commercial usage rights"
            ],
            "EXTENDED_COMMERCIAL": [
                "High-volume commercial use and distribution",
                "Use on products for resale (merchandise)",
                "Full commercial marketing and advertising rights",
                "Right to modify work for commercial applications"
            ],
            "EXCLUSIVE": [
                "Exclusive rights to all uses of the artwork",
                "Commercial and non-commercial usage rights",
                "Right to sublicense to third parties",
                "Exclusive access during the license period"
            ],
            "RESPONSIBLE_USE": [
                "Ethical usage only (no harmful content, no AI training)",
                "Includes standard usage rights with ethical restrictions",
                "Verification of intended use case required"
            ],
            "ARTWORK_OWNERSHIP": [
                "Transfer of full ownership and copyright",
                "Unlimited commercial and personal usage rights",
                "Right to modify, redistribute, and resell the digital file",
                "Complete IP transfer to the licensee"
            ],
            "CUSTOM": [
                "Individually negotiated rights and permissions",
                "Specific terms defined in the custom agreement"
            ]
        }
        return permissions.get(license_type, [])

    @staticmethod
    def get_restrictions_by_type(license_type: str) -> list:
        restrictions = {
            "PERSONAL_USE": [
                "No commercial use permitted",
                "Cannot republish or redistribute as own",
                "Cannot claim ownership of the original work"
            ],
            "NON_COMMERCIAL": [
                "No revenue generation allowed",
                "Cannot use for advertising or promotion of for-profit entities",
                "Must provide proper attribution to the creator"
            ],
            "COMMERCIAL": [
                "Must provide proper attribution",
                "Cannot claim ownership of the original work",
                "No use on products for resale without Extended License"
            ],
            "EXTENDED_COMMERCIAL": [
                "Cannot claim original authorship",
                "Cannot register trademarks using the artwork directly"
            ],
            "EXCLUSIVE": [
                "Other parties cannot use the artwork during license period",
                "Licensee is responsible for protecting exclusivity"
            ],
            "RESPONSIBLE_USE": [
                "No use in AI model training or data sets",
                "No use in political, religious, or sensitive campaigns",
                "No use in content promoting hate or discrimination"
            ],
            "ARTWORK_OWNERSHIP": [
                "Limited by previous non-exclusive licenses granted",
                "Subject to agreed digital transfer protocols"
            ],
            "CUSTOM": [
                "Restricted by the specific terms of the custom agreement"
            ]
        }
        return restrictions.get(license_type, [])

    @staticmethod
    def get_usage_rights(license_type: str) -> str:
        usage_descriptions = {
            "PERSONAL_USE": "This license grants personal, non-commercial usage rights only. The licensee may view, display, and share the artwork for personal purposes with proper attribution.",
            "NON_COMMERCIAL": "This license grants rights for educational or non-profit purposes. Commercial use or revenue generation is strictly prohibited.",
            "COMMERCIAL": "This license grants standard commercial usage rights including marketing, advertising, and business applications. Attribution to the original creator is required.",
            "EXTENDED_COMMERCIAL": "This license grants unlimited commercial rights, including high-volume distribution and the right to use the artwork on products for resale.",
            "EXCLUSIVE": "This license grants exclusive rights to the artwork. No other licenses will be granted, and the licensee has full commercial and non-commercial usage rights.",
            "RESPONSIBLE_USE": "This license is subject to ethical usage restrictions. It prohibits use in AI training, harmful content, or sensitive political/religious contexts.",
            "ARTWORK_OWNERSHIP": "This license represents a full transfer of copyright and digital ownership. The licensee gains all intellectual property rights to the artwork.",
            "CUSTOM": "Usage rights for this license are bespoke and defined in the individually negotiated agreement between creator and licensee."
        }
        return usage_descriptions.get(license_type, "Standard usage rights apply.")


# @router.post("/grant-with-document")
# async def grant_license_with_document(
#     token_id: int = Form(...),
#     licensee_address: str = Form(...),
#     duration_days: int = Form(...),
#     license_type: str = Form(...),
#     current_user: dict = Depends(get_current_user)
# ):
#     try:
#         db_licenses = get_license_collection()
#         db_artworks = get_artwork_collection()

#         if not 1 <= duration_days <= 365:
#             raise HTTPException(status_code=400, detail="Duration must be between 1 and 365 days")

#         if license_type not in ["PERSONAL", "COMMERCIAL", "EXCLUSIVE"]:
#             raise HTTPException(status_code=400, detail="Invalid license type")

#         try:
#             licensee_address = Web3.to_checksum_address(licensee_address)
#         except Exception:
#             raise HTTPException(status_code=400, detail="Invalid Ethereum address")

#         artwork_doc = await db_artworks.find_one({"token_id": token_id}, sort=[("_id", -1)])
#         if not artwork_doc:
#             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")

#         # FIX: Handle current_user as dict
#         user_wallet = current_user.get('wallet_address')
#         if not user_wallet:
#             logger.error(f"Invalid current_user structure: {current_user}")
#             raise HTTPException(status_code=500, detail="User authentication error")

#         if artwork_doc["owner_address"].lower() != user_wallet.lower():
#             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only artwork owner can grant licenses")

#         start_date = datetime.utcnow()
#         license_document = LicenseDocumentService.generate_license_document(
#             artwork_title=artwork_doc.get("title", "Untitled"),
#             artwork_token_id=token_id,
#             licensor_address=user_wallet,
#             licensee_address=licensee_address,
#             license_type=license_type,
#             duration_days=duration_days,
#             start_date=start_date
#         )

#         document_json = json.dumps(license_document, indent=2)
#         document_bytes = document_json.encode('utf-8')

#         terms_hash = await IPFSService.upload_to_ipfs(
#             document_bytes,
#             f"license_agreement_{token_id}_{int(start_date.timestamp())}.json"
#         )

#         license_count = await db_licenses.count_documents({}) + 1

#         max_retries = 3
#         tx_data = None
#         for attempt in range(max_retries):
#             try:
#                 tx_data = await web3_service.prepare_license_transaction(
#                     token_id,
#                     licensee_address,
#                     duration_days,
#                     terms_hash,
#                     license_type,
#                     user_wallet
#                 )
#                 break
#             except Exception as e:
#                 if attempt == max_retries - 1:
#                     raise e
#                 logger.warning(f"Attempt {attempt + 1} failed, retrying: {e}")
#                 await asyncio.sleep(1)

#         if not tx_data:
#             raise HTTPException(status_code=500, detail="Failed to prepare transaction after multiple attempts")

#         end_date = start_date + timedelta(days=duration_days)
#         fee_eth = 0.1  # Fixed fee

#         license_dict = {
#             "license_id": license_count,
#             "token_id": token_id,
#             "licensee_address": licensee_address.lower(),
#             "licensor_address": user_wallet.lower(),
#             "start_date": start_date,
#             "end_date": end_date,
#             "terms_hash": terms_hash,
#             "license_type": license_type,
#             "is_active": True,
#             "fee_paid": fee_eth,
#             "created_at": datetime.utcnow(),
#             "updated_at": datetime.utcnow(),
#             "transaction_data": tx_data
#         }

#         license_doc = LicenseInDB.from_mongo(license_dict)
#         result = await db_licenses.insert_one(license_doc.model_dump(by_alias=True, exclude={"id"}))

#         logger.info(f"Created license document with ID: {result.inserted_id}")

#         await db_artworks.update_one(
#             {"token_id": token_id},
#             {"$set": {"is_licensed": True, "updated_at": datetime.utcnow()}}
#         )

#         return {
#             "success": True,
#             "license_id": license_count,
#             "transaction_data": tx_data,
#             "terms_hash": terms_hash,
#             "license_document_preview": license_document["license_agreement"],
#             "fee": fee_eth
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error granting license with document: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Failed to grant license: {str(e)}")

# @router.post("/purchase")
# async def purchase_license(
#     token_id: int = Form(...),
#     license_type: str = Form(...),
#     current_user: dict = Depends(get_current_user)
# ):
#     """Purchase a license for an artwork using the new contract structure"""
#     try:
#         db_licenses = get_license_collection()
#         db_artworks = get_artwork_collection()

#         # Validate license type
#         if license_type not in ["LINK_ONLY", "ACCESS_WITH_WM", "FULL_ACCESS"]:
#             raise HTTPException(status_code=400, detail="Invalid license type")

#         try:
#             buyer_address = Web3.to_checksum_address(current_user.get("wallet_address"))
#         except Exception:
#             raise HTTPException(status_code=400, detail="Invalid buyer address")

#         # ✅ Get artwork info and price
#         artwork_doc = await db_artworks.find_one({"token_id": token_id}, sort=[("_id", -1)])
#         if not artwork_doc:
#             raise HTTPException(status_code=404, detail="Artwork not found")
        
#         # ✅ Get artwork price
#         artwork_price_eth = artwork_doc.get('price', 0.0)
#         if not artwork_price_eth or artwork_price_eth <= 0:
#             raise HTTPException(status_code=400, detail="Artwork price not set")

#         # Get artwork owner from blockchain
#         owner_address = await web3_service.get_artwork_owner(token_id)
#         if not owner_address:
#             raise HTTPException(status_code=404, detail="Could not determine artwork owner")

#         # Prevent self-purchase
#         if buyer_address.lower() == owner_address.lower():
#             raise HTTPException(status_code=400, detail="Cannot purchase license for your own artwork")

#         # ✅ Get license percentage from config
#         from services.license_config_service import LicenseConfigService
#         config = await LicenseConfigService.get_active_config()
        
#         license_percentages = {
#             "LINK_ONLY": config.link_only_percentage,  # 20%
#             "ACCESS_WITH_WM": config.watermark_percentage,  # 70%
#             "FULL_ACCESS": config.full_access_percentage  # 90%
#         }
#         license_percentage = license_percentages.get(license_type, 20.0)

#         # ✅ Calculate license fee from artwork price × license percentage
#         artwork_price_wei = Web3.to_wei(artwork_price_eth, 'ether')
#         license_fee_wei = (artwork_price_wei * int(license_percentage * 100)) // 10000

#         # ✅ Calculate platform fees from artwork price × platform fee percentage
#         from app.api.v1.artwork import get_current_global_fee
#         platform_fee_percentage = await get_current_global_fee()
#         platform_fee_basis = int(platform_fee_percentage * 100)
        
#         buyer_platform_fee_wei = (artwork_price_wei * platform_fee_basis) // 10000
#         seller_platform_fee_wei = (artwork_price_wei * platform_fee_basis) // 10000
#         total_required_wei = license_fee_wei + buyer_platform_fee_wei

#         logger.info(f"💰 License purchase calculation:")
#         logger.info(f"   Artwork Price: {artwork_price_eth} ETH")
#         logger.info(f"   License Type: {license_type} ({license_percentage}%)")
#         logger.info(f"   License Fee: {Web3.from_wei(license_fee_wei, 'ether')} ETH")
#         logger.info(f"   Buyer Platform Fee: {Web3.from_wei(buyer_platform_fee_wei, 'ether')} ETH")
#         logger.info(f"   Total Required: {Web3.from_wei(total_required_wei, 'ether')} ETH")

#         # ✅ Prepare blockchain transaction with artwork price and license percentage
#         duration_days = 30  # Default duration, or get from request
#         terms_hash = ""  # Generate or get from request
        
#         try:
#             tx_data = await web3_service.prepare_license_transaction(
#                 token_id=token_id,
#                 licensee_address=buyer_address,
#                 duration_days=duration_days,
#                 terms_hash=terms_hash,
#                 license_type=license_type,
#                 from_address=buyer_address,
#                 artwork_price_eth=artwork_price_eth,  # ✅ Add this parameter
#                 license_percentage=license_percentage  # ✅ Add this parameter
#             )
#         except Exception as e:
#             logger.error(f"Failed to prepare transaction: {e}")
#             raise HTTPException(status_code=500, detail=f"Failed to prepare blockchain transaction: {str(e)}")

#         # Store license record in database
#         license_count = await db_licenses.count_documents({}) + 1
        
#         license_dict = {
#             "license_id": license_count,
#             "token_id": token_id,
#             "buyer_address": buyer_address.lower(),
#             "owner_address": owner_address.lower(),
#             "license_type": license_type,
#             "license_fee_wei": str(license_fee_wei),
#             "buyer_platform_fee_wei": str(buyer_platform_fee_wei),
#             "seller_platform_fee_wei": str(seller_platform_fee_wei),
#             "total_amount_wei": str(total_required_wei),
#             "license_fee_eth": str(Web3.from_wei(license_fee_wei, 'ether')),
#             "buyer_platform_fee_eth": str(Web3.from_wei(buyer_platform_fee_wei, 'ether')),
#             "total_amount_eth": str(Web3.from_wei(total_required_wei, 'ether')),
#             "is_active": True,
#             "purchase_time": datetime.utcnow(),
#             "created_at": datetime.utcnow(),
#             "updated_at": datetime.utcnow(),
#             "transaction_data": tx_data,
#             "status": "PENDING"
#         }

#         result = await db_licenses.insert_one(license_dict)
#         logger.info(f"Created license document with ID: {result.inserted_id}")

#         return {
#             "success": True,
#             "license_id": license_count,
#             "transaction_data": tx_data,
#             "fee_breakdown": {
#                 "artwork_price": str(artwork_price_eth),
#                 "license_percentage": license_percentage,
#                 "license_fee": str(Web3.from_wei(license_fee_wei, 'ether')),
#                 "buyer_platform_fee": str(Web3.from_wei(buyer_platform_fee_wei, 'ether')),
#                 "total_amount": str(Web3.from_wei(total_required_wei, 'ether')),
#                 "license_type": license_type
#             },
#             "artwork_info": {
#                 "token_id": token_id,
#                 "title": artwork_doc.get("title", "Untitled"),
#                 "owner_address": owner_address
#             }
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error purchasing license: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Failed to purchase license: {str(e)}")





@router.post("/confirm-purchase")
async def confirm_license_purchase(
    confirmation_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Confirm license purchase after blockchain transaction and create/update DB record."""
    try:
        logger.info(f"📥 RECEIVED CONFIRM PURCHASE REQUEST: {confirmation_data}")
        tx_hash = str(confirmation_data.get("tx_hash") or "").strip()
        artwork_id = confirmation_data.get("artwork_id")
        token_id = confirmation_data.get("token_id")  # Legacy fallback
        license_type = str(confirmation_data.get("license_type") or "").strip().upper()
        duration_days = confirmation_data.get("duration_days")

        artwork_identifier = artwork_id or token_id
        if not tx_hash or not artwork_identifier or not license_type:
            raise HTTPException(
                status_code=400,
                detail="Missing tx_hash, artwork identifier, or license_type",
            )
        
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")

        # Solana is the only supported network
        network = "solana"

        # ✅ SECURITY: REPLAY PROTECTION
        transactions_collection = get_transaction_collection()
        existing_tx = await transactions_collection.find_one({
            "tx_hash": tx_hash,
            "transaction_type": {"$in": ["license_purchase", "license_payment"]}
        })
        if existing_tx:
            logger.error(f"❌ Replay Attack Blocked: Hash {tx_hash} already used for license purchase.")
            raise HTTPException(
                status_code=400, 
                detail="This transaction hash has already been used for a license purchase."
            )

        db_licenses = get_license_collection()
        db_artworks = get_artwork_collection()

        user_id = str(
            current_user.get("id")
            or current_user.get("_id")
            or current_user.get("user_id")
            or ""
        ).strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")

        buyer_wallet = str(current_user.get("wallet_address") or "").strip()
        if not buyer_wallet:
            raise HTTPException(status_code=400, detail="User wallet address not found")

        token_id = artwork_doc.get("token_id")
        if token_id is None:
            raise HTTPException(status_code=400, detail="Artwork token_id is missing")

        artwork_id = str(artwork_doc.get("_id"))
        artwork_price = float(artwork_doc.get("price") or 0)
        if artwork_price <= 0:
            raise HTTPException(status_code=400, detail="Artwork price not set or invalid")

        config = await LicenseConfigService.get_active_config()
        fee_calculation = await LicenseConfigService.calculate_license_fees(
            license_type,
            artwork_price,
            config,
            responsible_use_addon=artwork_doc.get("responsible_use_addon"),
        )

        owner_address = artwork_doc.get("owner_solana_address") or artwork_doc.get("creator_solana_address") or artwork_doc.get("owner_address")
        
        # ✅ SOLANA-SPECIFIC VERIFICATION
        from services.solana_service import solana_service
        logger.info(f"🔍 Verifying Solana license confirmation tx {tx_hash}")
        buyer_address = buyer_wallet
        
        # Convert SOL to Lamports (10^9)
        solana_expected_lamports = int(fee_calculation.total_amount_sol * 10**9)
        
        # Verify transaction on-chain
        verification_result = await solana_service.verify_purchase_transaction(
            tx_hash=tx_hash,
            expected_buyer=buyer_address,
            expected_seller=owner_address,
            expected_amount_wei=solana_expected_lamports
        )
        if not verification_result.get("success"):
            raise HTTPException(status_code=400, detail=f"Solana transaction verification failed: {verification_result.get('error')}")
        
        # Generate a deterministic license ID from transaction hash
        import hashlib
        license_id = int(hashlib.md5(tx_hash.encode()).hexdigest()[:8], 16)
        
        # ✅ Solana addresses are case-sensitive
        final_buyer_addr = str(buyer_address)
        final_owner_addr = str(owner_address)

        license_dict = {
            "license_id": license_id,
            "artwork_id": artwork_id,
            "token_id": token_id,
            "buyer_id": user_id,
            "owner_id": str(artwork_doc.get("owner_id") or ""),  # ✅ STORE LICENSOR ID for dashboard queries
            "buyer_address": final_buyer_addr,
            "owner_address": final_owner_addr,
            "license_type": license_type,
            "total_amount_sol": fee_calculation.total_amount_sol,
            "total_amount_lamports": solana_expected_lamports,
            "payment_method": "crypto",
            "network": "solana",
            "is_active": True,
            "status": "CONFIRMED",
            "transaction_hash": tx_hash,
            "duration_days": duration_days or 36500,
            "purchase_time": datetime.utcnow(),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        existing_license = await db_licenses.find_one({"license_id": license_id})
        if existing_license:
            logger.warning(f"⚠️ License {license_id} already exists. Updating existing record.")
            await db_licenses.update_one({"license_id": license_id}, {"$set": license_dict})
        else:
            await db_licenses.insert_one(license_dict)

        try:
            await db_artworks.update_one(
                {"_id": ObjectId(artwork_id)},
                {"$set": {"is_licensed": True, "updated_at": datetime.utcnow()}},
            )
        except Exception as update_error:
            logger.warning(f"⚠️ Could not set artwork is_licensed flag for {artwork_id}: {update_error}")

        # ✅ INVALIDATE CACHE: Clear license list for this artwork so it shows up in UI immediately
        try:
            await invalidate_artwork_licenses_cache(artwork_id)
            logger.info(f"🗑️ Invalidated license cache for artwork {artwork_id}")
        except Exception as cache_error:
            logger.warning(f"⚠️ Failed to invalidate license cache: {cache_error}")

        # ✅ LOG TRANSACTION for artist earnings dashboard
        try:
            db_transactions = get_transaction_collection()
            
            # Find owner user ID for to_user_id mapping
            owner_user = None
            if owner_address:
                owner_user = await get_user_collection().find_one({
                    "wallet_address": owner_address
                })
            
            to_user_id = str(owner_user.get("_id") or owner_user.get("user_id") or owner_user.get("id")) if owner_user else None

            license_transaction = {
                "transaction_hash": tx_hash,
                "token_id": token_id,
                "artwork_id": artwork_id,
                "from_user_id": user_id,
                "from_address": buyer_address,
                "to_user_id": to_user_id,
                "to_address": owner_address,
                "transaction_type": TransactionType.LICENSE_PAYMENT.value,
                "status": TransactionStatus.CONFIRMED.value,
                "value": str(fee_calculation.total_amount_sol),
                "currency": "SOL",
                "created_at": datetime.utcnow(),
                "network": "solana",
                "payment_method": "crypto"
            }
            await db_transactions.insert_one(license_transaction)
            logger.info(f"✅ LICENSE_PAYMENT transaction logged for artwork {token_id}")
        except Exception as log_error:
            logger.error(f"⚠️ Failed to log license transaction: {log_error}")

        return {
            "success": True,
            "message": "License purchase confirmed successfully",
            "license_id": license_id,
            "transaction_hash": tx_hash,
            "license_status": "CONFIRMED",
            "network": "solana",
            "verification": {"success": True},
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error confirming license purchase: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm license purchase: {str(e)}")


# ✅ NEW: License access check endpoint
@router.get("/access/{artwork_identifier}")
async def check_license_access(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Check user's license access level for a specific artwork.
    
    Returns:
        - access_level: OWNER, FULL_ACCESS, ACCESS_WITH_WM, LINK_ONLY, NO_ACCESS, or EXPIRED
        - license_info: License details if user has a license
        - content_url: URL to access content based on license type
    """
    from services.license_access_service import (
        LicenseAccessService, 
        ACCESS_OWNER, ACCESS_FULL, ACCESS_WATERMARK, ACCESS_LINK_ONLY, ACCESS_NONE, ACCESS_EXPIRED
    )
    
    try:
        user_id = str(current_user.get('id') or current_user.get('_id') or current_user.get('user_id') or '')
        wallet_address = current_user.get('wallet_address')

        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        resolved_token_id = artwork_doc.get("token_id") if artwork_doc else None
        
        # Get access level
        access_level, license_doc = await LicenseAccessService.get_access_level(
            user_id, artwork_identifier, wallet_address
        )
        
        logger.info(f"🔑 License access check for identifier: {artwork_identifier}, user: {user_id}, level: {access_level}")
        
        # Build response based on access level
        response = {
            "token_id": resolved_token_id,
            "access_level": access_level,
            "has_access": access_level not in [ACCESS_NONE, ACCESS_EXPIRED],
            "is_owner": access_level == ACCESS_OWNER,
            "is_expired": access_level == ACCESS_EXPIRED,
        }
        
        # Add content URLs based on access level
        image_url_id = artwork_identifier # Usually the MongoDB _id string from frontend
        
        if access_level == ACCESS_OWNER:
            response["content"] = {
                "type": "full_access",
                "can_download": True,
                "can_view": True,
                "image_url": f"/api/v1/artwork/{image_url_id}/licensed-image",
                "download_url": f"/api/v1/artwork/{image_url_id}/licensed-download"
            }
        elif access_level == ACCESS_FULL:
            response["content"] = {
                "type": "full_access",
                "can_download": True,
                "can_view": True,
                "image_url": f"/api/v1/artwork/{image_url_id}/licensed-image",
                "download_url": f"/api/v1/artwork/{image_url_id}/licensed-download"
            }
        elif access_level == ACCESS_WATERMARK:
            response["content"] = {
                "type": "watermarked",
                "can_download": False,
                "can_view": True,
                "image_url": f"/api/v1/artwork/{image_url_id}/licensed-image"
            }
        elif access_level == ACCESS_LINK_ONLY:
            response["content"] = {
                "type": "link_only",
                "can_download": False,
                "can_view": True,
                "share_url": f"/artwork/{image_url_id}",
                "image_url": f"/api/v1/artwork/{image_url_id}/licensed-image"
            }
        elif access_level == ACCESS_EXPIRED:
            response["content"] = {
                "type": "expired",
                "message": "License expired. Please renew to access this artwork.",
                "can_download": False,
                "can_view": False
            }
        else:
            response["content"] = {
                "type": "no_access",
                "message": "No license found. Please purchase a license to access.",
                "can_download": False,
                "can_view": False
            }
        
        # Add license info if available
        if license_doc:
            response["license_info"] = {
                "license_id": license_doc.get("license_id"),
                "license_type": license_doc.get("license_type"),
                "purchase_time": license_doc.get("purchase_time"),
                "end_date": license_doc.get("end_date"),
                "duration_days": license_doc.get("duration_days", 30),
                "is_active": license_doc.get("is_active", False),
                "payment_method": license_doc.get("payment_method", "crypto")
            }
        
        return response
        
    except Exception as e:
        logger.error(f"Error checking license access: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check license access")

# Add license configuration endpoints
@router.get("/config/active", response_model=LicenseConfig)
async def get_active_license_config():
    """Get the active license configuration"""
    try:
        config = await LicenseConfigService.get_active_config()
        return config
    except Exception as e:
        logger.error(f"Error getting active license config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get license configuration")

@router.post("/config", response_model=dict)
async def create_license_config(
    config_data: LicenseConfigCreate,
    current_admin: dict = Depends(get_current_admin_user)
):
    """Create a new license configuration (admin only)"""
    try:
        db = get_db()
        config_collection = db.license_configs
        
        # Deactivate other configurations if this one is set to active
        if config_data.is_active:
            await config_collection.update_many(
                {"is_active": True},
                {"$set": {"is_active": False}}
            )
        
        config = LicenseConfig(**config_data.model_dump())
        result = await config_collection.insert_one(config.model_dump(by_alias=True))
        
        return {
            "success": True,
            "config_id": str(result.inserted_id),
            "message": "License configuration created successfully"
        }
    except Exception as e:
        logger.error(f"Error creating license config: {e}")
        raise HTTPException(status_code=500, detail="Failed to create license configuration")

@router.put("/config/{config_id}", response_model=dict)
async def update_license_config(
    config_id: str,
    config_update: LicenseConfigUpdate,
    current_admin: dict = Depends(get_current_admin_user)
):
    """Update a license configuration (admin only)"""
    try:
        db = get_db()
        config_collection = db.license_configs
        
        from bson import ObjectId
        if not ObjectId.is_valid(config_id):
            raise HTTPException(status_code=400, detail="Invalid configuration ID")
        
        update_data = config_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        
        # Handle activation/deactivation
        if config_update.is_active is True:
            await config_collection.update_many(
                {"is_active": True},
                {"$set": {"is_active": False}}
            )
        
        result = await config_collection.update_one(
            {"_id": ObjectId(config_id)},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        return {
            "success": True,
            "message": "License configuration updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating license config: {e}")
        raise HTTPException(status_code=500, detail="Failed to update license configuration")

@router.get("/config", response_model=List[LicenseConfig])
async def list_license_configs(
    current_admin: dict = Depends(get_current_admin_user),
    active_only: bool = Query(False, description="Only return active configurations")
):
    """List all license configurations"""
    try:
        db = get_db()
        config_collection = db.license_configs
        
        query = {}
        if active_only:
            query["is_active"] = True
        
        cursor = config_collection.find(query).sort("created_at", -1)
        configs_data = await cursor.to_list(length=100)
        
        configs = []
        for doc in configs_data:
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            configs.append(LicenseConfig(**doc))
        
        return configs
    except Exception as e:
        logger.error(f"Error listing license configs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list license configurations")

@router.get("/prices")
async def get_license_prices(
    artwork_price: Optional[float] = Query(None, description="Artwork price in ETH for percentage calculation"),
    artwork_id: Optional[str] = Query(None, description="Filter by artwork MongoDB _id"),
    token_id: Optional[int] = Query(None, description="Legacy: Filter by artwork token ID")
):
    """Get license prices (fixed or percentage-based)"""
    try:
        responsible_use_addon = None
        artwork_identifier = artwork_id or token_id
        
        if artwork_identifier:
            artwork = await resolve_artwork_identifier(artwork_identifier)
            if artwork:
                responsible_use_addon = artwork.get("responsible_use_addon")
                if artwork_price is None:
                    artwork_price = artwork.get("price", 0.0)

        prices = await LicenseConfigService.get_all_license_prices(artwork_price or 0.0, responsible_use_addon)
        return prices
    except Exception as e:
        logger.error(f"Error getting license prices: {e}")
        raise HTTPException(status_code=500, detail="Failed to get license prices")

@router.get("/prices/calculate")
async def calculate_license_price(
    license_type: str = Query(..., description="License type"),
    artwork_price: Optional[float] = Query(None, description="Artwork price in ETH for percentage calculation"),
    artwork_id: Optional[str] = Query(None),
    token_id: Optional[str] = Query(None)
):
    """Calculate license price for a given license type"""
    try:
        responsible_use_addon = None
        artwork_identifier = artwork_id or token_id
        
        if artwork_identifier:
            artwork = await resolve_artwork_identifier(artwork_identifier)
            if artwork:
                responsible_use_addon = artwork.get("responsible_use_addon")
                if artwork_price is None:
                    artwork_price = artwork.get("price", 0.0)

        valid_types = [
            "PERSONAL_USE", "NON_COMMERCIAL", "COMMERCIAL", "EXTENDED_COMMERCIAL",
            "EXCLUSIVE", "ARTWORK_OWNERSHIP", "CUSTOM"
        ]
        if license_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid license type. Must be one of: {', '.join(valid_types)}")
        
        calculation = await LicenseConfigService.calculate_license_fees(
            license_type, 
            artwork_price,
            responsible_use_addon=responsible_use_addon
        )
        
        return {
            "success": True,
            "calculation": calculation.model_dump(),
            "license_type": license_type,
            "artwork_price_provided": artwork_price is not None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating license price: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate license price")

@router.post("/purchase-simple")
async def purchase_license_simple(
    artwork_id: Optional[str] = Form(None),
    token_id: Optional[str] = Form(None),
    license_type: str = Form(...),
    duration_days: Optional[int] = Form(None),
    req_network: Optional[str] = Form(None, alias="network"),
    buyer_address_req: Optional[str] = Form(None, alias="buyer_address"),
    current_user: dict = Depends(get_current_user)
):
    """Purchase a license with blockchain transaction - Solana only"""
    try:
        # Resolve artwork (artwork_id is prioritized)
        artwork_identifier = artwork_id or token_id
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")

        # Solana is the only supported network
        network = "solana"
        is_solana_purchase = True
        
        # Ensure we have both
        token_id = artwork_doc.get("token_id")
        artwork_id = str(artwork_doc.get("_id"))

        # Check Solana service health
        from services.solana_service import solana_service
        # No explicit health check needed here as it's handled by RPC calls, 
        # but we assume Solana is active.
        
        db_licenses = get_license_collection()
        db_artworks = get_artwork_collection()
        users_collection = get_user_collection()

        # Validate inputs
        valid_types = [
            "PERSONAL_USE", "NON_COMMERCIAL", "COMMERCIAL", "EXTENDED_COMMERCIAL",
            "EXCLUSIVE", "RESPONSIBLE_USE", "ARTWORK_OWNERSHIP", "CUSTOM"
        ]
        if license_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid license type. Must be one of: {', '.join(valid_types)}")

        # Get user wallet (Prefer passed address, fallback to profile)
        buyer_wallet = buyer_address_req or current_user.get('wallet_address')
        user_id = str(current_user.get('id', ''))
            
        if not buyer_wallet:
            logger.error(f"❌ User wallet address not found for user {user_id}")
            raise HTTPException(status_code=400, detail="User wallet address not found")

        buyer_wallet = str(buyer_wallet).strip()
        
        # Basic base58 validation for Solana
        if len(buyer_wallet) < 32 or len(buyer_wallet) > 44:
             raise HTTPException(status_code=400, detail="Invalid Solana wallet address")
        buyer_address = buyer_wallet
        
        artwork_price = artwork_doc.get("price", 0.0)
        if artwork_price <= 0:
            raise HTTPException(status_code=400, detail="Artwork price not set or invalid")
        
        # Check ownership
        owner_address = artwork_doc.get("owner_solana_address") or artwork_doc.get("owner_address")
            
        if str(buyer_address).lower() == str(owner_address or "").lower():
            raise HTTPException(status_code=400, detail="Cannot purchase license for your own artwork")
        
        # ✅ Auto-cleanup old pending licenses before checking for duplicates
        try:
            cleanup_result = await cleanup_old_pending_licenses(max_age_hours=1, dry_run=False)
            if cleanup_result.get("cleaned_count", 0) > 0:
                logger.info(f"🧹 Auto-cleaned {cleanup_result['cleaned_count']} old pending licenses before purchase check")
        except Exception as cleanup_error:
            logger.warning(f"⚠️ Auto-cleanup failed (non-critical): {cleanup_error}")

         # ✅ Check for existing active or pending license for this artwork and buyer
        existing_license = await db_licenses.find_one({
            "artwork_id": artwork_id,
            "buyer_id": user_id,
            "$or": [
                {"status": "CONFIRMED", "is_active": True},
                {"status": "PENDING"}  # Pending blockchain transaction
            ]
        })
        
        if existing_license:
            existing_license_id = existing_license.get("license_id")
            existing_status = existing_license.get("status")
            if existing_status == "CONFIRMED" and existing_license.get("is_active"):
                raise HTTPException(
                    status_code=400,
                    detail=f"You already have an active license (#{existing_license_id}) for this artwork. Each artwork can only have one active license per buyer."
                )
            elif existing_status == "PENDING":
                transaction_hash = existing_license.get("transaction_hash")
                
                # ✅ If no transaction hash, user cancelled - allow new purchase
                if not transaction_hash:
                    logger.info(f"🧹 Pending license #{existing_license_id} has no transaction hash (cancelled) - cleaning up")
                    await db_licenses.delete_one({"license_id": existing_license_id})
                    logger.info(f"✅ Cleaned up cancelled license - allowing new purchase")
                else:
                    logger.warning(f"⚠️ User {user_id} already has a pending license (#{existing_license_id}) for token {token_id}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"You already have a pending license purchase (#{existing_license_id}) for this artwork. Please wait for the transaction to confirm."
                    )

        # 1. Check if artwork is ALREADY exclusively licensed
        exclusive_query = {
            "artwork_id": artwork_id,
            "license_type": {"$in": ["EXCLUSIVE", "ARTWORK_OWNERSHIP"]},
            "status": {"$in": ["CONFIRMED", "PENDING"]},
            "is_active": True
        }
        existing_exclusive = await db_licenses.find_one(exclusive_query)
        if existing_exclusive:
            raise HTTPException(
                status_code=400,
                detail="Artwork is already exclusively licensed. No further licenses can be purchased."
            )
        
        # 2. If buying EXCLUSIVE, check if ANY active licenses exist
        if license_type in ["EXCLUSIVE", "ARTWORK_OWNERSHIP"]:
            any_active_query = {
                "artwork_id": artwork_id,
                "status": {"$in": ["CONFIRMED", "PENDING"]},
                "is_active": True
            }
            if await db_licenses.count_documents(any_active_query) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot purchase exclusive license for artwork with existing active licenses."
                )

        # Calculate license fees
        config = await LicenseConfigService.get_active_config()
        fee_calculation = await LicenseConfigService.calculate_license_fees(
            license_type, 
            artwork_price, 
            config,
            responsible_use_addon=artwork_doc.get("responsible_use_addon")
        )

        logger.info(
            f"🔄 Preparing Solana transaction for license purchase - Token: {token_id}, Buyer: {buyer_address}"
        )

        try:
            # Prepare dynamic parameters for Solana
            prep_params = {
                "token_id": token_id,
                "buyer_address": buyer_address,
                "license_type": license_type,
                "license_percentage": fee_calculation.license_percentage,
                "duration_days": duration_days or 36500,
                "artwork_price_sol": artwork_price,
                "addon_fee_sol": float(fee_calculation.addon_fee_sol)
            }
            
            # ✅ Use Solana-specific transaction preparation
            # Since we removed web3_service, we'll use solana_service directly if it has a prepare method
            # or construct the tx_data here. 
            # Looking at previous code, it used target_web3.prepare_simple_license_purchase
            # which for Solana return seller_amount, platform_amount, seller_address.
            
            # For now, let's assume solana_service handles this or we construct it.
            tx_data = {
                "seller_amount": int((fee_calculation.license_fee_sol + fee_calculation.addon_fee_sol) * 10**9),
                "platform_amount": int(fee_calculation.platform_fee_sol * 10**9),
                "seller_address": owner_address,
                "platform_address": settings.SOLANA_PLATFORM_ADDRESS,
                "token_id": token_id,
                "license_type": license_type
            }
            
            required_fields = ['seller_amount', 'platform_amount', 'seller_address', 'platform_address']
        except Exception as e:
            logger.error(f"❌ Error in license purchase preparation: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"License purchase preparation failed: {str(e)}")

        if not tx_data:
            raise HTTPException(status_code=500, detail="Failed to prepare blockchain transaction data")

        missing_fields = [field for field in required_fields if field not in tx_data]
        if missing_fields:
            logger.error(f"❌ Missing required transaction fields: {missing_fields}")
            raise HTTPException(
                status_code=500,
                detail=f"Incomplete transaction data: missing {', '.join(missing_fields)}"
            )

        # Store pending license in database (not active until blockchain confirmation)
        license_count = await db_licenses.count_documents({}) + 1
        
        response_data = {
            "success": True,
            "license_id": license_count,
            "transaction_data": tx_data,
            "requires_blockchain": True,
            "mode": "REAL",
            "network": "solana",
            "fee_calculation": fee_calculation.model_dump(),
            "artwork_info": {
                "token_id": token_id,
                "artwork_id": artwork_id,
                "title": artwork_doc.get("title", "Untitled"),
                "price_sol": artwork_price
            },
            "message": "Please confirm the transaction in your Phantom wallet to complete your license purchase"
        }
        
        logger.info(f"✅ Returning REAL transaction data for Phantom signing: {response_data}")
        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in license purchase: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"License purchase failed: {str(e)}")

    
@router.get("/health/blockchain")
async def blockchain_health():
    """Check blockchain connection status (Solana)"""
    try:
        from services.solana_service import solana_service
        status = await solana_service.check_connection_health()
        return {
            "success": True,
            "blockchain_status": status,
            "network": "solana",
            "connected": status.get("status") == "healthy",
            "provider_url": settings.SOLANA_RPC_URL,
            "program_id": settings.SOLANA_PROGRAM_ID
        }
    except Exception as e:
        logger.error(f"❌ Blockchain health check failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "network": "solana",
            "connected": False
        }
    
@router.get("/prices/artwork/{artwork_identifier}")
async def get_license_prices_for_artwork(artwork_identifier: str):
    """Get license prices for a specific artwork"""
    try:
        # Get artwork info
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        token_id = artwork_doc.get("token_id")
        artwork_id = str(artwork_doc.get("_id"))
        
        artwork_price = artwork_doc.get("price", 0.0)

        # ✅ Add detailed logging
        logger.info(f"💰 License price calculation for token {token_id}:")
        logger.info(f"   Artwork price from DB: {artwork_price} ETH")
        logger.info(f"   Artwork price type: {type(artwork_price)}")
        if artwork_price <= 0:
            raise HTTPException(status_code=400, detail="Artwork price not set or invalid")
        
        prices = await LicenseConfigService.get_all_license_prices(artwork_price, artwork_doc.get("responsible_use_addon"))
        logger.info(f"   Calculated prices: {prices.get('prices', {})}")
        # Add artwork information
        prices["artwork_info"] = {
            "token_id": token_id,
            "title": artwork_doc.get("title", "Untitled"),
            "price_eth": artwork_price,
            "owner_address": artwork_doc.get("owner_address")
        }
        
        return prices
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting license prices for artwork {token_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get license prices")
    
# Update other license endpoints to include duration information
@router.get("/{license_id}/status")
async def get_license_status(license_id: int):
    """Get detailed license status including expiration info"""
    try:
        db_licenses = get_license_collection()
        
        license_doc = await db_licenses.find_one({"license_id": license_id})
        if not license_doc:
            raise HTTPException(status_code=404, detail="License not found")
        
        current_time = datetime.utcnow()
        end_date = license_doc.get("end_date")
        is_active = license_doc.get("is_active", False)
        
        # Calculate time remaining
        time_remaining = None
        if end_date:
            if isinstance(end_date, str):
                end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            time_remaining = end_date - current_time
        
        status_info = {
            "license_id": license_id,
            "is_active": is_active and (not time_remaining or time_remaining.total_seconds() > 0),
            "status": license_doc.get("status", "UNKNOWN"),
            "purchase_time": license_doc.get("purchase_time"),
            "start_date": license_doc.get("start_date"),
            "end_date": license_doc.get("end_date"),
            "duration_days": license_doc.get("duration_days", 30),
            "artwork_price_eth": license_doc.get("artwork_price_eth", 0),
            "time_remaining_days": time_remaining.days if time_remaining and time_remaining.total_seconds() > 0 else 0,
            "time_remaining_hours": (time_remaining.seconds // 3600) if time_remaining and time_remaining.total_seconds() > 0 else 0,
            "is_expired": time_remaining and time_remaining.total_seconds() <= 0,
            "revoked_at": license_doc.get("revoked_at"),
            "revoked_reason": license_doc.get("revoked_reason")
        }
        
        return {
            "success": True,
            "license_status": status_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting license status for {license_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/buyer/{buyer_identifier}")
async def get_buyer_licenses(
    buyer_identifier: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get licenses for a buyer - supports both user ID and wallet address"""
    try:
        # ✅ AUTHORIZATION: Only allow users to see their own history or admins
        is_admin = current_user.get("role") == "admin"
        current_user_id = str(current_user.get("id") or current_user.get("_id") or current_user.get("user_id") or "")
        current_wallet = str(current_user.get("wallet_address") or "").lower()

        is_owner = (buyer_identifier.lower() == current_user_id.lower()) or \
                   (buyer_identifier.lower() == current_wallet)
        
        if not is_admin and not is_owner:
            logger.warning(f"🚫 Unauthorized attempt by {current_user_id} to view licenses for {buyer_identifier}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own license history."
            )
        db_licenses = get_license_collection()
        users_collection = get_user_collection()

        # Determine if identifier is a wallet address or user ID
        # ✅ Solana-Locked: Prioritize Solana addresses (32-44 base58)
        is_wallet_address = (32 <= len(buyer_identifier) <= 44 and not buyer_identifier.startswith('0x'))

        filter_query = {}
        
        if is_wallet_address:
            # Search by wallet address (Solana users)
            # Solana addresses are case-sensitive and do not use checksums like EVM
            filter_query = {"buyer_address": buyer_identifier}
            logger.info(f"Searching licenses by buyer Solana wallet address: {buyer_identifier}")
        else:
            # Search by user ID (internal lookup)
            # Try multiple lookup methods for user
            user = None
            if ObjectId.is_valid(buyer_identifier):
                user = await users_collection.find_one({"_id": ObjectId(buyer_identifier)})
            if not user:
                user = await users_collection.find_one({"user_id": buyer_identifier})
            if not user:
                user = await users_collection.find_one({"_id": buyer_identifier})
            if not user:
                user = await users_collection.find_one({"id": buyer_identifier})
            
            if user:
                # User found, search by buyer_id
                # ✅ Get all possible user ID formats that might be stored as buyer_id
                user_id_from_user_field = user.get('user_id')
                user_id_from_id_field = user.get('id')
                user_id_from_objectid = user.get('_id')
                
                # Convert all to strings
                possible_buyer_ids = set()
                
                # Add user_id field
                if user_id_from_user_field:
                    possible_buyer_ids.add(str(user_id_from_user_field))
                
                # Add id field
                if user_id_from_id_field:
                    possible_buyer_ids.add(str(user_id_from_id_field))
                
                # Add _id (ObjectId) as string
                if user_id_from_objectid:
                    possible_buyer_ids.add(str(user_id_from_objectid))
                
                # Add original identifier
                possible_buyer_ids.add(buyer_identifier)
                
                # ✅ Search with all possible buyer_id formats
                or_conditions = [{"buyer_id": bid} for bid in possible_buyer_ids]
                
                filter_query = {"$or": or_conditions} if len(or_conditions) > 1 else {"buyer_id": list(possible_buyer_ids)[0]}
                
                logger.info(f"🔍 Searching licenses by buyer user ID - Query: {filter_query}")
                logger.info(f"   Possible buyer_ids: {possible_buyer_ids}")
                logger.info(f"   User found - user_id: {user_id_from_user_field}, _id: {user_id_from_objectid}, id: {user_id_from_id_field}")
                
                # Also include wallet address if user has one (for crypto licenses)
                wallet_address = user.get('wallet_address')
                if wallet_address:
                    filter_query = {
                        "$or": or_conditions + [{"buyer_address": wallet_address}]
                    }
                    logger.info(f"Including wallet address in search: {wallet_address}")
            else:
                # Try as direct wallet address fallback
                filter_query = {"buyer_address": buyer_identifier}
                logger.info(f"Buyer user not found, searching as wallet address: {buyer_identifier}")

        # ⚡ OPTIMIZED: Get total count and licenses in parallel
        total_task = db_licenses.count_documents(filter_query)
        skip = (page - 1) * size
        licenses_task = db_licenses.find(filter_query).skip(skip).limit(size).sort("purchase_time", -1).to_list(length=size)
        
        # Execute both queries in parallel
        total, licenses_data = await asyncio.gather(total_task, licenses_task)
        has_next = (page * size) < total

        # Blockchain sync for EVM/Algorand removed as per Solana-native mandate
        blockchain_licenses = []

        # Combine and enrich licenses
        enriched_licenses = []
        
        # ⚡ OPTIMIZED: Batch fetch all user emails at once (fixes N+1 problem)
        # ⚡ OPTIMIZED: Batch fetch all user info at once (fixes N+1 problem)
        user_info_cache = {}
        owner_ids = set()
        buyer_ids = set()
        
        # ✅ POPULATE ID SETS FIRST
        for db_license in licenses_data:
            if not db_license:
                continue
            if db_license.get("owner_id"):
                owner_ids.add(str(db_license["owner_id"]))
            if db_license.get("buyer_id"):
                buyer_ids.add(str(db_license["buyer_id"]))

        # Batch fetch all users at once
        all_user_ids = owner_ids | buyer_ids
        if all_user_ids:
            # Build ObjectId queries
            object_id_queries = []
            string_id_queries = []
            
            for user_id in all_user_ids:
                if ObjectId.is_valid(user_id):
                    object_id_queries.append(ObjectId(user_id))
                else:
                    string_id_queries.append(user_id)
            
            async def cache_user_info(cursor):
                async for user in cursor:
                    info = {
                        "email": user.get("email"),
                        "name": user.get("username") or user.get("full_name") or "Unknown User"
                    }
                    # Cache by all possible ID formats
                    user_info_cache[str(user["_id"])] = info
                    if user.get("user_id"):
                        user_info_cache[str(user["user_id"])] = info
                    if user.get("id"):
                        user_info_cache[str(user["id"])] = info

            # Batch fetch by ObjectId _id
            if object_id_queries:
                await cache_user_info(users_collection.find({"_id": {"$in": object_id_queries}}))
            
            # Batch fetch by string _id for remaining IDs
            remaining_by_string = set(string_id_queries) - {str(k) for k in user_info_cache.keys()}
            if remaining_by_string:
                await cache_user_info(users_collection.find({"_id": {"$in": list(remaining_by_string)}}))
            
            # Batch fetch by user_id field for any still missing
            still_missing = all_user_ids - {str(k) for k in user_info_cache.keys()}
            if still_missing:
                await cache_user_info(users_collection.find({"user_id": {"$in": list(still_missing)}}))
            
            # Batch fetch by id field for any still missing
            still_missing = all_user_ids - {str(k) for k in user_info_cache.keys()}
            if still_missing:
                await cache_user_info(users_collection.find({"id": {"$in": list(still_missing)}}))

        # Add database licenses
        for db_license in licenses_data:
            try:
                if not db_license:
                    continue
                # ✅ Convert None to empty string for Pydantic validation
                buyer_address = db_license.get("buyer_address") or ""
                owner_address = db_license.get("owner_address") or ""
                
                owner_id = db_license.get("owner_id")
                buyer_id = db_license.get("buyer_id")
                payment_method = db_license.get("payment_method", "crypto")

                # ✅ Ensure purchase_time is a string
                purchase_time = db_license.get("purchase_time")
                if purchase_time is None:
                    purchase_time = ""
                elif isinstance(purchase_time, datetime):
                    purchase_time = purchase_time.isoformat()
                else:
                    purchase_time = str(purchase_time)
                
                # ✅ ENSURE SOLANA-NATIVE FIELDS ARE PRESENT (fixes Pydantic validation)
                total_amount_sol = str(db_license.get("total_amount_sol") or db_license.get("total_amount_eth") or "0")
                total_amount_lamports = str(db_license.get("total_amount_lamports") or db_license.get("total_amount_wei") or "0")

                # ⚡ OPTIMIZED: Get info from cache
                owner_info = user_info_cache.get(str(owner_id)) or {}
                buyer_info = user_info_cache.get(str(buyer_id)) or {}
                
                owner_email = owner_info.get("email")
                buyer_email = buyer_info.get("email")
                owner_name = owner_info.get("name")
                buyer_name = buyer_info.get("name")
                
                license_info = {
                    "license_id": _normalize_license_id(db_license.get("license_id")),
                    "artwork_id": str(db_license.get("artwork_id") or ""),
                    "token_id": db_license["token_id"],
                    "buyer_id": db_license.get("buyer_id"),
                    "owner_id": owner_id,
                    "buyer_address": buyer_address,
                    "owner_address": owner_address,
                    "license_type": db_license["license_type"],
                    
                    # ✅ ENRICHED USER INFO
                    "owner_email": owner_email,
                    "buyer_email": buyer_email,
                    "owner_name": owner_name,
                    "buyer_name": buyer_name,
                    
                    # ✅ SOLANA-NATIVE CURRENCY FIELDS (Mandatory for License model)
                    "total_amount_sol": total_amount_sol,
                    "total_amount_lamports": total_amount_lamports,
                    "actual_amount_sol": str(db_license.get("actual_amount_sol") or db_license.get("actual_amount_eth") or total_amount_sol),
                    "license_fee_sol": str(db_license.get("license_fee_sol") or db_license.get("license_fee_eth") or "0"),
                    "actual_amount_lamports": str(db_license.get("actual_amount_lamports") or db_license.get("actual_amount_wei") or total_amount_lamports),
                    "license_fee_lamports": str(db_license.get("license_fee_lamports") or db_license.get("license_fee_wei") or "0"),
                    
                    # Legacy fields for backward compatibility
                    "actual_amount_wei": str(db_license.get("actual_amount_wei", "0") or "0"),
                    "license_fee_wei": str(db_license.get("license_fee_wei", "0") or "0"),
                    "total_amount_wei": str(db_license.get("total_amount_wei", "0") or "0"),
                    "actual_amount_eth": str(db_license.get("actual_amount_eth", "0") or "0"),
                    "license_fee_eth": str(db_license.get("license_fee_eth", "0") or "0"),
                    "total_amount_eth": str(db_license.get("total_amount_eth", "0") or "0"),
                    
                    "purchase_time": purchase_time,
                    "is_active": db_license.get("is_active", True),
                    "status": db_license.get("status") or ("CONFIRMED" if db_license.get("is_active") else "PENDING"),
                    "payment_method": payment_method,
                    "transaction_hash": db_license.get("transaction_hash"),
                    "network": db_license.get("network") or "solana",
                    "source": "database"
                }
                enriched_licenses.append(license_info)
            except Exception as e:
                logger.warning(f"Skipping invalid license document: {e}")
                continue

        # Add blockchain licenses (avoid duplicates)
        for bc_license in blockchain_licenses:
            # Check if already in database results
            existing = any(l.get("license_id") == bc_license["license_id"] for l in enriched_licenses)
            if not existing:
                # Try to find artwork_id in database if not already provided
                art_doc = await get_artwork_collection().find_one({"token_id": bc_license.get("token_id")})
                artwork_id = str(art_doc["_id"]) if art_doc else None

                license_info = {
                    "license_id": _normalize_license_id(bc_license.get("license_id")),
                    "artwork_id": artwork_id,
                    "token_id": bc_license["token_id"],
                    "buyer_address": bc_license["buyer"],
                    "owner_address": bc_license["owner"],
                    "license_type": ["LINK_ONLY", "ACCESS_WITH_WM", "FULL_ACCESS"][bc_license["license_type"]],
                    "actual_amount_wei": str(bc_license["actual_amount"]),
                    "license_fee_wei": str(bc_license["license_fee"]),
                    "total_amount_wei": str(bc_license["total_amount"]),
                    "actual_amount_eth": str(Web3.from_wei(bc_license["actual_amount"], 'ether')),
                    "license_fee_eth": str(Web3.from_wei(bc_license["license_fee"], 'ether')),
                    "total_amount_eth": str(Web3.from_wei(bc_license["total_amount"], 'ether')),
                    "purchase_time": datetime.fromtimestamp(bc_license["purchase_time"]).isoformat(),
                    "is_active": bc_license["is_active"],
                    "source": "blockchain"
                }
                enriched_licenses.append(license_info)

        # ✅ SECURITY: Scrub PII for unauthorized users before returning
        scrubbed_licenses = _scrub_license_pii(enriched_licenses, current_user)

        return {
            "success": True,
            "licenses": scrubbed_licenses,
            "total": len(scrubbed_licenses),
            "page": page,
            "size": size,
            "has_next": has_next,
            "buyer_identifier": buyer_identifier
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting buyer licenses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/{wallet_address}", response_model=LicenseListResponse)
async def get_user_licenses(
    wallet_address: str,
    as_licensee: bool = Query(False, description="Get licenses where user is licensee (buyer)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get licenses for a specific user (as licensor or licensee) - supports both wallet address and user ID"""
    try:
        # ✅ AUTHORIZATION: Only allow users to see their own history or admins
        is_admin = current_user.get("role") == "admin"
        current_user_id = str(current_user.get("id") or current_user.get("_id") or current_user.get("user_id") or "")
        current_wallet = str(current_user.get("wallet_address") or "").lower()

        is_owner = (wallet_address.lower() == current_user_id.lower()) or \
                   (wallet_address.lower() == current_wallet)
        
        if not is_admin and not is_owner:
            logger.warning(f"🚫 Unauthorized attempt by {current_user_id} to view licenses for {wallet_address}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own license history."
            )
        logger.info(f"Getting licenses for identifier: {wallet_address} as_licensee={as_licensee}")
        
        # ✅ Detect if identifier is wallet address or user ID
        # ✅ PROTOCOL-AGNOSTIC WALLET DETECTION: Support EVM (0x + 40 hex), Solana (32-44 base58), and Algorand (58 base32)
        # ✅ Solana-Locked: Prioritize Solana addresses
        is_wallet_address = (32 <= len(wallet_address) <= 44 and not wallet_address.startswith('0x'))
        
        if is_wallet_address:
            # Solana addresses are case-sensitive
            normalized_identifier = wallet_address
            
            if as_licensee:
                # Get licenses where user is the licensee (buyer)
                result = await list_licenses(
                    page=page, 
                    size=size, 
                    licensee_address=normalized_identifier,
                    current_user=current_user
                )
            else:
                # Get licenses where user is the licensor (owner/seller)
                result = await list_licenses(
                    page=page, 
                    size=size, 
                    licensor_address=normalized_identifier,
                    current_user=current_user
                )

        else:
            # ✅ It's a user ID - use buyer endpoint logic
            if as_licensee:
                # Use the buyer endpoint which supports user IDs
                result_data = await get_buyer_licenses(
                    buyer_identifier=wallet_address,
                    page=page,
                    size=size,
                    current_user=current_user
                )

                # Convert to LicenseListResponse format
                from app.db.models import License, LicenseListResponse
                licenses = []
                
                for idx, license_dict in enumerate(result_data.get("licenses", [])):
                    try:
                        license_dict["license_id"] = _normalize_license_id(license_dict.get("license_id"))

                        # ✅ Ensure required fields for Pydantic validation
                        if license_dict.get("total_amount_sol") is None:
                            license_dict["total_amount_sol"] = "0"
                        if license_dict.get("total_amount_lamports") is None:
                            license_dict["total_amount_lamports"] = license_dict.get("total_amount_wei") or "0"
                        if license_dict.get("purchase_time") is None:
                            license_dict["purchase_time"] = datetime.utcnow().isoformat()
                        if license_dict.get("is_active") is None:
                            license_dict["is_active"] = True

                        license_obj = License(**license_dict)
                        licenses.append(license_obj)
                    except Exception as e:
                        logger.error(f"❌ Error converting license {idx+1} to License object: {e}")
                        continue
                
                result = LicenseListResponse(
                    licenses=licenses,
                    total=result_data.get("total", len(licenses)),
                    page=page,
                    size=size,
                    has_next=result_data.get("has_next", False)
                )
            else:
                # For licensor (seller), use list_licenses with licensor_id
                result = await list_licenses(
                    page=page, 
                    size=size, 
                    licensor_id=wallet_address,
                    current_user=current_user
                )

        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user licenses for {wallet_address}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user licenses: {str(e)}")

        # Try to find artwork_id in database if not in db_license
        artwork_id = None
        if db_license and db_license.get("artwork_id"):
            artwork_id = str(db_license.get("artwork_id"))
        else:
            # Fallback to looking up by token_id from blockchain data
            art_doc = await get_artwork_collection().find_one({"token_id": bc_license.get("token_id")})
            if art_doc:
                artwork_id = str(art_doc["_id"])

        # Format response
        license_info = {
            "success": True,
            "license_id": license_id,
            "artwork_id": artwork_id,
            "token_id": bc_license["token_id"],
            "owner_address": bc_license["owner"],
            "buyer_address": bc_license["buyer"],
            "license_type": ["LINK_ONLY", "ACCESS_WITH_WM", "FULL_ACCESS"][bc_license["license_type"]],
            "actual_amount_wei": str(bc_license["actual_amount"]),
            "license_fee_wei": str(bc_license["license_fee"]),
            "total_amount_wei": str(bc_license["total_amount"]),
            "purchase_time": bc_license["purchase_time"],
            "is_active": bc_license["is_active"],
            "source": "blockchain",
            "license": {  # ✅ Wrap in license object for frontend compatibility
                "license_id": license_id,
                "artwork_id": artwork_id,
                "token_id": bc_license["token_id"],
                "owner_address": bc_license["owner"],
                "buyer_address": bc_license["buyer"],
                "license_type": ["LINK_ONLY", "ACCESS_WITH_WM", "FULL_ACCESS"][bc_license["license_type"]],
                "actual_amount_wei": str(bc_license["actual_amount"]),
                "license_fee_wei": str(bc_license["license_fee"]),
                "total_amount_wei": str(bc_license["total_amount"]),
                "purchase_time": bc_license["purchase_time"],
                "is_active": bc_license["is_active"],
            }
        }
        
        # Add database info if available
        if db_license:
            license_info["database_info"] = {
                "status": db_license.get("status"),
                "created_at": db_license.get("created_at"),
                "payment_method": db_license.get("payment_method", "crypto"),
                "transaction_hash": db_license.get("transaction_hash")
            }
            license_info["license"]["database_info"] = license_info["database_info"]
            license_info["license"]["transaction_hash"] = db_license.get("transaction_hash")
            license_info["transaction_hash"] = db_license.get("transaction_hash")
        
        # ✅ SECURITY: Scrub PII for unauthorized users before returning
        return _scrub_license_pii(license_info, current_user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting license info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# @router.post("/grant", response_model=dict)
# async def grant_license(
#     license_data: LicenseCreate,
#     current_user: dict = Depends(get_current_user)
# ):
#     try:
#         db_licenses = get_license_collection()
#         db_artworks = get_artwork_collection()

#         artwork_doc = await db_artworks.find_one({"token_id": license_data.token_id})
#         if not artwork_doc:
#             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artwork not found")

#         if artwork_doc["owner_address"].lower() != current_user.get('wallet_address', '').lower():
#             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only artwork owner can grant licenses")

#         license_count = await db_licenses.count_documents({}) + 1

#         max_retries = 3
#         tx_data = None
#         for attempt in range(max_retries):
#             try:
#                 tx_data = await web3_service.prepare_license_transaction(
#                     license_data.token_id,
#                     license_data.licensee_address,
#                     license_data.duration_days,
#                     license_data.terms_hash,
#                     license_data.license_type.value,
#                     current_user.get("wallet_address")
#                 )
#                 break
#             except Exception as e:
#                 if attempt == max_retries - 1:
#                     raise e
#                 logger.warning(f"Attempt {attempt + 1} failed, retrying: {e}")
#                 await asyncio.sleep(1)

#         if not tx_data:
#             raise HTTPException(status_code=500, detail="Failed to prepare transaction after multiple attempts")

#         start_date = datetime.utcnow()
#         end_date = start_date + timedelta(days=license_data.duration_days)
#         fee_eth = 0.1

#         license_dict = {
#             "license_id": license_count,
#             "token_id": license_data.token_id,
#             "licensee_address": license_data.licensee_address.lower(),
#             "licensor_address": current_user.get("wallet_address").lower(),
#             "start_date": start_date,
#             "end_date": end_date,
#             "terms_hash": license_data.terms_hash,
#             "license_type": license_data.license_type,
#             "is_active": True,
#             "fee_paid": fee_eth,
#             "created_at": datetime.utcnow(),
#             "updated_at": datetime.utcnow(),
#             "transaction_data": tx_data
#         }

#         license_doc = LicenseInDB.from_mongo(license_dict)
#         result = await db_licenses.insert_one(license_doc.model_dump(by_alias=True, exclude={"id"}))

#         logger.info(f"Created license document with ID: {result.inserted_id}")

#         return {
#             "success": True,
#             "license_id": license_count,
#             "transaction_data": tx_data,
#             "fee": fee_eth
#         }

#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error granting license: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Failed to grant license: {str(e)}")


@router.get("/", response_model=LicenseListResponse)
async def list_licenses(
    page: int = 1,
    size: int = 20,
    licensee_address: Optional[str] = None,
    licensor_address: Optional[str] = None,
    licensee_id: Optional[str] = None,
    licensor_id: Optional[str] = None,
    token_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    raw_filter: Optional[Dict] = None,
    current_user: Optional[Dict] = Depends(get_current_user_optional)

):
    try:
        db_licenses = get_license_collection()
        users_collection = get_user_collection()
        filter_query = {}

        # ✅ Apply raw_filter if provided
        if raw_filter:
            filter_query.update(raw_filter)
        
        # ✅ Filter by token_id if provided
        if token_id is not None:
            # Ensure token_id is an integer, but also search for string version in case of data inconsistency
            token_id_int = int(token_id)
            # Use $in to match both int and string versions
            filter_query["token_id"] = {"$in": [token_id_int, str(token_id_int)]}
            logger.info(f"🔍 Filtering licenses by token_id: {token_id_int} (searching both int and string)")
        
        # ✅ Filter by is_active if provided
        if is_active is not None:
            filter_query["is_active"] = is_active
        
        # Build filter with actual database field names
        or_conditions = []
        
        if licensee_address:
            # For EVM, search case-insensitive, for others, search exact
            is_evm = licensee_address.startswith("0x")
            if is_evm:
                or_conditions.append({"buyer_address": licensee_address.lower()})
            else:
                or_conditions.append({"buyer_address": licensee_address})
        if licensee_id:
            # ✅ Handle multiple user ID formats for licensee (similar to buyer endpoint)
            user = None
            if ObjectId.is_valid(licensee_id):
                user = await users_collection.find_one({"_id": ObjectId(licensee_id)})
            if not user:
                user = await users_collection.find_one({"user_id": licensee_id})
            if not user:
                user = await users_collection.find_one({"_id": licensee_id})
            if not user:
                user = await users_collection.find_one({"id": licensee_id})
            
            if user:
                # Get all possible user ID formats
                possible_buyer_ids = set()
                if user.get('user_id'):
                    possible_buyer_ids.add(str(user.get('user_id')))
                if user.get('id'):
                    possible_buyer_ids.add(str(user.get('id')))
                if user.get('_id'):
                    possible_buyer_ids.add(str(user.get('_id')))
                possible_buyer_ids.add(licensee_id)
                
                # Search with all possible buyer_id formats
                buyer_or_conditions = [{"buyer_id": bid} for bid in possible_buyer_ids]
                or_conditions.extend(buyer_or_conditions)
                
                # Also include wallet address if user has one
                wallet_address = user.get('wallet_address')
                if wallet_address:
                    or_conditions.append({"buyer_address": wallet_address.lower()})
            else:
                # Fallback: try as direct buyer_id
                or_conditions.append({"buyer_id": licensee_id})
                
        if licensor_address:
            # For EVM, search case-insensitive, for others, search exact
            is_evm = licensor_address.startswith("0x")
            if is_evm:
                or_conditions.append({"owner_address": licensor_address.lower()})
            else:
                or_conditions.append({"owner_address": licensor_address})
        if licensor_id:
            # ✅ Handle multiple user ID formats for licensor (similar to buyer endpoint)
            user = None
            if ObjectId.is_valid(licensor_id):
                user = await users_collection.find_one({"_id": ObjectId(licensor_id)})
            if not user:
                user = await users_collection.find_one({"user_id": licensor_id})
            if not user:
                user = await users_collection.find_one({"_id": licensor_id})
            if not user:
                user = await users_collection.find_one({"id": licensor_id})
            
            if user:
                # Get all possible user ID formats
                possible_owner_ids = set()
                if user.get('user_id'):
                    possible_owner_ids.add(str(user.get('user_id')))
                if user.get('id'):
                    possible_owner_ids.add(str(user.get('id')))
                if user.get('_id'):
                    possible_owner_ids.add(str(user.get('_id')))
                possible_owner_ids.add(licensor_id)
                
                # Search with all possible owner_id formats
                owner_or_conditions = [{"owner_id": oid} for oid in possible_owner_ids]
                or_conditions.extend(owner_or_conditions)
                
                # Also include wallet address if user has one
                wallet_address = user.get('wallet_address')
                if wallet_address:
                    if wallet_address.startswith("0x"):
                        or_conditions.append({"owner_address": wallet_address.lower()})
                    else:
                        or_conditions.append({"owner_address": wallet_address})
            else:
                # Fallback: try as direct owner_id
                or_conditions.append({"owner_id": licensor_id})
            
        if or_conditions:
            if "$or" in filter_query:
                # ✅ Merge existing $or from raw_filter with newly built or_conditions using $and
                original_or = filter_query.pop("$or")
                if "$and" not in filter_query:
                    filter_query["$and"] = []
                filter_query["$and"].append({"$or": original_or})
                filter_query["$and"].append({"$or": or_conditions})
            else:
                filter_query["$or"] = or_conditions

        # 🔍 Debugging: Log the final constructed query
        logger.info(f"🔍 FINAL list_licenses MongoDB Query: {filter_query}")

        # ⚡ OPTIMIZED: Get total count and licenses in parallel
        total_task = db_licenses.count_documents(filter_query)
        skip = (page - 1) * size
        licenses_task = db_licenses.find(filter_query).skip(skip).limit(size).sort("purchase_time", -1).to_list(length=size)
        
        # Execute both queries in parallel
        total, licenses_data = await asyncio.gather(total_task, licenses_task)
        has_next = (page * size) < total
        
        licenses = []
        for doc in licenses_data:
            try:
                if not doc:
                    continue
                # ✅ ENSURE PROPER TYPE CONVERSION BEFORE CREATING LICENSE OBJECT
                license_dict = {
                    "license_id": doc.get("license_id", 0),
                    "artwork_id": str(doc.get("artwork_id") or ""),
                    "token_id": doc.get("token_id", 0),
                    "buyer_id": doc.get("buyer_id"),
                    "buyer_address": doc.get("buyer_address") or "",
                    "owner_address": doc.get("owner_address") or "",
                    "license_type": doc.get("license_type", "LINK_ONLY"),
                    
                    # ✅ SOLANA-NATIVE CURRENCY FIELDS
                    "total_amount_sol": str(doc.get("total_amount_sol") or doc.get("total_amount_eth") or "0"),
                    "total_amount_lamports": str(doc.get("total_amount_lamports") or doc.get("total_amount_wei") or "0"),
                    "is_active": doc.get("is_active", False),
                    
                    # ✅ CONVERT DATETIME TO STRING
                    "purchase_time": doc.get("purchase_time", datetime.utcnow()).isoformat() if isinstance(doc.get("purchase_time"), datetime) else str(doc.get("purchase_time", "")),
                    
                    # ✅ Preserve actual status from database
                    "status": doc.get("status") or ("CONFIRMED" if doc.get("is_active") else "PENDING"),
                    "duration_days": doc.get("duration_days", 30),
                    "artwork_price_sol": float(doc.get("total_amount_sol") or doc.get("total_amount_eth") or 0),
                    "payment_method": doc.get("payment_method", "crypto"),
                    "transaction_hash": doc.get("transaction_hash"),
                    "network": "solana",
                    
                    # ✅ CONVERT OPTIONAL AMOUNT FIELDS
                    "actual_amount_sol": str(doc.get("actual_amount_sol") or doc.get("actual_amount_eth") or doc.get("total_amount_sol") or "0"),
                    "license_fee_sol": str(doc.get("license_fee_sol") or doc.get("license_fee_eth") or "0"),
                    "actual_amount_lamports": str(doc.get("actual_amount_lamports") or doc.get("actual_amount_wei") or doc.get("total_amount_lamports") or "0"),
                    "license_fee_lamports": str(doc.get("license_fee_lamports") or doc.get("license_fee_wei") or "0"),
                }
                
                # Handle other date fields
                for field in ["start_date", "end_date", "created_at", "updated_at"]:
                    if field in doc and isinstance(doc[field], datetime):
                        license_dict[field] = doc[field].isoformat()
                    else:
                        license_dict[field] = doc.get(field, "")
                
                license_obj = License(**license_dict)
                licenses.append(license_obj)
                
            except Exception as e:
                logger.error(f"Skipping invalid license document {doc.get('license_id', 'unknown')}: {str(e)}")
                continue

        # ✅ SECURITY: Scrub PII for unauthorized users before returning
        scrubbed_licenses = _scrub_license_pii(licenses, current_user)

        return LicenseListResponse(
            licenses=scrubbed_licenses,
            total=total,
            page=page,
            size=size,
            has_next=has_next
        )

    except Exception as e:
        logger.error(f"Error listing licenses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list licenses: {str(e)}")

# Get license by ID
@router.get("/{license_id}", response_model=License)
async def get_license(
    license_id: int,
    current_user: Optional[Dict] = Depends(get_current_user_optional)

):
    try:
        db_licenses = get_license_collection()

        license_doc = await db_licenses.find_one({"license_id": license_id})
        if not license_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="License not found"
            )

        license_obj = LicenseInDB.from_mongo(license_doc)
        # ✅ SECURITY: Scrub PII for unauthorized users before returning
        return _scrub_license_pii(License.from_mongo(license_doc).dict(), current_user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting license {license_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get license: {str(e)}"
        )

# Get licenses for a specific artwork
def get_artwork_licenses_cache(artwork_id: str, page: int, size: int, active_only: bool) -> Optional[Dict]:
    """Get cached licenses for artwork"""
    key = cache.cache_key("artwork_licenses", artwork_id=artwork_id, page=page, size=size, active_only=active_only)
    return cache.get(key)

def set_artwork_licenses_cache(artwork_id: str, page: int, size: int, active_only: bool, data: Dict, ttl: int = 300):
    """Cache licenses for artwork"""
    key = cache.cache_key("artwork_licenses", artwork_id=artwork_id, page=page, size=size, active_only=active_only)
    return cache.set(key, data, ttl)

async def invalidate_artwork_licenses_cache(artwork_id: str):
    """
    Clear all license cache variants for an artwork.
    Since cache keys are hashed, we use pattern matching to clear all pages/sizes.
    """
    try:
        # Pattern for artwork_licenses looks like api:artwork_licenses:*
        cache.delete_pattern("api:artwork_licenses:*")
        logger.info(f"🗑️ Global License Cache Invalidation triggered for artwork {artwork_id}")
        return True
    except Exception as e:
        logger.error(f"Error invalidating artwork license cache: {e}")
        return False

# Line 2592 - Update the get_artwork_licenses endpoint:
@router.get("/artwork/{artwork_id}", response_model=LicenseListResponse)
async def get_artwork_licenses(
    artwork_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False),
    current_user: Optional[Dict] = Depends(get_current_user_optional)
):
    """Get all licenses for a specific artwork by artwork_id (MongoDB ID or token_id)"""
    try:
        # ✅ REDIS CACHE: Step 1 - Try to get from cache first
        cached_response = get_artwork_licenses_cache(artwork_id, page, size, active_only)
        if cached_response:
            logger.info(f"⚡ REDIS CACHE HIT - Returning cached licenses for artwork {artwork_id}")
            return LicenseListResponse(**cached_response)
        
        logger.info(f"💨 REDIS CACHE MISS - Fetching licenses for artwork_id: {artwork_id}")
        
        # Determine query filter (artwork_id or token_id fallback)
        filter_params = {"$or": []}
        
        # 1. Add Artwork Identifier searches
        if ObjectId.is_valid(artwork_id):
            filter_params["$or"].extend([
                {"artwork_id": artwork_id},
                {"artwork_id": ObjectId(artwork_id)}
            ])
        
        # 2. Add Token ID search fallback
        try:
            # Try to find the artwork to get its token_id
            artwork_query = {"title": artwork_id}
            if ObjectId.is_valid(artwork_id):
                artwork_query = {"_id": ObjectId(artwork_id)}
                
            artwork_doc = await get_artwork_collection().find_one(artwork_query)
            
            if artwork_doc and artwork_doc.get("token_id") is not None:
                tid = artwork_doc["token_id"]
                filter_params["$or"].extend([
                    {"token_id": tid},
                    {"token_id": str(tid)},
                    {"token_id": int(tid)}
                ])
                logger.info(f"🔍 Added token_id {tid} to search filter for artwork {artwork_id}")
            elif not ObjectId.is_valid(artwork_id):
                # Fallback for when artwork_id is already a number/token_id
                try:
                    tid = int(artwork_id)
                    filter_params["$or"].extend([{"token_id": tid}, {"token_id": str(tid)}])
                except ValueError:
                    pass
        except Exception as e:
            logger.warning(f"⚠️ Error resolving token_id for filter: {e}")

        # Final safety check: if $or is empty, use artwork_id directly
        if not filter_params["$or"]:
            filter_params = {"artwork_id": artwork_id}

        if active_only:
            filter_params["is_active"] = True

        # Log the filter params
        logger.info(f"📋 Filter params for license query: {filter_params}")
        
        # Fetch licenses from database
        result = await list_licenses(
            page=page,
            size=size,
            raw_filter=filter_params,
            current_user=current_user
        )

        # ✅ REDIS CACHE: Step 2 - Cache the response for 5 minutes (300 seconds)
        try:
            set_artwork_licenses_cache(artwork_id, page, size, active_only, result.model_dump(), ttl=300)
            logger.info(f"💾 Cached licenses for artwork {artwork_id} (TTL: 5 min)")
        except Exception as cache_error:
            logger.warning(f"⚠️ Failed to cache licenses: {cache_error}")
        
        logger.info(f"✅ Found {result.total} total licenses for artwork {artwork_id}, returning {len(result.licenses)} on page {page}")
        
        return result
    except Exception as e:
        logger.error(f"❌ Error fetching licenses for artwork {artwork_id}: {e}", exc_info=True)
        raise

# Get the current license fee for a specific license type
@router.get("/fee/{license_type}")
async def get_license_fee(license_type: str):
    """Get the current license fee for a specific license type (Solana-native)"""
    try:
        # Standard fee for Solana licenses
        fee_sol = 0.1
        return {
            "license_type": license_type,
            "fee_sol": fee_sol,
            "fee_lamports": int(fee_sol * 10**9),
            "network": "solana",
            "note": "Standard license fee for Solana network"
        }
    except Exception as e:
        logger.error(f"❌ Error getting license fee: {e}")
        return {
            "license_type": license_type,
            "fee_sol": 0.1,
            "fee_lamports": 100000000,
            "network": "solana",
            "note": "Using fallback fixed fee",
            "error": str(e)
        }
# drmbackend/app/api/v1/licenses.py - Add before the last endpoint

@router.post("/cleanup-pending")
async def cleanup_pending_licenses(
    current_admin: dict = Depends(get_current_admin_user),
    max_age_hours: int = Query(24, ge=1, le=168, description="Maximum age in hours (1-168)"),
    dry_run: bool = Query(False, description="If True, only count without deleting")
):
    """
    Manually trigger cleanup of old pending licenses.
    Only accessible to admins or for testing.
    """
    try:
        # ✅ Admin check is already handled by dependency
        result = await cleanup_old_pending_licenses(

            max_age_hours=max_age_hours,
            dry_run=dry_run
        )
        
        return {
            "success": True,
            "message": f"Cleanup completed: {result.get('cleaned_count', 0)} licenses {'would be' if dry_run else 'were'} cleaned",
            **result
        }
        
    except Exception as e:
        logger.error(f"❌ Error in cleanup endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")

async def validate_and_cleanup_pending_license(license_doc: dict) -> bool:
    """
    Validate a pending license and clean it up if invalid (Solana-native).
    
    Returns:
        True if license is valid and should block new purchase
        False if license is invalid and was cleaned up (allow new purchase)
    """
    try:
        from services.solana_service import solana_service
        
        license_id = license_doc.get("license_id")
        transaction_hash = license_doc.get("transaction_hash")
        db_licenses = get_license_collection()
        
        # ✅ Case 1: No transaction hash - cleanup if older than 5 minutes
        if not transaction_hash:
            created_at = license_doc.get("created_at")
            if created_at and (datetime.utcnow() - created_at).total_seconds() > 300:
                logger.info(f"🧹 Pending license #{license_id} has no hash and is older than 5 mins - cleaning up")
                await db_licenses.delete_one({"license_id": license_id})
                return False
            return True
            
        # ✅ Case 2: Transaction hash exists - Check status on Solana
        try:
            tx_status = await solana_service.get_transaction_status(transaction_hash)
            
            if tx_status == "NOT_FOUND":
                # Check transaction age - if older than 10 minutes, likely failed or dropped
                created_at = license_doc.get("created_at")
                if created_at:
                    age_minutes = (datetime.utcnow() - created_at).total_seconds() / 60
                    if age_minutes > 10:
                        logger.info(f"🧹 Pending license #{license_id} Solana tx not found after {age_minutes:.1f} mins - cleaning up")
                        await db_licenses.delete_one({"license_id": license_id})
                        return False
                return True # Still potentially pending
                
            if tx_status == "FAILED":
                logger.info(f"🧹 Pending license #{license_id} Solana tx failed - cleaning up")
                await db_licenses.delete_one({"license_id": license_id})
                return False
                
            if tx_status == "SUCCESS":
                # Transaction succeeded but license not confirmed in DB yet
                logger.info(f"✅ Pending license #{license_id} Solana tx succeeded - should be confirmed soon")
                return True
                
            return True
            
        except Exception as tx_error:
            logger.warning(f"⚠️ Error checking Solana transaction for license #{license_id}: {tx_error}")
            return True
        
    except Exception as e:
        logger.error(f"❌ Error validating pending license: {e}", exc_info=True)
        return True
# ✅ Approve or reject license request
@router.post("/{license_id}/approve")
async def approve_license_request(
    license_id: int,
    action: str = Form(...),  # "approve" or "reject"
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a pending license request"""
    try:
        db_licenses = get_license_collection()
        artworks_collection = get_artwork_collection()
        users_collection = get_user_collection()
        
        if action not in ["approve", "reject"]:
            raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
        
        # Get current user ID
        user_id = str(current_user.get('id', '') or current_user.get('_id', ''))
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        # Find the license
        license_doc = await db_licenses.find_one({"license_id": license_id})
        if not license_doc:
            raise HTTPException(status_code=404, detail="License not found")
        
        # Verify current user is the owner
        owner_id = license_doc.get("owner_id")
        if str(owner_id) != user_id:
            raise HTTPException(status_code=403, detail="Only the artwork owner can approve/reject license requests")
        
        # Verify license is pending approval
        if license_doc.get("status") != "PENDING_APPROVAL":
            raise HTTPException(
                status_code=400, 
                detail=f"License is not pending approval. Current status: {license_doc.get('status')}"
            )
        
        if action == "approve":
            # Approve the license
            await db_licenses.update_one(
                {"license_id": license_id},
                {
                    "$set": {
                        "is_active": True,
                        "status": "CONFIRMED",
                        "updated_at": datetime.utcnow(),
                        "approved_at": datetime.utcnow(),
                        "approved_by": user_id
                    }
                }
            )
            
            # ✅ CORRECT: Use unique artwork_id for status update instead of token_id
            artwork_id = license_doc.get("artwork_id")
            if artwork_id:
                # Support both ObjectId and string formats for the artwork document ID
                artwork_query = {"$or": [{"_id": artwork_id}]}
                if ObjectId.is_valid(artwork_id):
                    artwork_query["$or"].append({"_id": ObjectId(artwork_id)})
                    
                await artworks_collection.update_one(
                    artwork_query,
                    {"$set": {"is_licensed": True, "updated_at": datetime.utcnow()}}
                )
                logger.info(f"✅ Artwork {artwork_id} marked as is_licensed=True after manual approval")
            
            logger.info(f"✅ License {license_id} approved by owner {user_id}")

            # ✅ LOG TRANSACTION for artist earnings dashboard
            try:
                db_transactions = get_transaction_collection()
                
                # Fetch buyer ID from license doc
                buyer_user_id = license_doc.get("buyer_id")
                
                license_transaction = {
                    "transaction_hash": f"MANUAL-{license_id}",
                    "token_id": license_doc.get("token_id"),
                    "artwork_id": license_doc.get("artwork_id"),
                    "from_user_id": buyer_user_id,
                    "from_address": license_doc.get("buyer_address"),
                    "to_user_id": user_id, # Current user is the owner who approved
                    "to_address": license_doc.get("owner_address"),
                    "transaction_type": TransactionType.LICENSE_PAYMENT.value,
                    "status": TransactionStatus.CONFIRMED.value,
                    "value": str(license_doc.get("total_amount_usd") or "0"),
                    "currency": "USD",
                    "created_at": datetime.utcnow(),
                    "payment_method": license_doc.get("payment_method", "manual")
                }
                await db_transactions.insert_one(license_transaction)
                logger.info(f"✅ LICENSE_PAYMENT (Manual) transaction logged for license {license_id}")
            except Exception as log_error:
                logger.error(f"⚠️ Failed to log manual license transaction: {log_error}")
            
            return {
                "success": True,
                "message": "License approved successfully",
                "license_id": license_id,
                "status": "CONFIRMED"
            }
        else:
            # Reject the license
            await db_licenses.update_one(
                {"license_id": license_id},
                {
                    "$set": {
                        "is_active": False,
                        "status": "REJECTED",
                        "updated_at": datetime.utcnow(),
                        "rejected_at": datetime.utcnow(),
                        "rejected_by": user_id
                    }
                }
            )
            
            logger.info(f"❌ License {license_id} rejected by owner {user_id}")
            
            return {
                "success": True,
                "message": "License rejected",
                "license_id": license_id,
                "status": "REJECTED"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing license approval/rejection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process request: {str(e)}")


@router.post("/{license_id}/revoke")
async def prepare_revoke_license(
    license_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Prepare for license revocation (Solana-native). 
    Verifies ownership and returns necessary blockchain data.
    """
    try:
        from services.license_access_service import LicenseAccessService
        from services.solana_service import solana_service
        
        db_licenses = get_license_collection()
        
        # Try both string and int for license_id
        license_doc = await db_licenses.find_one({"license_id": license_id})
        if not license_doc and license_id.isdigit():
            license_doc = await db_licenses.find_one({"license_id": int(license_id)})
            
        if not license_doc:
            raise HTTPException(status_code=404, detail="License not found")
            
        # Verify ownership
        user_id = str(current_user.get("id") or current_user.get("_id") or current_user.get("user_id") or "")
        wallet_address = current_user.get("wallet_address")
        
        # ✅ Correct argument order: is_artwork_owner(user_id, artwork_id, wallet)
        is_owner = await LicenseAccessService.is_artwork_owner(user_id, license_doc.get("artwork_id"), wallet_address)
        
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only artwork owner can revoke licenses")
            
        if license_doc.get("status") == "REVOKED" or not license_doc.get("is_active", True):
            return {
                "success": True,
                "already_revoked": True,
                "message": "License is already revoked"
            }

        # Solana logic: Prepare Memo transaction data
        mint_address = license_doc.get("token_id") # For Solana, token_id is the mint address
        licensee_address = license_doc.get("buyer_address")
        
        solana_data = await solana_service.prepare_revoke_transaction(
            license_id=str(license_doc["license_id"]),
            mint_address=mint_address,
            licensee_address=licensee_address
        )
        
        if not solana_data.get("success"):
            raise HTTPException(status_code=500, detail=f"Failed to prepare Solana revocation: {solana_data.get('error')}")
            
        return {
            "success": True,
            "requires_blockchain": True,
            "network": "solana",
            "license_id": license_id,
            "blockchain_data": solana_data
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error preparing license revocation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{license_id}/revoke/confirm")
async def confirm_revoke_license(
    license_id: str,
    confirmation_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Confirm license revocation after blockchain transaction (Solana-native).
    Updates the database status and logs the event.
    """
    try:
        from services.license_access_service import LicenseAccessService
        
        tx_hash = confirmation_data.get("tx_hash")
        if not tx_hash:
            raise HTTPException(status_code=400, detail="Transaction hash is required")
            
        user_id = str(current_user.get("id") or current_user.get("_id") or current_user.get("user_id") or "")
        
        db_licenses = get_license_collection()
        # Find the actual license
        license_doc = await db_licenses.find_one({"license_id": license_id})
        actual_id = license_id
        if not license_doc and license_id.isdigit():
            license_doc = await db_licenses.find_one({"license_id": int(license_id)})
            if license_doc:
                actual_id = int(license_id)
        
        if not license_doc:
            raise HTTPException(status_code=404, detail="License not found")

        # Execute revocation in DB
        result = await LicenseAccessService.revoke_license(actual_id, user_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to revoke license"))
            
        # ✅ INVALIDATE CACHE
        artwork_id = license_doc.get("artwork_id")
        if artwork_id:
            await invalidate_artwork_licenses_cache(str(artwork_id))
            
        # Log the revocation transaction
        try:
            db_transactions = get_transaction_collection()
            
            revocation_transaction = {
                "transaction_hash": tx_hash,
                "token_id": license_doc.get("token_id"),
                "artwork_id": license_doc.get("artwork_id"),
                "from_user_id": user_id,
                "from_address": current_user.get("wallet_address"),
                "transaction_type": "LICENSE_REVOCATION",
                "status": TransactionStatus.CONFIRMED.value,
                "network": "solana",
                "created_at": datetime.utcnow(),
                "metadata": {
                    "license_id": actual_id,
                    "revoked_by": user_id
                }
            }
            await db_transactions.insert_one(revocation_transaction)
            
            # Also update the license with the tx hash
            await db_licenses.update_one(
                {"license_id": actual_id},
                {"$set": {"revoke_transaction_hash": tx_hash}}
            )
            
            logger.info(f"✅ Revocation transaction logged: {tx_hash}")
        except Exception as log_err:
            logger.error(f"⚠️ Failed to log revocation transaction: {log_err}")
        
        return {
            "success": True,
            "message": "License revoked and confirmed on platform",
            "license_id": license_id,
            "tx_hash": tx_hash,
            "status": "REVOKED"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error confirming license revocation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


