"""
Instagram Service - Production-Grade Implementation for DRM Backend.
Features:
- Multi-account credential rotation
- Session rotation (hourly)
- Proxy rotation
- User-agent rotation
- Anti-detection delays
"""
import logging
import time
import random
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
import os

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import BulkWriteError

try:
    from instagrapi import Client
    from instagrapi.exceptions import LoginRequired, PleaseWaitFewMinutes
    INSTAGRAPI_AVAILABLE = True
except ImportError:
    INSTAGRAPI_AVAILABLE = False
    Client = None
    LoginRequired = Exception
    PleaseWaitFewMinutes = Exception

from bson import ObjectId

logger = logging.getLogger(__name__)


# ==========================
# Settings for Instagram
# ==========================

class InstagramSettings:
    """Settings for Instagram service - reads from environment."""
    
    def __init__(self):
        self.INSTAGRAM_USERNAMES = os.getenv("INSTAGRAM_USERNAMES", "")
        self.INSTAGRAM_PASSWORDS = os.getenv("INSTAGRAM_PASSWORDS", "")
        self.INSTAGRAM_SESSION_FILE = os.getenv("INSTAGRAM_SESSION_FILE", "instagram_session.json")
        self.SESSION_ROTATION_HOURS = int(os.getenv("SESSION_ROTATION_HOURS", "1"))
        self.PROXY_LIST = os.getenv("PROXY_LIST", "")
        self.REQUEST_DELAY_MIN = int(os.getenv("REQUEST_DELAY_MIN", "2"))
        self.REQUEST_DELAY_MAX = int(os.getenv("REQUEST_DELAY_MAX", "5"))
        
        self.USER_AGENTS = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        ]
    
    @property
    def instagram_usernames_list(self) -> List[str]:
        if not self.INSTAGRAM_USERNAMES:
            return []
        return [u.strip() for u in self.INSTAGRAM_USERNAMES.split(",") if u.strip()]
    
    @property
    def instagram_passwords_list(self) -> List[str]:
        if not self.INSTAGRAM_PASSWORDS:
            return []
        return [p.strip() for p in self.INSTAGRAM_PASSWORDS.split(",") if p.strip()]
    
    @property
    def proxy_list(self) -> List[str]:
        if not self.PROXY_LIST:
            return []
        return [p.strip() for p in self.PROXY_LIST.split(",") if p.strip()]
    
    @property
    def has_valid_instagram_credentials(self) -> bool:
        usernames = self.instagram_usernames_list
        passwords = self.instagram_passwords_list
        return len(usernames) > 0 and len(usernames) == len(passwords)


instagram_settings = InstagramSettings()


# ==========================
# Credential Manager
# ==========================

class CredentialManager:
    """Manages multiple Instagram credentials with rotation."""
    
    def __init__(self, usernames: List[str], passwords: List[str]):
        if len(usernames) != len(passwords):
            raise ValueError("Number of usernames must match number of passwords")
        if not usernames:
            raise ValueError("At least one credential pair is required")
        
        self.credentials = list(zip(usernames, passwords))
        self.current_index = 0
        self.session_created_at: Optional[datetime] = None
        self.rotation_hours = instagram_settings.SESSION_ROTATION_HOURS
        
    def get_current(self) -> Tuple[str, str]:
        return self.credentials[self.current_index]
    
    def get_current_username(self) -> str:
        return self.credentials[self.current_index][0]
    
    def rotate(self) -> Tuple[str, str]:
        self.current_index = (self.current_index + 1) % len(self.credentials)
        self.session_created_at = None
        logger.info(f"Rotated to credential index {self.current_index}")
        return self.get_current()
    
    def should_rotate_session(self) -> bool:
        if self.session_created_at is None:
            return True
        elapsed = datetime.now(timezone.utc) - self.session_created_at
        return elapsed.total_seconds() >= self.rotation_hours * 3600
    
    def mark_session_created(self):
        self.session_created_at = datetime.now(timezone.utc)
    
    def get_session_expiry(self) -> Optional[datetime]:
        if self.session_created_at is None:
            return None
        return self.session_created_at + timedelta(hours=self.rotation_hours)
    
    def get_session_file(self, index: Optional[int] = None) -> str:
        idx = index if index is not None else self.current_index
        base = instagram_settings.INSTAGRAM_SESSION_FILE.replace('.json', '')
        return f"{base}_{idx}.json"


