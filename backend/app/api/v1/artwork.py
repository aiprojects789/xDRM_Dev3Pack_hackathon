from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from datetime import datetime
import os
import time
from typing import Any, Dict, List, Optional, Union
from app.core.security import get_current_user, get_current_user_optional, get_current_admin_user
from app.db.database import get_artwork_collection, get_db
from app.db.schemas import ArtworkSchema
from services.solana_service import solana_service
from services.license_access_service import license_access_service
from services.user_history_service import UserHistoryService
import logging
from PIL import Image
import io
import numpy as np
import hashlib
import imagehash
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from services.watermark_service import WatermarkService
from app.db.database import get_user_collection, get_transaction_collection, get_license_collection
from bson import ObjectId
import tempfile
import base64
import aiohttp
import asyncio
import re
import json
from functools import lru_cache
from collections import defaultdict
# Add with other imports (after line 41)
from services.redis_cache_service import (
    cache,
    get_artworks_cache,
    set_artworks_cache,
    invalidate_artworks_cache,
    get_artwork_cache,
    set_artwork_cache,
    invalidate_artwork_cache,
    get_blockchain_cache,
    set_blockchain_cache,
    invalidate_blockchain_cache
)

# AI detection imports removed as per user request to delete AI validation files
def get_embedding(image_data): return []
def cosine_similarity(v1, v2): return 0.0
def classify_image(image_data, model): return {"is_ai_generated": False, "description": "AI Disabled"}

from app.db.models import (
    ArtworkCreate, ArtworkUpdate, ArtworkBase as Artwork, ArtworkInDB,
    ArtworkPublic, ArtworkListResponse, User, SaleConfirmation,
    TransactionCreate, TransactionType, TransactionStatus, ContractCallRequest, ContractCallResponse,
    ImageMetadata, DuplicateCheckResult, AIClassificationResult, SaleConfirmationRequest, SaleTransactionRequest
)
from app.core.config import settings
from app.utils.artwork import resolve_artwork_identifier
from app.utils.blockchain import normalize_blockchain_address

router = APIRouter(prefix="/artwork", tags=["artwork"])

# ✅ OPTIMIZATION: Simple in-memory cache for artwork counts (TTL: 30 seconds)
_artwork_counts_cache = {}
_counts_cache_ttl = 30  # seconds

def get_cached_counts():
    """Get cached artwork counts if still valid"""
    if _artwork_counts_cache:
        cached_time, cached_data = _artwork_counts_cache.get("data", (0, None))
        if time.time() - cached_time < _counts_cache_ttl:
            return cached_data
    return None

def set_cached_counts(data):
    """Cache artwork counts"""
    _artwork_counts_cache["data"] = (time.time(), data)

def clear_counts_cache():
    """Clear artwork counts cache (call when artworks are added/removed/modified)"""
    _artwork_counts_cache.clear()
    logger.debug("🗑️ Cleared artwork counts cache")

# async def get_current_registration_fee():
#     """Get the current registration platform fee percentage from admin settings"""
#     db = get_db()
#     settings = await db.system_settings.find_one({"_id": "global_settings"})
    
#     if settings:
#         # Check for registration_platform_fee_percentage first
#         fee = settings.get("registration_platform_fee_percentage")
#         if fee is None:
#             # Fallback to default_platform_fee_percentage if registration fee not set
#             fee = settings.get("default_platform_fee_percentage", 2)
#             logger.info(f"💰 Registration fee not set, using purchasing fee: {fee}%")
#         else:
#             logger.info(f"💰 Retrieved registration platform fee from database: {fee}%")
#         return float(fee) if fee is not None else 2
#     else:
#         logger.warning(f"⚠️ No global settings found, using default registration fee: 2%")
#         return 2
@router.get("/settings/platform-fee")
async def get_platform_fee():
    db = get_db()
    # Fetch from the same collection the Admin panel updates
    settings = await db.system_settings.find_one({"_id": "global_settings"})
    
    # Return default 2.5% if not set
    if not settings:
        return {"platform_fee": 2.5}
        
    return {"platform_fee": settings.get("platform_fee", 2.5)}

logger = logging.getLogger(__name__)

# ✅ License ID Generation System with Numeric Prefixes (similar to token_id)
LICENSE_ID_PREFIXES = {
    "on-chain": {"numeric": 0, "display": None},    # On-chain: Uses blockchain license_id directly (0, 1, 2...)
    "competition": {"numeric": 4, "display": "comp"}, # Competition: 4000001, 4000002...
}

async def generate_license_id(
    registration_method: str,
    licenses_collection
) -> int:
    """
    Generate license_id with numeric prefix for non-blockchain licenses (e.g. competition).
    
    Args:
        registration_method: 'on-chain' or 'competition'
        licenses_collection: MongoDB collection for licenses
    
    Returns:
        int: license_id with prefix (e.g., 4000001 for Competition)
    """
    # On-chain licenses use blockchain ID directly (no generation needed)
    if registration_method == "on-chain":
        return None
    
    # Determine the actual method
    method_key = registration_method.lower()
    
    # Get prefix configuration
    prefix_config = LICENSE_ID_PREFIXES.get(method_key)
    if not prefix_config:
        logger.warning(f"⚠️ Unknown registration method '{registration_method}', defaulting to competition")
        prefix_config = LICENSE_ID_PREFIXES["competition"]
        method_key = "competition"
    
    numeric_prefix = prefix_config["numeric"]
    
    # Find the highest license_id for this method
    min_license_id = numeric_prefix * 1000000
    max_license_id = (numeric_prefix + 1) * 1000000
    
    pipeline = [
        {
            "$match": {
                "license_id": {"$gte": min_license_id, "$lt": max_license_id}
            }
        },
        {
            "$sort": {"license_id": -1}
        },
        {
            "$limit": 1
        },
        {
            "$project": {"license_id": 1}
        }
    ]
    
    cursor = licenses_collection.aggregate(pipeline)
    result = await cursor.to_list(length=1)
    
    if result and result[0].get("license_id"):
        sequence = result[0]["license_id"] - min_license_id + 1
    else:
        sequence = 1
    
    license_id = min_license_id + sequence
    logger.info(f"✅ Generated license_id: {license_id} for method: {method_key}")
    return license_id

# ✅ Token ID Generation System with Numeric Prefixes
# Maps registration methods to numeric prefixes and display prefixes
REGISTRATION_METHOD_PREFIXES = {
    "on-chain": {"numeric": 0, "display": None},    # On-chain: 0, 1, 2... (no display_id, uses blockchain token_id)
    "competition": {"numeric": 4, "display": "comp"}, # Competition: 4000001, 4000002...
}

async def generate_token_id_and_display_id(
    registration_method: str,
    artworks_collection
) -> tuple[int, Optional[str]]:
    """
    Generate token_id with numeric prefix and display_id for non-blockchain artworks.
    
    Args:
        registration_method: 'on-chain' or 'competition'
        artworks_collection: MongoDB collection for artworks
    
    Returns:
        tuple: (token_id: int, display_id: Optional[str])
    """
    # Determine the actual method
    if registration_method == "on-chain":
        return None, None
    
    method_key = registration_method.lower()
    
    # Get prefix configuration
    prefix_config = REGISTRATION_METHOD_PREFIXES.get(method_key)
    if not prefix_config:
        logger.warning(f"Unknown registration method '{registration_method}', defaulting to competition")
        prefix_config = REGISTRATION_METHOD_PREFIXES["competition"]
        method_key = "competition"
    
    numeric_prefix = prefix_config["numeric"]
    display_prefix = prefix_config["display"]
    
    min_token_id = numeric_prefix * 1000000
    max_token_id = (numeric_prefix + 1) * 1000000
    
    pipeline = [
        {
            "$match": {
                "token_id": {"$gte": min_token_id, "$lt": max_token_id}
            }
        },
        {
            "$sort": {"token_id": -1}
        },
        {
            "$limit": 1
        },
        {
            "$project": {"token_id": 1}
        }
    ]
    
    cursor = artworks_collection.aggregate(pipeline)
    result = await cursor.to_list(length=1)
    
    if result and result[0].get("token_id"):
        sequence = result[0]["token_id"] - min_token_id + 1
    else:
        sequence = 1
    
    token_id = min_token_id + sequence
    display_id = f"{display_prefix}_{sequence}" if display_prefix else None
    
    logger.info(f"✅ Generated token_id: {token_id}, display_id: {display_id} for method: {method_key}")
    return token_id, display_id


# Global fee cache
_global_fee_cache = {"value": 2.5, "timestamp": 0}
_global_fee_ttl = 60  # seconds

async def get_current_global_fee():
    """Get the current global platform fee percentage from admin settings with caching"""
    global _global_fee_cache
    
    # Check cache
    if time.time() - _global_fee_cache["timestamp"] < _global_fee_ttl:
        return _global_fee_cache["value"]
        
    try:
        db = get_db()
        settings = await db.system_settings.find_one({"_id": "global_settings"})
        
        fee = 2.5
        if settings:
            # Admin saves to 'platform_fee', but we might have 'default_platform_fee_percentage' from older versions
            fee = settings.get("platform_fee")
            if fee is None:
                fee = settings.get("default_platform_fee_percentage", 2.5)
            fee = float(fee)
        else:
            logger.warning(f"⚠️ No global settings found, using default platform fee: 2.5%")
            
        # Update cache
        _global_fee_cache = {"value": fee, "timestamp": time.time()}
        return fee
    except Exception as e:
        logger.error(f"Error fetching global fee: {e}")
        return _global_fee_cache["value"] # Return last cached value on error


# Initialize GridFS for binary image storage
def get_gridfs():
    """Get GridFS bucket for image storage"""
    from app.db.database import get_db
    db = get_db()
    return AsyncIOMotorGridFSBucket(db, bucket_name="artwork_images")

# ✅ Enhanced Image Processing Class with Duplicate Detection
class ImageProcessor:
    @staticmethod
    async def process_image(image_data: bytes, max_size: int = 10 * 1024 * 1024) -> bytes:
        """
        Processes an image: validates header, converts to RGB, resizes and optimizes.
        Ensures file is a valid image to prevent XSS/RCE via polyglot files.
        """
        try:
            # ✅ SECURITY: Use PIL to verify it's a valid image format
            img = Image.open(io.BytesIO(image_data))
            
            # ✅ SECURITY: Explicit format whitelist
            valid_formats = ['JPEG', 'PNG', 'WEBP', 'MPO']
            if img.format not in valid_formats:
                logger.warning(f"🚫 Rejected invalid image format: {img.format}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unsupported image format: {img.format}. Please upload JPG, PNG, or WEBP."
                )

            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Standardize sizing
            max_dimension = 2000
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            # Save as optimized JPEG
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=85, optimize=True)
            processed_data = output.getvalue()

            return processed_data
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Image processing failed: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid image file or corrupted data")

    @staticmethod
    def get_perceptual_hash(file_bytes: bytes) -> str:
        """Generate perceptual hash for similar image detection"""
        try:
            image = Image.open(io.BytesIO(file_bytes))
            # FIXED: Use consistent hash size and algorithm
            phash = imagehash.phash(image, hash_size=8)  # Explicit hash size
            hash_str = str(phash)
            logger.debug(f"Generated perceptual hash: {hash_str}")
            return hash_str
        except Exception as e:
            logger.error(f"Error generating perceptual hash: {e}")
            return ""

    @staticmethod
    def get_file_hash(file_bytes: bytes) -> str:
        """Generate SHA256 hash for exact duplicate detection"""
        try:
            hash_obj = hashlib.sha256(file_bytes)
            hash_str = hash_obj.hexdigest()
            logger.debug(f"Generated file hash: {hash_str[:16]}...")
            return hash_str
        except Exception as e:
            logger.error(f"Error generating file hash: {e}")
            return ""

    @staticmethod
    async def check_duplicates(image_data: bytes) -> DuplicateCheckResult:
        """Check for duplicate images using multiple methods"""
        try:
            artworks_collection = get_artwork_collection()
            logger.info("=== DUPLICATE CHECK DEBUG START ===")
            
            # Count total artworks in database
            total_count = await artworks_collection.count_documents({})
            logger.info(f"Total artworks in database: {total_count}")
            
            # 1. Exact hash check
            file_hash = ImageProcessor.get_file_hash(image_data)
            logger.info(f"Generated file hash: {file_hash[:20]}...")
            
            # Debug: Check what hashes exist in database
            existing_hashes = await artworks_collection.find(
                {"image_metadata.file_hash": {"$exists": True}}, 
                {"image_metadata.file_hash": 1, "title": 1}
            ).to_list(length=10)
            
            logger.info(f"Found {len(existing_hashes)} artworks with file hashes:")
            for artwork in existing_hashes:
                stored_hash = artwork.get("image_metadata", {}).get("file_hash", "None")
                title = artwork.get("title", "Untitled")
                logger.info(f"  - {title}: {stored_hash[:20]}...")
            
            existing = await artworks_collection.find_one({"image_metadata.file_hash": file_hash})
            if existing:
                logger.warning(f"EXACT DUPLICATE FOUND: {existing.get('title', 'Untitled')}")
                return DuplicateCheckResult(
                    is_duplicate=True,
                    duplicate_type="exact",
                    similarity_score=1.0,
                    existing_artwork_id=str(existing["_id"]),
                    message="Exact duplicate found"
                )

            # 2. Perceptual hash check
            perceptual_hash = ImageProcessor.get_perceptual_hash(image_data)
            logger.info(f"Generated perceptual hash: {perceptual_hash}")
            
            # Debug: Check what perceptual hashes exist (limited for logging)
            existing_phashes_debug = await artworks_collection.find(
                {"image_metadata.perceptual_hash": {"$exists": True, "$ne": None}}, 
                {"image_metadata.perceptual_hash": 1, "title": 1}
            ).to_list(length=10)
            
            logger.info(f"Found {len(existing_phashes_debug)} artworks with perceptual hashes (showing first 10):")
            for artwork in existing_phashes_debug:
                stored_phash = artwork.get("image_metadata", {}).get("perceptual_hash", "None")
                title = artwork.get("title", "Untitled")
                logger.info(f"  - {title}: {stored_phash}")
            
            # Get ALL artworks with perceptual hashes for actual comparison
            existing_phashes = await artworks_collection.find(
                {"image_metadata.perceptual_hash": {"$exists": True, "$ne": None}}, 
                {"image_metadata.perceptual_hash": 1, "title": 1}
            ).to_list(length=None)  # No limit - fetch all
            
            logger.info(f"Comparing with {len(existing_phashes)} total artworks for perceptual hash similarity")
            
            # Test perceptual hash comparison
            for doc in existing_phashes:
                if "image_metadata" in doc and "perceptual_hash" in doc["image_metadata"]:
                    try:
                        stored_phash_str = doc["image_metadata"]["perceptual_hash"]
                        
                        if isinstance(stored_phash_str, str) and len(stored_phash_str) == len(perceptual_hash):
                            current_phash = imagehash.hex_to_hash(perceptual_hash)
                            stored_phash = imagehash.hex_to_hash(stored_phash_str)
                            distance = current_phash - stored_phash
                            
                            logger.info(f"Comparing with {doc.get('title', 'Untitled')}: distance = {distance}")
                            
                            if distance <= 8:
                                logger.warning(f"PERCEPTUAL DUPLICATE FOUND: {doc.get('title', 'Untitled')}, distance: {distance}")
                                return DuplicateCheckResult(
                                    is_duplicate=True,
                                    duplicate_type="perceptual",
                                    similarity_score=1.0 - (distance / 64.0),
                                    existing_artwork_id=str(doc["_id"]),
                                    message=f"Perceptually similar image found (distance: {distance})"
                                )
                    except Exception as e:
                        logger.error(f"Error comparing perceptual hash with {doc.get('title', 'Untitled')}: {e}")
                        continue

            # 3. AI embedding check
            logger.info("Starting AI embedding check...")
            try:
                embedding = get_embedding(image_data).tolist()
                logger.info(f"Generated embedding length: {len(embedding)}")
            except Exception as e:
                logger.error(f"Failed to generate embedding: {e}")
                embedding = None
            
            if embedding:
                # Debug: Check what embeddings exist (limited for logging)
                existing_embeddings_debug = await artworks_collection.find(
                    {"image_metadata.embedding": {"$exists": True, "$ne": None}}, 
                    {"image_metadata.embedding": 1, "title": 1}
                ).to_list(length=10)
                
                logger.info(f"Found artworks with embeddings (showing first 10):")
                for artwork in existing_embeddings_debug:
                    title = artwork.get("title", "Untitled")
                    logger.info(f"  - {title}")
                
                # Get ALL artworks with embeddings for actual comparison
                existing_embeddings = await artworks_collection.find(
                    {"image_metadata.embedding": {"$exists": True, "$ne": None}}, 
                    {"image_metadata.embedding": 1, "title": 1}
                ).to_list(length=None)  # No limit - fetch all
                
                logger.info(f"Comparing with {len(existing_embeddings)} total artworks for embedding similarity")
                
                for doc in existing_embeddings:
                    if "image_metadata" in doc and "embedding" in doc["image_metadata"]:
                        try:
                            stored_emb = np.array(doc["image_metadata"]["embedding"])
                            
                            if len(stored_emb) == len(embedding):
                                similarity = cosine_similarity(np.array(embedding), stored_emb)
                                logger.info(f"Embedding similarity with {doc.get('title', 'Untitled')}: {similarity:.4f}")
                                
                                if similarity >= 0.85:
                                    logger.warning(f"AI EMBEDDING DUPLICATE FOUND: {doc.get('title', 'Untitled')}, similarity: {similarity}")
                                    return DuplicateCheckResult(
                                        is_duplicate=True,
                                        duplicate_type="ai",
                                        similarity_score=similarity,
                                        existing_artwork_id=str(doc["_id"]),
                                        message=f"AI-detected similar image found (similarity: {similarity:.3f})"
                                    )
                            else:
                                logger.warning(f"Embedding dimension mismatch: current={len(embedding)}, stored={len(stored_emb)}")
                        except Exception as e:
                            logger.error(f"Error comparing embedding with {doc.get('title', 'Untitled')}: {e}")
                            continue

            logger.info("=== NO DUPLICATES FOUND ===")
            return DuplicateCheckResult(
                is_duplicate=False,
                message="No duplicates found"
            )

        except Exception as e:
            logger.error(f"Duplicate check failed: {str(e)}", exc_info=True)
            return DuplicateCheckResult(
                is_duplicate=False,
                message=f"Duplicate check failed: {str(e)}"
            )

    @staticmethod
    async def classify_ai_content(image_data: bytes, model_choice: str = "gemini-2.5-flash") -> AIClassificationResult:
        """Classify if image is AI-generated with consistent processing"""
        try:
            logger.info(f"Starting AI classification with model: {model_choice}")
            
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(image_data)
                tmp_path = tmp.name
            
            try:
                logger.info(f"Calling classify_image with path: {tmp_path}")
                
                # Get raw classification result
                raw_classification = await classify_image(tmp_path, model_choice=model_choice)
                logger.info(f"Raw classification result type: {type(raw_classification)}")
                logger.info(f"Raw classification result keys: {raw_classification.keys() if isinstance(raw_classification, dict) else 'Not a dict'}")
                
                # Process with consistent logic
                processed_result = ImageProcessor.process_classification_result(raw_classification)
                logger.info(f"Processed classification: {processed_result}")
                
                # Convert to AIClassificationResult
                result = AIClassificationResult(
                    is_ai_generated=processed_result["is_ai_generated"],
                    confidence=processed_result["confidence"],
                    description=processed_result["description"],
                    model_used=model_choice,
                    generated_description=processed_result.get("details", "")
                )
                
                logger.info(f"Final AIClassificationResult: {result.dict()}")
                return result
                
            finally:
                # File deletion logic...
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        if os.path.exists(tmp_path):
                            os.unlink(tmp_path)
                            break
                    except PermissionError:
                        if attempt < max_retries - 1:
                            time.sleep(0.5)
                            continue
                        logger.warning(f"Failed to delete temp file after {max_retries} attempts: {tmp_path}")
                    except Exception as e:
                        logger.warning(f"Error deleting temp file: {str(e)}")
                                
        except Exception as e:
            logger.error(f"AI classification failed: {str(e)}", exc_info=True)
            return AIClassificationResult(
                is_ai_generated=False,
                confidence=0.0,
                description=f"Classification failed: {str(e)[:100]}...",
                model_used=model_choice,
                generated_description=""
            )
    @staticmethod
    def process_classification_result(result):
        """Consistently process AI classification results from all providers"""
        try:
            provider = result.get('provider')
            classification_data = result.get('result')
            
            # Handle different response formats consistently
            if isinstance(classification_data, tuple):
                # Tuple format: (label, details, description)
                if len(classification_data) >= 3:
                    label = classification_data[0]
                    details = classification_data[1]
                    description = classification_data[2]
                    
                    # FIXED: Handle the case where details is a JSON string
                    if isinstance(details, str) and details.strip().startswith('{'):
                        try:
                            # Try to parse the JSON string
                            json_data = json.loads(details)
                            label = json_data.get("label", label)
                            details = json_data.get("details", details)
                            description = json_data.get("description", description)
                            logger.info(f"Parsed JSON from details: label={label}")
                        except json.JSONDecodeError:
                            # If JSON parsing fails, keep original values
                            logger.warning("Failed to parse JSON from details field")
                            pass
                else:
                    # Handle incomplete tuple
                    label = classification_data[0] if len(classification_data) > 0 else None
                    details = classification_data[1] if len(classification_data) > 1 else ""
                    description = classification_data[2] if len(classification_data) > 2 else ""
            else:
                # Handle other formats (string, dict, etc.)
                label = None
                details = ""
                description = str(classification_data) if classification_data else ""

            # FIXED: Better logging to see what we're working with
            logger.info(f"Processing classification - label: {label}, details: {details[:100]}...")
            
            # Consistent AI detection logic
            is_ai_generated = False
            confidence = 0.0
            
            # Check if label indicates AI
            if label and label.upper() == "AI":
                is_ai_generated = True
                confidence = 0.85  # High confidence when explicitly labeled AI
            elif label and label.upper() == "REAL":
                is_ai_generated = False
                confidence = 0.85
            elif label and label.upper() == "HUMAN":
                is_ai_generated = False
                confidence = 0.85
            else:
                # Fallback: analyze description for AI indicators
                ai_indicators = ["AI", "artificial intelligence", "generated", "digital artwork", "algorithm", "neural network", "synthetic"]
                human_indicators = ["hand", "painted", "drawn", "brush", "canvas", "physical", "traditional", "human"]
                
                description_lower = description.lower() if description else ""
                details_lower = details.lower() if details else ""
                combined_text = f"{description_lower} {details_lower}"
                
                ai_indicator_count = sum(1 for indicator in ai_indicators if indicator in combined_text)
                human_indicator_count = sum(1 for indicator in human_indicators if indicator in combined_text)
                
                if ai_indicator_count > human_indicator_count:
                    is_ai_generated = True
                    confidence = min(0.7, ai_indicator_count * 0.15)
                else:
                    is_ai_generated = False
                    confidence = min(0.7, human_indicator_count * 0.15)
            
            logger.info(f"Final decision - is_ai_generated: {is_ai_generated}, confidence: {confidence}")
            
            return {
                "is_ai_generated": is_ai_generated,
                "confidence": confidence,
                "label": label,
                "description": description,
                "details": details,
                "provider": provider
            }
            
        except Exception as e:
            logger.error(f"Error processing classification result: {str(e)}")
            return {
                "is_ai_generated": False,
                "confidence": 0.0,
                "label": "ERROR",
                "description": f"Classification error: {str(e)}",
                "details": "",
                "provider": "error"
            }

    @staticmethod
    async def store_image_binary(image_data: bytes, filename: str, content_type: str) -> str:
        """Store image binary data in GridFS and return string ID"""
        try:
            fs = get_gridfs()
            # Add debug logging
            logger.info(f"Storing image in GridFS: {filename}, size: {len(image_data)} bytes")
            
            gridfs_id = await fs.upload_from_stream(filename, image_data, metadata={
                "content_type": content_type,
                "uploaded_at": datetime.utcnow()
            })
            
            # Convert ObjectId to string for storage
            gridfs_id_str = str(gridfs_id)
            logger.info(f"Image stored successfully with ID: {gridfs_id_str}")
            
            return gridfs_id_str
        except Exception as e:
            logger.error(f"Binary image storage failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to store image: {str(e)}")
        
