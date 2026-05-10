"""
DRM API Router — Image Protection endpoints.
Handles: access-controlled image serving, controlled downloads, 
usage monitoring, and screenshot attempt logging.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from datetime import datetime
import io
import os
import logging

from app.core.security import get_current_user, decode_token
from app.db.database import get_db, get_artwork_collection, get_license_collection
from app.core.config import settings
from services.watermark_service import WatermarkService
from services.download_service import DownloadService
from services.usage_monitoring_service import UsageMonitoringService, UsageEventType
from app.utils.artwork import resolve_artwork_identifier
from bson import ObjectId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drm", tags=["drm"])

# Initialize download service
download_service = DownloadService(secret_key=settings.SECRET_KEY)

# Upload directory — 4 levels up from app/api/v1/drm.py → drmbackend/
UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "uploads"
)

# Custom optional auth — auto_error=False so anonymous requests pass through
_http_bearer_optional = HTTPBearer(auto_error=False)

async def _get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_http_bearer_optional),
) -> Optional[dict]:
    """Extract user from token if present, return None otherwise (no 403)"""
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        if payload:
            return {
                "id": payload.get("user_id"),
                "user_id": payload.get("user_id"),
                "email": payload.get("sub"),
                "wallet_address": payload.get("wallet_address", ""),
            }
    except Exception:
        pass
    return None


def _get_usage_service():
    """Get usage monitoring service instance"""
    db = get_db()
    return UsageMonitoringService(db)


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _get_user_license(user_id: str, artwork_identifier: str) -> Optional[dict]:
    """Get the user's active license for an artwork"""
    db_licenses = get_license_collection()
    
    # Resolve artwork to get both IDs
    artwork = await resolve_artwork_identifier(artwork_identifier)
    if not artwork:
        return None
        
    token_id = artwork.get("token_id")
    artwork_id = str(artwork.get("_id"))
    
    license_doc = await db_licenses.find_one({
        "$or": [{"token_id": token_id}, {"artwork_id": artwork_id}],
        "buyer_id": user_id,
        "status": "CONFIRMED",
        "is_active": True,
    })
    return license_doc


