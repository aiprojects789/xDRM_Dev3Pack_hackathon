from typing import Any, Dict, Optional, Union
from bson import ObjectId
from app.db.database import get_artwork_collection, get_db, get_user_collection
from app.core.config import settings
from fastapi.responses import HTMLResponse
import logging

logger = logging.getLogger(__name__)

# Simple in-memory cache for resolved artworks to prevent redundant DB hits
_artwork_cache = {}
_MAX_CACHE_SIZE = 100

async def resolve_artwork_identifier(artwork_identifier: Union[int, str]) -> Optional[Dict[str, Any]]:
    """
    Resolve artwork from database using either MongoDB _id or legacy token_id.
    Optimized with caching and single-query lookups.
    """
    if artwork_identifier is None or artwork_identifier == "":
        return None
        
    # 1. Check Cache first
    cache_key = str(artwork_identifier)
    if cache_key in _artwork_cache:
        return _artwork_cache[cache_key]

    db = get_db()
    collections_to_search = [db.artworks, db["psl_tickets"]]
    
    # 2. Build optimized OR query
    or_filters = []
    
    # Handle ID-based lookups
    if isinstance(artwork_identifier, str):
        if ObjectId.is_valid(artwork_identifier):
            or_filters.append({"_id": ObjectId(artwork_identifier)})
        or_filters.append({"_id": artwork_identifier}) # Legacy string ID
    
    # Handle Numeric token_id (legacy)
    try:
        token_id_int = int(artwork_identifier)
        or_filters.append({"token_id": token_id_int})
    except (ValueError, TypeError):
        pass
        
    # Handle string fallbacks
    or_filters.append({"token_id": str(artwork_identifier)})
    or_filters.append({"display_id": str(artwork_identifier)})

    # 3. Execute search across collections
    for collection in collections_to_search:
        try:
            # Single query with all filters
            artwork_doc = await collection.find_one({"$or": or_filters})
            if artwork_doc:
                # Cache the result (limit size)
                if len(_artwork_cache) >= _MAX_CACHE_SIZE:
                    _artwork_cache.clear() # Simple clear if full
                _artwork_cache[cache_key] = artwork_doc
                
                # Log legacy usage only once in a while or if truly important
                if isinstance(artwork_doc.get("_id"), str):
                    logger.debug(f"ℹ️ Artwork {artwork_identifier} found by string _id")
                    
                return artwork_doc
        except Exception as e:
            logger.error(f"Lookup error in {collection.name}: {e}")
            
    return None

async def generate_share_html(artwork_id: str) -> HTMLResponse:
    """
    Centralized Social Media Metadata Injector.
    Generates dynamic OG tags for crawlers and redirects to frontend.
    Used by both main.py and artwork.py to ensure consistency across environments.
    """
    # 1. Resolve and Fetch Artwork
    try:
        artwork = await resolve_artwork_identifier(artwork_id)
    except:
        artwork = None

    # Default metadata if artwork not found
    title = "XDRM - Protect and Monetize Your Digital Creations"
    description = "Join XDRM, the secure marketplace for digital art. Protect your rights and monetize your creativity with blockchain-backed security."
    image_url = "https://xdrm.softechdigitalgroup.com/logo_white.png" # Fallback
    site_url = f"https://xdrm.softechdigitalgroup.com/artwork/{artwork_id}"
    creator_name = "XDRM Artist"

    if artwork:
        title_text = artwork.get("title", "Untitled Artwork")
        artwork_desc = artwork.get("description", "")
        
        # Get creator name (Robust fetching)
        creator_name = "XDRM Artist"
        try:
            user_collection = get_user_collection()
            c_id = artwork.get("creator_id")
            
            creator = None
            if c_id:
                if ObjectId.is_valid(str(c_id)):
                    creator = await user_collection.find_one({"_id": ObjectId(c_id)})
                if not creator:
                    creator = await user_collection.find_one({"_id": str(c_id)})
            
            if creator:
                creator_name = creator.get("full_name") or creator.get("username") or "XDRM Artist"
            else:
                creator_name = artwork.get('creator_name') or artwork.get('artist_name') or "XDRM Artist"
        except Exception as e:
            logger.error(f"Error fetching creator name for share: {e}")
            creator_name = artwork.get('creator_name') or "XDRM Artist"

        title = f"{title_text} by {creator_name} | XDRM"
        promo_text = " - Discover and own exclusive digital rights on XDRM."
        description = (artwork_desc[:150] + promo_text) if artwork_desc else f"View this exclusive artwork by {creator_name} protected by XDRM's secure digital rights management."
        image_url = f"https://xdrm.softechdigitalgroup.com/api/v1/artwork/{artwork_id}/image"

    # 2. Construct HTML with OG Tags
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        <meta name="description" content="{description}">

        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="https://xdrm.softechdigitalgroup.com/share/{artwork_id}">
        <meta property="og:title" content="{title}">
        <meta property="og:description" content="{description}">
        <meta property="og:image" content="{image_url}">
        <meta property="og:image:secure_url" content="{image_url}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:type" content="image/jpeg">
        <meta property="og:site_name" content="XDRM">

        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="https://xdrm.softechdigitalgroup.com/share/{artwork_id}">
        <meta property="twitter:title" content="{title}">
        <meta property="twitter:description" content="{description}">
        <meta property="twitter:image" content="{image_url}">

        <!-- Redirect for Humans -->
        <script>window.location.href = "{site_url}";</script>
        <meta http-equiv="refresh" content="0; url={site_url}">
        <style>
            body {{ background: #0f172a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
            .container {{ text-align: center; }}
            .loader {{ border: 4px solid #1e293b; border-top: 4px solid #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }}
            @keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="loader"></div>
            <p>Redirecting to artwork...</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)
