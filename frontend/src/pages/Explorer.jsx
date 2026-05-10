// import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
// import { Link } from "react-router-dom";
// import { useWeb3 } from "../context/Web3Context";
// import { useAuth } from "../context/AuthContext";
// import { artworksAPI, recommendationAPI } from "../services/api";
// import {
//   Palette,
//   Search,
//   Filter,
//   ArrowRight,
//   ArrowLeft,
//   ShoppingCart,
//   FileText,
//   Sparkles,
//   History,
//   TrendingUp,
//   Wallet,
//   CreditCard,
//   Database,
//   ChevronLeft,
//   ChevronRight,
// } from "lucide-react";
// import LoadingSpinner from "../components/common/LoadingSpinner";
// import toast from "react-hot-toast";
// import { CurrencyConverter, ArtworkStatus } from "../utils/currencyUtils"; // Moved this import up
// import { useImageProtection } from "../hooks/useImageProtection";
// import ProtectedImage from "../components/common/ProtectedImage";

// import { cacheService } from "../services/cacheService";

// // ✅ OPTIMIZATION: Skeleton loader for better perceived performance
// const ArtworkSkeleton = () => (
//   <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 animate-pulse">
//     <div className="bg-gradient-to-br from-gray-200 to-gray-300 h-48"></div>
//     <div className="p-6">
//       <div className="flex justify-between items-start mb-2">
//         <div className="h-5 bg-gray-200 rounded w-2/3"></div>
//         <div className="h-5 bg-gray-200 rounded-full w-20"></div>
//       </div>
//       <div className="space-y-2 mb-4">
//         <div className="h-3 bg-gray-200 rounded w-full"></div>
//         <div className="h-3 bg-gray-200 rounded w-4/5"></div>
//       </div>
//       <div className="flex justify-between items-center mb-4">
//         <div className="h-10 bg-gray-200 rounded w-1/4"></div>
//         <div className="h-10 bg-gray-200 rounded w-1/4"></div>
//         <div className="h-10 bg-gray-200 rounded w-1/4"></div>
//       </div>
//       <div className="flex gap-2">
//         <div className="h-10 bg-gray-200 rounded flex-1"></div>
//         <div className="h-10 bg-gray-200 rounded w-16"></div>
//         <div className="h-10 bg-gray-200 rounded w-20"></div>
//       </div>
//     </div>
//   </div>
// );

// // ArtworkCard component definition - moved before Explorer component
// // ✅ OPTIMIZED: Memoized to prevent unnecessary re-renders
// const ArtworkCard = memo(({ artwork, currentAccount, isRecommended, currentUserId, selectedNetwork, isAuthenticated, user }) => {
//   // ✅ Image error state for fallback
//   const [imageError, setImageError] = useState(false);


//   const formatTimeTo12Hour = (rawTime) => {
//     if (!rawTime || typeof rawTime !== "string") return "TBD";

//     const value = rawTime.trim();
//     if (!value) return "TBD";

//     // If already in AM/PM style, normalize casing and return.
//     if (/am|pm/i.test(value)) {
//       return value.replace(/\s+/g, " ").toUpperCase();
//     }

//     // Handle HH:mm or HH:mm:ss formats.
//     const timeMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
//     if (timeMatch) {
//       const hour24 = Number(timeMatch[1]);
//       const minute = timeMatch[2];

//       if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) {
//         return value;
//       }

//       const suffix = hour24 >= 12 ? "PM" : "AM";
//       const hour12 = hour24 % 12 || 12;
//       return `${hour12}:${minute} ${suffix}`;
//     }

//     // Fallback: attempt Date parsing for datetime-like strings.
//     const parsed = new Date(value);
//     if (!Number.isNaN(parsed.getTime())) {
//       return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
//     }

//     return value;
//   };



//   // ✅ OPTIMIZED: Memoized ownership check
//   const isOwner = useMemo(() => {
//     // If not authenticated, they cannot "own" the artwork in the context of the platform UI
//     if (!isAuthenticated) return false;

//     // 1. Connection-based check (Active wallet connection)
//     const isCryptoOwner =
//       currentAccount &&
//       artwork.owner_address &&
//       currentAccount.toLowerCase() === artwork.owner_address.toLowerCase();

//     // 2. ID-based check (Direct platform ID match)
//     const isPayPalOwner =
//       currentUserId &&
//       artwork.owner_id &&
//       String(currentUserId).trim() === String(artwork.owner_id).trim();

//     // 3. Profile-based check (Saved wallet address in profile - works if wallet disconnected)
//     const isProfileWalletOwner =
//       user?.wallet_address &&
//       artwork.owner_address &&
//       user.wallet_address.toLowerCase() === artwork.owner_address.toLowerCase();

//     // 4. Email-based check (Fallback verification)
//     const isEmailOwner =
//       user?.email &&
//       artwork.owner_email &&
//       user.email.toLowerCase() === artwork.owner_email.toLowerCase();

//     return isCryptoOwner || isPayPalOwner || isProfileWalletOwner || isEmailOwner;
//   }, [currentAccount, artwork.owner_address, currentUserId, artwork.owner_id, isAuthenticated, user?.wallet_address, user?.email]);

//   // ✅ OPTIMIZED: Memoized image URL
//   const imageUrl = useMemo(() => {
//     const artworkId = artwork._id || artwork.id || artwork.token_id;
//     if (artworkId) {
//       const baseUrl = import.meta.env.VITE_BASE_URL_BACKEND || '';
//       const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
//       return `${cleanBaseUrl}/artwork/${artworkId}/image`;
//     }
//     return null;
//   }, [artwork._id, artwork.id, artwork.token_id]);

//   // ✅ OPTIMIZED: Memoized price formatting
//   const priceDisplay = useMemo(() => {
//     if (!artwork.price) return null;

//     const ethPrice = artwork.price;
//     const usdPrice = CurrencyConverter.ethToUsd(ethPrice);

//     return (
//       <div className="text-center">
//         <p className="text-xs text-gray-500">Price</p>
//         <p className="text-sm font-semibold text-gray-900">
//           {CurrencyConverter.formatCrypto(ethPrice, artwork.network)}
//         </p>
//         <p className="text-xs text-gray-400">
//           ≈ {CurrencyConverter.formatUsd(usdPrice)}
//         </p>
//       </div>
//     );
//   }, [artwork.price]);

//   // ✅ OPTIMIZED: Memoized registration badge
//   const registrationBadge = useMemo(() => {
//     const registrationMethod = ArtworkStatus.getRegistrationMethod(artwork);

//     if (registrationMethod === "on-chain") {
//       return (
//         <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
//           <Wallet className="w-3 h-3" />
//           On-chain
//         </span>
//       );
//     } else if (registrationMethod === "competition") {
//       return (
//         <span className="absolute top-2 right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
//           <Sparkles className="w-3 h-3" />
//           Competition Entry
//         </span>
//       );
//     } else {
//       return (
//         <span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
//           <CreditCard className="w-3 h-3" />
//           Off-chain
//         </span>
//       );
//     }
//   }, [artwork]);

//   return (
//     <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-xl transition-all relative">
//       {/* Recommended Badge - positioned on left to avoid overlap */}
//       {isRecommended && (
//         <div className="absolute top-2 left-2 z-30">
//           <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center shadow-lg border-2 border-white">
//             <Sparkles className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
//             FOR YOU
//           </div>
//         </div>
//       )}

//       <div
//         className="bg-gray-100 h-48 flex items-center justify-center relative overflow-hidden image-container"
//         style={{
//           userSelect: 'none',
//           WebkitUserSelect: 'none',
//           MozUserSelect: 'none',
//           msUserSelect: 'none',
//           WebkitTouchCallout: 'none'
//         }}
//       >
//         {imageUrl ? (
//           <>
//             {/* Registration Badge - top right */}
//             {registrationBadge}
//             {/* DB Badge - below registration badge */}
//             <div className="absolute top-10 right-2 z-20">
//               <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-md">
//                 <Database className="w-3 h-3 mr-1" />
//                 DB
//               </div>
//             </div>



//             {/* Protected Canvas Image */}
//             <ProtectedImage
//               imageUrl={imageUrl}
//               alt={artwork.title || `Artwork ${artwork.token_id}`}
//               className="w-full h-full"
//               aspectRatio="auto"
//               showToast={false}
//               onError={() => {
//                 setImageError(true);
//               }}
//             />

//             {/* Error placeholder */}
//             {imageError && (
//               <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
//                 <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
//                 <p className="text-sm text-gray-500">Image unavailable</p>
//               </div>
//             )}
//           </>
//         ) : (
//           <div className="text-center">
//             <Palette className="w-16 h-16 text-gray-400 mx-auto mb-2" />
//             <p className="text-sm text-gray-500">Artwork #{artwork.token_id}</p>
//             <p className="text-xs text-gray-400">{artwork.title}</p>
//           </div>
//         )}
//       </div>
//       <div className="p-6">
//         <div className="flex justify-between items-start mb-2">
//           <h3 className="text-lg font-semibold text-gray-900">
//             {artwork.title || `Artwork #${artwork.token_id}`}
//           </h3>
//           <span
//             className={`px-2 py-1 text-xs rounded-full ${artwork.is_licensed
//                 ? "bg-green-100 text-green-800"
//                 : "bg-gray-100 text-gray-800"
//               }`}
//           >
//             {artwork.is_licensed ? "Licensed" : "Available"}
//           </span>
//         </div>
//         <p className="text-sm text-gray-500 mb-4 line-clamp-2">
//           {artwork.description || "No description available"}
//         </p>



//         {/* Creator, Price, and Royalty in one line */}
//         <div className="flex justify-between items-center mb-4">
//           <div className="text-center flex-1">
//             <p className="text-xs text-gray-500">Creator</p>
//             <p className={`text-sm ${artwork.registration_method === 'competition' && artwork.creator_name ? "font-medium" : "font-mono"}`}>
//               {artwork.registration_method === 'competition' && artwork.creator_name
//                 ? artwork.creator_name
//                 : (artwork.creator_address
//                   ? `${artwork.creator_address.substring(0, 6)}...${artwork.creator_address.substring(38)}`
//                   : artwork.creator_id || "N/A")}
//             </p>
//           </div>

//           {/* Price in the middle */}
//           {artwork.price && (
//             <div className="text-center flex-1 mx-6">
//               {priceDisplay}
//             </div>
//           )}

//           <div className="text-center flex-1">
//             <p className="text-xs text-gray-500">Royalty</p>
//             <p className="text-sm font-semibold">
//               {artwork.royalty_percentage
//                 ? `${(artwork.royalty_percentage / 100).toFixed(2)}%`
//                 : "N/A"}
//             </p>
//           </div>

//         </div>

//         {/* Action Buttons */}
//         <div className="flex gap-2">
//           <Link
//             to={`/artwork/${artwork._id || artwork.id || artwork.token_id}`}
//             className="flex-1 inline-flex items-center justify-center text-sm font-medium text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-3 py-2 hover:bg-purple-50 transition-colors"
//           >
//             View details <ArrowRight className="w-4 h-4 ml-1" />
//           </Link>

//           {isOwner ? (
//             <div className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-lg">
//               This is your artwork
//             </div>
//           ) : (
//             <>
//               <Link
//                 to={`/sale/${artwork._id || artwork.id || artwork.token_id}`}
//                 className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
//                 title="Purchase this artwork"
//               >
//                 <ShoppingCart className="w-4 h-4 mr-1" />
//                 Buy
//               </Link>

//               <Link
//                 to={`/license/${artwork._id || artwork.id || artwork.token_id}`}
//                 className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
//                 title="Purchase a license for this artwork"
//               >
//                 <FileText className="w-4 h-4 mr-1" />
//                 License
//               </Link>
//             </>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }, (prevProps, nextProps) => {
//   // ✅ Custom comparison function for better memoization
//   return (
//     prevProps.artwork._id === nextProps.artwork._id &&
//     prevProps.artwork.is_for_sale === nextProps.artwork.is_for_sale &&
//     prevProps.currentAccount === nextProps.currentAccount &&
//     prevProps.currentUserId === nextProps.currentUserId &&
//     prevProps.isRecommended === nextProps.isRecommended
//   );
// });

// ArtworkCard.displayName = 'ArtworkCard';

// const normalizeNetworkKey = (network) => {
//   const net = String(network || "").toLowerCase().trim();

//   if (!net) return "";
//   if (["algorand", "algo"].includes(net)) return "algorand";
//   if (["wirefluid", "wire", "wire-fluid"].includes(net)) return "wirefluid";
//   if (["sepolia", "ethereum", "eth", "mainnet"].includes(net)) return "sepolia";

//   return net;
// };

// const shouldShowArtworkForSelectedNetwork = (artwork, selectedNetworkKey) => {
//   if (!artwork) return false;

//   // Off-chain artworks should always be visible regardless of selected network.
//   if (!ArtworkStatus.isOnChainArtwork(artwork)) {
//     return true;
//   }

//   if (!selectedNetworkKey) {
//     return true;
//   }

//   // Legacy on-chain records without explicit network are treated as Sepolia.
//   const artworkNetwork = normalizeNetworkKey(
//     artwork.network || artwork.blockchain_network || artwork.chain || "sepolia"
//   );

//   return artworkNetwork === selectedNetworkKey;
// };

// // Main Explorer component
// const Explorer = () => {
//   // ✅ OPTIMIZATION: Feature flags for easy enable/disable
//   const ENABLE_PROGRESSIVE_LOADING = true; // Fast first page load
//   const ENABLE_CACHING = true; // LocalStorage caching
//   const ENABLE_SKELETON_UI = true; // Skeleton loaders
//   const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
//   const CACHE_KEY_PREFIX = 'explorer_cache_'; // ✅ MATCHES cacheService.js prefix

//   const { account, isCorrectNetwork, selectedNetwork } = useWeb3();
//   const { isAuthenticated, user } = useAuth();

//   // ✅ Add image protection hook
//   useImageProtection(true);
//   const [isLoading, setIsLoading] = useState(true);
//   const [isSearching, setIsSearching] = useState(false);
//   const [refreshTrigger, setRefreshTrigger] = useState(0); // ✅ NEW: Force re-fetch on cache invalidation

//   // ✅ NEW: Listen for global cache invalidation
//   useEffect(() => {
//     const handleInvalidation = () => {
//       console.log('🔔 Explorer notified of cache invalidation - Triggering re-fetch');
//       setRefreshTrigger(prev => prev + 1); // Increment to trigger re-fetch
//     };

//     window.addEventListener('artwork-cache-invalidated', handleInvalidation);
//     return () => window.removeEventListener('artwork-cache-invalidated', handleInvalidation);
//   }, []);

//   // All artworks data
//   const [allArtworks, setAllArtworks] = useState([]); // ✅ Store ALL artworks for proper reordering
//   const [recommendedArtworks, setRecommendedArtworks] = useState([]);

//   // Display data (reordered: recommended first + remaining artworks)
//   const [displayedArtworks, setDisplayedArtworks] = useState([]);

//   const [searchTerm, setSearchTerm] = useState("");
//   const [filters, setFilters] = useState({
//     licensed: "all",
//     royalty: "all",
//   });
//   const [viewMode, setViewMode] = useState("unified"); // "unified" or "search"
//   const [hasRecommendations, setHasRecommendations] = useState(false);
//   const [retryCount, setRetryCount] = useState(0);
//   const [recommendationAttempts, setRecommendationAttempts] = useState(0);


//   // ✅ Registration method filter state (on-chain/off-chain/competition)
//   const [activeRegistrationFilter, setActiveRegistrationFilter] = useState("all"); // "all", "on-chain", "off-chain", "competition"
//   const [artworkCounts, setArtworkCounts] = useState({ total: 0, crypto: 0, paypal: 0, competition: 0 });
//   const [networkScopedTabCounts, setNetworkScopedTabCounts] = useState({
//     all: null,
//     onChain: null,
//     offChain: null,
//     competition: null,
//   });



//   const selectedNetworkKey = useMemo(
//     () => normalizeNetworkKey(selectedNetwork || "sepolia"),
//     [selectedNetwork]
//   );

//   // ✅ OPTIMIZED: Pagination state for progressive loading
//   const [currentPage, setCurrentPage] = useState(1);
//   const [hasMore, setHasMore] = useState(true);
//   const [isLoadingMore, setIsLoadingMore] = useState(false);
//   const [totalPages, setTotalPages] = useState(1);
//   const itemsPerPage = 10;
//   const currentPageRef = useRef(1);
//   const allArtworksRef = useRef([]);
//   const recommendedArtworksRef = useRef([]);

//   // ✅ Ref to track if initial load has completed (prevent filter useEffect from running on mount)
//   const isInitialMount = useRef(true);

//   // ✅ FIXED: Helper function to update page and keep ref in sync
//   const updatePage = useCallback((newPage) => {
//     setCurrentPage(newPage);
//     currentPageRef.current = newPage;
//   }, []);

//   const setAllArtworksWithRef = (artworks) => {
//     allArtworksRef.current = artworks;
//     setAllArtworks(artworks);
//   };

//   const setRecommendedArtworksWithRef = (artworks) => {
//     recommendedArtworksRef.current = artworks;
//     setRecommendedArtworks(artworks);
//   };

//   // ✅ OPTIMIZATION: Caching helper functions
//   const getCacheKey = useCallback((filter) => {
//     return `${CACHE_KEY_PREFIX}${filter}_${selectedNetworkKey || 'sepolia'}_${user?.id || 'guest'}`;
//   }, [CACHE_KEY_PREFIX, selectedNetworkKey, user?.id]);

