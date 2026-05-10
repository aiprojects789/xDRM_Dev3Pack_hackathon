from pydantic import BaseModel, Field, ConfigDict, validator, field_validator, EmailStr, StringConstraints, AliasChoices

from typing import Optional, List, Any, Dict,Annotated, Union
from datetime import datetime
from enum import Enum
from bson import ObjectId
from pydantic_core import core_schema
from pydantic.json_schema import JsonSchemaValue
from pydantic import GetCoreSchemaHandler
import uuid
import logging

logger = logging.getLogger(__name__)

class UserRole(str, Enum):
    ARTIST = "artist"
    ADMIN = "admin"
    USER = "user"

class UserBase(BaseModel):
    email: EmailStr = Field(description="Used for authentication")
    username: Annotated[str, StringConstraints(
        min_length=3, 
        max_length=50, 
        pattern=r"^[a-zA-Z0-9_]+$"
    )] = Field(description="Public display name")
    full_name: Optional[str] = Field(None, max_length=100)
    role: UserRole = Field(default=UserRole.ARTIST)
    solana_wallet_address: Optional[str] = None  # NEW: Solana-only architecture
    phone_number: str = Field(..., description="Phone number in E.164 format")  # NEW: Mandatory Phone number

    # ✅ ADD THESE OAUTH FIELDS
    oauth_provider: Optional[str] = Field(None, description="OAuth provider: google, facebook, etc")
    oauth_id: Optional[str] = Field(None, description="OAuth provider user ID")
    profile_picture: Optional[str] = Field(None, description="Profile picture URL")
    email_verified: bool = Field(default=False, description="Email verification status")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")

    # ✅ ADD THESE 2FA FIELDS
    two_factor_enabled: bool = False
    two_factor_secret: Optional[str] = None
    backup_codes: Optional[List[str]] = []

class UserPublic(UserBase):
    """Public user model with string ID and timestamps"""
    id: str = Field(alias="_id")
    created_at: datetime
    updated_at: datetime
    solana_wallet_address: Optional[str] = None  # NEW
    phone_number: str  # NEW: Mandatory


    # ✅ ADD OAUTH FIELDS
    oauth_provider: Optional[str] = None
    profile_picture: Optional[str] = None
    email_verified: bool = False
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True
    )

class User(UserPublic):
    """Main User model that extends UserPublic"""

    id: str = Field(..., alias="_id")
    model_config = ConfigDict(
        populate_by_name=True
    )

class WalletConnectRequest(BaseModel):
    wallet_address: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class UserEmailRequest(BaseModel):
    email: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    

class UserInDB(UserBase):
    id: str = Field(..., alias="_id")
    hashed_password: Optional[str] = None  # ✅ CHANGE: Make optional for OAuth users
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    solana_wallet_address: Optional[str] = None
    phone_number: str  # NEW: Mandatory


    # ✅ ADD OAUTH FIELDS
    oauth_provider: Optional[str] = None
    oauth_id: Optional[str] = None
    profile_picture: Optional[str] = None
    email_verified: bool = False
    last_login: Optional[datetime] = None

class UserOut(BaseModel):
    id: str = Field(..., alias="_id")
    email: EmailStr
    username: str
    full_name: Optional[str]
    role: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    solana_wallet_address: Optional[str] = None
    phone_number: str  # NEW: Mandatory


    # ✅ ADD OAUTH FIELDS
    oauth_provider: Optional[str] = None
    profile_picture: Optional[str] = None
    email_verified: bool = False
    last_login: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    username: Optional[Annotated[str, StringConstraints(
        min_length=3, 
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$"
    )]] = None
    role: Optional[str] = Field(None)
    is_active: Optional[bool] = None 
    phone_number: Optional[str] = None # NEW



    # Simple ObjectId handling for Pydantic v2
class PyObjectId(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: GetCoreSchemaHandler) -> core_schema.CoreSchema:
        return core_schema.with_info_after_validator_function(
            cls.validate,
            core_schema.str_schema(),
            serialization=core_schema.to_string_ser_schema(),
        )

    @classmethod
    def validate(cls, v: Any, info: core_schema.ValidationInfo) -> str:
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            if ObjectId.is_valid(v):
                return v
            raise ValueError("Invalid ObjectId string")
        raise ValueError("Invalid ObjectId type")

    @classmethod
    def __get_pydantic_json_schema__(cls, schema: JsonSchemaValue, handler) -> JsonSchemaValue:
        schema.update(type="string", format="objectid")
        return schema

# Base model configuration
class MongoModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

# License Type Enum
class LicenseType(str, Enum):
    PERSONAL_USE = "PERSONAL_USE"
    NON_COMMERCIAL = "NON_COMMERCIAL"
    COMMERCIAL = "COMMERCIAL"
    EXTENDED_COMMERCIAL = "EXTENDED_COMMERCIAL"
    EXCLUSIVE = "EXCLUSIVE"
    RESPONSIBLE_USE = "RESPONSIBLE_USE"
    ARTWORK_OWNERSHIP = "ARTWORK_OWNERSHIP"
    CUSTOM = "CUSTOM"

# system settings admin
class SystemSettings(BaseModel):
    """Singleton document to store global configurations"""
    id: str = Field(default="global_settings", alias="_id")
    default_platform_fee_percentage: float = Field(default=2.5, ge=0, le=100)  # For purchasing
    # registration_platform_fee_percentage: float = Field(default=2.5, ge=0, le=100)  # NEW: For registration
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str}
    )


