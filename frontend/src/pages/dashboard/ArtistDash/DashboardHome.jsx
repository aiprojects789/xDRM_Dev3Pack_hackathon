import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import BoxCard from '../../../components/dashboard/BoxCard';
import { artworksAPI, licensesAPI, transactionsAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Info, Shield } from 'lucide-react';
import { useWeb3 } from '../../../context/Web3Context';
import { UserIdentifier, CurrencyConverter } from '../../../utils/currencyUtils';

// Simple in-memory cache with TTL (Time To Live)
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache

const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

const setCachedData = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

// Memoized Stat Card component to prevent unnecessary re-renders
const StatCard = React.memo(({ stat, index }) => (
  <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition-all duration-200">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-purple-600 text-sm font-medium">{stat.label}</p>
        {stat.loading ? (
          <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-2"></div>
        ) : (
          <p className="text-2xl font-bold text-gray-800 mt-2">{stat.value}</p>
        )}
      </div>
      <div className="bg-purple-100 p-3 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {index === 0 ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          ) : index === 1 ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          )}
        </svg>
      </div>
    </div>
    <div className="mt-4">
      <div className="flex items-center">
        <div className={`h-2 rounded-full ${index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-purple-500' : 'bg-indigo-500'} w-full`}>
          <div 
            className={`h-2 rounded-full ${index === 0 ? 'bg-blue-300' : index === 1 ? 'bg-purple-300' : 'bg-indigo-300'}`}
            style={{ width: `${Math.min(100, ((stat.numericValue || stat.value) / (index === 0 ? 50 : index === 1 ? 10000 : 100)) * 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  </div>
));

StatCard.displayName = 'StatCard';

const DashboardHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { account, isCorrectNetwork, balance, selectedNetwork } = useWeb3();

  const [stats, setStats] = useState([
    { label: 'Total Artworks Uploaded', value: 0, loading: true },
    { label: 'Total Earning', value: '$0', loading: true },
    { label: 'Active Licenses', value: 0, loading: true },
  ]);
  const [boxStats, setBoxStats] = useState({
    artworks: { value: 0, loading: true },
    licenses: { value: 0, loading: true },
    activeLicenses: { value: 0, loading: true },
    piracy: { value: 0, loading: false }
  });
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);

  // Get user identifier - memoized to prevent recalculations
  const userIdentifier = useMemo(() => UserIdentifier.getUserIdentifier(user), [user]);
  const availablePaymentMethods = useMemo(() => UserIdentifier.getAvailablePaymentMethods(user), [user]);
  const hasWallet = useMemo(() => UserIdentifier.hasWalletAddress(user), [user]);
  const hasPayPal = useMemo(() => UserIdentifier.hasPaymentMethod(user, "paypal"), [user]);

  // Optimized data fetching with progressive updates
  const fetchDashboardData = useCallback(async (skipCache = false) => {
    if (!userIdentifier || isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    const cacheKey = `dashboard-${userIdentifier}`;
    
    try {
      setError(null);
      
      // Check cache first (unless explicitly skipping)
      if (!skipCache) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setStats(cached.stats);
          setBoxStats(cached.boxStats);
          isFetchingRef.current = false;
          return;
        }
      }

      console.log(`📊 Fetching dashboard data for: ${userIdentifier}`);

      // Progressive loading: Start with artworks (fastest) and show partial UI
      // Fetch artworks first (only count needed)
      const artworksPromise = artworksAPI.getByCreator(userIdentifier, { page: 1, size: 1 });
      
      // Update artworks immediately when ready
      artworksPromise.then(artworksResponse => {
        const totalArtworks = artworksResponse?.total || 0;
        setStats(prev => prev.map((stat, idx) => 
          idx === 0 ? { ...stat, value: totalArtworks, loading: false } : stat
        ));
        setBoxStats(prev => ({ ...prev, artworks: { value: totalArtworks, loading: false } }));
      }).catch(err => {
        console.error('❌ Artworks fetch failed:', err);
        setStats(prev => prev.map((stat, idx) => 
          idx === 0 ? { ...stat, loading: false } : stat
        ));
        setBoxStats(prev => ({ ...prev, artworks: { loading: false } }));
      });

      // Fetch licenses and transactions in parallel (but don't block UI)
      const [artworksResponse, licensesResponse, transactionsResponse] = await Promise.allSettled([
        artworksPromise,
        licensesAPI.getByUser(userIdentifier, { as_licensee: false }),
        transactionsAPI.getByUser(userIdentifier)
      ]);

      // Process artworks data
      let totalArtworks = 0;
      if (artworksResponse.status === 'fulfilled') {
        totalArtworks = artworksResponse.value.total || 0;
      }

      // Process licenses data
      let activeLicenses = 0;
      let totalLicenses = 0;
      if (licensesResponse.status === 'fulfilled') {
        const licensesData = licensesResponse.value.data || licensesResponse.value.licenses || [];
        totalLicenses = licensesResponse.value.total || licensesData.length || 0;
        
        // Optimized: Use reduce instead of filter + length for better performance
        activeLicenses = licensesData.reduce((count, license) => {
          const isActive = license.is_active !== false;
          return count + (isActive ? 1 : 0);
        }, 0);
        
        // Update licenses stats progressively
        setStats(prev => prev.map((stat, idx) => 
          idx === 2 ? { ...stat, value: activeLicenses, loading: false } : stat
        ));
        setBoxStats(prev => ({
          ...prev,
          licenses: { value: totalLicenses, loading: false },
          activeLicenses: { value: activeLicenses, loading: false }
        }));
      } else {
        console.error('❌ Licenses fetch failed:', licensesResponse.reason);
        setStats(prev => prev.map((stat, idx) => 
          idx === 2 ? { ...stat, loading: false } : stat
        ));
        setBoxStats(prev => ({
          ...prev,
          licenses: { ...prev.licenses, loading: false },
          activeLicenses: { ...prev.activeLicenses, loading: false }
        }));
      }

      // Process transactions data
      let formattedEarnings = '$0';
      let totalUsdEstimate = 0;
      
      if (transactionsResponse.status === 'fulfilled') {
        const transactionsData = transactionsResponse.value.data || [];
        
        const activeSymbol = CurrencyConverter.getSymbol(selectedNetwork);
        const earningsByCurrency = {};
        
        // Include SALE, ROYALTY_PAYMENT, and our new LICENSE_PAYMENT type
        const earningTypes = ['ROYALTY_PAYMENT', 'SALE', 'LICENSE_PAYMENT'];
        
        transactionsData.forEach(tx => {
          if (earningTypes.includes(tx.transaction_type) && tx.status === 'CONFIRMED') {
            let val = parseFloat(tx.value) || 0;
            let currency = tx.currency;
            
            // HEURISTIC: Handle legacy Wei/MicroAlgo values if they are in 'huge' units
            // 2.32 ETH in Wei is 2.32 * 10^18. 1 ETH is 10^18.
            if (val > 1000000000) { // If value is greater than 1 billion, it's likely Wei or MicroAlgos
               if (!currency || currency === 'ETH' || currency === 'WIRE' || currency === 'sepolia') {
                  val = val / 1000000000000000000; // Convert Wei to ETH
               } else if (currency === 'ALGO') {
                  val = val / 1000000; // Convert MicroAlgos to ALGO
               }
            }

            // Fallback for older transactions
            if (!currency) {
              if (tx.payment_method === 'paypal') currency = 'USD';
              else if (tx.network === 'algorand') currency = 'ALGO';
              else if (tx.network === 'wirefluid' || tx.network === 'wire') currency = 'WIRE';
              else if (tx.network === 'sepolia' || tx.network === 'ethereum') currency = 'ETH';
              else currency = 'ETH'; 
            }

            // Determine if the current user is the actual earner in this transaction
            // 1. In new/standard format: user is to_user_id or to_address
            const isRecipient = 
              tx.to_user_id === userIdentifier || 
              (user?.wallet_address && tx.to_address && String(tx.to_address).toLowerCase() === String(user.wallet_address).toLowerCase());
            
            // 2. In legacy SALE format: user (artist) was often stored in from_user_id
            const isLegacySeller = 
              tx.transaction_type === 'SALE' && 
              (tx.from_user_id === userIdentifier || (user?.wallet_address && tx.from_address && String(tx.from_address).toLowerCase() === String(user.wallet_address).toLowerCase()));

            if (isRecipient || isLegacySeller) {
              // FILTER: Only include if it matches active network's symbol OR it's USD
              if (currency === activeSymbol || currency === 'USD') {
                earningsByCurrency[currency] = (earningsByCurrency[currency] || 0) + val;
                
                // Estimate USD for progress bar
                if (currency === 'USD') totalUsdEstimate += val;
                else if (currency === 'ALGO') totalUsdEstimate += (val * 0.15); 
                else totalUsdEstimate += (val * 2500);
              } else {
                console.log(`ℹ️ Skipping earning in ${currency} (Active: ${activeSymbol})`, tx);
              }
            }
          }
        });
        
        console.log('📊 Earnings breakdown:', earningsByCurrency);
        
        // Ensure we always have at least the active symbol and USD in the map (even if 0)
        if (!earningsByCurrency[activeSymbol]) earningsByCurrency[activeSymbol] = 0;
        if (!earningsByCurrency['USD']) earningsByCurrency['USD'] = 0;
        
        // Build formatted string for separate display (Always show active network + USD)
        const sortedCurrencies = [activeSymbol, 'USD'];
        // Also add any other currencies found (e.g. if ALGO transactions exist while on Sepolia)
        Object.keys(earningsByCurrency).forEach(c => {
          if (!sortedCurrencies.includes(c)) sortedCurrencies.push(c);
        });

        const earningsParts = sortedCurrencies
          .filter(currency => {
            // Always show active network and USD, hide others if they are 0
            if (currency === activeSymbol || currency === 'USD') return true;
            return earningsByCurrency[currency] > 0;
          })
          .map(currency => {
            const amount = earningsByCurrency[currency] || 0;
            if (currency === 'USD') return CurrencyConverter.formatUsd(amount);
            if (currency === 'ALGO') return `${amount.toFixed(2)} ALGO`;
            return `${amount.toFixed(4)} ${currency}`;
          });
        
        formattedEarnings = earningsParts.length > 0 ? earningsParts.join(' + ') : `$0.00`;
        
        // Update earnings stat progressively
        setStats(prev => prev.map((stat, idx) => 
          idx === 1 ? { ...stat, value: formattedEarnings, numericValue: totalUsdEstimate, loading: false } : stat
        ));
      } else {
        console.error('❌ Transactions fetch failed:', transactionsResponse.reason);
        setStats(prev => prev.map((stat, idx) => 
          idx === 1 ? { ...stat, loading: false } : stat
        ));
      }



      // Cache the final results using already calculated values
      const finalStats = [
        { label: 'Total Artworks Uploaded', value: totalArtworks, loading: false },
        { label: 'Total Earning', value: formattedEarnings, numericValue: totalUsdEstimate, loading: false },
        { label: 'Active Licenses', value: activeLicenses, loading: false }
      ];
      
      const finalBoxStats = {
        artworks: { value: totalArtworks, loading: false },
        licenses: { value: totalLicenses, loading: false },
        activeLicenses: { value: activeLicenses, loading: false },
        piracy: { value: 0, loading: false }
      };
      
      setCachedData(cacheKey, { stats: finalStats, boxStats: finalBoxStats });
      
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
      
      // Set loading to false for all stats on error
      setStats(prev => prev.map(stat => ({ ...stat, loading: false })));
      setBoxStats(prev => ({
        artworks: { ...prev.artworks, loading: false },
        licenses: { ...prev.licenses, loading: false },
        activeLicenses: { ...prev.activeLicenses, loading: false },
        piracy: { ...prev.piracy, loading: false }
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [userIdentifier, hasWallet, hasPayPal, selectedNetwork]);

  useEffect(() => {
    if (userIdentifier) {
      fetchDashboardData();
    }
  }, [userIdentifier, fetchDashboardData]);

  const refreshData = useCallback(async () => {
    setStats(prev => prev.map(stat => ({ ...stat, loading: true })));
    setBoxStats(prev => ({
      artworks: { ...prev.artworks, loading: true },
      licenses: { ...prev.licenses, loading: true },
      activeLicenses: { ...prev.activeLicenses, loading: true },
      piracy: { ...prev.piracy, loading: false }
    }));
    setError(null);
    
    // Force refresh by skipping cache
    await fetchDashboardData(true);
  }, [fetchDashboardData]);

  // Memoized loading state check
  const isLoading = useMemo(() => {
    return stats.some(stat => stat.loading) || 
           Object.values(boxStats).some(box => box.loading);
  }, [stats, boxStats]);

  // Memoize payment methods display
  const paymentMethodsDisplay = useMemo(() => {
    return availablePaymentMethods.length > 0 
      ? availablePaymentMethods.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')
      : 'None';
  }, [availablePaymentMethods]);

  // Memoize box card props to prevent unnecessary re-renders
  const boxCardProps = useMemo(() => ({
    artworks: {
      title: "Total Artworks Uploaded",
      count: boxStats.artworks.loading ? '...' : boxStats.artworks.value.toString(),
      color: "blue",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    licenses: {
      title: "Total Licenses Earned",
      count: boxStats.licenses.loading ? '...' : boxStats.licenses.value.toString(),
      color: "purple",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    activeLicenses: {
      title: "Active Licenses Detected",
      count: boxStats.activeLicenses.loading ? '...' : boxStats.activeLicenses.value.toString(),
      color: "indigo",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    piracy: {
      title: "Piracy Cases Detected",
      count: boxStats.piracy.value.toString(),
      color: "gray",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    }
  }), [boxStats]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-purple-900">Dashboard Overview</h1>
            <p className="text-purple-700 mt-2">Welcome back! Here's your creative portfolio summary.</p>
            {/* User Type Indicator */}
            <p className="text-sm text-purple-600 mt-1">
              Available Methods: {paymentMethodsDisplay}
            </p>
          </div>
          <button 
            onClick={refreshData}
            className="mt-4 md:mt-0 flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-white">Refresh Data</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md">
            <p className="font-medium">Error loading data</p>
            <p>{error}</p>
            <button 
              onClick={refreshData}
              className="mt-2 text-red-800 underline font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {/* Stats Cards - Using memoized component */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {stats.map((stat, index) => (
            <StatCard key={index} stat={stat} index={index} />
          ))}
        </div>

        {/* Box Cards Grid - Using memoized props */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <BoxCard {...boxCardProps.artworks} />
          <BoxCard {...boxCardProps.licenses} />
          <BoxCard {...boxCardProps.activeLicenses} />
          <BoxCard {...boxCardProps.piracy} />
        </div>



        {/* Additional Info Section */}
        <div className="mt-10 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-purple-900 mb-4">Portfolio Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center p-4 bg-blue-50 rounded-lg">
              <div className="bg-blue-100 p-3 rounded-full mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <p className="text-blue-800 font-medium">Artwork Performance</p>
                <p className="text-blue-600 text-sm">Your artworks are getting attention</p>
              </div>
            </div>
            <div className="flex items-center p-4 bg-purple-50 rounded-lg">
              <div className="bg-purple-100 p-3 rounded-full mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-purple-800 font-medium">License Analytics</p>
                <p className="text-purple-600 text-sm">{boxStats.activeLicenses.value} active licenses</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;