# ✅ IPFS Upload Service (unchanged)
class IPFSService:
    """Service class to handle IPFS uploads with multiple providers"""
    
    @staticmethod
    async def upload_to_pinata(file_data: bytes, filename: str) -> str:
        """Upload to Pinata.cloud with proper error handling"""
        try:
            pinata_api_key = settings.PINATA_API_KEY
            pinata_secret_api_key = settings.PINATA_SECRET_API_KEY
            
            if not pinata_api_key or not pinata_secret_api_key:
                raise Exception("Pinata API credentials not configured")
            
            form_data = aiohttp.FormData()
            form_data.add_field('file', file_data, filename=filename)
            
            headers = {
                'pinata_api_key': pinata_api_key,
                'pinata_secret_api_key': pinata_secret_api_key,
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://api.pinata.cloud/pinning/pinFileToIPFS',
                    headers=headers,
                    data=form_data
                ) as response:
                    content_type = response.headers.get('Content-Type', '')
                    response_text = await response.text()
                    
                    if 'application/json' in content_type:
                        result = await response.json()
                        if response.status == 200:
                            return f"ipfs://{result['IpfsHash']}"
                        else:
                            error_msg = result.get('error', {}).get('message', 'Unknown error')
                            raise Exception(f"Pinata error: {error_msg}")
                    else:
                        if response.status == 401:
                            raise Exception("Pinata authentication failed - check API keys")
                        elif response.status == 403:
                            raise Exception("Pinata access denied - check API permissions")
                        elif response.status == 413:
                            raise Exception("Pinata file too large - try smaller image")
                        else:
                            raise Exception(f"Pinata error: HTTP {response.status} - {response_text[:200]}")
                        
        except Exception as e:
            logger.error(f"Pinata upload failed: {str(e)}")
            raise

    @staticmethod
    async def upload_to_ipfs(file_data: bytes, filename: str, max_retries: int = 2) -> str:
        """Main upload method that tries multiple providers with retries"""
        providers = []
        
        if settings.PINATA_API_KEY and settings.PINATA_SECRET_API_KEY:
            providers.append(("Pinata", IPFSService.upload_to_pinata))
        
        if not providers:
            raise Exception("No IPFS providers configured. Please set up at least one IPFS service.")
        
        errors = []
        
        for provider_name, provider_func in providers:
            for attempt in range(max_retries):
                try:
                    logger.info(f"Trying {provider_name} (attempt {attempt + 1})...")
                    result = await provider_func(file_data, filename)
                    logger.info(f"Successfully uploaded to IPFS using {provider_name}: {result}")
                    return result
                except Exception as e:
                    error_msg = f"{provider_name} attempt {attempt + 1} failed: {str(e)}"
                    errors.append(error_msg)
                    logger.warning(error_msg)
                    
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)
        
        detailed_error = "All IPFS providers failed:\n" + "\n".join(errors)
        logger.error(detailed_error)
        raise Exception("All IPFS providers failed. Check API keys and network connectivity.")

# Add these imports at the top
from app.db.models import ArtworkCategory, ArtworkCategoryCreate

# Add this function to get database collections
def get_categories_collection():
    db = get_db()
    return db.artwork_categories