# NEW: Image storage models
class ImageMetadata(BaseModel):
    """Model for stored image metadata"""
    filename: str
    file_hash: str = Field(..., description="SHA256 hash for exact duplicates")
    perceptual_hash: str = Field(..., description="Perceptual hash for similar images")
    embedding: list = Field(..., description="AI embedding for similarity detection")
    gridfs_id: str = Field(..., description="GridFS ID for binary storage (as string)")  # Changed to string
    content_type: str = Field(..., description="MIME type of the image")
    file_size: int = Field(..., description="File size in bytes")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

# Add these category models at the top of your models file
class ArtworkCategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    type: str = Field(..., description="medium, style, or subject")
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = Field(default=True)

class ArtworkCategoryCreate(ArtworkCategoryBase):
    pass

class ArtworkCategory(ArtworkCategoryBase):
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

# Update the ArtworkBase model to include categories and price
class ArtworkBase(BaseModel):
    """Base model shared by all artwork models"""
    token_id: Union[int, str] = Field(..., description="Unique Solana token ID")
    creator_id: str = Field(..., description="User ID of the creator")
    owner_id: str = Field(..., description="User ID of the current owner")
    creator_solana_address: Optional[str] = Field(None, description="Solana address of the creator")
    owner_solana_address: Optional[str] = Field(None, description="Current owner's Solana address")
    creator_address: Optional[str] = Field(None, description="Universal creator address")
    owner_address: Optional[str] = Field(None, description="Universal owner address")
    creator_name: Optional[str] = Field(None, description="Display name of the creator")
    creator_email: Optional[str] = Field(None, description="Email of the creator")
    owner_name: Optional[str] = Field(None, description="Display name of the current owner")
    owner_email: Optional[str] = Field(None, description="Email of the current owner")
    metadata_uri: str = Field(
        ..., 
        pattern=r"^(ipfs://|https?://).*",  # ✅ Allow empty string for legacy artworks (will be set to default)
        description="URI pointing to artwork metadata"
    )
    royalty_percentage: int = Field(
        ..., 
        ge=0, 
        le=2000,
        description="Royalty percentage in basis points (0-2000 = 0-20%)"
    )
    
    platform_fee_percentage: float = Field(
        default=2.5, 
        ge=0, 
        le=100, 
        description="Platform fee percentage for this specific artwork"
    )
    price: float = Field(
        ..., 
        ge=0,
        description="Price of the artwork in SOL"
    )
    is_for_sale: bool = Field(
        default=True,
        description="Whether the artwork is available for purchase"
    )
    is_licensed: bool = Field(
        default=False,
        description="Whether the artwork is currently licensed"
    )
    network: str = Field(default="solana", description="Blockchain network: 'solana' only")
    title: Optional[str] = Field(
        None, 
        max_length=100,
        description="Human-readable title of the artwork"
    )
    description: Optional[str] = Field(
        None, 
        max_length=1000,
        description="Detailed description of the artwork"
    )
    # NEW: Add category fields
    medium_category: str = Field(
        ..., 
        max_length=100,
        description="Medium/technique category"
    )
    style_category: str = Field(
        ..., 
        max_length=100,
        description="Style/movement category"
    )
    subject_category: str = Field(
        ..., 
        max_length=100,
        description="Subject matter category"
    )
    other_medium: Optional[str] = Field(
        None,
        max_length=100,
        description="Custom medium if 'Other' is selected"
    )
    other_style: Optional[str] = Field(
        None,
        max_length=100,
        description="Custom style if 'Other' is selected"
    )
    other_subject: Optional[str] = Field(
        None,
        max_length=100,
        description="Custom subject if 'Other' is selected"
    )
    attributes: Optional[dict] = Field(default={}, description="Custom attributes")
    responsible_use_addon: bool = Field(default=False, description="Whether responsible use addon is enabled")

    # NEW: Phase 2 Licensing
    available_license_types: List[str] = Field(
        default=[
            "PERSONAL_USE", 
            "NON_COMMERCIAL", 
            "COMMERCIAL", 
            "EXTENDED_COMMERCIAL", 
            "EXCLUSIVE", 
            "RESPONSIBLE_USE", 
            "ARTWORK_OWNERSHIP", 
            "CUSTOM"
        ],
        description="List of license types allowed for this artwork"
    )

    # PSL Smart-Ticket metadata (Hackathon Demo)
    is_psl_ticket: bool = Field(default=False, description="Whether this is a PSL Smart-Ticket")
    psl_metadata: Optional[dict] = Field(default=None, description="Detailed PSL ticket metadata")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_schema_extra={
            "example": {
                "token_id": 1,
                "creator_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                "owner_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                "metadata_uri": "ipfs://QmXJZx...",
                "royalty_percentage": 500,
                "price": 1.5,  # NEW: Added price
                "is_licensed": False,
                "title": "Digital Masterpiece",
                "description": "A beautiful digital artwork",
                "medium_category": "Digital Art",
                "style_category": "Abstract",
                "subject_category": "Abstract Concepts",
                "attributes": {"color": "blue", "style": "abstract"}
            }
        }
    )

# Update ArtworkCreate model
class ArtworkCreate(ArtworkBase):
    """Model for creating new artworks (excludes auto-generated fields)"""
    token_id: Optional[int] = Field(None, gt=0)
    creator_id: Optional[str] = Field(None)
    owner_id: Optional[str] = Field(None)
    is_licensed: Optional[bool] = Field(False)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# Update ArtworkUpdate model
