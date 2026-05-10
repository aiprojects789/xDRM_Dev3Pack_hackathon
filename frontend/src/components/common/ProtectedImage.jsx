import React, { useState } from 'react';
import { useCanvasImage } from '../../hooks/useCanvasImage';
import { Palette } from 'lucide-react';
import toast from 'react-hot-toast';

const ProtectedImage = ({
  imageUrl,
  thumbnailUrl, // NEW: Add thumbnail support
  alt,
  className = '',
  onError,
  showToast = true,
  aspectRatio = 'square', // 'square', 'auto', or custom
  fallbackToImg = true // Fallback to regular img if canvas fails
}) => {
  const { canvasRef, isLoading, error, imageDimensions } = useCanvasImage(imageUrl);
  const [useFallback, setUseFallback] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  const handleContextMenu = (e) => {
    if (showToast) {
      toast('Save Image option is disabled to protect artwork', {
        duration: 2000,
        icon: '🔒',
      });
    }
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    return false;
  };

  // Use fallback if error and fallbackToImg is true
  if (error && fallbackToImg && !useFallback) {
    setUseFallback(true);
  }

  // Fallback to regular img tag if canvas fails
  if (useFallback || (error && fallbackToImg)) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-cover ${className}`}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onError={() => {
          if (onError) onError();
        }}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto'
        }}
        draggable={false}
      />
    );
  }

  if (error && !fallbackToImg) {
    if (onError) onError();
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <Palette className="w-12 h-12 text-gray-400" />
        <p className="text-sm text-gray-500 ml-2">Image unavailable</p>
      </div>
    );
  }

  // Calculate aspect ratio style
  const aspectStyle = aspectRatio === 'square'
    ? { aspectRatio: '1 / 1' }
    : aspectRatio === 'auto' && imageDimensions.width > 0
      ? { aspectRatio: `${imageDimensions.width} / ${imageDimensions.height}` }
      : {};

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none',
        ...aspectStyle
      }}
    >
      {/* 1. Low-res Thumbnail (Loads instantly) */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover blur-sm transition-opacity duration-500 ${
            !isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => setThumbnailLoaded(true)}
        />
      )}

      {/* 2. Loading skeleton (Shown only if no thumbnail or thumbnail not yet loaded) */}
      {isLoading && (!thumbnailUrl || !thumbnailLoaded) && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center z-10">
          <Palette className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* 3. High-res Canvas Image (Fades in over thumbnail) */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          isLoading ? 'opacity-0' : 'opacity-100'
        } transition-opacity duration-500 z-20`}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto',
          display: 'block',
          objectFit: 'cover'
        }}
      />
    </div>
  );
};

export default ProtectedImage;