# Add these endpoints before your existing artwork endpoints
@router.post("/categories", response_model=dict)
async def create_category(
    category: ArtworkCategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new artwork category (admin only)"""
    try:
        # Check if user is admin (you'll need to implement this check based on your user model)
        # if not current_user.get("is_admin", False):
        #     raise HTTPException(status_code=403, detail="Only admins can create categories")
        
        categories_collection = get_categories_collection()
        
        # Check if category already exists
        existing = await categories_collection.find_one({
            "name": category.name,
            "type": category.type
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")
        
        category_doc = ArtworkCategory(**category.model_dump())
        result = await categories_collection.insert_one(category_doc.model_dump(by_alias=True))
        
        return {
            "success": True,
            "category_id": str(result.inserted_id),
            "message": "Category created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Category creation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create category: {str(e)}")

@router.get("/categories", response_model=List[ArtworkCategory])
async def get_categories(
    type: Optional[str] = Query(None, description="Filter by category type: medium, style, or subject"),
    include_inactive: bool = Query(False, description="Include inactive categories")
):
    """Get all artwork categories, optionally filtered by type"""
    try:
        categories_collection = get_categories_collection()
        
        filter_query = {}
        if type:
            filter_query["type"] = type
        if not include_inactive:
            filter_query["is_active"] = True
        
        cursor = categories_collection.find(filter_query).sort("name", 1)
        categories_data = await cursor.to_list(length=100)
        
        categories = []
        for doc in categories_data:
            if '_id' in doc and isinstance(doc['_id'], ObjectId):
                doc['_id'] = str(doc['_id'])
            categories.append(ArtworkCategory(**doc))
        
        return categories
    except Exception as e:
        logger.error(f"Error getting categories: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get categories")

# Update the register_artwork_with_image endpoint to include categories and price
@router.post("/register-with-image")
async def register_artwork_with_image(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    royalty_percentage: int = Form(...),
    price: float = Form(...),
    medium_category: str = Form(...),
    style_category: str = Form(...),
    subject_category: str = Form(...),
    other_medium: Optional[str] = Form(None),
    other_style: Optional[str] = Form(None),
    other_subject: Optional[str] = Form(None),
    ai_model: str = Form("gemini-1.5-flash"),
    registration_method: str = Form("on-chain"),  # NEW: "on-chain" or "off-chain" (replaces payment_method)
    responsible_use_addon: bool = Form(False),    # ✅ ADDED
    # PSL Smart-Ticket fields (Hackathon Demo)
    is_psl_ticket: Optional[str] = Form(None),    # "true" or None
    psl_seat_number: Optional[str] = Form(None),
    psl_stand: Optional[str] = Form(None),
    psl_venue: Optional[str] = Form(None),
    psl_match_date: Optional[str] = Form(None),
    psl_match_time: Optional[str] = Form(None),
    image: UploadFile = File(...),
    network: str = Form("solana"),  # ✅ MANDATORY: Platform is now Solana-only
    current_user: dict = Depends(get_current_user)
):
    try:
        # ✅ MANDATORY: Platform is now Solana-only
        if network.lower() not in ["solana"]:
            raise HTTPException(status_code=400, detail=f"Network '{network}' is no longer supported. Please use 'solana'.")

        current_fee = await get_current_global_fee()
        is_psl_ticket_flag = str(is_psl_ticket).lower() == "true"

        # ✅ Check for PSL ticket authorization
        if is_psl_ticket_flag:
            user_email = current_user.get("email", "").lower()
            authorized_issuers = [email.strip().lower() for email in settings.AUTHORIZED_PSL_ISSUERS if email.strip()]
            
            if user_email not in authorized_issuers:
                logger.warning(f"🚫 Unauthorized PSL ticket attempt: {user_email}")
                raise HTTPException(
                    status_code=403, 
                    detail="Unauthorized to issue PSL Smart-Tickets. Only authorized PCB accounts can perform this action."
                )
            logger.info(f"✅ Authorized PSL issuer detected: {user_email}")

            if registration_method != "on-chain":
                raise HTTPException(
                    status_code=400,
                    detail="PSL Smart-Tickets can only be registered on-chain."
                )

            missing_psl_fields = []
            if not (psl_seat_number or "").strip():
                missing_psl_fields.append("psl_seat_number")
            if not (psl_stand or "").strip():
                missing_psl_fields.append("psl_stand")
            if not (psl_venue or "").strip():
                missing_psl_fields.append("psl_venue")
            if not (psl_match_date or "").strip():
                missing_psl_fields.append("psl_match_date")
            if not (psl_match_time or "").strip():
                missing_psl_fields.append("psl_match_time")

            if missing_psl_fields:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required PSL ticket fields: {', '.join(missing_psl_fields)}"
                )

        if not 0 <= royalty_percentage <= 2000:
            raise HTTPException(status_code=400, detail="Royalty must be between 0-2000 basis points")
        
        if price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")

        image_data = await image.read()
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image file too large (max 10MB)")

        # AI validations removed as per user request
        logger.info("Skipping AI validations (duplicate check and AI classification)...")
        # duplicate_result = await ImageProcessor.check_duplicates(image_data)
        # if duplicate_result.is_duplicate:
        #     return { ... }
        # ai_result = await ImageProcessor.classify_ai_content(image_data, ai_model)
        # if ai_result.is_ai_generated:
        #     return { ... }

        # Step 3: Process and store image
        logger.info("Processing image...")
        processed_image_data = await ImageProcessor.process_image(image_data)
        
        # ✅ NEW: Apply Forensic Watermark (Creator Tag)
        # This ensures the "Master" version on IPFS/GridFS is permanently traceable
        try:
            logger.info("Applying forensic watermark (Creator Tag)...")
            creator_payload = {
                "ca": current_user.get("wallet_address") or current_user.get("email"),
                "net": network,
                "ts": datetime.utcnow().isoformat()
            }
            watermarked_data = WatermarkService.embed_robust_signature(
                processed_image_data, 
                creator_payload,
                strength=25 # Higher strength for master copy to survive redistribution
            )
            processed_image_data = watermarked_data
            logger.info("✅ Forensic watermark (Creator Tag) applied successfully")
        except Exception as e:
            logger.error(f"❌ Failed to apply forensic watermark: {e}")
            # We continue even if watermarking fails to ensure the user can still register
        
        # Step 4: Store binary image in GridFS
        logger.info("Storing image binary...")
        gridfs_id = await ImageProcessor.store_image_binary(
            processed_image_data, 
            image.filename, 
            image.content_type
        )
        
        # Extract responsible_use_addon (already processed by FastAPI from Form)
        # We use the value directly from parameter
        
        # Step 5: Upload to IPFS (attempt, but don't fail if it doesn't work)
        image_ipfs_uri = None
        try:
            logger.info("Uploading to IPFS...")
            image_ipfs_uri = await IPFSService.upload_to_ipfs(processed_image_data, image.filename)
        except Exception as e:
            logger.warning(f"IPFS upload failed, continuing with binary storage: {str(e)}")

        # Step 6: Create image metadata - FIXED: Ensure all hashes are stored properly
        image_metadata = {
            "filename": image.filename,
            "file_hash": ImageProcessor.get_file_hash(processed_image_data),
            "perceptual_hash": ImageProcessor.get_perceptual_hash(processed_image_data),
            "embedding": [], # AI embedding removed
            "gridfs_id": gridfs_id,
            "content_type": image.content_type or "image/jpeg",
            "file_size": len(processed_image_data),
            "uploaded_at": datetime.utcnow()
        }

        # FIXED: Add validation logging
        logger.info(f"Image metadata created:")
        logger.info(f"  - File hash: {image_metadata['file_hash'][:16]}...")
        logger.info(f"  - Perceptual hash: {image_metadata['perceptual_hash']}")
        logger.info(f"  - Embedding length: {len(image_metadata['embedding'])}")

        if registration_method == "on-chain":
            logger.info("Using on-chain registration - Preparing metadata for blockchain...")
            
            # Prepare metadata for IPFS
            metadata = {
                "name": title,
                "description": description,
                "image": image_ipfs_uri or f"data:image/binary;id={str(image_metadata.get('gridfs_id'))}",
                "attributes": {
                    "royalty_percentage": royalty_percentage,
                    "price": price,
                    "medium_category": medium_category,
                    "style_category": style_category,
                    "subject_category": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject,
                    "responsible_use_addon": responsible_use_addon,
                    "creator": current_user.get("wallet_address") or current_user.get("email"),
                    "created_at": datetime.utcnow().isoformat(),
                    "registration_method": "on-chain"
                }
            }

            metadata_bytes = json.dumps(metadata).encode('utf-8')
            metadata_uri = await IPFSService.upload_to_ipfs(metadata_bytes, "metadata.json")
            
            return {
                "status": "success",
                "registration_method": "on-chain",
                "metadata_uri": metadata_uri,
                "image_uri": image_ipfs_uri,
                "image_metadata": image_metadata,
                "royalty_percentage": royalty_percentage,
                "price": price,
                "categories": {
                    "medium": medium_category,
                    "style": style_category,
                    "subject": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject
                }
            }
        elif registration_method == "competition":
            logger.info("🏆 Using competition registration (Free) - Creating artwork record immediately")
            
            # Prepare metadata for IPFS
            metadata = {
                "name": title,
                "description": description,
                "image": image_ipfs_uri or f"data:image/binary;id={str(image_metadata.get('gridfs_id'))}",
                "attributes": {
                    "royalty_percentage": royalty_percentage,
                    "price": price,
                    "medium_category": medium_category,
                    "style_category": style_category,
                    "subject_category": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject,
                    "responsible_use_addon": responsible_use_addon,
                    "creator": current_user.get("email") or current_user.get("wallet_address"),
                    "created_at": datetime.utcnow().isoformat(),
                    "registration_method": "competition"
                }
            }

            metadata_bytes = json.dumps(metadata).encode('utf-8')
            metadata_uri = await IPFSService.upload_to_ipfs(metadata_bytes, "metadata.json")
            
            # Get collection and generate IDs
            db = get_db()
            artworks_collection = db.artworks
            token_id, display_id = await generate_token_id_and_display_id("competition", artworks_collection)
            
            # Create artwork in DB immediately
            artwork_doc = {
                "title": title,
                "description": description,
                "metadata_uri": metadata_uri,
                "image_uri": image_ipfs_uri,
                "image_metadata": image_metadata,
                "price": price,
                "token_id": token_id,
                "display_id": display_id,
                "royalty_percentage": royalty_percentage,
                "medium_category": medium_category,
                "style_category": style_category,
                "subject_category": subject_category,
                "other_medium": other_medium,
                "other_style": other_style,
                "other_subject": other_subject,
                "creator_id": str(current_user.get('id') or current_user.get('_id')),
                "owner_id": str(current_user.get('id') or current_user.get('_id')),
                "is_on_chain": False,
                "registration_method": "competition",
                "payment_method": "competition",
                "is_virtual_token": True,
                "status": "active",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "responsible_use_addon": responsible_use_addon,
                "network": "solana",
                "image_metadata_id": str(image_metadata.get('gridfs_id')),
                "has_fallback_image": True
            }
            
            await artworks_collection.insert_one(artwork_doc)
            artwork_id = str(artwork_doc.get('_id'))
            
            # ✅ Add to FAISS index for recommendations
            try:
                from app.api.v1.advance_search import add_artwork_to_faiss
                await add_artwork_to_faiss(artwork_id, artwork_doc)
            except Exception as e:
                logger.warning(f"⚠️ Failed to add competition artwork {artwork_id} to FFAISS index: {e}")

            # Invalidate cache
            try:
                invalidate_artworks_cache()
            except Exception as e:
                logger.warning(f"Failed to invalidate cache: {e}")

            return {
                "status": "success",
                "registration_method": "competition",
                "artwork_id": artwork_id,
                "display_id": display_id,
                "metadata_uri": metadata_uri,
                "image_uri": image_ipfs_uri,
                "image_metadata": image_metadata,
                "royalty_percentage": royalty_percentage,
                "price": price,
                "categories": {
                    "medium": medium_category,
                    "style": style_category,
                    "subject": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject
                }
            }
        
        else:
            # SOLANA MODE: Frontend builds/signs txns, backend returns metadata URI + fee info.
            logger.info("☀️ Solana registration mode detected")

            # ✅ Calculate registration fee
            try:
                platform_fee_percentage = await get_current_global_fee()
            except Exception as fee_error:
                logger.warning(f"⚠️ Failed to fetch global platform fee for Solana registration: {fee_error}")
                platform_fee_percentage = 2.5

            platform_fee_basis = max(0, int(round(float(platform_fee_percentage) * 100)))
            price_sol = float(price or 0)
            artwork_price_lamports = int(round(price_sol * 1_000_000_000)) if price_sol > 0 else 0
            registration_fee_lamports = (
                (artwork_price_lamports * platform_fee_basis) // 10000
                if artwork_price_lamports > 0 and platform_fee_basis > 0
                else 0
            )

            platform_address = (settings.SOLANA_PLATFORM_ADDRESS or "").strip()
            registration_payment_leg = None
            if registration_fee_lamports > 0:
                if not platform_address:
                    raise HTTPException(
                        status_code=500,
                        detail="SOLANA_PLATFORM_ADDRESS is missing while registration platform fee is enabled",
                    )

                registration_payment_leg = {
                    "to": platform_address,
                    "amount": registration_fee_lamports,
                    "purpose": "registration_platform_fee",
                }

            # PSL Smart-Ticket metadata (Hackathon Demo)
            psl_data = None
            if is_psl_ticket_flag:
                psl_data = {
                    "is_psl_ticket": True,
                    "seat_number": psl_seat_number,
                    "stand": psl_stand,
                    "venue": psl_venue,
                    "match_date": psl_match_date,
                    "match_time": psl_match_time
                }
                logger.info(f"🎫 PSL Ticket detected: {psl_data}")

            metadata = {
                "name": title,
                "description": description,
                "image": image_ipfs_uri or f"data:image/binary;id={str(gridfs_id)}",
                "attributes": {
                    "royalty_percentage": royalty_percentage,
                    "price": price,
                    "medium_category": medium_category,
                    "style_category": style_category,
                    "subject_category": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject,
                    "responsible_use_addon": responsible_use_addon,
                    "creator": current_user.get("wallet_address") or current_user.get("email"),
                    "created_at": datetime.utcnow().isoformat(),
                    "network": "solana",
                    "psl_ticket": psl_data
                }
            }

            metadata_bytes = json.dumps(metadata).encode('utf-8')
            metadata_uri = await IPFSService.upload_to_ipfs(metadata_bytes, "metadata.json")

            return {
                "status": "success",
                "registration_method": "on-chain",
                "network": "solana",
                "transaction_data": None, # Frontend will create the transaction
                "registration_fee_lamports": registration_fee_lamports,
                "platform_fee_percentage": float(platform_fee_percentage),
                "registration_payment_leg": registration_payment_leg,
                "metadata_uri": metadata_uri,
                "image_uri": image_ipfs_uri,
                "image_metadata": image_metadata,
                "royalty_percentage": royalty_percentage,
                "price": price,
                "responsible_use_addon": responsible_use_addon,
                "is_psl_ticket": is_psl_ticket_flag,
                "psl_metadata": psl_data,
                "categories": {
                    "medium": medium_category,
                    "style": style_category,
                    "subject": subject_category,
                    "other_medium": other_medium,
                    "other_style": other_style,
                    "other_subject": other_subject
                }
            }
        
    except Exception as e:
        logger.error(f"Registration with image failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

# Update the confirm_registration endpoint to include categories and price
@router.post("/confirm-registration")
async def confirm_registration(confirmation_data: dict, current_user: dict = Depends(get_current_user)):
    try:
        artworks_collection = get_artwork_collection()
        transactions_collection = get_transaction_collection()
        
        tx_hash = confirmation_data.get("tx_hash")
        if not tx_hash:
            raise HTTPException(status_code=400, detail="Transaction hash is required for confirmation")
        
        # ✅ FIX BUG 2: Solana signatures are case-sensitive base58! Only lowercase for EVM.
        network_hint = (confirmation_data.get("network") or "").lower()
        if network_hint not in ("solana", "algorand"):
            # ✅ FIX: Solana transaction hashes are case-sensitive Base58
            if network_hint != "solana":
                tx_hash = tx_hash.lower()

        # ✅ SECURITY: REPLAY PROTECTION
        # Check if this transaction has already been used for a successful registration
        existing_tx = await transactions_collection.find_one({
            "tx_hash": tx_hash,
            "transaction_type": "register",
            "status": "confirmed"
        })
        if existing_tx:
            logger.error(f"❌ Replay Attack Blocked: Hash {tx_hash} already used for registration.")
            raise HTTPException(
                status_code=400, 
                detail="This transaction hash has already been used for a registration."
            )

        # Check if artwork already exists with this hash
        existing_artwork_by_hash = await artworks_collection.find_one({"tx_hash": tx_hash})
        if existing_artwork_by_hash:
            logger.error(f"❌ Duplicate Registration Blocked: Hash {tx_hash} already exists in artworks.")
            raise HTTPException(
                status_code=400,
                detail="An artwork with this transaction hash is already registered."
            )

        # ✅ MANDATORY: Platform is now Solana-only
        network = (confirmation_data.get("network") or "solana").lower()
        # ✅ Force network to solana
        network = "solana"
        logger.info(f"🌐 Registration network: {network}")
        
        tx_hash = confirmation_data.get("tx_hash")
        if not tx_hash:
            raise HTTPException(status_code=400, detail="Transaction hash required")

        logger.info(f"☀️ Verifying Solana registration tx: {tx_hash}")
        
        from_address = (confirmation_data.get("from_address") or "").strip()
        expected_fee_lamports = 0
        try:
            raw_fee = confirmation_data.get("registration_fee_lamports")
            if raw_fee is not None:
                expected_fee_lamports = max(0, int(str(raw_fee)))
        except Exception:
            pass
        
        verification = await solana_service.verify_registration_receipt(
            tx_hash=tx_hash,
            expected_creator=from_address,
            expected_platform_lamports=expected_fee_lamports
        )
        
        if not verification.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Solana registration verification failed: {verification.get('error')}"
            )
        
        # Prefer frontend-provided mint address (from Metaplex minting) over auto-extracted
        frontend_mint = (confirmation_data.get("solana_mint_address") or "").strip()
        if frontend_mint:
            token_id = frontend_mint
            logger.info(f"✅ Using frontend-provided Solana mint address: {token_id}")
        else:
            token_id = verification.get("token_id")
        
        if not token_id:
            raise HTTPException(status_code=400, detail="Could not determine token ID from Solana transaction")
        
        logger.info(f"✅ Solana registration verified. Token ID: {token_id}")

        attributes = confirmation_data.get("attributes") or {}
        image_metadata = confirmation_data.get("image_metadata", {})
        
        categories_data = confirmation_data.get("categories", {})
        medium_category = categories_data.get("medium", "Other Medium")
        style_category = categories_data.get("style", "Other Style")
        subject_category = categories_data.get("subject", "Other Subject")
        other_medium = categories_data.get("other_medium")
        other_style = categories_data.get("other_style")
        other_subject = categories_data.get("other_subject")

        registration_method = "on-chain"
        is_on_chain = True
        
        # ✅ CREATE new artwork (normal registration flow)
        solana_address = (confirmation_data.get("from_address") or "").strip()
        effective_creator_address = solana_address or current_user.get('wallet_address')
        effective_owner_address = solana_address or current_user.get('wallet_address')
        
        current_fee = await get_current_global_fee()
        artwork = ArtworkInDB(
            token_id=token_id,
            creator_id=str(current_user.get('_id') or current_user.get('id')),
            owner_id=str(current_user.get('_id') or current_user.get('id')),
            creator_address=effective_creator_address,
            owner_address=effective_owner_address,
            metadata_uri=confirmation_data["metadata_uri"],
            royalty_percentage=confirmation_data["royalty_percentage"],
            price=confirmation_data["price"],
            title=confirmation_data.get("title"),
            description=confirmation_data.get("description"),
            medium_category=medium_category,
            style_category=style_category,
            subject_category=subject_category,
            other_medium=other_medium,
            other_style=other_style,
            other_subject=other_subject,
            responsible_use_addon=confirmation_data.get("responsible_use_addon", False),
            attributes=attributes,
            registration_method=registration_method,
            is_on_chain=is_on_chain,
            network=network,
            display_id=None,
            payment_method="crypto",
            is_virtual_token=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            tx_hash=tx_hash,
            platform_fee_percentage=current_fee,
            image_metadata=image_metadata,
            image_metadata_id=image_metadata.get("gridfs_id"),
            image_ipfs_uri=confirmation_data.get("image_uri"),
            has_fallback_image=True,
            creator_solana_address=effective_creator_address,
            owner_solana_address=effective_owner_address
        )

        result = await artworks_collection.insert_one(artwork.model_dump(by_alias=True))
        artwork_id = str(result.inserted_id)

        await UserHistoryService.log_user_action(
            user_id=str(current_user['id']),
            action="upload",
            artwork_id=artwork_id,
            artwork_token_id=token_id,
            metadata={
                "title": confirmation_data.get("title"),
                "price": confirmation_data.get("price"),
                "categories": confirmation_data.get("categories", {}),
                "payment_method": "crypto"
            }
        )

        # ✅ SECURITY: RECORD TRANSACTION TO PREVENT REPLAY
        try:
            await transactions_collection.insert_one({
                "tx_hash": tx_hash,
                "transaction_type": "REGISTER",
                "status": "CONFIRMED",
                "user_id": str(current_user.get('_id') or current_user.get('id')),
                "artwork_id": artwork_id,
                "network": network,
                "created_at": datetime.utcnow()
            })
            logger.info(f"✅ Transaction {tx_hash} recorded in Global Registry to prevent replay attacks.")
        except Exception as tx_record_error:
            logger.error(f"⚠️ FAILED TO RECORD TRANSACTION IN REGISTRY: {tx_record_error}")

        # ✅ Add artwork to FFAISS index for recommendations
        try:
            from app.api.v1.advance_search import add_artwork_to_faiss
            final_artwork = await artworks_collection.find_one({"_id": ObjectId(artwork_id)})
            if final_artwork:
                if "_id" in final_artwork and isinstance(final_artwork["_id"], ObjectId):
                    final_artwork['_id'] = str(final_artwork['_id'])
                await add_artwork_to_faiss(artwork_id, final_artwork)
        except Exception as e:
            logger.warning(f"⚠️ Failed to add artwork {artwork_id} to FFAISS index: {e}")

        # ✅ REDIS CACHE: Invalidate artwork cache after registration
        try:
            invalidate_artworks_cache()
            logger.info("🗑️ Artwork cache invalidated after registration")
        except Exception as cache_error:
            logger.warning(f"⚠️ Failed to invalidate cache: {cache_error}")

        return {
            "success": True, 
            "artwork_id": artwork_id, 
            "token_id": token_id,
            "is_update": False
        }
    except Exception as e:
        logger.error(f"Artwork confirmation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm artwork registration: {str(e)}")
    


# ============================================
# IMAGE PROTECTION UTILITIES
# ============================================

def resize_image_to_resolution(image_data: bytes, max_dimension: int, content_type: str = "image/jpeg", fast: bool = False) -> bytes:
    """
    Resize image to specified maximum dimension while maintaining aspect ratio.
    OPTIMIZED: Added 'fast' mode for thumbnails (BILINEAR + no optimization).
    """
    from io import BytesIO
    
    img = Image.open(BytesIO(image_data))
    width, height = img.size
    
    if width <= max_dimension and height <= max_dimension:
        return image_data
    
    if width > height:
        new_width = max_dimension
        new_height = int(height * (max_dimension / width))
    else:
        new_height = max_dimension
        new_width = int(width * (max_dimension / height))
    
    # Use BILINEAR for fast previews, LANCZOS for quality downloads
    resampling = Image.Resampling.BILINEAR if fast else Image.Resampling.LANCZOS
    img_resized = img.resize((new_width, new_height), resampling)
    
    output = BytesIO()
    if content_type == "image/png":
        img_resized.save(output, format="PNG", optimize=not fast)
    else:
        if img_resized.mode in ('RGBA', 'P'):
            img_resized = img_resized.convert('RGB')
        # Skip 'optimize=True' for fast mode as it's very CPU intensive
        img_resized.save(output, format="JPEG", quality=85, optimize=not fast)
    
    output.seek(0)
    return output.read()

# Image resolution constants
IMAGE_RES_LOW = 400      # Optimized for thumbnails (Fast loading)
IMAGE_RES_MEDIUM = 800   # Medium resolution for website display with token
IMAGE_RES_FULL = 2048    # Full resolution for owners/FULL_ACCESS licenses

# Watermark text constant
WATERMARK_TEXT = "XDRM protected"

# Thumbnail cache configuration
THUMBNAIL_CACHE_DIR = os.path.join("uploads", "thumbnails")
os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

# ✅ CONFIGURABLE: Watermark opacity (0-255)
# 0 = fully transparent, 255 = fully opaque
# Recommended values:
#   100 = ~39% - very subtle, barely visible
#   150 = ~59% - moderate visibility
#   180 = ~70% - clearly visible but not overwhelming (DEFAULT)
#   200 = ~78% - very prominent
#   230 = ~90% - extremely visible
WATERMARK_OPACITY = 180

# Cache for pre-rendered watermark tiles (key: font_size_opacity_text)
_watermark_tile_cache = {}


def apply_watermark(image_data: bytes, watermark_text: str = WATERMARK_TEXT, content_type: str = "image/jpeg") -> bytes:
    """
    Apply a semi-transparent watermark to an image.
    OPTIMIZED: Creates single rotated tile and tiles it across image.
    
    Args:
        image_data: Original image bytes
        watermark_text: Text to use as watermark (default: "XDRM protected")
        content_type: Image MIME type
        
    Returns:
        Watermarked image bytes
    """
    from io import BytesIO
    from PIL import ImageDraw, ImageFont
    
    try:
        img = Image.open(BytesIO(image_data))
        width, height = img.size
        
        # Convert to RGBA for transparency support
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Calculate font size based on image dimensions
        font_size = max(16, min(width, height) // 20)
        
        # Get or create cached watermark tile (includes opacity in key for live updates)
        cache_key = f"{font_size}_{WATERMARK_OPACITY}_{watermark_text}"
        if cache_key not in _watermark_tile_cache:
            # Create the rotated text tile once
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except:
                try:
                    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
                except:
                    font = ImageFont.load_default()
            
            # Create text image
            dummy_draw = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
            bbox = dummy_draw.textbbox((0, 0), watermark_text, font=font)
            text_width = bbox[2] - bbox[0] + 10
            text_height = bbox[3] - bbox[1] + 10
            
            txt_img = Image.new('RGBA', (text_width, text_height), (255, 255, 255, 0))
            txt_draw = ImageDraw.Draw(txt_img)
            txt_draw.text((5, 5), watermark_text, font=font, fill=(255, 255, 255, WATERMARK_OPACITY))
            
            # Rotate once
            rotated_tile = txt_img.rotate(30, expand=True, resample=Image.Resampling.BILINEAR)
            _watermark_tile_cache[cache_key] = rotated_tile
        
        tile = _watermark_tile_cache[cache_key]
        tile_w, tile_h = tile.size
        
        # Create overlay by tiling the pre-rotated watermark
        overlay = Image.new('RGBA', (width, height), (255, 255, 255, 0))
        
        # Tile spacing
        spacing_x = tile_w + 60
        spacing_y = tile_h + 40
        
        # Simple tiling with offset for alternating rows
        y = 0
        row = 0
        while y < height + tile_h:
            x = -tile_w if row % 2 == 0 else -tile_w // 2
            while x < width + tile_w:
                overlay.paste(tile, (int(x), int(y)), tile)
                x += spacing_x
            y += spacing_y
            row += 1
        
        # Composite the watermark onto the original image
        img = Image.alpha_composite(img, overlay)
        
        # Convert back to RGB for JPEG output
        output = BytesIO()
        if content_type == "image/png":
            img.save(output, format="PNG", optimize=True)
        else:
            img = img.convert('RGB')
            img.save(output, format="JPEG", quality=85, optimize=True)
        
        output.seek(0)
        return output.read()
        
    except Exception as e:
        logger.error(f"Error applying watermark: {e}", exc_info=True)
        # Return original image if watermarking fails
        return image_data



# ✅ NEW: Get image access token
@router.get("/{artwork_identifier}/image-token")
async def get_image_token(artwork_identifier: str):
    """Generate a short-lived token for image access (5 min expiry)."""
    from app.core.security import create_image_token
    from app.utils.artwork import resolve_artwork_identifier
    
    try:
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        real_token_id = artwork.get("token_id")
        artwork_db_id = str(artwork.get("_id"))
        
        # Use token_id if available, fallback to DB _id
        token = create_image_token(real_token_id or artwork_db_id, expires_minutes=5)
        
        return {
            "token": token,
            "expires_in": 300,
            "image_url": f"/api/v1/artwork/{artwork_identifier}/image?token={token}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating image token: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate image token")


# ✅ MODIFIED: Get artwork image with multi-resolution protection
@router.get("/{artwork_identifier}/image")
async def get_artwork_image(artwork_identifier: str, request: Request, token: Optional[str] = None):
    """
    Get artwork image with resolution based on access method:
    - Social Media Bots: 800px medium resolution (for high-quality previews)
    - With valid token: 800px medium resolution (for website display)
    - Without token: 400px low resolution (fallback)
    """
    from app.core.security import verify_image_token
    from app.utils.artwork import resolve_artwork_identifier
    
    try:
        # Detect Social Media Bots
        user_agent = request.headers.get("user-agent", "").lower()
        is_bot = any(bot in user_agent for bot in ["facebookexternalhit", "linkedinbot", "twitterbot", "slackbot", "whatsapp"])
        
        # Get artwork info
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found for image")
        
        real_token_id = artwork_doc.get("token_id")
        artwork_db_id = str(artwork_doc.get("_id"))

        # Determine resolution and watermark
        if is_bot:
            target_resolution = IMAGE_RES_MEDIUM # 800px for Social Media
            apply_wm = False
            logger.info(f"🤖 Bot detected ({user_agent}) - serving {IMAGE_RES_MEDIUM}px preview")
        elif token and verify_image_token(token, real_token_id or artwork_db_id):
            target_resolution = IMAGE_RES_MEDIUM  # 800px for valid token
            apply_wm = False
            logger.info(f"🖼️ Image request with VALID TOKEN - serving {IMAGE_RES_MEDIUM}px")
        else:
            target_resolution = IMAGE_RES_LOW  # 400px for no/invalid token
            apply_wm = True
            logger.info(f"🖼️ Image request with NO TOKEN - serving {IMAGE_RES_LOW}px (watermarked)")
        
        artworks_collection = get_artwork_collection()
        
        # ✅ FIX: Use resolved artwork doc for all logic
        if artwork_doc:
            payment_method = artwork_doc.get("payment_method", "crypto")
            is_virtual_token = artwork_doc.get("is_virtual_token", False)
            
            # Use cached or metadata from doc instead of re-querying blockchain
            # This is safer and faster during migration
            logger.info(f"✅ Using resolved artwork_doc: {artwork_db_id}")
        else:
            logger.warning(f"❌ Artwork not found for identifier: {artwork_identifier}")
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        # Check if fallback image exists and has GridFS ID
        has_fallback = artwork_doc.get("has_fallback_image")
        
        logger.info(f"✅ Artwork found for token_id: {real_token_id}, _id: {artwork_doc.get('_id')}")
        
        # Check if fallback image exists and has GridFS ID
        has_fallback = artwork_doc.get("has_fallback_image")
        image_metadata_id = artwork_doc.get("image_metadata_id")
        
        logger.info(f"📸 Image metadata check - has_fallback_image: {has_fallback}, image_metadata_id: {image_metadata_id}")
        
        if not has_fallback or not image_metadata_id:
            logger.warning(f"❌ No fallback image available for artwork: {artwork_identifier} - has_fallback_image: {has_fallback}, image_metadata_id: {image_metadata_id}")
            raise HTTPException(status_code=404, detail="No fallback image available")
        
        fs = get_gridfs()
        gridfs_id = artwork_doc["image_metadata_id"]
        
        logger.info(f"📦 Attempting to retrieve GridFS file with ID: {gridfs_id}")
        
        try:
            # Convert string ID back to ObjectId for GridFS
            from bson import ObjectId
            
            # Add validation for ObjectId format
            if not ObjectId.is_valid(gridfs_id):
                logger.error(f"❌ Invalid ObjectId format: {gridfs_id}")
                raise HTTPException(status_code=500, detail="Invalid image storage ID format")
                
            gridfs_object_id = ObjectId(gridfs_id)
            logger.info(f"✅ Valid ObjectId, attempting to open GridFS stream...")
            
            grid_out = await fs.open_download_stream(gridfs_object_id)
            image_data = await grid_out.read()
            content_type = grid_out.metadata.get("content_type", "image/jpeg")
            
            logger.info(f"✅ Successfully retrieved image from GridFS - size: {len(image_data)} bytes, content_type: {content_type}")
            
            # ✅ NEW: Resize image based on access level
            original_size = len(image_data)
            image_data = resize_image_to_resolution(image_data, target_resolution, content_type)
            logger.info(f"🔄 Image resized to {target_resolution}px - original: {original_size} bytes, resized: {len(image_data)} bytes")
            
            # ✅ Apply watermark ONLY for bypass attempts (no valid token)
            if apply_wm:
                image_data = apply_watermark(image_data, WATERMARK_TEXT, content_type)
                logger.info(f"🔒 Watermark applied to image (bypass protection)")
            else:
                logger.info(f"✅ Clean image served (valid token)")
            
            from fastapi.responses import Response
            return Response(
                content=image_data,
                media_type=content_type,
                headers={
                    "Cache-Control": "private, max-age=300" if target_resolution == IMAGE_RES_MEDIUM else "public, max-age=3600",
                    "Content-Disposition": f"inline; filename=artwork_{real_token_id or artwork_db_id}.jpg",
                    "Vary": "Origin",
                    "X-Image-Resolution": f"{target_resolution}px",
                    "X-Watermarked": "true" if apply_wm else "false"
                }
            )
        except Exception as e:
            logger.error(f"❌ Failed to retrieve image for artwork {artwork_identifier} from GridFS: {str(e)}", exc_info=True)
            raise HTTPException(status_code=404, detail=f"Image not found in storage: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting artwork image {artwork_identifier}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get artwork image")


# ✅ NEW: Licensed image endpoint - serves image based on user's license
@router.get("/{artwork_id}/licensed-image")
async def get_licensed_artwork_image(
    artwork_id: str,
    request: Request,
    auth: Optional[str] = None
):
    """
    Get artwork image based on user's license level.
    
    Access levels:
    - OWNER: Full quality, no watermark
    - FULL_ACCESS: Full quality, no watermark
    - ACCESS_WITH_WM: Medium quality (800px) with watermark
    - LINK_ONLY: Medium quality (800px) with watermark
    - EXPIRED: Returns 403 with "License Expired" message
    - NO_ACCESS: Returns 403
    
    Supports auth query parameter OR Authorization Bearer header.
    """
    from services.license_access_service import LicenseAccessService, ACCESS_OWNER, ACCESS_FULL, ACCESS_WATERMARK, ACCESS_LINK_ONLY, ACCESS_NONE, ACCESS_EXPIRED
    from jose import jwt, JWTError
    from app.core.config import settings
    
    try:
        user = None
        token_to_decode = None
        
        # Try auth query parameter first (for direct browser access)
        if auth:
            token_to_decode = auth
            logger.info("Using auth query parameter")
        else:
            # Try Authorization header
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token_to_decode = auth_header.replace("Bearer ", "")
                logger.info("Using Authorization header")
        
        if token_to_decode:
            try:
                payload = jwt.decode(token_to_decode, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
                # JWT contains all the info we need - no database lookup required
                user_id_from_token = payload.get("user_id")
                if user_id_from_token:
                    # ✅ Extract wallet address with network fallbacks (to match security.get_current_user)
                    wallet_address = (
                        payload.get("solana_wallet_address") or 
                        payload.get("algorand_wallet_address") or 
                        payload.get("wallet_address")
                    )
                    
                    user = {
                        "id": user_id_from_token,
                        "_id": user_id_from_token,
                        "wallet_address": wallet_address,
                        "solana_wallet_address": payload.get("solana_wallet_address"),
                        "email": payload.get("sub")
                    }
                    logger.info(f"✅ Auth successful for user: {user_id_from_token} (Wallet: {wallet_address})")
            except jwt.ExpiredSignatureError:
                logger.warning("Auth token expired")
                raise HTTPException(status_code=401, detail="Token expired")
            except JWTError as e:
                logger.warning(f"Invalid auth token: {e}")
                raise HTTPException(status_code=401, detail="Invalid token")
            except Exception as e:
                logger.error(f"Failed to decode auth token: {e}", exc_info=True)
                raise HTTPException(status_code=401, detail="Authentication failed")
        
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        user_id = str(user.get('id') or user.get('_id') or user.get('user_id') or '')
        wallet_address = user.get('wallet_address')
        
        # Resolve artwork to handle both int and str identifiers
        from app.utils.artwork import resolve_artwork_identifier
        artwork_doc = await resolve_artwork_identifier(artwork_id)
        if not artwork_doc:
            logger.warning(f"❌ Artwork {artwork_id} not found during image request")
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        real_token_id = artwork_doc.get("token_id")
        artwork_db_id = str(artwork_doc.get("_id"))

        # Get access level for this user on this artwork
        access_level, license_doc = await LicenseAccessService.get_access_level(
            user_id, artwork_doc, wallet_address
        )
        
        logger.info(f"🔑 Licensed image access for artwork_id: {artwork_id} (Token: {real_token_id}), user: {user_id}, level: {access_level}")
        
        # Handle expired license - block access
        if access_level == ACCESS_EXPIRED:
            raise HTTPException(
                status_code=403, 
                detail="License expired. Please renew your license to access this artwork."
            )
        
        # Handle no access
        if access_level == ACCESS_NONE:
            raise HTTPException(
                status_code=403, 
                detail="No valid license found. Please purchase a license to access this artwork."
            )
        
        # Determine resolution and watermark based on access level
        if access_level in [ACCESS_OWNER, ACCESS_FULL]:
            target_resolution = IMAGE_RES_FULL
            apply_wm = False
            logger.info(f"📸 Access level: {access_level} - FULL quality, NO watermark")
        elif access_level in [ACCESS_WATERMARK, ACCESS_LINK_ONLY]:
            target_resolution = IMAGE_RES_MEDIUM
            apply_wm = True
            logger.info(f"📸 Access level: {access_level} - MEDIUM quality, WITH watermark")
        else:
            target_resolution = IMAGE_RES_LOW
            apply_wm = True
            logger.info(f"📸 Access level: {access_level} - LOW quality, WITH watermark")
        
        # Artwork already resolved above
        # No need to re-query
        
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        # Check for fallback image
        has_fallback = artwork_doc.get("has_fallback_image")
        image_metadata_id = artwork_doc.get("image_metadata_id")
        
        if not has_fallback or not image_metadata_id:
            raise HTTPException(status_code=404, detail="No image available for this artwork")
        
        # Get image from GridFS
        fs = get_gridfs()
        
        from bson import ObjectId
        if not ObjectId.is_valid(image_metadata_id):
            raise HTTPException(status_code=500, detail="Invalid image storage ID")
        
        grid_out = await fs.open_download_stream(ObjectId(image_metadata_id))
        image_data = await grid_out.read()
        content_type = grid_out.metadata.get("content_type", "image/jpeg")
        
        original_size = len(image_data)
        logger.info(f"📸 Original image size: {original_size} bytes")
        
        # Resize image
        image_data = resize_image_to_resolution(image_data, target_resolution, content_type)
        logger.info(f"📸 After resize: {len(image_data)} bytes, resolution: {target_resolution}px")
        
        # Apply watermark if needed
        if apply_wm:
            logger.info(f"🔖 Applying watermark: {WATERMARK_TEXT}")
            image_data = apply_watermark(image_data, WATERMARK_TEXT, content_type)
            logger.info(f"🔖 After watermark: {len(image_data)} bytes")
        
        from fastapi.responses import Response
        return Response(
            content=image_data,
            media_type=content_type,
            headers={
                "Cache-Control": "private, max-age=300",
                "Content-Disposition": f"inline; filename=artwork_{real_token_id or artwork_id}.jpg",
                "X-Image-Resolution": f"{target_resolution}px",
                "X-Access-Level": access_level,
                "X-Watermarked": "true" if apply_wm else "false"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting licensed artwork image {artwork_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get artwork image")


# ✅ NEW: Get low-res thumbnail with disk caching
@router.get("/{artwork_identifier}/thumbnail")
async def get_artwork_thumbnail(
    artwork_identifier: str, 
    request: Request,
    auth: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get a low-resolution (400px) watermarked thumbnail.
    Uses disk caching for high performance and reduced server load.
    Owners and licensed holders see clean versions.
    """
    try:
        # 1. Resolve auth token if provided via query param
        user = current_user
        if not user and auth:
            from app.core.security import decode_token
            try:
                payload = decode_token(auth)
                if payload:
                    user = {
                        "id": payload.get("user_id"),
                        "_id": payload.get("user_id"),
                        "wallet_address": payload.get("solana_wallet_address") or payload.get("algorand_wallet_address") or payload.get("wallet_address")
                    }
            except Exception as auth_err:
                logger.warning(f"Failed to decode auth token in thumbnail: {auth_err}")
                pass

        # 2. Resolve artwork to get unique ID
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        artwork_db_id = str(artwork_doc.get("_id"))
        
        # 3. Check ownership to decide on watermarking
        is_owner = False
        if user:
            user_id = str(user.get('id') or user.get('_id') or user.get('user_id') or '')
            wallet_address = user.get('wallet_address')
            from services.license_access_service import LicenseAccessService
            is_owner = await LicenseAccessService.is_artwork_owner(user_id, artwork_identifier, wallet_address)
            
        # 4. Determine cache key based on watermark status
        # We cache clean thumbnails separately to avoid serving them to the public
        suffix = "_clean" if is_owner else ""
        cache_filename = f"thumb_{artwork_db_id}{suffix}.jpg"
        cache_path = os.path.join(THUMBNAIL_CACHE_DIR, cache_filename)
        
        if os.path.exists(cache_path):
            return FileResponse(
                cache_path, 
                media_type="image/jpeg", 
                headers={
                    "Cache-Control": "private, max-age=86400" if is_owner else "public, max-age=86400",
                    "X-Thumbnail-Cache": "HIT",
                    "X-Is-Owner": "true" if is_owner else "false"
                }
            )
            
        # 3. Cache MISS - Load original from GridFS
        image_metadata_id = artwork_doc.get("image_metadata_id")
        if not image_metadata_id:
            # Fallback to get_artwork_image logic if metadata_id is missing
            return await get_artwork_image(artwork_identifier, request)
            
        fs = get_gridfs()
        try:
            gridfs_object_id = ObjectId(image_metadata_id)
            grid_out = await fs.open_download_stream(gridfs_object_id)
            image_data = await grid_out.read()
            content_type = grid_out.metadata.get("content_type", "image/jpeg")
        except Exception as grid_err:
            logger.error(f"GridFS read failed for thumbnail {artwork_db_id}: {grid_err}")
            return await get_artwork_image(artwork_identifier, request)
        
        # 4. Resize to low resolution (400px) - FAST mode
        image_data = resize_image_to_resolution(image_data, IMAGE_RES_LOW, content_type, fast=True)
        
        # 5. Apply standard watermark ONLY if not the owner
        if not is_owner:
            image_data = apply_watermark(image_data, WATERMARK_TEXT, content_type)
            logger.info(f"🔖 Applied watermark to thumbnail for {artwork_db_id}")
        else:
            logger.info(f"🔓 Serving CLEAN thumbnail to owner: {artwork_db_id}")
        
        # 6. Save to disk cache for future requests
        try:
            with open(cache_path, "wb") as f:
                f.write(image_data)
            logger.info(f"✅ Generated and cached thumbnail for {artwork_db_id}")
        except Exception as save_err:
            logger.warning(f"⚠️ Failed to write thumbnail cache: {save_err}")
            
        return Response(
            content=image_data,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "private, max-age=86400" if is_owner else "public, max-age=86400",
                "X-Thumbnail-Cache": "MISS",
                "X-Is-Owner": "true" if is_owner else "false"
            }
        )
        
    except Exception as e:
        logger.error(f"Thumbnail generation failed for {artwork_identifier}: {e}")
        # Fallback to original image serving
        return await get_artwork_image(artwork_identifier, request)