class ArtworkUpdate(BaseModel):
    """Model for updating existing artworks (only updatable fields)"""
    owner_solana_address: Optional[str] = Field(
        None, 
        description="New owner's Solana address"
    )
    price: Optional[float] = Field(
        None, 
        ge=0,
        description="Updated price in SOL"
    )
    is_licensed: Optional[bool] = Field(
        None,
        description="Update license status"
    )
    network: Optional[str] = Field(
        None,
        description="Update blockchain network"
    )
    title: Optional[str] = Field(
        None, 
        max_length=100,
        description="Updated title"
    )
    description: Optional[str] = Field(
        None, 
        max_length=1000,
        description="Updated description"
    )
    # NEW: Add category fields for updates
    medium_category: Optional[str] = Field(
        None, 
        max_length=100,
        description="Updated medium category"
    )
    style_category: Optional[str] = Field(
        None, 
        max_length=100,
        description="Updated style category"
    )
    subject_category: Optional[str] = Field(
        None, 
        max_length=100,
        description="Updated subject category"
    )
    other_medium: Optional[str] = Field(
        None,
        max_length=100,
        description="Updated custom medium"
    )
    other_style: Optional[str] = Field(
        None,
        max_length=100,
        description="Updated custom style"
    )
    other_subject: Optional[str] = Field(
        None,
        max_length=100,
        description="Updated custom subject"
    )
    responsible_use_addon: Optional[bool] = Field(
        None,
        description="Update responsible use addon status"
    )
    updated_at: Optional[datetime] = Field(
        None,
        description="Will be set to current time on update"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "owner_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                "price": 2.0,  # NEW: Added price
                "is_licensed": True,
                "title": "Updated Title",
                "description": "New description",
                "medium_category": "Updated Medium",
                "style_category": "Updated Style",
                "subject_category": "Updated Subject"
            }
        }
    )

# Update ArtworkInDB model
class ArtworkInDB(ArtworkBase):
    """Complete model as stored in database"""
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Image storage fields
    image_metadata: Optional[dict] = Field(None, description="Image metadata for duplicate detection")
    image_metadata_id: Optional[str] = Field(None, description="Reference to stored image")
    image_ipfs_uri: Optional[str] = Field(None, description="IPFS URI for the image")
    has_fallback_image: bool = Field(default=False, description="Whether image is stored locally")
    tx_hash: Optional[str] = Field(None, description="Blockchain transaction hash")
    
    registration_method: Optional[str] = Field(None, description="Registration method: 'on-chain' or 'competition'")
    is_on_chain: Optional[bool] = Field(None, description="True if artwork is registered on blockchain")
    display_id: Optional[str] = Field(None, description="Human-readable display ID")
    
    # Competition entry tracking
    is_competition_entry: bool = Field(default=False, description="True if artwork was submitted as a competition entry (no payment)")
    
    # PSL Smart-Ticket fields (Hackathon Demo)
    is_psl_ticket: bool = Field(default=False, description="True if this is a PSL Smart-Ticket")
    psl_metadata: Optional[dict] = Field(None, description="PSL ticket details: seat, stand, venue, match date/time")

    @classmethod
    def validate_document(cls, data: dict):
        """Helper to handle MongoDB document validation with defaults"""
        if data is None:
            logger.error(f"❌ Cannot validate None document for {cls.__name__}")
            raise ValueError(f"Artwork document is missing or invalid")
            
        if not isinstance(data, dict):
            logger.error(f"❌ Expected dict for {cls.__name__}.validate_document, got {type(data)}")
            raise ValueError(f"Invalid document format for {cls.__name__}")

        # ✅ Safe ID handling: Convert ObjectId to string early
        if '_id' in data and data['_id'] and isinstance(data['_id'], ObjectId):
            data['_id'] = str(data['_id'])
        
        if 'image_metadata_id' in data and data['image_metadata_id'] and isinstance(data['image_metadata_id'], ObjectId):
            data['image_metadata_id'] = str(data['image_metadata_id'])
        
        # ✅ Set defaults for ALL missing required fields (including legacy artworks)
        # First, handle required fields that might be missing
        if "token_id" not in data or data["token_id"] is None:
            # Generate token_id from _id if available
            if "_id" in data and data["_id"]:
                try:
                    # Use last 8 chars of ObjectId as hex, convert to int
                    id_str = str(data["_id"])
                    data["token_id"] = int(id_str[-8:], 16) if len(id_str) >= 8 else hash(id_str) % 1000000
                except:
                    data["token_id"] = hash(str(data.get("_id", "0"))) % 1000000
            else:
                data["token_id"] = 0
        
        if "creator_id" not in data or data["creator_id"] is None:
            data["creator_id"] = data.get("owner_id") or "unknown"
        
        if "owner_id" not in data or data["owner_id"] is None:
            data["owner_id"] = data.get("creator_id") or "unknown"
        
        if "metadata_uri" not in data or data["metadata_uri"] is None or data["metadata_uri"] == "":
            data["metadata_uri"] = "ipfs://legacy"
        
        if "royalty_percentage" not in data or data["royalty_percentage"] is None:
            data["royalty_percentage"] = 0
        
        # ✅ Handle token_id based on network
        current_network = data.get("network", "solana")
        # For Solana, keep it as a string
        if data.get("token_id") is None:
            # Generate fallback for missing token_id
            if data.get("_id"):
                data["token_id"] = int(str(data["_id"])[-8:], 16)
            else:
                data["token_id"] = 0
        
        # Default registration method to on-chain
        if "registration_method" not in data or data.get("registration_method") is None:
            data["registration_method"] = "on-chain"
        
        # ✅ Competition entry: derive is_competition_entry from registration_method
        if data.get("registration_method") == "competition":
            data["is_competition_entry"] = True
        
        if "is_on_chain" not in data or data.get("is_on_chain") is None:
            data["is_on_chain"] = True
        
        # ✅ Set defaults for optional fields
        defaults = {
            "price": 0.0,
            "is_for_sale": True,
            "is_licensed": False,
            "title": "Untitled",
            "description": "No description available", 
            "medium_category": "Unknown",
            "style_category": "Unknown", 
            "subject_category": "Unknown",
            "other_medium": None,
            "other_style": None,
            "other_subject": None,
            "attributes": {},
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "has_fallback_image": True,
            "image_ipfs_uri": None,
            "image_metadata_id": None,
            "tx_hash": None,
            "creator_solana_address": None,
            "owner_solana_address": None,
            "responsible_use_addon": False,
            "is_competition_entry": data.get("registration_method") == "competition",
            "network": "solana"
        }
        
        for field, default_value in defaults.items():
            if field not in data or data[field] is None:
                data[field] = default_value
        
        # Phase 2 defaults
        if "available_license_types" not in data or not data["available_license_types"]:
            data["available_license_types"] = [
                "PERSONAL_USE", 
                "NON_COMMERCIAL", 
                "COMMERCIAL", 
                "EXTENDED_COMMERCIAL", 
                "EXCLUSIVE", 
                "ARTWORK_OWNERSHIP", 
                "CUSTOM"
            ]
        # Handle legacy responsible_use_addon data (was a dict, now a bool)
        raw_addon = data.get("responsible_use_addon")
        if isinstance(raw_addon, dict):
            data["responsible_use_addon"] = raw_addon.get("enabled", False)
        elif raw_addon is None:
            data["responsible_use_addon"] = False
            
        # ✅ PSL Smart-Ticket Migration: Extract PSL data from nested attributes if missing from top level
        
        
        # Γ£à Ensure match_datetime and other fields are correctly typed if present
        if data.get("is_psl_ticket") and data.get("psl_metadata"):
            psl_meta = data["psl_metadata"]
            if "match_datetime" in psl_meta and isinstance(psl_meta["match_datetime"], str):
                try:
                    psl_meta["match_datetime"] = datetime.fromisoformat(psl_meta["match_datetime"].replace('Z', '+00:00'))
                except:
                    pass
        
        return cls(**data)