//   const getCachedData = useCallback((filter) => {
//     if (!ENABLE_CACHING) return null;

//     try {
//       const cacheKey = getCacheKey(filter);
//       const cached = localStorage.getItem(cacheKey);
//       if (!cached) return null;

//       const { data, timestamp } = JSON.parse(cached);
//       const age = Date.now() - timestamp;

//       if (age < CACHE_DURATION) {
//         console.log(`✅ Cache hit: ${cacheKey} (${Math.round(age / 1000)}s old)`);
//         return data;
//       } else {
//         console.log(`🗑️ Cache expired: ${cacheKey}`);
//         localStorage.removeItem(cacheKey);
//         return null;
//       }
//     } catch (error) {
//       console.error('❌ Cache read error:', error);
//       return null;
//     }
//   }, [ENABLE_CACHING, getCacheKey, CACHE_DURATION]);

//   const setCachedData = useCallback((filter, data) => {
//     if (!ENABLE_CACHING || !data || data.length === 0) return;

//     try {
//       const cacheKey = getCacheKey(filter);
//       const cacheData = {
//         data,
//         timestamp: Date.now(),
//         version: '1.0'
//       };
//       localStorage.setItem(cacheKey, JSON.stringify(cacheData));
//       console.log(`💾 Cached ${data.length} artworks: ${cacheKey}`);
//     } catch (error) {
//       console.error('❌ Cache write error:', error);
//       // Clear old cache if quota exceeded
//       if (error.name === 'QuotaExceededError') {
//         console.log('🗑️ Clearing old cache due to quota...');
//         Object.keys(localStorage)
//           .filter(key => key.startsWith(CACHE_KEY_PREFIX))
//           .forEach(key => localStorage.removeItem(key));
//       }
//     }
//   }, [ENABLE_CACHING, getCacheKey, CACHE_KEY_PREFIX]);

//   const clearCache = useCallback(() => {
//     try {
//       Object.keys(localStorage)
//         .filter(key => key.startsWith(CACHE_KEY_PREFIX))
//         .forEach(key => localStorage.removeItem(key));
//       console.log('🗑️ Cache cleared');
//     } catch (error) {
//       console.error('❌ Cache clear error:', error);
//     }
//   }, [CACHE_KEY_PREFIX]);

//   // ✅ OPTIMIZATION: Request deduplication - track in-flight requests
//   const inFlightRequests = useRef(new Map());
//   const abortControllers = useRef(new Map());

//   // ✅ OPTIMIZATION: Create AbortController for request cancellation
//   const createAbortController = (key) => {
//     // Cancel previous request with same key
//     const prevController = abortControllers.current.get(key);
//     if (prevController) {
//       prevController.abort();
//     }

//     const controller = new AbortController();
//     abortControllers.current.set(key, controller);
//     return controller;
//   };

//   // ✅ OPTIMIZED: Memoized user ID to prevent unnecessary recalculations
//   const effectiveUserId = useMemo(() => {
//     // Priority 1: Direct user ID from auth context
//     if (user?.id) {
//       return user.id;
//     }

//     // Priority 2: Check for user ID in different properties
//     if (user?._id) {
//       return user._id;
//     }

//     // Priority 3: Extract from JWT token if available
//     const token = localStorage.getItem('token') || sessionStorage.getItem('token');
//     if (token) {
//       try {
//         const payload = JSON.parse(atob(token.split('.')[1]));
//         const userIdFromToken = payload.userId || payload.user_id || payload.sub || payload.id;
//         if (userIdFromToken) {
//           return userIdFromToken;
//         }
//       } catch (error) {
//         console.error('Error decoding token:', error);
//       }
//     }

//     // Priority 4: Use wallet address as fallback (if your backend supports it)
//     if (account) {
//       return account.toLowerCase();
//     }

//     return null;
//   }, [user?.id, user?._id, account]);

//   // ✅ OPTIMIZED: Memoized recommended artwork IDs Set for O(1) lookup
//   const recommendedIdsSet = useMemo(() => {
//     const ids = new Set();
//     recommendedArtworks.forEach(art => {
//       const id = art._id || art.id;
//       if (id) ids.add(id.toString());
//     });
//     return ids;
//   }, [recommendedArtworks]);

//   // ✅ Keep counters accurate for the currently active registration filter
//   const activeFilterTotalCount = useMemo(() => {
//     const totalFromState = Array.isArray(allArtworks) ? allArtworks.length : 0;
//     const onChainFromCounts = Number(artworkCounts.on_chain || artworkCounts.crypto || 0);
//     const offChainFromCounts = Number(artworkCounts.off_chain || artworkCounts.paypal || 0);
//     const competitionFromCounts = Number(artworkCounts.competition || 0);
//     const allFromScoped = networkScopedTabCounts.all;
//     const normalizedTotalFromCounts = Math.max(
//       Number(artworkCounts.total || 0),
//       onChainFromCounts + offChainFromCounts + competitionFromCounts
//     );

//     if (activeRegistrationFilter === "on-chain") {
//       return totalFromState || artworkCounts.on_chain || artworkCounts.crypto || 0;
//     }

//     if (activeRegistrationFilter === "off-chain") {
//       return totalFromState || artworkCounts.off_chain || artworkCounts.paypal || 0;
//     }

//     if (activeRegistrationFilter === "competition") {
//       return totalFromState || artworkCounts.competition || 0;
//     }

//     if (allFromScoped != null) {
//       return allFromScoped;
//     }

//     return totalFromState || normalizedTotalFromCounts || 0;
//   }, [
//     activeRegistrationFilter,
//     allArtworks.length,
//     networkScopedTabCounts.all,
//     artworkCounts.on_chain,
//     artworkCounts.crypto,
//     artworkCounts.off_chain,
//     artworkCounts.paypal,
//     artworkCounts.competition,
//     artworkCounts.total,
//   ]);

//   const tabCounts = useMemo(() => {
//     const fallbackOnChain = Number(artworkCounts.on_chain || artworkCounts.crypto || 0);
//     const fallbackOffChain = Number(artworkCounts.off_chain || artworkCounts.paypal || 0);
//     const fallbackCompetition = Number(artworkCounts.competition || 0);

//     const baseOnChain = networkScopedTabCounts.onChain ?? fallbackOnChain;
//     const baseOffChain = networkScopedTabCounts.offChain ?? fallbackOffChain;
//     const baseCompetition = networkScopedTabCounts.competition ?? fallbackCompetition;
//     const baseTotal = networkScopedTabCounts.all ?? (baseOnChain + baseOffChain + baseCompetition);

//     const onChain = activeRegistrationFilter === "on-chain" ? activeFilterTotalCount : baseOnChain;
//     const offChain = activeRegistrationFilter === "off-chain" ? activeFilterTotalCount : baseOffChain;
//     const competition = activeRegistrationFilter === "competition" ? activeFilterTotalCount : baseCompetition;
//     const total = activeRegistrationFilter === "all"
//       ? activeFilterTotalCount
//       : (networkScopedTabCounts.all ?? (onChain + offChain + competition));

//     return {
//       all: total,
//       onChain,
//       offChain,
//       competition,
//     };
//   }, [
//     networkScopedTabCounts.all,
//     networkScopedTabCounts.onChain,
//     networkScopedTabCounts.offChain,
//     networkScopedTabCounts.competition,
//     artworkCounts.on_chain,
//     artworkCounts.crypto,
//     artworkCounts.off_chain,
//     artworkCounts.paypal,
//     artworkCounts.competition,
//     artworkCounts.total,
//     activeRegistrationFilter,
//     activeFilterTotalCount,
//   ]);

//   const activeFilterLabel = useMemo(() => {
//     if (activeRegistrationFilter === "all") return `all artworks`;
//     if (activeRegistrationFilter === "on-chain") return "on-chain";
//     if (activeRegistrationFilter === "off-chain") return "off-chain";
//     if (activeRegistrationFilter === "competition") return "competition";
//     return activeRegistrationFilter;
//   }, [activeRegistrationFilter]);

//   // Fetch all artworks
//   // ✅ Fetch artwork counts - FIXED: Wrapped in useCallback
//   const fetchArtworkCounts = useCallback(async () => {
//     try {
//       console.log("🔄 Fetching artwork counts...");
//       const counts = await artworksAPI.getCounts();
//       console.log("✅ Artwork counts received:", counts);
//       setArtworkCounts(counts);
//       return counts;
//     } catch (error) {
//       console.error("❌ Error fetching artwork counts:", error);
//       toast.error("Failed to load artwork counts");
//       return { total: 0, on_chain: 0, off_chain: 0, crypto: 0, paypal: 0, competition: 0 };
//     }
//   }, []);

//   // ✅ SIMPLE: Fetch ALL artworks
//   const fetchAllArtworksComplete = useCallback(async () => {
//     try {
//       const counts = await fetchArtworkCounts();
//       const total = counts.total || 0;
//       if (total === 0) return [];

//       // Fetch all pages
//       const pageSize = 100;
//       const totalPages = Math.ceil(total / pageSize);
//       const fetchPromises = [];

//       for (let page = 1; page <= totalPages; page++) {
//         const params = { page, size: pageSize };
//         if (activeRegistrationFilter === "on-chain") params.is_on_chain = true;
//         else if (activeRegistrationFilter === "off-chain") params.is_on_chain = false;
//         else if (activeRegistrationFilter === "competition") params.registration_method = "competition";
//         fetchPromises.push(artworksAPI.getAll(params));
//       }

//       const responses = await Promise.all(fetchPromises);
//       let allArtworks = [];

//       responses.forEach(response => {
//         const artworks = response?.data || response?.artworks || response?.results || (Array.isArray(response) ? response : []);
//         allArtworks = [...allArtworks, ...artworks];
//       });

//       // Filter for sale and remove duplicates
//       const seenIds = new Set();
//       const filteredArtworks = allArtworks.filter(art => {
//         if (!art || art.is_for_sale === false) return false;
//         if (!shouldShowArtworkForSelectedNetwork(art, selectedNetworkKey)) return false;
//         const id = (art._id || art.id)?.toString();
//         if (!id || seenIds.has(id)) return false;
//         seenIds.add(id);
//         return true;
//       });

//       // Keep tab badges network-scoped and coherent for the selected network.
//       setNetworkScopedTabCounts(prev => {
//         const next = { ...prev };

//         if (activeRegistrationFilter === "all") {
//           next.all = filteredArtworks.length;
//           next.onChain = filteredArtworks.filter(art => ArtworkStatus.isOnChainArtwork(art)).length;
//           next.offChain = filteredArtworks.filter(art => ArtworkStatus.isOffChainArtwork(art)).length;
//           next.competition = filteredArtworks.filter(art => ArtworkStatus.getRegistrationMethod(art) === "competition").length;
//         } else if (activeRegistrationFilter === "on-chain") {
//           next.onChain = filteredArtworks.length;
//         } else if (activeRegistrationFilter === "off-chain") {
//           next.offChain = filteredArtworks.length;
//         } else if (activeRegistrationFilter === "competition") {
//           next.competition = filteredArtworks.length;
//         }

//         if (next.all == null && next.onChain != null && next.offChain != null && next.competition != null) {
//           next.all = next.onChain + next.offChain + next.competition;
//         }

//         return next;
//       });

//       return filteredArtworks;
//     } catch (error) {
//       console.error("❌ Error fetching all artworks:", error);
//       return [];
//     }
//   }, [activeRegistrationFilter, fetchArtworkCounts, selectedNetworkKey]);

//   // ✅ OPTIMIZED: useCallback to prevent function recreation with request deduplication
//   const fetchAllArtworks = useCallback(async (page = 1, append = false) => {
//     // ✅ OPTIMIZATION: Request deduplication - prevent duplicate requests
//     const requestKey = `artworks-${page}-${activeRegistrationFilter}-${selectedNetworkKey || 'sepolia'}`;

//     // Check if request is already in flight
//     if (inFlightRequests.current.has(requestKey)) {
//       console.log(`⏭️ Skipping duplicate request: ${requestKey}`);
//       return inFlightRequests.current.get(requestKey);
//     }

//     // Create abort controller for this request
//     const abortController = createAbortController(requestKey);

//     try {
//       // ✅ OPTIMIZED: Reduced initial page size for faster loading
//       const params = { page, size: 10 }; // Reduced to 10 for faster initial load
//       if (activeRegistrationFilter === "on-chain") {
//         params.is_on_chain = true;
//       } else if (activeRegistrationFilter === "off-chain") {
//         params.is_on_chain = false;
//       } else if (activeRegistrationFilter === "competition") {
//         params.registration_method = "competition";
//       }

//       // Create request promise
//       const requestPromise = artworksAPI.getAll(params);
//       inFlightRequests.current.set(requestKey, requestPromise);

//       const response = await requestPromise;

//       // Remove from in-flight after completion
//       inFlightRequests.current.delete(requestKey);

//       // ✅ Handle multiple response formats - simplified
//       let artworks = [];
//       if (Array.isArray(response)) {
//         artworks = response;
//       } else if (response?.data) {
//         artworks = Array.isArray(response.data) ? response.data : [];
//       } else if (response?.artworks) {
//         artworks = Array.isArray(response.artworks) ? response.artworks : [];
//       } else if (response?.results) {
//         artworks = Array.isArray(response.results) ? response.results : [];
//       }

//       // ✅ Update pagination state
//       if (response?.has_next !== undefined) {
//         setHasMore(response.has_next);
//       } else {
//         setHasMore(artworks.length === params.size);
//       }

//       // ✅ Calculate total pages based on total count
//       if (response?.total !== undefined) {
//         const calculatedPages = Math.ceil(response.total / itemsPerPage);
//         setTotalPages(calculatedPages);
//       } else if (response?.count !== undefined) {
//         const calculatedPages = Math.ceil(response.count / itemsPerPage);
//         setTotalPages(calculatedPages);
//       } else if (artworkCounts.total > 0) {
//         const calculatedPages = Math.ceil(artworkCounts.total / itemsPerPage);
//         setTotalPages(calculatedPages);
//       }

//       // ✅ Filter out artworks that are not for sale (is_for_sale = false)
//       // Backend should already filter, but add frontend filter as safety check
//       const artworksForSale = artworks.filter(artwork => {
//         return artwork && artwork.is_for_sale !== false && shouldShowArtworkForSelectedNetwork(artwork, selectedNetworkKey);
//       });

//       if (append) {
//         setAllArtworks(prev => {
//           // ✅ Prevent duplicates when appending
//           const existingIds = new Set(prev.map(a => (a._id || a.id)?.toString()));
//           const newArtworks = artworksForSale.filter(a => {
//             const id = (a._id || a.id)?.toString();
//             return id && !existingIds.has(id);
//           });
//           const updated = [...prev, ...newArtworks];
//           allArtworksRef.current = updated;
//           return updated;
//         });
//       } else {
//         setAllArtworksWithRef(artworksForSale);
//       }

//       return artworksForSale;
//     } catch (error) {
//       // Remove from in-flight on error
//       inFlightRequests.current.delete(requestKey);

//       // Don't show error if request was aborted (cancelled)
//       if (error.name === 'AbortError' || abortController.signal.aborted) {
//         console.log(`🚫 Request cancelled: ${requestKey}`);
//         return [];
//       }

//       // Only show error toast if it's not a network error or if it's a real API error
//       if (error.response?.status !== 401) {
//         toast.error("Failed to load artworks. Please try refreshing the page.");
//       }

//       // Return empty array to prevent crashes
//       if (!append) {
//         setAllArtworks([]);
//       }
//       setHasMore(false);
//       return [];
//     }
//   }, [activeRegistrationFilter, selectedNetworkKey]);

//   // ✅ OPTIMIZED: useCallback for recommendations
//   const fetchRecommendations = useCallback(async (userId = null) => {
//     const targetUserId = userId || effectiveUserId;

//     if (!targetUserId) {
//       console.log('⚠️ No user ID available - skipping recommendations');
//       setRecommendedArtworksWithRef([]);
//       setHasRecommendations(false);
//       return [];
//     }

//     // ✅ FIXED: Prevent duplicate recommendation requests
//     const requestKey = `recommendations-${targetUserId}-${activeRegistrationFilter}-${selectedNetworkKey || 'sepolia'}`;

//     // Check if request is already in flight
//     if (inFlightRequests.current.has(requestKey)) {
//       console.log(`⏭️ Skipping duplicate recommendation request: ${requestKey}`);
//       return inFlightRequests.current.get(requestKey);
//     }

//     console.log(`🎯 Fetching recommendations for user: ${targetUserId} (registration filter: ${activeRegistrationFilter})`);

//     // Create and track the request promise
//     const requestPromise = (async () => {
//       try {
//         // ✅ Convert registration_method filter to backend API parameter
//         // Note: Backend API still uses "payment_method" parameter name for backward compatibility,
//         // but it actually filters by registration_method (on-chain/off-chain)
//         let registrationFilterParam = null;
//         if (activeRegistrationFilter === "on-chain") {
//           registrationFilterParam = "crypto"; // Maps to on-chain artworks
//         } else if (activeRegistrationFilter === "off-chain") {
//           registrationFilterParam = "paypal"; // Maps to off-chain artworks
//         }

//         const response = await recommendationAPI.getRecommendations(targetUserId, 10, registrationFilterParam);
//         console.log('📦 Recommendations response:', response);

//         // Handle different response formats
//         let allRecommended = [];

