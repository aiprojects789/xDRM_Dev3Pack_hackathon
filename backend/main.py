from fastapi import FastAPI, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from app.db.database import connect_to_mongo, close_mongo_connection
from app.core.security import get_current_admin_user
import os
import logging
import traceback
from typing import Optional
from dotenv import load_dotenv

# Load environment variables FIRST - before anything else
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app() -> FastAPI:
    app = FastAPI(
        title="XDRM Backend",
        description="Digital Rights Management for Artworks",
        version="1.0.0"
    )   
    @app.get("/favicon.ico")
    async def favicon():
        return Response(status_code=204)  # No content

    # CORS Configuration - use parsed settings from pydantic
    from app.core.config import settings
    allowed_origins = settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS else ['http://localhost:5173']
    
    # # Debug log to verify CORS origins
    # logger.info(f"🔒 CORS Configuration - Allowed Origins: {allowed_origins}")
    # logger.info(f"🔒 CORS Configuration - Type: {type(allowed_origins)}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Authorization", 
            "Content-Type", 
            "Accept",
            "Origin",
            "User-Agent",
            "DNT",
            "Cache-Control",
            "X-Mx-ReqToken",
            "Keep-Alive",
            "X-Requested-With",
            "If-Modified-Since",
            "X-CSRF-Token"
        ],
        expose_headers=["Content-Type", "Content-Length"]
    )
   

    # Exception Handling Middleware
    @app.middleware("http")
    async def db_exception_handler(request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except RuntimeError as e:
            if "MongoDB" in str(e):
                logger.error(f"Database error: {str(e)}")
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Service unavailable - database error"}
                )
            raise
        except Exception as e:
            logger.error(f"Unhandled exception: {str(e)}\n{traceback.format_exc()}")
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )

    # Register routes and events
    register_routes_and_events(app)

    return app

def register_routes_and_events(app: FastAPI):
    """Register all routes and event handlers"""
    from app.api.v1 import router as api_router

    # Database events (useful in dev/local)
    app.add_event_handler("startup", startup_db)
    app.add_event_handler("shutdown", shutdown_db)

    # API routes
    app.include_router(api_router, prefix="/api/v1")
    # Root route
    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "XDRM Backend Service"}


    @app.get('/favicon.ico', include_in_schema=False)
    async def favicon():
        return FileResponse(
            os.path.join('static', 'favicon.ico'),
            media_type='image/vnd.microsoft.icon'
        )

async def startup_db():
    """Initialize database connection (local/dev use)"""
    try:
        await connect_to_mongo()
    except Exception as e:
        logger.critical(f"Failed to initialize database: {str(e)}")
        raise

async def shutdown_db():
    """Close database connection"""
    await close_mongo_connection()

from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

app = create_app()

# CLEAN SOCIAL SHARE ROUTE
@app.get("/share/{artwork_id}", response_class=HTMLResponse)
async def share_artwork_metadata_root(artwork_id: str):
    """
    Social Media Metadata Injector (Clean URL)
    Uses the centralized logic from app.utils.artwork
    """
    from app.utils.artwork import generate_share_html
    return await generate_share_html(artwork_id)

@app.get("/blog/share/{slug}")
async def share_blog_metadata_root(slug: str):
    """
    Blog SEO/Social Sharing Metadata Injector.
    Redirects to frontend after serving meta tags.
    """
    from app.utils.blog_utils import generate_blog_share_html
    return await generate_blog_share_html(slug)


from fastapi.staticfiles import StaticFiles

# Use absolute path for uploads to avoid path mismatch on production
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
uploads_path = os.path.join(BASE_DIR, "uploads")
if not os.path.exists(uploads_path):
    os.makedirs(uploads_path, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")

# DIRECT OVERRIDE FOR USER STATUS TOGGLE
@app.post("/api/v1/admin/update-user-status")
async def toggle_user_status_direct(user_id: str, current_admin: dict = Depends(get_current_admin_user)):
    from app.db.database import get_user_collection
    from bson import ObjectId
    from datetime import datetime
    import logging
    
    logger = logging.getLogger("main")
    users_collection = get_user_collection()
    
    # Try looking up as ObjectId first, then as string
    user = None
    try:
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
    except:
        pass
        
    if not user:
        user = await users_collection.find_one({"_id": user_id})
        
    if not user:
        from fastapi import HTTPException
        raise HTTPException(404, "User not found")
    
    current_status = user.get("is_active", True)
    new_status = not current_status
    
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_active": new_status, "updated_at": datetime.utcnow()}}
    )
    
    status_text = "activated" if new_status else "suspended"
    logger.info(f"User {user_id} {status_text} by admin {current_admin['email']} (Direct Route)")
    
    return {
        "message": f"User {status_text} successfully", 
        "is_active": new_status
    }

# Force Reload: trigger uvicorn file watcher to apply license fixes