# Update ArtworkPublic model
class ArtworkPublic(BaseModel):
    id: str = Field(..., description="String representation of MongoDB _id")
    token_id: Union[int, str]
    creator_solana_address: Optional[str] = None
    owner_solana_address: Optional[str] = None
    creator_address: Optional[str] = None
    owner_address: Optional[str] = None
    creator_id: Optional[str] = None
    owner_id: Optional[str] = None
    creator_name: Optional[str] = None  # ✅ Add creator name
    creator_email: Optional[str] = None  # ✅ Add creator email
    owner_name: Optional[str] = None  # ✅ Add owner name
    owner_email: Optional[str] = None  # ✅ Add owner email
    metadata_uri: Optional[str] = Field(None, description="Metadata location (only for authorized users)")
    royalty_percentage: int
    price: float
    is_for_sale: bool
    is_licensed: bool
    title: str
    description: str
    medium_category: str
    style_category: str
    subject_category: str
    other_medium: Optional[str] = None  # CHANGED: Made optional with default None
    other_style: Optional[str] = None   # CHANGED: Made optional with default None
    other_subject: Optional[str] = None # CHANGED: Made optional with default None
    attributes: Dict
    # PSL Smart-Ticket fields
    is_psl_ticket: bool = Field(default=False)
    psl_metadata: Optional[Dict] = None
    created_at: datetime
    updated_at: datetime
    network: str = Field(default="wirefluid", description="Blockchain network: 'sepolia', 'wirefluid', 'algorand', or 'solana'")
    
    # NEW FIELDS: Registration method and on-chain status
    registration_method: Optional[str] = Field(None, description="Registration method: 'on-chain' or 'competition'")
    is_on_chain: Optional[bool] = Field(None, description="True if artwork is registered on blockchain")
    is_competition_entry: bool = Field(default=False, description="True if artwork was submitted as a competition entry (no payment)")
    available_license_types: List[str] = Field(default=["PERSONAL_USE", "COMMERCIAL", "EXCLUSIVE"])
    responsible_use_addon: bool = Field(default=False)
    display_id: Optional[str] = Field(None, description="Human-readable display ID")
    
    # Image fields
    image_uri: Optional[str] = Field(None, description="Primary image URI (IPFS)")
    has_fallback_image: bool = Field(default=False, description="Whether fallback image exists")

    @classmethod
    def from_db_model(cls, db_model: ArtworkInDB):
        data = db_model.model_dump(by_alias=True, exclude_none=True)
        data["id"] = str(data["_id"]) if "_id" in data else data.get("id", "")
        
        # Set image_uri from either IPFS or indicate fallback availability
        if db_model.image_ipfs_uri:
            data["image_uri"] = db_model.image_ipfs_uri
        
        data["has_fallback_image"] = db_model.has_fallback_image
        
        # ✅ Ensure optional fields have proper defaults
        data["other_medium"] = data.get("other_medium") or None
        data["other_style"] = data.get("other_style") or None
        data["other_subject"] = data.get("other_subject") or None
        
        # ✅ Handle optional wallet addresses
        data["creator_address"] = data.get("creator_address")  # Can be None
        data["owner_address"] = data.get("owner_address")      # Can be None
        
        # ✅ Add creator_id and owner_id
        data["creator_id"] = data.get("creator_id") or None
        data["owner_id"] = data.get("owner_id") or None
        
        # ✅ Add network (important for currency symbol)
        data["network"] = data.get("network") or "wirefluid"
        
        # ✅ Initialize user info fields (will be populated by endpoint)
        data["creator_name"] = None
        data["creator_email"] = None
        data["owner_name"] = None
        data["owner_email"] = None
        
        # Default to on-chain
        data["registration_method"] = data.get("registration_method") or "on-chain"
        data["is_on_chain"] = data.get("is_on_chain", True)
        
        
        # ✅ Add competition entry flag
        data["is_competition_entry"] = data.get("is_competition_entry", False)
        
        # ✅ Add PSL fields
        data["is_psl_ticket"] = data.get("is_psl_ticket", False)
        data["psl_metadata"] = data.get("psl_metadata")
        
        return cls(**data)

