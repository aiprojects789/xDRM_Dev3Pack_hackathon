import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useWeb3 } from '../../../context/Web3Context';
import { artworksAPI, usageAPI } from '../../../services/api';
import { Palette, ArrowRight, X, Wallet, Loader, Database, Eye, Download, Camera, Shield, Check, Info, Zap, Share2 } from 'lucide-react';
import { UserIdentifier, CurrencyConverter, ArtworkStatus } from '../../../utils/currencyUtils';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { useImageProtection } from '../../../hooks/useImageProtection';
import ProtectedImage from '../../../components/common/ProtectedImage';
import { cacheService } from "../../../services/cacheService";
import ShareModal from '../../../components/common/ShareModal';
import { PublicKey, Transaction } from "@solana/web3.js";
import { createApproveInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

// Image loading manager - prevents duplicate requests and limits concurrency
const imageLoadingManager = {
  loadingImages: new Set(), // Track images currently loading
  loadedImages: new Set(), // Track successfully loaded images
  loadingQueue: [], // Queue for images waiting to load
  maxConcurrent: 6, // Maximum concurrent image loads
  currentLoading: 0, // Current number of images loading

  canLoad() {
    return this.currentLoading < this.maxConcurrent;
  },

  startLoading(url) {
    if (this.loadingImages.has(url) || this.loadedImages.has(url)) {
      return false; // Already loading or loaded
    }

    if (this.canLoad()) {
      this.loadingImages.add(url);
      this.currentLoading++;
      return true;
    }

    // Add to queue if at capacity
    if (!this.loadingQueue.includes(url)) {
      this.loadingQueue.push(url);
    }
    return false;
  },

  finishLoading(url, success = true) {
    this.loadingImages.delete(url);
    this.currentLoading--;

    if (success) {
      this.loadedImages.add(url);
    }

    // Process next in queue
    if (this.loadingQueue.length > 0 && this.canLoad()) {
      const nextUrl = this.loadingQueue.shift();
      this.startLoading(nextUrl);
      return nextUrl;
    }
    return null;
  },

  isLoaded(url) {
    return this.loadedImages.has(url);
  }
};

// Preconnect to image server for faster connections
const preconnectToImageServer = (() => {
  let preconnected = false;
  return (baseUrl) => {
    if (preconnected || !baseUrl) return;

    try {
      const url = new URL(baseUrl);
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = url.origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);

      // Also prefetch DNS
      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch';
      dnsLink.href = url.origin;
      document.head.appendChild(dnsLink);

      preconnected = true;
    } catch (e) {
      // Invalid URL, skip preconnect
    }
  };
})();

// Connection-aware loading - adjust strategy based on connection speed
const getConnectionAwareSettings = () => {
  if (typeof navigator !== 'undefined' && navigator.connection) {
    const connection = navigator.connection;
    const effectiveType = connection.effectiveType; // '4g', '3g', '2g', 'slow-2g'
    const saveData = connection.saveData; // Data saver mode

    if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
      return {
        rootMargin: '0px', // Don't prefetch on slow connections
        maxConcurrent: 2, // Reduce concurrent loads
        priority: false // Don't prioritize
      };
    } else if (effectiveType === '3g') {
      return {
        rootMargin: '50px',
        maxConcurrent: 4,
        priority: false
      };
    }
  }

  // Default for 4G and faster
  return {
    rootMargin: '100px',
    maxConcurrent: 6,
    priority: true
  };
};

