from fastapi import APIRouter, Query, HTTPException, Depends, Request
from app.db.models import User
from sentence_transformers import SentenceTransformer
import numpy as np
from bson import ObjectId
from app.db.database import get_artwork_collection, get_user_history_collection, is_mongo_initialized
from services.user_history_service import UserHistoryService
import faiss
from app.core.security import get_current_user, get_current_user_optional
from typing import Optional
from nltk.corpus import stopwords
import os
import re
from datetime import datetime, timedelta
import random
import asyncio
import logging
import time

# ✅ REDIS CACHE: Import Redis cache functions
from services.redis_cache_service import (
    cache,
    get_recommendations_cache,
    set_recommendations_cache,
    invalidate_user_recommendations
)

router = APIRouter()
logger = logging.getLogger(__name__)

# SentenceTransformer disabled as per user request to remove AI models
model = None
embedding_dim = 384
logger.info("AI Search Model (SentenceTransformer) is disabled.")

# FAISS index + mapping
index = None
id_map = []

# Files for saving index + mapping
INDEX_FILE = "artworks.index"
IDMAP_FILE = "id_map.npy"

# Track initialization
faiss_loaded = False

def clean_text(text: str) -> str:
    """Remove unwanted characters + stopwords."""
    try:
        stop_words = set(stopwords.words('english'))
    except:
        # Fallback if nltk stopwords not available
        stop_words = set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but'])
    
    text = text.lower()
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)  # remove special chars
    text = re.sub(r"\s+", " ", text).strip()
    
    words = text.split()
    filtered = [w for w in words if w not in stop_words]
    return " ".join(filtered)    

# === Helper: Create Embedding ===
def create_embedding(text: str):
    if not text or not text.strip():
        raise ValueError("Empty text cannot be embedded")
    if model is None:
        raise RuntimeError("SentenceTransformer model not loaded")
    
    # model.encode returns a 2D array by default
    vector = model.encode([text], normalize_embeddings=True)
    
    # Convert to numpy array and ensure it's the right dtype
    vector = np.array(vector, dtype="float32")
    
    # Log the shape for debugging
    logger.debug(f"Created embedding with shape: {vector.shape}")
    
    return vector

# === Save FAISS + id_map ===
def save_faiss():
    try:
        if index is not None and faiss_loaded:
            faiss.write_index(index, INDEX_FILE)
            np.save(IDMAP_FILE, np.array(id_map))
            logger.info("✅ FAISS index saved to disk.")
    except Exception as e:
        logger.error(f"❌ Error saving FAISS: {str(e)}")

# === Load FAISS + id_map ===
async def load_faiss():
    global index, id_map, faiss_loaded
    
    # Wait for MongoDB to be initialized
    max_retries = 10
    for i in range(max_retries):
        if is_mongo_initialized():
            break
        logger.info(f"⏳ Waiting for MongoDB initialization... ({i+1}/{max_retries})")
        await asyncio.sleep(1)
    else:
        logger.error("❌ MongoDB not initialized after waiting")
        return
    
    abs_index_path = os.path.abspath(INDEX_FILE)
    abs_idmap_path = os.path.abspath(IDMAP_FILE)
    
    if os.path.exists(INDEX_FILE) and os.path.exists(IDMAP_FILE):
        try:
            logger.info(f"📂 Loading FAISS from: {abs_index_path}")
            index = faiss.read_index(INDEX_FILE)
            id_map = np.load(IDMAP_FILE, allow_pickle=True).tolist()
            logger.info(f"✅ FAISS index loaded. Entries: {index.ntotal}")
            faiss_loaded = True
        except Exception as e:
            logger.error(f"⚠️ Failed to load FAISS index at {abs_index_path}: {str(e)}")
            await rebuild_faiss_index()
            save_faiss()
    else:
        logger.info(f"⚠️ No FAISS index found at {abs_index_path}. Rebuilding from MongoDB...")
        await rebuild_faiss_index()
        save_faiss()

# Cache for missing artworks to avoid repeated lookups
_missing_artwork_cache = set()
_cache_size_limit = 1000

# ✅ OLD IN-MEMORY CACHE REMOVED - Now using Redis cache from redis_cache_service.py

async def universal_find_artwork(artwork_id: str, silent: bool = False):
    """
    Universal artwork finder that handles both string and ObjectId formats.
    
    Args:
        artwork_id: The artwork ID to find
        silent: If True, don't log warnings for missing artworks (for performance)
    """
    # Check cache first to avoid repeated lookups
    if artwork_id in _missing_artwork_cache:
        return None
    
    collection = get_artwork_collection()
    
    # Try multiple lookup methods
    lookup_methods = []
    
    # Method 1: Try as ObjectId (if it's a valid ObjectId string)
    try:
        if ObjectId.is_valid(artwork_id):
            lookup_methods.append({"_id": ObjectId(artwork_id)})
    except:
        pass
    
    # Method 2: Try as direct string match
    lookup_methods.append({"_id": artwork_id})
    
    # Method 3: Try with different string representations
    lookup_methods.append({"_id": {"$eq": artwork_id}})
    
    # Try all methods
    for query in lookup_methods:
        try:
            art = await collection.find_one(query)
            if art:
                return art
        except Exception as e:
            continue
    
    # Artwork not found - add to cache and log only if not silent
    if len(_missing_artwork_cache) < _cache_size_limit:
        _missing_artwork_cache.add(artwork_id)
    
    if not silent:
        logger.debug(f"⚠️ Artwork not found: {artwork_id}")
    
    return None

# === Rebuild FAISS index from MongoDB ===
async def rebuild_faiss_index():
    global index, id_map, faiss_loaded
    
    logger.info("🔨 Rebuilding FAISS index from MongoDB...")
    
    if not is_mongo_initialized():
        logger.error("❌ MongoDB not initialized for rebuild")
        raise RuntimeError("MongoDB not initialized")
    
    # Create new index
    index = faiss.IndexFlatL2(embedding_dim)
    id_map = []

    try:
        collection = get_artwork_collection()
        count = await collection.count_documents({})
        logger.info(f"📊 MongoDB artworks count: {count}")
        
        if count == 0:
            logger.warning("⚠️ No artworks found in MongoDB collection")
            faiss_loaded = True
            return
            
        artworks = await collection.find().to_list(length=None)
        
        logger.info(f"🔍 Processing {len(artworks)} artworks for indexing")
        
        successful_indexes = 0
        
        for i, art in enumerate(artworks):
            try:
                art_id = str(art.get('_id'))
                title = art.get('title', '')
                description = art.get('description', '')
                category = art.get('category', '')
                
                # Create combined text
                combined_text = f"{title} {description} {category}"
                cleaned_text = clean_text(combined_text)
                
                if cleaned_text.strip():
                    vector = create_embedding(cleaned_text)
                    index.add(vector)
                    id_map.append(art_id)
                    successful_indexes += 1
                    
                    # Log every 5 artworks to see progress
                    if successful_indexes % 5 == 0:
                        logger.info(f"📝 Indexed {successful_indexes} artworks so far...")
                        
            except Exception as e:
                logger.error(f"❌ Error indexing artwork {art.get('_id')}: {e}")
                continue

        faiss_loaded = True
        logger.info(f"✅ FAISS index rebuilt. Successfully indexed {successful_indexes}/{len(artworks)} artworks")
        
        # Verify the index
        logger.info(f"🔍 Verification: index.ntotal = {index.ntotal}, id_map length = {len(id_map)}")
        
        if index.ntotal != len(id_map):
            logger.error(f"❌ MISMATCH: index has {index.ntotal} vectors but id_map has {len(id_map)} entries!")
        
    except Exception as e:
        logger.error(f"❌ Error rebuilding FAISS index: {e}")
        faiss_loaded = False