# NEW: Response models for duplicate detection
class DuplicateCheckResult(BaseModel):
    is_duplicate: bool
    duplicate_type: Optional[str] = None  # "exact", "perceptual", "ai"
    similarity_score: Optional[float] = None
    existing_artwork_id: Optional[str] = None
    message: str

class AIClassificationResult(BaseModel):
    is_ai_generated: bool
    confidence: float
    description: str
    model_used: str
    generated_description: Optional[str] = ""  # NEW: Add generated description field

class WalletBase(BaseModel):
    address: Annotated[str, StringConstraints(pattern=r"^0x[a-fA-F0-9]{40}$")]
    balance: float = Field(default=0.0, ge=0)

class WalletInDB(WalletBase):
    id: str = Field(..., alias="_id")
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    private_key: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Optional[str] = None
    expires_in: Optional[int] = None
    user_id: Optional[str] = None
    email: Optional[str] = None
    wallet_address: Optional[str] = None
    solana_wallet_address: Optional[str] = None
    profile_picture: Optional[str] = None
    phone_number: Optional[str] = None
    requires_profile_completion: Optional[bool] = None
    user: Optional[Dict[str, Any]] = None  # Existing field

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None
    user_id: Optional[str] = None
    wallet_address: Optional[str] = None
    solana_wallet_address: Optional[str] = None
    exp: Optional[datetime] = None
class SaleConfirmation(BaseModel):
    tx_hash: str
    token_id: Union[int, str]
    buyer_address: str
    seller_address: str
    sale_price: str

    class Config:
        # This allows the model to be created from JSON/dict
        from_attributes = True
class TransactionType(str, Enum):
    REGISTER = "REGISTER"
    GRANT_LICENSE = "GRANT_LICENSE"
    REVOKE_LICENSE = "REVOKE_LICENSE"
    TRANSFER = "TRANSFER"
    ROYALTY_PAYMENT = "ROYALTY_PAYMENT"
    SALE = "SALE"
    LICENSE_PAYMENT = "LICENSE_PAYMENT"

class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    
class TransactionCreate(BaseModel):
    tx_hash: str = Field(..., min_length=10, max_length=255)
    from_address: str = Field(..., min_length=10, max_length=255)
    to_address: Optional[str] = Field(None, min_length=0, max_length=255)
    transaction_type: TransactionType
    value: Optional[float] = Field(None, ge=0)
    status: TransactionStatus = TransactionStatus.PENDING
    metadata: Optional[dict] = {}

    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
class TransactionUpdate(BaseModel):
    status: Optional[TransactionStatus] = None
    gas_used: Optional[int] = Field(None, gt=0)
    gas_price: Optional[int] = Field(None, gt=0)
    block_number: Optional[int] = Field(None, gt=0)
class TransactionBase(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    tx_hash: str = Field(..., min_length=10, max_length=255, validation_alias=AliasChoices("tx_hash", "transaction_hash"))
    from_address: Optional[str] = Field(None, min_length=0, max_length=255)
    to_address: Optional[str] = Field(None, min_length=0, max_length=255)
    from_user_id: Optional[str] = Field(None, description="User ID of the sender")  # ADD THIS
    to_user_id: Optional[str] = Field(None, description="User ID of the receiver")  # ADD THIS
    transaction_type: TransactionType
    status: TransactionStatus = TransactionStatus.PENDING
    gas_used: Optional[int] = Field(None, gt=0)
    gas_price: Optional[int] = Field(None, gt=0)
    value: Optional[float] = Field(None, ge=0)  # In ETH
    block_number: Optional[int] = Field(None, gt=0)
    metadata: Optional[dict] = {}
    network: str = Field(default="sepolia", description="Blockchain network: 'sepolia' or 'wirefluid'")

    @field_validator("value", mode="before")
    @classmethod
    def validate_value(cls, v: Any) -> Optional[float]:
        if v == "None":
            return 0.0
        if v is None:
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat() if v else None}
    )


class PaginatedResponse(BaseModel):
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=1, le=100)
    has_next: bool

class TransactionPublic(TransactionBase):
    id: str
    created_at: datetime
    updated_at: datetime

class ArtworkListResponse(PaginatedResponse):
    artworks: List[ArtworkPublic]
    has_next: bool

class TransactionListResponse(PaginatedResponse):
    transactions: List[TransactionPublic]
    has_next: bool

class Web3ConnectionStatus(BaseModel):
    connected: bool
    account: Optional[str] = Field(None, min_length=0, max_length=255)
    chain_id: Optional[str] = None
    network_name: Optional[str] = None
    balance: Optional[str] = None

