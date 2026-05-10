from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List, Optional, Union
import os

class Settings(BaseSettings):
    # Database
    MONGODB_URI: str = os.getenv('MONGODB_URI')
    DB_NAME: str = os.getenv('DB_NAME')
    FRONTEND_URL: str = os.getenv('FRONTEND_URL', 'https://xdrm.softechdigitalgroup.com')

    # JWT / Security
    JWT_SECRET_KEY: str = os.getenv('JWT_SECRET_KEY')
    SECRET_KEY: str = os.getenv('SECRET_KEY')
    JWT_ALGORITHM: str = os.getenv('JWT_ALGORITHM')
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Blockchain - Ethereum Sepolia
    WEB3_PROVIDER_URL: str = "https://eth-sepolia.public.blastapi.io"
    CONTRACT_ADDRESS: str = os.getenv('CONTRACT_ADDRESS')
    
    # PSL Hackathon Demo Mode (bypasses time-gate for judges)
    DEMO_MODE: bool = os.getenv('DEMO_MODE', 'true').lower() == 'true'

    # Blockchain - WireFluid Testnet
    WIREFLUID_RPC_URL: str = os.getenv('WIREFLUID_RPC_URL', 'https://evm.wirefluid.com')
    WIREFLUID_CHAIN_ID: int = int(os.getenv('WIREFLUID_CHAIN_ID', '92533'))
    WIREFLUID_CONTRACT_ADDRESS: Optional[str] = os.getenv('WIREFLUID_CONTRACT_ADDRESS')
    
    # Blockchain - Algorand Testnet
    ALGORAND_ALGOD_URL: str = os.getenv('ALGORAND_ALGOD_URL', 'https://testnet-api.algonode.cloud')
    ALGORAND_ALGOD_TOKEN: str = os.getenv('ALGORAND_ALGOD_TOKEN', '')
    ALGORAND_INDEXER_URL: str = os.getenv('ALGORAND_INDEXER_URL', 'https://testnet-idx.algonode.cloud')
    ALGORAND_INDEXER_TOKEN: str = os.getenv('ALGORAND_INDEXER_TOKEN', '')
    ALGORAND_APP_ID: int = int(os.getenv('ALGORAND_APP_ID', '0'))
    
    # Blockchain - Solana Devnet
    SOLANA_RPC_URL: str = os.getenv('SOLANA_RPC_URL', 'https://api.devnet.solana.com')
    SOLANA_PLATFORM_ADDRESS: str = os.getenv('SOLANA_PLATFORM_ADDRESS', '')
    SOLANA_PLATFORM_PRIVATE_KEY: Optional[str] = os.getenv('SOLANA_PLATFORM_PRIVATE_KEY')
    SOLANA_PROGRAM_ID: str = os.getenv('SOLANA_PROGRAM_ID', '')
    
    ACTIVE_NETWORK: str = os.getenv('ACTIVE_NETWORK', 'sepolia')  # 'sepolia', 'wirefluid', 'algorand', or 'solana'
    
    # Authorized PSL Issuers (List of emails)
    AUTHORIZED_PSL_ISSUERS: Union[str, List[str]] = []

    @field_validator("AUTHORIZED_PSL_ISSUERS", mode="before")
    @classmethod
    def parse_authorized_issuers(cls, v):
        if isinstance(v, str):
            return [email.strip() for email in v.split(",") if email.strip()]
        return v

    # CORS - let pydantic-settings parse from .env file (JSON array format)
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173"]

    # IPFS / Pinata
    PINATA_API_KEY: Optional[str] = None
    PINATA_SECRET_API_KEY: Optional[str] = None
    NFT_STORAGE_API_KEY: Optional[str] = None
    WEB3_STORAGE_API_KEY: Optional[str] = None

    # API Keys
    GROQ_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    OPEN_API_KEY: Optional[str] = None

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID: str = os.getenv('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET: str = os.getenv('GOOGLE_CLIENT_SECRET')
    GOOGLE_REDIRECT_URI: str = os.getenv('GOOGLE_REDIRECT_URI')
    GOOGLE_OAUTH_SCOPES: List[str] = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"  

settings = Settings()
