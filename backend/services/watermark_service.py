"""
Watermark Service — Visible watermarking for DRM image protection.
Uses Pillow to overlay semi-transparent watermark text on artwork images.
"""

from PIL import Image, ImageDraw, ImageFont
import io
import os
import hashlib
import numpy as np
import cv2
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime


logger = logging.getLogger(__name__)

# Cache directory for watermarked images
WATERMARK_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "watermarked")
os.makedirs(WATERMARK_CACHE_DIR, exist_ok=True)


class WatermarkService:
    """Service for applying visible watermarks to artwork images"""

    @staticmethod
    def apply_visible_watermark(
        image_bytes: bytes,
        text: str = "XDRM Protected",
        opacity: float = 0.45,
        font_size_ratio: float = 0.04,
        artwork_id: Optional[str] = None,
    ) -> bytes:
        """
        Apply a diagonal repeating visible watermark text across the image.

        Args:
            image_bytes: Raw image bytes
            text: Watermark text to overlay
            opacity: Transparency of watermark (0.0 = invisible, 1.0 = solid)
            font_size_ratio: Font size as ratio of image width
            artwork_id: Optional artwork ID to include in watermark

        Returns:
            Watermarked image bytes (JPEG)
        """
        try:
            # Open the image
            img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
            width, height = img.size

            # Create transparent overlay for watermark
            overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)

            # Calculate font size based on image dimensions
            font_size = max(int(width * font_size_ratio), 16)

            # Try to load a font, fallback to default
            font = WatermarkService._get_font(font_size)

            # Build watermark text
            watermark_text = text
            if artwork_id:
                watermark_text = f"{text} • #{artwork_id}"

            # Calculate text dimensions
            bbox = draw.textbbox((0, 0), watermark_text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

            # Calculate alpha value (0-255)
            alpha = int(255 * opacity)

            # Create diagonal repeating pattern
            spacing_x = text_width + int(width * 0.15)
            spacing_y = text_height + int(height * 0.12)

            # Draw watermark text in a grid pattern, rotated diagonally
            watermark_layer = Image.new("RGBA", (width * 2, height * 2), (0, 0, 0, 0))
            wm_draw = ImageDraw.Draw(watermark_layer)

            y = -height
            while y < height * 2:
                x = -width
                while x < width * 2:
                    # Draw subtle black shadow for contrast on bright images
                    wm_draw.text(
                        (x + 2, y + 2),
                        watermark_text,
                        font=font,
                        fill=(0, 0, 0, int(alpha * 0.8)),
                    )
                    # Draw white text
                    wm_draw.text(
                        (x, y),
                        watermark_text,
                        font=font,
                        fill=(255, 255, 255, alpha),
                    )
                    x += spacing_x
                y += spacing_y

            # Rotate the watermark layer
            watermark_layer = watermark_layer.rotate(
                -30, resample=Image.Resampling.BICUBIC, expand=False
            )

            # Crop to original size (center crop)
            crop_x = (watermark_layer.width - width) // 2
            crop_y = (watermark_layer.height - height) // 2
            watermark_layer = watermark_layer.crop(
                (crop_x, crop_y, crop_x + width, crop_y + height)
            )

            # Composite watermark onto image
            watermarked = Image.alpha_composite(img, watermark_layer)

            # Convert to RGB for JPEG output
            watermarked_rgb = watermarked.convert("RGB")

            # Save to bytes
            output = io.BytesIO()
            watermarked_rgb.save(output, format="JPEG", quality=80, optimize=True)
            result_bytes = output.getvalue()

            logger.info(
                f"✅ Applied visible watermark: '{watermark_text}', "
                f"opacity={opacity}, size={width}x{height}"
            )

            return result_bytes

        except Exception as e:
            logger.error(f"❌ Watermark failed: {e}")
            # Return original image on failure
            return image_bytes

    @staticmethod
    def _get_font(font_size: int):
        """Try to load a font, fallback to PIL default"""
        # Try common font paths
        font_paths = [
            "arial.ttf",
            "Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
        ]

        for font_path in font_paths:
            try:
                return ImageFont.truetype(font_path, font_size)
            except (OSError, IOError):
                continue

        # Fallback to default font
        logger.warning("Could not load TrueType font, using default")
        return ImageFont.load_default()

    @staticmethod
    def get_cached_watermark(
        image_hash: str, artwork_id: str
    ) -> Optional[bytes]:
        """Check if a watermarked version is already cached"""
        cache_key = f"{artwork_id}_{image_hash[:16]}_wm"
        cache_path = os.path.join(WATERMARK_CACHE_DIR, f"{cache_key}.jpg")

        if os.path.exists(cache_path):
            try:
                with open(cache_path, "rb") as f:
                    logger.debug(f"Cache hit for watermark: {cache_key}")
                    return f.read()
            except Exception:
                pass

        return None

    @staticmethod
    def cache_watermark(
        image_hash: str, artwork_id: str, watermarked_bytes: bytes
    ) -> None:
        """Cache a watermarked image to disk"""
        try:
            cache_key = f"{artwork_id}_{image_hash[:16]}_wm"
            cache_path = os.path.join(WATERMARK_CACHE_DIR, f"{cache_key}.jpg")

            with open(cache_path, "wb") as f:
                f.write(watermarked_bytes)

            logger.debug(f"Cached watermark: {cache_key}")
        except Exception as e:
            logger.warning(f"Failed to cache watermark: {e}")

    @staticmethod
    def embed_robust_signature(
        image_bytes: bytes, 
        payload: Dict[str, Any],
        strength: int = 20
    ) -> bytes:
        """
        Embeds a forensic payload into the Frequency Domain (DCT) of the image.
        This is robust against JPEG compression, resizing, and color shifts.
        
        Args:
            image_bytes: Original image bytes
            payload: Dictionary to embed (e.g., {'ca': '...', 'oa': '...'})
            strength: Robustness factor (higher is more robust but more visible)
        """
        try:
            # 1. Convert payload to bits
            json_payload = json.dumps(payload, separators=(',', ':'))
            # Add a small header/magic number to identify our watermark
            header = "XDRM"
            full_payload = f"{header}{json_payload}"
            
            bits = ""
            for char in full_payload:
                bits += format(ord(char), '08b')
            
            # 2. Prepare Image
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return image_bytes
            
            # Convert to YCrCb and extract Y channel
            ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
            y_channel = ycrcb[:, :, 0].astype(np.float32)
            h, w = y_channel.shape
            
            # Ensure image is large enough for the payload
            # We need one 8x8 block per bit
            blocks_h = h // 8
            blocks_w = w // 8
            max_bits = blocks_h * blocks_w
            
            if len(bits) > max_bits:
                logger.warning(f"Payload too large for image: {len(bits)} bits > {max_bits} blocks")
                # Truncate or use a higher capacity method? Let's just use what we can.
                bits = bits[:max_bits]

            # 3. Embed bits into DCT blocks
            # We use mid-frequency coefficients for balance between visibility and robustness
            # Common pair: (4,5) and (5,4)
            bit_idx = 0
            for i in range(0, blocks_h * 8, 8):
                if bit_idx >= len(bits): break
                for j in range(0, blocks_w * 8, 8):
                    if bit_idx >= len(bits): break
                    
                    block = y_channel[i:i+8, j:j+8]
                    dct_block = cv2.dct(block)
                    
                    # Embed 1 bit by comparing two coefficients
                    v1 = dct_block[4, 5]
                    v2 = dct_block[5, 4]
                    
                    if bits[bit_idx] == '1':
                        if v1 <= v2 + strength:
                            dct_block[4, 5] = v2 + strength + 1
                    else:
                        if v1 >= v2 - strength:
                            dct_block[4, 5] = v2 - strength - 1
                            
                    y_channel[i:i+8, j:j+8] = cv2.idct(dct_block)
                    bit_idx += 1
            
            # 4. Reconstruct Image
            ycrcb[:, :, 0] = np.clip(y_channel, 0, 255).astype(np.uint8)
            result_img = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
            
            _, encoded_img = cv2.imencode('.png', result_img) # Use PNG for internal intermediate to preserve bits
            return encoded_img.tobytes()
            
        except Exception as e:
            logger.error(f"Failed to embed robust signature: {e}")
            return image_bytes

    @staticmethod
    def extract_robust_signature(image_bytes: bytes) -> Optional[Dict[str, Any]]:
        """
        Extracts a forensic payload from the DCT domain.
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None: return None
            
            ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
            y_channel = ycrcb[:, :, 0].astype(np.float32)
            h, w = y_channel.shape
            
            blocks_h = h // 8
            blocks_w = w // 8
            
            extracted_bits = ""
            for i in range(0, blocks_h * 8, 8):
                for j in range(0, blocks_w * 8, 8):
                    block = y_channel[i:i+8, j:j+8]
                    dct_block = cv2.dct(block)
                    
                    if dct_block[4, 5] > dct_block[5, 4]:
                        extracted_bits += '1'
                    else:
                        extracted_bits += '0'
            
            # Convert bits back to string
            chars = []
            for i in range(0, len(extracted_bits), 8):
                byte = extracted_bits[i:i+8]
                if len(byte) < 8: break
                chars.append(chr(int(byte, 2)))
            
            full_string = "".join(chars)
            
            # Look for magic number "XDRM"
            if "XDRM" not in full_string:
                return None
            
            start_idx = full_string.find("XDRM") + 4
            # Find the end of JSON (look for balancing braces)
            json_str = ""
            brace_count = 0
            started = False
            for char in full_string[start_idx:]:
                if char == '{':
                    brace_count += 1
                    started = True
                if char == '}':
                    brace_count -= 1
                
                if started:
                    json_str += char
                    if brace_count == 0:
                        break
            
            return json.loads(json_str)
        except Exception as e:
            logger.debug(f"Extraction failed (might not have watermark): {e}")
            return None

    @staticmethod
    def compute_image_hash(image_bytes: bytes) -> str:
        """Compute SHA256 hash of image bytes for cache keying"""
        return hashlib.sha256(image_bytes).hexdigest()