class ContractCallRequest(BaseModel):
    function_name: str
    parameters: List[Any] = []
    from_address: Optional[str] = Field(None, min_length=0, max_length=255)
    value: Optional[str] = Field(None, pattern=r"^[0-9]+$")

class ContractCallResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    tx_hash: Optional[str] = Field(None, min_length=10, max_length=255)


# License-related models

class LicenseType(str, Enum):
    PERSONAL_USE = "PERSONAL_USE"
    NON_COMMERCIAL = "NON_COMMERCIAL"
    COMMERCIAL = "COMMERCIAL"
    EXTENDED_COMMERCIAL = "EXTENDED_COMMERCIAL"
    EXCLUSIVE = "EXCLUSIVE"
    ARTWORK_OWNERSHIP = "ARTWORK_OWNERSHIP"
    CUSTOM = "CUSTOM"

class LicenseCreate(BaseModel):
    artwork_id: Optional[str] = Field(None, description="MongoDB _id of the artwork")
    token_id: Optional[int] = Field(None, description="Artwork token ID (legacy)")
    license_type: LicenseType = Field(..., description="Type of license")
    buyer_address: Optional[str] = Field(None, description="Buyer address (if not current user)")

class LicenseConfig(BaseModel):
    """Configuration for license pricing and duration"""
    id: Optional[PyObjectId] = Field(None, alias="_id")
    name: str = Field(..., description="Configuration name")
    
    # FIXED platform license fees in SOL
    personal_use_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for PERSONAL_USE in SOL")
    non_commercial_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for NON_COMMERCIAL in SOL")
    commercial_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for COMMERCIAL in SOL")
    extended_commercial_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for EXTENDED_COMMERCIAL in SOL")
    exclusive_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for EXCLUSIVE in SOL")
    artwork_ownership_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for ARTWORK_OWNERSHIP in SOL")
    custom_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for CUSTOM in SOL")
    responsible_use_fee_sol: float = Field(default=0.0, ge=0, description="Fixed platform fee for Responsible Use addon in SOL")

    # PERCENTAGE of artwork price (for percentage-based calculation)
    personal_use_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for PERSONAL_USE")
    non_commercial_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for NON_COMMERCIAL")
    commercial_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for COMMERCIAL")
    extended_commercial_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for EXTENDED_COMMERCIAL")
    exclusive_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for EXCLUSIVE")
    artwork_ownership_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for ARTWORK_OWNERSHIP")
    custom_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for CUSTOM")
    responsible_use_percentage: float = Field(default=0.0, ge=0, le=100, description="Percentage of artwork price for Responsible Use addon")
    
    # Pricing mode - determines which calculation to use
    pricing_mode: str = Field(default="fixed", description="fixed or percentage")
    
    # License duration
    license_duration_days: int = Field(..., ge=1, description="License duration in days")
    
    # Configuration metadata
    is_active: bool = Field(default=True, description="Whether this configuration is active")
    description: Optional[str] = Field(None, description="Configuration description")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, v: Any) -> Optional[str]:
        if isinstance(v, ObjectId):
            return str(v)
        return v

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str},
        arbitrary_types_allowed=True
    )

class LicenseConfigCreate(BaseModel):
    """Model for creating license configuration"""
    name: str = Field(..., description="Configuration name")
    personal_use_fee_eth: float = Field(default=0.0, ge=0)
    non_commercial_fee_eth: float = Field(default=0.0, ge=0)
    commercial_fee_eth: float = Field(default=0.0, ge=0)
    extended_commercial_fee_eth: float = Field(default=0.0, ge=0)
    exclusive_fee_eth: float = Field(default=0.0, ge=0)
    artwork_ownership_fee_eth: float = Field(default=0.0, ge=0)
    custom_fee_eth: float = Field(default=0.0, ge=0)
    responsible_use_fee_eth: float = Field(default=0.0, ge=0)

    personal_use_percentage: float = Field(default=0.0, ge=0, le=100)
    non_commercial_percentage: float = Field(default=0.0, ge=0, le=100)
    commercial_percentage: float = Field(default=0.0, ge=0, le=100)
    extended_commercial_percentage: float = Field(default=0.0, ge=0, le=100)
    exclusive_percentage: float = Field(default=0.0, ge=0, le=100)
    artwork_ownership_percentage: float = Field(default=0.0, ge=0, le=100)
    custom_percentage: float = Field(default=0.0, ge=0, le=100)
    responsible_use_percentage: float = Field(default=0.0, ge=0, le=100)
    pricing_mode: str = Field(default="fixed")
    license_duration_days: int = Field(..., ge=1)
    description: Optional[str] = Field(None)
    is_active: bool = Field(default=True)