//         if (response?.recommendations) {
//           // New format with categorized recommendations
//           allRecommended = [
//             ...(response.recommendations.recommended_for_you || []),
//             ...(response.recommendations.search_based || []),
//             ...(response.recommendations.purchase_based || []),
//             ...(response.recommendations.upload_based || []),
//             ...(response.recommendations.view_based || [])
//           ];
//         } else if (response?.results) {
//           // Legacy format
//           allRecommended = Array.isArray(response.results) ? response.results : [];
//         } else if (Array.isArray(response)) {
//           // Direct array response
//           allRecommended = response;
//         }

//         console.log(`📊 Combined recommendations: ${allRecommended.length} artworks`);

//         // ✅ STEP 1: Remove duplicates FIRST (before filtering by is_for_sale)
//         // This prevents the same artwork from being counted multiple times
//         const seenIds = new Set();
//         const deduplicatedRecommended = [];
//         const duplicates = [];

//         allRecommended.forEach((artwork, index) => {
//           if (!artwork) {
//             console.warn(`⚠️ Recommendation ${index} is null/undefined`);
//             return;
//           }

//           // Must have an ID to deduplicate
//           const artId = (artwork._id || artwork.id || artwork.token_id)?.toString();
//           if (!artId) {
//             console.warn(`⚠️ Recommendation ${index} missing ID:`, {
//               artwork,
//               title: artwork.title,
//               _id: artwork._id,
//               id: artwork.id,
//               token_id: artwork.token_id
//             });
//             return;
//           }

//           if (seenIds.has(artId)) {
//             duplicates.push({
//               index,
//               id: artId,
//               title: artwork.title
//             });
//             console.log(`🔄 Duplicate recommendation found (removed):`, {
//               id: artId,
//               title: artwork.title,
//               index
//             });
//           } else {
//             seenIds.add(artId);
//             deduplicatedRecommended.push(artwork);
//           }
//         });

//         if (duplicates.length > 0) {
//           console.log(`🔄 Removed ${duplicates.length} duplicate recommendations:`, duplicates);
//         }
//         console.log(`✅ After deduplication: ${deduplicatedRecommended.length} unique artworks`);

//         // ✅ STEP 2: Filter out invalid artworks and ensure they're for sale
//         const validRecommended = deduplicatedRecommended.filter((artwork, index) => {
//           // Must be for sale
//           if (artwork.is_for_sale === false) {
//             console.warn(`🚫 Filtered out recommendation not for sale:`, {
//               id: artwork._id || artwork.id || artwork.token_id,
//               title: artwork.title,
//               is_for_sale: artwork.is_for_sale
//             });
//             return false;
//           }

//           if (!shouldShowArtworkForSelectedNetwork(artwork, selectedNetworkKey)) {
//             console.warn(`🚫 Filtered out on-chain recommendation for different network:`, {
//               id: artwork._id || artwork.id || artwork.token_id,
//               title: artwork.title,
//               artwork_network: artwork.network,
//               selected_network: selectedNetworkKey,
//             });
//             return false;
//           }

//           return true;
//         });

//         console.log(`✅ After validation (is_for_sale check): ${validRecommended.length} valid recommendations`);

//         console.log(`✅ Final unique valid recommendations: ${validRecommended.length} artworks`);
//         if (validRecommended.length > 0) {
//           console.log('🆔 Recommended artwork IDs:', validRecommended.map(a => ({
//             _id: a._id,
//             id: a.id,
//             token_id: a.token_id,
//             title: a.title,
//             is_for_sale: a.is_for_sale
//           })));
//         }

//         // Log the difference
//         if (allRecommended.length !== validRecommended.length) {
//           const filteredCount = allRecommended.length - validRecommended.length;
//           console.log(`📊 Recommendation filtering summary: ${allRecommended.length} total → ${deduplicatedRecommended.length} after deduplication → ${validRecommended.length} after validation`);
//           console.log(`   Removed: ${duplicates.length} duplicates + ${filteredCount - duplicates.length} not for sale = ${filteredCount} total filtered`);
//         }

//         // ✅ Debug: Log artwork status for recommendations
//         if (validRecommended.length > 0) {
//           const onChainCount = validRecommended.filter(art => ArtworkStatus.isOnChainArtwork(art)).length;
//           const offChainCount = validRecommended.filter(art => ArtworkStatus.isOffChainArtwork(art)).length;

//           if (activeRegistrationFilter === "all") {
//             console.log(`🔍 Recommendations breakdown (all filter): ${onChainCount} on-chain, ${offChainCount} off-chain artworks`);
//           } else {
//             console.log(`🔍 Checking ${validRecommended.length} recommendations for registration filter: ${activeRegistrationFilter}`);
//             console.log(`   Breakdown: ${onChainCount} on-chain, ${offChainCount} off-chain`);
//           }
//         }

//         setRecommendedArtworksWithRef(validRecommended);
//         setHasRecommendations(validRecommended.length > 0);
//         return validRecommended;
//       } catch (error) {
//         console.error("❌ Failed to fetch recommendations:", error);
//         console.error("Recommendation error details:", {
//           message: error.message,
//           response: error.response?.data,
//           status: error.response?.status
//         });

//         // If it's a 404 or user not found, don't retry - this is normal for new users
//         if (error.response?.status === 404) {
//           console.log('👤 User not found in recommendation system - this is normal for new users');
//           // Don't show toast for 404 - it's expected for new users
//         } else if (error.response?.status !== 401) {
//           // Only log warning, don't show error toast - recommendations are not critical
//           console.warn('⚠️ Recommendations unavailable, continuing without them');
//         }

//         setRecommendedArtworksWithRef([]);
//         setHasRecommendations(false);
//         return [];
//       }
//     })();

//     // Track the in-flight request
//     inFlightRequests.current.set(requestKey, requestPromise);

//     try {
//       const result = await requestPromise;
//       return result;
//     } finally {
//       // Clean up in-flight request
//       inFlightRequests.current.delete(requestKey);
//     }
//   }, [effectiveUserId, activeRegistrationFilter, selectedNetworkKey]);

//   // ✅ FIXED: Reorder - recommendations first on page 1 (max 10), remaining recommended on page 2, then regular artworks
//   const reorderArtworks = useCallback((recommended, all, page = 1, maxItems = 10) => {
//     const recommendedIds = new Set(recommended.map(art => (art._id || art.id)?.toString()).filter(Boolean));

//     const recommendedList = [];
//     const otherList = [];

//     all.forEach(art => {
//       const id = (art._id || art.id)?.toString();
//       if (id && recommendedIds.has(id)) {
//         recommendedList.push(art);
//       } else {
//         otherList.push(art);
//       }
//     });

//     console.log(`📊 Reordering for page ${page}: ${recommendedList.length} recommended, ${otherList.length} regular, maxItems: ${maxItems}`);

//     // ✅ FIXED: Page 1 - Show max 10 recommended artworks, then fill remaining slots with regular artworks
//     if (page === 1) {
//       // Limit recommended artworks to maxItems (10)
//       const recommendedToShow = recommendedList.slice(0, maxItems);
//       const recommendedRemaining = recommendedList.length - recommendedToShow.length;

//       // Calculate remaining slots for regular artworks
//       const remainingSlots = maxItems - recommendedToShow.length;
//       const regularToShow = otherList.slice(0, remainingSlots);

//       const result = [...recommendedToShow, ...regularToShow];
//       console.log(`📄 Page 1: Showing ${recommendedToShow.length} recommended + ${regularToShow.length} regular = ${result.length} total (${recommendedRemaining} recommended remaining for page 2)`);
//       return result;
//     }

//     // ✅ FIXED: Page 2 - Show remaining recommended artworks (if any), then fill with regular artworks
//     if (page === 2) {
//       const recommendedOnPage1 = Math.min(recommendedList.length, maxItems);
//       const recommendedRemaining = recommendedList.length - recommendedOnPage1;

//       if (recommendedRemaining > 0) {
//         // Show remaining recommended artworks first
//         const recommendedToShow = recommendedList.slice(recommendedOnPage1, recommendedOnPage1 + recommendedRemaining);
//         const remainingSlots = maxItems - recommendedToShow.length;
//         const regularToShow = otherList.slice(0, remainingSlots);

//         const result = [...recommendedToShow, ...regularToShow];
//         console.log(`📄 Page 2: Showing ${recommendedToShow.length} remaining recommended + ${regularToShow.length} regular = ${result.length} total`);
//         return result;
//       } else {
//         // No remaining recommended, show regular artworks
//         const regularToShow = otherList.slice(0, maxItems);
//         console.log(`📄 Page 2: No remaining recommended, showing ${regularToShow.length} regular artworks`);
//         return regularToShow;
//       }
//     }

//     // ✅ FIXED: Page 3+ - Calculate offset correctly including recommended artworks from previous pages
//     // Total recommended shown on page 1 and 2
//     const recommendedOnPage1 = Math.min(recommendedList.length, maxItems);
//     const recommendedRemaining = Math.max(0, recommendedList.length - recommendedOnPage1);
//     const recommendedOnPage2 = Math.min(recommendedRemaining, maxItems);

//     // Regular artworks shown on page 1
//     const regularOnPage1 = maxItems - recommendedOnPage1;
//     // Regular artworks shown on page 2
//     const regularOnPage2 = maxItems - recommendedOnPage2;

//     // Calculate starting index for regular artworks on current page
//     const regularStart = regularOnPage1 + regularOnPage2 + (page - 3) * maxItems;
//     const regularToShow = otherList.slice(regularStart, regularStart + maxItems);

//     console.log(`📄 Page ${page}: Showing ${regularToShow.length} regular artworks (starting from index ${regularStart})`);
//     return regularToShow;
//   }, []);

//   // Perform semantic search
//   const performSearch = async (query) => {
//     if (!query.trim()) {
//       // Reset to unified view
//       setViewMode("unified");
//       // ✅ Re-fetch artworks with current registration filter when resetting from search
//       const artworks = await fetchAllArtworks(1, false);
//       updatePage(1); // ✅ FIXED: Use helper to keep ref in sync
//       const reordered = reorderArtworks(recommendedArtworks, artworks, 1, itemsPerPage);
//       applyFiltersToArtworks(reordered);
//       return;
//     }

//     setIsSearching(true);
//     try {
//       const response = await recommendationAPI.searchArtworks(query, 10); // ✅ Reduced to 10 for faster search
//       const searchResults = response.results || [];

//       // ✅ Filter out artworks that are not for sale (is_for_sale = false)
//       const searchResultsForSale = searchResults.filter(artwork => {
//         return artwork.is_for_sale !== false && shouldShowArtworkForSelectedNetwork(artwork, selectedNetworkKey);
//       });

//       setViewMode("search");
//       applyFiltersToArtworks(searchResultsForSale);

//       if (searchResults.length === 0) {
//         toast.success("No artworks found matching your search");
//       } else {
//         toast.success(`Found ${searchResults.length} artworks`);
//       }
//     } catch (error) {
//       console.error("Search failed:", error);
//       toast.error("Search failed");
//       // Fallback to local search
//       handleLocalSearch(query);
//     } finally {
//       setIsSearching(false);
//     }
//   };

//   // Fallback local search
//   const handleLocalSearch = (query) => {
//     const searchLower = query.toLowerCase();
//     const results = allArtworks.filter((artwork) => {
//       if (!artwork) return false;

//       // ✅ Filter out artworks that are not for sale (is_for_sale = false)
//       if (artwork.is_for_sale === false) return false;
//       if (!shouldShowArtworkForSelectedNetwork(artwork, selectedNetworkKey)) return false;

//       const title = artwork.title || "";
//       const description = artwork.description || "";
//       const creator = artwork.creator_address || "";
//       const tokenId = artwork.token_id?.toString() || "";

//       return (
//         title.toLowerCase().includes(searchLower) ||
//         description.toLowerCase().includes(searchLower) ||
//         creator.toLowerCase().includes(searchLower) ||
//         tokenId.includes(query)
//       );
//     });

//     setViewMode("search");
//     applyFiltersToArtworks(results);

//     if (results.length === 0) {
//       toast.success("No artworks found matching your search");
//     } else {
//       toast.success(`Found ${results.length} artworks`);
//     }
//   };

//   // ✅ OPTIMIZED: useCallback for filter function
//   // ✅ FIXED: Accept optional page parameter and skipRecommendedFilter flag to avoid double filtering
//   const applyFiltersToArtworks = useCallback((artworks, explicitPage = null, skipRecommendedFilter = false) => {
//     console.log('🔍 applyFiltersToArtworks called with:', {
//       inputArtworks: artworks?.length,
//       explicitPage,
//       currentPage,
//       skipRecommendedFilter
//     });

//     if (!artworks || artworks.length === 0) {
//       setDisplayedArtworks([]);
//       return;
//     }

//     // ✅ Use explicit page if provided, otherwise use currentPage from state
//     const pageToUse = explicitPage !== null ? explicitPage : currentPage;
//     let results = artworks;

//     console.log('📊 Starting filter with:', results.length, 'artworks');

//     // ✅ Filter out artworks that are not for sale
//     results = results.filter(artwork => {
//       return artwork && artwork.is_for_sale !== false && shouldShowArtworkForSelectedNetwork(artwork, selectedNetworkKey);
//     });
//     console.log('📊 After is_for_sale filter:', results.length);
//     // Remove duplicates by ID (optimized with Map for O(n) instead of O(n²))
//     const seenIds = new Map();
//     const uniqueResults = [];

//     for (const artwork of results) {
//       const artId = artwork?._id || artwork?.id;
//       if (!artId) continue;

//       const idStr = artId.toString();
//       if (!seenIds.has(idStr)) {
//         seenIds.set(idStr, true);
//         uniqueResults.push(artwork);
//       }
//     }

//     results = uniqueResults;
//     console.log('📊 After deduplication:', results.length);

//     // ✅ Registration method filter (On-chain/Off-chain)
//     // Filter is already applied in fetchAllArtworks and fetchRecommendations
//     // But apply it here as a safety check for merged artworks
//     // ✅ FIXED: Only preserve recommendations on page 1
//     if (activeRegistrationFilter !== "all") {
//       const beforeFilter = results.length;
//       // ✅ OPTIMIZED: Use memoized recommendedIdsSet instead of recalculating
//       const recommendedIds = recommendedIdsSet;

//       // Separate recommended and non-recommended artworks
//       const recommendedArtworksList = [];
//       const otherArtworks = [];

//       for (const artwork of results) {
//         const artworkId = (artwork._id || artwork.id)?.toString();
//         const isRecommended = artworkId && recommendedIds.has(artworkId);

//         // ✅ FIXED: Only preserve recommendations on page 1
//         if (isRecommended && pageToUse === 1) {
//           // Only include recommendations on page 1 (they're already filtered by backend)
//           recommendedArtworksList.push(artwork);
//           console.log(`✅ Preserving recommended artwork on page 1: ${artwork.title || artwork._id}`, {
//             is_on_chain: artwork.is_on_chain,
//             registration_method: artwork.registration_method,
//             payment_method: artwork.payment_method,
//             isOffChain: ArtworkStatus.isOffChainArtwork(artwork),
//             isOnChain: ArtworkStatus.isOnChainArtwork(artwork)
//           });
//         } else if (isRecommended && pageToUse !== 1) {
//           // ✅ FIXED: Exclude recommended artworks on page 2+
//           console.log(`🚫 Excluding recommended artwork on page ${pageToUse}: ${artwork.title || artwork._id}`);
//           continue; // Skip this artwork
//         } else {
//           // Filter non-recommended artworks by registration_method
//           let shouldInclude = true;

//           if (activeRegistrationFilter === "on-chain") {
//             shouldInclude = ArtworkStatus.isOnChainArtwork(artwork);
//             if (!shouldInclude) {
//               console.debug(`🚫 Filtered out off-chain artwork: ${artwork.title || artwork._id}`);
//             }
//           } else if (activeRegistrationFilter === "off-chain") {
//             shouldInclude = ArtworkStatus.isOffChainArtwork(artwork);
//             if (!shouldInclude) {
//               console.warn(`🚫 Filtered out on-chain artwork from off-chain filter: ${artwork.title || artwork._id}`, {
//                 is_on_chain: artwork.is_on_chain,
//                 registration_method: artwork.registration_method
//               });
//             }
//           }

//           if (shouldInclude) {
//             otherArtworks.push(artwork);
//           }
//         }
//       }

//       // Merge: recommended first (only on page 1), then filtered others
//       results = pageToUse === 1
//         ? [...recommendedArtworksList, ...otherArtworks]
//         : otherArtworks; // ✅ FIXED: No recommendations on page 2+

//       const afterFilter = results.length;
//       if (beforeFilter !== afterFilter) {
//         console.log(`🔍 Registration filter "${activeRegistrationFilter}": ${beforeFilter} → ${afterFilter} artworks (${recommendedArtworksList.length} recommended preserved)`);
//       }

//       // Log recommended artworks count
//       console.log(`📊 Recommended artworks in results: ${recommendedArtworksList.length} out of ${recommendedIdsSet.size} total recommendations`);
//     } else {
//       // ✅ NO FILTERING: reorderArtworks already handles excluding recommendations on page 2+
//       // We're only reordering, not excluding - so don't filter here
//       // Log recommended artworks count when no filter is applied
//       const recommendedCount = results.filter(artwork => {
//         const artworkId = (artwork._id || artwork.id)?.toString();
//         return artworkId && recommendedIdsSet.has(artworkId);
//       }).length;
//       console.log(`📊 Recommended artworks in results (no filter): ${recommendedCount} out of ${recommendedIdsSet.size} total recommendations`);
//     }

//     if (filters.licensed !== "all") {
//       const isLicensed = filters.licensed === "licensed";
//       results = results.filter(
//         (artwork) => artwork?.is_licensed === isLicensed
//       );
//     }

