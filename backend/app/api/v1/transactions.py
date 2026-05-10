from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional
from datetime import datetime
import logging
from web3 import Web3
from bson import ObjectId

from app.db.database import get_transaction_collection, get_user_collection
from app.db.models import (
    TransactionCreate, TransactionUpdate, TransactionInDB,
    TransactionListResponse, TransactionStatus, TransactionType, User
)
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transaction", tags=["transaction"])

@router.post("/", response_model=dict)
async def create_transaction(
    transaction_data: dict,  # CHANGE: Use dict instead of TransactionCreate for flexibility
    current_user: dict = Depends(get_current_user)  # CHANGE: Use dict
):
    try:
        db_transactions = get_transaction_collection()
        users_collection = get_user_collection()  # ADD THIS

        # Extract data from dict
        tx_hash = transaction_data.get("tx_hash")
        from_address = transaction_data.get("from_address")
        to_address = transaction_data.get("to_address")
        transaction_type = transaction_data.get("transaction_type")
        status = transaction_data.get("status", TransactionStatus.PENDING)
        value = transaction_data.get("value")
        metadata = transaction_data.get("metadata", {})
        payment_method = transaction_data.get("payment_method", "crypto")  # ADD THIS

        # Detect network
        network = transaction_data.get("network", "sepolia").lower()
        is_evm = network in ["sepolia", "wirefluid", "ethereum", "wire-fluid"]
        is_solana = network == "solana"
        is_algorand = network == "algorand"

        # Validation based on network
        if is_evm:
            if not tx_hash or len(tx_hash) != 66:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid Ethereum transaction hash format. Must be 66 characters (0x + 64 hex)"
                )
            try:
                from_address_checksum = Web3.to_checksum_address(from_address)
                to_address_checksum = Web3.to_checksum_address(to_address) if to_address else None
            except Exception as addr_error:
                logger.error(f"EVM Address validation failed: {addr_error}")
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid Ethereum address format: {str(addr_error)}"
                )
        elif is_solana:
            # Solana signatures are base58 and around 88 chars
            if not tx_hash or len(tx_hash) < 64:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid Solana transaction signature format"
                )
            from_address_checksum = from_address
            to_address_checksum = to_address
        elif is_algorand:
            # Algorand tx IDs are base32 and 52 chars
            if not tx_hash or len(tx_hash) < 50:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid Algorand transaction ID format"
                )
            from_address_checksum = from_address
            to_address_checksum = to_address
        else:
            # Generic fallback
            from_address_checksum = from_address
            to_address_checksum = to_address

        # Normalize based on network (EVM is case-insensitive, Solana is case-sensitive)
        normalized_tx_hash = tx_hash.lower() if is_evm else tx_hash
        normalized_from = from_address_checksum.lower() if is_evm else from_address_checksum
        normalized_to = (to_address_checksum.lower() if to_address_checksum else None) if is_evm else to_address_checksum

        # CHECK FOR EXISTING TRANSACTION
        existing_tx = await db_transactions.find_one({"tx_hash": normalized_tx_hash})
        if existing_tx:
            logger.info(f"Transaction {tx_hash} already exists, updating status")
            update_result = await db_transactions.update_one(
                {"tx_hash": normalized_tx_hash},
                {
                    "$set": {
                        "status": status,
                        "updated_at": datetime.utcnow(),
                        "metadata": metadata or {}
                    }
                }
            )
            if update_result.modified_count > 0:
                return {
                    "success": True,
                    "message": "Transaction updated successfully",
                    "tx_hash": tx_hash,
                    "action": "updated"
                }
            else:
                return {
                    "success": True,
                    "message": "Transaction already exists with same data",
                    "tx_hash": tx_hash,
                    "action": "no_change"
                }

        # GET USER IDS - ADD THIS SECTION
        # Wallet addresses in the 'users' collection are generally stored lowercase for EVM
        user_wallet_query = from_address.lower() if is_evm else from_address
        from_user = await users_collection.find_one({"wallet_address": user_wallet_query})
        to_user = None
        if to_address:
            to_wallet_query = to_address.lower() if is_evm else to_address
            to_user = await users_collection.find_one({"wallet_address": to_wallet_query})

        # CREATE TRANSACTION DOCUMENT
        tx_doc = {
            "tx_hash": normalized_tx_hash,
            "from_address": normalized_from,
            "to_address": normalized_to,
            "from_user_id": from_user.get('user_id') or from_user.get('_id') if from_user else None,
            "to_user_id": to_user.get('user_id') or to_user.get('_id') if to_user else None,
            "transaction_type": transaction_type,
            "status": status,
            "value": value,
            "metadata": metadata,
            "payment_method": payment_method,
            "network": network, # Store network context
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        logger.info(f"Creating transaction record: {tx_doc}")

        result = await db_transactions.insert_one(tx_doc)
        if not result.inserted_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create transaction record"
            )

        logger.info(f"✅ Transaction record created with ID: {result.inserted_id}")

        return {
            "success": True,
            "message": "Transaction created successfully",
            "transaction_id": str(result.inserted_id),
            "tx_hash": tx_hash,
            "action": "created"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating transaction: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create transaction: {str(e)}"
        )

