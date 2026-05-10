import pyotp
import qrcode
import io
import base64
import secrets
from typing import List, Tuple

class TwoFactorService:
    """Service for handling Two-Factor Authentication"""
    
    @staticmethod
    def generate_secret() -> str:
        """Generate a random base32 secret for TOTP"""
        return pyotp.random_base32()
    
    @staticmethod
    def generate_qr_code(email: str, secret: str, issuer: str = "XDRM") -> str:
        """
        Generate QR code for authenticator app setup
        Returns base64 encoded image
        """
        # Create TOTP URI
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=email,
            issuer_name=issuer
        )
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/png;base64,{img_base64}"
    
    @staticmethod
    def verify_totp(secret: str, token: str) -> bool:
        """Verify TOTP token"""
        totp = pyotp.TOTP(secret)
        return totp.verify(token, valid_window=1)
    
    @staticmethod
    def generate_backup_codes(count: int = 8) -> List[str]:
        """Generate backup codes for account recovery"""
        return [
            f"{secrets.randbelow(10000):04d}-{secrets.randbelow(10000):04d}"
            for _ in range(count)
        ]
    
    @staticmethod
    def verify_backup_code(stored_codes: List[str], provided_code: str) -> Tuple[bool, List[str]]:
        """
        Verify backup code and remove it from the list
        Returns (is_valid, remaining_codes)
        """
        if provided_code in stored_codes:
            remaining_codes = [code for code in stored_codes if code != provided_code]
            return True, remaining_codes
        return False, stored_codes


# Create singleton instance
two_factor_service = TwoFactorService()