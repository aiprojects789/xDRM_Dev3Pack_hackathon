from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_user
from app.db.database import get_user_collection, get_wallet_collection
from app.db.schemas import WalletSchema
import secrets
from datetime import datetime

router = APIRouter(prefix="/blockchain", tags=["blockchain"])

@router.get("/wallet", response_model=WalletSchema)
async def get_wallet(current_user: dict = Depends(get_current_user)):
    user_collection = get_user_collection()
    user = await user_collection.find_one({"email": current_user["sub"]})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    wallet_collection = get_wallet_collection()
    wallet = await wallet_collection.find_one({"user_id": current_user["user_id"]})
    
    # We no longer auto-generate EVM wallets. 
    # Users should link their Solana wallet from the frontend.
    if not wallet:
        # Check if user has a solana_wallet_address in their profile
        sol_addr = user.get("solana_wallet_address")
        if sol_addr:
            wallet_data = {
                "address": sol_addr,
                "private_key": "LINKED_WALLET", # Don't store private keys for linked wallets
                "balance": 0.0,
                "user_id": current_user["user_id"],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "network": "solana"
            }
            await wallet_collection.insert_one(wallet_data)
            wallet = wallet_data
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Solana wallet linked. Please connect your wallet in the dashboard."
            )
    
    return WalletSchema(**wallet)

@router.get("/royalties")
async def get_royalties(current_user: dict = Depends(get_current_user)):
    return {
        "total_royalties": 0.0,
        "royalty_history": []
    }