# === Helper: Add single artwork to FAISS index ===
async def add_artwork_to_faiss(artwork_id: str, artwork_doc: dict = None):
    """
    Add a single artwork to the FFAISS index.
    If artwork_doc is not provided, it will be fetched from MongoDB.
    """
    global index, id_map, faiss_loaded
    
    if not faiss_loaded or index is None:
        # Silent return if FAISS is not used/loaded
        return False
    
    # Check if already indexed
    if artwork_id in id_map:
        logger.debug(f"✅ Artwork {artwork_id} already in FFAISS index")
        return True
    
    try:
        # Fetch artwork if not provided
        if artwork_doc is None:
            collection = get_artwork_collection()
            # Try to find by ObjectId first, then by string
            try:
                if ObjectId.is_valid(artwork_id):
                    artwork_doc = await collection.find_one({"_id": ObjectId(artwork_id)})
                else:
                    artwork_doc = await collection.find_one({"_id": artwork_id})
            except:
                artwork_doc = await collection.find_one({"_id": artwork_id})
            
            if not artwork_doc:
                logger.warning(f"⚠️ Artwork {artwork_id} not found in MongoDB")
                return False
        
        # Extract text fields
        title = artwork_doc.get('title', '')
        description = artwork_doc.get('description', '')
        category = artwork_doc.get('category', '')
        
        # Create combined text
        combined_text = f"{title} {description} {category}"
        cleaned_text = clean_text(combined_text)
        
        if not cleaned_text.strip():
            logger.warning(f"⚠️ Artwork {artwork_id} has no text content to index")
            return False
        
        # Create embedding
        vector = create_embedding(cleaned_text)
        
        # Add to index
        index.add(vector)
        id_map.append(artwork_id)
        
        # Save updated index
        save_faiss()
        
        logger.info(f"✅ Added artwork {artwork_id} to FFAISS index")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error adding artwork {artwork_id} to FFAISS index: {e}")
        return False

# === Helper: Get vector from FAISS using artwork_id ===
def get_vector_from_faiss(artwork_id: str):
    if not faiss_loaded or index is None:
        return None
    if artwork_id in id_map:
        idx = id_map.index(artwork_id)
        return index.reconstruct(idx)
    return None

# === Helper: Search similar artworks (with exclude) ===
async def search_similar(vec, k=5, threshold=3.0, exclude_ids=None):  # Increased threshold to 3.0
    results = []
    if vec is None or not faiss_loaded or index is None:
        return results
    if exclude_ids is None:
        exclude_ids = set()

    try:
        # Ensure vec is the right shape for FAISS
        if len(vec.shape) == 1:
            vec = vec.reshape(1, -1)
        
        logger.debug(f"Searching with vector shape: {vec.shape}")
        
        # Calculate how many results to request
        n_results = min(k + len(exclude_ids), index.ntotal)
        if n_results == 0:
            return results
            
        # Perform FAISS search
        distances, indices = index.search(vec, n_results)
        
        logger.debug(f"FAISS search returned {len(distances[0])} results with distances: {distances[0][:5]}")
        
        # Process the results with more lenient matching
        for i in range(len(distances[0])):
            dist = distances[0][i]
            idx = indices[0][i]
            
            # FAISS returns -1 for indices when not enough results
            if idx == -1 or idx >= len(id_map):
                continue
                
            # More lenient threshold - accept more results
            if dist <= threshold:
                art_id = id_map[idx]
                if art_id in exclude_ids:
                    continue
                    
                # Use silent mode to avoid logging warnings for missing artworks
                art = await universal_find_artwork(art_id, silent=True)
                if art:
                    # ✅ OPTIMIZATION: Only include artworks that are for sale
                    if art.get("is_for_sale") is False:
                        logger.debug(f"🚫 Skipping artwork {art_id} - not for sale")
                        continue
                    
                    # ✅ Process through model validation to ensure is_on_chain and registration_method are set
                    try:
                        from app.db.models import ArtworkInDB
                        art = ArtworkInDB.validate_document(art).model_dump(by_alias=True)
                    except Exception as e:
                        logger.debug(f"⚠️ Error validating artwork {art_id} in search_similar: {e}")
                        # Continue with raw art if validation fails
                    
                    art["_id"] = str(art.get("_id") or art_id)
                    art["similarity_score"] = float(1 - (dist / threshold))  # Normalize score
                    art["search_distance"] = float(dist)  # Add distance for debugging
                    results.append(art)
                    
            if len(results) >= k:
                break
                
        if results:
            logger.info(f"🔍 Search similar found {len(results)} results with threshold {threshold}")
        else:
            logger.debug(f"🔍 Search similar found 0 results with threshold {threshold}")
        
    except Exception as e:
        logger.error(f"Error in search_similar: {e}", exc_info=True)
        
    return results

# === Add startup event handler ===
@router.on_event("startup")
async def startup_event():
    """Load FAISS index after MongoDB is connected"""
    await load_faiss()

