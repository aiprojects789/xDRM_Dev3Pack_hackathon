"""
Usage Monitoring Service — Track all artwork interaction events for DRM.
Logs VIEW, DOWNLOAD, SCREENSHOT_ATTEMPT events to MongoDB.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from enum import Enum

logger = logging.getLogger(__name__)


class UsageEventType(str, Enum):
    VIEW = "VIEW"
    PREVIEW_VIEW = "PREVIEW_VIEW"
    DOWNLOAD = "DOWNLOAD"
    SCREENSHOT_ATTEMPT = "SCREENSHOT_ATTEMPT"


class UsageMonitoringService:
    """Service for logging and querying artwork usage events"""

    def __init__(self, db):
        self.db = db
        self.collection = db.usage_events
        from app.utils.artwork import resolve_artwork_identifier
        self.resolve_artwork_identifier = resolve_artwork_identifier

    async def log_event(
        self,
        event_type: UsageEventType,
        artwork_identifier: str,
        user_id: Optional[str] = None,
        license_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Log a usage event.

        Args:
            event_type: Type of event (VIEW, DOWNLOAD, etc.)
            token_id: Artwork token ID
            user_id: User ID (None for anonymous views)
            license_id: License ID if applicable
            ip_address: Client IP address
            user_agent: Client user agent string
            metadata: Additional event data

        Returns:
            Inserted event ID as string
        """
        try:
            # Resolve artwork first
            artwork = await self.resolve_artwork_identifier(artwork_identifier)
            token_id = artwork.get("token_id") if artwork else None
            artwork_id = str(artwork.get("_id")) if artwork else None
            
            event_doc = {
                "event_type": event_type.value if isinstance(event_type, UsageEventType) else event_type,
                "token_id": token_id,
                "artwork_id": artwork_id,
                "user_id": user_id,
                "license_id": license_id,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "metadata": metadata or {},
                "timestamp": datetime.utcnow(),
            }

            result = await self.collection.insert_one(event_doc)
            event_id = str(result.inserted_id)

            logger.info(
                f"📊 Usage event logged: {event_type} | "
                f"artwork=#{artwork_identifier} | user={user_id or 'anon'}"
            )

            return event_id

        except Exception as e:
            logger.error(f"❌ Failed to log usage event: {e}")
            return ""

    async def get_artwork_stats(
        self, artwork_identifier: str, days: int = 30
    ) -> Dict[str, Any]:
        """
        Get usage statistics for an artwork.

        Args:
            token_id: Artwork token ID
            days: Number of days to look back

        Returns:
            Dict with aggregated statistics
        """
        try:
            # Resolve artwork first
            artwork = await self.resolve_artwork_identifier(artwork_identifier)
            if not artwork:
                return {"success": False, "error": "Artwork not found"}
                
            token_id = artwork.get("token_id")
            artwork_id = str(artwork.get("_id"))
            
            since = datetime.utcnow() - timedelta(days=days)

            pipeline = [
                {
                    "$match": {
                        "$or": [
                            {"token_id": token_id},
                            {"artwork_id": artwork_id},
                            {"artwork_id": artwork_identifier}
                        ],
                        "timestamp": {"$gte": since},
                    }
                },
                {
                    "$group": {
                        "_id": "$event_type",
                        "count": {"$sum": 1},
                        "last_event": {"$max": "$timestamp"},
                    }
                },
            ]

            cursor = self.collection.aggregate(pipeline)
            results = await cursor.to_list(length=100)

            # Build stats dict
            stats = {
                "token_id": token_id,
                "artwork_id": artwork_id,
                "period_days": days,
                "total_views": 0,
                "total_preview_views": 0,
                "total_downloads": 0,
                "total_screenshot_attempts": 0,
                "last_viewed": None,
                "last_downloaded": None,
            }

            for result in results:
                event_type = result["_id"]
                count = result["count"]
                last_event = result.get("last_event")

                if event_type == "VIEW":
                    stats["total_views"] = count
                    stats["last_viewed"] = last_event.isoformat() if last_event else None
                elif event_type == "PREVIEW_VIEW":
                    stats["total_preview_views"] = count
                elif event_type == "DOWNLOAD":
                    stats["total_downloads"] = count
                    stats["last_downloaded"] = last_event.isoformat() if last_event else None
                elif event_type == "SCREENSHOT_ATTEMPT":
                    stats["total_screenshot_attempts"] = count

            stats["total_interactions"] = (
                stats["total_views"]
                + stats["total_preview_views"]
                + stats["total_downloads"]
                + stats["total_screenshot_attempts"]
            )

            return stats

        except Exception as e:
            logger.error(f"❌ Failed to get artwork stats: {e}")
            return {"artwork_identifier": artwork_identifier, "error": str(e)}

    async def get_recent_activity(
        self, artwork_identifier: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get recent activity events for an artwork"""
        try:
            # Resolve artwork first
            artwork = await self.resolve_artwork_identifier(artwork_identifier)
            token_id = artwork.get("token_id") if artwork else None
            artwork_id = str(artwork.get("_id")) if artwork else None
            
            cursor = (
                self.collection.find(
                    {
                        "$or": [
                            {"token_id": token_id},
                            {"artwork_id": artwork_id},
                            {"artwork_id": artwork_identifier}
                        ]
                    },
                    {"_id": 0, "event_type": 1, "user_id": 1, "timestamp": 1, "metadata": 1},
                )
                .sort("timestamp", -1)
                .limit(limit)
            )

            events = await cursor.to_list(length=limit)

            # Format timestamps
            for event in events:
                if "timestamp" in event and event["timestamp"]:
                    event["timestamp"] = event["timestamp"].isoformat()

            return events

        except Exception as e:
            logger.error(f"❌ Failed to get recent activity: {e}")
            return []

    async def get_daily_stats(
        self, artwork_identifier: str, days: int = 7
    ) -> List[Dict[str, Any]]:
        """Get daily breakdown of events for charts"""
        try:
            # Resolve artwork first
            artwork = await self.resolve_artwork_identifier(artwork_identifier)
            token_id = artwork.get("token_id") if artwork else None
            artwork_id = str(artwork.get("_id")) if artwork else None
            
            since = datetime.utcnow() - timedelta(days=days)

            pipeline = [
                {
                    "$match": {
                        "$or": [
                            {"token_id": token_id},
                            {"artwork_id": artwork_id},
                            {"artwork_id": artwork_identifier}
                        ],
                        "timestamp": {"$gte": since},
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "date": {
                                "$dateToString": {
                                    "format": "%Y-%m-%d",
                                    "date": "$timestamp",
                                }
                            },
                            "event_type": "$event_type",
                        },
                        "count": {"$sum": 1},
                    }
                },
                {"$sort": {"_id.date": 1}},
            ]

            cursor = self.collection.aggregate(pipeline)
            results = await cursor.to_list(length=500)

            # Restructure into daily format
            daily = {}
            for result in results:
                date = result["_id"]["date"]
                event_type = result["_id"]["event_type"]
                count = result["count"]

                if date not in daily:
                    daily[date] = {"date": date, "views": 0, "downloads": 0, "screenshot_attempts": 0}

                if event_type in ("VIEW", "PREVIEW_VIEW"):
                    daily[date]["views"] += count
                elif event_type == "DOWNLOAD":
                    daily[date]["downloads"] += count
                elif event_type == "SCREENSHOT_ATTEMPT":
                    daily[date]["screenshot_attempts"] += count

            return list(daily.values())

        except Exception as e:
            logger.error(f"❌ Failed to get daily stats: {e}")
            return []

    async def ensure_indexes(self):
        """Create MongoDB indexes for efficient queries"""
        try:
            await self.collection.create_index([("token_id", 1), ("timestamp", -1)])
            await self.collection.create_index([("artwork_id", 1), ("timestamp", -1)])
            await self.collection.create_index([("user_id", 1), ("timestamp", -1)])
            await self.collection.create_index([("event_type", 1), ("token_id", 1)])
            await self.collection.create_index("timestamp", expireAfterSeconds=90 * 86400)  # 90 day TTL
            logger.info("✅ Usage events indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Failed to create indexes: {e}")