@router.get("/{tx_hash}", response_model=dict)
async def get_transaction(
    tx_hash: str,
    current_user: dict = Depends(get_current_user)
):
    """Get transaction by hash"""
    try:
        db_transactions = get_transaction_collection()

        # Normalize hash based on format (EVM vs Solana/Algorand)
        if (tx_hash.startswith('0x') and len(tx_hash) == 66) or (len(tx_hash) == 64 and all(c in '0123456789abcdefABCDEF' for c in tx_hash)):
            if not tx_hash.startswith('0x'):
                tx_hash = '0x' + tx_hash
            tx_hash = tx_hash.lower()
        # Else (Solana/Algorand) keep as is

        transaction = await db_transactions.find_one({"tx_hash": tx_hash})
        if not transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found"
            )

        # Convert ObjectId to string
        if "_id" in transaction:
            transaction["id"] = str(transaction["_id"])
            del transaction["_id"]

        # Ensure metadata exists and is properly nested
        if "metadata" not in transaction or not transaction["metadata"]:
            transaction["metadata"] = {
                "token_id": transaction.get("token_id"),
                "license_id": transaction.get("license_id"),
                "licensee_address": transaction.get("licensee_address"),
                "duration_days": transaction.get("duration_days"),
                "license_type": transaction.get("license_type"),
                "terms_hash": transaction.get("terms_hash"),
            }

        return {
            "success": True,
            "transaction": transaction
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transaction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transaction: {str(e)}"
        )

@router.get("/", response_model=dict)
async def get_user_transactions(
    current_user: dict = Depends(get_current_user),  # CHANGE: Use dict
    limit: int = 20,
    skip: int = 0
):
    try:
        db_transactions = get_transaction_collection()
        users_collection = get_user_collection()  # ADD THIS

        # GET USER INFO - ADD THIS
        user_wallet = current_user.get('wallet_address', '').lower()
        user_id = str(current_user.get('id', ''))

        # BUILD QUERY FOR BOTH WALLET ADDRESS AND USER ID - UPDATE THIS
        query = {
            "$or": [
                {"from_address": {"$regex": f"^{user_wallet}$", "$options": "i"}},
                {"from_user_id": user_id}
            ]
        }

        cursor = db_transactions.find(query).sort("created_at", -1).skip(skip).limit(limit)

        transactions = []
        async for tx in cursor:
            if "_id" in tx:
                tx["id"] = str(tx["_id"])
                del tx["_id"]
            transactions.append(tx)

        total = await db_transactions.count_documents(query)

        return {
            "success": True,
            "transactions": transactions,
            "total": total,
            "limit": limit,
            "skip": skip,
            "user_identifier": user_id  # ADD THIS
        }

    except Exception as e:
        logger.error(f"Error fetching user transactions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transactions: {str(e)}"
        )
    