# === Search Artwork ===
@router.get("/search")
async def search_artworks(
    query: str = Query(..., min_length=1),
    k: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user_optional)
):
    try:
        # Enhanced user extraction for JWT payload
        user_id = None
        auth_source = "none"
        
        logger.info(f"🔐 RAW current_user received: {current_user}")
        logger.info(f"🔐 RAW current_user type: {type(current_user)}")
        
        if current_user:
            # JWT tokens typically return dict with user claims
            if isinstance(current_user, dict):
                logger.info(f"🔐 JWT Payload keys: {list(current_user.keys())}")
                
                # Extract user_id from JWT payload (based on your decode-token output)
                user_id = (
                    current_user.get('user_id') or          # This should work based on your JWT
                    current_user.get('id') or               # Alternative
                    current_user.get('sub')                 # JWT subject (email)
                )
                
                if user_id:
                    user_id = str(user_id)
                    auth_source = "jwt_token"
                    logger.info(f"✅ Extracted user_id from JWT: {user_id}")
                else:
                    logger.warning(f"❌ No user_id found in JWT payload. Available keys: {list(current_user.keys())}")
            
            # If it's a User object (Pydantic model)
            elif hasattr(current_user, 'id'):
                user_id = str(current_user.get("id"))
                auth_source = "user_object"
                logger.info(f"✅ Extracted user_id from User object: {user_id}")
            
            else:
                logger.warning(f"❌ Unknown current_user type: {type(current_user)}")
        
        logger.info(f"🔍 Search request: query='{query}', user_id={user_id}, auth_source={auth_source}")

        if not faiss_loaded or index is None:
            logger.error("Search service not ready - FAISS not loaded")
            raise HTTPException(status_code=503, detail="Search service is initializing, please try again in a few moments")
        
        if index.ntotal == 0:
            logger.warning("No artworks in FAISS index")
            return {"results": [], "message": "No artworks available for search"}

        if not query or not query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
            
        query_cleaned = clean_text(query)
        if not query_cleaned.strip():
            raise HTTPException(status_code=400, detail="Query contains only stopwords or invalid characters")

        try:
            query_vec = create_embedding(query_cleaned)
        except Exception as e:
            logger.error(f"Failed to create embedding: {e}")
            raise HTTPException(status_code=500, detail="Failed to process search query")

        try:
            distances, indices = index.search(query_vec, min(k * 2, index.ntotal))
            logger.info(f"FAISS search returned {len(indices[0])} potential matches")
        except Exception as e:
            logger.error(f"FAISS search failed: {e}")
            raise HTTPException(status_code=500, detail="Search operation failed")

        results = []
        threshold = 1.0
        artwork_ids_from_search = []

        for dist, idx in zip(distances[0], indices[0]):
            if idx < len(id_map) and dist <= threshold:
                try:
                    # Use silent mode to avoid logging warnings for missing artworks
                    art = await universal_find_artwork(id_map[idx], silent=True)
                    if art:
                        # ✅ MANDATORY FILTER: Only show Solana artworks in Search
                        if art.get("network") != "solana":
                            continue

                        # ✅ Process through model validation to ensure is_on_chain and registration_method are set
                        try:
                            from app.db.models import ArtworkInDB
                            art = ArtworkInDB.validate_document(art).model_dump(by_alias=True)
                        except Exception as e:
                            logger.debug(f"⚠️ Error validating artwork {id_map[idx]} in search_artworks: {e}")
                            # Continue with raw art if validation fails
                        
                        art_id_str = str(art.get("_id") or id_map[idx])
                        art["_id"] = art_id_str
                        art["similarity_score"] = float(1 - dist)
                        results.append(art)
                        artwork_ids_from_search.append(art_id_str)
                except Exception as e:
                    logger.debug(f"Failed to fetch artwork {id_map[idx]}: {e}")
                    continue

            if len(results) >= k:
                break

        results.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)
        logger.info(f"Search completed: found {len(results)} results for query '{query}'")

        # Log search action if we have a valid user_id
        if user_id and user_id not in ["anonymous", "unknown", "none", "null", "undefined"]:
            try:
                # Use the first result as primary artwork for search context
                primary_artwork_id = artwork_ids_from_search[0] if artwork_ids_from_search else None
                
                logger.info(f"📝 Logging search history for user {user_id}")
                logger.info(f"📝 Query: {query}")
                logger.info(f"📝 Primary artwork: {primary_artwork_id}")
                logger.info(f"📝 Results count: {len(results)}")
                
                history_id = await UserHistoryService.log_user_action(
                    user_id=user_id,
                    action="search",
                    artwork_id=primary_artwork_id,  # This helps with context
                    query=query,  # This is what we'll use for recommendations
                    metadata={
                        "search_results_count": len(results),
                        "all_artwork_ids": artwork_ids_from_search,
                        "query_cleaned": query_cleaned,
                        "auth_source": auth_source,
                        "search_successful": len(results) > 0
                    }
                )
                
                if history_id:
                    logger.info(f"✅ Search history logged successfully. History ID: {history_id}")
                    
                    # ✅ REDIS CACHE: Invalidate user's recommendation cache (they have new activity)
                    try:
                        invalidate_user_recommendations(user_id)
                        logger.info(f"🗑️ Invalidated recommendations cache for user {user_id}")
                    except Exception as cache_error:
                        logger.warning(f"⚠️ Failed to invalidate cache: {cache_error}")
                else:
                    logger.error("❌ Failed to log search history - returned None")
                    
            except Exception as e:
                logger.error(f"❌ Error logging search history: {e}", exc_info=True)
        else:
            logger.warning(f"🔒 Cannot log search history - invalid user_id: {user_id}")

        # Return response with detailed auth info
        response_data = {
            "results": results,
            "search_metadata": {
                "query": query,
                "total_results": len(results),
                "query_processed": query_cleaned,
                "user_authenticated": user_id is not None,
                "user_id": user_id,
                "auth_source": auth_source,
                "history_logged": user_id is not None
            }
        }
        
        if not results:
            response_data["message"] = "No matching artworks found"
            response_data["suggestions"] = [
                "Try different keywords", 
                "Use more specific terms", 
                "Check spelling"
            ]

        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search failed for query '{query}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    
