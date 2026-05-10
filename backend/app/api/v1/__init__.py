from fastapi import APIRouter
from .auth import router as auth_router
from .artwork import router as artwork_router
from .blockchain import router as blockchain_router
# from .admin import router as admin_router  
from .contact import router as contact_router
from .email import router as email_router
from .licenses import router as license_router  
from .transactions import router as transactions_router 
# from .chatbot import router as chatbot_router 
# from .web3 import router as web3_router
from .advance_search import router as advance_search_router
# from .piracy import piracy_router
from .drm import router as drm_router
# from .psl import router as psl_router  # PSL Smart-Ticketing (Hackathon)
# from .blog import router as blog_router

router = APIRouter()

# Include all versioned routers
router.include_router(auth_router)
router.include_router(email_router)
router.include_router(contact_router)
router.include_router(artwork_router)
router.include_router(license_router)
router.include_router(transactions_router)
# router.include_router(web3_router)
router.include_router(blockchain_router)
# router.include_router(admin_router)
# router.include_router(chatbot_router)
router.include_router(advance_search_router)
# router.include_router(piracy_router, prefix="/admin/piracy")
router.include_router(drm_router)
# router.include_router(psl_router)  # PSL Smart-Ticketing (Hackathon)
# router.include_router(blog_router)