class LicenseConfigUpdate(BaseModel):
    """Model for updating license configuration"""
    name: Optional[str] = Field(None)
    personal_use_fee_eth: Optional[float] = Field(None, ge=0)
    non_commercial_fee_eth: Optional[float] = Field(None, ge=0)
    commercial_fee_eth: Optional[float] = Field(None, ge=0)
    extended_commercial_fee_eth: Optional[float] = Field(None, ge=0)
    exclusive_fee_eth: Optional[float] = Field(None, ge=0)
    artwork_ownership_fee_eth: Optional[float] = Field(None, ge=0)
    custom_fee_eth: Optional[float] = Field(None, ge=0)
    responsible_use_fee_eth: Optional[float] = Field(None, ge=0)

    personal_use_percentage: Optional[float] = Field(None, ge=0, le=100)
    non_commercial_percentage: Optional[float] = Field(None, ge=0, le=100)
    commercial_percentage: Optional[float] = Field(None, ge=0, le=100)
    extended_commercial_percentage: Optional[float] = Field(None, ge=0, le=100)
    exclusive_percentage: Optional[float] = Field(None, ge=0, le=100)
    artwork_ownership_percentage: Optional[float] = Field(None, ge=0, le=100)
    custom_percentage: Optional[float] = Field(None, ge=0, le=100)
    responsible_use_percentage: Optional[float] = Field(None, ge=0, le=100)
    pricing_mode: Optional[str] = Field(None)
    license_duration_days: Optional[int] = Field(None, ge=1)
    description: Optional[str] = Field(None)
    is_active: Optional[bool] = Field(None)

class LicenseFeeCalculation(BaseModel):
    """Model for license fee calculation results"""
    license_type: LicenseType
    pricing_mode: str
    artwork_price_sol: Optional[float] = None
    license_percentage: Optional[float] = None
    fixed_fee_sol: Optional[float] = None
    platform_fee_sol: float
    license_fee_sol: float
    addon_fee_sol: float
    total_amount_sol: float
    license_fee_lamports: str
    total_amount_lamports: str
    duration_days: int
    start_date: datetime
    end_date: datetime
    calculation_method: str
from pydantic import field_validator

class License(BaseModel):
    license_id: int
    artwork_id: Optional[str] = None
    token_id: Union[int, str]
    buyer_id: Optional[str] = None
    license_type: Union[LicenseType, str]
    total_amount_sol: str
    total_amount_lamports: str
    is_active: bool
    purchase_time: str
    buyer_address: Optional[str] = None
    owner_address: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    source: Optional[str] = "blockchain"
    
    # Optional fields with defaults
    total_amount_usd: Optional[float] = 0.0
    actual_amount_sol: Optional[str] = "0"
    license_fee_sol: Optional[str] = "0" 
    actual_amount_lamports: Optional[str] = "0"
    license_fee_lamports: Optional[str] = "0"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_days: Optional[int] = 30
    artwork_price_sol: Optional[float] = 0.0
    license_config_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    revoked_at: Optional[str] = None
    buyer_info: Optional[Dict[str, Any]] = None
    artwork_info: Optional[Dict[str, Any]] = None
    owner_email: Optional[str] = None
    buyer_email: Optional[str] = None
    owner_name: Optional[str] = None
    buyer_name: Optional[str] = None

    # ✅ ADD VALIDATORS TO CONVERT TYPES
    @field_validator('total_amount_sol', 'actual_amount_sol', 'license_fee_sol', 'total_amount_lamports', 'actual_amount_lamports', 'license_fee_lamports', mode='before')
    @classmethod
    def convert_numeric_to_string(cls, v):
        """Convert float/int/None to string safely"""
        if v is None:
            return "0"
        return str(v)

    @field_validator('buyer_address', 'owner_address', mode='before')
    @classmethod
    def convert_none_to_empty_string(cls, v):
        if v is None:
            return ""
        return v

    @field_validator('purchase_time', 'start_date', 'end_date', 'created_at', 'updated_at', 'revoked_at', mode='before')
    @classmethod
    def convert_datetime_to_string(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @classmethod
    def from_mongo(cls, data: dict):
        if "_id" in data:
            data.pop("_id")
        return cls(**data)

class LicenseInDB(License):
    id: Optional[str] = Field(None, alias="_id")
    transaction_data: Optional[Dict[str, Any]] = None
    blockchain_license_id: Optional[int] = None
    
    @classmethod
    def from_mongo(cls, data: dict):
        if "_id" in data:
            data["id"] = str(data["_id"])
        
        # Convert datetime objects
        for field in ["purchase_time", "start_date", "end_date", "created_at", "updated_at", "revoked_at"]:
            if field in data and isinstance(data[field], datetime):
                data[field] = data[field].isoformat()
        
        return cls(**data)

class LicensePriceResponse(BaseModel):
    success: bool
    prices: Dict[str, Dict[str, Any]]
    platform_fee_percentage: float
    duration_days: int
    note: str
    config_name: str

class LicensePurchase(BaseModel):
    artwork_id: Optional[str] = None
    token_id: Optional[Union[int, str]] = None
    license_type: LicenseType
    buyer_address: str
    network: Optional[str] = None

class LicenseListResponse(BaseModel):
    licenses: list[License]
    total: int
    page: int = 1
    size: int = 20
    has_next: bool = False

class LicenseFeeBreakdown(BaseModel):
    license_type: LicenseType
    total_amount_sol: float
    actual_amount_sol: float
    platform_fee_sol: float
    platform_fee_percentage: str
    total_amount_lamports: str
    actual_amount_lamports: str
    platform_fee_lamports: str

class TransactionInDB(TransactionCreate):
    id: Optional[str] = Field(None, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    block_number: Optional[int] = None
    gas_used: Optional[int] = None
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    @classmethod
    def from_mongo(cls, data: dict):
        """Convert MongoDB document to Pydantic model"""
        if "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)

class TransactionPublic(TransactionBase):
    id: str
    created_at: datetime
    updated_at: datetime

class PaginatedResponse(BaseModel):
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=1, le=100)
    has_next: bool

class ArtworkListResponse(PaginatedResponse):
    artworks: List[ArtworkPublic]
    has_next: bool

class TransactionListResponse(PaginatedResponse):
    transactions: List[TransactionPublic]
    has_next: bool

class Web3ConnectionStatus(BaseModel):
    connected: bool
    account: Optional[str] = Field(None, min_length=0, max_length=255)
    chain_id: Optional[str] = None
    network_name: Optional[str] = None
    balance: Optional[str] = None

class ContractCallRequest(BaseModel):
    function_name: str
    parameters: List[Any] = []
    from_address: Optional[str] = Field(None, min_length=0, max_length=255)
    value: Optional[str] = Field(None, pattern=r"^[0-9]+$")

class ContractCallResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    tx_hash: Optional[str] = Field(None, min_length=10, max_length=255)

class TokenMetadata(BaseModel):
    name: str
    description: str
    image: str
    attributes: List[dict]
    external_url: Optional[str] = None
    animation_url: Optional[str] = None
class UserHistory(BaseModel):
    user_id: str = Field(..., description="Unique ID of the user")
    action: str = Field(..., description="Action type: purchase, search, upload, or license_purchase")
    artwork_id: Optional[str] = Field(None, description="Artwork ID for all actions when available")
    artwork_token_id: Optional[int] = Field(None, description="Blockchain token ID if available")
    query: Optional[str] = Field(None, description="Search query if action is search")
    license_type: Optional[str] = Field(None, description="License type if action is license_purchase")
    metadata: Optional[dict] = Field(None, description="Additional metadata about the action")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Action timestamp")
    
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str}
    )

