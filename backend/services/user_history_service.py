# app/services/user_history_service.py
from datetime import datetime
from typing import Optional, Dict, Any, Union
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict
from app.db.database import get_user_history_collection, get_artwork_collection
import logging

logger = logging.getLogger(__name__)

class UserHistory(BaseModel):
    user_id: str = Field(..., description="Unique ID of the user")
    action: str = Field(..., description="Action type: purchase, search, upload, or license_purchase")
    artwork_id: Optional[str] = Field(None, description="Artwork ID for all actions when available")
    artwork_token_id: Optional[Union[int, str]] = Field(None, description="Blockchain token ID if available")
    query: Optional[str] = Field(None, description="Search query if action is search")
    license_type: Optional[str] = Field(None, description="License type if action is license_purchase")
    metadata: Optional[dict] = Field(None, description="Additional metadata about the action")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Action timestamp")
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class UserHistoryInDB(UserHistory):
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")

class UserHistoryService:
    @staticmethod
    async def find_artwork_id_by_query(query: str) -> Optional[str]:
        """Find artwork IDs based on search query"""
        try:
            artworks_collection = get_artwork_collection()
            
            # Search in title, description, and categories
            search_filter = {
                "$or": [
                    {"title": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}},
                    {"medium_category": {"$regex": query, "$options": "i"}},
                    {"style_category": {"$regex": query, "$options": "i"}},
                    {"subject_category": {"$regex": query, "$options": "i"}}
                ]
            }
            
            artworks = await artworks_collection.find(search_filter).limit(5).to_list(length=5)
            
            if artworks:
                # Return the most relevant artwork ID (first match)
                return str(artworks[0]["_id"])
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to find artwork by query: {str(e)}")
            return None

    @staticmethod
    async def find_artwork_id_by_token_id(token_id: int) -> Optional[str]:
        """Find MongoDB artwork ID by blockchain token ID"""
        try:
            artworks_collection = get_artwork_collection()
            artwork = await artworks_collection.find_one({"token_id": token_id})
            return str(artwork["_id"]) if artwork else None
        except Exception as e:
            logger.error(f"Failed to find artwork by token_id: {str(e)}")
            return None

    @staticmethod
    async def log_user_action(
        user_id: str,
        action: str,
        artwork_id: Optional[str] = None,
        artwork_token_id: Optional[int] = None,
        query: Optional[str] = None,
        license_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log user action to history with artwork_id whenever possible"""
        try:
            history_collection = get_user_history_collection()
            
            # If we have token_id but not artwork_id, try to find artwork_id
            if artwork_token_id and not artwork_id:
                artwork_id = await UserHistoryService.find_artwork_id_by_token_id(artwork_token_id)
            
            # For search actions, try to find related artwork_id
            if action == "search" and query and not artwork_id:
                artwork_id = await UserHistoryService.find_artwork_id_by_query(query)
            
            history_entry = UserHistoryInDB(
                user_id=user_id,
                action=action,
                artwork_id=artwork_id,
                artwork_token_id=artwork_token_id,
                query=query,
                license_type=license_type,
                metadata=metadata or {},
                timestamp=datetime.utcnow()
            )
            
            result = await history_collection.insert_one(
                history_entry.model_dump(by_alias=True, exclude_none=True)
            )
            
            logger.info(f"Logged {action} action for user {user_id}, artwork_id: {artwork_id}")
            return str(result.inserted_id)
            
        except Exception as e:
            logger.error(f"Failed to log user history: {str(e)}")
            return None

    @staticmethod
    async def get_user_history(user_id: str, limit: int = 50):
        """Get user's recent history"""
        try:
            history_collection = get_user_history_collection()
            
            cursor = history_collection.find(
                {"user_id": user_id}
            ).sort("timestamp", -1).limit(limit)
            
            history_entries = await cursor.to_list(length=limit)
            return history_entries
            
        except Exception as e:
            logger.error(f"Failed to get user history: {str(e)}")
            return []

    @staticmethod
    async def get_user_artwork_interactions(user_id: str, artwork_id: str = None, artwork_token_id: int = None):
        """Get user's interactions with specific artwork"""
        try:
            history_collection = get_user_history_collection()
            
            filter_query = {"user_id": user_id}
            
            if artwork_id:
                filter_query["artwork_id"] = artwork_id
            elif artwork_token_id:
                filter_query["artwork_token_id"] = artwork_token_id
            
            cursor = history_collection.find(filter_query).sort("timestamp", -1)
            interactions = await cursor.to_list(length=50)
            return interactions
            
        except Exception as e:
            logger.error(f"Failed to get artwork interactions: {str(e)}")
            return []