def normalize_transaction_document(tx_doc: dict) -> dict:
    defaults = {
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "status": TransactionStatus.PENDING.value,
        "transaction_type": TransactionType.REGISTER.value,
        "value": "0",
        "metadata": {},
        "from_address": "",
        "to_address": "",
        "from_address": None,  # ✅ FIXED: Use None instead of empty string
        "to_address": None,     # ✅ FIXED: Use None instead of empty string
        "payment_method": "crypto"  # ✅ ADD: Default payment method
    }

    normalized = tx_doc.copy()

    for field, default_value in defaults.items():
        if field not in normalized or normalized[field] is None:
            normalized[field] = default_value

    # ✅ FIXED: Convert empty strings to None for addresses
    if normalized.get("from_address") == "":
        normalized["from_address"] = None
    if normalized.get("to_address") == "":
        normalized["to_address"] = None

    if "_id" in normalized:
        normalized["id"] = str(normalized["_id"])
        del normalized["_id"]

    return normalized

async def list_transactions(
    page: int = 1,
    size: int = 20,
    from_address: Optional[str] = None,
    to_address: Optional[str] = None,
    transaction_type: Optional[TransactionType] = None,
    custom_query: Optional[dict] = None  # ADD THIS PARAMETER
):
    db_transactions = get_transaction_collection()
    skip = (page - 1) * size

    # USE CUSTOM QUERY IF PROVIDED, OTHERWISE BUILD QUERY - UPDATE THIS
    query = custom_query if custom_query is not None else {}
    
    if not custom_query:
        if from_address:
            query["from_address"] = {"$regex": f"^{from_address}$", "$options": "i"}
        if to_address:
            query["to_address"] = {"$regex": f"^{to_address}$", "$options": "i"}
        if transaction_type:
            query["transaction_type"] = transaction_type.value

    cursor = db_transactions.find(query).sort("created_at", -1).skip(skip).limit(size)

    transactions = []
    async for tx in cursor:
        normalized_tx = normalize_transaction_document(tx)
        transactions.append(normalized_tx)

    total = await db_transactions.count_documents(query)
    total_pages = (total + size - 1) // size if size > 0 else 1
    has_next = page < total_pages

    return TransactionListResponse(
        success=True,
        transactions=transactions,
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
        has_next=has_next
    )