class UserHistoryInDB(UserHistory):
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")



# Add this to your models file
class SaleTransactionRequest(BaseModel):
    artwork_id: Optional[str] = None
    token_id: Optional[Union[int, str]] = None
    buyer_address: str
    # seller_address: str
    seller_address: Optional[str] = None  # ✅ Make optional
    # sale_price_wei: int
    sale_price_wei: Optional[int] = None
    network: Optional[str] = None
    
class SaleConfirmationRequest(BaseModel):
    tx_hash: str
    artwork_id: Optional[str] = None
    token_id: Optional[Union[int, str]] = None
    buyer_address: str
    seller_address: str
    sale_price_wei: str
    sale_price_eth: Optional[float] = None
    payment_method: Optional[str] = "crypto"
    network: Optional[str] = None

# ============================================
# OAuth Models
# ============================================

class OAuthProvider(str, Enum):
    GOOGLE = "google"
    FACEBOOK = "facebook"
    GITHUB = "github"

class GoogleUserInfo(BaseModel):
    """Google OAuth user information"""
    sub: str = Field(..., description="Google user ID")
    email: EmailStr
    email_verified: bool
    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    picture: Optional[str] = None
    locale: Optional[str] = None

class OAuthLoginRequest(BaseModel):
    """Request model for OAuth login"""
    provider: OAuthProvider
    code: Optional[str] = None  # Authorization code
    redirect_uri: Optional[str] = None

class OAuthCallbackRequest(BaseModel):
    """OAuth callback data"""
    code: str = Field(..., description="Authorization code from OAuth provider")
    state: Optional[str] = Field(None, description="State parameter for CSRF protection")

class OAuthTokenResponse(BaseModel):
    """OAuth token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    refresh_token: Optional[str] = None
    scope: Optional[str] = None

class UserOAuthLink(BaseModel):
    """Model for linking OAuth account to existing user"""
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    user_id: str = Field(..., description="User ID")
    provider: OAuthProvider
    provider_user_id: str = Field(..., description="OAuth provider's user ID")
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str}
    )

# --- Blog Models ---

class BlogStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class BlogBase(BaseModel):
    title: str = Field(..., min_length=5, max_length=200)
    slug: str = Field(..., description="SEO friendly URL slug")
    excerpt: Optional[str] = Field(None, max_length=500, description="Short summary of the blog")
    content: str = Field(..., description="Rich text or Markdown content")
    cover_image: Optional[str] = Field(None, description="URL or GridFS ID of the cover image")
    author_id: str = Field(..., description="User ID of the author")
    author_name: Optional[str] = Field(None, description="Name of the author for display")
    original_author_name: Optional[str] = Field(None, description="Permanent record of the original creator")
    publisher_name: Optional[str] = Field(None, description="Username of the admin who published the blog")
    tags: List[str] = Field(default=[], description="List of tags/categories")
    status: BlogStatus = Field(default=BlogStatus.DRAFT)
    views_count: int = Field(default=0)
    
class BlogCreate(BaseModel):
    title: str
    excerpt: Optional[str] = None
    content: str
    cover_image: Optional[str] = None
    author_name: Optional[str] = None
    tags: List[str] = []
    status: BlogStatus = BlogStatus.DRAFT

class BlogUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    cover_image: Optional[str] = None
    author_name: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[BlogStatus] = None

class BlogInDB(BlogBase):
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class BlogPublic(BlogInDB):
    """Model for public API response (includes content)"""
    pass

class BlogSummary(BaseModel):
    """Model for list view (excludes content for speed)"""
    id: str = Field(..., alias="_id")
    title: str
    slug: str
    excerpt: Optional[str] = None
    cover_image: Optional[str] = None
    author_name: Optional[str] = None
    original_author_name: Optional[str] = None
    publisher_name: Optional[str] = None
    tags: List[str] = []
    status: BlogStatus
    views_count: int
    created_at: datetime
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class BlogUploadResponse(BaseModel):
    """Response after parsing a docx file"""
    title: str
    content: str
    images: List[str] = [] # Potential image extraction
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={ObjectId: str}
    )