//     if (filters.royalty !== "all") {
//       results = results.filter((artwork) => {
//         if (!artwork || !artwork.royalty_percentage) return false;
//         const royalty = artwork.royalty_percentage / 100;
//         switch (filters.royalty) {
//           case "low":
//             return royalty < 5;
//           case "medium":
//             return royalty >= 5 && royalty < 15;
//           case "high":
//             return royalty >= 15;
//           default:
//             return true;
//         }
//       });
//     }
//     console.log('✅ Setting displayedArtworks:', results.length);
//     setDisplayedArtworks(results);
//   }, [activeRegistrationFilter, filters, recommendedArtworks, recommendedIdsSet, currentPage, selectedNetworkKey]);

//   // Handle search input with debounce
//   useEffect(() => {
//     const delayDebounceFn = setTimeout(() => {
//       if (searchTerm.trim()) {
//         performSearch(searchTerm);
//       } else if (viewMode === "search") {
//         // Reset to unified view
//         setViewMode("unified");
//         // ✅ Re-fetch artworks with current registration filter when resetting from search
//         fetchAllArtworks(1, false).then((artworks) => {
//           updatePage(1); // ✅ FIXED: Use helper to keep ref in sync
//           const reordered = reorderArtworks(recommendedArtworks, artworks, 1, itemsPerPage);
//           applyFiltersToArtworks(reordered);
//         });
//       }
//     }, 500);

//     return () => clearTimeout(delayDebounceFn);
//   }, [searchTerm, selectedNetworkKey]);

//   // Initial load - OPTIMIZED for maximum speed with progressive loading + caching
//   useEffect(() => {
//     // ✅ FIXED: Track mount time for deduplication
//     window.explorerMountTime = Date.now();

//     let isMounted = true;
//     let backgroundLoadInProgress = false;

//     const initializeExplorer = async () => {
//       if (!isMounted) return;
//       setIsLoading(true);

//       try {
//         const filterKey = activeRegistrationFilter;

//         // ✅ OPTIMIZATION STEP 1: Check cache first (instant if available)
//         // ✅ OPTIMIZATION STEP 1: Check cache first (instant if available)
//         // ✅ OPTIMIZATION STEP 1: Check cache first (instant if available)
//         if (ENABLE_CACHING) {
//           const cacheKey = getCacheKey(filterKey);
//           const cachedItem = localStorage.getItem(cacheKey);

//           if (cachedItem) {
//             try {
//               // ✅ FIXED: Parse cache to get both data and timestamp
//               const { data: cachedArtworks, timestamp } = JSON.parse(cachedItem);
//               const cacheAge = Date.now() - timestamp;

//               // Check if cache is still valid (within CACHE_DURATION)
//               if (cacheAge < CACHE_DURATION && cachedArtworks && cachedArtworks.length > 0) {
//                 console.log(`⚡ Using cached data: ${cachedArtworks.length} artworks (${Math.round(cacheAge / 1000)}s old)`);
//                 setAllArtworksWithRef(cachedArtworks);

//                 // ✅ Calculate and set totalPages from cached data
//                 const calculatedPages = Math.ceil(cachedArtworks.length / itemsPerPage);
//                 setTotalPages(calculatedPages);
//                 setArtworkCounts({
//                   total: cachedArtworks.length,
//                   on_chain: cachedArtworks.filter(a => ArtworkStatus.isOnChainArtwork(a)).length,
//                   off_chain: cachedArtworks.filter(a => ArtworkStatus.isOffChainArtwork(a)).length,
//                   competition: cachedArtworks.filter(a => ArtworkStatus.getRegistrationMethod(a) === "competition").length,
//                   crypto: cachedArtworks.filter(a => ArtworkStatus.isOnChainArtwork(a)).length,
//                   paypal: cachedArtworks.filter(a => ArtworkStatus.isOffChainArtwork(a)).length
//                 });
//                 console.log(`📊 Artwork counts set from cache: ${cachedArtworks.length} total`);

//                 setIsLoading(false);
//                 updatePage(1);

//                 const reordered = reorderArtworks([], cachedArtworks, 1, itemsPerPage);
//                 applyFiltersToArtworks(reordered, 1);


//                 console.log('=== CACHE LOAD COMPLETE ===');
//                 console.log('  allArtworks set:', cachedArtworks.length);
//                 console.log('  totalPages set:', calculatedPages);
//                 console.log('  Filters applied for page 1');
//                 isInitialMount.current = false;

//                 // ✅ SMART: Only fetch counts in background if cache is older than 2 minutes
//                 const twoMinutes = 2 * 60 * 1000;
//                 if (cacheAge > twoMinutes) {
//                   console.log(`📊 Cache is ${Math.round(cacheAge / 1000)}s old, fetching fresh counts in background...`);
//                   fetchArtworkCounts().catch(() => { });
//                 } else {
//                   console.log(`✅ Cache is fresh (${Math.round(cacheAge / 1000)}s old), skipping background fetch`);
//                 }

//                 // Still fetch recommendations in background
//                 if (effectiveUserId && isMounted) {
//                   fetchRecommendations(effectiveUserId).then(recommended => {
//                     if (!isMounted || currentPageRef.current !== 1) return;
//                     if (recommended.length > 0) {
//                       const reordered = reorderArtworks(recommended, cachedArtworks, 1, itemsPerPage);
//                       applyFiltersToArtworks(reordered, 1);
//                     }
//                   }).catch(() => { });
//                 }

//                 return; // Exit early - cached data shown
//               } else {
//                 // Cache expired, remove it
//                 console.log(`🗑️ Cache expired (${Math.round(cacheAge / 1000)}s old), removing...`);
//                 localStorage.removeItem(cacheKey);
//               }
//             } catch (error) {
//               console.error('❌ Error parsing cache:', error);
//               // Continue to normal fetch if cache parsing fails
//               localStorage.removeItem(cacheKey);
//             }
//           }
//         }
//         // ✅ OPTIMIZATION STEP 2: Progressive loading - Fast first page (1-2 seconds)
//         if (ENABLE_PROGRESSIVE_LOADING) {
//           console.log('🚀 Progressive load: Fetching first page only...');
//           const firstPageArtworks = await fetchAllArtworks(1, false);

//           if (!isMounted) return;

//           if (firstPageArtworks && firstPageArtworks.length > 0) {
//             console.log(`✅ Fast load complete: ${firstPageArtworks.length} artworks`);

//             // Show first page immediately
//             setAllArtworksWithRef(firstPageArtworks);
//             setIsLoading(false);
//             updatePage(1);

//             const reordered = reorderArtworks([], firstPageArtworks, 1, itemsPerPage);
//             applyFiltersToArtworks(reordered, 1);
//             isInitialMount.current = false;

//             // Fetch recommendations in parallel with background load
//             if (effectiveUserId && isMounted) {
//               fetchRecommendations(effectiveUserId).then(recommended => {
//                 if (!isMounted || currentPageRef.current !== 1) return;
//                 if (recommended.length > 0) {
//                   // Use current allArtworks state (might be full dataset by now)
//                   const currentArtworks = allArtworks.length > firstPageArtworks.length
//                     ? allArtworks
//                     : firstPageArtworks;
//                   const reordered = reorderArtworks(recommended, currentArtworks, 1, itemsPerPage);
//                   applyFiltersToArtworks(reordered, 1);
//                 }
//               }).catch(() => { });
//             }

//             // ✅ OPTIMIZATION STEP 3: Background load remaining artworks (non-blocking)
//             if (!backgroundLoadInProgress && isMounted) {
//               backgroundLoadInProgress = true;
//               console.log('🔄 Background load: Fetching all artworks...');

//               fetchAllArtworksComplete().then(allArtworksData => {
//                 if (!isMounted) return;

//                 if (allArtworksData && allArtworksData.length > 0) {
//                   console.log(`✅ Background load complete: ${allArtworksData.length} total artworks`);

//                   // Update with full dataset
//                   setAllArtworksWithRef(allArtworksData);
//                   setTotalPages(Math.max(1, Math.ceil(allArtworksData.length / itemsPerPage)));

//                   // Cache the full dataset
//                   setCachedData(filterKey, allArtworksData);

//                   // Re-apply filters if still on page 1
//                   if (currentPageRef.current === 1) {
//                     const reordered = reorderArtworks(
//                       recommendedArtworks,
//                       allArtworksData,
//                       1,
//                       itemsPerPage
//                     );
//                     applyFiltersToArtworks(reordered, 1);
//                   }
//                 }
//                 backgroundLoadInProgress = false;
//               }).catch(error => {
//                 console.error('❌ Background load failed:', error);
//                 backgroundLoadInProgress = false;
//               });
//             }
//           } else {
//             // ✅ FIX: Fallback if first page fetch fails - try full fetch
//             console.warn('⚠️ First page fetch returned no data, trying full fetch...');
//             const allArtworksData = await fetchAllArtworksComplete();

//             if (!isMounted) return;

//             if (allArtworksData && allArtworksData.length > 0) {
//               console.log(`✅ Fallback load complete: ${allArtworksData.length} artworks`);
//               setAllArtworksWithRef(allArtworksData);
//               setTotalPages(Math.max(1, Math.ceil(allArtworksData.length / itemsPerPage)));
//               setCachedData(filterKey, allArtworksData);
//               setIsLoading(false);
//               updatePage(1);

//               const reordered = reorderArtworks([], allArtworksData, 1, itemsPerPage);
//               applyFiltersToArtworks(reordered, 1);
//               isInitialMount.current = false;

//               // Load recommendations
//               if (effectiveUserId && isMounted) {
//                 fetchRecommendations(effectiveUserId).then(recommended => {
//                   if (!isMounted || currentPageRef.current !== 1) return;
//                   if (recommended.length > 0) {
//                     const reordered = reorderArtworks(recommended, allArtworksData, 1, itemsPerPage);
//                     applyFiltersToArtworks(reordered, 1);
//                   }
//                 }).catch(() => { });
//               }
//             } else {
//               // Absolutely no data available
//               throw new Error('No artworks available from API');
//             }
//           }
//         } else {
//           // Fallback if first page fetch fails - try full fetch
//           console.warn('⚠️ First page fetch failed, trying full fetch...');
//           const allArtworksData = await fetchAllArtworksComplete();

//           if (!isMounted) return;

//           if (allArtworksData && allArtworksData.length > 0) {
//             console.log(`✅ Fallback load complete: ${allArtworksData.length} artworks`);
//             setAllArtworksWithRef(allArtworksData);
//             setTotalPages(Math.max(1, Math.ceil(allArtworksData.length / itemsPerPage)));
//             setCachedData(filterKey, allArtworksData);
//             setIsLoading(false);
//             updatePage(1);

//             const reordered = reorderArtworks([], allArtworksData, 1, itemsPerPage);
//             applyFiltersToArtworks(reordered, 1);
//             isInitialMount.current = false;

//             // Load recommendations
//             if (effectiveUserId && isMounted) {
//               fetchRecommendations(effectiveUserId).then(recommended => {
//                 if (!isMounted || currentPageRef.current !== 1) return;
//                 if (recommended.length > 0) {
//                   const reordered = reorderArtworks(recommended, allArtworksData, 1, itemsPerPage);
//                   applyFiltersToArtworks(reordered, 1);
//                 }
//               }).catch(() => { });
//             }
//           } else {
//             // Absolutely no data - show error
//             throw new Error('No artworks available');
//           }
//         }

//       } catch (error) {
//         console.error('❌ Explorer initialization error:', error);
//         if (isMounted) {
//           setIsLoading(false);
//           isInitialMount.current = false;

//           // ✅ FIX: Clear potentially stale data on error
//           setAllArtworksWithRef([]);
//           setDisplayedArtworks([]);
//           setRecommendedArtworksWithRef([]);

//           // Clear cache if there's an error loading
//           console.log('🗑️ Clearing cache due to initialization error');
//           clearCache();

//           toast.error('Failed to load artworks. Please refresh the page.');
//         }
//       }
//     };

//     initializeExplorer();

//     return () => {
//       isMounted = false;
//       backgroundLoadInProgress = false;
//       // ✅ OPTIMIZATION: Cancel all in-flight requests on unmount
//       abortControllers.current.forEach(controller => controller.abort());
//       abortControllers.current.clear();
//       inFlightRequests.current.clear();
//     };
//   }, [user?.id, isAuthenticated, account, activeRegistrationFilter, selectedNetworkKey, refreshTrigger]); // ✅ Added activeRegistrationFilter and selected network for cache key

//   // ✅ FIX: Clear stale cache ONLY when user actually changes
//   useEffect(() => {
//     const currentUserId = user?.id?.toString();

//     // ✅ IMPORTANT: Initialize on first mount
//     if (window.lastExplorerUserId === undefined) {
//       console.log('🎬 First auth check, initializing:', currentUserId || 'guest');
//       window.lastExplorerUserId = currentUserId;
//       return; // Don't do anything on first mount
//     }

//     const lastUserId = window.lastExplorerUserId;

//     // ✅ Check if user actually changed
//     if (currentUserId === lastUserId) {
//       console.log('✅ Same user, no cache cleanup needed');
//       return; // Same user, do nothing
//     }

//     // User changed!
//     console.log('👤 User changed! Cleanup starting...');
//     console.log(`   From: ${lastUserId || 'guest'} → To: ${currentUserId || 'guest'}`);

//     // Scenario 1: Different user logged in (User A → User B)
//     if (currentUserId && lastUserId && currentUserId !== lastUserId) {
//       console.log('🔄 Different user - clearing old user cache');
//       Object.keys(localStorage)
//         .filter(key => {
//           if (!key.startsWith(CACHE_KEY_PREFIX)) return false;
//           const parts = key.split('_');
//           const keyUserId = parts[parts.length - 1];
//           return keyUserId === lastUserId; // Only clear LAST user's cache
//         })
//         .forEach(key => {
//           console.log(`🗑️ Removing old user cache: ${key}`);
//           localStorage.removeItem(key);
//         });
//     }

//     // Scenario 2: User logged out (User → Guest)
//     else if (!currentUserId && lastUserId) {
//       console.log('👋 User logged out - clearing user caches');
//       Object.keys(localStorage)
//         .filter(key => key.startsWith(CACHE_KEY_PREFIX) && !key.endsWith('_guest'))
//         .forEach(key => {
//           console.log(`🗑️ Removing user cache: ${key}`);
//           localStorage.removeItem(key);
//         });
//     }

//     // Scenario 3: User logged in (Guest → User)
//     else if (currentUserId && !lastUserId) {
//       console.log('🔐 User logged in - clearing guest cache');
//       Object.keys(localStorage)
//         .filter(key => key.startsWith(CACHE_KEY_PREFIX) && key.endsWith('_guest'))
//         .forEach(key => {
//           console.log(`🗑️ Removing guest cache: ${key}`);
//           localStorage.removeItem(key);
//         });
//     }

//     // Update last user ID
//     window.lastExplorerUserId = currentUserId;
//     console.log('✅ Cleanup complete, updated lastUserId to:', currentUserId);

//   }, [user?.id, CACHE_KEY_PREFIX]);

//   // ✅ FIX: Force refetch if no artworks loaded after mount
//   useEffect(() => {
//     // Wait a bit for initial load to complete
//     const timer = setTimeout(() => {
//       if (allArtworks.length === 0 && !isLoading) {
//         console.warn('⚠️ No artworks loaded 3 seconds after mount, forcing refetch');
//         console.log('State check:', {
//           isLoading,
//           isInitialMount: isInitialMount.current,
//           allArtworksLength: allArtworks.length,
//           displayedArtworksLength: displayedArtworks.length
//         });

//         // Clear cache and force reload
//         clearCache();
//         setRetryCount(prev => prev + 1);

//         // Manually trigger initialization
//         setIsLoading(true);
//         isInitialMount.current = true;
//       }
//     }, 3000); // 3 second timeout

//     return () => clearTimeout(timer);
//   }, []); // Run only once on mount

//   // Retry recommendations if needed
//   useEffect(() => {
//     // ✅ FIXED: Don't run immediately on mount
//     if (isInitialMount.current) {
//       return;
//     }
//     const retryRecommendations = async () => {
//       // ✅ FIXED: Use ref to avoid stale closure
//       const currentArtworks = allArtworksRef.current;

//       if (isAuthenticated && user?.id && currentArtworks.length > 0 &&
//         !hasRecommendations && recommendationAttempts < 3) {

//         console.log('🔄 Retrying recommendations... Attempt:', recommendationAttempts + 1);
//         setRecommendationAttempts(prev => prev + 1);

//         if (effectiveUserId) {
//           const recommended = await fetchRecommendations(effectiveUserId);
//           if (recommended.length > 0) {
//             // ✅ FIXED: Only apply if user is still on page 1
//             if (currentPageRef.current === 1) {
//               const reordered = reorderArtworks(recommended, allArtworksRef.current, 1, itemsPerPage);
//               applyFiltersToArtworks(reordered, 1); // ✅ Explicit page parameter
//             } else {
//               console.log('⏭️ User navigated away from page 1, skipping recommendation merge');
//             }
//           }
//         }

//         // Add delay between retries
//         await new Promise(resolve => setTimeout(resolve, 2000));
//       }
//     };

//     // Add delay before retry
//     const timer = setTimeout(() => {
//       retryRecommendations();
//     }, 2000); // 2 second delay

//     return () => clearTimeout(timer);
//   }, [user?.id, isAuthenticated, hasRecommendations]);

