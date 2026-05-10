import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { artworksAPI, licensesAPI } from "../services/api";
import { UserIdentifier, CurrencyConverter, ArtworkStatus } from "../utils/currencyUtils";
import {
  Palette,
  User,
  Clock,
  DollarSign,
  Shield,
  ArrowLeft,
  Copy,
  ExternalLink,
  CheckCircle,
  XCircle,
  Wallet,
  CreditCard,
  ShoppingCart,
  FileText,
  Database,
  Share2,
  Download,
} from "lucide-react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import toast from "react-hot-toast";
import ShareModal from "../components/common/ShareModal";
import { useImageProtection } from "../hooks/useImageProtection";
import ProtectedImage from "../components/common/ProtectedImage";
import { Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";
import axios from "axios";


const API_BASE = import.meta.env.VITE_BASE_URL_BACKEND || '';

// Date formatting utility functions
const formatDate = (dateString) => {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      const altDate = new Date(dateString.replace(/\.\d+Z$/, "Z"));
      if (!isNaN(altDate.getTime())) {
        return altDate.toLocaleDateString();
      }
      return "Invalid Date";
    }

    return date.toLocaleDateString();
  } catch (error) {
    console.error("Error formatting date:", error, dateString);
    return "Invalid Date";
  }
};

const formatDateTime = (dateString) => {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      const altDate = new Date(dateString.replace(/\.\d+Z$/, "Z"));
      if (!isNaN(altDate.getTime())) {
        return altDate.toLocaleString();
      }
      return "Invalid Date";
    }

    return date.toLocaleString();
  } catch (error) {
    console.error("Error formatting date:", error, dateString);
    return "Invalid Date";
  }
};

const getExplorerForNetwork = (network) => {
  const normalized = (network || "").toLowerCase();

  if (normalized === "algorand") {
    return {
      name: "Pera Explorer",
      addressUrl: (address) => `https://testnet.explorer.perawallet.app/address/${address}`,
      txUrl: (txHash) => `https://testnet.explorer.perawallet.app/tx/${txHash}`,
    };
  }

  if (normalized === "wirefluid") {
    return {
      name: "WireFluid Scan",
      addressUrl: (address) => `https://wirefluidscan.com/address/${address}`,
      txUrl: (txHash) => `https://wirefluidscan.com/tx/${txHash}`,
    };
  }

  if (normalized === "solana") {
    return {
      name: "Solana Explorer",
      addressUrl: (address) => `https://explorer.solana.com/address/${address}?cluster=devnet`,
      txUrl: (txHash) => `https://explorer.solana.com/tx/${txHash}?cluster=devnet`,
    };
  }

  return {
    name: "Etherscan",
    addressUrl: (address) => `https://sepolia.etherscan.io/address/${address}`,
    txUrl: (txHash) => `https://sepolia.etherscan.io/tx/${txHash}`,
  };
};