# ✅ NEW: Licensed download endpoint - allows full download for FULL_ACCESS licenses
@router.get("/{token_id}/licensed-download")
async def download_licensed_artwork(
    token_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Download original artwork file (for OWNER or FULL_ACCESS license holders only).
    """
    from services.license_access_service import LicenseAccessService, ACCESS_OWNER, ACCESS_FULL, ACCESS_EXPIRED
    
    try:
        user_id = str(current_user.get('id') or current_user.get('_id') or current_user.get('user_id') or '')
        wallet_address = current_user.get('wallet_address')
        
        # Get access level
        access_level, license_doc = await LicenseAccessService.get_access_level(
            user_id, token_id, wallet_address
        )
        
        logger.info(f"⬇️ Download request for token_id: {token_id}, user: {user_id}, level: {access_level}")
        
        # Only allow download for OWNER or FULL_ACCESS
        if access_level == ACCESS_EXPIRED:
            raise HTTPException(
                status_code=403,
                detail="License expired. Please renew your license to download this artwork."
            )
        
        if access_level not in [ACCESS_OWNER, ACCESS_FULL]:
            raise HTTPException(
                status_code=403,
                detail="Download requires Full Access license. Please upgrade your license to download."
            )
        
        # Resolve artwork to handle both int and str identifiers
        from app.utils.artwork import resolve_artwork_identifier
        artwork_doc = await resolve_artwork_identifier(token_id)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        real_token_id = artwork_doc.get("token_id")

        # Get access level
        access_level, license_doc = await LicenseAccessService.get_access_level(
            user_id, token_id, wallet_address
        )
        
        image_metadata_id = artwork_doc.get("image_metadata_id")
        if not image_metadata_id:
            raise HTTPException(status_code=404, detail="No image available for download")
        
        # Get original image from GridFS
        fs = get_gridfs()
        
        from bson import ObjectId
        grid_out = await fs.open_download_stream(ObjectId(image_metadata_id))
        image_data = await grid_out.read()
        content_type = grid_out.metadata.get("content_type", "image/jpeg")
        
        # Get artwork title for filename
        title = artwork_doc.get("title", f"artwork_{token_id}")
        # Sanitize filename
        import re
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
        extension = "png" if content_type == "image/png" else "jpg"
        
        from fastapi.responses import Response
        return Response(
            content=image_data,
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={safe_title}.{extension}",
                "X-Access-Level": access_level
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading artwork {token_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to download artwork")
    
# ✅ Enhanced List artworks (unchanged core logic, but enhanced public model)
@router.get("/", response_model=ArtworkListResponse)
async def list_artworks(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    creator_address: Optional[str] = None,
    owner_address: Optional[str] = None,
    is_on_chain: Optional[bool] = Query(None, description="Filter by on-chain status: true for on-chain, false for competition"),
    is_psl_ticket: Optional[bool] = Query(None, description="Filter by PSL Smart-Ticket status: true for tickets only"),
    registration_method: Optional[str] = Query(None, description="Filter by registration method: 'on-chain' or 'competition'"),
):
    try:
        # ✅ REDIS CACHE: Step 1 - Generate cache key from request parameters
        cache_filters = {
            "cache_version": "artwork_list_v2_psl_from_artworks",
            "page": page,
            "size": size,
            "creator": creator_address,
            "owner": owner_address,
            "owner": owner_address,
            "chain": is_on_chain,
            "is_psl_ticket": is_psl_ticket,
            "registration": registration_method
        }
        
        # ✅ REDIS CACHE: Step 2 - Try to get from cache first
        cached_response = get_artworks_cache(cache_filters)
        if cached_response:
            logger.info(f"⚡ REDIS CACHE HIT - Returning cached artworks (page {page})")
            return ArtworkListResponse(**cached_response)
        
        logger.info(f"💨 REDIS CACHE MISS - Fetching from database (page {page})")
        
        artworks_collection = get_artwork_collection()

        # Base filter for standard artworks - EXCLUDES PSL unless PSL filter is requested
        # ✅ MANDATORY FILTER: Only show Solana artworks in the Explorer
        filter_query = {
            "token_id": {"$ne": None, "$exists": True},
            "network": "solana",
            "$or": [
                {"is_for_sale": True},
                {"is_for_sale": {"$exists": False}}
            ]
        }

        if is_psl_ticket:
            # PSL filter must fetch from artworks collection and return PSL-only records.
            filter_query["is_psl_ticket"] = True
            logger.info("🎫 Explorer using artworks collection with is_psl_ticket=true")
        else:
            filter_query["is_psl_ticket"] = {"$ne": True}
        
        users_collection = get_user_collection()
        
        # ✅ Filter by explicit registration method (competition, etc.)
        if registration_method:
            filter_query["registration_method"] = registration_method
            logger.info(f"🔍 Appended registration_method filter: {registration_method}")
        
        # ✅ Filter by on-chain status (NEW - preferred method)
        if is_on_chain is not None and not is_psl_ticket:
            if is_on_chain:
                # On-chain artworks: must be on blockchain
                filter_query["$and"] = filter_query.get("$and", []) + [
                    {
                        "$or": [
                            {"is_on_chain": True},
                            {"registration_method": "on-chain"},
                            {"creator_address": {"$ne": None, "$exists": True}}
                        ]
                    }
                ]
                logger.info("🔍 Appended on-chain filter to query")
            else:
                # Non-blockchain artworks (Competition)
                filter_query["$and"] = filter_query.get("$and", []) + [
                    {"registration_method": "competition"}
                ]
                logger.info("🔍 Appended competition filter to query")
        
        if creator_address:
            filter_query["creator_address"] = normalize_blockchain_address(creator_address)
        if owner_address:
            filter_query["owner_address"] = normalize_blockchain_address(owner_address)
            
        # ✅ Add PSL Ticket filter (Hackathon Demo)
        if is_psl_ticket:
            logger.info("🎫 Filtering PSL tickets from artworks collection")

        total = await artworks_collection.count_documents(filter_query)
        has_next = (page * size) < total
        skip = (page - 1) * size

        cursor = artworks_collection.find(filter_query).skip(skip).limit(size).sort("created_at", -1)
        artworks_data = await cursor.to_list(length=size)

        # ✅ OPTIMIZATION: Batch fetch all user IDs first (fixes N+1 query problem)
        creator_ids = set()
        owner_ids = set()
        valid_artworks_docs = []
        
        skipped_count = 0
        filtered_out_count = 0
        
        for doc in artworks_data:
            # ✅ Skip artworks with null or missing token_id (except PSL tickets which might be unminted)
            if not is_psl_ticket and doc.get("token_id") is None:
                logger.warning(f"Skipping artwork with null token_id: {doc.get('_id')}")
                skipped_count += 1
                continue
            
            # ✅ Additional validation: Double-check filter criteria (safety check)
            if is_on_chain is not None and not is_psl_ticket:
                doc_is_on_chain = doc.get("is_on_chain")
                doc_registration_method = doc.get("registration_method")
                # Determine if artwork is actually on-chain
                is_actually_on_chain = doc_is_on_chain if doc_is_on_chain is not None else (doc_registration_method == "on-chain")
                
                # Filter out artworks that don't match the requested filter
                if is_on_chain and not is_actually_on_chain:
                    logger.warning(f"🚫 Filtered out competition artwork from on-chain results: {doc.get('_id')}")
                    filtered_out_count += 1
                    continue
                elif not is_on_chain and is_actually_on_chain:
                    logger.warning(f"🚫 Filtered out on-chain artwork from competition results: {doc.get('_id')}")
                    filtered_out_count += 1
                    continue
            
            try:
                # UPDATED: Use validate_document method to handle missing fields
                artwork_db_model = ArtworkInDB.validate_document(doc)
                
                # ✅ Collect user IDs for batch lookup
                if artwork_db_model.creator_id:
                    creator_ids.add(str(artwork_db_model.creator_id))
                if artwork_db_model.owner_id:
                    owner_ids.add(str(artwork_db_model.owner_id))
                
                valid_artworks_docs.append((doc, artwork_db_model))
            except Exception as e:
                logger.error(f"Failed to validate artwork {doc.get('_id', 'unknown')} (token_id: {doc.get('token_id')}): {e}", exc_info=True)
                skipped_count += 1
                continue
        
        # ✅ OPTIMIZATION: Batch fetch all users at once (single query instead of N queries)
        user_cache = {}
        all_user_ids = creator_ids | owner_ids
        
        if all_user_ids:
            # Build queries for different ID formats
            object_id_queries = []
            string_id_queries = []
            user_id_queries = []
            
            for user_id_str in all_user_ids:
                if ObjectId.is_valid(user_id_str):
                    object_id_queries.append(ObjectId(user_id_str))
                string_id_queries.append(user_id_str)
                user_id_queries.append(user_id_str)
            
            # Execute batch queries in parallel
            user_fetch_tasks = []
            if object_id_queries:
                user_fetch_tasks.append(users_collection.find({"_id": {"$in": object_id_queries}}).to_list(length=len(object_id_queries)))
            if string_id_queries:
                user_fetch_tasks.append(users_collection.find({"_id": {"$in": string_id_queries}}).to_list(length=len(string_id_queries)))
            if user_id_queries:
                user_fetch_tasks.append(users_collection.find({"user_id": {"$in": user_id_queries}}).to_list(length=len(user_id_queries)))
            
            if user_fetch_tasks:
                user_results = await asyncio.gather(*user_fetch_tasks)
                # Combine all results and build cache
                for user_list in user_results:
                    for user in user_list:
                        user_id_key = str(user.get("_id"))
                        if user_id_key not in user_cache:
                            user_cache[user_id_key] = user
                        # Also cache by user_id field
                        if user.get("user_id"):
                            user_cache[str(user.get("user_id"))] = user
        
        # ✅ Process artworks with cached user data
        artworks = []
        for doc, artwork_db_model in valid_artworks_docs:
            try:
                artwork_public = ArtworkPublic.from_db_model(artwork_db_model)
                artwork_dict = artwork_public.model_dump()
                
                # ✅ Use cached user data instead of individual queries
                if artwork_db_model.creator_id:
                    creator_id_str = str(artwork_db_model.creator_id)
                    creator_user = user_cache.get(creator_id_str)
                    if creator_user:
                        artwork_dict["creator_name"] = creator_user.get('full_name') or creator_user.get('username') or "Unknown"
                        artwork_dict["creator_email"] = creator_user.get('email') or None
                
                if artwork_db_model.owner_id:
                    owner_id_str = str(artwork_db_model.owner_id)
                    owner_user = user_cache.get(owner_id_str)
                    if owner_user:
                        artwork_dict["owner_name"] = owner_user.get('full_name') or owner_user.get('username') or "Unknown"
                        artwork_dict["owner_email"] = owner_user.get('email') or None
                
                # ✅ SECURITY: Scrub sensitive asset URIs and PRIVACY: Scrub PII for ALL listings
                # Redacting everything except display-critical fields for public privacy.
                artwork_dict["metadata_uri"] = None
                artwork_dict["image_uri"] = None
                artwork_dict["creator_email"] = None
                artwork_dict["owner_email"] = None
                artwork_dict["creator_id"] = None 
                artwork_dict["owner_id"] = None
                
                artworks.append(ArtworkPublic(**artwork_dict))
            except Exception as e:
                logger.error(f"Failed to process artwork {doc.get('_id', 'unknown')} (token_id: {doc.get('token_id')}): {e}", exc_info=True)
                skipped_count += 1
                continue
        
        # ✅ Log skipped artworks for debugging
        if skipped_count > 0:
            logger.warning(f"⚠️ Skipped {skipped_count} artwork(s) due to validation errors or null token_id. Expected: {len(artworks_data)}, Got: {len(artworks)}")
        if filtered_out_count > 0:
            logger.warning(f"🚫 Filtered out {filtered_out_count} artwork(s) that didn't match filter criteria (is_on_chain={is_on_chain})")

        # ✅ REDIS CACHE: Step 3 - Build response
        response = ArtworkListResponse(
            artworks=artworks,
            total=total,
            page=page,
            size=size,
            has_next=has_next
        )
        
        # ✅ REDIS CACHE: Step 4 - Cache the response for 5 minutes (300 seconds)
        try:
            set_artworks_cache(cache_filters, response.model_dump(), ttl=300)
            logger.info(f"💾 Cached response for page {page} (TTL: 5 min)")
        except Exception as cache_error:
            # Don't fail if caching fails - just log it
            logger.warning(f"⚠️ Failed to cache response: {cache_error}")
        
        return response
    except Exception as e:
        logger.error(f"Error listing artworks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list artworks"
        )

# ✅ OPTIMIZED: Get artwork counts by on-chain status (only listed for sale)
@router.get("/counts")
async def get_artwork_counts():
    """Get count of artworks by on-chain status - only counts artworks listed for sale"""
    try:
        # ✅ OPTIMIZATION: Check cache first
        cached_counts = get_cached_counts()
        if cached_counts:
            logger.debug("📊 Returning cached artwork counts")
            return cached_counts
        
        artworks_collection = get_artwork_collection()
        
        # ✅ Base filter: Only artworks listed for sale (same as list_artworks endpoint)
        base_sale_filter = {
            "$or": [
                {"is_for_sale": True},  # Explicitly listed for sale
                {"is_for_sale": {"$exists": False}}  # Legacy artworks (never listed, show by default)
            ]
        }
        
        base_filter = {
            "$and": [
                {"token_id": {"$ne": None, "$exists": True}},
                {"network": "solana"},
                base_sale_filter
            ]
        }
        
        # ✅ OPTIMIZATION: Use aggregation pipeline for all counts in parallel (much faster)
        pipeline = [
            {"$match": base_filter},
            {
                "$facet": {
                    "total": [{"$count": "count"}],
                    "on_chain": [
                        {"$match": {"is_on_chain": True}},
                        {"$count": "count"}
                    ],
                    "off_chain": [
                        {"$match": {"is_on_chain": False}},
                        {"$count": "count"}
                    ],
                    "competition": [
                        {"$match": {"registration_method": "competition"}},
                        {"$count": "count"}
                    ],
                    "psl": [
                        {"$match": {"is_psl_ticket": True}},
                        {"$count": "count"}
                    ]
                }
            }
        ]
        
        # Execute aggregation pipeline (single query instead of 5 separate queries)
        result = await artworks_collection.aggregate(pipeline).to_list(length=1)
        
        if result and len(result) > 0:
            facets = result[0]
            total_count = facets["total"][0]["count"] if facets["total"] else 0
            on_chain_count = facets["on_chain"][0]["count"] if facets["on_chain"] else 0
            off_chain_count = facets["off_chain"][0]["count"] if facets["off_chain"] else 0
            competition_count = facets["competition"][0]["count"] if facets["competition"] else 0
            psl_count = facets["psl"][0]["count"] if facets["psl"] else 0
        else:
            # Fallback to individual counts if aggregation fails
            total_count = await artworks_collection.count_documents(base_filter)
            on_chain_count = await artworks_collection.count_documents({
                "$and": [base_filter, {"is_on_chain": True}]
            })
            off_chain_count = await artworks_collection.count_documents({
                "$and": [base_filter, {"is_on_chain": False}]
            })
            competition_count = await artworks_collection.count_documents({
                "$and": [base_filter, {"registration_method": "competition"}]
            })
            psl_count = await artworks_collection.count_documents({
                "$and": [base_filter, {"is_psl_ticket": True}]
            })

        # PSL count now comes from artworks collection only.
        psl_count = await artworks_collection.count_documents({
            "$and": [base_filter, {"is_psl_ticket": True}]
        })
        
        counts = {
            "total": total_count,
            "on_chain": on_chain_count,
            "off_chain": off_chain_count,
            "competition": competition_count,
            "psl": psl_count
        }
        
        # ✅ Cache the results
        set_cached_counts(counts)
        
        # ✅ Debug: Log counts for troubleshooting
        logger.info(f"📊 Artwork counts - Total: {total_count}, On-chain: {on_chain_count}, Competition: {competition_count}")
        
        return counts
    except Exception as e:
        logger.error(f"Error getting artwork counts: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get artwork counts"
        )



# ✅ Secure Metadata Endpoint (Selective Disclosure)
@router.get("/{artwork_identifier}/metadata")
async def get_artwork_metadata(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user)
):
    """Securely retrieve metadata_uri for authorized users only (Creator, Owner, or Licensee)"""
    try:
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        user_id = str(current_user.get("id") or current_user.get("_id") or "")
        creator_id = str(artwork_doc.get("creator_id") or "")
        owner_id = str(artwork_doc.get("owner_id") or "")
        
        is_authorized = False
        if user_id == creator_id or user_id == owner_id:
            is_authorized = True
        else:
            # ✅ SECURITY: Verify specific permission 'access_to_original' for licensee
            is_authorized = await license_access_service.verify_license_access(
                user_id=user_id,
                artwork_identifier=str(artwork_doc.get("_id")),
                permission_key="access_to_original"
            )
                
        if not is_authorized:
            logger.warning(f"🚫 Unauthorized metadata access attempt for artwork {artwork_identifier} by user {user_id}")
            raise HTTPException(
                status_code=403, 
                detail="Access denied. You must be the creator, owner, or have an active license to view metadata."
            )
            
        return {
            "artwork_id": str(artwork_doc.get("_id")),
            "token_id": artwork_doc.get("token_id"),
            "metadata_uri": artwork_doc.get("metadata_uri"),
            "image_uri": artwork_doc.get("image_ipfs_uri") or artwork_doc.get("image_uri")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving metadata for artwork {artwork_identifier}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metadata")

# Line 2783 - Update the get_artwork endpoint:
@router.get("/{artwork_identifier}", response_model=ArtworkPublic)
async def get_artwork(
    artwork_identifier: str,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    try:
        # Get artwork info
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        token_id = artwork_doc.get("token_id")
        artwork_id = str(artwork_doc.get("_id"))
        
        # Γ£à Check if the identifier was uniquely resolved via MongoDB _id
        # If so, we strictly trust this document and won't let token_id logic overwrite it later
        was_uniquely_resolved = (
            isinstance(artwork_identifier, str) and 
            (ObjectId.is_valid(artwork_identifier) or artwork_identifier == artwork_id)
        )

        # ✅ REDIS CACHE: Step 1 - Try to get from cache using artwork_id (string)
        cached_response = get_artwork_cache(artwork_id)
        
        # Γ£à Self-Healing: Invalidate cache if it contains the wrong document (collision detection)
        if cached_response and was_uniquely_resolved:
            cached_id = str(cached_response.get("_id") or cached_response.get("id") or "")
            if cached_id and cached_id != artwork_id:
                logger.warning(f"ΓÜá∩╕Å Cache Collision Detected! Expected {artwork_id}, got {cached_id}. Invalidating cache.")
                invalidate_artwork_cache(artwork_id)
                cached_response = None

        if cached_response:
            logger.info(f"Γzipped_flash REDIS CACHE HIT - Returning cached artwork {artwork_id}")
            return ArtworkPublic(**cached_response)
        
        logger.info(f"💨 REDIS CACHE MISS - Fetching artwork {artwork_id} from database")
        
        users_collection = get_user_collection()
        artworks_collection = get_artwork_collection()
        blockchain_data = None
        
        # ✅ Use resolved artwork doc
        if artwork_doc:
            payment_method = artwork_doc.get("payment_method", "crypto")
            is_virtual_token = artwork_doc.get("is_virtual_token", False)
            network_name = (artwork_doc.get("network") or "").lower()
            is_algorand_artwork = network_name == "algorand"
            is_solana_artwork = network_name == "solana"
            
            logger.info(f"✅ Found artwork {artwork_id} with payment_method: {payment_method}")
            
            # ✅ Only query blockchain for crypto artworks (not PayPal, competition, or off-chain)
            is_off_chain = (
                payment_method in ["paypal", "competition"] or 
                is_virtual_token or 
                artwork_doc.get("registration_method") in ["off-chain", "competition"] or
                artwork_doc.get("is_on_chain") is False
            )
            
            if not is_off_chain:
                try:
                    # ✅ Solana-only architecture
                    blockchain_data = await solana_service.get_nft_metadata_detailed(token_id)
                    
                    if blockchain_data:
                        logger.info(f"✅ Retrieved blockchain data for token {token_id} from {network_name}")
                except Exception as e:
                    logger.debug(f"Could not fetch blockchain data for token {token_id} on {network_name}: {e}")

        # ✅ If we have blockchain data AND we weren't uniquely resolved yet, try to match precisely
        if blockchain_data and not was_uniquely_resolved:
            # ✅ Skip .lower() for case-sensitive networks
            if is_solana_artwork or is_algorand_artwork:
                creator_address = blockchain_data.get("creator")
            else:
                creator_address = blockchain_data.get("creator", "").lower() if blockchain_data.get("creator") else None
                
            metadata_uri = blockchain_data.get("metadata_uri")
            
            if creator_address or metadata_uri:
                query = {"token_id": token_id}
                if creator_address:
                    if is_solana_artwork or is_algorand_artwork:
                        query["creator_address"] = creator_address
                    else:
                        query["creator_address"] = {"$regex": f"^{creator_address}$", "$options": "i"}
                
                if metadata_uri:
                    query["metadata_uri"] = metadata_uri
                
                matched_doc = await artworks_collection.find_one(query)
                if matched_doc:
                    logger.info(f"✅ Matched artwork {token_id} using blockchain data")
                    artwork_doc = matched_doc
                else:
                    # Fallback: try with just creator_address
                    if creator_address:
                        fallback_query = {"token_id": token_id}
                        if is_solana_artwork or is_algorand_artwork:
                            fallback_query["creator_address"] = creator_address
                        else:
                            fallback_query["creator_address"] = {"$regex": f"^{creator_address}$", "$options": "i"}
                            
                        matched_doc = await artworks_collection.find_one(fallback_query)
                        if matched_doc:
                            artwork_doc = matched_doc
                            logger.info(f"✅ Matched artwork {token_id} using creator fallback")
                        else:
                            logger.warning(f"⚠️ Could not match artwork {token_id} with blockchain data, keeping original resolved doc")
        
        # ✅ If no match found, get the most recent artwork with this token_id
        if not artwork_doc:
            artwork_doc = await artworks_collection.find_one(
                {"token_id": token_id},
                sort=[("created_at", -1)]  # Most recent first
            )
            if artwork_doc:
                logger.info(f"✅ Using most recent artwork for token {token_id}")
        
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")

        # UPDATED: Use validate_document to handle missing fields
        artwork = ArtworkInDB.validate_document(artwork_doc)
        artwork_public = ArtworkPublic.from_db_model(artwork)
        
        # ✅ Fetch creator and owner user information for PayPal artworks
        artwork_dict = artwork_public.model_dump()
        
        logger.info(f"📦 Artwork data from database for token {token_id}: token_id={artwork_dict.get('token_id')}, title={artwork_dict.get('title')}, price={artwork_dict.get('price')}, owner_address={artwork_dict.get('owner_address')}, owner_id={artwork_dict.get('owner_id')}, creator_address={artwork_dict.get('creator_address')}, creator_id={artwork_dict.get('creator_id')}, payment_method={artwork_dict.get('payment_method')}, is_for_sale={artwork_dict.get('is_for_sale')}")
        
        # Fetch creator user info
        if artwork.creator_id:
            creator_user = None
            creator_id_str = str(artwork.creator_id)
            
            # Try multiple lookup methods
            if ObjectId.is_valid(creator_id_str):
                creator_user = await users_collection.find_one({"_id": ObjectId(creator_id_str)})
            if not creator_user:
                creator_user = await users_collection.find_one({"_id": creator_id_str})
            if not creator_user:
                creator_user = await users_collection.find_one({"user_id": creator_id_str})
            
            if creator_user:
                artwork_dict["creator_name"] = creator_user.get('full_name') or creator_user.get('username') or "Unknown"
                artwork_dict["creator_email"] = creator_user.get('email') or None
                logger.info(f"✅ Found creator user info for token {token_id}: {artwork_dict.get('creator_name')}")
            else:
                logger.warning(f"⚠️ Creator user not found for creator_id: {creator_id_str}")
        
        # Fetch owner user info
        if artwork.owner_id:
            owner_user = None
            owner_id_str = str(artwork.owner_id)
            
            # Try multiple lookup methods
            if ObjectId.is_valid(owner_id_str):
                owner_user = await users_collection.find_one({"_id": ObjectId(owner_id_str)})
            if not owner_user:
                owner_user = await users_collection.find_one({"_id": owner_id_str})
            if not owner_user:
                owner_user = await users_collection.find_one({"user_id": owner_id_str})
            
            if owner_user:
                artwork_dict["owner_name"] = owner_user.get('full_name') or owner_user.get('username') or "Unknown"
                artwork_dict["owner_email"] = owner_user.get('email') or None
                logger.info(f"✅ Found owner user info for token {token_id}: {artwork_dict.get('owner_name')}")
            else:
                logger.warning(f"⚠️ Owner user not found for owner_id: {owner_id_str}")
        
        # ✅ SECURITY: PROTECT METADATA URI
        # Only show metadata_uri to: Creator, Owner, or Licensee
        show_metadata = False
        user_id = str(current_user.get("id") or current_user.get("_id") or "") if current_user else None
        
        if user_id:
            creator_id = str(artwork_doc.get("creator_id") or "")
            owner_id = str(artwork_doc.get("owner_id") or "")
            
            # Check if user is creator or owner
            if user_id == creator_id or user_id == owner_id:
                show_metadata = True
            else:
                # ✅ SECURITY: Verify specific permission 'access_to_original' for licensee
                show_metadata = await license_access_service.verify_license_access(
                    user_id=user_id,
                    artwork_identifier=str(artwork_doc.get("_id")),
                    permission_key="access_to_original"
                )
                    
        # ✅ Check if it's a competition artwork
        is_competition = (
            artwork_doc.get("registration_method") == "competition" or 
            artwork_doc.get("is_competition_entry") is True
        )
            
        if not show_metadata:
            artwork_dict["metadata_uri"] = None
            artwork_dict["image_uri"] = None
            
            # ✅ PRIVACY: Hide emails from unauthorized users (GDPR compliance)
            # EXCEPT for competition artworks - show them as requested by user
            if not is_competition:
                artwork_dict["creator_email"] = None
                artwork_dict["owner_email"] = None
                logger.info(f"🔒 Sensitive assets and PII hidden for artwork {token_id} (unauthorized viewer)")
            else:
                logger.info(f"🏆 Competition artwork: disclosing identities for token {token_id}")
        else:
            logger.info(f"🔓 Asset URIs disclosed for artwork {token_id} (authorized viewer: {user_id})")
            
            # Ensure image_uri is populated from the most reliable field
            if not artwork_dict.get("image_uri"):
                artwork_dict["image_uri"] = artwork_doc.get("image_ipfs_uri") or artwork_doc.get("image_uri")

        result = ArtworkPublic(**artwork_dict)
        
        # ✅ REDIS CACHE: Step 2 - Cache the response for 5 minutes (300 seconds)
        try:
            # ✅ Cache by unique artwork_id, not token_id
            set_artwork_cache(artwork_id, result.model_dump(), ttl=300)
            logger.info(f"💾 Cached artwork {token_id} (TTL: 5 min)")
        except Exception as cache_error:
            # Don't fail if caching fails - just log it
            logger.warning(f"⚠️ Failed to cache artwork {token_id}: {cache_error}")
        
        logger.info(f"✅ Returning artwork data for token {token_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting artwork {token_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get artwork")

# ✅ List and Delist endpoints (placed before generic {token_id} route to avoid conflicts)
from pydantic import BaseModel

class ListForSaleRequest(BaseModel):
    price: float

@router.post("/{artwork_identifier}/list-for-sale")
async def list_artwork_for_sale(
    artwork_identifier: str,
    request: ListForSaleRequest,
    current_user: dict = Depends(get_current_user)
):
    """List an owned artwork for resale"""
    try:
        from app.utils.artwork import resolve_artwork_identifier
        artworks_collection = get_artwork_collection()
        
        # 1. Verify Ownership
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        # ✅ Check wallet address match (handle None values)
        owner_address = artwork.get("owner_address") or ""
        user_wallet = current_user.get("wallet_address") or ""
        
        is_owner_wallet = (
            owner_address and user_wallet and
            normalize_blockchain_address(owner_address) == normalize_blockchain_address(user_wallet)
        )
        
        # ✅ Check user ID match (fallback for PayPal users)
        current_user_id = str(current_user.get("id") or current_user.get("_id") or "")
        artwork_owner_id = str(artwork.get("owner_id", ""))
        is_owner_id = artwork_owner_id and current_user_id and artwork_owner_id == current_user_id
        
        if not (is_owner_wallet or is_owner_id):
            logger.warning(f"❌ Ownership check failed - User: {current_user_id}, Artwork owner_id: {artwork_owner_id}, Artwork owner_address: {owner_address}, User wallet: {user_wallet}")
            raise HTTPException(status_code=403, detail="Only the owner can list this artwork")

        # ✅ NEW: Check if artwork is off-chain (PayPal) - if yes, require onboarding
        is_on_chain = artwork.get("is_on_chain")
        if is_on_chain is None:
            payment_met = artwork.get("payment_method", "crypto")
            is_virtual_token = artwork.get("is_virtual_token", False)
            is_on_chain = not (payment_met == "paypal" or is_virtual_token)
        
        if not is_on_chain:
            from bson import ObjectId
            db = get_db()
            sellers_collection = db.sellers
            users_collection = get_user_collection()
            
            owner_is_onboarded = False
            owner_merchant_id = None
            
            owner_seller = await sellers_collection.find_one(
                {
                    "user_id": current_user_id,
                    "onboarded": True,
                    "merchant_id": {"$ne": None, "$exists": True}
                },
                sort=[("updated_at", -1)]
            )
            
            if owner_seller:
                owner_merchant_id = owner_seller.get('merchant_id')
                owner_is_onboarded = True
            else:
                lookup_queries = []
                if ObjectId.is_valid(current_user_id):
                    lookup_queries.append({"_id": ObjectId(current_user_id)})
                lookup_queries.extend([{"_id": current_user_id}, {"user_id": current_user_id}, {"id": current_user_id}])
                
                for query in lookup_queries:
                    try:
                        owner_user = await users_collection.find_one(query)
                        if owner_user:
                            owner_merchant_id = owner_user.get('paypal_merchant_id')
                            owner_is_onboarded = owner_user.get('paypal_onboarded', False)
                            if owner_is_onboarded and owner_merchant_id:
                                break
                    except: continue
            
            if not owner_is_onboarded or not owner_merchant_id:
                raise HTTPException(
                        status_code=400,
                        detail="PayPal onboarding is required to list artwork for sale."
                    )

        # 2. Update Database
        if request.price <= 0:
             raise HTTPException(status_code=400, detail="Price must be greater than 0")

        await artworks_collection.update_one(
            {"_id": artwork["_id"]},
            {
                "$set": {
                    "is_for_sale": True,
                    "price": request.price,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Artwork {artwork.get('token_id', artwork_identifier)} listed for sale at {request.price} by {current_user_id}")
        
        try:
            invalidate_artworks_cache()
            if artwork.get("_id") is not None:
                invalidate_artwork_cache(str(artwork["_id"]))
                invalidate_blockchain_cache(artwork.get("token_id"))
        except: pass

        return {"success": True, "message": "Artwork listed for sale successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list artwork: {e}")
        raise HTTPException(status_code=500, detail="Failed to list artwork")
        
# Add this endpoint to handle de-listing artworks
@router.post("/{artwork_identifier}/delist")
async def delist_artwork(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove an artwork from sale"""
    try:
        from app.utils.artwork import resolve_artwork_identifier
        artworks_collection = get_artwork_collection()
        
        # 1. Verify Ownership
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        # ✅ Check wallet address match or user ID match
        owner_address = artwork.get("owner_address") or ""
        user_wallet = current_user.get("wallet_address") or ""
        
        is_owner_wallet = (
            owner_address and user_wallet and
            normalize_blockchain_address(owner_address) == normalize_blockchain_address(user_wallet)
        )
        
        current_user_id = str(current_user.get("id") or current_user.get("_id") or "")
        artwork_owner_id = str(artwork.get("owner_id", ""))
        is_owner_id = artwork_owner_id and current_user_id and artwork_owner_id == current_user_id
        
        if not (is_owner_wallet or is_owner_id):
            raise HTTPException(status_code=403, detail="Only the owner can de-list this artwork")

        # 2. Update Database
        await artworks_collection.update_one(
            {"_id": artwork["_id"]},
            {
                "$set": {
                    "is_for_sale": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Artwork {artwork.get('token_id', artwork_identifier)} de-listed by {current_user_id}")
        
        try:
            invalidate_artworks_cache()
            if artwork.get("_id") is not None:
                invalidate_artwork_cache(str(artwork["_id"]))
                invalidate_blockchain_cache(artwork.get("token_id"))
        except: pass
        
        return {"success": True, "message": "Artwork removed from sale"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delist artwork: {e}")
        raise HTTPException(status_code=500, detail="Failed to delist artwork")

from pydantic import BaseModel

class ListForSaleRequest(BaseModel):
    price: float

@router.post("/{artwork_identifier}/list-for-sale-legacy")
async def list_artwork_for_sale_redundant(
    artwork_identifier: str,
    request: ListForSaleRequest,
    current_user: dict = Depends(get_current_user)
):
    """List an owned artwork for resale (Redundant implementation)"""
    try:
        from app.utils.artwork import resolve_artwork_identifier
        artworks_collection = get_artwork_collection()
        
        # 1. Verify Ownership
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        # Check wallet address match
        is_owner_wallet = (
            normalize_blockchain_address(artwork.get("owner_address", "")) == 
            normalize_blockchain_address(current_user.get("wallet_address", ""))
        )
        
        # Check user ID match (fallback for PayPal users)
        current_user_id = str(current_user.get("id") or current_user.get("_id") or "")
        is_owner_id = str(artwork.get("owner_id", "")) == current_user_id
        
        if not (is_owner_wallet or is_owner_id):
            raise HTTPException(status_code=403, detail="Only the owner can list this artwork")

        # 2. Update Database
        if request.price <= 0:
             raise HTTPException(status_code=400, detail="Price must be greater than 0")

        await artworks_collection.update_one(
            {"_id": artwork["_id"]},
            {
                "$set": {
                    "is_for_sale": True,
                    "price": request.price,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Artwork {artwork.get('token_id', artwork_identifier)} listed for sale by {current_user_id}")
        
        return {"success": True, "message": "Artwork listed for sale successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list artwork: {e}")
        raise HTTPException(status_code=500, detail="Failed to list artwork")
        
# Add this endpoint to handle de-listing artworks
@router.post("/{artwork_identifier}/delist-legacy")
async def delist_artwork_redundant(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove an artwork from sale (Redundant implementation)"""
    try:
        from app.utils.artwork import resolve_artwork_identifier
        artworks_collection = get_artwork_collection()
        
        # 1. Verify Ownership
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        # Check wallet address match or user ID match
        is_owner_wallet = (
            normalize_blockchain_address(artwork.get("owner_address", "")) == 
            normalize_blockchain_address(current_user.get("wallet_address", ""))
        )
        current_user_id = str(current_user.get("id") or current_user.get("_id") or "")
        is_owner_id = str(artwork.get("owner_id", "")) == current_user_id
        
        if not (is_owner_wallet or is_owner_id):
            raise HTTPException(status_code=403, detail="Only the owner can de-list this artwork")

        # 2. Update Database
        await artworks_collection.update_one(
            {"_id": artwork["_id"]},
            {
                "$set": {
                    "is_for_sale": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Artwork {artwork.get('token_id', artwork_identifier)} de-listed by {current_user_id}")
        
        return {"success": True, "message": "Artwork removed from sale"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delist artwork: {e}")
        raise HTTPException(status_code=500, detail="Failed to delist artwork")

@router.post("/classify-ai")
async def classify_image_ai(
    image: UploadFile = File(...),
    model: str = Form("gemini-2.5-flash"),
    current_user: dict = Depends(get_current_user)
):
    """Classify if an image is AI-generated before upload with timeout handling"""
    try:
        # Add early validation
        if not image.filename:
            raise HTTPException(status_code=400, detail="No image file provided")
            
        image_data = await image.read()
        if len(image_data) == 0:
            raise HTTPException(status_code=400, detail="Empty image file")
            
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image file too large (max 10MB)")

        # AI classification disabled
        return AIClassificationResult(
            is_ai_generated=False,
            confidence=0.0,
            description="AI classification disabled",
            model_used=model
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI classification failed: {str(e)}", exc_info=True)
        # Return a safe default instead of raising an error
        return AIClassificationResult(
            is_ai_generated=False,
            confidence=0.0,
            description=f"Classification failed: {str(e)[:100]}...",
            model_used=model
        )
    
@router.post("/check-duplicates")
async def check_image_duplicates(
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Check if an image is a duplicate before upload with timeout handling"""
    try:
        if not image.filename:
            raise HTTPException(status_code=400, detail="No image file provided")
            
        image_data = await image.read()
        if len(image_data) == 0:
            raise HTTPException(status_code=400, detail="Empty image file")
            
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image file too large (max 10MB)")

        # AI duplicate check disabled
        return DuplicateCheckResult(
            is_duplicate=False,
            message="Duplicate check disabled"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Duplicate check failed: {str(e)}", exc_info=True)
        return DuplicateCheckResult(
            is_duplicate=False,
            message=f"Duplicate check failed: {str(e)[:100]}..."
        )

# Fix 3: Add similar timeout handling to duplicate check
@staticmethod
async def check_duplicates(image_data: bytes) -> DuplicateCheckResult:
    """Check for duplicate images using multiple methods"""
    try:
        artworks_collection = get_artwork_collection()
        
        # 1. Exact hash check
        file_hash = ImageProcessor.get_file_hash(image_data)
        logger.info(f"Checking for exact duplicates with hash: {file_hash[:10]}...")
        
        existing = await artworks_collection.find_one({"image_metadata.file_hash": file_hash})
        if existing:
            logger.warning(f"Exact duplicate found: artwork {existing.get('_id')}")
            return DuplicateCheckResult(
                is_duplicate=True,
                duplicate_type="exact",
                similarity_score=1.0,
                existing_artwork_id=str(existing["_id"]),
                message="Exact duplicate found"
            )

        # 2. Perceptual hash check - FIXED: Use consistent hash format
        perceptual_hash = ImageProcessor.get_perceptual_hash(image_data)
        logger.info(f"Checking for perceptual duplicates with hash: {perceptual_hash[:10]}...")
        
        # Get all artworks with perceptual hashes
        cursor = artworks_collection.find({
            "image_metadata.perceptual_hash": {"$exists": True, "$ne": None}
        })
        
        # FIXED: Convert to list to avoid cursor issues
        existing_artworks = await cursor.to_list(length=1000)  # Limit for performance
        
        for doc in existing_artworks:
            if "image_metadata" in doc and "perceptual_hash" in doc["image_metadata"]:
                try:
                    stored_phash_str = doc["image_metadata"]["perceptual_hash"]
                    
                    # FIXED: Handle both string and hash object formats
                    if isinstance(stored_phash_str, str) and len(stored_phash_str) == len(perceptual_hash):
                        current_phash = imagehash.hex_to_hash(perceptual_hash)
                        stored_phash = imagehash.hex_to_hash(stored_phash_str)
                        distance = current_phash - stored_phash
                        
                        # FIXED: More lenient threshold for better detection
                        if distance <= 8:  # Increased from 5 to 8
                            logger.warning(f"Perceptual duplicate found: artwork {doc.get('_id')}, distance: {distance}")
                            return DuplicateCheckResult(
                                is_duplicate=True,
                                duplicate_type="perceptual",
                                similarity_score=1.0 - (distance / 64.0),
                                existing_artwork_id=str(doc["_id"]),
                                message=f"Perceptually similar image found (distance: {distance})"
                            )
                except Exception as e:
                    logger.warning(f"Error comparing perceptual hash: {e}")
                    continue

        # 3. AI embedding check - FIXED: More robust similarity check
        logger.info("Checking for AI embedding similarities...")
        embedding = get_embedding(image_data).tolist()
        
        # Get artworks with embeddings
        cursor = artworks_collection.find({
            "image_metadata.embedding": {"$exists": True, "$ne": None}
        })
        
        # FIXED: Convert to list to avoid cursor issues
        existing_artworks = await cursor.to_list(length=1000)
        
        for doc in existing_artworks:
            if "image_metadata" in doc and "embedding" in doc["image_metadata"]:
                try:
                    stored_emb = np.array(doc["image_metadata"]["embedding"])
                    
                    # FIXED: Validate embedding dimensions
                    if len(stored_emb) == len(embedding):
                        similarity = cosine_similarity(np.array(embedding), stored_emb)
                        
                        # FIXED: More reasonable threshold
                        if similarity >= 0.85:  # Reduced from 0.9 to 0.85
                            logger.warning(f"AI embedding duplicate found: artwork {doc.get('_id')}, similarity: {similarity}")
                            return DuplicateCheckResult(
                                is_duplicate=True,
                                duplicate_type="ai",
                                similarity_score=similarity,
                                existing_artwork_id=str(doc["_id"]),
                                message=f"AI-detected similar image found (similarity: {similarity:.3f})"
                            )
                except Exception as e:
                    logger.warning(f"Error comparing AI embedding: {e}")
                    continue

        logger.info("No duplicates found")
        return DuplicateCheckResult(
            is_duplicate=False,
            message="No duplicates found"
        )

    except Exception as e:
        logger.error(f"Duplicate check failed: {str(e)}", exc_info=True)
        # FIXED: Don't fail silently - return error but allow upload
        return DuplicateCheckResult(
            is_duplicate=False,
            message=f"Duplicate check failed: {str(e)} - Upload allowed with warning"
        )
    
@router.post("/{artwork_identifier}/view")
async def track_artwork_view(
    artwork_identifier: str,
    current_user: dict = Depends(get_current_user_optional)
):
    """Track when a user views an artwork details page"""
    try:
        artwork = await resolve_artwork_identifier(artwork_identifier)
        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        # Log view action
        user_id = str(current_user.get('id') or current_user.get('_id') or 'anonymous')
        artwork_id = str(artwork.get('_id'))
        
        await UserHistoryService.log_user_action(
            user_id=user_id,
            action="view",
            artwork_id=artwork_id,
            artwork_token_id=artwork.get("token_id"),
            metadata={
                "view_timestamp": datetime.utcnow().isoformat(),
                "artwork_title": artwork.get("title")
            }
        )
        
        return {"success": True, "message": "View tracked"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to track artwork view: {str(e)}")
        # Don't raise error for tracking failures
        return {"success": False, "message": "View tracking failed"}



# Line 3410 - Update the get_artwork_blockchain_info endpoint:
@router.get("/{artwork_identifier}/blockchain", response_model=dict)
async def get_artwork_blockchain_info(artwork_identifier: str, network: Optional[str] = None):
    """Get blockchain info with graceful fallbacks"""
    try:
        # ✅ REDIS CACHE: Step 1 - Try to get from cache first
        cache_identifier = f"{artwork_identifier}_{network}" if network else artwork_identifier
        cached_response = get_blockchain_cache(cache_identifier)
        if cached_response:
            logger.info(f"⚡ REDIS CACHE HIT - Returning cached blockchain info for {cache_identifier}")
            return cached_response
        
        logger.info(f"💨 REDIS CACHE MISS - Fetching blockchain info for {cache_identifier}")
        
        # Resolve artwork from database
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        
        if not artwork_doc:
            logger.warning(f"Artwork {artwork_identifier} not found in database")
            raise HTTPException(status_code=404, detail="Artwork not found in database")
            
        token_id = artwork_doc.get("token_id")
        artwork_id = str(artwork_doc.get("_id"))

        # ✅ CHECK: If artwork is PayPal-registered, skip blockchain queries
        payment_method = artwork_doc.get("payment_method", "crypto")
        is_virtual_token = artwork_doc.get("is_virtual_token", False)
        
        network_name = (artwork_doc.get("network") or network or "solana").lower()
        is_algorand_artwork = network_name == "algorand"

        is_off_chain = (
            payment_method in ["paypal", "competition"] or 
            is_virtual_token or 
            artwork_doc.get("registration_method") in ["off-chain", "competition"] or
            artwork_doc.get("is_on_chain") is False
        )

        if is_off_chain:
            logger.info(f"✅ Artwork {token_id} is off-chain ({payment_method}), returning database data only")
            # For PayPal artworks, return database data directly (no blockchain)
            response_data = {
                "token_id": token_id,
                "creator": artwork_doc.get("creator_address") or artwork_doc.get("creator_id", "Unknown"),
                "owner": artwork_doc.get("owner_address") or artwork_doc.get("owner_id", "Unknown"),
                "metadata_uri": artwork_doc.get("metadata_uri", ""),
                "royalty_percentage": artwork_doc.get("royalty_percentage", 0),
                "is_licensed": artwork_doc.get("is_licensed", False),
                "blockchain_status": "not_applicable",  # ✅ PayPal artworks don't use blockchain
                "source": "database",
                "payment_method": "paypal",
                "is_virtual_token": True
            }
            
            # ✅ REDIS CACHE: Cache PayPal artwork response (longer TTL since it doesn't change)
            try:
                set_blockchain_cache(artwork_identifier, response_data, ttl=600)  # 10 minutes for PayPal
                logger.info(f"💾 Cached blockchain info for PayPal artwork {artwork_identifier} (TTL: 10 min)")
            except Exception as cache_error:
                logger.warning(f"⚠️ Failed to cache blockchain info: {cache_error}")
            
            return response_data

        if is_algorand_artwork:
            logger.info(f"✅ Artwork {token_id} is Algorand-registered, fetching live Algorand chain data")

            asa_id = artwork_doc.get("algorand_asa_id") or token_id
            db_creator = artwork_doc.get("creator_algorand_address") or artwork_doc.get("creator_address") or "Unknown"
            db_owner = artwork_doc.get("owner_algorand_address") or artwork_doc.get("owner_address") or "Unknown"
            db_metadata_uri = artwork_doc.get("metadata_uri", "")

            chain_info = None
            chain_error = None
            try:
                from services.algorand_service import algorand_service
                chain_info = await algorand_service.get_asset_blockchain_info(asa_id)
                if not chain_info.get("success"):
                    chain_error = chain_info.get("error")
            except Exception as e:
                chain_error = str(e)
                logger.warning(f"⚠️ Failed to fetch live Algorand data for ASA {asa_id}: {e}")

            creator_value = chain_info.get("creator") if chain_info and chain_info.get("success") else None
            owner_value = chain_info.get("owner") if chain_info and chain_info.get("success") else None
            metadata_value = chain_info.get("metadata_uri") if chain_info and chain_info.get("success") else None

            response_data = {
                "token_id": token_id,
                "creator": creator_value or db_creator,
                "owner": owner_value or db_owner,
                "metadata_uri": metadata_value or db_metadata_uri,
                "royalty_percentage": artwork_doc.get("royalty_percentage", 0),
                "is_licensed": artwork_doc.get("is_licensed", False),
                "blockchain_status": "algorand",
                "source": "algorand_blockchain" if chain_info and chain_info.get("success") else "database",
                "network": "algorand",
                "algorand_asa_id": asa_id,
            }

            if chain_error:
                response_data["chain_warning"] = chain_error

            try:
                set_blockchain_cache(artwork_identifier, response_data, ttl=300)
                logger.info(f"💾 Cached blockchain info for Algorand artwork {artwork_identifier} (TTL: 5 min)")
            except Exception as cache_error:
                logger.warning(f"⚠️ Failed to cache blockchain info: {cache_error}")

            return response_data

        # ✅ Only query blockchain for crypto artworks
        logger.info(f"Artwork {token_id} is crypto-registered, querying blockchain...")

        # ✅ HANDLE PLACEHOLDERS: Skip blockchain query for Solana placeholders
        if isinstance(token_id, str) and token_id.startswith("sol_"):
            logger.info(f"ℹ️ Recognized Solana placeholder ID {token_id}. Using database as source of truth.")
            response_data = {
                "token_id": token_id,
                "creator": artwork_doc.get("creator_address", "Unknown"),
                "owner": artwork_doc.get("owner_address", "Unknown"),
                "metadata_uri": artwork_doc.get("metadata_uri", ""),
                "royalty_percentage": artwork_doc.get("royalty_percentage", 0),
                "is_licensed": artwork_doc.get("is_licensed", False),
                "blockchain_status": "placeholder",
                "source": "database_placeholder"
            }
            set_blockchain_cache(cache_identifier, response_data, ttl=300)
            return response_data

        # Try to get blockchain data with fallbacks
        artwork_info = None
        owner = None
        
        # ✅ Solana-only architecture
        try:
            blockchain_data = await solana_service.get_nft_metadata_detailed(token_id)
            if blockchain_data:
                owner = blockchain_data.get("owner")
                creator = blockchain_data.get("creator")
                metadata_uri = blockchain_data.get("metadata_uri")
                royalty_percentage = blockchain_data.get("royalty_percentage", artwork_doc.get("royalty_percentage", 0))
            else:
                owner = None
                creator = None
                metadata_uri = None
                royalty_percentage = artwork_doc.get("royalty_percentage", 0)
        except Exception as e:
            logger.warning(f"Failed to get Solana data for {token_id}: {e}")
            owner = None
            creator = None
            metadata_uri = None
            royalty_percentage = artwork_doc.get("royalty_percentage", 0)
        
        # If blockchain call failed, check if we have cached data in database
        if not owner and not creator:
            logger.warning(f"Solana blockchain call failed for token {token_id}")
            
            # Return database data as fallback
            response_data = {
                "token_id": token_id,
                "creator": artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address", "Unknown"),
                "owner": artwork_doc.get("owner_solana_address") or artwork_doc.get("owner_address", "Unknown"),
                "metadata_uri": artwork_doc.get("metadata_uri", ""),
                "royalty_percentage": artwork_doc.get("royalty_percentage", 0),
                "is_licensed": artwork_doc.get("is_licensed", False),
                "blockchain_status": "unavailable",
                "source": "database_fallback"
            }
            
            # ✅ REDIS CACHE: Cache fallback response (shorter TTL)
            try:
                set_blockchain_cache(artwork_identifier, response_data, ttl=60)  # 1 minute for fallback
                logger.info(f"💾 Cached fallback blockchain info for {artwork_identifier} (TTL: 1 min)")
            except Exception as cache_error:
                logger.warning(f"⚠️ Failed to cache blockchain info: {cache_error}")
            
            return response_data
        
        # If we have data, merge with database data
        creator = creator or artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address", "Unknown")
        metadata_uri = metadata_uri or artwork_doc.get("metadata_uri", "")
        royalty_percentage = artwork_info.get("royalty_percentage") if artwork_info else artwork_doc.get("royalty_percentage", 0)
        is_licensed = artwork_info.get("is_licensed") if artwork_info else artwork_doc.get("is_licensed", False)
        
        # Use the owner from blockchain if available, otherwise from database
        final_owner = owner if owner else artwork_doc.get("owner_address", "Unknown")
        
        response_data = {
            "token_id": token_id,
            "creator": creator,
            "owner": final_owner,
            "metadata_uri": metadata_uri,
            "royalty_percentage": royalty_percentage,
            "is_licensed": is_licensed,
            "blockchain_status": "partial" if not artwork_info or not owner else "full",
            "source": "mixed" if not artwork_info or not owner else "blockchain"
        }
        
        # ✅ REDIS CACHE: Step 2 - Cache the response for 3 minutes (180 seconds)
        try:
            set_blockchain_cache(artwork_identifier, response_data, ttl=180)
            logger.info(f"💾 Cached blockchain info for {artwork_identifier} (TTL: 3 min)")
        except Exception as cache_error:
            logger.warning(f"⚠️ Failed to cache blockchain info: {cache_error}")
        
        logger.info(f"Returning blockchain info for token {token_id}: {response_data}")
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting blockchain info for artwork {token_id}: {e}", exc_info=True)
        
        # Ultimate fallback - return minimal data
        return {
            "token_id": token_id,
            "creator": "Unknown",
            "owner": "Unknown",
            "metadata_uri": "",
            "royalty_percentage": 0,
            "is_licensed": False,
            "blockchain_status": "error",
            "source": "error_fallback"
        }

@router.put("/{artwork_identifier}")
async def update_artwork(
    artwork_identifier: str,
    artwork_update: ArtworkUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        token_id = artwork_doc.get("token_id")
        artwork_id = str(artwork_doc.get("_id"))
        artworks_collection = get_artwork_collection()

        # ✅ Validate and sanitize document (handles ObjectId to string conversion)
        ArtworkInDB.validate_document(artwork_doc)
        
        artwork = ArtworkInDB.model_validate(artwork_doc)
        
        # ✅ Broaden ownership check to support both crypto (wallet) and PayPal (owner_id)
        user_id = str(current_user.get('user_id') or current_user.get('id') or "")
        wallet_address = normalize_blockchain_address(current_user.get('wallet_address', ''))
        
        artwork_owner_id = str(artwork.owner_id) if artwork.owner_id else ""
        artwork_owner_address = normalize_blockchain_address(artwork.owner_address) if artwork.owner_address else ""
        
        is_owner = (
            (artwork_owner_address and artwork_owner_address == wallet_address) or
            (artwork_owner_id and artwork_owner_id == user_id)
        )
        
        if not is_owner:
            logger.warning(f"🚫 Ownership mismatch for artwork {artwork_identifier}: artwork(addr={artwork_owner_address}, id={artwork_owner_id}) vs user(addr={wallet_address}, id={user_id})")
            raise HTTPException(status_code=403, detail="Only owner can update artwork settings")

        update_data = artwork_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()

        # ✅ CRITICAL EXCLUSIVITY CHECK: Block listing for sale if an EXCLUSIVE license exists
        if update_data.get("is_for_sale") is True:
            db = get_db()
            licenses_collection = db.licenses
            exclusive_license = await licenses_collection.find_one({
                "$or": [{"token_id": token_id}, {"artwork_id": artwork_id}],
                "license_type": {"$in": ["EXCLUSIVE", "ARTWORK_OWNERSHIP"]},
                "status": {"$in": ["CONFIRMED", "PENDING"]},
                "is_active": True
            })
            if exclusive_license:
                logger.warning(f"🚫 Blocked relisting of artwork {token_id}: Active EXCLUSIVE license exists.")
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot list for sale: This artwork is already exclusively licensed to a buyer."
                )

        # ✅ PRESERVE ORIGINAL ID: Handle both ObjectId and string _ids flexibly
        raw_artwork_id = artwork_doc.get("_id") 
        artwork_id_str = str(raw_artwork_id)
        
        await artworks_collection.update_one({"_id": raw_artwork_id}, {"$set": update_data})
        
        # ✅ FIX: Reliable re-fetch (using preserved ID which handles both types)
        updated_doc = await artworks_collection.find_one({"_id": raw_artwork_id})
        
        # Fallback: check dedicated PSL collection (preserving original ID type)
        if not updated_doc:
            try:
                psl_collection = get_db()["psl_tickets"]
                updated_doc = await psl_collection.find_one({"_id": raw_artwork_id})
            except:
                pass
                
        # ✅ Ensure document was successfully retrieved after update
        if not updated_doc:
            logger.error(f"❌ Failed to retrieve updated artwork {artwork_id_str} from database after update attempt.")
            raise HTTPException(status_code=404, detail=f"Artwork document {artwork_id_str} not found after update. Verification failed.")
            
        # ✅ Validate and sanitize updated document
        ArtworkInDB.validate_document(updated_doc)
        
        updated_artwork = ArtworkInDB.model_validate(updated_doc)
        
        # ✅ REDIS CACHE: Invalidate artwork cache after update
        try:
            invalidate_artworks_cache()
            invalidate_artwork_cache(str(artwork_doc["_id"]))
            invalidate_blockchain_cache(artwork_identifier)
            logger.info("🗑️ Artwork cache invalidated after update")
        except Exception as cache_error:
            logger.warning(f"⚠️ Failed to invalidate cache: {cache_error}")
        
        return ArtworkPublic.from_db_model(updated_artwork)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating artwork {token_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update artwork")


# --- Test Contract Endpoint ---
@router.post("/test-contract", response_model=ContractCallResponse)
async def test_contract(request: ContractCallRequest):
    try:
        # ✅ Simulate contract call (replace with real Web3 logic later)
        result = {
            "function": request.function_name,
            "params": request.parameters,
            "from": request.from_address,
            "value": request.value
        }

        return ContractCallResponse(
            success=True,
            result=result,
            tx_hash="0x" + "abc123".ljust(64, "0")  # dummy tx hash
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/owner/{owner_identifier}", response_model=ArtworkListResponse)
async def get_artworks_by_owner(
    owner_identifier: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100)
):
    """
    Get artworks by owner - supports both user ID and wallet address
    ⚡ OPTIMIZED: Batch user lookups, exact match queries, database indexes
    """
    try:
        artworks_collection = get_artwork_collection()
        users_collection = get_user_collection()

        # Γ£à REDIS CACHE: Try to get from cache first
        cache_key = cache.cache_key("owner_artworks", owner=owner_identifier, page=page, size=size)
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Γzipped_flash REDIS CACHE HIT - Returning artworks for owner {owner_identifier}")
            return ArtworkListResponse(**cached_data)

        # Determine if identifier is a wallet address or user ID
        # EVM addresses are 0x prefixed and 42 chars. 
        # Solana and Algorand are alphanumeric and longer.
        is_evm_wallet = (
            owner_identifier.startswith('0x') and 
            len(owner_identifier) == 42
        )
        
        # If it's not a user ID (ObjectId or similar), treat as wallet
        is_wallet_address = is_evm_wallet or len(owner_identifier) > 30

        filter_query = {}
        
        if is_wallet_address:
            # For wallet search, check all potential address fields
            normalized_addr = normalize_blockchain_address(owner_identifier)
            filter_query = {
                "$or": [
                    {"owner_address": normalized_addr},
                    {"owner_solana_address": normalized_addr},
                    {"owner_algorand_address": normalized_addr}
                ],
                "token_id": {"$ne": None, "$exists": True}
            }
            logger.info(f"Searching by wallet address: {owner_identifier} (Normalized: {normalized_addr})")
        else:
            # Searching by owner_id (user ID)
            filter_query = {
                "owner_id": owner_identifier,
                "token_id": {"$ne": None, "$exists": True}
            }
            logger.info(f"Searching by user ID: {owner_identifier}")

        # ⚡ OPTIMIZED: Get total count and artworks in parallel
        total_task = artworks_collection.count_documents(filter_query)
        
        skip = (page - 1) * size
        artworks_task = artworks_collection.find(
            filter_query
        ).skip(skip).limit(size).sort("created_at", -1).to_list(length=size)
        
        # Execute both queries in parallel
        total, artworks_data = await asyncio.gather(total_task, artworks_task)
        
        has_next = (page * size) < total

        # ⚡ OPTIMIZED: Deduplicate using set (faster than list iteration)
        seen_ids = set()
        unique_artworks_data = []
        for doc in artworks_data:
            doc_id = str(doc.get("_id"))
            if doc_id not in seen_ids:
                seen_ids.add(doc_id)
                unique_artworks_data.append(doc)
        
        if len(artworks_data) != len(unique_artworks_data):
            logger.info(f"✅ Deduplicated artworks: {len(artworks_data)} -> {len(unique_artworks_data)}")

        # ⚡ OPTIMIZED: Collect all unique creator_id and owner_id for batch lookup
        creator_ids = set()
        owner_ids = set()
        valid_artworks = []
        
        for doc in unique_artworks_data:
            if doc.get("token_id") is None:
                continue
            
            try:
                db_model = ArtworkInDB.validate_document(doc)
                if db_model.creator_id:
                    creator_ids.add(str(db_model.creator_id))
                if db_model.owner_id:
                    owner_ids.add(str(db_model.owner_id))
                valid_artworks.append((doc, db_model))
            except Exception as e:
                logger.warning(f"Skipping invalid artwork document: {e}")
                continue

        # ⚡ OPTIMIZED: Batch fetch all users at once (fixes N+1 problem)
        user_cache = {}
        all_user_ids = creator_ids | owner_ids
        
        if all_user_ids:
            # Build ObjectId queries
            object_id_queries = []
            string_id_queries = []
            
            for user_id in all_user_ids:
                if ObjectId.is_valid(user_id):
                    object_id_queries.append(ObjectId(user_id))
                else:
                    string_id_queries.append(user_id)
            
            # Batch fetch by ObjectId _id
            if object_id_queries:
                object_id_cursor = users_collection.find({"_id": {"$in": object_id_queries}})
                async for user in object_id_cursor:
                    user_cache[str(user["_id"])] = user
            
            # Batch fetch by string _id for remaining IDs
            remaining_by_string = set(string_id_queries) - set(user_cache.keys())
            if remaining_by_string:
                string_cursor = users_collection.find({"_id": {"$in": list(remaining_by_string)}})
                async for user in string_cursor:
                    user_cache[str(user["_id"])] = user
            
            # Batch fetch by user_id field for any still missing
            still_missing = all_user_ids - set(user_cache.keys())
            if still_missing:
                user_id_cursor = users_collection.find({"user_id": {"$in": list(still_missing)}})
                async for user in user_id_cursor:
                    if user.get("user_id"):
                        user_cache[user["user_id"]] = user

        # ⚡ OPTIMIZED: Build artworks list using cached user data
        artworks = []
        for doc, db_model in valid_artworks:
            try:
                artwork_public = ArtworkPublic.from_db_model(db_model)
                artwork_dict = artwork_public.model_dump()
                
                # Get user data from cache (no additional queries)
                if db_model.creator_id:
                    creator_user = user_cache.get(str(db_model.creator_id))
                    if creator_user:
                        artwork_dict["creator_name"] = creator_user.get('full_name') or creator_user.get('username') or "Unknown"
                        artwork_dict["creator_email"] = creator_user.get('email') or None
                
                if db_model.owner_id:
                    owner_user = user_cache.get(str(db_model.owner_id))
                    if owner_user:
                        artwork_dict["owner_name"] = owner_user.get('full_name') or owner_user.get('username') or "Unknown"
                        artwork_dict["owner_email"] = owner_user.get('email') or None
                
                # ✅ SECURITY: Scrub sensitive identifiers and PRIVACY: Scrub PII
                artwork_dict["metadata_uri"] = None
                artwork_dict["image_uri"] = None
                artwork_dict["creator_email"] = None
                artwork_dict["owner_email"] = None
                artwork_dict["creator_id"] = None
                artwork_dict["owner_id"] = None
                
                artworks.append(ArtworkPublic(**artwork_dict))
            except Exception as e:
                logger.warning(f"Skipping invalid artwork document: {e}")
                continue

        return ArtworkListResponse(
            artworks=artworks,
            total=total,
            page=page,
            size=size,
            has_next=has_next
        )
    except Exception as e:
        logger.error(f"Error getting artworks by owner {owner_identifier}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get artworks")


@router.get("/share/{artwork_id}", response_class=HTMLResponse)
async def share_artwork_preview(artwork_id: str):
    """
    Social Media Metadata Injector (API Route)
    Uses the centralized logic from app.utils.artwork to ensure consistency.
    """
    from app.utils.artwork import generate_share_html
    return await generate_share_html(artwork_id)


@router.get("/creator/{creator_identifier}", response_model=ArtworkListResponse)
async def get_artworks_by_creator(
    creator_identifier: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100)
):
    """
    Get artworks by creator - supports both user ID and wallet address
    """
    try:
        artworks_collection = get_artwork_collection()
        users_collection = get_user_collection()

        # Determine if identifier is a wallet address or user ID
        is_wallet_address = (
            creator_identifier.startswith('0x') and 
            len(creator_identifier) == 42
        )

        filter_query = {}
        
        if is_wallet_address:
            # Search by wallet address (crypto users)
            filter_query = {
                "creator_address": {
                    "$regex": f"^{re.escape(creator_identifier.lower())}$",
                    "$options": "i"
                }
            }
            logger.info(f"Searching creator by wallet address: {creator_identifier}")
        else:
            # Search by user ID (PayPal users or internal lookup)
            # ✅ Try multiple lookup methods for user (similar to license endpoints)
            user = None
            if ObjectId.is_valid(creator_identifier):
                user = await users_collection.find_one({"_id": ObjectId(creator_identifier)})
            if not user:
                user = await users_collection.find_one({"user_id": creator_identifier})
            if not user:
                user = await users_collection.find_one({"_id": creator_identifier})
            if not user:
                user = await users_collection.find_one({"id": creator_identifier})
            
            if user:
                # ✅ Get all possible user ID formats that might be stored as creator_id
                possible_creator_ids = set()
                if user.get('user_id'):
                    possible_creator_ids.add(str(user.get('user_id')))
                if user.get('id'):
                    possible_creator_ids.add(str(user.get('id')))
                if user.get('_id'):
                    possible_creator_ids.add(str(user.get('_id')))
                possible_creator_ids.add(creator_identifier)
                
                # ✅ Search with all possible creator_id formats
                creator_id_conditions = [{"creator_id": cid} for cid in possible_creator_ids]
                
                # Also include wallet address if user has one (for crypto artworks)
                wallet_address = user.get('wallet_address')
                if wallet_address:
                    creator_id_conditions.append({
                        "creator_address": {
                            "$regex": f"^{re.escape(normalize_blockchain_address(wallet_address))}$",
                            "$options": "i"
                        }
                    })
                
                if len(creator_id_conditions) > 1:
                    filter_query = {"$or": creator_id_conditions}
                else:
                    filter_query = creator_id_conditions[0]
                
                logger.info(f"Searching creator by user ID: {creator_identifier}, possible IDs: {possible_creator_ids}")
            else:
                # Try as wallet address anyway
                filter_query = {
                    "creator_address": {
                        "$regex": f"^{re.escape(creator_identifier.lower())}$",
                        "$options": "i"
                    }
                }
                logger.info(f"Creator user not found, searching as wallet address: {creator_identifier}")

        total = await artworks_collection.count_documents(filter_query)
        has_next = (page * size) < total
        skip = (page - 1) * size

        cursor = artworks_collection.find(filter_query).skip(skip).limit(size).sort("created_at", -1)
        artworks_data = await cursor.to_list(length=size)

        artworks = []
        for doc in artworks_data:
            try:
                db_model = ArtworkInDB.validate_document(doc)
                artwork_public = ArtworkPublic.from_db_model(db_model)
                
                # ✅ SECURITY: Scrub sensitive identifiers and PRIVACY: Scrub PII
                artwork_public.metadata_uri = None
                artwork_public.image_uri = None
                artwork_public.creator_email = None
                artwork_public.owner_email = None
                artwork_public.creator_id = None
                artwork_public.owner_id = None
                
                artworks.append(artwork_public)
            except Exception as e:
                logger.warning(f"Skipping invalid artwork document: {e}")
                continue

        return ArtworkListResponse(
            artworks=artworks,
            total=total,
            page=page,
            size=size,
            has_next=has_next
        )
    except Exception as e:
        logger.error(f"Error getting artworks by creator {creator_identifier}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get artworks")
    




    

# # --- Sale transaction preparation ---
@router.post("/prepare-sale-transaction", response_model=Dict[str, Any])
async def prepare_sale_transaction(
    request: SaleTransactionRequest,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Prepare a sale transaction (Solana only)"""
    try:
        logger.info(f"🔄 Preparing Solana sale - Artwork: {request.artwork_id}, Token: {request.token_id}")
        
        artwork_identifier = request.artwork_id
        buyer_address = request.buyer_address
        seller_address = request.seller_address
        
        # Get artwork
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc and request.token_id:
            artwork_doc = await resolve_artwork_identifier(str(request.token_id))
            
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
        
        token_id = artwork_doc.get("token_id")
        
        # ✅ Force Solana flow
        logger.info("☀️ Using Solana flow for purchase preparation")
        
        # Priority 1: Check blockchain for live owner (Source of Truth)
        live_owner = None
        try:
            blockchain_info = await solana_service.get_nft_metadata_detailed(token_id)
            if blockchain_info and blockchain_info.get("owner"):
                live_owner = blockchain_info.get("owner")
                logger.info(f"☀️ Found on-chain Solana owner for preparation: {live_owner}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to fetch live owner from blockchain for preparation: {e}")

        # Priority 2: Use resolved owner, fallback to provided seller, then DB
        effective_seller = (
            live_owner
            or seller_address
            or artwork_doc.get("owner_solana_address")
            or artwork_doc.get("creator_solana_address")
            or artwork_doc.get("owner_address")
            or artwork_doc.get("creator_address")
        )
        if not effective_seller:
            raise HTTPException(status_code=400, detail="Seller address not found")
            
        # Calculate lamports
        artwork_price = float(artwork_doc.get("price") or 0)
        sale_price_lamports = int(round(artwork_price * 1_000_000_000))
        
        if sale_price_lamports <= 0:
            raise HTTPException(status_code=400, detail="Sale amount must be greater than zero")
            
        # Platform fee calculation
        platform_fee_percentage = await get_current_global_fee()
        buyer_platform_fee_lamports = int(round(sale_price_lamports * platform_fee_percentage / 100.0))
        seller_platform_fee_lamports = int(round(sale_price_lamports * platform_fee_percentage / 100.0))
        
        # Royalty calculation
        royalty_percentage = artwork_doc.get("royalty_percentage", 0)
        creator_address = artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address")
        
        # If missing in DB, try to fetch from blockchain
        if not creator_address and token_id:
            try:
                blockchain_info = await solana_service.get_nft_metadata_detailed(token_id)
                if blockchain_info and blockchain_info.get("creator"):
                    creator_address = blockchain_info.get("creator")
                    logger.info(f"🎨 Found Solana creator from blockchain: {creator_address}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to fetch creator from blockchain for sale: {e}")
        
        is_primary_sale = (creator_address and effective_seller and creator_address == effective_seller)
        
        royalty_amount_lamports = 0
        if not is_primary_sale and creator_address:
            royalty_amount_lamports = int(round(sale_price_lamports * royalty_percentage / 10000.0))
            
        # Final amounts
        seller_final_amount = sale_price_lamports - seller_platform_fee_lamports - royalty_amount_lamports
        platform_final_amount = buyer_platform_fee_lamports + seller_platform_fee_lamports
        total_payment_lamports = sale_price_lamports + buyer_platform_fee_lamports
        
        return {
            "to": effective_seller,
            "seller_amount": seller_final_amount,
            "platform_address": settings.SOLANA_PLATFORM_ADDRESS,
            "platform_amount": platform_final_amount,
            "creator_address": creator_address if royalty_amount_lamports > 0 else None,
            "royalty_amount": royalty_amount_lamports,
            "value": total_payment_lamports,
            "mode": "REAL",
            "requires_blockchain": True,
            "payment_method": "crypto",
            "network": "solana"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Sale preparation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sale preparation failed: {str(e)}")
@router.post("/confirm-sale")
async def confirm_sale_transaction(
    confirmation_data: SaleConfirmationRequest,
    current_user: dict = Depends(get_current_user)
):
    """Confirm sale transaction after blockchain confirmation (Solana only)"""
    try:
        tx_hash = confirmation_data.tx_hash
        artwork_identifier = confirmation_data.artwork_id
        
        if not tx_hash or (not artwork_identifier and not confirmation_data.token_id):
            raise HTTPException(status_code=400, detail="Missing transaction hash or artwork ID")

        logger.info(f"🔄 Confirming Solana sale - Artwork ID: {artwork_identifier}, Token: {confirmation_data.token_id}, TX: {tx_hash}")

        db_artworks = get_artwork_collection()
        db_transactions = get_transaction_collection()
        
        # Get the artwork
        artwork_doc = await resolve_artwork_identifier(artwork_identifier)
        if not artwork_doc and confirmation_data.token_id:
            artwork_doc = await resolve_artwork_identifier(str(confirmation_data.token_id))
            
        if not artwork_doc:
            raise HTTPException(status_code=404, detail="Artwork not found")
            
        token_id = artwork_doc.get("token_id")
        
        # ✅ Force Solana network
        network = "solana"
        
        # ✅ Use buyer_address from confirmation data
        buyer_wallet = (confirmation_data.buyer_address or current_user.get('wallet_address') or "").strip()
        if not buyer_wallet:
            raise HTTPException(status_code=400, detail="Missing buyer wallet address in sale confirmation")

        logger.info(f"🔍 Verifying Solana sale tx {tx_hash}")
        
        # Priority 1: Check blockchain for live owner
        live_owner = None
        try:
            blockchain_info = await solana_service.get_nft_metadata_detailed(token_id)
            if blockchain_info and blockchain_info.get("owner"):
                live_owner = blockchain_info.get("owner")
                logger.info(f"☀️ Found on-chain Solana owner: {live_owner}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to fetch live owner from blockchain: {e}")

        # Priority 2: Use resolved owner, fallback to provided seller, then DB
        effective_seller = (
            live_owner
            or confirmation_data.seller_address
            or artwork_doc.get("owner_solana_address")
            or artwork_doc.get("creator_solana_address")
            or artwork_doc.get("owner_address")
            or artwork_doc.get("creator_address")
        )
        if not effective_seller:
            raise HTTPException(status_code=400, detail="Seller address not found in artwork metadata")
            
        # Calculate expected lamports
        artwork_price = float(artwork_doc.get("price") or 0)
        sale_price_lamports = int(round(artwork_price * 1_000_000_000))
        
        # Calculate expected split
        platform_fee_percentage = await get_current_global_fee()
        seller_platform_fee_lamports = int(round(sale_price_lamports * platform_fee_percentage / 100.0))
        buyer_platform_fee_lamports = int(round(sale_price_lamports * platform_fee_percentage / 100.0))
        
        royalty_percentage = artwork_doc.get("royalty_percentage", 0)
        creator_address = artwork_doc.get("creator_solana_address") or artwork_doc.get("creator_address")
        
        if not creator_address and token_id:
            try:
                blockchain_info = await solana_service.get_nft_metadata_detailed(token_id)
                if blockchain_info and blockchain_info.get("creator"):
                    creator_address = blockchain_info.get("creator")
            except Exception as e:
                logger.warning(f"⚠️ Failed to fetch creator from blockchain: {e}")
        
        is_primary_sale = (creator_address and effective_seller and creator_address == effective_seller)
        
        royalty_amount_lamports = 0
        if not is_primary_sale and creator_address:
            royalty_amount_lamports = int(round(sale_price_lamports * royalty_percentage / 10000.0))
            
        expected_seller_lamports = sale_price_lamports - seller_platform_fee_lamports - royalty_amount_lamports
        expected_platform_lamports = buyer_platform_fee_lamports + seller_platform_fee_lamports
        
        # Verify transaction on Solana
        verification_result = await solana_service.verify_transaction(
            tx_hash=tx_hash,
            expected_seller_lamports=expected_seller_lamports,
            seller_address=effective_seller,
            platform_address=settings.SOLANA_PLATFORM_ADDRESS,
            expected_platform_lamports=expected_platform_lamports,
            creator_address=creator_address if royalty_amount_lamports > 0 else None,
            expected_royalty_lamports=royalty_amount_lamports
        )
        
        if not verification_result.get("success"):
            logger.error(f"❌ Solana Sale Verification Failed: {verification_result.get('error')} (tx: {tx_hash})")
            raise HTTPException(status_code=400, detail=verification_result.get("error"))
        
        logger.info(f"✅ Solana sale transaction {tx_hash} verified")
        
        # Execute NFT Transfer
        logger.info(f"🚚 Initiating Solana NFT transfer for token {token_id} to buyer {buyer_wallet}")
        
        live_owner = await solana_service.get_nft_owner(token_id)
        source_address = live_owner or effective_seller
        
        transfer_result = await solana_service.transfer_nft(
            mint_address=token_id,
            from_address=source_address,
            to_address=buyer_wallet
        )
        
        if not transfer_result.get("success"):
            logger.error(f"❌ Solana NFT transfer failed: {transfer_result.get('error')}")
            raise HTTPException(
                status_code=500,
                detail=f"Payment verified, but NFT transfer failed: {transfer_result.get('error')}"
            )
        
        transfer_tx_hash = transfer_result.get("tx_hash")
        logger.info(f"✅ Solana NFT transferred: {transfer_tx_hash}")

        # Update artwork ownership
        buyer_user_id = str(current_user.get('_id') or "")
        update_fields = {
            "owner_address": buyer_wallet,
            "owner_solana_address": buyer_wallet,
            "is_for_sale": False,
            "updated_at": datetime.utcnow(),
            "sold_at": datetime.utcnow(),
        }
        if buyer_user_id:
            update_fields["owner_id"] = buyer_user_id

        await db_artworks.update_one(
            {"_id": artwork_doc["_id"]},
            {"$set": update_fields}
        )

        # Invalidate cache
        try:
            artwork_db_id = str(artwork_doc["_id"])
            # Cache helpers imported at module level
            invalidate_artwork_cache(artwork_db_id)
            invalidate_blockchain_cache(token_id)
            invalidate_artworks_cache()
        except Exception as cache_error:
            logger.warning(f"⚠️ Cache invalidation failed: {cache_error}")

        # Create transaction record
        sale_transaction = {
            "tx_hash": tx_hash,
            "token_id": token_id,
            "from_address": effective_seller,
            "to_address": buyer_wallet,
            "from_user_id": artwork_doc.get("owner_id"),
            "to_user_id": buyer_user_id,
            "value": str(artwork_price),
            "transaction_type": "SALE",
            "status": "CONFIRMED",
            "payment_method": "solana",
            "currency": "SOL",
            "asset_transfer_tx_hash": transfer_tx_hash,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        await db_transactions.insert_one(sale_transaction)

        # Log user history
        await UserHistoryService.log_user_action(
            user_id=buyer_user_id,
            action="artwork_purchase_confirmed",
            artwork_id=str(artwork_doc.get('_id', '')),
            artwork_token_id=token_id,
            metadata={
                "transaction_hash": tx_hash,
                "previous_owner": effective_seller,
                "sale_price": artwork_price
            }
        )

        return {
            "success": True,
            "message": "Sale confirmed successfully",
            "token_id": token_id,
            "transaction_hash": tx_hash,
            "new_owner": buyer_wallet
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error confirming sale: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to confirm sale: {str(e)}")

@router.get("/health/blockchain")
async def blockchain_health():
    """Solana blockchain health check"""
    try:
        from services.solana_service import solana_service
        # Basic connectivity check
        is_connected = await solana_service.get_balance(settings.PLATFORM_TREASURY_ADDRESS) is not None
        
        return {
            "success": True,
            "network": "solana",
            "connected": is_connected,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "network": "solana",
            "connected": False
        }

@router.get("/settings/global")
async def get_global_settings():
    """Get all global configuration settings (Solana only)"""
    try:
        db = get_db()
        settings_doc = await db.system_settings.find_one({"_id": "global_settings"})
        
        # Default values if database is empty
        if not settings_doc:
            return {
                "platform_fee": 2.5,
                "enable_crypto": True,
                "network": "solana"
            }
            
        return {
            "platform_fee": settings_doc.get("default_platform_fee_percentage", 2.5),
            "enable_crypto": True,
            "network": "solana"
        }
    except Exception as e:
        logger.error(f"Error fetching global settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch settings")

@router.post("/settings/global")
async def update_global_settings(
    settings_data: dict, 
    current_admin: dict = Depends(get_current_admin_user)
):
    """Update global settings (Admin only)"""
    try:
        db = get_db()
        update_fields = {}
        
        # Handle Platform Fee
        if "platform_fee" in settings_data:
            update_fields["default_platform_fee_percentage"] = float(settings_data["platform_fee"])
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No valid settings provided")
            
        # Update database (upsert=True creates it if missing)
        await db.system_settings.update_one(
            {"_id": "global_settings"},
            {"$set": update_fields},
            upsert=True
        )
        
        return {"status": "success", "message": "Settings updated successfully", "updates": update_fields}
        
    except Exception as e:
        logger.error(f"Error updating global settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")