@router.get("/user/{user_identifier}", response_model=TransactionListResponse)
async def get_user_transactions_endpoint(
    user_identifier: str,  # CHANGE: Accept both user ID and wallet address
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None)
):
    try:
        db_transactions = get_transaction_collection()
        users_collection = get_user_collection()  # ADD THIS

        # DETERMINE IF IDENTIFIER IS WALLET ADDRESS OR USER ID
        is_evm_address = user_identifier.startswith('0x') and len(user_identifier) == 42
        is_solana_address = not user_identifier.startswith('0x') and 32 <= len(user_identifier) <= 44
        is_algorand_address = not user_identifier.startswith('0x') and len(user_identifier) == 58
        
        is_wallet_address = is_evm_address or is_solana_address or is_algorand_address

        query = {}
        
        if is_wallet_address:
            # Search by wallet address
            try:
                if is_evm_address:
                    user_address = Web3.to_checksum_address(user_identifier)
                else:
                    user_address = user_identifier
                
                query = {
                    "$or": [
                        {"from_address": {"$regex": f"^{user_address.lower() if is_evm_address else user_address}$", "$options": "i"}},
                        {"to_address": {"$regex": f"^{user_address.lower() if is_evm_address else user_address}$", "$options": "i"}}
                    ]
                }
                logger.info(f"Searching transactions by wallet address: {user_identifier}")
            except Exception as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid address format: {str(e)}"
                )
        else:
            # Search by user ID - try multiple lookup methods
            user = None
            if ObjectId.is_valid(user_identifier):
                user = await users_collection.find_one({"_id": ObjectId(user_identifier)})
            if not user:
                user = await users_collection.find_one({"user_id": user_identifier})
            if not user:
                user = await users_collection.find_one({"_id": user_identifier})
            if not user:
                user = await users_collection.find_one({"id": user_identifier})
            
            if user:
                # User found, search by user_id and also include wallet address
                user_wallet = user.get('wallet_address')
                # Get all possible user ID formats that might be stored as from_user_id
                possible_user_ids = set()
                if user.get('user_id'):
                    possible_user_ids.add(str(user.get('user_id')))
                if user.get('id'):
                    possible_user_ids.add(str(user.get('id')))
                if user.get('_id'):
                    possible_user_ids.add(str(user.get('_id')))
                possible_user_ids.add(user_identifier)
                
                # Build query with all possible user IDs and wallet address (both as sender and recipient)
                user_id_conditions = []
                for uid in possible_user_ids:
                    user_id_conditions.append({"from_user_id": uid})
                    user_id_conditions.append({"to_user_id": uid})
                
                if user_wallet:
                    user_id_conditions.append({
                        "from_address": {"$regex": f"^{user_wallet.lower()}$", "$options": "i"}
                    })
                    user_id_conditions.append({
                        "to_address": {"$regex": f"^{user_wallet.lower()}$", "$options": "i"}
                    })
                
                if len(user_id_conditions) > 0:
                    query = {"$or": user_id_conditions}
                else:
                    # Fallback if somehow no conditions were generated
                    query = {
                        "$or": [
                            {"from_user_id": user_identifier},
                            {"to_user_id": user_identifier}
                        ]
                    }
                
                logger.info(f"Searching transactions by user ID (incoming & outgoing): {user_identifier}, found user with wallet: {user_wallet}")
            else:
                # Try as wallet address anyway
                try:
                    user_address = Web3.to_checksum_address(user_identifier)
                    query = {
                        "$or": [
                            {"from_address": {"$regex": f"^{user_address.lower()}$", "$options": "i"}},
                            {"to_address": {"$regex": f"^{user_address.lower()}$", "$options": "i"}}
                        ]
                    }
                    logger.info(f"User not found, searching as wallet address (both as sender and recipient): {user_identifier}")
                except ValueError:
                    raise HTTPException(
                        status_code=422,
                        detail="Invalid user ID or Ethereum address format"
                    )

        # ADD TRANSACTION TYPE FILTER IF PROVIDED
        transaction_type = None
        if type:
            try:
                transaction_type = TransactionType(type.upper())
                query["transaction_type"] = transaction_type.value
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid transaction type: {type}. Must be one of: {[t.value for t in TransactionType]}"
                )

        return await list_transactions(
            page=page,
            size=size,
            custom_query=query  # UPDATE list_transactions to accept custom query
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transactions for user {user_identifier}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user transactions: {str(e)}"
        )