const ArtworkDetail = () => {
  const { artworkId } = useParams();
  const navigate = useNavigate();
  const { 
    account, 
    isCorrectNetwork, 
    selectedNetwork,
    publicKey,
    connection,
    sendSolanaTx
  } = useWeb3();

  const { isAuthenticated, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [artwork, setArtwork] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [activeTab, setActiveTab] = useState("details");
  const [blockchainInfo, setBlockchainInfo] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  useImageProtection(true, artworkId);

  // ✅ Get user identifier with fallback to JWT token (for better reliability)
  const getUserIdentifierWithFallback = () => {
    // Try UserIdentifier first
    const identifier = UserIdentifier.getUserIdentifier(user);
    if (identifier) {
      return identifier;
    }

    // ✅ Fallback: Extract from JWT token
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userIdFromToken = payload.userId || payload.user_id || payload.sub || payload.id;
        if (userIdFromToken) {
          console.log('✅ Using user ID from JWT token:', userIdFromToken);
          return String(userIdFromToken);
        }
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }

    return null;
  };

  const userIdentifier = getUserIdentifierWithFallback();
  // ✅ Use capability checks instead of user type
  const hasWallet = user ? UserIdentifier.hasWalletAddress(user) : false;
  const hasPayPal = user ? UserIdentifier.hasPaymentMethod(user, "paypal") : false;

  const itemLabel = artwork?.is_psl_ticket ? "Ticket" : "Artwork";
  const itemLabelLower = itemLabel.toLowerCase();

  // drmfrontend/src/pages/ArtworkDetail.jsx - Line 108-208

  useEffect(() => {
    const fetchArtworkData = async () => {
      if (!artworkId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // ✅ Fetch both artwork and blockchain data
        const [artworkRes, blockchainRes] = await Promise.allSettled([
          artworksAPI.getByTokenId(artworkId),
          artworksAPI.getBlockchainInfo(artworkId),
        ]);

        let artworkData = null;
        let blockchainData = null;

        // Handle artwork data
        if (artworkRes.status === "fulfilled") {
          const artworkResponse = artworkRes.value;
          if (artworkResponse && artworkResponse.data) {
            artworkData = artworkResponse.data;
            setArtwork(artworkData);

            // ✅ Log artwork ownership data for debugging
            console.log('📦 Artwork Data Loaded:', {
              token_id: artworkData.token_id,
              owner_id: artworkData.owner_id,
              creator_id: artworkData.creator_id,
              owner_address: artworkData.owner_address,
              payment_method: artworkData.payment_method,
              current_userIdentifier: userIdentifier
            });

            // ✅ Log view event to DRM analytics
            try {
              const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
              const API_BASE = import.meta.env.VITE_BASE_URL_BACKEND || "http://localhost:8000/api/v1";
              fetch(`${API_BASE}/drm/usage/view/${artworkId}`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
              }).catch(e => console.error("Silent fail on view log:", e));
            } catch (e) { }
          } else {
            console.error("Invalid artwork response:", artworkResponse);
            setArtwork(null);
          }
        } else {
          console.error("❌ Failed to fetch artwork:", artworkRes.reason);
          setArtwork(null);
        }

        // Handle blockchain data
        if (blockchainRes.status === "fulfilled") {
          blockchainData = blockchainRes.value;
          console.log("✅ Blockchain data received:", blockchainData);

          // Validate blockchain data before setting
          if (
            blockchainData.error ||
            blockchainData.blockchain_status === "error"
          ) {
            console.warn("⚠️ Blockchain data has errors:", blockchainData.error);
            setBlockchainInfo(blockchainData);
          } else {
            setBlockchainInfo(blockchainData);
          }
        } else {
          console.warn("⚠️ Failed to fetch blockchain data:", blockchainRes.reason);
          // ✅ Create fallback blockchain data from artwork
          const fallbackBlockchainData = {
            token_id: artworkData?.token_id || 0,
            owner: artworkData?.owner_address || artworkData?.owner_id || "Unknown",
            creator: artworkData?.creator_address || artworkData?.creator_id || "Unknown",
            royalty_percentage: artworkData?.royalty_percentage || 0,
            metadata_uri: artworkData?.metadata_uri || "",
            is_licensed: false,
            blockchain_status: "fallback",
            source: "database_fallback",
          };
          console.log("📦 Using fallback blockchain data:", fallbackBlockchainData);
          setBlockchainInfo(fallbackBlockchainData);
        }

        // Fetch licenses for this artwork
        try {
          console.log(`🔍 Fetching licenses for artwork_id: ${artworkId}`);

          const licensesResponse = await licensesAPI.getByArtwork(artworkId);
          console.log("📋 Raw licenses response:", licensesResponse);

          // Handle different response structures
          let licensesData = [];

          if (licensesResponse?.licenses && Array.isArray(licensesResponse.licenses)) {
            licensesData = licensesResponse.licenses;
          } else if (licensesResponse?.data?.licenses && Array.isArray(licensesResponse.data.licenses)) {
            licensesData = licensesResponse.data.licenses;
          } else if (Array.isArray(licensesResponse?.data)) {
            licensesData = licensesResponse.data;
          } else if (licensesResponse?.data?.data && Array.isArray(licensesResponse.data.data)) {
            licensesData = licensesResponse.data.data;
          } else if (Array.isArray(licensesResponse)) {
            licensesData = licensesResponse;
          } else {
            console.warn("⚠️ Unexpected licenses response structure:", licensesResponse);
          }

          console.log(`✅ Final parsed ${licensesData.length} licenses for artwork ${artworkId}:`, licensesData);
          setLicenses(licensesData);
        } catch (licenseError) {
          console.error("❌ Error fetching licenses:", licenseError);
          setLicenses([]);
        }
      } catch (error) {
        console.error("Error fetching artwork:", error);
        toast.error("Failed to load artwork details");
        setArtwork(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArtworkData();
  }, [artworkId, userIdentifier]); // ✅ Re-fetch when userIdentifier changes // ✅ Re-fetch when userIdentifier changes (after login/purchase)

  const copyToClipboard = (text) => {
    if (!text) {
      toast.error("Nothing to copy");
      return;
    }
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const refreshData = async () => {
    if (!artworkId) return;
    try {
      const [artworkRes, licensesRes] = await Promise.all([
        artworksAPI.getByTokenId(artworkId),
        licensesAPI.getByArtwork(artworkId)
      ]);
      
      if (artworkRes && artworkRes.data) {
        setArtwork(artworkRes.data);
      }
      
      let licensesData = [];
      if (licensesRes?.licenses) licensesData = licensesRes.licenses;
      else if (licensesRes?.data?.licenses) licensesData = licensesRes.data.licenses;
      else if (Array.isArray(licensesRes?.data)) licensesData = licensesRes.data;
      else if (Array.isArray(licensesRes)) licensesData = licensesRes;
      
      setLicenses(licensesData);
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  const handleRevokeLicense = async (licenseId) => {
    if (!window.confirm("Are you sure you want to revoke this license? This action cannot be undone and will record the revocation on the blockchain.")) {
      return;
    }

    try {
      const revokeToast = toast.loading("Preparing license revocation...");
      const response = await licensesAPI.revoke(licenseId);
      toast.dismiss(revokeToast);

      if (response.already_revoked) {
        toast.success(response.message);
        refreshData();
        return;
      }

      // Solana Flow
      if (response.network === 'solana' && response.blockchain_data) {
        if (!publicKey) {
          toast.error("Please connect your Solana wallet");
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

          const signToast = toast.loading("Please sign the transaction in your Solana wallet...");
          const txHash = await sendSolanaTx(transaction, connection);
          toast.dismiss(signToast);
          
          if (!txHash) throw new Error("No transaction hash received");

          const confirmToast = toast.loading("Confirming revocation on platform...");
          const confirmRes = await licensesAPI.confirmRevoke(licenseId, { tx_hash: txHash });
          toast.dismiss(confirmToast);

          if (confirmRes.success) {
            toast.success("License revoked successfully on Solana!");
            refreshData();
          } else {
            toast.error(confirmRes.message || "Failed to confirm revocation");
          }
        } catch (err) {
          console.error("Solana revocation error:", err);
          toast.error("Solana error: " + err.message);
        }
      } 
      // EVM Flow
      else if (response.requires_blockchain && response.transaction) {
        if (!account) {
          toast.error("Please connect your MetaMask wallet");
          return;
        }

        try {
          const txParams = {
            to: response.transaction.to,
            data: response.transaction.data,
            from: account,
            value: response.transaction.value || '0x0',
          };

          const signToast = toast.loading("Please sign in MetaMask...");
          const txRes = await sendTransaction(txParams);
          toast.dismiss(signToast);

          if (!txRes?.hash) throw new Error("No transaction hash received");

          const confirmToast = toast.loading("Confirming on blockchain...");
          const confirmRes = await licensesAPI.confirmRevoke(licenseId, { tx_hash: txRes.hash });
          toast.dismiss(confirmToast);

          if (confirmRes.success) {
            toast.success("License revoked successfully on blockchain!");
            refreshData();
          } else {
            toast.error(confirmRes.message || "Failed to confirm revocation");
          }
        } catch (err) {
          console.error("EVM revocation error:", err);
          toast.error("EVM error: " + err.message);
        }
      } else {
        if (response.success) {
          toast.success("License revoked successfully!");
          refreshData();
        } else {
          toast.error(response.message || "Failed to revoke license");
        }
      }
    } catch (error) {
      console.error("Revocation error:", error);
      toast.error(error.response?.data?.detail || error.message || "Failed to revoke");
    }
  };


  const formatAddress = (address) => {
    if (!address) return "N/A";
    return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
  };

  const explorerNetwork = (artwork?.network || blockchainInfo?.network || selectedNetwork || "sepolia").toLowerCase();
  const explorer = getExplorerForNetwork(explorerNetwork);

  // ✅ Check if current user is owner (supports both crypto and PayPal users)
  const calculateOwnership = () => {
    if (!isAuthenticated || !artwork) return { isOwner: false, isCreator: false };
    if (!userIdentifier && !account && !user?.wallet_address) return { isOwner: false, isCreator: false };

    // 1. ID-based check (Direct platform ID match)
    let isIdOwner = false;
    if (userIdentifier && artwork.owner_id) {
      const userIdStr = String(userIdentifier).trim().replace(/^ObjectId\(|\)$/g, '');
      const ownerIdStr = String(artwork.owner_id).trim().replace(/^ObjectId\(|\)$/g, '');
      isIdOwner = userIdStr === ownerIdStr;
    }

    // 2. Profile-based check
    const isProfileWalletOwner =
      user?.wallet_address &&
      artwork.owner_address &&
      ((artwork.network === "solana" || artwork.network === "algorand")
        ? user.wallet_address === artwork.owner_address
        : user.wallet_address.toLowerCase() === artwork.owner_address.toLowerCase());

    // 3. Connected-wallet check
    const isCryptoOwner =
      account &&
      artwork.owner_address &&
      ((artwork.network === "solana" || artwork.network === "algorand")
        ? account === artwork.owner_address
        : account.toLowerCase() === artwork.owner_address.toLowerCase());

    // 4. Blockchain-level check
    const isBlockchainOwner =
      blockchainInfo &&
      blockchainInfo.owner &&
      blockchainInfo.owner !== "Unknown" &&
      blockchainInfo.owner !== "0x0000000000000000000000000000000000000000" &&
      ((account && (
        (artwork?.network === "solana" || artwork?.network === "algorand")
          ? account === blockchainInfo.owner
          : account.toLowerCase() === blockchainInfo.owner.toLowerCase()
      )) || (user?.wallet_address && (
        (artwork?.network === "solana" || artwork?.network === "algorand")
          ? user.wallet_address === blockchainInfo.owner
          : user.wallet_address.toLowerCase() === blockchainInfo.owner.toLowerCase()
      )));

    // 5. Creator check
    let isCreator = false;
    if (userIdentifier && (artwork.creator_id || artwork.creator_address)) {
      const isIdCreator = String(userIdentifier).replace(/^ObjectId\(|\)$/g, '') === String(artwork.creator_id).replace(/^ObjectId\(|\)$/g, '');
      const isWalletCreator = 
        (account && ((artwork.network === "solana" || artwork.network === "algorand")
          ? account === artwork.creator_address
          : account.toLowerCase() === (artwork.creator_address || "").toLowerCase())) ||
        (user?.wallet_address && ((artwork.network === "solana" || artwork.network === "algorand")
          ? user.wallet_address === artwork.creator_address
          : user.wallet_address.toLowerCase() === (artwork.creator_address || "").toLowerCase()));
      
      isCreator = isIdCreator || isWalletCreator;
    }

    const isOwner = isIdOwner || isProfileWalletOwner || isCryptoOwner || isBlockchainOwner;
    
    return { isOwner, isCreator };
  };

  const { isOwner, isCreator } = calculateOwnership();



  // Format price display based on user type
  const formatPrice = (price) => {
    if (price === undefined || price === null) return 'Not set';

    const isSolana = artwork?.network === 'solana' || artwork?.network === 'sol';
    const usdAmount = isSolana 
      ? CurrencyConverter.solToUsd(price)
      : CurrencyConverter.ethToUsd(price);

    if (hasPayPal && !hasWallet) {
      // PayPal users see USD
      return CurrencyConverter.formatUsd(usdAmount);
    }

    // Crypto users see both
    return (
      <div>
        <div className="text-2xl font-bold text-green-900">
          {CurrencyConverter.formatCrypto(price, artwork?.network)}
        </div>
        <div className="text-sm text-green-700 mt-1">
          ≈ {CurrencyConverter.formatUsd(usdAmount)}
        </div>
      </div>
    );
  };

  // Format license fee based on user type
  const formatLicenseFee = (license) => {
    const fee = license.total_amount_eth || license.fee_paid || license.total_amount_sol || 0;

    const isSolana = artwork?.network === 'solana' || artwork?.network === 'sol';
    const usdAmount = isSolana 
      ? CurrencyConverter.solToUsd(fee)
      : CurrencyConverter.ethToUsd(fee);

    if (hasPayPal && !hasWallet) {
      return CurrencyConverter.formatUsd(usdAmount);
    }

    return `${CurrencyConverter.formatCrypto(fee, artwork?.network)} (≈ ${CurrencyConverter.formatUsd(usdAmount)})`;
  };

  // Safe function to get licenses array
  const getLicensesArray = () => {
    if (!licenses) return [];
    if (Array.isArray(licenses)) return licenses;
    if (licenses.licenses && Array.isArray(licenses.licenses)) return licenses.licenses;
    if (licenses.data && Array.isArray(licenses.data)) return licenses.data;
    return [];
  };

  const licensesArray = getLicensesArray();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center p-12">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  if (!artwork) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Item Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            The item with ID {artworkId} could not be found.
          </p>
          <Link
            to="/explorer"
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Explorer
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Navigation */}
      <div className="mb-6">
        <Link
          to="/explorer"
          className="inline-flex items-center text-purple-600 hover:text-purple-800 font-medium"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Explorer
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        {/* Header Section */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {artwork.title || `Artwork #${artwork.token_id}`}
              </h1>
              <p className="text-gray-600 mt-2">
                Token ID: #{artwork.token_id}
              </p>
              {/* ✅ Registration Method Badge */}
              {artwork.payment_method && (
                <div className="mt-3">
                  {(() => {
                    const isOnChain = ArtworkStatus.isOnChainArtwork(artwork);
                    const label = ArtworkStatus.getRegistrationLabel(artwork);

                    return isOnChain ? (
                      <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                        <Wallet className="w-4 h-4" />
                        <span>{label}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                        <CreditCard className="w-4 h-4" />
                        <span>{label}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${artwork.is_licensed
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
                  }`}
              >
                {artwork.is_licensed ? "Licensed" : "Available for Licensing"}
              </span>
              {isOwner && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  Your Artwork
                </span>
              )}
              {!isOwner && isCreator && (
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                  Created by You
                </span>
              )}
              {artwork.payment_method && artwork.registration_method !== 'competition' && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${artwork.payment_method === 'paypal'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
                  }`}>
                  {artwork.payment_method === 'paypal' ? <CreditCard className="w-3 h-3 mr-1" /> : <Wallet className="w-3 h-3 mr-1" />}
                  {artwork.payment_method === 'paypal' ? 'PayPal' : 'Crypto'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6">
          {/* Image Section */}
          <div className="lg:sticky lg:top-6 self-start">
            <div
              className="bg-gray-100 rounded-lg overflow-hidden aspect-square flex items-center justify-center relative image-container"
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                WebkitTouchCallout: 'none'
              }}
            >
              {(() => {
                const baseUrl = import.meta.env.VITE_BASE_URL_BACKEND || '';
                const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                const artworkIdForImage = artwork._id || artwork.id || artwork.token_id;

                // ✅ FIX: Use licensed-image endpoint for owners (High Quality, No Watermark)
                // ✅ FIX: Use Artwork ID (_id) for identification to avoid blockchain-only lookup issues
                let imageUrl = null;
                const timestamp = new Date().getTime();

                if (isOwner) {
                  // Owners get high-quality original via licensed-image endpoint
                  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                  imageUrl = `${cleanBaseUrl}/artwork/${artworkIdForImage}/licensed-image?auth=${token}&t=${timestamp}`;
                } else if (artworkIdForImage) {
                  // Non-owners get medium-res preview
                  imageUrl = `${cleanBaseUrl}/artwork/${artworkIdForImage}/image?t=${timestamp}`;
                }

                return imageUrl ? (
                  <>
                    {/* DB Badge */}
                    <div className="absolute top-2 right-2 z-20">
                      <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-md">
                        <Database className="w-3 h-3 mr-1" />
                        DB
                      </div>
                    </div>

                    {/* Protected Canvas Image */}
                    <ProtectedImage
                      imageUrl={imageUrl}
                      thumbnailUrl={`${cleanBaseUrl}/artwork/${artworkIdForImage}/thumbnail`}
                      alt={artwork.title || `Artwork ${artwork.token_id}`}
                      className="w-full h-full"
                      aspectRatio="square"
                      showToast={true}
                      fallbackToImg={true}
                      onError={() => {
                        const placeholder = document.querySelector('.image-placeholder');
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />

                    {/* Error placeholder */}
                    <div className="image-placeholder text-center absolute inset-0 flex flex-col items-center justify-center" style={{ display: 'none' }}>
                      <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Image unavailable</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No image available</p>
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons - Show for everyone except the owner */}
            {!isOwner && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Link
                  to={`/license/${artwork._id || artwork.id}`}
                  className="w-full flex items-center justify-center bg-purple-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-purple-700 transition-all transform hover:scale-[1.02] shadow-xl hover:shadow-purple-200"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  License
                </Link>
                <Link
                  to={`/sale/${artwork._id || artwork.id || artwork.token_id}`}
                  className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg text-center font-medium transition-colors"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Purchase
                </Link>
              </div>
            )}
             {/* Download Button — hidden for tickets */}
            <div className="mt-3">
              <button
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                    if (!token) {
                      toast.error('Please login to download');
                      return;
                    }
                    // Step 1: Get download token
                    const artworkIdForDownload = artwork._id || artwork.id || artwork.token_id;
                    const tokenRes = await axios.post(
                      `${API_BASE}/drm/download/${artworkIdForDownload}/token`,
                      {},
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const data = tokenRes.data;
                    if (!data.success) {
                      toast.error(data.error || 'Cannot generate download link');
                      return;
                    }

                    // Step 2: Trigger download using signed token
                    const downloadUrl = `${API_BASE}/drm/download/${artworkIdForDownload}?token=${encodeURIComponent(data.download_token)}`;
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = `${artwork.title || 'artwork'}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    toast.success(
                      `Download started! ${data.downloads_remaining} downloads remaining this hour.`,
                      { duration: 3000, icon: '⬇️' }
                    );
                  } catch (err) {
                    const msg = err?.response?.data?.detail || 'Download failed';
                    toast.error(msg);
                  }
                }}
                className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 py-3 px-4 rounded-lg font-bold transition-colors shadow-md"
                style={{ color: 'white' }}
              >
                <Download className="w-5 h-5 mr-2" style={{ color: 'white' }} />
                Download Artwork
              </button>
            </div>
            
            {/* Share Button */}
            <div className="mt-3">
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 py-3 px-4 rounded-lg font-bold transition-all shadow-md"
                style={{ color: 'white' }}
              >
                <Share2 className="w-5 h-5 mr-2" style={{ color: 'white' }} />
                Share Artwork
              </button>
            </div>
            {isAuthenticated && isOwner && (
              <div className="mt-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
                    <p className="text-blue-800 font-medium">
                      This is your artwork. You cannot purchase your own artwork.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Details Section */}
          <div>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
              <button
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === "details"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                onClick={() => setActiveTab("details")}
              >
                Details
              </button>
              <button
                className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === "licenses"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                onClick={() => setActiveTab("licenses")}
              >
                Licenses ({licensesArray.length})
              </button>
            </div>

            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="space-y-6">
                {/* Description */}
                {artwork.description && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                    <p className="text-gray-600 leading-relaxed">{artwork.description}</p>
                  </div>
                )}

                {/* Price */}
                {artwork.price && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <DollarSign className="w-5 h-5 mr-2 text-green-600" />
                      Artwork Price
                    </h3>
                    <div className="bg-green-50 rounded-lg p-4">
                      {formatPrice(artwork.price)}
                    </div>
                  </div>
                )}

                {/* Available Licenses */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <Shield className="w-5 h-5 mr-2 text-blue-600" />
                    Available Licenses
                  </h3>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex flex-wrap gap-2">
                      {artwork.available_license_types?.map((type) => (
                        <span key={type} className="px-2 py-1 bg-white border border-blue-200 rounded text-xs text-blue-800 font-medium">
                          {type.replace(/_/g, ' ')}
                        </span>
                      )) || <span className="text-gray-500 text-sm">All standard licenses available</span>}
                    </div>

                    {(artwork.responsible_use_addon === true || artwork.responsible_use_addon?.enabled === true) && (
                      <div className="mt-4 p-2 bg-blue-100 border border-blue-200 rounded-lg flex items-center">
                        <CheckCircle className="w-4 h-4 text-blue-600 mr-2" />
                        <span className="text-sm font-semibold text-blue-800">
                          Responsible Use Add-on Available
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Creator Info */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <User className="w-5 h-5 mr-2 text-purple-600" />
                    Creator Information
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {/* Γ£à Show name and email ONLY for Competition artworks */}
                    {((artwork.registration_method === 'competition' || artwork.payment_method === 'paypal') && (artwork.creator_name || artwork.creator_email)) ? (
                      <>
                        {artwork.creator_name && (
                          <div className="mb-3">
                            <span className="text-sm text-gray-600">Name</span>
                            <p className="text-sm font-medium text-gray-900 mt-1">{artwork.creator_name}</p>
                          </div>
                        )}
                        {artwork.creator_email && (
                          <div className="mb-3">
                            <span className="text-sm text-gray-600">Email</span>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-sm text-gray-900">{artwork.creator_email}</p>
                              <button
                                onClick={() => copyToClipboard(artwork.creator_email)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                title="Copy email"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        {isCreator && (
                          <p className="text-sm text-purple-600 font-medium mt-2">
                            You are the Creator of this {itemLabelLower}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {/* For crypto artworks, show wallet address */}
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">
                            Wallet Address
                          </span>
                          {(artwork.creator_address || blockchainInfo?.creator) && (
                            <button
                              onClick={() => copyToClipboard(blockchainInfo?.creator || artwork.creator_address)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copy address"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="font-mono text-sm break-all text-gray-900">
                          {(() => {
                            const isOnChain = ArtworkStatus.isOnChainArtwork(artwork);
                            
                            // ✅ For on-chain artworks, blockchain is the Source of Truth
                            if (isOnChain && blockchainInfo?.creator && blockchainInfo.creator !== "Unknown") {
                              return blockchainInfo.creator;
                            }
                            
                            // ✅ Priority fallback
                            return artwork.creator_solana_address || artwork.creator_address || artwork.creator_id || "N/A";
                          })()}
                        </p>
                        {isCreator && (
                          <p className="text-sm text-purple-600 font-medium mt-2">
                            You are the Creator of this {itemLabelLower}
                          </p>
                        )}
                        {(blockchainInfo?.creator || artwork.creator_address) && (
                          <a
                            href={explorer.addressUrl(blockchainInfo?.creator || artwork.creator_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800 mt-2"
                          >
                            View on {explorer.name} <ExternalLink className="w-4 h-4 ml-1" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Current Owner */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Current Owner
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {/* Γ£à Show name and email ONLY for Competition artworks */}
                    {((artwork.registration_method === 'competition' || artwork.payment_method === 'paypal') && (artwork.owner_name || artwork.owner_email)) ? (
                      <>
                        {artwork.owner_name && (
                          <div className="mb-3">
                            <span className="text-sm text-gray-600">Name</span>
                            <p className="text-sm font-medium text-gray-900 mt-1">{artwork.owner_name}</p>
                          </div>
                        )}
                        {artwork.owner_email && (
                          <div className="mb-3">
                            <span className="text-sm text-gray-600">Email</span>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-sm text-gray-900">{artwork.owner_email}</p>
                              <button
                                onClick={() => copyToClipboard(artwork.owner_email)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                title="Copy email"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        {isOwner && (
                          <p className="text-sm text-blue-600 font-medium mt-2">
                            This is your {itemLabelLower}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {/* For crypto artworks, show wallet address */}
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">
                            Wallet Address
                          </span>
                          {artwork.owner_address && (
                            <button
                              onClick={() => copyToClipboard(artwork.owner_address)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copy address"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}
                        </div>


                        <p className="font-mono text-sm break-all text-gray-900">
                          {(() => {
                            const isOnChain = ArtworkStatus.isOnChainArtwork(artwork);
                            
                            // ✅ For on-chain artworks, blockchain is the Source of Truth
                            if (isOnChain && blockchainInfo?.owner && blockchainInfo.owner !== "Unknown") {
                              return blockchainInfo.owner;
                            }
                            
                            // ✅ Priority fallback: database owner_address > owner_id > fallback
                            if (artwork.owner_address) {
                              return artwork.owner_address;
                            } else if (artwork.owner_id) {
                              return artwork.owner_id;
                            } else {
                              return "N/A";
                            }
                          })()}
                        </p>
                        {isOwner && (
                          <p className="text-sm text-blue-600 font-medium mt-2">
                            This is your {itemLabelLower}
                          </p>
                        )}
                        {artwork.owner_address && (
                          <a
                            href={explorer.addressUrl(artwork.owner_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800 mt-2"
                          >
                            View on {explorer.name}{" "}
                            <ExternalLink className="w-4 h-4 ml-1" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Royalty Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <DollarSign className="w-5 h-5 mr-2 text-green-600" />
                    Royalty Information
                  </h3>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-green-800">
                        Royalty Percentage
                      </span>
                      <span className="text-lg font-bold text-green-900">
                        {artwork.royalty_percentage
                          ? (artwork.royalty_percentage / 100).toFixed(2)
                          : 0}
                        %
                      </span>
                    </div>
                    <p className="text-sm text-green-700 mt-2">
                      The creator receives this percentage from every secondary
                      sale.
                    </p>
                  </div>
                </div>

                {/* Categories */}
                {(artwork.medium_category || artwork.style_category || artwork.subject_category) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <Palette className="w-5 h-5 mr-2 text-purple-600" />
                      Categories
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex flex-wrap gap-2">
                        {artwork.medium_category && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                            🎨 {artwork.medium_category}
                          </span>
                        )}
                        {artwork.style_category && (
                          <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                            🖼 {artwork.style_category}
                          </span>
                        )}
                        {artwork.subject_category && (
                          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            🌍 {artwork.subject_category}
                          </span>
                        )}
                      </div>
                      {(artwork.other_medium || artwork.other_style || artwork.other_subject) && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-600 mb-2">Additional Details:</p>
                          {artwork.other_medium && (
                            <p className="text-sm text-gray-700">Medium: {artwork.other_medium}</p>
                          )}
                          {artwork.other_style && (
                            <p className="text-sm text-gray-700">Style: {artwork.other_style}</p>
                          )}
                          {artwork.other_subject && (
                            <p className="text-sm text-gray-700">Subject: {artwork.other_subject}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata - Only visible to Owner to prevent original image leak */}
                {(isOwner || artwork.registration_method === 'competition') && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Metadata
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">IPFS URI</span>
                        {(artwork.metadata_uri || blockchainInfo?.metadata_uri || blockchainInfo?.uri) && (
                          <button
                            onClick={() => copyToClipboard(artwork.metadata_uri || blockchainInfo?.metadata_uri || blockchainInfo?.uri)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="Copy URI"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="font-mono text-sm break-all mb-4 text-gray-900">
                        {artwork.metadata_uri || blockchainInfo?.metadata_uri || blockchainInfo?.uri || "N/A"}
                      </p>
                      {(artwork.metadata_uri || blockchainInfo?.metadata_uri || blockchainInfo?.uri)?.includes("ipfs://") && (
                        <a
                          href={`https://ipfs.io/ipfs/${(artwork.metadata_uri || blockchainInfo?.metadata_uri || blockchainInfo?.uri).replace("ipfs://", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800"
                        >
                          View on IPFS <ExternalLink className="w-4 h-4 ml-1" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <Clock className="w-5 h-5 mr-2 text-blue-600" />
                      Registration Date
                    </h3>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-900">
                        {formatDate(artwork.created_at)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <Clock className="w-5 h-5 mr-2 text-gray-600" />
                      Last Updated
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-900">
                        {formatDate(artwork.updated_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Licenses Tab */}
            {activeTab === "licenses" && (
              <div>
                {licensesArray.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">
                      No licenses issued for this artwork yet
                    </p>
                    {!isOwner && isAuthenticated && (
                      <Link
                        to={`/license/${artwork._id || artwork.id}`}
                        className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                      >
                        Be the first to license this artwork
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {licensesArray.map((license) => (
                      <div
                        key={license.license_id || license.id || Math.random()}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-purple-300 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              License #{license.license_id || license.id || "N/A"}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {license.license_type || "Standard"} License
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${license.is_active
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                                }`}
                            >
                              {license.is_active ? "Active" : "Inactive"}
                            </span>
                            {license.payment_method && (
                              <span className={`px-2 py-1 text-xs rounded-full flex items-center ${license.payment_method === 'paypal'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                                }`}>
                                {license.payment_method === 'paypal' ? <CreditCard className="w-3 h-3 mr-1" /> : <Wallet className="w-3 h-3 mr-1" />}
                                {license.payment_method === 'paypal' ? 'PayPal' : 'Crypto'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-gray-600">Licensee:</span>
                            {(() => {
                              // For PayPal/off-chain licenses, show buyer email
                              const isPayPal = license.payment_method === "paypal";
                              const buyerEmail = license.buyer_email;
                              const licenseeAddress = license.licensee_address || license.buyer_address;

                              if (isPayPal && buyerEmail) {
                                return (
                                  <p className="truncate" title={buyerEmail}>
                                    {buyerEmail}
                                  </p>
                                );
                              } else if (licenseeAddress) {
                                return (
                                  <p
                                    className="font-mono truncate"
                                    title={licenseeAddress}
                                  >
                                    {formatAddress(licenseeAddress)}
                                  </p>
                                );
                              } else {
                                return <p className="text-gray-400">N/A</p>;
                              }
                            })()}
                          </div>
                          {/* Expire date removed as part of Perpetual model */}
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                          <div>
                            <span className="text-sm text-gray-600">Fee Paid:</span>
                            <p className="font-semibold text-gray-900">
                              {formatLicenseFee(license)}
                            </p>
                          </div>
                          {license.transaction_hash && (
                            <a
                              href={getExplorerForNetwork((license.network || artwork?.network || selectedNetwork || "sepolia").toLowerCase()).txUrl(license.transaction_hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800"
                            >
                              View Transaction on {getExplorerForNetwork((license.network || artwork?.network || selectedNetwork || "sepolia").toLowerCase()).name}{" "}
                              <ExternalLink className="w-4 h-4 ml-1" />
                            </a>
                          )}
                        </div>

                        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                          <div>
                            <span className="text-xs text-gray-600">Duration: </span>
                            <span className="text-xs font-medium text-gray-900">
                              {license.duration_days >= 36500 ? "Perpetual (Unlimited)" : `${license.duration_days} days`}
                            </span>
                          </div>

                          {/* ✅ Revoke button for Owner/Creator */}
                          {isOwner && license.is_active && (
                            <button
                              onClick={() => handleRevokeLicense(license.license_id || license.id)}
                              className="inline-flex items-center text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 bg-red-50 rounded hover:bg-red-100 transition-colors"
                              title="Revoke this license"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Revoke License
                            </button>
                          )}
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        artwork={artwork} 
      />
    </div>
  );
};

export default ArtworkDetail;