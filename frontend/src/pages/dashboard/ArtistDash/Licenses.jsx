import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Shield,
  XCircle,
  CheckCircle,
  FileText,
  Search,
  RefreshCw,
  Eye,
  ExternalLink,
  AlertTriangle,
  Info,
  Clock,
  Calendar,
  Wallet,
  Download,
  Link as LinkIcon,
  Copy
} from "lucide-react";
import { useWeb3 } from "../../../context/Web3Context";
import { useAuth } from "../../../context/AuthContext";
import { licensesAPI } from "../../../services/api";
import { Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";
import { UserIdentifier, CurrencyConverter } from "../../../utils/currencyUtils";

import LoadingSpinner from "../../../components/common/LoadingSpinner";
import toast from "react-hot-toast";

// Simple in-memory cache with TTL (Time To Live)
const licensesCache = new Map();
const CACHE_TTL = 60000; // 60 seconds cache

const getCachedLicenses = (key) => {
  const cached = licensesCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  licensesCache.delete(key);
  return null;
};

const setCachedLicenses = (key, data) => {
  licensesCache.set(key, { data, timestamp: Date.now() });
};

// Helper to truncate long IDs (Solana addresses/hashes)
const truncateId = (id) => {
  if (!id) return "N/A";
  const idStr = String(id);
  if (idStr.length <= 16) return idStr;
  return `${idStr.substring(0, 6)}...${idStr.substring(idStr.length - 4)}`;
};

const Licenses = () => {
  const { 
    account, 
    isCorrectNetwork, 
    sendTransaction, 
    selectedNetwork, 
    explorerUrl,
    publicKey,
    connection,
    sendSolanaTx
  } = useWeb3();

  const { isAuthenticated, isWalletConnected, user } = useAuth();

  const [licenses, setLicenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewType, setViewType] = useState("licensee");
  const [error, setError] = useState(null);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");

  // ✅ Add modal state for blockchain info
  const [blockchainModalOpen, setBlockchainModalOpen] = useState(false);
  const [blockchainInfo, setBlockchainInfo] = useState(null);
  const [loadingBlockchainInfo, setLoadingBlockchainInfo] = useState(false);

  const lastFetchedUserId = useRef(null);
  const lastFetchedViewType = useRef(null);
  const isFetchingRef = useRef(false);

  // ⚡ OPTIMIZED: Memoize user identifier
  const userIdentifier = useMemo(() => {
    return UserIdentifier.getUserIdentifier(user);
  }, [user?.id, user?._id, user?.user_id, user?.wallet_address]);

  // ⚡ OPTIMIZED: Memoize calculateTimeRemaining function
  const calculateTimeRemaining = useCallback((endDate, durationDays) => {
    if (!endDate) return null;

    // If it's a perpetual license, don't show time remaining
    if (durationDays >= 36500) return { perpetual: true, expired: false };

    const end = new Date(endDate);
    const now = new Date();
    const diffMs = end - now;

    if (diffMs <= 0) return { expired: true, days: 0, hours: 0, totalHours: 0 };

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));

    return { expired: false, days, hours, totalHours };
  }, []);

  // ⚡ OPTIMIZED: Fetch licenses data with caching
  const fetchLicenses = useCallback(async (forceRefresh = false) => {
    if (isFetchingRef.current) return;
    if (!isAuthenticated || !userIdentifier) return;

    const cacheKey = `licenses-${userIdentifier}-${viewType}`;

    // Check cache first (unless forcing refresh)
    if (!forceRefresh && userIdentifier) {
      const cached = getCachedLicenses(cacheKey);
      if (cached) {
        setLicenses(cached);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
    }

    // Skip if same user ID and viewType and not forcing refresh
    if (!forceRefresh && userIdentifier === lastFetchedUserId.current &&
      viewType === lastFetchedViewType.current && licenses.length > 0) {
      return;
    }

    isFetchingRef.current = true;
    lastFetchedUserId.current = userIdentifier;
    lastFetchedViewType.current = viewType;
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await licensesAPI.getByUser(userIdentifier, {
        as_licensee: viewType === "licensee",
        page: 1,
        size: 100
      });

      let userLicenses = [];

      // Handle different response structures
      if (response && response.licenses && Array.isArray(response.licenses)) {
        userLicenses = response.licenses;
        console.log("Found licenses in response.licenses");
      } else if (response && Array.isArray(response.data)) {
        userLicenses = response.data;
        console.log("Found licenses as direct array");
      } else if (response && response.data && response.data.licenses) {
        userLicenses = response.data.licenses;
        console.log("Found licenses in response.data.licenses");
      } else {
        console.warn("Unexpected licenses response structure:", response);
        userLicenses = [];
      }

      const validLicenses = userLicenses.filter(license => {
        // Check basic required fields
        const hasBasicFields = license &&
          (license.license_id !== undefined) &&
          license.token_id !== undefined &&
          license.license_type;

        // ✅ Require addresses for blockchain licenses
        const hasCryptoAddresses = (license.buyer_address || license.licensee_address) &&
          (license.owner_address || license.licensor_address);

        const isValid = hasBasicFields && hasCryptoAddresses;

        if (!isValid) {
          console.warn("Filtering out invalid license:", license);
        }
        return isValid;
      });

      // Check for expired licenses and update status
      const licensesWithStatus = validLicenses.map(license => {
        const timeRemaining = calculateTimeRemaining(license.end_date, license.duration_days);
        const isExpired = timeRemaining && timeRemaining.expired;

        // If license is active but expired, mark it as expired
        if (license.is_active && isExpired) {
          return {
            ...license,
            is_active: false,
            status: "EXPIRED"
          };
        }

        return license;
      });

      setLicenses(licensesWithStatus);
      setCachedLicenses(cacheKey, licensesWithStatus);

    } catch (error) {
      console.error("Error fetching licenses:", error);
      setError("Failed to load licenses. Please try refreshing.");
      toast.error("Failed to load licenses");

      if (licenses.length === 0) {
        setLicenses([]);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [isAuthenticated, userIdentifier, viewType, licenses.length]);

  // ⚡ OPTIMIZED: Fetch licenses on mount and when dependencies change
  useEffect(() => {
    if (isAuthenticated && userIdentifier) {
      // Only fetch if user or viewType changed
      if (userIdentifier !== lastFetchedUserId.current || viewType !== lastFetchedViewType.current) {
        fetchLicenses(true);
      }
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, userIdentifier, viewType, fetchLicenses]);

  // ⚡ OPTIMIZED: Memoize filtered licenses calculation
  const filteredLicenses = useMemo(() => {
    let result = licenses;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(license => {
        const artworkTitle = license.artwork?.title || `Token #${license.token_id}`;
        const licensee = license.buyer_address || license.licensee_address || "";
        const licensor = license.owner_address || license.licensor_address || "";
        const tokenId = license.token_id?.toString() || "";
        const licenseId = license.license_id?.toString() || "";

        return (
          artworkTitle.toLowerCase().includes(term) ||
          licensee.toLowerCase().includes(term) ||
          licensor.toLowerCase().includes(term) ||
          tokenId.includes(term) ||
          licenseId.includes(term)
        );
      });
    }

    // Apply status filter (updated for expiration)
    if (statusFilter !== "all") {
      result = result.filter(license => {
        const timeRemaining = calculateTimeRemaining(license.end_date, license.duration_days);
        const isExpired = timeRemaining && timeRemaining.expired;
        const isActuallyActive = license.is_active !== false && !isExpired;

        if (statusFilter === "active") {
          return isActuallyActive;
        } else if (statusFilter === "expired") {
          return isExpired;
        } else if (statusFilter === "revoked") {
          return license.is_active === false && !isExpired;
        }
        return true;
      });
    }

    // Apply type filter
    if (typeFilter !== "all") {
      result = result.filter(license => license.license_type === typeFilter);
    }

    // Apply payment method filter
    if (paymentMethodFilter !== "all") {
      result = result.filter(license => license.payment_method === paymentMethodFilter);
    }

    return result;
  }, [searchTerm, statusFilter, typeFilter, paymentMethodFilter, licenses, calculateTimeRemaining]);

  // ⚡ OPTIMIZED: Memoize refresh handler
  const handleRefresh = useCallback(() => {
    // Invalidate cache
    if (userIdentifier) {
      licensesCache.delete(`licenses-${userIdentifier}-${viewType}`);
    }
    fetchLicenses(true);
  }, [userIdentifier, viewType, fetchLicenses]);

  // ⚡ OPTIMIZED: Memoize revoke handler
  const handleRevokeLicense = useCallback(async (licenseId) => {
    if (viewType !== "licensor") {
      toast.error("Only licensors can revoke licenses");
      return;
    }

    // Confirmation dialog
    if (!window.confirm("Are you sure you want to revoke this license? This action cannot be undone and will record the revocation on the blockchain.")) {
      return;
    }

    try {
      const revokeToast = toast.loading("Preparing license revocation...");

      const response = await licensesAPI.revoke(licenseId);

      toast.dismiss(revokeToast);

      if (response.already_revoked) {
        toast.success(response.message);
        handleRefresh();
        return;
      }

      // ✅ Check if blockchain transaction is required
      if (response.network === 'solana' && response.blockchain_data) {
        // SOLANA REVOCATION FLOW
        if (!publicKey) {
          toast.error("Please connect your Solana wallet to revoke this license");
          return;
        }

        try {
          const { memo, program_id } = response.blockchain_data;
          
          const transaction = new Transaction();
          transaction.add(
            new TransactionInstruction({
              keys: [],
              programId: new PublicKey(program_id),
              data: Buffer.from(memo),
            })
          );

          console.log("🚀 Sending Solana revoke transaction...");
          const signToast = toast.loading("Please sign the transaction in your Solana wallet...");

          const txHash = await sendSolanaTx(transaction, connection);
          
          toast.dismiss(signToast);
          
          if (!txHash) {
            throw new Error("Failed to receive transaction hash from Solana wallet");
          }

          toast.success("Transaction submitted! Confirming with platform...");

          // Step 2: Confirm the transaction with backend
          const confirmToast = toast.loading("Confirming revocation on platform...");

          const confirmResponse = await licensesAPI.confirmRevoke(licenseId, {
            tx_hash: txHash
          });

          toast.dismiss(confirmToast);

          if (confirmResponse.success) {
            toast.success("License revoked successfully on Solana blockchain!");
            handleRefresh();
          } else {
            toast.error(confirmResponse.message || "Failed to confirm revocation");
          }
        } catch (solError) {
          console.error("❌ Solana Revocation Error:", solError);
          toast.error(solError.message || "Solana transaction failed");
        }
      } else if (response.requires_blockchain && response.transaction) {
        // EVM REVOCATION FLOW (Ethereum/WireFluid)
        if (!account) {
          toast.error("Please connect your MetaMask wallet to revoke this license");
          return;
        }

        // if (!isCorrectNetwork && response.network !== selectedNetwork) {
        //    toast.error(`Please switch to ${response.network} network first`);
        //    return;
        // }

        try {
          const txParams = {
            to: response.transaction.to,
            data: response.transaction.data,
            from: account,
            value: response.transaction.value || '0x0',
          };

          if (response.transaction.maxFeePerGas) {
            txParams.maxFeePerGas = response.transaction.maxFeePerGas;
            txParams.maxPriorityFeePerGas = response.transaction.maxPriorityFeePerGas;
          } else if (response.transaction.gasPrice) {
            txParams.gasPrice = response.transaction.gasPrice;
          }

          if (response.transaction.gas) {
            txParams.gasLimit = response.transaction.gas;
          }

          const signToast = toast.loading("Please sign the transaction in MetaMask...");
          const txResponse = await sendTransaction(txParams);
          toast.dismiss(signToast);

          if (!txResponse || !txResponse.hash) {
            throw new Error("No transaction hash received from MetaMask");
          }

          const confirmToast = toast.loading("Confirming revocation on blockchain...");
          const confirmResponse = await licensesAPI.confirmRevoke(licenseId, {
            tx_hash: txResponse.hash
          });

          toast.dismiss(confirmToast);

          if (confirmResponse.success) {
            toast.success("License revoked successfully on blockchain!");
            handleRefresh();
          } else {
            toast.error(confirmResponse.message || "Failed to confirm revocation");
          }
        } catch (txError) {
          console.error("EVM Revocation Error:", txError);
          toast.error(txError.message || "EVM transaction failed");
        }
      } else {
        toast.error(response.message || "Failed to revoke license");
      }
    } catch (error) {
      console.error("Error revoking license:", error);
      toast.error(error.response?.data?.detail || error.message || "Failed to revoke license");
    }
  }, [isCorrectNetwork, isWalletConnected, user, viewType, userIdentifier, fetchLicenses, account, sendTransaction, publicKey, connection, sendSolanaTx, handleRefresh]);


  // ⚡ OPTIMIZED: Memoize view handler
  const handleViewLicense = useCallback((license) => {
    const licenseId = license.license_id;

    // Show detailed license information
    const timeRemaining = calculateTimeRemaining(license.end_date);
    const duration = license.duration_days || 30;

    toast.success(
      `License #${licenseId}\n` +
      `Artwork: Token #${license.token_id}\n` +
      `Type: ${license.license_type}\n` +
      `Payment: ${license.payment_method || 'crypto'}\n` +
      `Duration: Perpetual (Lifetime Access)\n` +
      `Status: ${license.is_active ? 'Active' : 'Inactive'}`
      , { duration: 4000 });
  }, [calculateTimeRemaining]);

  // ⚡ OPTIMIZED: Memoize blockchain info handler
  const handleGetBlockchainInfo = useCallback(async (licenseId) => {
    setLoadingBlockchainInfo(true);
    setBlockchainModalOpen(true);
    setBlockchainInfo(null);

    try {
      const info = await licensesAPI.getLicenseInfo(licenseId);

      // ✅ Check if response has license data
      if (info && (info.success || info.license_id || info.token_id)) {
        setBlockchainInfo(info.license || info);
        toast.success("Blockchain info loaded");
      } else {
        setBlockchainInfo(null);
        toast.error("Failed to get blockchain info");
      }
    } catch (error) {
      console.error("Error getting blockchain info:", error);
      setBlockchainInfo(null);
      toast.error("Failed to get blockchain info");
    } finally {
      setLoadingBlockchainInfo(false);
    }
  }, []);

  // ✅ Format date helper
  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (typeof timestamp === 'number') {
        return new Date(timestamp * 1000).toLocaleString();
      }
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }, []);

  // ✅ Format address helper
  const formatAddress = useCallback((address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const formatAmount = useCallback((license) => {
    const amount = license.total_amount_eth || license.fee_paid;
    if (!amount) return 'N/A';
    return CurrencyConverter.formatCrypto(amount, license.network);
  }, [selectedNetwork]);

  // ⚡ OPTIMIZED: Memoize display helper functions
  const getLicenseTypeDisplay = useCallback((type) => {
    const typeInfo = {
      "PERSONAL_USE": { label: "Personal Use", color: "bg-blue-100 text-blue-800" },
      "NON_COMMERCIAL": { label: "Non-Commercial", color: "bg-purple-100 text-purple-800" },
      "COMMERCIAL": { label: "Commercial", color: "bg-green-100 text-green-800" },
      "EXTENDED_COMMERCIAL": { label: "Extended Commercial", color: "bg-indigo-100 text-indigo-800" },
      "EXCLUSIVE": { label: "Exclusive", color: "bg-orange-100 text-orange-800" },
      "RESPONSIBLE_USE": { label: "Responsible Use", color: "bg-teal-100 text-teal-800" },
      "ARTWORK_OWNERSHIP": { label: "Artwork Ownership", color: "bg-rose-100 text-rose-800" },
      "CUSTOM": { label: "Custom", color: "bg-gray-100 text-gray-800" },
      "LINK_ONLY": { label: "Link Only", color: "bg-blue-100 text-blue-800" },
      "ACCESS_WITH_WM": { label: "With Watermark", color: "bg-purple-100 text-purple-800" },
      "FULL_ACCESS": { label: "Full Access", color: "bg-green-100 text-green-800" }
    };
    return typeInfo[type] || { label: type, color: "bg-gray-100 text-gray-800" };
  }, []);

  const getStatusDisplay = useCallback((license) => {
    const timeRemaining = calculateTimeRemaining(license.end_date, license.duration_days);
    const isExpired = timeRemaining && timeRemaining.expired;
    const isPerpetual = license.duration_days >= 36500;

    if (license.is_active === false) {
      return { label: "Revoked", color: "bg-red-100 text-red-800", icon: XCircle };
    } else if (license.is_active) {
      if (isPerpetual) {
        return { label: "Lifetime", color: "bg-green-100 text-green-800", icon: CheckCircle };
      }
      return { label: "Active", color: "bg-green-100 text-green-800", icon: CheckCircle };
    } else {
      return { label: "Inactive", color: "bg-gray-100 text-gray-800", icon: FileText };
    }
  }, [calculateTimeRemaining]);

  const getPaymentMethodDisplay = useCallback((method) => {
    const methodInfo = {
      "crypto": { label: "Crypto", icon: Wallet, color: "bg-blue-100 text-blue-800" }
    };
    return methodInfo[method] || { label: method, icon: FileText, color: "bg-gray-100 text-gray-800" };
  }, []);

  // ⚡ OPTIMIZED: Memoize available payment methods
  const availablePaymentMethods = useMemo(() => {
    return UserIdentifier.getAvailablePaymentMethods(user).join(', ') || 'None';
  }, [user?.id, user?._id, user?.user_id, user?.wallet_address]);

  // ✅ Removed wallet connection requirement - users can access licenses page without wallet
  // Licenses can be managed for both crypto and PayPal users, and wallet is only needed for crypto transactions

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="medium" text="Loading licenses..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* ✅ Blockchain Info Modal */}
      {blockchainModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Blockchain License Information
              </h2>
              <button
                onClick={() => {
                  setBlockchainModalOpen(false);
                  setBlockchainInfo(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {loadingBlockchainInfo ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="medium" text="Loading blockchain data..." />
                  {/* <span className="ml-3 text-gray-600">Loading blockchain data...</span> */}
                </div>
              ) : blockchainInfo ? (
                <div className="space-y-4">
                  {/* License ID & Token ID */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 mb-1">License ID</div>
                      <div className="text-lg font-semibold text-blue-900">
                        #{blockchainInfo.license_id ?? blockchainInfo.license?.license_id ?? 'N/A'}
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 mb-1">Token ID</div>
                      <div className="text-lg font-semibold text-green-900">
                        #{blockchainInfo.token_id ?? blockchainInfo.license?.token_id ?? 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* License Type & Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 mb-1">License Type</div>
                      <div className="text-lg font-semibold text-purple-900">
                        {blockchainInfo.license_type ?? blockchainInfo.license?.license_type ?? 'N/A'}
                      </div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        {blockchainInfo.is_active ?? blockchainInfo.license?.is_active ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="text-lg font-semibold text-green-900">Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-red-600" />
                            <span className="text-lg font-semibold text-red-900">Inactive</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Addresses */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-gray-700 mb-3">
                      <Wallet className="w-4 h-4" />
                      <span className="font-semibold">Addresses</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Owner Address</div>
                        <div className="font-mono text-sm bg-white p-2 rounded border">
                          {formatAddress(blockchainInfo.owner_address ?? blockchainInfo.license?.owner_address)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Buyer Address</div>
                        <div className="font-mono text-sm bg-white p-2 rounded border">
                          {formatAddress(blockchainInfo.buyer_address ?? blockchainInfo.license?.buyer_address)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Amounts */}
                  {(blockchainInfo.total_amount_wei || blockchainInfo.license?.total_amount_wei) && (
                    <div className="bg-yellow-50 p-4 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-gray-700 mb-3">
                        <CreditCard className="w-4 h-4" />
                        <span className="font-semibold">Payment Information</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {blockchainInfo.license_fee_wei || blockchainInfo.license?.license_fee_wei ? (
                          <div>
                            <div className="text-sm text-gray-600 mb-1">License Fee</div>
                            <div className="font-mono text-sm font-semibold">
                              {CurrencyConverter.formatCrypto(
                                parseFloat(blockchainInfo.license_fee_wei ?? blockchainInfo.license?.license_fee_wei ?? 0) / 1e18,
                                blockchainInfo.network || blockchainInfo.license?.network
                              )}
                            </div>
                          </div>
                        ) : null}
                        {blockchainInfo.total_amount_wei || blockchainInfo.license?.total_amount_wei ? (
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Total Amount</div>
                            <div className="font-mono text-sm font-semibold text-green-700">
                              {CurrencyConverter.formatCrypto(
                                parseFloat(blockchainInfo.total_amount_wei ?? blockchainInfo.license?.total_amount_wei ?? 0) / 1e18,
                                blockchainInfo.network || blockchainInfo.license?.network
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Purchase Information */}
                  {(blockchainInfo.purchase_time || blockchainInfo.license?.purchase_time) && (
                    <div className="bg-indigo-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-700 mb-2">
                        <Calendar className="w-4 h-4" />
                        <span className="font-semibold">Purchase Information</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Purchase Time</div>
                          <div className="font-mono text-sm">
                            {formatDate(blockchainInfo.purchase_time ?? blockchainInfo.license?.purchase_time)}
                          </div>
                        </div>

                        {(blockchainInfo.transaction_hash || blockchainInfo.license?.transaction_hash) && (
                          <div>
                            <div className="text-sm text-gray-600 mb-1 flex items-center">
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Blockchain Transaction
                            </div>
                            <a
                              href={`${explorerUrl}/tx/${blockchainInfo.transaction_hash || blockchainInfo.license?.transaction_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-blue-600 hover:text-blue-800 break-all flex items-center"
                            >
                              {(blockchainInfo.transaction_hash || blockchainInfo.license?.transaction_hash).substring(0, 20)}...
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Source Info */}
                  {blockchainInfo.source && (
                    <div className="bg-gray-100 p-3 rounded-lg text-sm text-gray-600">
                      <Info className="w-4 h-4 inline mr-2" />
                      Source: {blockchainInfo.source === 'blockchain' ? 'Blockchain (On-chain)' : blockchainInfo.source}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <p className="text-gray-600">No blockchain information available</p>
                </div>
              )}
            </div>

            {/* Modal Footer
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setBlockchainModalOpen(false);
                  setBlockchainInfo(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div> */}
          </div>
        </div>
      )}
      {/*Main Content*/}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">License Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your artwork licenses and usage rights
              </p>
              <p className="mt-1 text-xs text-gray-400">
                User: {userIdentifier} (Methods: {availablePaymentMethods})
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                title="Refresh Licenses"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 mr-3" />
              <div>
                <p className="text-red-800">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Toggle */}
        <div className="mb-6">
          <div className="flex border-b border-gray-200">
            <button
              className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${viewType === "licensee"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              onClick={() => setViewType("licensee")}
            >
              Licenses I Hold ({viewType === "licensee" ? filteredLicenses.length : "..."})
            </button>
            <button
              className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${viewType === "licensor"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              onClick={() => setViewType("licensor")}
            >
              Licenses I Granted ({viewType === "licensor" ? filteredLicenses.length : "..."})
            </button>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by artwork, token ID, or address..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>

            <div>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="PERSONAL_USE">Personal Use</option>
                <option value="NON_COMMERCIAL">Non-Commercial</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="EXTENDED_COMMERCIAL">Extended Commercial</option>
                <option value="EXCLUSIVE">Exclusive</option>
                <option value="ARTWORK_OWNERSHIP">Artwork Ownership</option>
                <option value="LINK_ONLY">Link Only</option>
                <option value="ACCESS_WITH_WM">With Watermark</option>
                <option value="FULL_ACCESS">Full Access</option>
              </select>
            </div>

            <div>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
              >
                <option value="all">All Payments</option>
                <option value="crypto">Crypto</option>
                <option value="paypal">PayPal</option>
              </select>
            </div>
          </div>
        </div>

        {/* Licenses Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {filteredLicenses.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                {licenses.length === 0
                  ? `No licenses found as ${viewType}`
                  : "No licenses match your filters"}
              </p>
              <p className="text-gray-400 text-sm">
                {licenses.length === 0
                  ? (viewType === "licensee"
                    ? "You haven't purchased any licenses yet"
                    : "You haven't received any license purchases yet")
                  : "Try adjusting your search or filters"}
              </p>
              {licenses.length === 0 && (
                <div className="mt-4">
                  <a
                    href="/explorer"
                    className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                  >
                    Browse Artworks
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      License ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Artwork
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {viewType === "licensee" ? "Owner" : "Buyer"}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Purchased
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Content
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLicenses.map((license) => {
                    const licenseId = license.license_id;
                    const tokenId = license.token_id;
                    const licenseeAddress = license.buyer_address || license.licensee_address;
                    const licensorAddress = license.owner_address || license.licensor_address;
                    const isPaypal = license.payment_method === "paypal";
                    const ownerEmail = license.owner_email; // ✅ Owner email for PayPal licenses
                    const buyerEmail = license.buyer_email; // ✅ Buyer email for PayPal licenses

                    // ✅ Debug logging
                    if (isPaypal && viewType === "licensee" && !ownerEmail) {
                      console.warn(`⚠️ PayPal license ${licenseId} missing owner_email:`, {
                        license_id: licenseId,
                        token_id: tokenId,
                        payment_method: license.payment_method,
                        owner_id: license.owner_id,
                        owner_email: ownerEmail,
                        full_license: license
                      });
                    }

                    const artworkTitle = license.artwork?.title || `Token #${tokenId}`;
                    const typeDisplay = getLicenseTypeDisplay(license.license_type);
                    const statusDisplay = getStatusDisplay(license);
                    const paymentDisplay = getPaymentMethodDisplay(license.payment_method || 'crypto');
                    const timeRemaining = calculateTimeRemaining(license.end_date, license.duration_days);
                    const duration = license.duration_days || 36500;

                    // ✅ Determine what to display in the Owner/Buyer column
                    let ownerDisplay = "Unknown";
                    if (viewType === "licensee") {
                      // Showing licenses I hold - display the licensor (owner/seller)
                      if (isPaypal && ownerEmail) {
                        ownerDisplay = ownerEmail;
                      } else if (licensorAddress) {
                        ownerDisplay = formatAddress(licensorAddress);
                      } else if (isPaypal) {
                        // ✅ Fallback: Try to show owner_id if email not available
                        ownerDisplay = license.owner_id ? `Owner ID: ${license.owner_id}` : "Unknown Owner";
                      }
                    } else {
                      // Showing licenses I granted - display the licensee (buyer)
                      if (isPaypal && buyerEmail) {
                        ownerDisplay = buyerEmail; // ✅ Show buyer email for PayPal licenses
                      } else if (licenseeAddress) {
                        ownerDisplay = formatAddress(licenseeAddress);
                      } else if (isPaypal) {
                        // ✅ Fallback: Try to show buyer_id if email not available
                        ownerDisplay = license.buyer_id ? `Buyer ID: ${license.buyer_id}` : "Unknown Buyer";
                      }
                    }

                    return (
                      <tr key={licenseId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-mono text-gray-900" title={licenseId}>
                            #{truncateId(licenseId)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center overflow-hidden">
                              <span className="text-purple-800 font-medium text-[10px]" title={tokenId}>
                                #{truncateId(tokenId)}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {artworkTitle}
                              </div>
                              <div className="text-sm text-gray-500" title={tokenId}>
                                Token #{truncateId(tokenId)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">
                            {ownerDisplay}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${typeDisplay.color}`}>
                            {typeDisplay.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full flex items-center space-x-1 ${paymentDisplay.color}`}>
                            {React.createElement(paymentDisplay.icon, { className: "w-3 h-3" })}
                            <span>{paymentDisplay.label}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {license.purchase_time ? formatDate(license.purchase_time) :
                            license.created_at ? formatDate(license.created_at) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex flex-col">
                            <span className="font-medium">Perpetual</span>
                            <span className="text-green-600 text-xs">Lifetime Access</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatAmount(license)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${statusDisplay.color} flex items-center space-x-1`}>
                            {React.createElement(statusDisplay.icon, { className: "w-3 h-3" })}
                            <span>{statusDisplay.label}</span>
                          </span>
                        </td>
                        {/* ✅ NEW: License Content Column */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {viewType === "licensee" && statusDisplay.label === "Active" && (
                            <div className="flex flex-wrap gap-2">
                              {/* LINK_ONLY: Copy Link + View Link */}
                              {license.license_type === "LINK_ONLY" && (
                                <>
                                  <button
                                    onClick={() => {
                                      const url = `${window.location.origin}/artwork/${tokenId}`;
                                      navigator.clipboard.writeText(url);
                                      toast.success("Artwork link copied!");
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200 transition-colors"
                                    title="Copy shareable link"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy Link
                                  </button>
                                  <button
                                    onClick={() => window.open(`/artwork/${tokenId}`, "_blank")}
                                    className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                                    title="View artwork (link only access)"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View
                                  </button>
                                </>
                              )}

                              {/* ACCESS_WITH_WM: View + Download (watermarked) */}
                              {license.license_type === "ACCESS_WITH_WM" && (
                                <>
                                  <button
                                    onClick={() => {
                                      const apiBaseUrl = import.meta.env.VITE_BASE_URL_BACKEND || 'http://localhost:8000';
                                      const token = localStorage.getItem('token');
                                      // Open image directly in new tab with auth
                                      window.open(`${apiBaseUrl}/artwork/${tokenId}/licensed-image?auth=${encodeURIComponent(token)}`, "_blank");
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 text-xs rounded-lg hover:bg-purple-200 transition-colors"
                                    title="View watermarked image"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const toastId = toast.loading("Downloading watermarked image...");
                                      try {
                                        const apiBaseUrl = import.meta.env.VITE_BASE_URL_BACKEND || 'http://localhost:8000';
                                        const token = localStorage.getItem('token');

                                        const response = await fetch(`${apiBaseUrl}/artwork/${tokenId}/licensed-image`, {
                                          headers: { 'Authorization': `Bearer ${token}` }
                                        });

                                        if (!response.ok) throw new Error("Download failed");

                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `artwork_${tokenId}_watermarked.jpg`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        window.URL.revokeObjectURL(url);

                                        toast.dismiss(toastId);
                                        toast.success("Downloaded (with watermark)");
                                      } catch (error) {
                                        toast.dismiss(toastId);
                                        toast.error("Download failed");
                                      }
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 text-xs rounded-lg hover:bg-purple-200 transition-colors"
                                    title="Download watermarked image"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    Download
                                  </button>
                                </>
                              )}

                              {/* FULL_ACCESS: View + Download (original) */}
                              {license.license_type === "FULL_ACCESS" && (
                                <>
                                  <button
                                    onClick={() => {
                                      const apiBaseUrl = import.meta.env.VITE_BASE_URL_BACKEND || 'http://localhost:8000';
                                      const token = localStorage.getItem('token');
                                      // Open full quality image directly in new tab
                                      window.open(`${apiBaseUrl}/artwork/${tokenId}/licensed-image?auth=${encodeURIComponent(token)}`, "_blank");
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 text-xs rounded-lg hover:bg-green-200 transition-colors"
                                    title="View full quality image"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const toastId = toast.loading("Downloading original...");
                                      try {
                                        const apiBaseUrl = import.meta.env.VITE_BASE_URL_BACKEND || 'http://localhost:8000';
                                        const token = localStorage.getItem('token');

                                        const response = await fetch(`${apiBaseUrl}/artwork/${tokenId}/licensed-download`, {
                                          headers: { 'Authorization': `Bearer ${token}` }
                                        });

                                        if (!response.ok) {
                                          const err = await response.json().catch(() => ({}));
                                          throw new Error(err.detail || "Download failed");
                                        }

                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `artwork_${tokenId}_original.jpg`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        window.URL.revokeObjectURL(url);

                                        toast.dismiss(toastId);
                                        toast.success("Downloaded (original quality)");
                                      } catch (error) {
                                        toast.dismiss(toastId);
                                        toast.error(error.message || "Download failed");
                                      }
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 text-xs rounded-lg hover:bg-green-200 transition-colors"
                                    title="Download original (no watermark)"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    Download
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          {/* Show message for revoked */}
                          {statusDisplay.label === "Revoked" && (
                            <span className="text-xs text-gray-500 italic">N/A</span>
                          )}
                          {/* Show nothing for licensor view */}
                          {viewType === "licensor" && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {/* View Details */}
                            <button
                              onClick={() => handleViewLicense(license)}
                              className="text-blue-600 hover:text-blue-900"
                              title="View License Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Get Blockchain Info (only for crypto licenses) */}
                            {(license.payment_method === 'crypto' || !license.payment_method) && (
                              <button
                                onClick={() => handleGetBlockchainInfo(licenseId)}
                                className="text-green-600 hover:text-green-900"
                                title="Get Blockchain Info"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}

                            {/* Revoke License (only for licensor view and active/lifetime licenses) */}
                            {viewType === "licensor" && (statusDisplay.label === "Active" || statusDisplay.label === "Lifetime") && (
                              <button
                                onClick={() => handleRevokeLicense(licenseId)}
                                className="flex items-center space-x-1 px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded border border-red-200 transition-colors"
                                title="Revoke License"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold">Revoke</span>
                              </button>
                            )}


                            {/* Status Icons */}
                            {statusDisplay.label === "Lifetime" && (
                              <span className="text-green-600" title="License is active">
                                <CheckCircle className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start">
            <Info className="w-6 h-6 text-blue-600 mt-0.5 mr-3" />
            <div>
              <h4 className="text-lg font-semibold text-blue-900 mb-2">License System</h4>
              <p className="text-blue-800 mb-2">
                Unified license system with flexible payment options and <strong>Perpetual (Lifetime)</strong> default duration.
              </p>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Crypto Payments:</strong> Direct blockchain transactions with MetaMask</li>
                <li>• <strong>PayPal Payments:</strong> Traditional payment processing</li>
                <li>• <strong>Link Only:</strong> Basic access to artwork link</li>
                <li>• <strong>Access with Watermark:</strong> Full access with watermark protection</li>
                <li>• <strong>Full Access:</strong> Complete access without restrictions</li>
                <li>• Licenses are Perpetual (Lifetime)</li>
                <li>• Artwork owners can manually revoke licenses anytime</li>
                <li>• Crypto license data is stored permanently on the blockchain</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Licenses;