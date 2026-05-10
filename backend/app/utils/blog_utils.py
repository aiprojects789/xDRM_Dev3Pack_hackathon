from typing import Any, Dict, Optional
from bson import ObjectId
from app.db.database import get_db
from fastapi.responses import HTMLResponse
import logging

logger = logging.getLogger(__name__)

async def generate_blog_share_html(slug: str) -> HTMLResponse:
    """
    Social Media Metadata Injector for Blogs.
    Generates dynamic OG tags for crawlers and redirects to the actual blog page.
    """
    db = get_db()
    blog = await db.blogs.find_one({"slug": slug})

    # Default metadata if blog not found
    title = "XDRM Blog - Insights on Digital Rights and Creativity"
    description = "Read the latest insights on digital rights management, blockchain, and creative monetization on the XDRM blog."
    image_url = "https://xdrm.softechdigitalgroup.com/logo_white.png" # Fallback
    site_url = f"https://xdrm.softechdigitalgroup.com/blogs/{slug}"

    if blog:
        title_text = blog.get("title", "Untitled Blog")
        excerpt = blog.get("excerpt", "")
        author_name = blog.get("author_name", "XDRM Admin")
        
        title = f"{title_text} | XDRM Blog"
        description = excerpt[:160] if excerpt else f"Read this article by {author_name} on XDRM Blog."
        
        cover_image = blog.get("cover_image")
        if cover_image:
            if cover_image.startswith("http"):
                image_url = cover_image
            else:
                # Assuming internal path like /uploads/blogs/...
                image_url = f"https://xdrm.softechdigitalgroup.com{cover_image}"

    # Construct HTML with OG Tags for bots
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        <meta name="description" content="{description}">

        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="article">
        <meta property="og:url" content="https://xdrm.softechdigitalgroup.com/blogs/{slug}">
        <meta property="og:title" content="{title}">
        <meta property="og:description" content="{description}">
        <meta property="og:image" content="{image_url}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:site_name" content="XDRM">

        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="https://xdrm.softechdigitalgroup.com/blogs/{slug}">
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
            <p>Redirecting to blog...</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)