# ==========================
# Request Enhancer
# ==========================

class RequestEnhancer:
    """Handles proxy and user-agent rotation for anti-detection."""
    
    def __init__(self, proxies: List[str], user_agents: List[str]):
        self.proxies = proxies if proxies else []
        self.user_agents = user_agents if user_agents else [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        ]
        self.current_proxy_index = 0
        
    def get_random_user_agent(self) -> str:
        return random.choice(self.user_agents)
    
    def get_next_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None
        proxy = self.proxies[self.current_proxy_index]
        self.current_proxy_index = (self.current_proxy_index + 1) % len(self.proxies)
        return proxy
    
    def get_request_headers(self) -> Dict[str, str]:
        return {
            "User-Agent": self.get_random_user_agent(),
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }
    
    def get_request_proxies(self) -> Optional[Dict[str, str]]:
        proxy = self.get_next_proxy()
        if not proxy:
            return None
        return {"http": proxy, "https": proxy}
    
    def random_delay(self):
        delay = random.uniform(
            instagram_settings.REQUEST_DELAY_MIN,
            instagram_settings.REQUEST_DELAY_MAX
        )
        time.sleep(delay)


# ==========================
# Instagram Service
# ==========================

class InstagramService:
    """
    Production-grade Instagram service with:
    - Multi-account credential rotation
    - Session rotation (hourly)
    - Proxy and user-agent rotation
    - Anti-detection delays
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.urls_collection = db.instagram_urls
        
        # Initialize credential manager
        usernames = instagram_settings.instagram_usernames_list
        passwords = instagram_settings.instagram_passwords_list
        
        if not instagram_settings.has_valid_instagram_credentials:
            logger.warning("No valid Instagram credentials configured")
            self.credential_manager = None
        else:
            self.credential_manager = CredentialManager(usernames, passwords)
        
        # Initialize request enhancer
        self.request_enhancer = RequestEnhancer(
            proxies=instagram_settings.proxy_list,
            user_agents=instagram_settings.USER_AGENTS
        )
        
        # Instagram client
        if INSTAGRAPI_AVAILABLE:
            self.client = Client()
        else:
            self.client = None
        self.is_logged_in = False
        
        # Ensure indexes
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Ensure MongoDB indexes exist."""
        try:
            self.db.instagram_urls.create_index("url", unique=True)
            self.db.instagram_urls.create_index([("downloaded", 1), ("created_at", 1)])
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
    
    # ==========================
    # AUTH
    # ==========================
    
    def login(self, force_rotation: bool = False) -> Tuple[bool, str, Optional[datetime]]:
        """Login to Instagram using credentials from environment."""
        if not INSTAGRAPI_AVAILABLE:
            return False, "instagrapi not installed. Run: pip install instagrapi", None
            
        if not self.credential_manager:
            return False, "No Instagram credentials configured in .env", None
        
        try:
            if force_rotation or self.credential_manager.should_rotate_session():
                if self.is_logged_in:
                    self.credential_manager.rotate()
                    self.client = Client()
                    self.is_logged_in = False
            
            username, password = self.credential_manager.get_current()
            session_file = self.credential_manager.get_session_file()
            
            if Path(session_file).exists():
                try:
                    self.client.load_settings(session_file)
                    self.client.login(username, password)
                    logger.info(f"Loaded existing session for {username}")
                except Exception as e:
                    logger.info(f"Session expired, creating new: {e}")
                    self.client = Client()
                    self.client.login(username, password)
                    self.client.dump_settings(session_file)
            else:
                self.client.login(username, password)
                self.client.dump_settings(session_file)
                logger.info(f"Created new session for {username}")
            
            self.is_logged_in = True
            self.credential_manager.mark_session_created()
            
            return (
                True, 
                f"Logged in as {username}",
                self.credential_manager.get_session_expiry()
            )
            
        except PleaseWaitFewMinutes as e:
            logger.warning(f"Rate limited: {e}")
            if len(self.credential_manager.credentials) > 1:
                self.credential_manager.rotate()
                return self.login()
            return False, "Rate limited. Please wait.", None
            
        except Exception as e:
            logger.error(f"Login failed: {e}")
            self.is_logged_in = False
            return False, f"Login failed: {str(e)}", None
    
    def ensure_logged_in(self) -> bool:
        """Ensure we have a valid session."""
        if not self.credential_manager:
            return False
        if not self.is_logged_in or self.credential_manager.should_rotate_session():
            success, _, _ = self.login()
            return success
        return True
    
    def get_session_info(self) -> Dict[str, Any]:
        """Get current session information."""
        if not self.credential_manager:
            return {"active": False, "message": "No credentials configured"}
        
        return {
            "active": self.is_logged_in,
            "account": self.credential_manager.get_current_username() if self.is_logged_in else None,
            "expires_at": self.credential_manager.get_session_expiry(),
            "credentials_count": len(self.credential_manager.credentials)
        }
    
    # ==========================
    # SCRAPE
    # ==========================
    
    def scrape_posts(
        self,
        hashtag: str,
        num_posts: int = 10,
        after_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Scrape Instagram posts by hashtag."""
        if not INSTAGRAPI_AVAILABLE:
            raise ValueError("instagrapi not installed")
            
        if not self.ensure_logged_in():
            raise ValueError("Instagram login required")
        
        if after_date and after_date > datetime.now(timezone.utc):
            raise ValueError("after_date cannot be in the future")
        
        try:
            clean_hashtag = hashtag.lstrip("#").strip()
            fetch_amount = min(num_posts * 3, 150)
            
            logger.info(f"Fetching posts for #{clean_hashtag}")
            self.request_enhancer.random_delay()
            
            medias = self.client.hashtag_medias_recent(clean_hashtag, amount=fetch_amount)
            
            results = []
            for media in medias:
                if len(results) >= num_posts:
                    break
                
                if media.media_type not in (1, 8):  # 1=Photo, 8=Album
                    continue
                
                if after_date and media.taken_at < after_date:
                    continue
                
                shortcode = media.code
                post_url = f"https://www.instagram.com/p/{shortcode}/"
                
                image_url = None
                if media.media_type == 1:
                    image_url = str(media.thumbnail_url)
                elif media.media_type == 8 and media.resources:
                    image_url = str(media.resources[0].thumbnail_url)
                
                results.append({
                    "id": str(media.id),
                    "url": post_url,
                    "uploadedtime": media.taken_at.isoformat() if media.taken_at else None,
                    "_shortcode": shortcode,
                    "_image_url": image_url,
                    "_owner": media.user.username if media.user else "unknown"
                })
                
                self.request_enhancer.random_delay()
            
            logger.info(f"Found {len(results)} posts for #{clean_hashtag}")
            return results
            
        except PleaseWaitFewMinutes:
            raise ValueError("Instagram rate limited. Please wait a few minutes.")
        except LoginRequired:
            self.is_logged_in = False
            raise ValueError("Instagram session expired. Please login again.")
        except Exception as e:
            logger.exception(f"Scraping failed: {e}")
            raise ValueError(f"Failed to scrape posts: {str(e)}")
    
    # ==========================
    # STORE URLs
    # ==========================
    
    async def store_urls(self, urls: List[Dict[str, Any]]) -> Dict[str, int]:
        """Store Instagram URLs in MongoDB with deduplication."""
        if not urls:
            return {"inserted": 0, "duplicates_skipped": 0}
        
        documents = []
        for item in urls:
            doc = {
                "instagram_id": item.get("id"),
                "url": str(item.get("url")),
                "uploadedtime": item.get("uploadedtime"),
                "shortcode": item.get("_shortcode"),
                "image_url": item.get("_image_url"),
                "owner": item.get("_owner"),
                "created_at": datetime.now(timezone.utc),
                "downloaded": False,
                "analyzed": False
            }
            documents.append(doc)
        
        if not documents:
            return {"inserted": 0, "duplicates_skipped": 0}
        
        try:
            result = await self.urls_collection.insert_many(documents, ordered=False)
            return {"inserted": len(result.inserted_ids), "duplicates_skipped": 0}
        except BulkWriteError as e:
            inserted = e.details.get("nInserted", 0)
            skipped = len(documents) - inserted
            return {"inserted": inserted, "duplicates_skipped": skipped}
    
    # ==========================
    # DOWNLOAD
    # ==========================
    
    async def get_pending_downloads(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get URLs that haven't been downloaded yet."""
        cursor = self.urls_collection.find(
            {"downloaded": {"$ne": True}}
        ).sort("created_at", 1).limit(limit)
        
        results = []
        async for doc in cursor:
            results.append({
                "_id": doc["_id"],
                "url": doc.get("url"),
                "image_url": doc.get("image_url"),
                "shortcode": doc.get("shortcode"),
                "instagram_id": doc.get("instagram_id"),
                "created_at": doc.get("created_at"),
            })
        return results
    
    def download_image_bytes(self, url: str) -> Optional[bytes]:
        """Download image from URL with anti-detection measures."""
        headers = self.request_enhancer.get_request_headers()
        proxies = self.request_enhancer.get_request_proxies()
        
        try:
            self.request_enhancer.random_delay()
            response = requests.get(url, headers=headers, proxies=proxies, timeout=30)
            
            if response.status_code == 200:
                return response.content
            else:
                logger.error(f"Download failed: HTTP {response.status_code} for {url}")
                return None
        except Exception as e:
            logger.error(f"Download exception for {url}: {e}")
            return None
    
    async def mark_as_downloaded(self, doc_id: ObjectId, gridfs_id: Optional[str] = None):
        """Mark a URL as downloaded."""
        update = {
            "$set": {
                "downloaded": True,
                "downloaded_at": datetime.now(timezone.utc)
            }
        }
        if gridfs_id:
            update["$set"]["gridfs_id"] = str(gridfs_id)
        await self.urls_collection.update_one({"_id": doc_id}, update)
    
    async def mark_as_failed(self, doc_id: ObjectId, error: str):
        """Mark a URL download as failed."""
        await self.urls_collection.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "download_failed": True,
                    "download_error": error,
                    "failed_at": datetime.now(timezone.utc)
                }
            }
        )
    
    async def mark_as_analyzed(self, doc_id: ObjectId):
        """Mark a downloaded URL as analyzed."""
        await self.urls_collection.update_one(
            {"_id": doc_id},
            {"$set": {"analyzed": True, "analyzed_at": datetime.now(timezone.utc)}}
        )
    
    async def get_unanalyzed_downloads(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get downloaded images that haven't been analyzed yet."""
        cursor = self.urls_collection.find({
            "downloaded": True,
            "analyzed": {"$ne": True},
            "gridfs_id": {"$exists": True}
        }).sort("downloaded_at", 1).limit(limit)
        
        results = []
        async for doc in cursor:
            results.append({
                "_id": doc["_id"],
                "url": doc.get("url"),
                "gridfs_id": doc.get("gridfs_id"),
                "shortcode": doc.get("shortcode"),
                "instagram_id": doc.get("instagram_id"),
            })
        return results