//   // ✅ Re-fetch counts, artworks, and recommendations when registration filter changes
//   useEffect(() => {
//     const timer = setTimeout(() => {
//       // Skip on initial mount (handled by initial load useEffect)
//       if (isInitialMount.current) {
//         console.log('⏭️ Skipping filter change on initial mount');
//         return;
//       }

//       // Don't run if artworks haven't been loaded yet
//       if (allArtworks.length === 0) {
//         console.log('⏳ Artworks not loaded yet, waiting for initial load...');
//         return;
//       }

//       // ✅ FIXED: Don't run if we just mounted (within 1 second)
//       const timeSinceMount = Date.now() - (window.explorerMountTime || 0);
//       if (timeSinceMount < 1000) {
//         console.log('⏭️ Just mounted, skipping filter effect');
//         return;
//       }

//       // ✅ OPTIMIZATION: Prevent concurrent filter changes
//       const filterKey = `filter-${activeRegistrationFilter}-${selectedNetworkKey || 'sepolia'}-${viewMode}`;
//       if (inFlightRequests.current.has(filterKey)) {
//         console.log(`⏭️ Filter change already in progress: ${filterKey}`);
//         return;
//       }

//       const refetchData = async () => {
//         // Mark filter change as in progress
//         inFlightRequests.current.set(filterKey, Promise.resolve());

//         try {
//           // ✅ Always re-fetch counts when filter changes to ensure accuracy
//           console.log('🔄 Registration filter changed to:', activeRegistrationFilter);

//           // ✅ OPTIMIZATION: Check cache first for new filter
//           if (ENABLE_CACHING) {
//             const cachedData = getCachedData(activeRegistrationFilter);
//             if (cachedData && cachedData.length > 0) {
//               console.log(`⚡ Using cached data for filter: ${activeRegistrationFilter}`);
//               setAllArtworksWithRef(cachedData);

//               // ✅ FIX: Calculate totalPages here too
//               const calculatedPages = Math.ceil(cachedData.length / itemsPerPage);
//               setTotalPages(calculatedPages);

//               updatePage(1);

//               if (viewMode === "unified") {
//                 const reordered = reorderArtworks([], cachedData, 1, itemsPerPage);
//                 applyFiltersToArtworks(reordered, 1);

//                 if (isAuthenticated && effectiveUserId) {
//                   fetchRecommendations(effectiveUserId).then(recommended => {
//                     if (recommended.length > 0 && currentPageRef.current === 1) {
//                       const reorderedWithRecs = reorderArtworks(recommended, cachedData, 1, itemsPerPage);
//                       applyFiltersToArtworks(reorderedWithRecs, 1);
//                     }
//                   }).catch(() => { });
//                 }
//               }

//               // Show cached data immediately for fast UX, then revalidate from API.
//               console.log('🔄 Revalidating cached explorer data from API...');
//             }
//           }

//           // ✅ FIXED: Simplified - only fetch counts and ALL artworks (no duplicate fetching)
//           await fetchArtworkCounts();

//           console.log('🔄 Fetching all artworks for new filter...');
//           const allArtworksData = await fetchAllArtworksComplete();

//           if (allArtworksData.length === 0) {
//             console.warn('⚠️ No artworks returned for filter');
//             setAllArtworksWithRef([]);
//             setDisplayedArtworks([]);
//             setTotalPages(1);
//             inFlightRequests.current.delete(filterKey);
//             return;
//           }

//           console.log(`📚 Fetched ${allArtworksData.length} artworks with registration filter: ${activeRegistrationFilter}`);

//           // ✅ OPTIMIZATION: Cache the fetched data
//           setCachedData(activeRegistrationFilter, allArtworksData);

//           // ✅ Update allArtworks state with all fetched artworks
//           setAllArtworksWithRef(allArtworksData);
//           setTotalPages(Math.max(1, Math.ceil(allArtworksData.length / itemsPerPage)));
//           updatePage(1); // ✅ FIXED: Reset to page 1 when filter changes (keep ref in sync)

//           if (viewMode === "unified") {
//             if (isAuthenticated && effectiveUserId) {
//               console.log('🔄 Re-fetching recommendations for new filter...');
//               // ✅ Show artworks immediately, load recommendations in background
//               // ✅ Reorder: ALL artworks, recommendations first (NO EXCLUSIONS)
//               const reordered = reorderArtworks([], allArtworksData, 1, itemsPerPage);
//               applyFiltersToArtworks(reordered, 1);

//               // Load recommendations in background (only for page 1)
//               fetchRecommendations(effectiveUserId).then(recommended => {
//                 if (recommended.length > 0 && currentPageRef.current === 1) {
//                   // ✅ Reorder: ALL recommendations first, then ALL other artworks (NO EXCLUSIONS)
//                   const reorderedWithRecs = reorderArtworks(recommended, allArtworksData, 1, itemsPerPage);
//                   applyFiltersToArtworks(reorderedWithRecs, 1);
//                 }
//               }).catch(error => {
//                 console.warn('⚠️ Recommendations failed:', error);
//               });
//             } else {
//               // If no user or not authenticated, just re-apply filters
//               // ✅ Reorder: ALL artworks, recommendations first (if any), then all others (NO EXCLUSIONS)
//               const reordered = reorderArtworks(recommendedArtworks, allArtworksData, 1, itemsPerPage);
//               applyFiltersToArtworks(reordered, 1);
//             }
//           }
//         } catch (error) {
//           console.error('❌ Error refetching data for filter change:', error);
//           toast.error('Failed to update filter');
//         } finally {
//           // Remove from in-flight after completion
//           inFlightRequests.current.delete(filterKey);
//         }
//       };

//       refetchData();
//     }, 100); // 100ms delay
//     return () => clearTimeout(timer);
//   }, [activeRegistrationFilter, selectedNetworkKey, viewMode]); // ✅ FIXED: Removed function dependencies

//   // Apply filters when filters (licensed/royalty) change
//   // Note: This doesn't re-fetch artworks, just re-applies the filter logic
//   // ✅ IMPORTANT: Only runs when filters change, NOT when page/displayedArtworks change
//   // Pagination is handled by goToPage function
//   useEffect(() => {
//     // Skip if no artworks loaded yet
//     if (allArtworks.length === 0) return;

//     if (viewMode === "unified") {
//       const reordered = reorderArtworks(recommendedArtworks, allArtworks, currentPage, itemsPerPage);
//       applyFiltersToArtworks(reordered, currentPage);
//     } else if (viewMode === "search" && displayedArtworks.length > 0) {
//       // Reapply filters to current displayed artworks
//       applyFiltersToArtworks(displayedArtworks);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [filters]); // ✅ FIXED: Only trigger on filter changes to prevent infinite loops

//   const resetFilters = () => {
//     setSearchTerm("");
//     setFilters({ licensed: "all", royalty: "all" });
//     setViewMode("unified");
//     // ✅ Always pass full recommendedArtworks - function handles page logic internally
//     const reordered = reorderArtworks(recommendedArtworks, allArtworks, currentPage, itemsPerPage);
//     applyFiltersToArtworks(reordered, currentPage);
//   };

//   // ✅ OPTIMIZED: useCallback for click handler
//   const handleArtworkClick = useCallback(async (artworkId) => {
//     if (effectiveUserId) {
//       // Don't await - fire and forget for better performance
//       recommendationAPI.trackArtworkView(artworkId).catch(() => {
//         // Silently fail - tracking is not critical
//       });
//     }
//   }, [effectiveUserId]);

//   // ✅ OPTIMIZED: Navigate to specific page
//   // ✅ FIXED: Fetch additional artworks if filtering removes recommended ones
//   const goToPage = useCallback(async (page) => {
//     if (isLoadingMore || page < 1 || page > totalPages || page === currentPage || viewMode !== "unified") {
//       return;
//     }

//     setIsLoadingMore(true);
//     try {
//       // Scroll to top when changing pages
//       window.scrollTo({ top: 0, behavior: 'smooth' });

//       // ✅ FIXED: Use refs to access latest state
//       const currentArtworks = allArtworksRef.current || allArtworks;
//       const currentRecommended = recommendedArtworksRef.current || recommendedArtworks;

//       // If no artworks, fetch them
//       if (!currentArtworks || currentArtworks.length === 0) {
//         console.log('⚠️ No artworks in state, fetching...');
//         const allArtworksData = await fetchAllArtworksComplete();
//         setAllArtworksWithRef(allArtworksData);
//         setTotalPages(Math.max(1, Math.ceil(allArtworksData.length / itemsPerPage)));

//         updatePage(page);

//         const reordered = reorderArtworks(currentRecommended || [], allArtworksData, page, itemsPerPage);
//         console.log(`📊 Reordered artworks for page ${page}: ${reordered.length} items`);
//         applyFiltersToArtworks(reordered, page, false);
//       } else {
//         console.log(`📄 Going to page ${page} with ${currentArtworks?.length || 0} total artworks`);

//         updatePage(page);

//         // Reorder with current values
//         const reordered = reorderArtworks(currentRecommended || [], currentArtworks, page, itemsPerPage);
//         console.log(`📊 Reordered artworks for page ${page}: ${reordered.length} items`);
//         applyFiltersToArtworks(reordered, page, false);
//       }
//     } catch (error) {
//       console.error('Failed to load page:', error);
//       toast.error('Failed to load page');
//     } finally {
//       setIsLoadingMore(false);
//     }
//   }, [
//     isLoadingMore,
//     currentPage,
//     totalPages,
//     viewMode,
//     itemsPerPage,
//     updatePage,
//     reorderArtworks,
//     applyFiltersToArtworks,
//     fetchAllArtworksComplete
//   ]); // ✅ FIXED: Using refs, so allArtworks/recommendedArtworks not needed in deps // ✅ FIXED: Using functional setState to avoid stale closures

//   // ✅ OPTIMIZED: Load more artworks (for infinite scroll - kept for backward compatibility)
//   const loadMoreArtworks = useCallback(async () => {
//     if (isLoadingMore || !hasMore || viewMode !== "unified") return;

//     const nextPage = currentPage + 1;
//     await goToPage(nextPage);
//   }, [isLoadingMore, hasMore, currentPage, viewMode, goToPage]);

//   // ✅ OPTIMIZED: Previous page navigation
//   const goToPreviousPage = useCallback(() => {
//     if (currentPage > 1) {
//       goToPage(currentPage - 1);
//     }
//   }, [currentPage, goToPage]);

//   // ✅ OPTIMIZED: Next page navigation
//   const goToNextPage = useCallback(() => {
//     if (currentPage < totalPages) {
//       goToPage(currentPage + 1);
//     }
//   }, [currentPage, totalPages, goToPage]);

//   // ✅ OPTIMIZED: useCallback and useMemo for recommended check
//   // ✅ FIXED: Show "FOR YOU" badge on all pages where recommended artworks appear
//   const isRecommended = useCallback((artworkId) => {
//     if (!artworkId) return false;
//     const artworkIdStr = artworkId.toString();
//     // Check if artwork is in recommended set (works for all pages)
//     const isRecommendedArtwork = recommendedIdsSet.has(artworkIdStr);
//     return isRecommendedArtwork;
//   }, [recommendedIdsSet]);

//   // ✅ OPTIMIZED: Intersection Observer for infinite scroll (optional - disabled for page-based navigation)
//   // Note: Commented out to use page-based navigation instead
//   // Uncomment if you want to enable infinite scroll alongside page navigation
//   /*
//   const loadMoreRef = useRef(null);

//   useEffect(() => {
//     if (!loadMoreRef.current || !hasMore || isLoadingMore || viewMode !== "unified") return;

//     const observer = new IntersectionObserver(
//       (entries) => {
//         if (entries[0].isIntersecting) {
//           loadMoreArtworks();
//         }
//       },
//       { threshold: 0.1 }
//     );

//     observer.observe(loadMoreRef.current);

//     return () => {
//       if (loadMoreRef.current) {
//         observer.unobserve(loadMoreRef.current);
//       }
//     };
//   }, [hasMore, isLoadingMore, viewMode, loadMoreArtworks]);
//   */

//   return (
//     <div className="bg-white min-h-screen">
//       {/* Hero Section */}
//       <div className="relative overflow-hidden">
//         <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
//         <div
//           className="absolute inset-0 bg-cover bg-center opacity-20"
//           style={{
//             backgroundImage:
//               "url('https://images.pexels.com/photos-373965/pexels-photo-373965.jpeg?auto=compress&cs=tinysrgb&w=1600')",
//           }}
//         ></div>
//         <div className="relative max-w-4xl mx-auto py-20 px-6 text-center">
//           <h1 className="text-4xl font-extrabold text-white mb-4">
//             Artwork Explorer
//           </h1>
//           <p className="text-lg text-purple-100 max-w-2xl mx-auto">
//             Discover amazing artworks with AI-powered recommendations and search.
//           </p>
//           <p className="text-md text-purple-200 mt-2">
//             {viewMode === "search"
//               ? `Search results for "${searchTerm}"`
//               : hasRecommendations
//                 ? `${recommendedArtworks.length} personalized recommendations • ${activeFilterTotalCount} total artworks available`
//                 : isAuthenticated
//                   ? `${activeFilterTotalCount} artworks in our collection • Explore to get recommendations!`
//                   : `${activeFilterTotalCount} artworks in our collection • Sign in for personalized recommendations`
//             }
//           </p>

//           {isAuthenticated && (
//             <div className="mt-6">
//               <Link
//                 to="/dashboard/upload"
//                 className="inline-flex items-center px-8 py-3 text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-md"
//               >
//                 Register Artwork
//                 <ArrowRight className="ml-2 w-5 h-5" />
//               </Link>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Recommendations Info Banner - Only show on page 1 */}
//       {hasRecommendations && viewMode === "unified" && currentPage === 1 ? (
//         <div className="max-w-6xl mx-auto px-6 mt-8 mb-4">
//           <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
//             <div className="flex items-center text-purple-800">
//               <Sparkles className="w-5 h-5 mr-2" />
//               <span className="font-medium">
//                 Showing {recommendedArtworks.length} personalized recommendations ({activeFilterLabel}) first, followed by other artworks
//               </span>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div className="mt-8"></div>
//       )}

//       {/* Search + Filters */}
//       <div className="max-w-6xl mx-auto px-6 mb-8">
//         <div className="bg-white p-4 sm:p-5 rounded-xl shadow-md border border-gray-200">
//           <div className="flex flex-col xl:flex-row xl:items-center gap-3">
//             <div className="relative w-full xl:w-[240px] 2xl:w-[280px] shrink-0">
//               <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
//                 <Search className="h-5 w-5 text-gray-600" />
//               </div>
//               <input
//                 type="text"
//                 placeholder="Search by title, description, creator, or token ID..."
//                 className="block w-full h-12 pl-10 pr-10 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//               />
//               {isSearching && (
//                 <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
//                   <LoadingSpinner size="small" />
//                 </div>
//               )}
//             </div>

//             {/* Tab Navigation for Filters */}
//             <div className="w-full xl:flex-1 xl:min-w-0">
//               <div className="grid grid-cols-4 p-1 bg-gray-100 rounded-lg gap-1">
//                 {[
//                   { id: "all", label: "All", count: tabCounts.all },
//                   { id: "on-chain", label: "On-chain", count: tabCounts.onChain },
//                   { id: "off-chain", label: "Off-chain", count: tabCounts.offChain },
//                   { id: "competition", label: "Competition", count: tabCounts.competition }
//                 ].map((tab) => (
//                   <button
//                     key={tab.id}
//                     onClick={() => setActiveRegistrationFilter(tab.id)}
//                     className={`w-full px-2 py-2 text-[11px] xl:text-xs 2xl:text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeRegistrationFilter === tab.id
//                         ? "bg-white text-purple-600 shadow-sm"
//                         : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
//                       }`}
//                   >
//                     {tab.label}
//                     {tab.count > 0 && <span className="ml-1 hidden 2xl:inline-flex px-1.5 py-0.5 text-xs bg-gray-200 rounded-full text-gray-600">{tab.count}</span>}
//                   </button>
//                 ))}
//               </div>
//             </div>
//             <div className="flex items-center gap-2 shrink-0">
//               <select
//                 className="text-sm border border-gray-400 rounded-md px-3 py-2 bg-white h-11 w-[145px]"
//                 value={filters.licensed}
//                 onChange={(e) =>
//                   setFilters({ ...filters, licensed: e.target.value })
//                 }
//               >
//                 <option value="all">All Licenses</option>
//                 <option value="licensed">Licensed Only</option>
//                 <option value="unlicensed">Unlicensed Only</option>
//               </select>

//               <select
//                 className="text-sm border border-gray-400 rounded-md px-3 py-2 bg-white h-11 w-[145px]"
//                 value={filters.royalty}
//                 onChange={(e) =>
//                   setFilters({ ...filters, royalty: e.target.value })
//                 }
//               >
//                 <option value="all">All Royalties</option>
//                 <option value="low">Low (&lt;5%)</option>
//                 <option value="medium">Medium (5-15%)</option>
//                 <option value="high">High (&gt;15%)</option>
//               </select>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Artwork Grid */}
//       <div className="max-w-7xl mx-auto px-6 pb-16">
//         {/* ✅ FIXED: Show loading while data is being processed */}
//         {(isLoading || (displayedArtworks.length === 0 && allArtworks.length > 0)) ? (
//           ENABLE_SKELETON_UI ? (
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
//               {[...Array(6)].map((_, i) => (
//                 <ArtworkSkeleton key={`skeleton-${i}`} />
//               ))}
//             </div>
//           ) : (
//             <div className="flex justify-center p-12">
//               <LoadingSpinner size="large" />
//             </div>
//           )
//         ) : displayedArtworks.length === 0 ? (
//           <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
//             <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
//             <p className="text-gray-500 mb-4">
//               {viewMode === "search"
//                 ? `No artworks found for "${searchTerm}"`
//                 : `No artworks found matching your criteria`
//               }
//             </p>
//             <button
//               onClick={resetFilters}
//               className="text-purple-600 hover:text-purple-800 font-medium"
//             >
//               {viewMode === "search" ? "Clear search" : "Clear all filters"}
//             </button>
//           </div>
//         ) : (
//           <>
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
//               {displayedArtworks.map((artwork) => {
//                 const artworkId = artwork._id || artwork.id;
//                 return (
//                   <div key={artworkId} onClick={() => handleArtworkClick(artworkId)}>
//                     <ArtworkCard
//                       artwork={artwork}
//                       currentAccount={account}
//                       isRecommended={isRecommended(artworkId)}
//                       currentUserId={effectiveUserId}
//                       selectedNetwork={selectedNetwork}
//                       isAuthenticated={isAuthenticated}
//                       user={user}