@router.get("/user/{user_identifier}/royalties", response_model=TransactionListResponse)
async def get_user_royalty_transactions(
    user_identifier: str,  # CHANGE: Accept both user ID and wallet address
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100)
):
    try:
        db_transactions = get_transaction_collection()
        users_collection = get_user_collection()  # ADD THIS

        # DETERMINE IF IDENTIFIER IS WALLET ADDRESS OR USER ID - ADD THIS
        is_wallet_address = (
            user_identifier.startswith('0x') and 
            len(user_identifier) == 42
        )

        query = {"transaction_type": TransactionType.ROYALTY_PAYMENT.value}
        
        if is_wallet_address:
            # Search by wallet address
            try:
                user_address = Web3.to_checksum_address(user_identifier)
                query["to_address"] = {"$regex": f"^{user_address.lower()}$", "$options": "i"}
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid Ethereum address format"
                )
        else:
            # Search by user ID - try multiple lookup methods
            user = None
            if ObjectId.is_valid(user_identifier):
                user = await users_collection.find_one({"_id": ObjectId(user_identifier)})
            if not user:
                user = await users_collection.find_one({"user_id": user_identifier})
            if not user:
                user = await users_collection.find_one({"_id": user_identifier})
            if not user:
                user = await users_collection.find_one({"id": user_identifier})
            
            if user:
                # User found, search by user_id and also include wallet address
                user_wallet = user.get('wallet_address')
                # Get all possible user ID formats that might be stored as to_user_id
                possible_user_ids = set()
                if user.get('user_id'):
                    possible_user_ids.add(str(user.get('user_id')))
                if user.get('id'):
                    possible_user_ids.add(str(user.get('id')))
                if user.get('_id'):
                    possible_user_ids.add(str(user.get('_id')))
                possible_user_ids.add(user_identifier)
                
                # Build query with all possible user IDs and wallet address
                user_id_conditions = [{"to_user_id": uid} for uid in possible_user_ids]
                
                if user_wallet:
                    user_id_conditions.append({
                        "to_address": {"$regex": f"^{user_wallet.lower()}$", "$options": "i"}
                    })
                
                if len(user_id_conditions) > 1:
                    # Preserve transaction_type filter by using $and
                    query = {
                        "transaction_type": TransactionType.ROYALTY_PAYMENT.value,
                        "$or": user_id_conditions
                    }
                elif len(user_id_conditions) == 1:
                    query.update(user_id_conditions[0])
                else:
                    query["to_user_id"] = user_identifier
                
                logger.info(f"Searching royalty transactions by user ID: {user_identifier}, found user with wallet: {user_wallet}")
            else:
                # Try as wallet address anyway
                try:
                    user_address = Web3.to_checksum_address(user_identifier)
                    query["to_address"] = {"$regex": f"^{user_address.lower()}$", "$options": "i"}
                    logger.info(f"User not found, searching as wallet address: {user_identifier}")
                except ValueError:
                    raise HTTPException(
                        status_code=422,
                        detail="Invalid user ID or Ethereum address format"
                    )

        return await list_transactions(
            page=page,
            size=size,
            custom_query=query  # UPDATE list_transactions to accept custom query
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching royalty transactions for user {user_identifier}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch royalty transactions: {str(e)}"
        )

@router.put("/{tx_hash}", response_model=dict)
async def update_transaction(
    tx_hash: str,
    update_data: TransactionUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        db_transactions = get_transaction_collection()

        if not tx_hash.startswith('0x'):
            tx_hash = '0x' + tx_hash
        tx_hash = tx_hash.lower()

        existing_tx = await db_transactions.find_one({"tx_hash": tx_hash})
        if not existing_tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found"
            )

        update_result = await db_transactions.update_one(
            {"tx_hash": tx_hash},
            {
                "$set": {
                    "status": update_data.status.value,
                    "updated_at": datetime.utcnow(),
                    **update_data.model_dump(exclude={"status"}, exclude_unset=True)
                }
            }
        )

        if update_result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No changes made to transaction"
            )

        return {
            "success": True,
            "message": "Transaction updated successfully",
            "tx_hash": tx_hash
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating transaction {tx_hash}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update transaction: {str(e)}"
        )

@router.delete("/{tx_hash}", response_model=dict)
async def delete_transaction(
    tx_hash: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        db_transactions = get_transaction_collection()

        if not tx_hash.startswith('0x'):
            tx_hash = '0x' + tx_hash
        tx_hash = tx_hash.lower()

        existing_tx = await db_transactions.find_one({"tx_hash": tx_hash})
        if not existing_tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction not found"
            )

        delete_result = await db_transactions.delete_one({"tx_hash": tx_hash})
        if delete_result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete transaction"
            )

        return {
            "success": True,
            "message": "Transaction deleted successfully",
            "tx_hash": tx_hash
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting transaction {tx_hash}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete transaction: {str(e)}"
        )