async def _is_artwork_owner(current_user: dict, artwork_doc: dict) -> bool:
    """Check if user is the artwork owner using both ID and wallet address"""
    if not current_user:
        return False
        
    user_id = str(current_user.get("user_id") or current_user.get("id") or "")
    wallet_address = current_user.get("wallet_address", "").lower()
    
    owner_id = str(artwork_doc.get("owner_id", ""))
    creator_id = str(artwork_doc.get("creator_id", ""))
    owner_address = (artwork_doc.get("owner_solana_address") or artwork_doc.get("owner_address", "")).lower()
    creator_address = (artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address", "")).lower()
    
    return (
        (user_id and (user_id == owner_id or user_id == creator_id)) or
        (wallet_address and (wallet_address == owner_address or wallet_address == creator_address))
    )


async def _load_artwork_image(artwork_identifier: str, artwork_doc: Optional[dict] = None) -> Optional[bytes]:
    """Load artwork image from GridFS (primary) or disk (fallback)"""
    try:
        # Step 1: Use provided doc or resolve it
        if not artwork_doc:
            artwork_doc = await resolve_artwork_identifier(artwork_identifier)

        if artwork_doc:
            token_id = artwork_doc.get("token_id")
            # Try GridFS using gridfs_id from image_metadata
            gridfs_id = None
            image_metadata = artwork_doc.get("image_metadata", {})
            if isinstance(image_metadata, dict):
                gridfs_id = image_metadata.get("gridfs_id")

            # Fallback: try image_metadata_id field
            if not gridfs_id:
                gridfs_id = artwork_doc.get("image_metadata_id")

            if gridfs_id:
                try:
                    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
                    from bson import ObjectId
                    db = get_db()
                    fs = AsyncIOMotorGridFSBucket(db, bucket_name="artwork_images")

                    # Convert string ID to ObjectId
                    gfs_oid = ObjectId(gridfs_id) if isinstance(gridfs_id, str) else gridfs_id
                    grid_out = await fs.open_download_stream(gfs_oid)
                    data = await grid_out.read()
                    if data and len(data) > 0:
                        size_mb = len(data) / (1024 * 1024)
                        log_level = logging.WARNING if size_mb > 5 else logging.INFO
                        logger.log(log_level, f"✅ Loaded image from GridFS: {gridfs_id}, size={size_mb:.2f}MB")
                        return data
                except Exception as e:
                    logger.warning(f"⚠️ GridFS load failed for {gridfs_id}: {e}")

        # Step 2: Fallback — scan uploads directory
        if artwork_doc:
            token_id = artwork_doc.get("token_id")
            for ext in ["jpg", "jpeg", "png", "webp"]:
                for subdir in ["artworks", ""]:
                    image_path = os.path.join(UPLOADS_DIR, subdir, f"{token_id}.{ext}") if subdir else os.path.join(UPLOADS_DIR, f"{token_id}.{ext}")
                    if os.path.exists(image_path):
                        with open(image_path, "rb") as f:
                            return f.read()

    except Exception as e:
        logger.error(f"❌ Failed to load image for identifier {artwork_identifier}: {e}")

    return None


# ────────────────────────────────────────────────────
# 1. ACCESS-CONTROLLED IMAGE SERVING
# ────────────────────────────────────────────────────

@router.get("/image/{artwork_identifier}")
async def get_protected_image(
    artwork_identifier: str,
    request: Request,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    """
    Serve artwork image with DRM protection.
    
    - Owner/Creator → original image
    - Licensed user (FULL_ACCESS/COMMERCIAL+) → original image
    - Licensed user (LINK_ONLY/PERSONAL/WM) → watermarked image
    - No license / anonymous → watermarked image
    """
    try:
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)

        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")

        token_id = artwork_doc.get("token_id")
        
        # Load image from storage
        image_bytes = await _load_artwork_image(artwork_identifier, artwork_doc)
        if not image_bytes:
            raise HTTPException(status_code=404, detail="Artwork image not found")

        # Determine access level
        serve_original = False
        user_id = None

        if current_user:
            user_id = str(current_user.get("id", "") or current_user.get("_id", ""))

            # Owner/creator gets original
            if await _is_artwork_owner(current_user, artwork_doc):
                serve_original = True
            else:
                # Check license
                license_doc = await _get_user_license(user_id, artwork_identifier)
                if license_doc:
                    license_type = license_doc.get("license_type", "")
                    # Types that get original file
                    if license_type in ("FULL_ACCESS", "COMMERCIAL", "EXTENDED_COMMERCIAL", "EXCLUSIVE", "ARTWORK_OWNERSHIP"):
                        serve_original = True

        if serve_original:
            # Serve original image
            return Response(
                content=image_bytes,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "private, max-age=300",
                    "Vary": "Authorization",
                    "X-DRM-Access": "original",
                },
            )
        else:
            # Serve watermarked image
            image_hash = WatermarkService.compute_image_hash(image_bytes)
            # Use unique DB ID for watermark cache keys to avoid collisions (e.g., token_id 0)
            artwork_unique_id = str(artwork_doc["_id"])

            # Check cache first
            cached = WatermarkService.get_cached_watermark(image_hash, artwork_unique_id)
            if cached:
                return Response(
                    content=cached,
                    media_type="image/jpeg",
                    headers={
                        "Cache-Control": "private, max-age=600",
                        "Vary": "Authorization",
                        "X-DRM-Access": "watermarked",
                    },
                )

            # Generate watermark
            watermarked = WatermarkService.apply_visible_watermark(
                image_bytes,
                text="XDRM Protected",
                opacity=0.15,
                artwork_id=artwork_unique_id,
            )

            # Cache it
            WatermarkService.cache_watermark(image_hash, artwork_unique_id, watermarked)

            return Response(
                content=watermarked,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "private, max-age=600",
                    "Vary": "Authorization",
                    "X-DRM-Access": "watermarked",
                },
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error serving protected image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to serve image")


# ────────────────────────────────────────────────────
# 2. CONTROLLED DOWNLOADS
# ────────────────────────────────────────────────────