//                     />
//                   </div>
//                 );
//               })}
//             </div>

//             {/* ✅ OPTIMIZED: Modern Pagination controls with page numbers */}
//             {viewMode === "unified" && totalPages > 1 && (
//               <div className="flex flex-col items-center mt-12 mb-8 gap-6">
//                 {/* Page Navigation Controls - Enhanced Styling */}
//                 <div className="flex items-center gap-3 flex-wrap justify-center bg-white rounded-xl shadow-lg border border-gray-200 p-4">
//                   {/* Previous Button */}
//                   <button
//                     onClick={goToPreviousPage}
//                     disabled={currentPage === 1 || isLoadingMore}
//                     className="px-5 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg hover:from-gray-100 hover:to-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md disabled:hover:shadow-sm active:scale-95"
//                   >
//                     <ChevronLeft className="w-4 h-4" />
//                     <span>Previous</span>
//                   </button>

//                   {/* Page Numbers */}
//                   <div className="flex items-center gap-2">
//                     {(() => {
//                       const pages = [];
//                       const maxVisiblePages = 7;
//                       let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
//                       let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

//                       // Adjust start if we're near the end
//                       if (endPage - startPage < maxVisiblePages - 1) {
//                         startPage = Math.max(1, endPage - maxVisiblePages + 1);
//                       }

//                       // First page
//                       if (startPage > 1) {
//                         pages.push(
//                           <button
//                             key={1}
//                             onClick={() => goToPage(1)}
//                             disabled={isLoadingMore}
//                             className="px-4 py-2.5 min-w-[40px] bg-white border-2 border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md active:scale-95"
//                           >
//                             1
//                           </button>
//                         );
//                         if (startPage > 2) {
//                           pages.push(
//                             <span key="ellipsis-start" className="px-2 text-gray-400 font-semibold">
//                               ...
//                             </span>
//                           );
//                         }
//                       }

//                       // Page numbers
//                       for (let i = startPage; i <= endPage; i++) {
//                         pages.push(
//                           <button
//                             key={i}
//                             onClick={() => goToPage(i)}
//                             disabled={isLoadingMore}
//                             className={`px-4 py-2.5 min-w-[40px] rounded-lg transition-all duration-200 text-sm font-semibold shadow-sm active:scale-95 ${i === currentPage
//                                 ? 'bg-gradient-to-br from-purple-600 to-purple-700 !text-white hover:from-purple-700 hover:to-purple-800 shadow-md ring-2 ring-purple-300 ring-offset-2'
//                                 : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md'
//                               }`}
//                           >
//                             {i}
//                           </button>
//                         );
//                       }

//                       // Last page
//                       if (endPage < totalPages) {
//                         if (endPage < totalPages - 1) {
//                           pages.push(
//                             <span key="ellipsis-end" className="px-2 text-gray-400 font-semibold">
//                               ...
//                             </span>
//                           );
//                         }
//                         pages.push(
//                           <button
//                             key={totalPages}
//                             onClick={() => goToPage(totalPages)}
//                             disabled={isLoadingMore}
//                             className="px-4 py-2.5 min-w-[40px] bg-white border-2 border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md active:scale-95"
//                           >
//                             {totalPages}
//                           </button>
//                         );
//                       }

//                       return pages;
//                     })()}
//                   </div>

//                   {/* Next Button */}
//                   <button
//                     onClick={goToNextPage}
//                     disabled={currentPage === totalPages || isLoadingMore}
//                     className="px-5 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg hover:from-gray-100 hover:to-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md disabled:hover:shadow-sm active:scale-95"
//                   >
//                     <span>Next</span>
//                     <ChevronRight className="w-4 h-4" />
//                   </button>
//                 </div>

//                 {/* Pagination Info - Enhanced Styling */}
//                 <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
//                   <div className="flex items-center gap-2">
//                     <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
//                     <span className="text-sm font-medium text-gray-700">
//                       Page <span className="font-bold text-purple-600">{currentPage}</span> of <span className="font-bold text-purple-600">{totalPages}</span>
//                     </span>
//                   </div>
//                   {activeFilterTotalCount > 0 && (
//                     <span className="text-xs text-gray-500">
//                       • {displayedArtworks.length} on this page • {activeFilterTotalCount} total
//                     </span>
//                   )}
//                 </div>

//                 {/* Loading Indicator - Enhanced */}
//                 {/* {isLoadingMore && (
//                   <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
//                     <LoadingSpinner size="small" />
//                     <span className="text-sm font-medium text-blue-700">Loading page {currentPage}...</span>
//                   </div>
//                 )} */}
//               </div>
//             )}

//             {/* Fallback: Show simple info if only one page or no pagination needed */}
//             {viewMode === "unified" && totalPages <= 1 && (
//               <div className="flex flex-col items-center mt-8 gap-2">
//                 <div className="text-sm text-gray-600">
//                   Showing all {displayedArtworks.length} artworks
//                 </div>
//               </div>
//             )}
//           </>
//         )}
//       </div>

//     </div>
//   );
// };