// Optimized image loading with Intersection Observer, deduplication, and concurrency control
const OptimizedImage = React.memo(({ src, alt, className, priority = false }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const connectionSettings = useMemo(() => getConnectionAwareSettings(), []);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    // Check if image is already loaded (deduplication)
    if (imageLoadingManager.isLoaded(src)) {
      setImageSrc(src);
      setIsLoading(true); // Will be set to false on load
      return;
    }

    // Adjust max concurrent based on connection
    imageLoadingManager.maxConcurrent = connectionSettings.maxConcurrent;

    // If priority, try to load immediately (if within concurrency limit)
    if (priority && connectionSettings.priority) {
      if (imageLoadingManager.startLoading(src)) {
        setImageSrc(src);
      } else {
        // If at capacity, wait a bit and retry
        const timeoutId = setTimeout(() => {
          if (imageLoadingManager.startLoading(src)) {
            setImageSrc(src);
          }
        }, 100);
        return () => clearTimeout(timeoutId);
      }
      return;
    }

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Check if can start loading (concurrency control)
            if (imageLoadingManager.startLoading(src)) {
              setImageSrc(src);
              observer.disconnect();
            }
          } else {
            // Unload image if it goes far out of viewport (memory management)
            // Only for non-priority images and if image is loaded
            if (!priority && imageSrc && entry.boundingClientRect.bottom < -500) {
              // Image is more than 500px above viewport, could unload
              // But keep it loaded for smooth scrolling back up
            }
          }
        });
      },
      {
        rootMargin: connectionSettings.rootMargin,
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
      observerRef.current = observer;
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      // Cancel ongoing request if component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [src, priority, connectionSettings]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    imageLoadingManager.finishLoading(src, true);
  }, [src]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    imageLoadingManager.finishLoading(src, false);
  }, [src]);

  // ProtectedImage handles its own loading state natively or via Canvas,
  // so we can mark this wrapper as "loaded" immediately once src is set,
  // freeing up concurrency slots in the manager.
  useEffect(() => {
    if (imageSrc && !hasError) {
      handleLoad();
    }
  }, [imageSrc, hasError, handleLoad]);

  return (
    <div
      ref={imgRef}
      className={`${className} image-container`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onSelect={(e) => e.preventDefault()}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* Skeleton loader - show while loading or waiting to load */}
      {isLoading && (
        <div
          className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center"
          style={{ willChange: 'opacity' }} // CSS performance hint
        >
          <Palette className="w-8 h-8 text-gray-400" />
        </div>
      )}

      {/* Actual image - only render when we have a src */}
      {imageSrc && !hasError && (
        <>
          {/* Transparent overlay */}
          <div
            className="absolute inset-0 z-10"
            style={{ background: 'transparent', cursor: 'default' }}
            onContextMenu={(e) => e.preventDefault()}
          />

          <ProtectedImage
            imageUrl={imageSrc}
            alt={alt}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 relative z-0 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            onError={handleError}
          />
        </>
      )}

      {/* Error placeholder */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
          <Palette className="w-12 h-12 text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">Image unavailable</p>
        </div>
      )}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