@router.get("/search/debug-user-history/{user_id}")
async def debug_user_history(user_id: str):
    """Debug raw user history data"""
    try:
        from services.user_history_service import UserHistoryService
        
        history_entries = await UserHistoryService.get_user_history(user_id, limit=50)
        
        # Detailed analysis of each entry
        analyzed_entries = []
        for entry in history_entries:
            analyzed_entries.append({
                "action": entry.get("action"),
                "artwork_id": entry.get("artwork_id"),
                "query": entry.get("query"),
                "timestamp": entry.get("timestamp"),
                "has_artwork_id": bool(entry.get("artwork_id")),
                "artwork_id_in_faiss": entry.get("artwork_id") in id_map if entry.get("artwork_id") else False
            })
        
        return {
            "user_id": user_id,
            "total_entries": len(history_entries),
            "entries_with_artwork_id": sum(1 for e in history_entries if e.get("artwork_id")),
            "entries_with_faiss_artwork": sum(1 for e in history_entries if e.get("artwork_id") and e.get("artwork_id") in id_map),
            "raw_entries": history_entries[:10],  # First 10 raw entries
            "analyzed_entries": analyzed_entries
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/search/debug-auth")
async def debug_auth(current_user: User = Depends(get_current_user_optional)):
    """Debug authentication status"""
    auth_info = {
        "current_user": current_user,
        "current_user_type": type(current_user).__name__ if current_user else "None",
        "is_authenticated": current_user is not None
    }
    
    if current_user:
        if hasattr(current_user, '__dict__'):
            auth_info["user_attributes"] = current_user.__dict__
        elif isinstance(current_user, dict):
            auth_info["user_dict"] = current_user
        else:
            auth_info["user_representation"] = str(current_user)
    
    return auth_info
    
# === Health Check ===
@router.get("/search/health")
async def search_health():
    """Check search service health"""
    return {
        "faiss_loaded": faiss_loaded,
        "index_size": index.ntotal if index else 0,
        "id_map_size": len(id_map),
        "model_loaded": model is not None,
        "status": "healthy" if faiss_loaded and model else "unhealthy"
    }

# === Add Artwork ===
@router.post("/add_artwork")
async def add_artwork(artwork: dict):
    try:
        if not faiss_loaded:
            raise HTTPException(status_code=503, detail="Search service not ready")

        # Validate input
        if not artwork.get("title") or not artwork.get("description"):
            raise HTTPException(status_code=400, detail="Artwork must have title and description")

        # 1. Save in MongoDB
        result = await get_artwork_collection().insert_one(artwork)
        artwork_id = str(result.inserted_id)

        # 2. Create embedding
        text = clean_text(
            f"{artwork.get('title','')} {artwork.get('description','')} {artwork.get('category','')}"
        )
        vector = create_embedding(text)

        # 3. Add to FAISS
        index.add(vector)
        id_map.append(artwork_id)

        # 4. Save updated index
        save_faiss()

        return {"artwork_id": artwork_id, "message": "Artwork added successfully"}
    except Exception as e:
        logger.error(f"Error adding artwork: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding artwork: {str(e)}")

@router.get("/recommend/{user_id}")
async def recommend_artworks(
    user_id: str, 
    k: int = Query(10, ge=1, le=20)
):
    try:
        logger.info(f"🎯 Starting recommendations for user {user_id}, k={k}")
        
        # ✅ REDIS CACHE: Check cache first (30 minutes TTL)
        cache_filters = {}
        cached_recommendations = get_recommendations_cache(user_id, cache_filters)
        if cached_recommendations:
            logger.info(f"⚡ REDIS CACHE HIT - Returning cached recommendations for user {user_id}")
            return cached_recommendations
        
        logger.info(f"💨 REDIS CACHE MISS - Generating recommendations for user {user_id}")
        
        if not faiss_loaded:
            raise HTTPException(status_code=503, detail="Recommendation service not ready")

        from services.user_history_service import UserHistoryService
        
        # Get user history - sort by recent first
        history_entries = await UserHistoryService.get_user_history(user_id, limit=100)
        logger.info(f"📊 User {user_id} has {len(history_entries)} history entries")
        
        if not history_entries:
            logger.info(f"❌ No history for user {user_id}")
            return {
                "recommendations": {
                    "recommended_for_you": [],
                    "search_based": [],
                    "purchase_based": [],
                    "upload_based": [],
                    "view_based": []
                },
                "has_history": False,
                "message": "No user history found. Start exploring artworks to get personalized recommendations!"
            }

        # Sort by timestamp (most recent first)
        history_entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        
        # DEBUG: Count entries with artwork_id
        entries_with_artwork = [h for h in history_entries if h.get("artwork_id")]
        logger.info(f"📊 Entries with artwork_id: {len(entries_with_artwork)}/{len(history_entries)}")
        
        # Process history for recommendations
        search_based, purchase_based, upload_based, view_based = [], [], [], []
        exclude_ids, seen_ids = set(), set()

        # Collect exclude ids from all actions that involve specific artworks
        # Only exclude artworks that actually exist in the database/FAISS index
        for h in history_entries:
            artwork_id = h.get("artwork_id")
            if artwork_id:
                # Only add to exclude list if artwork exists in FAISS index (meaning it's valid)
                if artwork_id in id_map:
                    exclude_ids.add(artwork_id)

        logger.info(f"🚫 Excluding {len(exclude_ids)} existing artworks from recommendations")

        # Process search queries - only process recent and unique ones
        processed_queries = set()
        search_queries = []
        
        for h in history_entries:
            if h.get("action") == "search" and h.get("query"):
                query = h.get("query").strip().lower()
                if query and query not in processed_queries and len(query) > 1:
                    search_queries.append({
                        "query": query,
                        "timestamp": h.get("timestamp"),
                        "artwork_id": h.get("artwork_id")
                    })
                    processed_queries.add(query)
        
        # Sort by timestamp and take top queries
        search_queries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        search_queries = search_queries[:5]  # Top 5 most recent unique queries (reduced from 8 for performance)
        
        logger.info(f"🔍 Processing {len(search_queries)} unique recent search queries: {[sq.get('query') for sq in search_queries]}")
        
        # ✅ OPTIMIZATION: Process search queries in parallel
        async def process_search_query(search_item):
            query = search_item.get("query")
            logger.debug(f"🔍 Processing search query: '{query}'")
            
            try:
                # Create embedding from the search query itself
                query_cleaned = clean_text(query)
                if query_cleaned.strip():
                    query_vec = create_embedding(query_cleaned)
                    
                    # Use very lenient threshold for all queries due to limited artwork content
                    threshold = 3.0  # Very lenient threshold
                    search_k = 8  # Search for more results
                    
                    logger.debug(f"🔍 Using threshold {threshold} for query '{query}'")
                    
                    # Search for similar artworks using the query
                    # Note: exclude_ids and seen_ids are shared, but search_similar handles this safely
                    current_exclude = exclude_ids.union(seen_ids)
                    results = await search_similar(
                        query_vec, search_k, threshold=threshold, exclude_ids=current_exclude
                    )
                    
                    return results, query
                else:
                    logger.warning(f"⚠️ Empty cleaned query for search: '{query}'")
                    return [], query
                    
            except Exception as e:
                logger.error(f"❌ Error processing search query '{query}': {e}")
                return [], query
        
        # ✅ OPTIMIZATION: Process all search queries in parallel
        if search_queries:
            search_tasks = [process_search_query(sq) for sq in search_queries]
            search_results_list = await asyncio.gather(*search_tasks, return_exceptions=True)
            
            # Process results
            for result in search_results_list:
                if isinstance(result, Exception):
                    logger.error(f"❌ Error in parallel search query processing: {result}")
                    continue
                
                results, query = result
                # Add search context to results
                for r in results:
                    if r["_id"] not in seen_ids:
                        r["recommendation_reason"] = f"Based on your search for '{query}'"
                        seen_ids.add(r["_id"])
                        search_based.append(r)
                
                if results:
                    logger.debug(f"✅ Search-based from query: found {len(results)} recommendations for '{query}'")

        # ✅ OPTIMIZATION: Process other actions in parallel
        # ✅ OPTIMIZATION: Limit other actions to most recent ones to avoid excessive searches
        # Only process up to 10 most recent non-search actions
        other_actions = [h for h in history_entries if h.get("action") in ["purchase", "license_purchase", "upload", "view"] and h.get("artwork_id")]
        other_actions = other_actions[:10] 
        
        logger.debug(f"🎨 Processing {len(other_actions)} recent interactions for recommendations")
        
        async def process_action(h):
            artwork_id = h.get("artwork_id")
            action = h.get("action")
            
            # Check if artwork exists in FAISS
            if artwork_id not in id_map:
                # Silently skip if not in index (AI models disabled)
                return None, None
            
            logger.debug(f"🎨 Processing {action}: {artwork_id}")
            vec = get_vector_from_faiss(artwork_id)
            if vec is not None:
                # Use lenient threshold for content-based recommendations
                threshold = 2.5
                
                results = await search_similar(
                    vec, k, threshold=threshold, exclude_ids=exclude_ids.union(seen_ids)
                )
                
                return results, action
            return None, None
        
        # ✅ OPTIMIZATION: Process actions in parallel (limit concurrency to avoid overwhelming)
        processed_actions_count = 0
        if other_actions:
            # Process in batches to avoid too many concurrent requests
            batch_size = 5
            for i in range(0, len(other_actions), batch_size):
                # Check if we already have plenty of recommendations
                if len(seen_ids) >= k * 2:
                    logger.info(f"🛑 Already have {len(seen_ids)} recommendations, stopping action processing early")
                    break
                    
                batch = other_actions[i:i + batch_size]
                action_tasks = [process_action(h) for h in batch]
                action_results = await asyncio.gather(*action_tasks, return_exceptions=True)
                
                for result in action_results:
                    if isinstance(result, Exception):
                        logger.error(f"❌ Error in parallel action processing: {result}")
                        continue
                    
                    results, action = result
                    if results and action:
                        for r in results:
                            if r["_id"] not in seen_ids:
                                # Add context based on action type
                                if action in ["purchase", "license_purchase"]:
                                    r["recommendation_reason"] = "Similar to artworks you purchased"
                                    purchase_based.append(r)
                                elif action == "upload":
                                    r["recommendation_reason"] = "Similar to artworks you uploaded"
                                    upload_based.append(r)
                                elif action == "view":
                                    r["recommendation_reason"] = "Similar to artworks you viewed"
                                    view_based.append(r)
                                
                                seen_ids.add(r["_id"])
                        
                        processed_actions_count += 1

        logger.info(f"📈 Processed {len(search_queries)} search queries and {processed_actions_count} other actions")
        logger.info(f"📈 Recommendation counts - Search: {len(search_based)}, Purchase: {len(purchase_based)}, Upload: {len(upload_based)}, View: {len(view_based)}")

        logger.info(f"✅ Recommendations processed - Search: {len(search_based)}, Purchase: {len(purchase_based)}, Upload: {len(upload_based)}, View: {len(view_based)}")

        # Create "recommended_for_you" with intelligent mixing
        recommended_for_you = []
        
        # Priority 1: Recent search-based recommendations
        recent_search_count = min(5, len(search_based))
        recommended_for_you.extend(search_based[:recent_search_count])
        
        # Priority 2: Other interaction-based recommendations
        purchase_count = min(2, len(purchase_based))
        recommended_for_you.extend(purchase_based[:purchase_count])
        
        view_count = min(2, len(view_based))
        recommended_for_you.extend(view_based[:view_count])
        
        upload_count = min(1, len(upload_based))
        recommended_for_you.extend(upload_based[:upload_count])
        
        # Remove duplicates while preserving order
        seen_recommendations = set()
        unique_recommended = []
        for rec in recommended_for_you:
            if rec["_id"] not in seen_recommendations:
                unique_recommended.append(rec)
                seen_recommendations.add(rec["_id"])

        # Add diverse fallbacks if we don't have enough recommendations
        if len(unique_recommended) < k:
            logger.info(f"🔄 Adding diverse recommendations, only have {len(unique_recommended)}")
            
            # Prioritize artworks with better descriptions/content
            collection = get_artwork_collection()
            
            # ✅ Build filter query for listed artworks
            filter_query = {
                "token_id": {"$ne": None, "$exists": True},
                "$or": [
                    {"is_for_sale": True},
                    {"is_for_sale": {"$exists": False}}  # Legacy artworks
                ]
            }
            
            all_artworks = await collection.find(filter_query).to_list(length=None)
            logger.info(f"📊 Found {len(all_artworks)} artworks for diverse recommendations")
            
            # ✅ Debug: Log breakdown of found artworks
            if len(all_artworks) > 0:
                on_chain_in_results = sum(1 for art in all_artworks if art.get('is_on_chain') is True or art.get('registration_method') == 'on-chain')
                logger.info(f"🔍 Diverse fallbacks: {on_chain_in_results} on-chain/competition artworks")
            
            # Score artworks by content quality (longer descriptions = better)
            scored_artworks = []
            excluded_count = 0
            already_recommended_count = 0
            payment_filtered_count = 0
            
            for art in all_artworks:
                art_id = str(art.get('_id'))
                
                # Skip if already recommended
                if art_id in seen_recommendations:
                    already_recommended_count += 1
                    continue
                
                # Only exclude if artwork ID is actually in the database (not deleted)
                if art_id in exclude_ids and art_id in id_map:
                    excluded_count += 1
                    continue
                    
                title = art.get('title', '')
                description = art.get('description', '')
                content_score = len(title) + len(description)
                
                # Include artworks even with minimal content (they might still be valid)
                scored_artworks.append({
                    'artwork': art,
                    'score': content_score,
                    'id': art_id
                })
            
            logger.info(f"📊 Diverse recommendations stats: {len(scored_artworks)} scored, {excluded_count} excluded, {already_recommended_count} already recommended")
            
            # Sort by content quality (highest first)
            scored_artworks.sort(key=lambda x: x['score'], reverse=True)
            
            diverse_added = 0
            needed = k - len(unique_recommended)
            for scored_art in scored_artworks:
                if diverse_added >= needed:
                    break
                    
                art = scored_art['artwork']
                art_id = scored_art['id']
                
                # Get full artwork data using ArtworkPublic model for consistency
                try:
                    from app.db.models import ArtworkInDB, ArtworkPublic
                    artwork_db_model = ArtworkInDB.validate_document(art)
                    artwork_public = ArtworkPublic.from_db_model(artwork_db_model)
                    art_dict = artwork_public.model_dump()
                    
                    art_data = {
                        "_id": art_id,
                        "title": art_dict.get('title', 'No title'),
                        "description": art_dict.get('description', ''),
                        "image_url": art_dict.get('image_url'),
                        "creator_address": art_dict.get('creator_address'),
                        "royalty_percentage": art_dict.get('royalty_percentage'),
                        "is_licensed": art_dict.get('is_licensed', False),
                        "token_id": art_dict.get('token_id'),
                        "price": art_dict.get('price', 0),
                        "recommendation_reason": "Popular in our collection",
                        "similarity_score": 0.4  # Default score for diverse recommendations
                    }
                except Exception as e:
                    logger.debug(f"⚠️ Error processing artwork {art_id} for diverse recommendations: {e}")
                    # Fallback to basic data (with validation)
                    try:
                        from app.db.models import ArtworkInDB
                        art_validated = ArtworkInDB.validate_document(art).model_dump(by_alias=True)
                        art = art_validated
                    except:
                        pass  # Use raw art if validation fails
                    
                    art_data = {
                        "_id": art_id,
                        "title": art.get('title', 'No title'),
                        "description": art.get('description', ''),
                        "token_id": art.get('token_id'),
                        "price": art.get('price', 0),
                        # ✅ Include is_on_chain and registration_method for frontend filtering
                        "is_on_chain": art.get('is_on_chain'),
                        "registration_method": art.get('registration_method'),
                        "recommendation_reason": "Popular in our collection",
                        "similarity_score": 0.4
                    }
                
                unique_recommended.append(art_data)
                seen_recommendations.add(art_id)
                diverse_added += 1
            
            logger.info(f"🎲 Added {diverse_added} diverse recommendations based on content quality (needed {needed})")

        # Final shuffle for variety (but keep some search-based at front)
        if unique_recommended:
            # Keep first 2-3 search-based results at front, shuffle the rest
            if len(unique_recommended) > 3:
                front_items = unique_recommended[:3]
                remaining_items = unique_recommended[3:]
                random.shuffle(remaining_items)
                unique_recommended = front_items + remaining_items
            else:
                random.shuffle(unique_recommended)

        logger.info(f"🎉 Final recommendations: {len(unique_recommended)} unique artworks")

        # ✅ Build response
        result = {
            "recommendations": {
                "search_based": search_based,
                "purchase_based": purchase_based,
                "upload_based": upload_based,
                "view_based": view_based,
                "recommended_for_you": unique_recommended,
            },
            "has_history": True,
            "debug_info": {
                "total_history_entries": len(history_entries),
                "entries_with_artwork_id": len(entries_with_artwork),
                "processed_search_queries": len(search_queries),
                "processed_other_actions": processed_actions_count,
                "excluded_artworks": len(exclude_ids),
                "final_recommendation_count": len(unique_recommended),
                "artwork_content_stats": {
                    "total_artworks": 16,
                    "flower_artworks": 1,
                    "limited_content_warning": "Only 1 artwork contains flower-related content"
                }
            },
            "message": f"Found {len(unique_recommended)} personalized recommendations based on your activity"
        }
        
        # ✅ REDIS CACHE: Cache the results for 30 minutes (1800 seconds)
        try:
            cache_filters = {}
            set_recommendations_cache(user_id, cache_filters, result, ttl=1800)
            logger.info(f"💾 Cached recommendations for user {user_id} (TTL: 30 min)")
        except Exception as cache_error:
            # Don't fail if caching fails - just log it
            logger.warning(f"⚠️ Failed to cache recommendations: {cache_error}")
        
        return result
    except Exception as e:
        logger.error(f"Recommendation failed for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")
    
@router.get("/search/debug")
async def search_debug():
    """Detailed debug information"""
    try:
        collection = get_artwork_collection()
        # FIX: Check if collection is None, not truthy
        if collection is None:
            mongo_count = 0
            sample_artworks = []
        else:
            mongo_count = await collection.count_documents({})
            sample_artworks = await collection.find().limit(3).to_list(length=3)
        
        return {
            "faiss_loaded": faiss_loaded,
            "index_size": index.ntotal if index else 0,
            "id_map_size": len(id_map),
            "mongo_artworks_count": mongo_count,
            "model_loaded": model is not None,
            "index_file_exists": os.path.exists(INDEX_FILE),
            "idmap_file_exists": os.path.exists(IDMAP_FILE),
            "mongo_initialized": is_mongo_initialized(),
            "sample_artworks_structure": [
                {
                    "_id": str(art.get("_id")),
                    "title": art.get("title"),
                    "description": art.get("description"),
                    "category": art.get("category"),
                    "has_title": bool(art.get("title")),
                    "has_description": bool(art.get("description")),
                    "has_category": bool(art.get("category"))
                } for art in sample_artworks
            ] if sample_artworks else [],
            "status": "healthy" if faiss_loaded and model else "unhealthy"
        }
    except Exception as e:
        logger.error(f"Debug endpoint error: {e}")
        return {"error": str(e)}
    
@router.get("/search/inspect-index")
async def inspect_index():
    """Inspect what's actually in the FAISS index"""
    if not faiss_loaded or index is None:
        return {"error": "FAISS index not loaded"}
    
    collection = get_artwork_collection()
    indexed_artworks = []
    errors = []
    
    logger.info(f"🔍 Inspecting index: {len(id_map)} artworks in id_map")
    
    # Get details for all artworks in the index
    for i, art_id in enumerate(id_map):
        try:
            logger.debug(f"Fetching artwork {i+1}/{len(id_map)}: {art_id}")
            art = await universal_find_artwork(art_id)
            
            if art:
                title = art.get('title', 'No title')
                description = art.get('description', 'No description')
                category = art.get('category', 'No category')
                
                # Create the text that was indexed
                indexed_text = clean_text(f"{title} {description} {category}")
                
                indexed_artworks.append({
                    "index_position": i,
                    "artwork_id": str(art["_id"]),
                    "title": title,
                    "description": description[:100] + "..." if description and len(description) > 100 else description,
                    "category": category,
                    "indexed_text": indexed_text,
                    "token_id": art.get('token_id', 'N/A')
                })
                logger.debug(f"✅ Successfully fetched artwork {art_id}")
            else:
                errors.append({
                    "artwork_id": art_id,
                    "error": "Artwork not found in MongoDB"
                })
                logger.warning(f"❌ Artwork {art_id} not found in MongoDB")
                
        except Exception as e:
            error_msg = f"Error fetching artwork {art_id}: {str(e)}"
            errors.append({
                "artwork_id": art_id,
                "error": error_msg
            })
            logger.error(error_msg)
    
    logger.info(f"✅ Inspection complete: {len(indexed_artworks)} successful, {len(errors)} errors")
    
    return {
        "total_indexed": len(indexed_artworks),
        "successful_fetches": len(indexed_artworks),
        "failed_fetches": len(errors),
        "indexed_artworks": indexed_artworks,
        "errors": errors[:10]  # Return first 10 errors to avoid huge response
    }

@router.get("/search/compare-mongo-faiss")
async def compare_mongo_faiss():
    """Compare what's in MongoDB vs what's in FAISS index"""
    try:
        collection = get_artwork_collection()
        
        # Get all artworks from MongoDB
        mongo_artworks = await collection.find().to_list(length=None)
        
        # Get FAISS indexed artworks
        faiss_artwork_ids = set(id_map)
        
        mongo_artworks_details = []
        for art in mongo_artworks:
            art_id = str(art["_id"])
            in_faiss = art_id in faiss_artwork_ids
            
            mongo_artworks_details.append({
                "artwork_id": art_id,
                "title": art.get('title', 'No title'),
                "description": art.get('description', 'No description'),
                "category": art.get('category', 'No category'),
                "token_id": art.get('token_id', 'N/A'),
                "in_faiss_index": in_faiss,
                "has_title": bool(art.get('title')),
                "has_description": bool(art.get('description')),
                "has_category": bool(art.get('category')),
                "combined_text": f"{art.get('title', '')} {art.get('description', '')} {art.get('category', '')}".strip()
            })
        
        return {
            "mongo_total": len(mongo_artworks),
            "faiss_total": len(faiss_artwork_ids),
            "missing_from_faiss": len(mongo_artworks) - len(faiss_artwork_ids),
            "artworks": mongo_artworks_details
        }
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        return {"error": str(e)}
    
    
@router.get("/search/check-files")
async def check_faiss_files():
    """Check the actual FAISS index and ID map files"""
    try:
        index_exists = os.path.exists(INDEX_FILE)
        idmap_exists = os.path.exists(IDMAP_FILE)
        
        index_size = 0
        idmap_size = 0
        actual_id_map = []
        
        if index_exists:
            temp_index = faiss.read_index(INDEX_FILE)
            index_size = temp_index.ntotal
            del temp_index
            
        if idmap_exists:
            actual_id_map = np.load(IDMAP_FILE, allow_pickle=True).tolist()
            idmap_size = len(actual_id_map)
        
        return {
            "index_file_exists": index_exists,
            "index_file_size": index_size,
            "idmap_file_exists": idmap_exists,
            "idmap_file_size": idmap_size,
            "actual_id_map": actual_id_map,
            "global_id_map_size": len(id_map),
            "global_index_size": index.ntotal if index else 0,
            "files_match_global": index_size == len(id_map) and idmap_size == len(id_map)
        }
    except Exception as e:
        return {"error": str(e)}
    

@router.post("/search/hard-reset")
async def hard_reset_index():
    """Completely reset and rebuild the FAISS index"""
    global index, id_map, faiss_loaded
    
    try:
        # Delete existing files
        if os.path.exists(INDEX_FILE):
            os.remove(INDEX_FILE)
        if os.path.exists(IDMAP_FILE):
            os.remove(IDMAP_FILE)
        
        logger.info("🗑️ Deleted existing FAISS files")
        
        # Reset global variables
        index = None
        id_map = []
        faiss_loaded = False
        
        # Wait a bit
        await asyncio.sleep(1)
        
        # Rebuild from scratch
        await rebuild_faiss_index()
        save_faiss()
        
        return {
            "message": "Hard reset completed",
            "new_index_size": index.ntotal if index else 0,
            "new_id_map_size": len(id_map),
            "faiss_loaded": faiss_loaded
        }
    except Exception as e:
        logger.error(f"Hard reset failed: {e}")
        return {"error": str(e)}
    
@router.get("/search/debug-artwork")
async def debug_artwork_search(artwork_id: str = Query(..., description="Artwork ID to debug")):
    """Debug why a specific artwork isn't being found in search"""
    try:
        if not faiss_loaded or index is None:
            return {"error": "FAISS not loaded"}
        
        collection = get_artwork_collection()
        
        # Get the specific artwork
        artwork = await collection.find_one({"_id": ObjectId(artwork_id)})
        if not artwork:
            return {"error": f"Artwork {artwork_id} not found in MongoDB"}
        
        # Check if it's in FAISS
        if artwork_id not in id_map:
            return {"error": f"Artwork {artwork_id} not in FAISS index"}
        
        artwork_idx = id_map.index(artwork_id)
        
        # Get the artwork's vector and text
        title = artwork.get('title', '')
        description = artwork.get('description', '')
        category = artwork.get('category', '')
        combined_text = f"{title} {description} {category}"
        cleaned_text = clean_text(combined_text)
        
        artwork_vec = index.reconstruct(artwork_idx)
        
        # Test search with the artwork's own text
        test_query = title  # Search by its own title
        query_cleaned = clean_text(test_query)
        query_vec = create_embedding(query_cleaned)
        
        # Calculate similarity with itself
        self_distance = np.linalg.norm(query_vec - artwork_vec)
        self_similarity = 1 - self_distance
        
        return {
            "artwork": {
                "id": artwork_id,
                "title": title,
                "description": description[:200] + "..." if len(description) > 200 else description,
                "combined_text": combined_text,
                "cleaned_text": cleaned_text,
                "in_faiss_index": True,
                "faiss_index_position": artwork_idx
            },
            "self_similarity_test": {
                "query_used": test_query,
                "query_cleaned": query_cleaned,
                "distance_to_self": float(self_distance),
                "similarity_to_self": float(self_similarity),
                "would_be_found": self_distance <= 1.5
            }
        }
        
    except Exception as e:
        logger.error(f"Debug artwork error: {e}")
        return {"error": str(e)}


@router.api_route("/search/reindex-missing", methods=["GET", "POST"])
async def reindex_missing_artworks():
    """
    Re-index artworks that are in MongoDB but missing from FFAISS index.
    This fixes the 'not in FFAISS index' warnings.
    
    Note: This endpoint is accessible without authentication for maintenance purposes.
    """
    global index, id_map, faiss_loaded
    
    if not faiss_loaded or index is None:
        raise HTTPException(status_code=503, detail="FAISS index not loaded")
    
    if not is_mongo_initialized():
        raise HTTPException(status_code=503, detail="MongoDB not initialized")
    
    try:
        collection = get_artwork_collection()
        
        # Get all artworks from MongoDB
        all_artworks = await collection.find().to_list(length=None)
        logger.info(f"📊 Found {len(all_artworks)} artworks in MongoDB")
        
        # Find artworks missing from FFAISS index
        missing_artworks = []
        for art in all_artworks:
            art_id = str(art.get('_id'))
            if art_id not in id_map:
                missing_artworks.append((art_id, art))
        
        logger.info(f"🔍 Found {len(missing_artworks)} artworks missing from FFAISS index")
        
        if len(missing_artworks) == 0:
            return {
                "success": True,
                "message": "All artworks are already indexed",
                "indexed_count": 0,
                "total_artworks": len(all_artworks)
            }
        
        # Re-index missing artworks
        indexed_count = 0
        error_count = 0
        
        for art_id, art_doc in missing_artworks:
            try:
                success = await add_artwork_to_faiss(art_id, art_doc)
                if success:
                    indexed_count += 1
                else:
                    error_count += 1
            except Exception as e:
                logger.error(f"❌ Error indexing artwork {art_id}: {e}")
                error_count += 1
                continue
        
        logger.info(f"✅ Re-indexing complete: {indexed_count} indexed, {error_count} errors")
        
        return {
            "success": True,
            "message": f"Re-indexed {indexed_count} missing artworks",
            "indexed_count": indexed_count,
            "error_count": error_count,
            "total_artworks": len(all_artworks),
            "faiss_index_size": index.ntotal
        }
        
    except Exception as e:
        logger.error(f"❌ Error re-indexing missing artworks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Re-indexing failed: {str(e)}")

@router.post("/search/migrate-to-string-ids")
async def migrate_to_string_ids():
    """Migrate FAISS index to use string IDs instead of ObjectIds"""
    global index, id_map, faiss_loaded
    
    try:
        collection = get_artwork_collection()
        
        # Get all artworks from MongoDB
        artworks = await collection.find().to_list(length=None)
        
        logger.info(f"🔄 Migrating {len(artworks)} artworks to string IDs...")
        
        # Create new index with string IDs
        new_index = faiss.IndexFlatL2(embedding_dim)
        new_id_map = []
        
        migrated_count = 0
        error_count = 0
        
        for art in artworks:
            try:
                art_id = art["_id"]
                
                # Convert to string ID (regardless of original format)
                string_id = str(art_id)
                
                # Only add if not already in the new index
                if string_id not in new_id_map:
                    title = art.get('title', '')
                    description = art.get('description', '')
                    category = art.get('category', '')
                    
                    combined_text = f"{title} {description} {category}"
                    cleaned_text = clean_text(combined_text)
                    
                    if cleaned_text.strip():
                        vector = create_embedding(cleaned_text)
                        new_index.add(vector)
                        new_id_map.append(string_id)
                        migrated_count += 1
                        
            except Exception as e:
                logger.error(f"Error migrating artwork {art.get('_id')}: {e}")
                error_count += 1
                continue
        
        # Replace the global index and id_map
        index = new_index
        id_map = new_id_map
        faiss_loaded = True
        
        # Save the migrated index
        save_faiss()
        
        logger.info(f"✅ Migration completed: {migrated_count} artworks migrated, {error_count} errors")
        
        return {
            "message": "FAISS index migrated to string IDs",
            "migrated_count": migrated_count,
            "error_count": error_count,
            "new_faiss_size": index.ntotal,
            "new_id_map_size": len(id_map)
        }
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return {"error": str(e)}
    
@router.post("/search/quick-fix-ids")
async def quick_fix_ids():
    """Quick fix: Rebuild FAISS with only string IDs"""
    global index, id_map, faiss_loaded
    
    try:
        # Delete old files
        if os.path.exists(INDEX_FILE):
            os.remove(INDEX_FILE)
        if os.path.exists(IDMAP_FILE):
            os.remove(IDMAP_FILE)
        
        # Reset and rebuild
        index = None
        id_map = []
        faiss_loaded = False
        
        await asyncio.sleep(1)
        await rebuild_faiss_index()  # This should now use string IDs
        save_faiss()
        
        return {
            "message": "Quick fix applied - FAISS rebuilt with string IDs",
            "new_index_size": index.ntotal if index else 0
        }
    except Exception as e:
        return {"error": str(e)}
    
@router.get("/search/check-user-history/{user_id}")
async def check_user_history(user_id: str):
    """Check if user has any history for recommendations"""
    try:
        from services.user_history_service import UserHistoryService
        
        history_entries = await UserHistoryService.get_user_history(user_id, limit=50)
        
        # Group by action type
        action_counts = {}
        for entry in history_entries:
            action = entry.get("action", "unknown")
            action_counts[action] = action_counts.get(action, 0) + 1
        
        return {
            "user_id": user_id,
            "total_history_entries": len(history_entries),
            "action_breakdown": action_counts,
            "recent_entries": history_entries[:10]  # First 10 entries
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/search/all-users-history")
async def get_all_users_history():
    """Get history for all users (admin endpoint)"""
    try:
        history_collection = get_user_history_collection()
        
        # Get unique users with history
        pipeline = [
            {"$group": {
                "_id": "$user_id",
                "total_actions": {"$sum": 1},
                "actions": {"$push": {"action": "$action", "timestamp": "$timestamp"}},
                "last_action": {"$max": "$timestamp"}
            }},
            {"$sort": {"last_action": -1}},
            {"$limit": 20}
        ]
        
        users_history = await history_collection.aggregate(pipeline).to_list(length=20)
        
        return {
            "total_users_with_history": len(users_history),
            "users": users_history
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/search/simulate-user-activity/{user_id}")
async def simulate_user_activity(user_id: str):
    """Simulate user activity for testing recommendations"""
    try:
        from services.user_history_service import UserHistoryService
        
        # Get some artwork IDs from FAISS for simulation
        test_artwork_ids = id_map[:5] if id_map else []
        
        if not test_artwork_ids:
            return {"error": "No artworks available for simulation"}
        
        # Simulate different user actions
        actions = [
            ("search", "landscape painting", test_artwork_ids[0]),
            ("view", None, test_artwork_ids[1]),
            ("search", "abstract art", test_artwork_ids[2]),
            ("view", None, test_artwork_ids[3]),
            ("search", "watercolor flowers", test_artwork_ids[4])
        ]
        
        simulated_count = 0
        for action_type, query, artwork_id in actions:
            await UserHistoryService.log_user_action(
                user_id=user_id,
                action=action_type,
                artwork_id=artwork_id,
                query=query
            )
            simulated_count += 1
            await asyncio.sleep(0.1)  # Small delay between actions
        
        return {
            "message": f"Simulated {simulated_count} user actions for user {user_id}",
            "simulated_actions": [a[0] for a in actions],
            "user_id": user_id
        }
    except Exception as e:
        return {"error": str(e)}
    
@router.get("/search/debug-token")
async def debug_token(request: Request, current_user: User = Depends(get_current_user_optional)):
    """Debug token reception and user extraction"""
    headers = dict(request.headers)
    
    debug_info = {
        "authenticated": current_user is not None,
        "current_user": current_user,
        "headers_received": {
            "authorization": headers.get("authorization", "NOT FOUND"),
            "content_type": headers.get("content-type"),
            "user_agent": headers.get("user-agent")
        }
    }
    
    # Log the authentication status
    if current_user:
        logger.info(f"✅ DEBUG: User authenticated: {current_user}")
    else:
        logger.warning(f"❌ DEBUG: User NOT authenticated. Authorization header: {headers.get('authorization')}")
    
    return debug_info

@router.get("/search/test-auth")
async def test_auth(current_user: User = Depends(get_current_user_optional)):
    """Simple test endpoint for auth"""
    if current_user:
        return {
            "status": "authenticated", 
            "user_id": getattr(current_user, 'id', None),
            "user_data": current_user
        }
    else:
        return {"status": "not_authenticated"}


@router.get("/search/decode-token")
async def decode_token(request: Request, current_user: User = Depends(get_current_user_optional)):
    """Decode and inspect the JWT token contents"""
    from app.core.security import decode_token as security_decode_token
    
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    
    decoded_info = {
        "raw_token": token[:50] + "..." if token else "No token",
        "decoded_payload": None,
        "current_user_from_dependency": current_user
    }
    
    if token:
        try:
            payload = security_decode_token(token)
            decoded_info["decoded_payload"] = payload
        except Exception as e:
            decoded_info["decoded_error"] = str(e)
    
    return decoded_info

@router.get("/search/debug-artwork-content")
async def debug_artwork_content():
    """Debug what text content is actually in the artworks"""
    try:
        collection = get_artwork_collection()
        artworks = await collection.find().to_list(length=None)
        
        artwork_content = []
        for art in artworks:
            art_id = str(art.get('_id'))
            title = art.get('title', '')
            description = art.get('description', '')
            category = art.get('category', '')
            
            combined_text = f"{title} {description} {category}"
            cleaned_text = clean_text(combined_text)
            
            artwork_content.append({
                "artwork_id": art_id,
                "title": title,
                "description": description[:100] + "..." if len(description) > 100 else description,
                "category": category,
                "combined_text": combined_text,
                "cleaned_text": cleaned_text,
                "has_flower_content": "flower" in cleaned_text.lower()
            })
        
        # Count how many artworks have flower-related content
        flower_artworks = [art for art in artwork_content if art["has_flower_content"]]
        
        return {
            "total_artworks": len(artwork_content),
            "flower_artworks_count": len(flower_artworks),
            "flower_artworks": flower_artworks,
            "all_artworks": artwork_content
        }
    except Exception as e:
        return {"error": str(e)}