// export default Explorer;

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import { Link } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { artworksAPI, recommendationAPI } from "../services/api";
import {
  Palette,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  FileText,
  Sparkles,
  History,
  TrendingUp,
  Wallet,
  CreditCard,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import toast from "react-hot-toast";
import { CurrencyConverter, ArtworkStatus } from "../utils/currencyUtils";
import { useImageProtection } from "../hooks/useImageProtection";
import ProtectedImage from "../components/common/ProtectedImage";
import { cacheService } from "../services/cacheService";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = "explorer_cache_";
const RECOMMENDATION_RETRY_LIMIT = 3;
const RETRY_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 2000;

// Feature flags – driven by env vars; fall back to true for safety.
const ENABLE_PROGRESSIVE_LOADING =
  import.meta.env.VITE_ENABLE_PROGRESSIVE_LOADING !== "false";
const ENABLE_CACHING =
  import.meta.env.VITE_ENABLE_CACHING !== "false";
const ENABLE_SKELETON_UI =
  import.meta.env.VITE_ENABLE_SKELETON_UI !== "false";

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY LOGGER  (no console noise in production)
// ─────────────────────────────────────────────────────────────────────────────

const log = (() => {
  if (import.meta.env.DEV) {
    return {
      info: (...a) => console.log(...a),
      warn: (...a) => console.warn(...a),
      error: (...a) => console.error(...a),
    };
  }
  return { info: () => { }, warn: () => { }, error: () => { } };
})();

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK UTILITIES  (pure functions – easy to unit-test)
// ─────────────────────────────────────────────────────────────────────────────

const normalizeNetworkKey = (network) => {
  const net = String(network || "").toLowerCase().trim();
  if (!net) return "";
  if (["algorand", "algo"].includes(net)) return "algorand";
  if (["wirefluid", "wire", "wire-fluid"].includes(net)) return "wirefluid";
  if (["sepolia", "ethereum", "eth", "mainnet"].includes(net)) return "sepolia";
  return net;
};

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE FILTER PREDICATE  (replaces 6 duplicated copies)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `artwork` should be shown for the given network.
 * Since the platform is now Solana-only, we strictly check for 'solana' network.
 */
const isArtworkVisibleOnNetwork = (artwork, selectedNetworkKey) => {
  if (!artwork) return false;
  
  // ✅ MANDATORY: Only show Solana artworks
  const artworkNetwork = normalizeNetworkKey(
    artwork.network || artwork.blockchain_network || artwork.chain
  );
  
  return artworkNetwork === "solana";
};

/**
 * Returns true if the artwork is eligible to be displayed in the explorer.
 * Single authoritative predicate used by every fetch and filter path.
 */
const isArtworkDisplayable = (artwork, selectedNetworkKey) => {
  if (!artwork) return false;
  if (artwork.is_for_sale === false) return false;
  return isArtworkVisibleOnNetwork(artwork, selectedNetworkKey);
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE SERVICE  (isolated – no UI logic)
// ─────────────────────────────────────────────────────────────────────────────

const explorerCache = {
  _buildKey(filter, networkKey, userId) {
    return `${CACHE_KEY_PREFIX}${filter}_${networkKey || "sepolia"}_${userId || "guest"}`;
  },

  get(filter, networkKey, userId) {
    if (!ENABLE_CACHING) return null;
    try {
      const key = this._buildKey(filter, networkKey, userId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { data, timestamp, version } = JSON.parse(raw);
      if (version !== "2.0") { localStorage.removeItem(key); return null; }
      if (Date.now() - timestamp >= CACHE_DURATION_MS) { localStorage.removeItem(key); return null; }
      log.info(`✅ Cache hit: ${key} (${Math.round((Date.now() - timestamp) / 1000)}s old)`);
      return data;
    } catch {
      return null;
    }
  },

  set(filter, networkKey, userId, data) {
    if (!ENABLE_CACHING || !data?.length) return;
    try {
      const key = this._buildKey(filter, networkKey, userId);
      localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), version: "2.0" }));
      log.info(`💾 Cached ${data.length} artworks: ${key}`);
    } catch (e) {
      if (e.name === "QuotaExceededError") this.clearAll();
    }
  },

  clearForUser(userId) {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_KEY_PREFIX) && k.endsWith(`_${userId || "guest"}`))
        .forEach((k) => localStorage.removeItem(k));
    } catch { }
  },

  clearAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_KEY_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
      log.info("🗑️ All explorer cache cleared");
    } catch { }
  },

  /** How old is the cache, in ms. Returns Infinity if not present. */
  ageMs(filter, networkKey, userId) {
    if (!ENABLE_CACHING) return Infinity;
    try {
      const key = this._buildKey(filter, networkKey, userId);
      const raw = localStorage.getItem(key);
      if (!raw) return Infinity;
      const { timestamp } = JSON.parse(raw);
      return Date.now() - timestamp;
    } catch {
      return Infinity;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION HELPER  (pure – replaces magic-number page branches)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given the full lists of recommended and regular artworks, returns the slice
 * that belongs on `page`. Recommended artworks appear first across pages,
 * then regular artworks fill remaining slots.
 *
 * All arithmetic is derived from `perPage` – no hard-coded page numbers.
 */
const getPageSlice = (recommendedList, otherList, page, perPage) => {
  const totalRec = recommendedList.length;

  // How many recommended fit on earlier pages?
  const recBeforePage = Math.min(totalRec, (page - 1) * perPage);
  // How many recommended appear on this page?
  const recOnPage = Math.min(totalRec - recBeforePage, perPage);
  const recSlice = recommendedList.slice(recBeforePage, recBeforePage + recOnPage);

  // Remaining slots filled with regular artworks
  const regularSlotsUsedBefore = Math.max(0, (page - 1) * perPage - recBeforePage);
  const regularStart = regularSlotsUsedBefore + Math.max(0, recBeforePage - (page - 2) * perPage - Math.min(totalRec, (page - 1) * perPage - recBeforePage));

  // Simpler calculation: count regular slots used on all previous pages
  let regularUsed = 0;
  for (let p = 1; p < page; p++) {
    const recBefore = Math.min(totalRec, (p - 1) * perPage);
    const recOnP = Math.min(totalRec - recBefore, perPage);
    regularUsed += perPage - recOnP;
  }

  const regularSlice = otherList.slice(regularUsed, regularUsed + (perPage - recOnPage));

  log.info(
    `📄 Page ${page}: ${recSlice.length} recommended + ${regularSlice.length} regular` +
    ` = ${recSlice.length + regularSlice.length} total`
  );

  return [...recSlice, ...regularSlice];
};

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

const deduplicateById = (artworks) => {
  const seen = new Set();
  return artworks.filter((a) => {
    if (!a) return false;
    const id = (a._id || a.id)?.toString();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────────────────────

const ArtworkSkeleton = () => (
  <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 animate-pulse">
    <div className="bg-gradient-to-br from-gray-200 to-gray-300 h-48"></div>
    <div className="p-6">
      <div className="flex justify-between items-start mb-2">
        <div className="h-5 bg-gray-200 rounded w-2/3"></div>
        <div className="h-5 bg-gray-200 rounded-full w-20"></div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-200 rounded w-full"></div>
        <div className="h-3 bg-gray-200 rounded w-4/5"></div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="h-10 bg-gray-200 rounded w-1/4"></div>
        <div className="h-10 bg-gray-200 rounded w-1/4"></div>
        <div className="h-10 bg-gray-200 rounded w-1/4"></div>
      </div>
      <div className="flex gap-2">
        <div className="h-10 bg-gray-200 rounded flex-1"></div>
        <div className="h-10 bg-gray-200 rounded w-16"></div>
        <div className="h-10 bg-gray-200 rounded w-20"></div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ARTWORK CARD  (memoized with complete field comparison)
// ─────────────────────────────────────────────────────────────────────────────

const ArtworkCard = memo(
  ({
    artwork,
    currentAccount,
    isRecommended,
    currentUserId,
    selectedNetwork,
    isAuthenticated,
    user,
  }) => {
    const [imageError, setImageError] = useState(false);

    // Ownership check – four independent signals, any one is sufficient.
    const isOwner = useMemo(() => {
      if (!isAuthenticated) return false;
      const isCryptoOwner =
        currentAccount &&
        artwork.owner_address &&
        currentAccount.toLowerCase() === artwork.owner_address.toLowerCase();
      const isPayPalOwner =
        currentUserId &&
        artwork.owner_id &&
        String(currentUserId).trim() === String(artwork.owner_id).trim();
      const isProfileWalletOwner =
        user?.wallet_address &&
        artwork.owner_address &&
        user.wallet_address.toLowerCase() === artwork.owner_address.toLowerCase();
      const isEmailOwner =
        user?.email &&
        artwork.owner_email &&
        user.email.toLowerCase() === artwork.owner_email.toLowerCase();
      return isCryptoOwner || isPayPalOwner || isProfileWalletOwner || isEmailOwner;
    }, [
      currentAccount,
      artwork.owner_address,
      artwork.owner_id,
      artwork.owner_email,
      currentUserId,
      isAuthenticated,
      user?.wallet_address,
      user?.email,
    ]);

    const imageUrl = useMemo(() => {
      const artworkId = artwork._id || artwork.id;
      if (!artworkId) return null;
      const base = (import.meta.env.VITE_BASE_URL_BACKEND || "").replace(/\/$/, "");
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      
      let url = `${base}/artwork/${artworkId}/thumbnail`;
      if (token) {
        url += `?auth=${encodeURIComponent(token)}`;
      }
      return url;
    }, [artwork._id, artwork.id, artwork.token_id]);

    const formatAddress = (address) => {
      if (!address) return "N/A";
      if (address.length <= 13) return address; // Already short (ID)
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

    const priceDisplay = useMemo(() => {
      if (artwork.price === undefined || artwork.price === null) return null;
      
      const isSolana = artwork.network === 'solana' || artwork.network === 'sol';
      const usdPrice = isSolana 
        ? CurrencyConverter.solToUsd(artwork.price)
        : CurrencyConverter.ethToUsd(artwork.price);
        
      return (
        <div className="text-center">
          <p className="text-xs text-gray-500">Price</p>
          <p className="text-sm font-semibold text-gray-900">
            {CurrencyConverter.formatCrypto(artwork.price, artwork.network)}
          </p>
          <p className="text-xs text-gray-400">
            ≈ {CurrencyConverter.formatUsd(usdPrice)}
          </p>
        </div>
      );
    }, [artwork.price, artwork.network]);

    const registrationBadge = useMemo(() => {
      const method = ArtworkStatus.getRegistrationMethod(artwork);
      if (method === "on-chain") {
        return (
          <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
            <Wallet className="w-3 h-3" /> On-chain
          </span>
        );
      }
      if (method === "competition") {
        return (
          <span className="absolute top-2 right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
            <Sparkles className="w-3 h-3" /> Competition Entry
          </span>
        );
      }
      return (
        <span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-20 whitespace-nowrap">
          <CreditCard className="w-3 h-3" /> Off-chain
        </span>
      );
    }, [artwork]);

    const artworkId = artwork._id || artwork.id;

    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-xl transition-all relative">
        {isRecommended && (
          <div className="absolute top-2 left-2 z-30">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center shadow-lg border-2 border-white">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
              FOR YOU
            </div>
          </div>
        )}

        <div
          className="bg-gray-100 h-48 flex items-center justify-center relative overflow-hidden image-container"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          {imageUrl ? (
            <>
              {registrationBadge}
              <div className="absolute top-10 right-2 z-20">
                <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-md">
                  <Database className="w-3 h-3 mr-1" /> DB
                </div>
              </div>
              <ProtectedImage
                imageUrl={imageUrl}
                alt={artwork.title || `Artwork ${artwork.token_id}`}
                className="w-full h-full"
                aspectRatio="auto"
                showToast={false}
                onError={() => setImageError(true)}
              />
              {imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
                  <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Image unavailable</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <Palette className="w-16 h-16 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Artwork #{artwork.token_id}</p>
              <p className="text-xs text-gray-400">{artwork.title}</p>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {artwork.title || `Artwork #${artwork.token_id}`}
            </h3>
            <span
              className={`px-2 py-1 text-xs rounded-full ${artwork.is_licensed
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
                }`}
            >
              {artwork.is_licensed ? "Licensed" : "Available"}
            </span>
          </div>

          <p className="text-sm text-gray-500 mb-4 line-clamp-2">
            {artwork.description || "No description available"}
          </p>

          <div className="flex justify-between items-center mb-4">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-500">Creator</p>
              <p
                className={`text-sm ${artwork.registration_method === "competition" && artwork.creator_name
                    ? "font-medium"
                    : "font-mono"
                  }`}
              >
                {artwork.registration_method === "competition" && artwork.creator_name
                  ? artwork.creator_name
                  : formatAddress(artwork.creator_solana_address || artwork.creator_address || artwork.creator_id)}
              </p>
            </div>

            {artwork.price && (
              <div className="text-center flex-1 mx-6">{priceDisplay}</div>
            )}

            <div className="text-center flex-1">
              <p className="text-xs text-gray-500">Royalty</p>
              <p className="text-sm font-semibold">
                {artwork.royalty_percentage
                  ? `${(artwork.royalty_percentage / 100).toFixed(2)}%`
                  : "N/A"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={`/artwork/${artworkId}`}
              className="flex-1 inline-flex items-center justify-center text-sm font-medium text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-3 py-2 hover:bg-purple-50 transition-colors"
            >
              View details <ArrowRight className="w-4 h-4 ml-1" />
            </Link>

            {isOwner ? (
              <div className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-lg">
                This is your artwork
              </div>
            ) : (
              <>
                <Link
                  to={`/sale/${artworkId}`}
                  className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Purchase this artwork"
                >
                  <ShoppingCart className="w-4 h-4 mr-1" /> Buy
                </Link>
                <Link
                  to={`/license/${artworkId}`}
                  className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  title="Purchase a license for this artwork"
                >
                  <FileText className="w-4 h-4 mr-1" /> License
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
  // Complete field comparison – every field rendered in the card is checked.
  (prev, next) => {
    return (
      prev.artwork._id === next.artwork._id &&
      prev.artwork.is_for_sale === next.artwork.is_for_sale &&
      prev.artwork.is_licensed === next.artwork.is_licensed &&
      prev.artwork.price === next.artwork.price &&
      prev.artwork.royalty_percentage === next.artwork.royalty_percentage &&
      prev.artwork.owner_id === next.artwork.owner_id &&
      prev.artwork.owner_address === next.artwork.owner_address &&
      prev.artwork.owner_email === next.artwork.owner_email &&
      prev.currentAccount === next.currentAccount &&
      prev.currentUserId === next.currentUserId &&
      prev.isRecommended === next.isRecommended &&
      prev.isAuthenticated === next.isAuthenticated &&
      prev.user?.wallet_address === next.user?.wallet_address &&
      prev.user?.email === next.user?.email
    );
  }
);

ArtworkCard.displayName = "ArtworkCard";

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION CONTROLS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PaginationControls = memo(({ currentPage, totalPages, isLoadingMore, onGoToPage }) => {
  const pages = useMemo(() => {
    const result = [];
    const maxVisible = 7;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
      result.push({ type: "page", num: 1 });
      if (start > 2) result.push({ type: "ellipsis", key: "start" });
    }
    for (let i = start; i <= end; i++) result.push({ type: "page", num: i });
    if (end < totalPages) {
      if (end < totalPages - 1) result.push({ type: "ellipsis", key: "end" });
      result.push({ type: "page", num: totalPages });
    }
    return result;
  }, [currentPage, totalPages]);

  return (
    <div className="flex flex-col items-center mt-12 mb-8 gap-6">
      <div className="flex items-center gap-3 flex-wrap justify-center bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <button
          onClick={() => onGoToPage(currentPage - 1)}
          disabled={currentPage === 1 || isLoadingMore}
          className="px-5 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg hover:from-gray-100 hover:to-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md disabled:hover:shadow-sm active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-2">
          {pages.map((item) =>
            item.type === "ellipsis" ? (
              <span key={`ellipsis-${item.key}`} className="px-2 text-gray-400 font-semibold">
                ...
              </span>
            ) : (
              <button
                key={item.num}
                onClick={() => onGoToPage(item.num)}
                disabled={isLoadingMore}
                className={`px-4 py-2.5 min-w-[40px] rounded-lg transition-all duration-200 text-sm font-semibold shadow-sm active:scale-95 ${item.num === currentPage
                    ? "bg-gradient-to-br from-purple-600 to-purple-700 !text-white hover:from-purple-700 hover:to-purple-800 shadow-md ring-2 ring-purple-300 ring-offset-2"
                    : "bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                  }`}
              >
                {item.num}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onGoToPage(currentPage + 1)}
          disabled={currentPage === totalPages || isLoadingMore}
          className="px-5 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg hover:from-gray-100 hover:to-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md disabled:hover:shadow-sm active:scale-95"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium text-gray-700">
          Page <span className="font-bold text-purple-600">{currentPage}</span> of{" "}
          <span className="font-bold text-purple-600">{totalPages}</span>
        </span>
      </div>
    </div>
  );
});

PaginationControls.displayName = "PaginationControls";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM HOOK: useExplorerData
// Owns all data-fetching, caching, recommendation, and pagination logic.
// Keeps Explorer component focused purely on rendering.
// ─────────────────────────────────────────────────────────────────────────────

function useExplorerData({
  account,
  selectedNetworkKey,
  isAuthenticated,
  user,
  effectiveUserId,
  activeRegistrationFilter,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [allArtworks, setAllArtworks] = useState([]);
  const [recommendedArtworks, setRecommendedArtworks] = useState([]);
  const [artworkCounts, setArtworkCounts] = useState({
    total: 0, on_chain: 0, off_chain: 0, crypto: 0, paypal: 0, competition: 0,
  });
  const [networkScopedTabCounts, setNetworkScopedTabCounts] = useState({
    all: null, onChain: null, offChain: null, competition: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasRecommendations, setHasRecommendations] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── Refs (never cause re-render, safe for async closures) ─────────────────
  const abortRef = useRef(new AbortController());
  const recAttemptsRef = useRef(0);
  const isFetchingRecsRef = useRef(false);
  const lastRecParamsRef = useRef(null);
  const isMountedRef = useRef(true);
  // Module-level variable for previous userId, avoiding window globals
  const prevUserIdRef = useRef(undefined);
  // Persists the last known good tab counts so filter switches never flash 0
  const stableCountsRef = useRef({ all: null, onChain: null, offChain: null, competition: null });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const safeSetAllArtworks = useCallback((artworks) => {
    if (!isMountedRef.current) return;
    setAllArtworks(artworks);
  }, []);

  const safeSetRecommended = useCallback((artworks) => {
    if (!isMountedRef.current) return;
    setRecommendedArtworks(artworks);
    setHasRecommendations(artworks.length > 0);
  }, []);

  // Build params for API calls based on the active registration filter.
  const buildFilterParams = useCallback(
    (extra = {}) => {
      const params = { ...extra };
      if (activeRegistrationFilter === "on-chain") params.is_on_chain = true;
      else if (activeRegistrationFilter === "off-chain") params.is_on_chain = false;
      else if (activeRegistrationFilter === "competition") params.registration_method = "competition";
      return params;
    },
    [activeRegistrationFilter]
  );

  // Translate UI filter to recommendation API param.
  // NOTE: Backend uses a legacy "payment_method" param name.
  // This mapping is isolated here so it's easy to update when the API is fixed.
  const recFilterParam = useMemo(() => {
    if (activeRegistrationFilter === "on-chain") return "crypto";
    if (activeRegistrationFilter === "off-chain") return "paypal";
    return null;
  }, [activeRegistrationFilter]);

  // ── Fetch artwork counts ───────────────────────────────────────────────────

  const fetchArtworkCounts = useCallback(async () => {
    try {
      const counts = await artworksAPI.getCounts();
      if (isMountedRef.current) setArtworkCounts(counts);
      return counts;
    } catch (err) {
      log.error("❌ Error fetching artwork counts:", err);
      return { total: 0, on_chain: 0, off_chain: 0, crypto: 0, paypal: 0, competition: 0 };
    }
  }, []);

  // ── Fetch a single page of artworks ───────────────────────────────────────

  const fetchPage = useCallback(
    async (page) => {
      const params = buildFilterParams({ page, size: ITEMS_PER_PAGE });
      const response = await artworksAPI.getAll(params);

      let artworks = [];
      if (Array.isArray(response)) artworks = response;
      else if (response?.data) artworks = Array.isArray(response.data) ? response.data : [];
      else if (response?.artworks) artworks = Array.isArray(response.artworks) ? response.artworks : [];
      else if (response?.results) artworks = Array.isArray(response.results) ? response.results : [];

      const hasNext = response?.has_next ?? artworks.length === ITEMS_PER_PAGE;

      // Update totalPages from response metadata when available
      if (response?.total !== undefined) {
        const pages = Math.ceil(response.total / ITEMS_PER_PAGE);
        if (isMountedRef.current) setTotalPages(pages);
      } else if (response?.count !== undefined) {
        const pages = Math.ceil(response.count / ITEMS_PER_PAGE);
        if (isMountedRef.current) setTotalPages(pages);
      }

      return {
        artworks: artworks.filter((a) => isArtworkDisplayable(a, selectedNetworkKey)),
        hasNext,
      };
    },
    [buildFilterParams, selectedNetworkKey]
  );

  // ── Fetch ALL artworks (all pages, parallel) ───────────────────────────────

  const fetchAllArtworksComplete = useCallback(async () => {
    try {
      const counts = await fetchArtworkCounts();
      const total = counts?.total || 0;
      if (total === 0) return [];

      const pageSize = 100;
      const pages = Math.ceil(total / pageSize);
      const fetches = Array.from({ length: pages }, (_, i) =>
        artworksAPI.getAll(buildFilterParams({ page: i + 1, size: pageSize }))
      );

      const responses = await Promise.all(fetches);
      const flat = responses.flatMap((r) => {
        if (Array.isArray(r)) return r;
        return r?.data || r?.artworks || r?.results || [];
      });

      const filtered = deduplicateById(
        flat.filter((a) => isArtworkDisplayable(a, selectedNetworkKey))
      );

      // Merge fresh counts into networkScopedTabCounts WITHOUT resetting other
      // tabs to null. This prevents the "flicker to 0 then correct" problem
      // when switching filters, because counts for the other tabs are preserved
      // from the last time they were fetched.
      if (isMountedRef.current) {
        setNetworkScopedTabCounts((prev) => {
          const next = { ...prev };

          if (activeRegistrationFilter === "all") {
            // "all" fetch gives us exact counts for every sub-tab at once
            next.all = filtered.length;
            next.onChain = filtered.filter((a) => ArtworkStatus.isOnChainArtwork(a)).length;
            next.competition = filtered.filter(
              (a) => ArtworkStatus.getRegistrationMethod(a) === "competition"
            ).length;
          } else if (activeRegistrationFilter === "on-chain") {
            next.onChain = filtered.length;
          } else if (activeRegistrationFilter === "competition") {
            next.competition = filtered.length;
          }

          // Derive "all" from sub-totals when all three are known
          if (
            next.all == null &&
            next.onChain != null &&
            next.competition != null
          ) {
            next.all = next.onChain + next.competition;
          }

          // Keep stable ref in sync so tabCounts always has a non-null baseline
          stableCountsRef.current = { ...next };
          return next;
        });
      }

      return filtered;
    } catch (err) {
      log.error("❌ fetchAllArtworksComplete error:", err);
      return [];
    }
  }, [buildFilterParams, fetchArtworkCounts, selectedNetworkKey, activeRegistrationFilter]);

  // ── Fetch recommendations ──────────────────────────────────────────────────

  const fetchRecommendations = useCallback(async () => {
    if (!effectiveUserId) {
      safeSetRecommended([]);
      return [];
    }
    // ✅ OPTIMIZATION: Prevent redundant or duplicate in-flight requests
    const currentParams = `${effectiveUserId}-${recFilterParam}`;
    if (isFetchingRecsRef.current && lastRecParamsRef.current === currentParams) {
      log.info("⏭️ Skipping duplicate recommendation request (already in flight)");
      return [];
    }

    try {
      isFetchingRecsRef.current = true;
      lastRecParamsRef.current = currentParams;

      const response = await recommendationAPI.getRecommendations(
        effectiveUserId,
        10,
        recFilterParam
      );

      let raw = [];
      if (response?.recommendations) {
        raw = [
          ...(response.recommendations.recommended_for_you || []),
          ...(response.recommendations.search_based || []),
          ...(response.recommendations.purchase_based || []),
          ...(response.recommendations.upload_based || []),
          ...(response.recommendations.view_based || []),
        ];
      } else if (response?.results) {
        raw = Array.isArray(response.results) ? response.results : [];
      } else if (Array.isArray(response)) {
        raw = response;
      }

      const valid = deduplicateById(raw).filter((a) =>
        isArtworkDisplayable(a, selectedNetworkKey)
      );

      log.info(`📊 Recommendations: ${raw.length} raw → ${valid.length} valid`);
      safeSetRecommended(valid);
      return valid;
    } catch (err) {
      if (err.response?.status !== 404 && err.response?.status !== 401) {
        log.warn("⚠️ Recommendations unavailable:", err.message);
      }
      safeSetRecommended([]);
      return [];
    } finally {
      isFetchingRecsRef.current = false;
    }
  }, [effectiveUserId, recFilterParam, selectedNetworkKey, safeSetRecommended]);

  // ── Listen for global cache invalidation ──────────────────────────────────

  useEffect(() => {
    const handler = () => {
      log.info("🔔 Cache invalidation received, re-fetching");
      setRefreshTrigger((n) => n + 1);
    };
    window.addEventListener("artwork-cache-invalidated", handler);
    return () => window.removeEventListener("artwork-cache-invalidated", handler);
  }, []);

  // ── Handle user change: clear stale cache ─────────────────────────────────

  useEffect(() => {
    const currentUserId = user?.id?.toString();
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = currentUserId;
      return;
    }
    const last = prevUserIdRef.current;
    if (currentUserId === last) return;

    if (currentUserId && last && currentUserId !== last) {
      explorerCache.clearForUser(last);
    } else if (!currentUserId && last) {
      // logged out – clear user caches
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_KEY_PREFIX) && !k.endsWith("_guest"))
        .forEach((k) => localStorage.removeItem(k));
    } else if (currentUserId && !last) {
      // logged in – clear guest cache
      explorerCache.clearForUser("guest");
    }
    prevUserIdRef.current = currentUserId;
  }, [user?.id]);

  // ── Main initialisation effect ────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    abortRef.current = new AbortController();
    let backgroundDone = false;

    const userId = user?.id;
    const filterKey = activeRegistrationFilter;

    const initialize = async () => {
      if (!isMountedRef.current) return;
      setIsLoading(true);

      // Step 1: Try cache
      const cached = explorerCache.get(filterKey, selectedNetworkKey, userId);
      if (cached?.length) {
        log.info(`⚡ Cache hit: ${cached.length} artworks`);
        safeSetAllArtworks(cached);
        setTotalPages(Math.max(1, Math.ceil(cached.length / ITEMS_PER_PAGE)));
        setArtworkCounts({
          total: cached.length,
          on_chain: cached.filter((a) => ArtworkStatus.isOnChainArtwork(a)).length,
          competition: cached.filter((a) => ArtworkStatus.getRegistrationMethod(a) === "competition").length,
          crypto: cached.filter((a) => ArtworkStatus.isOnChainArtwork(a)).length,
        });
        setCurrentPage(1);
        setIsLoading(false);

        // Fetch counts in background only if cache is stale (>2min)
        if (explorerCache.ageMs(filterKey, selectedNetworkKey, userId) > 2 * 60 * 1000) {
          fetchArtworkCounts().catch(() => { });
        }

        // Fetch recommendations in background
        if (effectiveUserId) {
          fetchRecommendations().catch(() => { });
        }
        return; // served from cache
      }

      // Step 2: Progressive load – show first page fast
      if (ENABLE_PROGRESSIVE_LOADING) {
        try {
          const { artworks: firstPage } = await fetchPage(1);
          if (!isMountedRef.current) return;

          if (firstPage.length > 0) {
            safeSetAllArtworks(firstPage);
            setCurrentPage(1);
            setIsLoading(false);

            // Recommendations in parallel with background load
            const recPromise = effectiveUserId
              ? fetchRecommendations().catch(() => [])
              : Promise.resolve([]);

            // Step 3: Background load – full dataset
            if (!backgroundDone) {
              backgroundDone = true;
              fetchAllArtworksComplete()
                .then((full) => {
                  if (!isMountedRef.current || !full.length) return;
                  safeSetAllArtworks(full);
                  setTotalPages(Math.max(1, Math.ceil(full.length / ITEMS_PER_PAGE)));
                  explorerCache.set(filterKey, selectedNetworkKey, userId, full);
                })
                .catch((err) => log.error("❌ Background load failed:", err));
            }

            await recPromise;
            return;
          }
        } catch (err) {
          log.warn("⚠️ First-page fetch failed, falling back to full fetch:", err.message);
        }
      }

      // Fallback: full fetch
      try {
        const full = await fetchAllArtworksComplete();
        if (!isMountedRef.current) return;
        if (full.length) {
          safeSetAllArtworks(full);
          setTotalPages(Math.max(1, Math.ceil(full.length / ITEMS_PER_PAGE)));
          setCurrentPage(1);
          explorerCache.set(filterKey, selectedNetworkKey, userId, full);
          setIsLoading(false);
          if (effectiveUserId) fetchRecommendations().catch(() => { });
        } else {
          throw new Error("No artworks returned");
        }
      } catch (err) {
        log.error("❌ Explorer initialization failed:", err);
        if (isMountedRef.current) {
          safeSetAllArtworks([]);
          safeSetRecommended([]);
          explorerCache.clearAll();
          setIsLoading(false);
          toast.error("Failed to load artworks. Please refresh the page.");
        }
      }
    };

    initialize();

    return () => {
      isMountedRef.current = false;
      abortRef.current.abort();
      backgroundDone = true;
    };
  }, [
    user?.id,
    isAuthenticated,
    account,
    activeRegistrationFilter,
    selectedNetworkKey,
    refreshTrigger,
  ]);

  // ── Retry recommendations (up to RECOMMENDATION_RETRY_LIMIT times) ────────

  useEffect(() => {
    if (
      !isAuthenticated ||
      !effectiveUserId ||
      !allArtworks.length ||
      hasRecommendations ||
      recAttemptsRef.current >= RECOMMENDATION_RETRY_LIMIT
    ) return;

    recAttemptsRef.current += 1;
    const timer = setTimeout(() => {
      fetchRecommendations().catch(() => { });
    }, RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, effectiveUserId, allArtworks.length, hasRecommendations]);

  // ── Fallback: force refetch if still empty after timeout ──────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoading && allArtworks.length === 0) {
        log.warn(`⚠️ No artworks after ${RETRY_TIMEOUT_MS}ms, forcing refetch`);
        explorerCache.clearAll();
        setRefreshTrigger((n) => n + 1);
      }
    }, RETRY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []); // intentionally runs once on mount

  // ── goToPage ──────────────────────────────────────────────────────────────

  const goToPage = useCallback(
    async (page) => {
      if (
        isLoadingMore ||
        page < 1 ||
        page > totalPages ||
        page === currentPage
      ) return;

      setIsLoadingMore(true);
      window.scrollTo({ top: 0, behavior: "smooth" });

      try {
        if (!allArtworks.length) {
          const full = await fetchAllArtworksComplete();
          safeSetAllArtworks(full);
          setTotalPages(Math.max(1, Math.ceil(full.length / ITEMS_PER_PAGE)));
        }
        setCurrentPage(page);
      } catch (err) {
        log.error("Failed to load page:", err);
        toast.error("Failed to load page");
      } finally {
        setIsLoadingMore(false);
      }
    },
    [isLoadingMore, currentPage, totalPages, allArtworks.length, fetchAllArtworksComplete, safeSetAllArtworks]
  );

  return {
    allArtworks,
    recommendedArtworks,
    artworkCounts,
    networkScopedTabCounts,
    stableCountsRef,
    isLoading,
    hasRecommendations,
    totalPages,
    currentPage,
    isLoadingMore,
    fetchRecommendations,
    fetchAllArtworksComplete,
    fetchAllArtworks: fetchPage,
    fetchArtworkCounts,
    setAllArtworks: safeSetAllArtworks,
    goToPage,
    setCurrentPage,
    setTotalPages,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM HOOK: useArtworkFilter
// Owns all client-side filter/search/reorder logic.
// ─────────────────────────────────────────────────────────────────────────────

function useArtworkFilter({
  allArtworks,
  recommendedArtworks,
  currentPage,
  activeRegistrationFilter,
  filters,
  selectedNetworkKey,
}) {
  const recommendedIdsSet = useMemo(() => {
    const ids = new Set();
    recommendedArtworks.forEach((a) => {
      const id = (a._id || a.id)?.toString();
      if (id) ids.add(id);
    });
    return ids;
  }, [recommendedArtworks]);

  /**
   * Derives the displayed artwork slice for the given page.
   * Pure function – no state reads, no side effects.
   *
   * @param {object[]} artworks - full artwork list
   * @param {Set<string>} recIds - set of recommended IDs
   * @param {number} page
   * @param {string} registrationFilter
   * @param {{ licensed: string, royalty: string }} uiFilters
   * @param {string} networkKey
   * @returns {object[]}
   */
  const computeDisplayed = useCallback(
    (artworks, recIds, page, registrationFilter, uiFilters, networkKey) => {
      // 1. Base displayability filter (is_for_sale + network)
      let eligible = artworks.filter((a) => isArtworkDisplayable(a, networkKey));

      // 2. Deduplicate
      eligible = deduplicateById(eligible);

      // 3. Registration method filter for non-recommended items
      if (registrationFilter !== "all") {
        eligible = eligible.filter((a) => {
          const id = (a._id || a.id)?.toString();
          const isRec = id && recIds.has(id);
          if (isRec) return true; // preserve recommended regardless of filter
          if (registrationFilter === "on-chain") return ArtworkStatus.isOnChainArtwork(a);
          if (registrationFilter === "off-chain") return ArtworkStatus.isOffChainArtwork(a);
          if (registrationFilter === "competition")
            return ArtworkStatus.getRegistrationMethod(a) === "competition";
          return true;
        });
      }

      // 4. UI filters (licensed, royalty)
      if (uiFilters.licensed !== "all") {
        const want = uiFilters.licensed === "licensed";
        eligible = eligible.filter((a) => a?.is_licensed === want);
      }
      if (uiFilters.royalty !== "all") {
        eligible = eligible.filter((a) => {
          if (!a?.royalty_percentage) return false;
          const r = a.royalty_percentage / 100;
          if (uiFilters.royalty === "low") return r < 5;
          if (uiFilters.royalty === "medium") return r >= 5 && r < 15;
          if (uiFilters.royalty === "high") return r >= 15;
          return true;
        });
      }

      // 5. Split into recommended vs regular, then get page slice
      const recList = [];
      const otherList = [];
      eligible.forEach((a) => {
        const id = (a._id || a.id)?.toString();
        if (id && recIds.has(id)) recList.push(a);
        else otherList.push(a);
      });

      return getPageSlice(recList, otherList, page, ITEMS_PER_PAGE);
    },
    []
  );

  const displayedArtworks = useMemo(
    () =>
      computeDisplayed(
        allArtworks,
        recommendedIdsSet,
        currentPage,
        activeRegistrationFilter,
        filters,
        selectedNetworkKey
      ),
    [
      allArtworks,
      recommendedIdsSet,
      currentPage,
      activeRegistrationFilter,
      filters,
      selectedNetworkKey,
      computeDisplayed,
    ]
  );

  const isRecommended = useCallback(
    (id) => {
      if (!id) return false;
      return recommendedIdsSet.has(id.toString());
    },
    [recommendedIdsSet]
  );

  return { displayedArtworks, isRecommended, recommendedIdsSet };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPLORER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const Explorer = () => {
  const { account, isCorrectNetwork, selectedNetwork } = useWeb3();
  const { isAuthenticated, user } = useAuth();

  useImageProtection(true);

  // ── Derived values ─────────────────────────────────────────────────────────

  // ✅ MANDATORY: Platform is now Solana-only
  const selectedNetworkKey = "solana";

  const effectiveUserId = useMemo(() => {
    if (user?.id) return user.id;
    if (user?._id) return user._id;
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const id = payload.userId || payload.user_id || payload.sub || payload.id;
        if (id) return id;
      } catch { }
    }
    if (account) return account.toLowerCase();
    return null;
  }, [user?.id, user?._id, account]);

  // ── Local UI state ─────────────────────────────────────────────────────────

  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ licensed: "all", royalty: "all" });
  const [viewMode, setViewMode] = useState("unified"); // "unified" | "search"
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const activeRegistrationFilter = "all";

  // ── Data hook ──────────────────────────────────────────────────────────────

  const {
    allArtworks,
    recommendedArtworks,
    artworkCounts,
    networkScopedTabCounts,
    stableCountsRef,
    isLoading,
    hasRecommendations,
    totalPages,
    currentPage,
    isLoadingMore,
    goToPage,
    fetchRecommendations,
    fetchAllArtworksComplete,
    fetchArtworkCounts,
    setAllArtworks,
    setCurrentPage,
    setTotalPages,
  } = useExplorerData({
    account,
    selectedNetworkKey,
    isAuthenticated,
    user,
    effectiveUserId,
    activeRegistrationFilter,
  });

  // ── Filter hook ────────────────────────────────────────────────────────────

  const sourceArtworks = viewMode === "search" ? searchResults : allArtworks;
  const { displayedArtworks, isRecommended } = useArtworkFilter({
    allArtworks: sourceArtworks,
    recommendedArtworks: viewMode === "search" ? [] : recommendedArtworks,
    currentPage: viewMode === "search" ? 1 : currentPage,
    activeRegistrationFilter: viewMode === "search" ? "all" : activeRegistrationFilter,
    filters,
    selectedNetworkKey,
  });

  // ── Derived counts ─────────────────────────────────────────────────────────
  //
  // Strategy: tabCounts always reads from `networkScopedTabCounts` (live React
  // state) BUT falls back to `stableCountsRef.current` when a particular slot
  // is still null (i.e. we haven't fetched that filter yet in this session).
  // `stableCountsRef` is never reset to null — it only ever gains new values —
  // so switching filters never causes the badges to flash 0 or disappear.

  const tabCounts = useMemo(() => {
    // Live values (updated after each full-dataset fetch)
    const live = networkScopedTabCounts;
    // Last-known-good values (never reset to null)
    const stable = stableCountsRef.current;

    // Resolve each slot: prefer live, fall back to stable, then API counts
    const resolveOnChain = () =>
      live.onChain ?? stable.onChain ?? Number(artworkCounts.on_chain || artworkCounts.crypto || 0);
    const resolveOffChain = () =>
      live.offChain ?? stable.offChain ?? Number(artworkCounts.off_chain || artworkCounts.paypal || 0);
    const resolveCompetition = () =>
      live.competition ?? stable.competition ?? Number(artworkCounts.competition || 0);
    const resolveAll = () => {
      if (live.all != null) return live.all;
      if (stable.all != null) return stable.all;
      const oc = resolveOnChain();
      const off = resolveOffChain();
      const comp = resolveCompetition();
      const fromCounts = Number(artworkCounts.total || 0);
      return Math.max(fromCounts, oc + off + comp) || 0;
    };

    const all = resolveAll();
    const onChain = resolveOnChain();
    const offChain = resolveOffChain();
    const competition = resolveCompetition();

    return { all, onChain, offChain, competition };
  }, [networkScopedTabCounts, artworkCounts]);

  // activeFilterTotalCount: the correct total for the currently selected tab
  const activeFilterTotalCount = useMemo(() => {
    if (activeRegistrationFilter === "on-chain") return tabCounts.onChain;
    if (activeRegistrationFilter === "off-chain") return tabCounts.offChain;
    if (activeRegistrationFilter === "competition") return tabCounts.competition;
    return tabCounts.all;
  }, [activeRegistrationFilter, tabCounts]);

  const activeFilterLabel = useMemo(() => {
    if (activeRegistrationFilter === "all") return "all artworks";
    return activeRegistrationFilter;
  }, [activeRegistrationFilter]);

  // ── Search ─────────────────────────────────────────────────────────────────

  const performLocalSearch = useCallback(
    (query) => {
      const lower = query.toLowerCase();
      return allArtworks.filter((a) => {
        if (!isArtworkDisplayable(a, selectedNetworkKey)) return false;
        return (
          (a.title || "").toLowerCase().includes(lower) ||
          (a.description || "").toLowerCase().includes(lower) ||
          (a.creator_address || "").toLowerCase().includes(lower) ||
          (a.token_id?.toString() || "").includes(query)
        );
      });
    },
    [allArtworks, selectedNetworkKey]
  );

  const performSearch = useCallback(
    async (query) => {
      if (!query.trim()) {
        setViewMode("unified");
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const response = await recommendationAPI.searchArtworks(query, 10);
        const results = (response.results || []).filter((a) =>
          isArtworkDisplayable(a, selectedNetworkKey)
        );
        setViewMode("search");
        setSearchResults(results);
        toast.success(
          results.length ? `Found ${results.length} artworks` : "No artworks found"
        );
      } catch {
        log.error("Search API failed, falling back to local");
        const local = performLocalSearch(query);
        setViewMode("search");
        setSearchResults(local);
        toast.success(local.length ? `Found ${local.length} artworks` : "No artworks found");
      } finally {
        setIsSearching(false);
      }
    },
    [selectedNetworkKey, performLocalSearch]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim()) {
        performSearch(searchTerm);
      } else if (viewMode === "search") {
        setViewMode("unified");
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedNetworkKey]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleArtworkClick = useCallback(
    (artworkId) => {
      if (effectiveUserId) {
        recommendationAPI.trackArtworkView(artworkId).catch(() => { });
      }
    },
    [effectiveUserId]
  );

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setFilters({ licensed: "all", royalty: "all" });
    setViewMode("unified");
    setSearchResults([]);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos-373965/pexels-photo-373965.jpeg?auto=compress&cs=tinysrgb&w=1600')",
          }}
        ></div>
        <div className="relative max-w-4xl mx-auto py-20 px-6 text-center">
          <h1 className="text-4xl font-extrabold text-white mb-4">
            Solana Artwork Explorer
          </h1>
          <p className="text-lg text-purple-100 max-w-2xl mx-auto">
            Discover exclusive Solana artworks with AI-powered recommendations and search.
          </p>
          <p className="text-md text-purple-200 mt-2">
            {viewMode === "search"
              ? `Search results for "${searchTerm}"`
              : hasRecommendations
                ? `${recommendedArtworks.length} personalized recommendations • ${activeFilterTotalCount} total artworks available`
                : isAuthenticated
                  ? `${activeFilterTotalCount} artworks in our collection • Explore to get recommendations!`
                  : `${activeFilterTotalCount} artworks in our collection • Sign in for personalized recommendations`}
          </p>
          {isAuthenticated && (
            <div className="mt-6">
              <Link
                to="/dashboard/upload"
                className="inline-flex items-center px-8 py-3 text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-md"
              >
                Register Artwork
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations banner (page 1 only) */}
      {hasRecommendations && viewMode === "unified" && currentPage === 1 ? (
        <div className="max-w-6xl mx-auto px-6 mt-8 mb-4">
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center text-purple-800">
              <Sparkles className="w-5 h-5 mr-2" />
              <span className="font-medium">
                Showing {recommendedArtworks.length} personalized recommendations (
                {activeFilterLabel}) first, followed by other artworks
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8"></div>
      )}

      {/* Search + Filters */}
      <div className="max-w-6xl mx-auto px-6 mb-8">
        <div className="bg-white p-4 sm:p-5 rounded-xl shadow-md border border-gray-200">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1 shrink-0">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="h-5 w-5 text-gray-600" />
              </div>
              <input
                type="text"
                placeholder="Search by title, description, creator, or token ID..."
                className="block w-full h-12 pl-10 pr-10 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  <LoadingSpinner size="small" />
                </div>
              )}
            </div>


            {/* License + Royalty dropdowns */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                className="text-sm border border-gray-400 rounded-md px-3 py-2 bg-white h-11 w-[145px]"
                value={filters.licensed}
                onChange={(e) => setFilters((f) => ({ ...f, licensed: e.target.value }))}
              >
                <option value="all">All Licenses</option>
                <option value="licensed">Licensed Only</option>
                <option value="unlicensed">Unlicensed Only</option>
              </select>
              <select
                className="text-sm border border-gray-400 rounded-md px-3 py-2 bg-white h-11 w-[145px]"
                value={filters.royalty}
                onChange={(e) => setFilters((f) => ({ ...f, royalty: e.target.value }))}
              >
                <option value="all">All Royalties</option>
                <option value="low">Low (&lt;5%)</option>
                <option value="medium">Medium (5-15%)</option>
                <option value="high">High (&gt;15%)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Artwork Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        {isLoading ? (
          ENABLE_SKELETON_UI ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <ArtworkSkeleton key={`skeleton-${i}`} />
              ))}
            </div>
          ) : (
            <div className="flex justify-center p-12">
              <LoadingSpinner size="large" />
            </div>
          )
        ) : displayedArtworks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {viewMode === "search"
                ? `No artworks found for "${searchTerm}"`
                : "No artworks found matching your criteria"}
            </p>
            <button
              onClick={resetFilters}
              className="text-purple-600 hover:text-purple-800 font-medium"
            >
              {viewMode === "search" ? "Clear search" : "Clear all filters"}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {displayedArtworks.map((artwork) => {
                const artworkId = artwork._id || artwork.id;
                return (
                  <div key={artworkId} onClick={() => handleArtworkClick(artworkId)}>
                    <ArtworkCard
                      artwork={artwork}
                      currentAccount={account}
                      isRecommended={isRecommended(artworkId)}
                      currentUserId={effectiveUserId}
                      selectedNetwork={selectedNetwork}
                      isAuthenticated={isAuthenticated}
                      user={user}
                    />
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {viewMode === "unified" && totalPages > 1 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                isLoadingMore={isLoadingMore}
                onGoToPage={goToPage}
              />
            )}

            {viewMode === "unified" && totalPages <= 1 && (
              <div className="flex flex-col items-center mt-8">
                <p className="text-sm text-gray-600">
                  Showing all {displayedArtworks.length} artworks
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Explorer;