// Memoized ArtworkCardItem component for better performance
const ArtworkCardItem = React.memo(({
  artwork,
  baseUrl,
  onRegisterOnChain,
  onDelist,
  onListForSale,
  registeringArtworkId,
  registrationStep,
  formatDate,
  formatPrice,
  imagePriority = false,
  onOpenAddonSettings, // ✅ NEW: Prop to open settings modal
  onShare // ✅ NEW: Prop to open share modal
}) => {
  // ✅ Add useAuth hook to get user
  const { user } = useAuth();
  // ✅ Add useNavigate hook for navigation
  const navigate = useNavigate();

  // Memoize expensive calculations per artwork
  const formattedDate = useMemo(() => formatDate(artwork.created_at), [artwork.created_at, formatDate]);
  const formattedPriceValue = useMemo(() => formatPrice(artwork), [artwork, formatPrice]);
  const imageUrl = useMemo(() => {
    const artworkId = artwork._id || artwork.id || artwork.token_id;
    if (!artworkId) return null;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    let url = `${cleanBaseUrl}/artwork/${artworkId}/thumbnail`;
    if (token) {
      url += `?auth=${encodeURIComponent(token)}`;
    }
    return url;
  }, [artwork._id, artwork.id, artwork.token_id, baseUrl]);
  const isOnChain = useMemo(() => ArtworkStatus.isOnChainArtwork(artwork), [artwork.is_on_chain, artwork.token_id]);
  const artworkKey = useMemo(() => {
    return artwork._id || artwork.id || `artwork-${artwork.token_id}`;
  }, [artwork._id, artwork.id, artwork.token_id]);
  const isRegistering = useMemo(() => {
    // Γ£à Identity logic: Prefer id or _id over token_id for unique identification
    const artworkId = artwork.id || artwork._id || artwork.token_id;
    return registeringArtworkId === artworkId;
  }, [registeringArtworkId, artwork.id, artwork._id, artwork.token_id]);

  // ✅ Fetch and store usage stats
  const [stats, setStats] = useState({ views: 0, downloads: 0, screenshots: 0, isLoading: true });

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const tokenId = artwork.token_id || artwork.id;
        if (!tokenId) return;

        const response = await usageAPI.getStats(tokenId);
        if (isMounted && response?.success) {
          setStats({
            views: response.stats?.total_views || 0,
            downloads: response.stats?.total_downloads || 0,
            screenshots: response.stats?.screenshot_attempts || 0,
            isLoading: false
          });
        } else if (isMounted) {
          setStats(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        if (isMounted) setStats(prev => ({ ...prev, isLoading: false }));
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, [artwork.token_id, artwork.id]);

  return (
    <div
      key={artworkKey}
      className="relative bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
    >
      <div className="bg-gray-100 h-64 flex items-center justify-center relative overflow-hidden">
        {imageUrl ? (
          <>
            {/* DB Badge - indicates image is fetched from database */}
            <div className="absolute top-2 right-12 z-20">
              <div className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center shadow-sm border border-blue-400">
                <Database className="w-3 h-3 mr-1" />
                DB
              </div>
            </div>

            {/* Responsible Use Badge (if enabled) */}
            {artwork.responsible_use_addon === true && (
              <div className="absolute top-2 left-2 z-20">
                <div className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center shadow-md border border-purple-400">
                  <Shield className="w-2.5 h-2.5 mr-1" />
                  RESPONSIBLE USE
                </div>
              </div>
            )}

            {/* ✅ NEW: Floating Addon Settings Button (Direct Access) */}
            <div className="absolute top-2 right-2 z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenAddonSettings(artwork);
                }}
                className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-purple-600 hover:bg-purple-600 hover:text-white shadow-lg transition-all transform hover:scale-110 active:scale-95 border border-purple-100"
                title="Manage Addons"
              >
                <Shield className="w-4 h-4" />
              </button>
            </div>

            {/* ✅ NEW: Share Button */}
            <div className="absolute top-2 right-12 z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onShare(artwork);
                }}
                className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-blue-600 hover:bg-blue-600 hover:text-white shadow-lg transition-all transform hover:scale-110 active:scale-95 border border-blue-100"
                title="Share Artwork"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            <OptimizedImage
              src={imageUrl}
              alt={artwork.title || `Artwork ${artwork.token_id || artwork.id}`}
              className="absolute inset-0 w-full h-full"
              priority={imagePriority}
            />
          </>
        ) : (
          <div className="text-center">
            <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No image available</p>
          </div>
        )}
      </div>

      <div className="p-6">
        {/* Title with badges on same line */}
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex-1">
            {artwork.title || `Artwork #${artwork.token_id || artwork.id}`}
          </h3>
          <div className="flex flex-col items-end gap-1 ml-2">
            <span
              className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${artwork.is_licensed
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
                }`}
            >
              {artwork.is_licensed ? "Licensed" : "Available"}
            </span>
            <span
              className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${isOnChain
                ? "bg-blue-100 text-blue-800"
                : artwork.registration_method === 'competition'
                  ? "bg-purple-100 text-purple-800"
                  : "bg-green-100 text-green-800"
                }`}
            >
              {isOnChain
                ? 'On-chain'
                : artwork.registration_method === 'competition'
                  ? 'Competition Entry'
                  : 'Off-chain'
              }
            </span>
          </div>
        </div>

        {/* Creation date */}
        <p className="text-sm text-gray-500 mb-3">
          Created: {formattedDate}
        </p>

        {/* Description with more lines visible */}
        {artwork.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-3 leading-relaxed">
            {artwork.description}
          </p>
        )}

        {/* Royalty and Price side by side */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Royalty</p>
            <p className="text-sm font-semibold text-gray-900">
              {artwork.royalty_percentage
                ? `${(artwork.royalty_percentage / 100).toFixed(2)}%`
                : 'N/A'
              }
            </p>
          </div>

          {artwork.price && (
            <div className="flex-1 text-right">
              <p className="text-xs text-gray-500 mb-1">Price</p>
              <p className="text-sm font-semibold text-gray-900">
                {formattedPriceValue}
              </p>
            </div>
          )}
        </div>

        {/* Usage Stats Breakdown */}
        <div className="flex justify-between items-center mb-5 py-3 border-t border-b border-gray-100 bg-gray-50 rounded-lg px-2">
          <div className="flex flex-col items-center flex-1" title="Total Views">
            <Eye className="w-4 h-4 text-blue-500 mb-1" />
            <span className="text-xs font-semibold text-gray-700">
              {stats.isLoading ? <Loader className="w-3 h-3 animate-spin" /> : stats.views}
            </span>
          </div>
          <div className="flex flex-col items-center flex-1 border-l border-r border-gray-200" title="Total Downloads">
            <Download className="w-4 h-4 text-green-500 mb-1" />
            <span className="text-xs font-semibold text-gray-700">
              {stats.isLoading ? <Loader className="w-3 h-3 animate-spin" /> : stats.downloads}
            </span>
          </div>
          <div className="flex flex-col items-center flex-1" title="Screenshot Attempts Blocked">
            <Camera className="w-4 h-4 text-red-500 mb-1" />
            <span className="text-xs font-semibold text-gray-700">
              {stats.isLoading ? <Loader className="w-3 h-3 animate-spin" /> : stats.screenshots}
            </span>
          </div>
        </div>

        {/* Action buttons stacked vertically */}
        <div className="flex flex-col gap-3 mb-4">
          <Link
            to={`/artwork/${artwork._id || artwork.id}`}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 w-full transition-colors"
          >
            View Details <ArrowRight className="w-4 h-4 ml-2" />
          </Link>

          {/* Register on Blockchain button for off-chain artworks */}
          {!isOnChain && (
            <button
              onClick={() => onRegisterOnChain(artwork)}
              disabled={isRegistering}
              className="inline-flex items-center justify-center px-4 py-2 border border-purple-200 text-sm font-medium rounded-md text-white bg-purple-500 hover:bg-purple-600 w-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRegistering ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  {registrationStep === 'preparing' ? 'Preparing...' : 'Confirming...'}
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2 text-white" />
                  <span className="text-white">Register on Blockchain</span>
                </>
              )}
            </button>
          )}

          {artwork.is_for_sale === true ? (
            <button
              onClick={() => onDelist(artwork)}
              className="inline-flex items-center justify-center px-4 py-2 border border-red-200 text-sm font-medium rounded-md text-white bg-red-500 hover:bg-red-600 w-full transition-colors"
            >
              <span className="text-white">Remove from Sale</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                // ✅ Check if user is onboarded for off-chain artworks
                const isOnChain = ArtworkStatus.isOnChainArtwork(artwork);
                const isCompetition = artwork.registration_method === "competition";

                if (!isOnChain && !isCompetition) {
                  // Check PayPal onboarding
                  const hasPayPal = UserIdentifier.hasPaymentMethod(user, "paypal");

                  if (!hasPayPal) {
                    toast.error("PayPal onboarding required to list artwork for sale");
                    // Optionally redirect to settings
                    navigate('/dashboard/settings');
                    return;
                  }
                }

                console.log('🔵 List for Sale clicked!', artwork);
                onListForSale(artwork);
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 w-full transition-colors"
            >
              <span className="text-white">List for Sale</span>
            </button>
          )}
        </div>

        {/* Categories at the bottom */}
        {(artwork.medium_category || artwork.style_category || artwork.subject_category) && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-1.5">
              {artwork.medium_category && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-medium">
                  {artwork.medium_category}
                </span>
              )}
              {artwork.style_category && (
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">
                  {artwork.style_category}
                </span>
              )}
              {artwork.subject_category && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                  {artwork.subject_category}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  const prevArtwork = prevProps.artwork;
  const nextArtwork = nextProps.artwork;

  // Compare key fields that affect rendering
  return (
    // Γ£à Primary uniqueness check: Database ID must match
    (prevArtwork._id === nextArtwork._id || prevArtwork.id === nextArtwork.id) &&
    prevArtwork.token_id === nextArtwork.token_id &&
    prevArtwork.title === nextArtwork.title &&
    prevArtwork.price === nextArtwork.price &&
    prevArtwork.is_for_sale === nextArtwork.is_for_sale &&
    prevArtwork.is_licensed === nextArtwork.is_licensed &&
    prevArtwork.is_on_chain === nextArtwork.is_on_chain &&
    prevArtwork.created_at === nextArtwork.created_at &&
    prevProps.registeringArtworkId === nextProps.registeringArtworkId &&
    prevProps.registrationStep === nextProps.registrationStep
  );
});
ArtworkCardItem.displayName = 'ArtworkCardItem';

