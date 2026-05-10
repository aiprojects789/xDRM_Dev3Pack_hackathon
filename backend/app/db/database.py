from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class Database:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    _initialized: bool = False  # Track initialization status

db = Database()

# Optional global access (if needed)
client: Optional[AsyncIOMotorClient] = None
database: Optional[AsyncIOMotorDatabase] = None

import asyncio

async def connect_to_mongo():
    """Initialize MongoDB connection if not already connected"""
    global client, database

    try:
        # Check if already initialized and client is responsive
        if db.client is not None and db._initialized:
            return

        logger.info("Connecting to MongoDB...")
        db.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            maxPoolSize=50,
            socketTimeoutMS=30000,
            connectTimeoutMS=30000,
            serverSelectionTimeoutMS=5000,
            retryWrites=True
        )
        
        # Verify connection
        await db.client.admin.command('ping')
        db.db = db.client[settings.DB_NAME]

        # Update global accessors
        client = db.client
        database = db.db
        db._initialized = True

        # Initialize indexes
        await ensure_indexes()
        logger.info("⚡ Connected to MongoDB successfully")

    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        db._initialized = False
        db.client = None
        raise RuntimeError("Database connection failed") from e


async def close_mongo_connection():
    """Close MongoDB connection gracefully"""
    if db.client:
        db.client.close()
        logger.info("MongoDB connection closed")
        db.client = None
        db.db = None
        db._initialized = False

def get_db() -> AsyncIOMotorDatabase:
    """Get database instance - raises RuntimeError if not initialized"""
    if db.db is None or not db._initialized:
        raise RuntimeError("MongoDB not initialized - call connect_to_mongo() first")
    return db.db

def get_user_collection():
    """Get users collection with validation"""
    return get_db().users

def get_artwork_collection():
    """Get artworks collection with validation"""
    return get_db()["artworks"]

def get_wallet_collection():
    """Get wallets collection with validation"""
    return get_db().wallets

def get_license_collection():
    """Get licenses collection with validation"""
    return get_db().licenses

def get_transaction_collection():
    """Get transactions collection with validation"""
    return get_db().transactions

def get_categories_collection():
    db = get_db()
    return db.artwork_categories

def get_user_history_collection():
    """Get user history collection"""
    db = get_db()
    return db.user_history

def get_blog_collection():
    """Get blogs collection with validation"""
    return get_db().blogs

def is_mongo_initialized() -> bool:
    """Check if MongoDB is initialized"""
    return db._initialized and db.db is not None

async def ensure_indexes():
    """Ensure critical indexes exist for performance"""
    try:
        db_instance = get_db()
        artworks = db_instance["artworks"]
        users = db_instance["users"]
        
        # Artworks Collection Indexes
        await artworks.create_index([("owner_id", 1)])
        await artworks.create_index([("owner_address", 1)])
        await artworks.create_index([("token_id", 1)])
        await artworks.create_index([("creator_id", 1)])
        await artworks.create_index([("created_at", -1)])
        
        # Compound indexes for common dashboard filters
        await artworks.create_index([("owner_address", 1), ("created_at", -1)], name="owner_address_created_at_idx")
        await artworks.create_index([("owner_id", 1), ("created_at", -1)], name="owner_id_created_at_idx")
        
        # User Collection Indexes
        await users.create_index([("wallet_address", 1)], unique=False)
        await users.create_index([("email", 1)], unique=False)
        await users.create_index([("phone_number", 1)], sparse=True)

        # Licenses Collection Indexes
        licenses = db_instance["licenses"]
        await licenses.create_index([("buyer_id", 1)])
        await licenses.create_index([("buyer_address", 1)])
        await licenses.create_index([("license_id", 1)])
        await licenses.create_index([("token_id", 1)])
        await licenses.create_index([("purchase_time", -1)])
        
        # Compound index for user license history
        await licenses.create_index([("buyer_id", 1), ("purchase_time", -1)])
        await licenses.create_index([("buyer_address", 1), ("purchase_time", -1)])
        
        # Blog Collection Indexes
        blogs = db_instance["blogs"]
        await blogs.create_index([("slug", 1)], unique=True)
        await blogs.create_index([("status", 1)])
        await blogs.create_index([("created_at", -1)])
        await blogs.create_index([("author_id", 1)])

        # Blog Views Tracking Indexes
        views_tracking = db_instance["blog_views_tracking"]
        await views_tracking.create_index([("blog_id", 1), ("ip", 1)], unique=True)
        await views_tracking.create_index([("timestamp", 1)])

        logger.info("⚡ Database indexes verified/created")
    except Exception as e:
        logger.warning(f"⚠️ Failed to ensure indexes: {e}")