@router.post("/download/{artwork_identifier}/token")
async def generate_download_token(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a time-limited download token for an artwork.
    Requires an active license that permits downloading.
    """
    try:
        user_id = str(current_user.get("id", "") or current_user.get("_id", ""))
        
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        token_id = artwork_doc.get("token_id")

        # Owner can always download
        is_owner = await _is_artwork_owner(current_user, artwork_doc)
        
        if not is_owner:
            # Check license
            license_doc = await _get_user_license(user_id, artwork_identifier)
            if not license_doc:
                raise HTTPException(
                    status_code=403,
                    detail="You don't have an active license for this artwork",
                )

            license_type = license_doc.get("license_type", "")
            if not DownloadService.can_download(license_type):
                raise HTTPException(
                    status_code=403,
                    detail=f"Your license type ({license_type}) does not allow downloading. "
                    f"Upgrade to a Commercial or higher license.",
                )

            license_id = license_doc.get("license_id", 0)
        else:
            license_type = "OWNER"
            license_id = 0

        # Generate token
        result = download_service.generate_download_token(
            token_id=artwork_identifier, # Use string identifier in token for new system
            user_id=user_id,
            license_type=license_type,
            license_id=license_id,
        )

        if not result.get("success"):
            raise HTTPException(status_code=429, detail=result.get("error", "Rate limit exceeded"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error generating download token: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download token")


@router.get("/download/{artwork_identifier}")
async def download_artwork(
    artwork_identifier: str,
    token: str = Query(..., description="Download token"),
    request: Request = None,
):
    """
    Download artwork using a valid signed token.
    Token must be generated via POST /drm/download/{token_id}/token
    """
    try:
        # Validate token
        validation = download_service.validate_download_token(token)
        if not validation.get("valid"):
            raise HTTPException(
                status_code=403,
                detail=validation.get("error", "Invalid download token"),
            )

        # Verify token_id matches
        if str(validation.get("token_id")) != str(artwork_identifier):
            raise HTTPException(status_code=403, detail="Token does not match artwork")

        # Get artwork document
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork details not found")

        # Load image (Master copy with Creator tag)
        image_bytes = await _load_artwork_image(artwork_identifier, artwork_doc)
        if not image_bytes:
            raise HTTPException(status_code=404, detail="Artwork image not found")

        # ✅ NEW: Apply Forensic Watermark (Unified Chain of Custody Tag)
        # This adds the specific downloader's info to the image
        try:
            user_id = validation.get("user_id")
            license_id = validation.get("license_id")
            
            # Fetch license info for the payload if available
            license_doc = None
            if license_id:
                db_licenses = get_license_collection()
                license_doc = await db_licenses.find_one({"_id": ObjectId(license_id) if ObjectId.is_valid(license_id) else license_id})
            
            # If not found by ID, try looking it up by user/artwork
            if not license_doc:
                license_doc = await _get_user_license(user_id, artwork_identifier)
            
            # ✅ Fetch user wallet address for the forensic payload
            from app.db.database import get_user_collection
            user_doc = await get_user_collection().find_one({"_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id})
            user_wallet = user_doc.get("wallet_address") if user_doc else None
            
            # Determine license type (Ownership vs License)
            license_type = validation.get("license_type", "Unknown") # validation contains 'OWNER' or license name
            
            # Construct unified payload
            forensic_payload = {
                "ca": artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address") or artwork_doc.get("creator_id"),
                "oa": artwork_doc.get("owner_solana_address") or artwork_doc.get("owner_address") or artwork_doc.get("owner_id"),
                "ba": user_wallet or user_id, 
                "tid": str(artwork_doc.get("token_id", "0")),
                "net": "solana",
                "ts": datetime.utcnow().isoformat(),
                "lt": license_type
            }
            
            # Add transaction hash if available (Check license first, then artwork original minting)
            # Supporting both 'transaction_hash' and 'tx_hash' field names
            tx_hash = (license_doc.get("transaction_hash") or license_doc.get("tx_hash") if license_doc else None) or \
                      (artwork_doc.get("transaction_hash") or artwork_doc.get("tx_hash") if artwork_doc else None) or \
                      "N/A (Blockchain verification required)"
            
            forensic_payload["tx"] = tx_hash

            logger.info(f"🔍 Applying unified forensic watermark for user {user_id}...")
            
            # Embed robust DCT signature
            # This creates a unique traceable copy for this specific license/download
            watermarked_download = WatermarkService.embed_robust_signature(
                image_bytes, 
                forensic_payload,
                strength=18 # Balanced strength for download version
            )
            image_bytes = watermarked_download
            logger.info("✅ Unified forensic watermark (Chain of Custody) applied successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to apply forensic watermark during download: {e}")
            # We serve the master version if watermarking fails to ensure delivery

        # Log download event
        usage_service = _get_usage_service()
        await usage_service.log_event(
            event_type=UsageEventType.DOWNLOAD,
            artwork_identifier=artwork_identifier,
            user_id=validation.get("user_id"),
            license_id=validation.get("license_id"),
            ip_address=_get_client_ip(request) if request else "unknown",
            user_agent=request.headers.get("User-Agent", "") if request else "",
            metadata={"license_type": validation.get("license_type")},
        )

        # Get artwork title for filename
        title = artwork_doc.get("title", f"artwork_{artwork_identifier}")
        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()

        return Response(
            content=image_bytes,
            media_type="image/jpeg",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_title}.jpg"',
                "X-DRM-Access": "download",
                "Cache-Control": "no-store",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error downloading artwork: {e}")
        raise HTTPException(status_code=500, detail="Download failed")


# ────────────────────────────────────────────────────
# 3. USAGE MONITORING & ANALYTICS
# ────────────────────────────────────────────────────

@router.post("/usage/view/{artwork_identifier}")
async def log_artwork_view(
    artwork_identifier: str,
    request: Request,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    """Log an explicit view when a user visits the Artwork Details page"""
    try:
        user_id = str(current_user.get("id", "") or current_user.get("_id", "")) if current_user else None
        
        serve_original = False
        if user_id:
            artwork_doc = await resolve_artwork_identifier(artwork_identifier)
            if artwork_doc:
                if await _is_artwork_owner(current_user, artwork_doc):
                    serve_original = True
                else:
                    license_doc = await _get_user_license(user_id, artwork_identifier)
                    if license_doc and license_doc.get("license_type", "") in ("FULL_ACCESS", "COMMERCIAL", "EXTENDED_COMMERCIAL", "EXCLUSIVE", "ARTWORK_OWNERSHIP"):
                        serve_original = True

        event_type = UsageEventType.VIEW if serve_original else UsageEventType.PREVIEW_VIEW
        
        usage_service = _get_usage_service()
        await usage_service.log_event(
            event_type=event_type,
            artwork_identifier=artwork_identifier,
            user_id=user_id,
            ip_address=_get_client_ip(request),
            user_agent=request.headers.get("User-Agent", ""),
        )
        return {"success": True, "event": event_type}
    except Exception as e:
        logger.error(f"Failed to log view event: {e}")
        return {"success": False, "error": str(e)}

@router.post("/usage/screenshot-attempt")
async def log_screenshot_attempt(
    request: Request,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    """Log a screenshot attempt detected by the frontend"""
    try:
        body = await request.json()
        # Prefer unique ID, fallback to token_id
        artwork_identifier = body.get("artwork_id") or body.get("artwork_identifier") or body.get("token_id")

        if not artwork_identifier:
            raise HTTPException(status_code=400, detail="artwork_id or token_id required")

        user_id = None
        if current_user:
            user_id = str(current_user.get("id", "") or current_user.get("_id", ""))

        usage_service = _get_usage_service()
        await usage_service.log_event(
            event_type=UsageEventType.SCREENSHOT_ATTEMPT,
            artwork_identifier=str(artwork_identifier),
            user_id=user_id,
            ip_address=_get_client_ip(request),
            user_agent=request.headers.get("User-Agent", ""),
            metadata={"trigger": body.get("trigger", "unknown")},
        )

        return {"success": True, "message": "Event logged"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error logging screenshot attempt: {e}")
        return {"success": False}


@router.get("/usage/stats/{artwork_identifier}")
async def get_usage_stats(
    artwork_identifier: str,
    days: int = Query(30, ge=1, le=365, description="Number of days"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get usage analytics for an artwork.
    Only accessible by artwork owner/creator.
    """
    try:
        user_id = str(current_user.get("id", "") or current_user.get("_id", ""))

        # Verify ownership
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")

        if not await _is_artwork_owner(current_user, artwork_doc):
            raise HTTPException(status_code=403, detail="Only the artwork owner can view usage stats")

        usage_service = _get_usage_service()
        stats = await usage_service.get_artwork_stats(artwork_identifier, days)
        recent = await usage_service.get_recent_activity(artwork_identifier, limit=20)
        daily = await usage_service.get_daily_stats(artwork_identifier, days=min(days, 30))

        return {
            "success": True,
            "stats": stats,
            "recent_activity": recent,
            "daily_breakdown": daily,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting usage stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get usage stats")