const MyArtworks = () => {
  const { isAuthenticated, user } = useAuth();
  const { account, isCorrectNetwork, sendTransaction, connectWallet, switchNetwork, selectedNetwork, currentNetworkConfig, publicKey, sendSolanaTx, connection } = useWeb3();
  const [artworks, setArtworks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resaleModalOpen, setResaleModalOpen] = useState(false);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [resalePrice, setResalePrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeringArtworkId, setRegisteringArtworkId] = useState(null);
  const [registrationStep, setRegistrationStep] = useState(null);

  // NEW: Addon settings state
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [isUpdatingAddon, setIsUpdatingAddon] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [artworkToShare, setArtworkToShare] = useState(null);

  const lastFetchedUserId = useRef(null);
  const isInitialMount = useRef(true);
  const isFetchingRef = useRef(false);

  // Memoize base URL calculation
  const baseUrl = useMemo(() => {
    const url = import.meta.env.VITE_BASE_URL_BACKEND || '';
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }, []);

  // Preconnect to image server for faster connections
  useEffect(() => {
    if (baseUrl) {
      preconnectToImageServer(baseUrl);
    }
  }, [baseUrl]);

  // Memoize user identifier
  const userIdentifier = useMemo(() => {
    const identifier = UserIdentifier.getUserIdentifier(user);
    if (identifier) {
      return identifier;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userIdFromToken = payload.userId || payload.user_id || payload.sub || payload.id;
        if (userIdFromToken) {
          return String(userIdFromToken);
        }
      } catch (error) {
        // Silently fail
      }
    }

    return null;
  }, [user?.id, user?._id, user?.user_id, user?.wallet_address, user?.paypal_merchant_id]);

  // ✅ Add image protection hook
  useImageProtection(true);

  useEffect(() => {
    console.log('👤 User Identifier Check:', {
      userIdentifier,
      userId: user?.id,
      user_id: user?._id,
      wallet_address: user?.wallet_address,
      paypal_merchant_id: user?.paypal_merchant_id,
      token: localStorage.getItem('token')?.substring(0, 20) + '...'
    });
  }, [userIdentifier, user]);
  // Memoized helper functions
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'Unknown Date';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const altDate = new Date(dateString.replace(/\.\d+Z$/, 'Z'));
        if (!isNaN(altDate.getTime())) {
          return altDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
        return 'Invalid Date';
      }

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }, []);

  const formatPrice = useCallback((artwork) => {
    if (!artwork.price) return 'Not set';

    if (ArtworkStatus.isOffChainArtwork(artwork)) {
      const usdAmount = CurrencyConverter.ethToUsd(artwork.price);
      return CurrencyConverter.formatUsd(usdAmount);
    }
    return CurrencyConverter.formatCrypto(artwork.price, artwork.network || selectedNetwork);
  }, [selectedNetwork]);

  // Optimized fetch artworks function with caching
  const fetchArtworks = useCallback(async (forceRefresh = false) => {
    if (isFetchingRef.current) return;

    const cacheKey = `artworks-${userIdentifier}`;

    // Check cache first (unless forcing refresh)
    if (!forceRefresh && userIdentifier) {
      const cached = cacheService.getDashboardArtworks(cacheKey);
      if (cached) {
        setArtworks(cached);
        setIsLoading(false);
        isInitialMount.current = false;
        return;
      }
    }

    // Wait a bit if user object is not loaded yet (only on initial mount)
    if (!userIdentifier && user === null && isInitialMount.current) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryIdentifier = UserIdentifier.getUserIdentifier(user);
      if (!retryIdentifier) {
        if (isInitialMount.current) {
          setError('User identifier not found. Please refresh the page.');
          setIsLoading(false);
        }
        return;
      }
    }

    // Skip if same user ID and not forcing refresh
    if (!forceRefresh && userIdentifier === lastFetchedUserId.current && artworks.length > 0) {
      return;
    }

    if (!userIdentifier) {
      if (isInitialMount.current) {
        setError('User identifier not found. Please refresh the page.');
        setIsLoading(false);
      }
      return;
    }

    isFetchingRef.current = true;
    lastFetchedUserId.current = userIdentifier;
    setIsLoading(true);
    setError(null);

    try {
      // Γ£à Optimization: Reduce initial fetch size for faster load
      const response = await artworksAPI.getByOwner(userIdentifier, { page: 1, size: 24 });
      console.log('🔍 Full API response:', response); // Debug log
      let artworksData = response.data || response.artworks || [];

      if (response?.data && Array.isArray(response.data)) {
        artworksData = response.data;
      } else if (response?.artworks && Array.isArray(response.artworks)) {
        artworksData = response.artworks;
      } else if (Array.isArray(response)) {
        artworksData = response;
      } else if (response?.data?.artworks && Array.isArray(response.data.artworks)) {
        artworksData = response.data.artworks;
      }

      console.log('🔍 Processed artworks data:', artworksData.length, 'artworks');

      if (Array.isArray(artworksData)) {
        // Optimized: Single-pass filtering and deduplication
        const seenIds = new Set();
        const uniqueArtworks = [];

        for (const artwork of artworksData) {


          // Validate token_id exists
          if (!artwork || artwork.token_id === null || artwork.token_id === undefined) {
            continue;
          }

          // Deduplicate
          // Γ£à Identity logic: Use database ID for deduplication to prevent collisions
          const artworkId = artwork.id || artwork._id || artwork.token_id?.toString();
          if (!artworkId || seenIds.has(artworkId)) {
            continue;
          }

          seenIds.add(artworkId);
          uniqueArtworks.push(artwork);
        }
        console.log('✅ Final unique artworks:', uniqueArtworks.length);
        setArtworks(uniqueArtworks);
        cacheService.setDashboardArtworks(cacheKey, uniqueArtworks);
      } else {
        if (artworks.length === 0) {
          setArtworks([]);
        }
      }

    } catch (error) {
      console.error('Error fetching artworks:', error);
      setError(`Failed to load artworks: ${error.message}`);

      if (artworks.length === 0) {
        setArtworks([]);
        toast.error('Failed to load artworks');
      }
    } finally {
      setIsLoading(false);
      isInitialMount.current = false;
      isFetchingRef.current = false;
    }
  }, [userIdentifier, user]);

  // Fetch user artworks on mount and when user ID changes
  useEffect(() => {
    if (!isAuthenticated) {
      if (artworks.length > 0) {
        setArtworks([]);
        lastFetchedUserId.current = null;
      }
      return;
    }

    if (userIdentifier && userIdentifier !== lastFetchedUserId.current) {
      fetchArtworks(true);
      // ✅ FIXED: Add check to prevent re-fetching when already fetched
    } else if (userIdentifier && artworks.length === 0 && !isLoading && !isFetchingRef.current) {
      // Only fetch if we haven't fetched for this user yet
      if (userIdentifier !== lastFetchedUserId.current) {
        fetchArtworks(true);
      }
    } else if (!userIdentifier && isInitialMount.current) {
      const timeoutId = setTimeout(() => {
        const retryIdentifier = UserIdentifier.getUserIdentifier(user);
        if (retryIdentifier && retryIdentifier !== lastFetchedUserId.current) {
          fetchArtworks(true);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, userIdentifier, isLoading, fetchArtworks, user]);

  // NEW: Addon settings handlers
  const openAddonModal = useCallback((artwork) => {
    setSelectedArtwork(artwork);
    setAddonModalOpen(true);
  }, []);

  const openShareModal = useCallback((artwork) => {
    setArtworkToShare(artwork);
    setShareModalOpen(true);
  }, []);

  const handleUpdateAddon = async (enabled) => {
    if (!selectedArtwork) return;

    setIsUpdatingAddon(true);
    const tokenId = selectedArtwork.token_id;

    try {
      const loadingToast = toast.loading(`${enabled ? 'Enabling' : 'Disabling'} Responsible Use addon...`);

      const response = await artworksAPI.update(tokenId, {
        responsible_use_addon: enabled
      });

      toast.dismiss(loadingToast);

      if (response) {
        toast.success(`Responsible Use addon ${enabled ? 'enabled' : 'disabled'}!`);

        // Update local state to reflect change immediately
        setArtworks(prevArtworks =>
          prevArtworks.map(art =>
            // Γ£à Identity logic: Use database ID to ensure we update the CORRECT artwork
            (art.id === selectedArtwork.id || art._id === selectedArtwork._id)
              ? { ...art, responsible_use_addon: enabled }
              : art
          )
        );

        // Invalidate cache
        if (userIdentifier) {
          cacheService.invalidateAll();
        }

        setAddonModalOpen(false);
      }
    } catch (error) {
      console.error("Update addon error:", error);
      toast.error(error.response?.data?.detail || "Failed to update addon preference");
    } finally {
      setIsUpdatingAddon(false);
    }
  };

  // Memoized callback handlers
  const openResaleModal = useCallback((artwork) => {
    setSelectedArtwork(artwork);
    const formattedPrice = artwork.price ? parseFloat(artwork.price).toFixed(4) : '';
    setResalePrice(formattedPrice);
    setResaleModalOpen(true);
  }, []);

  const handleDelist = useCallback(async (artwork) => {
    if (!window.confirm("Are you sure you want to remove this artwork from the marketplace?")) {
      return;
    }

    const artworkId = artwork._id || artwork.id;

    try {
      await artworksAPI.delist(artworkId);
      toast.success("Artwork removed from sale!");

      cacheService.invalidateAll();
      await fetchArtworks(true);
    } catch (error) {
      console.error("Delist error:", error);
      const errorMessage = error.response?.data?.detail || error.message || "Failed to remove artwork from sale";
      toast.error(errorMessage);
    }
  }, [userIdentifier, fetchArtworks]);

  const handleListForSale = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedArtwork || !resalePrice || parseFloat(resalePrice) <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setIsSubmitting(true);
    const artworkId = selectedArtwork._id || selectedArtwork.id;
    const isSolana = selectedArtwork.network === 'solana';

    try {
      // ✅ STEP 1: SOLANA DELEGATION (If applicable)
      if (isSolana) {
        if (!publicKey || !connection) {
          toast.error("Please connect your Solana wallet");
          setIsSubmitting(false);
          return;
        }

        try {
          const delegateToast = toast.loading("Preparing Solana approval...");
          
          const mintPubkey = new PublicKey(selectedArtwork.token_id);
          const platformPubkey = new PublicKey("EhH8kwZFTkPv1BeSqayLYvZ4ssLSrM2aV3iAL7fY9E4G");
          
          // Get the user's Associated Token Account for this NFT
          const userAta = await getAssociatedTokenAddress(mintPubkey, publicKey);
          
          console.log("🛠️ Creating Approve Instruction:", {
            owner: publicKey.toBase58(),
            delegate: platformPubkey.toBase58(),
            ata: userAta.toBase58()
          });

          // Create the Approve instruction (gives platform authority to move 1 token)
          const approveIx = createApproveInstruction(
            userAta,
            platformPubkey,
            publicKey,
            1 // 1 NFT
          );

          const transaction = new Transaction().add(approveIx);
          const latestBlockhash = await connection.getLatestBlockhash();
          transaction.recentBlockhash = latestBlockhash.blockhash;
          transaction.feePayer = publicKey;

          toast.loading("Please sign the approval in your wallet...", { id: delegateToast });
          
          const signature = await sendSolanaTx(transaction, connection);
          
          toast.loading("Verifying approval on-chain...", { id: delegateToast });
          await connection.confirmTransaction({
            signature,
            ...latestBlockhash
          });
          
          toast.success("Platform authorized successfully!", { id: delegateToast });
        } catch (solError) {
          console.error("Solana delegation failed:", solError);
          toast.error(`Delegation failed: ${solError.message || "User rejected or network error"}`);
          setIsSubmitting(false);
          return;
        }
      }

      // ✅ STEP 2: BACKEND UPDATE
      const response = await artworksAPI.listForSale(artworkId, parseFloat(resalePrice));

      if (response && response.success) {
        toast.success("Artwork listed for sale successfully!");
        setResaleModalOpen(false);
        setResalePrice('');
        setSelectedArtwork(null);

        // Invalidate cache
        cacheService.invalidateAll();
        await fetchArtworks(true);
      } else {
        throw new Error(response?.message || "Failed to list artwork");
      }
    } catch (error) {
      console.error("Resale error:", error);
      const errorMessage = error.response?.data?.detail || error.message || "Failed to list artwork for sale";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedArtwork, resalePrice, userIdentifier, fetchArtworks, publicKey, connection, sendSolanaTx]);

  const handleRegisterOnChain = useCallback(async (artwork) => {
    if (!artwork) {
      toast.error("Invalid artwork");
      return;
    }

    const artworkId = artwork.id || artwork._id || artwork.token_id;
    if (!artworkId) {
      toast.error("Artwork ID not found");
      return;
    }

    if (ArtworkStatus.isOnChainArtwork(artwork)) {
      toast.error("This artwork is already registered on blockchain");
      return;
    }

    if (!account) {
      toast.error("Please connect your wallet first");
      const connected = await connectWallet();
      if (!connected) return;
    }

    if (!isCorrectNetwork) {
      toast.error(`Please switch to ${currentNetworkConfig.label}`);
      const switched = await switchNetwork(selectedNetwork);
      if (!switched) return;
    }

    setRegisteringArtworkId(artworkId);
    setRegistrationStep('preparing');

    try {
      const preparingToast = toast.loading("Preparing blockchain registration...");
      const preparation = await artworksAPI.registerOnChain(artworkId);
      toast.dismiss(preparingToast);

      if (!preparation.transaction_data) {
        throw new Error("Backend did not return transaction data");
      }

      setRegistrationStep('confirming');

      const txToast = toast.loading("Sending transaction...");
      const txResponse = await sendTransaction({
        ...preparation.transaction_data,
        from: account,
        gas: 500000,
      });
      toast.dismiss(txToast);

      const finalizingToast = toast.loading("Finalizing registration...");
      try {
        const confirmation = await artworksAPI.confirmOnChainRegistration(
          artworkId,
          txResponse.hash,
          selectedNetwork
        );

        if (!confirmation || !confirmation.success) {
          console.warn("Registration confirmation had issues:", confirmation);
        }

        toast.dismiss(finalizingToast);
        toast.success("Artwork successfully registered on blockchain!");

        // Invalidate cache and refresh
        if (userIdentifier) {
          artworksCache.delete(`artworks-${userIdentifier}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchArtworks(true);

      } catch (confirmError) {
        console.warn("Registration confirmation failed, but transaction was successful:", confirmError);
        toast.dismiss(finalizingToast);
        toast.error("Transaction successful but confirmation failed. Please refresh the page.");
      }

    } catch (error) {
      console.error("Blockchain registration error:", error);
      toast.dismiss();
      const errorMessage = error.response?.data?.detail || error.message || "Failed to register artwork on blockchain";
      toast.error(errorMessage);
    } finally {
      setRegisteringArtworkId(null);
      setRegistrationStep(null);
    }
  }, [account, sendTransaction, connectWallet, switchNetwork, selectedNetwork, isCorrectNetwork, userIdentifier, fetchArtworks]);

  // Debug logging (only in development, moved out of render)
  useEffect(() => {
    if (artworks.length > 0 && process.env.NODE_ENV === 'development') {
      const onChainCount = artworks.filter(a => ArtworkStatus.isOnChainArtwork(a)).length;
      const offChainCount = artworks.filter(a => ArtworkStatus.isOffChainArtwork(a)).length;
      console.log(`Artworks: ${artworks.length} total, ${onChainCount} on-chain, ${offChainCount} off-chain`);
    }
  }, [artworks.length]);

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Authentication Required
          </h2>
          <p className="text-gray-600 mb-6">
            Please log in to view your artworks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className='mb-6'>
        <h1 className="text-2xl font-bold text-gray-900">My Artworks</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your uploaded artworks
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {isLoading && isFetchingRef.current ? (
        <div className="flex justify-center p-12">
          <LoadingSpinner size="medium" />
        </div>
      ) : artworks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
          <Palette className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            You haven't registered any artworks yet
          </p>
          <Link
            to="/dashboard/upload"
            className="text-purple-600 hover:text-purple-800 font-medium"
          >
            Register your first artwork
          </Link>
        </div>
      ) : (
        <div
          className='grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
          style={{
            contentVisibility: 'auto', // Browser optimization for off-screen content
            containIntrinsicSize: '400px' // Estimated size for better rendering
          }}
        >
          {artworks.map((artwork, index) => (
            <ArtworkCardItem
              key={artwork._id || artwork.id || `artwork-${artwork.token_id}`}
              artwork={artwork}
              baseUrl={baseUrl}
              onRegisterOnChain={handleRegisterOnChain}
              onDelist={handleDelist}
              onListForSale={openResaleModal}
              registeringArtworkId={registeringArtworkId}
              registrationStep={registrationStep}
              formatDate={formatDate}
              formatPrice={formatPrice}
              imagePriority={index < 6} // Load first 6 images immediately (priority)
              onOpenAddonSettings={openAddonModal} // ✅ NEW
              onShare={openShareModal} // ✅ NEW
            />
          ))}
        </div>
      )}

      {resaleModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setResaleModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">List Artwork for Resale</h3>
              <button
                onClick={() => setResaleModalOpen(false)}
                className="hover:bg-gray-100 rounded p-1"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {selectedArtwork && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Artwork:</span> {selectedArtwork.title || `#${selectedArtwork.token_id}`}
                </p>
              </div>
            )}

            <form onSubmit={handleListForSale}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Set Price ({CurrencyConverter.getSymbol(selectedArtwork?.network)})
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 text-sm">{CurrencyConverter.getSymbol(selectedArtwork?.network)}</span>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    className="block w-full pl-14 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    value={resalePrice}
                    onChange={(e) => setResalePrice(e.target.value)}
                    placeholder="0.0000"
                    autoFocus
                  />
                </div>
                {selectedArtwork?.price && (
                  <p className="text-xs text-gray-500 mt-1">
                    Previous price: {CurrencyConverter.formatCrypto(selectedArtwork.price, selectedArtwork.network || selectedNetwork)}
                  </p>
                )}

                {/* ✅ Explanation for Solana Users */}
                {selectedArtwork?.network === 'solana' && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      <strong>Solana Secondary Sale Note:</strong> Listing this artwork requires a one-time "Approval" transaction. 
                      This gives the platform permission to transfer the NFT automatically when someone pays your price. 
                      You will remain the full owner in your wallet until the sale occurs.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setResaleModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !resalePrice || parseFloat(resalePrice) <= 0}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 inline-block mr-2 animate-spin" />
                      <span className="text-white">Listing...</span>
                    </>
                  ) : (
                    <span className="text-white">Confirm Listing</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW: Responsible Use Addon Settings Modal */}
      {addonModalOpen && (
        <div
          className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
          style={{ zIndex: 10000 }}
          onClick={() => setAddonModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-0 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with better styling */}
            <div className="bg-purple-600 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <h3 className="text-lg font-bold">Addon Settings</h3>
              </div>
              <button
                onClick={() => setAddonModalOpen(false)}
                className="hover:bg-purple-500 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">

              {selectedArtwork && (
                <div className="space-y-6">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-white shadow-sm border border-gray-100 overflow-hidden flex-shrink-0">
                      <img
                        src={`${baseUrl}/artwork/${selectedArtwork._id || selectedArtwork.id || selectedArtwork.token_id}/image`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/100?text=Art'; }}
                      />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {selectedArtwork.title || `#${selectedArtwork.token_id}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Token ID: #{selectedArtwork.token_id}
                      </p>
                    </div>
                  </div>

                  <div className={`group relative p-5 rounded-2xl border-2 transition-all duration-300 ${selectedArtwork.responsible_use_addon === true
                      ? "bg-purple-50 border-purple-200 shadow-inner"
                      : "bg-white border-gray-100 hover:border-purple-100"
                    }`}>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md ${selectedArtwork.responsible_use_addon === true ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-400"
                            }`}>
                            <Shield className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-gray-900">Responsible Use Addon</span>
                        </div>
                        {selectedArtwork.responsible_use_addon === true && (
                          <span className="bg-purple-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Active</span>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 leading-relaxed mb-6">
                        Enable specialized watermarking and responsible AI usage tracking for this piece.
                        This helps protect your rights while contributing to ethical AI development.
                      </p>

                      <div className="flex items-center gap-3">
                        {selectedArtwork.responsible_use_addon === true ? (
                          <button
                            onClick={() => handleUpdateAddon(false)}
                            disabled={isUpdatingAddon}
                            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border border-red-200 text-red-600 hover:bg-red-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                          >
                            {isUpdatingAddon ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <>Disable Addon</>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateAddon(true)}
                            disabled={isUpdatingAddon}
                            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            {isUpdatingAddon ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <><Zap className="w-4 h-4" /> Enable Addon</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl text-blue-800 border border-blue-100 italic">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p className="text-xs leading-relaxed">
                      Changes apply instantly to future purchases. This does not affect existing licenses.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setArtworkToShare(null);
        }}
        artwork={artworkToShare}
      />
    </>
  );
};

export default MyArtworks;
