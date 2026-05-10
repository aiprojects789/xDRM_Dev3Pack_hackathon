import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import {
  Shield,
  ArrowLeft,
  AlertTriangle,
  Info,
  Calendar,
  Percent,
  CreditCard,
  Wallet,
  Database,
  Palette,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { Button } from "@mui/material";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { artworksAPI, licensesAPI } from "../services/api";
import { UserIdentifier, CurrencyConverter, ArtworkStatus } from "../utils/currencyUtils";
import { useSettings } from "../context/SettingsContext";
import toast from "react-hot-toast";
import axios from "axios";
import { useImageProtection } from "../hooks/useImageProtection";
import ProtectedImage from "../components/common/ProtectedImage";
import { 
  PublicKey, 
  Transaction, 
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";

const schema = yup.object({
  license_type: yup
    .string()
    .required("License type is required")
    .oneOf(
      [
        "PERSONAL_USE",
        "NON_COMMERCIAL",
        "COMMERCIAL",
        "EXTENDED_COMMERCIAL",
        "EXCLUSIVE",
        "ARTWORK_OWNERSHIP",
        "CUSTOM",
      ],
      "Invalid license type"
    ),
});

const LicensePage = () => {
  const { artworkId } = useParams();
  const navigate = useNavigate();
  const {
    account,
    algorandAccount,
    isCorrectNetwork,
    sendTransaction,
    purchaseAlgorandLicense,
    connectWallet,
    switchNetwork,
    selectedNetwork,
    // Solana specific
    publicKey,
    sendSolanaTx,
    connection,
    solanaConnected,
  } = useWeb3();
  const { isAuthenticated, user } = useAuth();
  const { enablePayPal, enableCrypto } = useSettings();

  // ✅ Add image protection hook
  useImageProtection(true);

  const [artwork, setArtwork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [transactionHash, setTransactionHash] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [licenseConfig, setLicenseConfig] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("crypto");
  const [platformFeeRate, setPlatformFeeRate] = useState(0.2); // Default 20%
  const [algorandSigningPreview, setAlgorandSigningPreview] = useState(null);

  const normalizeNetworkKey = (value) => {
    const net = String(value || "").toLowerCase().trim();
    if (["algorand", "algo", "algorand_testnet", "algorand-testnet", "algorand testnet"].includes(net)) {
      return "algorand";
    }
    if (["wirefluid", "wire", "wire-fluid"].includes(net)) {
      return "wirefluid";
    }
    if (["sepolia", "ethereum", "eth"].includes(net)) {
      return "sepolia";
    }
    return net;
  };

  const isAlgorandNetwork = (normalizeNetworkKey(selectedNetwork || artwork?.network) === "algorand");
  const isSolanaNetwork = (normalizeNetworkKey(selectedNetwork || artwork?.network) === "solana");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      license_type: "PERSONAL_USE",
    },
  });

  const selectedLicenseType = watch("license_type");
  const selectedPriceInfo = priceInfo?.prices?.[selectedLicenseType];
  
  if (selectedPriceInfo) {
    console.log("DEBUG: selectedPriceInfo for type", selectedLicenseType, ":", selectedPriceInfo);
  }

  const formatAlgoAmount = (value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0 ALGO";
    return CurrencyConverter.formatCrypto(num, "algorand");
  };

  const algorandSummary = React.useMemo(() => {
    const isOnChain = artwork ? ArtworkStatus.isOnChainArtwork(artwork) : false;
    if (!isAlgorandNetwork || !isOnChain || paymentMethod !== "crypto" || !selectedPriceInfo) {
      return null;
    }

    const fallbackLegs = [];
    const estimatedOwnerFee = Number(selectedPriceInfo.license_fee_sol || 0);
    const estimatedPlatformFee = Number(selectedPriceInfo.platform_fee_sol || 0);

    if (estimatedOwnerFee > 0) {
      fallbackLegs.push({
        purpose: "owner_license_net (estimated)",
        to: artwork?.owner_address || "Owner wallet",
        amountAlgo: estimatedOwnerFee,
      });
    }

    if (estimatedPlatformFee > 0) {
      fallbackLegs.push({
        purpose: "platform_fee (estimated)",
        to: "Platform wallet",
        amountAlgo: estimatedPlatformFee,
      });
    }

    const exactLegs = Array.isArray(algorandSigningPreview?.paymentLegs)
      ? algorandSigningPreview.paymentLegs.map((leg) => ({
        purpose: leg.purpose || "payment",
        to: leg.to || "receiver",
        amountAlgo: Number(leg.amount || 0) / 1_000_000,
      }))
      : [];

    const summaryLegs = exactLegs.length > 0 ? exactLegs : fallbackLegs;

    const defaultAppArgs = [
      "purchase_license",
      Number(artwork?.token_id || 0),
      selectedLicenseType,
      36500,
    ];

    return {
      isExact: exactLegs.length > 0,
      appId: algorandSigningPreview?.appId || null,
      appArgs: algorandSigningPreview?.appArgs || defaultAppArgs,
      paymentLegs: summaryLegs,
      totalAlgo: algorandSigningPreview?.buyerTotalAlgo || Number(selectedPriceInfo.total_amount_sol || 0),
    };
  }, [
    isAlgorandNetwork,
    artwork,
    paymentMethod,
    selectedPriceInfo,
    selectedLicenseType,
    algorandSigningPreview,
  ]);

  // Get user identifier
  const userIdentifier = UserIdentifier.getUserIdentifier(user);

  // Fetch artwork data and license prices
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch artwork
        const artworkResponse = await artworksAPI.getById(artworkId);
        console.log("Artwork API response:", artworkResponse);

        if (artworkResponse) {
          setArtwork(artworkResponse);

          // ✅ Check if all payment methods are disabled
          if (!enableCrypto && !enablePayPal) {
            setError("All payment methods are currently disabled by the administrator. Please contact support or try again later.");
            return;
          }

          // ✅ Set payment method based on artwork registration status
          const isOnChain = ArtworkStatus.isOnChainArtwork(artworkResponse);

          if (isOnChain) {
            // On-chain artworks: MUST use crypto
            if (!enableCrypto) {
              setError("Crypto payments are currently disabled by the administrator. This artwork requires crypto payment as it is registered on blockchain.");
              return;
            }
            setPaymentMethod("crypto");
          } else {
            // Off-chain artworks: Can ONLY use off-chain payment methods
            // ✅ Check if PayPal is enabled by admin
            if (!enablePayPal) {
              setError("Off-chain payment methods are currently disabled by the administrator. Please contact support or try again later.");
              return;
            }

            // ✅ Get user's onboarded payment methods (for multiple methods support)
            const availableOffChainMethods = UserIdentifier.getAvailableOffChainPaymentMethods(user);

            // ✅ For buyers: PayPal is always available if enabled by admin (direct checkout)
            // Other methods require onboarding
            const paymentMethodsToShow = [];
            if (enablePayPal) {
              paymentMethodsToShow.push("paypal"); // Always available for buyers
            }
            // Add other onboarded methods (if any)
            availableOffChainMethods.forEach(method => {
              if (method !== "paypal" && !paymentMethodsToShow.includes(method)) {
                paymentMethodsToShow.push(method);
              }
            });

            // Set default payment method
            if (paymentMethodsToShow.length > 0) {
              setPaymentMethod(paymentMethodsToShow[0]);
            } else {
              setPaymentMethod("paypal"); // Default fallback
            }
          }

          // Check if current user is the owner
          if (isAuthenticated && user) {
            // 1. Connection-based check
            const isCryptoOwner =
              account &&
              artworkResponse.owner_address &&
              artworkResponse.owner_address.toLowerCase() ===
              account.toLowerCase();

            // 2. ID-based check
            const isPayPalOwner =
              userIdentifier &&
              artworkResponse.owner_id &&
              String(userIdentifier).trim() === String(artworkResponse.owner_id).trim();

            // 3. Profile-based check (Saved wallet address in profile)
            const isProfileWalletOwner =
              user.wallet_address &&
              artworkResponse.owner_address &&
              user.wallet_address.toLowerCase() === artworkResponse.owner_address.toLowerCase();

            // 4. Email-based check (Fallback)
            const isEmailOwner =
              user.email &&
              artworkResponse.owner_email &&
              user.email.toLowerCase() === artworkResponse.owner_email.toLowerCase();

            setIsOwner(isCryptoOwner || isPayPalOwner || isProfileWalletOwner || isEmailOwner);
          }

          // Fetch license prices based on artwork price
          if (artworkResponse.price > 0) {
            try {
              const pricesResponse = await licensesAPI.getPrices(
                null,
                artworkId
              );
              if (pricesResponse.success) {
                console.log("DEBUG: Prices API Response:", pricesResponse);
                setPriceInfo(pricesResponse);
                setLicenseConfig({
                  durationDays: pricesResponse.duration_days, // ✅ Keep as camelCase for internal state
                  platformFeePercentage: pricesResponse.platform_fee_percentage,
                  configName: pricesResponse.config_name,
                });
              }
            } catch (priceError) {
              console.warn(
                "Failed to fetch dynamic prices, using defaults:",
                priceError
              );

              const platformFeeDecimal = platformFeeRate; // e.g., 0.2 for 20%
              // Fallback to default calculation
              setPriceInfo({
                prices: {
                  PERSONAL_USE: {
                    license_fee_sol: artworkResponse.price * 0.2,
                    platform_fee_sol: artworkResponse.price * platformFeeDecimal,  // ✅ Dynamic platform fee
                    total_amount_sol: (artworkResponse.price * 0.2) + (artworkResponse.price * platformFeeDecimal),
                    license_percentage: 20,
                    duration_days: 36500,
                  },
                  COMMERCIAL: {
                    license_fee_sol: artworkResponse.price * 0.7,
                    platform_fee_sol: artworkResponse.price * platformFeeDecimal,  // ✅ Dynamic platform fee
                    total_amount_sol: (artworkResponse.price * 0.7) + (artworkResponse.price * platformFeeDecimal),
                    license_percentage: 70,
                    duration_days: 36500,
                  },
                  EXCLUSIVE: {
                    license_fee_sol: artworkResponse.price * 0.9,
                    platform_fee_sol: artworkResponse.price * platformFeeDecimal,  // ✅ Dynamic platform fee
                    total_amount_sol: (artworkResponse.price * 0.9) + (artworkResponse.price * platformFeeDecimal),
                    license_percentage: 90,
                    duration_days: 36500,
                  },
                },
                duration_days: 36500,
                platform_fee_percentage: platformFeeRate * 100,  // ✅ Use dynamic fee
                config_name: "Fallback",
              });
            }
          }
        } else {
          setError("Artwork not found");
          return;
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load artwork or pricing information");
      } finally {
        setLoading(false);
      }
    };

    if (artworkId) {
      fetchData();
    }
  }, [artworkId, account, userIdentifier]);

  // ✅ Fetch platform fee percentage (add this new useEffect)
  useEffect(() => {
    const fetchPlatformFee = async () => {
      try {
        const baseURL = import.meta.env.VITE_BASE_URL_BACKEND;
        const response = await axios.get(`${baseURL}/artwork/settings/platform-fee`);
        const feePercentage = response.data.value || response.data.fee || response.data.platform_fee;

        if (feePercentage !== undefined && !isNaN(feePercentage)) {
          setPlatformFeeRate(parseFloat(feePercentage) / 100);
          console.log(`Dynamic platform fee loaded: ${feePercentage}%`);
        }
      } catch (error) {
        console.error("Failed to fetch platform fee, using default 20%", error);
        setPlatformFeeRate(0.2); // Default 20%
      }
    };

    fetchPlatformFee();
  }, []);

  const handlePurchaseLicense = async (data) => {
    // ✅ Handle PayPal payment method
    if (paymentMethod === "paypal") {
      // ✅ Check if PayPal is enabled by admin
      if (!enablePayPal) {
        toast.error("PayPal payments are currently disabled by the administrator.");
        setError("PayPal payments are currently disabled. Please use crypto payment instead.");
        return;
      }

      if (!isAuthenticated) {
        setError("Please log in to purchase a license");
        return;
      }

      if (isOwner) {
        setError("You cannot purchase a license for your own artwork");
        return;
      }

      if (!artwork || artwork.price <= 0) {
        setError("Artwork price is not set or invalid");
        return;
      }

      setPurchasing(true);
      setError(null);

      try {
        const prepToast = toast.loading("Preparing PayPal payment...");

        const licenseResponse = await licensesAPI.purchasePaypal({
          token_id: (artwork?.token_id !== undefined && artwork?.token_id !== null) ? artwork.token_id : null,
          artwork_id: artworkId,
          license_type: data.license_type,
          duration_days: selectedPriceInfo?.duration_days || licenseConfig?.durationDays,
        });

        toast.dismiss(prepToast);

        if (!licenseResponse.success) {
          throw new Error(licenseResponse.detail || licenseResponse.error || "Failed to prepare PayPal payment");
        }

        console.log("PayPal license purchase response:", licenseResponse);

        // Standard PayPal response handling

        // Redirect to PayPal
        if (licenseResponse.approval_url) {
          toast.success("Redirecting to PayPal...");
          window.location.href = licenseResponse.approval_url;
        } else {
          throw new Error("PayPal approval URL not received");
        }
      } catch (err) {
        console.error("PayPal license purchase failed:", err);
        toast.dismiss();
        setError(err.message || "Failed to initiate PayPal payment");
        setPurchasing(false);
      }
      return; // Exit early for PayPal flow
    }

    // ✅ Handle Crypto payment method (existing blockchain flow)
    // Validate that crypto is only used for on-chain artworks
    if (artwork && !ArtworkStatus.isOnChainArtwork(artwork)) {
      setError("Off-chain artworks can only be licensed with off-chain payment methods (PayPal, etc.)");
      setPurchasing(false);
      return;
    }

    if (!isAuthenticated) {
      setError("Please log in to purchase a license");
      return;
    }

    const artworkNetwork = normalizeNetworkKey(artwork?.network || selectedNetwork || "sepolia");
    const activeNetwork = normalizeNetworkKey(selectedNetwork);
    const isAlgorandPurchase = artworkNetwork === "algorand";
    const isSolanaPurchase = artworkNetwork === "solana";

    // Check wallet/network first (for crypto payments)
    if (paymentMethod === "crypto") {
      if (activeNetwork !== artworkNetwork) {
        toast.error(`Please switch to ${artworkNetwork} to proceed with the purchase`);
        setError(`Wrong network. Please switch to ${artworkNetwork} to purchase licenses.`);
        const switched = await switchNetwork(artworkNetwork);
        if (!switched) return;
      }

      const hasExpectedWallet = isAlgorandPurchase ? !!algorandAccount : (isSolanaPurchase ? solanaConnected : !!account);
      if (!hasExpectedWallet) {
        toast.error("Please connect your wallet to proceed with the purchase");
        setError("Wallet not connected. Please connect your wallet to purchase this license.");
        const connected = await connectWallet(artworkNetwork);
        if (!connected) return;
      }
    }

    if (isOwner) {
      setError("You cannot purchase a license for your own artwork");
      return;
    }

    if (!artwork || artwork.price <= 0) {
      setError("Artwork price is not set or invalid");
      return;
    }

    setPurchasing(true);
    setError(null);
    setTransactionHash(null);

    try {
      // ✅ Step 1: Check blockchain health (Bypassed for PSL competition)
      console.log("ℹ️ Blockchain health check bypassed...");
      /*
      const healthResponse = await licensesAPI.getBlockchainHealth();
      console.log("Blockchain health:", healthResponse);

      if (healthResponse.demo_mode) {
        throw new Error("Blockchain service is in demo mode. Real transactions are disabled.");
      }

      if (!healthResponse.connected) {
        throw new Error("Blockchain service is not connected. Please try again later.");
      }
      */

      // Step 2: Prepare license purchase (get REAL transaction data)
      const prepToast = toast.loading("Preparing blockchain transaction...");

      // Determine the active wallet address to send to the backend
      let buyerAddress = null;
      if (isAlgorandPurchase) {
        buyerAddress = algorandAccount;
      } else if (isSolanaPurchase) {
        buyerAddress = publicKey ? publicKey.toString() : null;
      } else {
        buyerAddress = account;
      }

      const licenseResponse = await licensesAPI.purchaseSimple({
        token_id: (artwork?.token_id !== undefined && artwork?.token_id !== null) ? artwork.token_id : null,
        artwork_id: artworkId,
        license_type: data.license_type,
        duration_days: selectedPriceInfo?.duration_days || licenseConfig?.durationDays,
        buyer_address: buyerAddress, // ✅ Pass active wallet address
      });

      toast.dismiss(prepToast);

      if (!licenseResponse.success) {
        throw new Error(licenseResponse.detail || licenseResponse.error || "Failed to prepare license purchase");
      }

      console.log("License response:", licenseResponse);

      // Handle both response formats - with requires_blockchain flag and without
      const requiresBlockchain = licenseResponse.requires_blockchain ||
        (licenseResponse.transaction_data && licenseResponse.mode === "REAL");

      if (requiresBlockchain && licenseResponse.transaction_data) {
        const txData = licenseResponse.transaction_data;

        if (isAlgorandPurchase) {
          const backendLegs = Array.isArray(txData?.payment_legs) ? txData.payment_legs : [];
          const buyerTotalMicroalgos =
            txData?.license_breakdown?.buyer_total_microalgos ||
            backendLegs.reduce((sum, leg) => sum + Number(leg?.amount || 0), 0);

          setAlgorandSigningPreview({
            appId: txData?.appId || null,
            appArgs: Array.isArray(txData?.appArgs) ? txData.appArgs : [],
            paymentLegs: backendLegs,
            buyerTotalAlgo: Number(buyerTotalMicroalgos || 0) / 1_000_000,
          });
        }

        // Prepare transaction parameters for MetaMask
        const txParams = {
          to: txData.to,
          data: txData.data,
          from: account,
          value: txData.value,
        };

        // Add gas settings - handle both EIP-1559 and legacy gas
        if (txData.maxFeePerGas && txData.maxPriorityFeePerGas) {
          txParams.maxFeePerGas = txData.maxFeePerGas;
          txParams.maxPriorityFeePerGas = txData.maxPriorityFeePerGas;
        } else if (txData.gasPrice) {
          txParams.gasPrice = txData.gasPrice;
        }

        // Add gas limit if provided, otherwise let MetaMask estimate
        if (txData.gas) {
          txParams.gasLimit = txData.gas;
        }

        console.log(`Sending REAL transaction to ${isAlgorandPurchase ? "Pera Wallet" : "MetaMask"}:`, txParams);

        // ✅ This WILL trigger MetaMask or Pera Wallet popup
        let txResponse;
        if (isAlgorandPurchase) {
          txResponse = await purchaseAlgorandLicense(txData);
        } else if (isSolanaPurchase) {
          console.log("☀️ Sending Solana transaction:", txData);
          
          if (!publicKey || !connection) {
            throw new Error("Solana wallet or connection not available");
          }

          // ✅ STEP 1: PREPARE INSTRUCTIONS
          const instructions = [];
          const buyerPubkey = publicKey;
          
          console.log("🌐 Solana Network Check:", {
            rpcEndpoint: connection.rpcEndpoint,
            network: connection._network // Internal but useful
          });
          
          // Use data from backend response (txData) with extra safety
          const cleanSellerAddr = (txData.seller_address || "").trim();
          const cleanPlatformAddr = (txData.platform_address || "").trim();
          const cleanCreatorAddr = (txData.creator_address || "").trim();

          if (!cleanSellerAddr || !cleanPlatformAddr) {
            console.error("❌ Missing addresses in txData:", txData);
            throw new Error(`Incomplete transaction data: missing ${!cleanSellerAddr ? "seller" : "platform"} address`);
          }

          let sellerPubkey, platformPubkey, creatorPubkey, memoProgramId;

          try {
            console.log("🔍 Creating Seller PublicKey from:", `'${cleanSellerAddr}'`);
            sellerPubkey = new PublicKey(cleanSellerAddr);
            
            console.log("🔍 Creating Platform PublicKey from:", `'${cleanPlatformAddr}'`);
            platformPubkey = new PublicKey(cleanPlatformAddr);
            
            if (cleanCreatorAddr) {
              console.log("🔍 Creating Creator PublicKey from:", `'${cleanCreatorAddr}'`);
              creatorPubkey = new PublicKey(cleanCreatorAddr);
            }

            // Solana Memo Program ID to attach metadata to the transaction permanently on-chain
            memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
          } catch (pkError) {
            console.error("❌ PublicKey Creation Failed:", pkError);
            throw new Error(`Invalid Solana address format: ${pkError.message}`);
          }

          // 1.1 Add Payment Instructions (Price, Royalty, Platform Fee)
          // Main Price payment to Seller
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: buyerPubkey,
              toPubkey: sellerPubkey,
              lamports: parseInt(txData.seller_amount || 0),
            })
          );

          // Platform Fee payment
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: buyerPubkey,
              toPubkey: platformPubkey,
              lamports: parseInt(txData.platform_amount || 0),
            })
          );

          // 1.2 Add On-Chain Metadata using Solana Memo Program
          if (memoProgramId) {
            // This string will be permanently visible on the Solana Explorer for this transaction
            const memoText = `xDRM License: ${data.license_type} | Artwork: ${artworkId} | Buyer: ${buyerPubkey.toString()}`;
            
            instructions.push(
              new TransactionInstruction({
                keys: [{ pubkey: buyerPubkey, isSigner: true, isWritable: false }], // Add signer for accountability
                programId: memoProgramId,
                data: new TextEncoder().encode(memoText),
              })
            );
            console.log("📝 Added On-Chain Metadata Memo:", memoText);
          }

          // ✅ STEP 2: BUILD & SEND TRANSACTION
          const transaction = new Transaction().add(...instructions);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = publicKey;

          const signature = await sendSolanaTx(transaction, connection);
          txResponse = { hash: signature };
          
          // Wait for confirmation
          const loadingToast = toast.loading("Confirming Solana transaction...");
          try {
            await connection.confirmTransaction({
              signature,
              blockhash,
              lastValidBlockHeight
            }, 'confirmed');
            toast.success("Solana transaction confirmed!", { id: loadingToast });
          } catch (confirmError) {
            console.error("Solana confirmation error:", confirmError);
            toast.dismiss(loadingToast);
            // We continue as the backend will verify the signature anyway
          }
        } else {
          txResponse = await sendTransaction(txParams);
        }

        if (!txResponse || !txResponse.hash) {
          throw new Error("No transaction hash received from wallet");
        }

        setTransactionHash(txResponse.hash);
        // Step 3: Confirm the transaction with backend
        const confirmToast = toast.loading("Confirming transaction on blockchain...");

        try {
          const confirmResponse = await licensesAPI.confirmPurchase({
            tx_hash: txResponse.hash,
            token_id: (artwork?.token_id !== undefined && artwork?.token_id !== null) ? artwork.token_id : null,
            artwork_id: artworkId,
            license_type: data.license_type,
            network: artwork?.network,
            duration_days: selectedPriceInfo?.duration_days || licenseConfig?.durationDays,
          });

          toast.dismiss(confirmToast);

          if (confirmResponse.success) {
            toast.success("✅ License purchased successfully! Transaction confirmed on blockchain.");

            // Navigate to licenses page
            setTimeout(() => {
              navigate("/licenses");
            }, 3000);
          } else {
            throw new Error(confirmResponse.detail || confirmResponse.error || "Failed to confirm transaction on blockchain");
          }
        } catch (confirmError) {
          toast.dismiss(confirmToast);
          // Even if confirmation fails, the transaction might still succeed on blockchain
          console.warn("Confirmation failed, but transaction might still succeed:", confirmError);
          toast.success("✅ Transaction submitted! Please check your licenses page in a few moments.");

          setTimeout(() => {
            navigate("/licenses");
          }, 3000);
        }
      } else {
        // This should not happen in real mode
        throw new Error("Invalid response: Blockchain transaction required but not provided");
      }
    } catch (err) {
      console.error("License purchase failed:", err);
      toast.dismiss();

      // Handle specific error cases
      if (err.code === 4001) {
        setError("Transaction cancelled by user in wallet");
      } else if (err.code === -32603) {
        setError("Transaction failed. Please check your gas settings and try again.");
      } else if (err.message?.includes("insufficient funds")) {
        setError(`Insufficient funds. Please add ${CurrencyConverter.getSymbol(artwork?.network)} to your wallet.`);
      } else if (err.message?.includes("user rejected") || err.message?.includes("denied")) {
        setError("Transaction rejected by user in wallet.");
      } else if (err.message?.includes("demo mode")) {
        setError("Blockchain service is in demo mode. Real transactions are disabled.");
      } else if (err.message?.includes("not connected")) {
        setError("Blockchain service is not available. Please try again later.");
      } else {
        // Extract clean error message
        const errorMsg = err.response?.data?.detail ||
          err.response?.data?.error ||
          err.message ||
          "License purchase failed. Please try again.";
        setError(errorMsg);
      }
    } finally {
      setPurchasing(false);
    }
  };

  const formatAddress = (address) => {
    if (!address) return "Unknown";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  // Format price display
  const formatPrice = (amount) => {
    if (amount === undefined || amount === null) return "N/A";
    if (amount === 0 || amount === "0") return CurrencyConverter.formatCrypto(0, artwork?.network);

    return CurrencyConverter.formatCrypto(amount, artwork?.network);
  };

  const getLicenseTypeInfo = (type) => {
    const info = {
      PERSONAL_USE: {
        name: "Personal Use",
        description: "For personal, non-commercial projects and private display.",
        features: [
          "Private display and use",
          "Personal social media posts",
          "Educational and research use",
          "No commercial profit allowed",
        ],
      },
      NON_COMMERCIAL: {
        name: "Non-Commercial",
        description: "For public display in non-profit contexts.",
        features: [
          "Public display (non-profit)",
          "Attribution required",
          "No reselling or commercial use",
          "Community and open-source use",
        ],
      },
      COMMERCIAL: {
        name: "Commercial",
        description: "Standard business use for marketing and promotion.",
        features: [
          "Business marketing and ads",
          "Website and blog usage",
          "Promotion on social media",
          "Limited to 500,000 digital views",
        ],
      },
      EXTENDED_COMMERCIAL: {
        name: "Extended Commercial",
        description: "Unlimited commercial use, including physical merchandise.",
        features: [
          "Unlimited digital impressions",
          "Physical merchandise (shirts, prints)",
          "Book covers and album art",
          "No attribution required",
        ],
      },
      EXCLUSIVE: {
        name: "Exclusive",
        description: "Full exclusivity. No one else can purchase this license.",
        features: [
          "One-of-a-kind licensing",
          "Sole usage rights for the duration",
          "Prevents any other license sales",
          "High-value brand protection",
        ],
      },
      ARTWORK_OWNERSHIP: {
        name: "Artwork Ownership",
        description: "Full transfer of copyright and ownership rights.",
        features: [
          "Complete legal ownership transfer",
          "Unrestricted commercial usage",
          "Right to resell as owner",
          "Permanent on-chain record update",
        ],
      },
      CUSTOM: {
        name: "Custom",
        description: "Terms individually negotiated with the artist.",
        features: [
          "Bespoke usage terms",
          "Individually negotiated pricing",
          "Specific duration and territory",
          "Requires artist approval",
        ],
      },
    };
    return info[type] || info["PERSONAL_USE"]; // Changed default to PERSONAL_USE
  };

  // Calculate expiration date
  const calculateExpirationDate = () => {
    const duration = selectedPriceInfo?.duration_days || licenseConfig?.durationDays;
    if (!duration) return null;
    const today = new Date();
    const expiration = new Date();
    expiration.setDate(today.getDate() + duration);
    return expiration.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  if (error && !artwork) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Artwork Not Found
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            to="/explorer"
            className="px-4 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900"
          >
            Back to Explorer
          </Link>
        </div>
      </div>
    );
  }

  const expirationDate = calculateExpirationDate();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="text-center flex-1">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-800 p-3 rounded-full">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Purchase License
          </h1>
          <p className="text-lg text-gray-600">
            {artwork?.title || `Artwork #${tokenId}`}
          </p>
        </div>
        <Link
          to={`/explorer`}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 mr-1 inline" />
          Back to Explorer
        </Link>
      </div>

      {/* Owner Warning */}
      {isOwner && (
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start">
            <Info className="w-6 h-6 text-yellow-600 mt-0.5 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                You Own This Artwork
              </h3>
              <p className="text-yellow-700">
                You cannot purchase a license for your own artwork. You already
                have full rights to use it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {transactionHash && (
        <div className="mb-8 bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Transaction Submitted!
            </h3>
            <p className="text-green-600 mb-4">
              Your license purchase has been submitted to the blockchain.
            </p>
            <div className="bg-white p-3 rounded border">
              <p className="text-sm text-gray-600 mb-1">Transaction Hash:</p>
              <a
                href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-blue-600 hover:text-blue-800 break-all flex items-center justify-center cursor-pointer"
              >
                {transactionHash}
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Artwork Details */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
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
            {artwork ? (
              (() => {
                // Get image URL from database (GridFS) instead of IPFS
                const baseUrl = import.meta.env.VITE_BASE_URL_BACKEND || '';
                const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                const imageUrl = artwork.image_url
                  ? (artwork.image_url.startsWith('http') ? artwork.image_url : `${cleanBaseUrl}${artwork.image_url}`)
                  : (artwork.id || artwork._id || artwork.token_id)
                    ? `${cleanBaseUrl}/artwork/${artwork.id || artwork._id || artwork.token_id}/image`
                    : null;

                return imageUrl ? (
                  <>
                    {/* DB Badge - indicates image is fetched from database */}
                    <div className="absolute top-2 right-2 z-20">
                      <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-md">
                        <Database className="w-3 h-3 mr-1" />
                        DB
                      </div>
                    </div>

                    {/* Protected Canvas Image */}
                    <ProtectedImage
                      imageUrl={imageUrl}
                      alt={artwork.title || `Artwork ${artwork.token_id}`}
                      className="w-full h-full"
                      aspectRatio="square"
                      showToast={true}
                      onError={() => {
                        const placeholder = document.querySelector('.image-placeholder');
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />

                    <div className="image-placeholder text-center absolute inset-0 flex flex-col items-center justify-center" style={{ display: 'none' }}>
                      <Palette className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Image unavailable</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Shield className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Artwork #{tokenId}</p>
                  </div>
                );
              })()
            ) : (
              <div className="text-center">
                <Shield className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Artwork #{tokenId}</p>
              </div>
            )}
          </div>

          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {artwork?.title || `Artwork #${tokenId}`}
            </h2>

            {artwork?.description && (
              <p className="text-gray-600 mb-4">{artwork.description}</p>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Creator</span>
                <div className="text-right">
                  {/* ✅ For PayPal artworks, show name/email; for crypto, show address */}
                  {!ArtworkStatus.isOnChainArtwork(artwork) && (artwork?.creator_name || artwork?.creator_email) ? (
                    <div className="text-sm text-gray-900">
                      {artwork.creator_name && <div className="font-medium">{artwork.creator_name}</div>}
                      {artwork.creator_email && <div className="text-xs text-gray-500">{artwork.creator_email}</div>}
                    </div>
                  ) : (
                    <span className="text-sm font-mono text-gray-900">
                      {artwork?.creator_solana_address || artwork?.creator_address
                        ? formatAddress(artwork.creator_solana_address || artwork.creator_address)
                        : artwork?.creator_id || "Unknown"}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Current Owner</span>
                <div className="text-right">
                  {/* ✅ For PayPal artworks, show name/email; for crypto, show address */}
                  {!ArtworkStatus.isOnChainArtwork(artwork) && (artwork?.owner_name || artwork?.owner_email) ? (
                    <div className="text-sm text-gray-900">
                      {artwork.owner_name && <div className="font-medium">{artwork.owner_name}</div>}
                      {artwork.owner_email && <div className="text-xs text-gray-500">{artwork.owner_email}</div>}
                      {isOwner && (
                        <span className="ml-2 text-blue-600 text-xs">(You)</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm font-mono text-gray-900">
                      {artwork?.owner_solana_address || artwork?.owner_address
                        ? formatAddress(artwork.owner_solana_address || artwork.owner_address)
                        : artwork?.owner_id || "Unknown"}
                      {isOwner && (
                        <span className="ml-2 text-blue-600 text-xs">(You)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Artwork Price</span>
                <span className="text-sm font-semibold text-gray-900">
                  {artwork?.price ? formatPrice(artwork.price) : "Not set"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Royalty</span>
                <span className="text-sm font-semibold text-gray-900">
                  {(artwork?.royalty_percentage / 100).toFixed(2)}%
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Token ID</span>
                <span className="text-sm font-semibold text-gray-900">
                  #{artwork?.token_id}
                </span>
              </div>

              {artwork?.payment_method && artwork?.registration_method !== "competition" && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Payment Method</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {artwork.payment_method === "paypal" ? "PayPal" : "Crypto"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* License Purchase Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6">
            License Options
          </h3>

          {!isAuthenticated ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Authentication Required
              </h4>
              <p className="text-gray-600">
                Please log in to purchase a license.
              </p>
            </div>
          ) : isOwner ? (
            <div className="text-center py-8">
              <Info className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                You Own This Artwork
              </h4>
              <p className="text-gray-600">
                As the owner, you have full rights to this artwork without
                needing a license.
              </p>
            </div>
          ) : artwork?.price <= 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Price Not Set
              </h4>
              <p className="text-gray-600">
                This artwork does not have a price set. Cannot purchase license.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(handlePurchaseLicense)}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  License Type
                </label>
                <select
                  {...register("license_type")}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-800 focus:border-blue-800 ${errors.license_type ? "border-red-300" : "border-gray-300"
                    }`}
                >
                  <option value="PERSONAL_USE">Personal Use</option>
                  <option value="NON_COMMERCIAL">Non-Commercial</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="EXTENDED_COMMERCIAL">Extended Commercial</option>
                  <option value="EXCLUSIVE">Exclusive (Full Exclusivity)</option>
                  <option value="ARTWORK_OWNERSHIP">Artwork Ownership (Copyright Transfer)</option>
                  <option value="CUSTOM">Custom (Negotiated)</option>
                </select>
                {errors.license_type && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.license_type.message}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                {(() => {
                  // ✅ Standard payment method selection (Always Crypto)
                  if (!enableCrypto) {
                    return (
                      <div className="w-full px-4 py-3 border border-red-300 rounded-lg bg-red-50">
                        <p className="text-red-700 text-sm font-medium">
                          Crypto payments are currently disabled. This platform requires crypto payment.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800"
                        disabled
                      >
                        <option value="crypto">
                          {isAlgorandNetwork ? "Algorand Wallet (Pera/Kibisis)" : (isSolanaNetwork ? "Solana Wallet" : "MetaMask (Crypto)")}
                        </option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        {isAlgorandNetwork
                          ? "Purchase license on Algorand using Pera/Kibisis wallet"
                          : (isSolanaNetwork ? "Purchase license using your Solana wallet" : "Purchase license on blockchain using MetaMask")}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* License Type Description */}
              {selectedLicenseType && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">
                    {getLicenseTypeInfo(selectedLicenseType).name}
                  </h4>
                  <p className="text-blue-700 text-sm mb-3">
                    {getLicenseTypeInfo(selectedLicenseType).description}
                  </p>
                  <ul className="text-blue-600 text-sm space-y-1">
                    {getLicenseTypeInfo(selectedLicenseType).features.map(
                      (feature, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{feature}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

              {/* Duration Information */}
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center text-green-800">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span className="font-medium text-sm">
                    License Duration: Perpetual (Lifetime Access)
                  </span>
                </div>
              </div>

              {/* Fee Breakdown */}
              {selectedPriceInfo && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Fee Breakdown
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Artwork Price:</span>
                      <span className="font-mono font-medium">
                        {formatPrice(artwork?.price)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">License Percentage:</span>
                      <span className="font-mono text-blue-600">
                        {selectedPriceInfo.license_percentage}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">License Fee:</span>
                      <span className="font-mono font-medium">
                        {formatPrice(selectedPriceInfo.license_fee_sol)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Platform Fee:</span>
                      <span className="font-mono text-blue-600">
                        +{formatPrice(selectedPriceInfo.platform_fee_sol)}
                      </span>
                    </div>

                    {/* ✅ Add Responsible Use Add-on if active */}
                    {priceInfo?.responsible_use_addon_active && (
                      <div className="flex justify-between p-2 bg-blue-50 rounded border border-blue-100 mt-1">
                        <div className="flex items-center">
                          <Shield className="w-3 h-3 text-blue-600 mr-1" />
                          <span className="text-xs font-semibold text-blue-800">Responsible Use Add-on:</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-blue-700">
                          +{formatPrice(selectedPriceInfo.addon_fee_sol)}
                        </span>
                      </div>
                    )}

                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-medium">
                        <span className="text-gray-900">Total Amount:</span>
                        <span className="font-mono text-green-600">
                          {formatPrice(selectedPriceInfo.total_amount_sol)}
                        </span>
                      </div>
                      {/* <div className="flex justify-between text-xs text-gray-500">
                        <span>Owner Receives:</span>
                        <span>
                          
                            {formatPrice(
                              selectedPriceInfo.license_fee_sol - selectedPriceInfo.platform_fee_sol
                            )}
                        </span>
                      </div> */}
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ Signing Summary hidden as requested */}
              {/* {algorandSummary && (
                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <h4 className="font-semibold text-indigo-900 mb-2">Signing Summary (Algorand)</h4>
                  <p className="text-sm text-indigo-800 mb-2">
                    License Type: <span className="font-semibold">{selectedLicenseType}</span>
                  </p>
                  <p className="text-xs text-indigo-700 mb-3">
                    App Call: <span className="font-mono">purchase_license</span>
                    {algorandSummary.appId ? ` (App ID: ${algorandSummary.appId})` : ""}
                  </p>
                  <p className="text-xs text-indigo-700 mb-3 break-all">
                    App Args Preview: <span className="font-mono">[{algorandSummary.appArgs.map((arg) => String(arg)).join(", ")}]</span>
                  </p>

                  <div className="space-y-1 text-sm">
                    {algorandSummary.paymentLegs.map((leg, idx) => (
                      <div key={`${leg.to}-${idx}`} className="flex justify-between">
                        <span className="text-indigo-800">
                          {idx + 1}. {leg.purpose}
                        </span>
                        <span className="font-mono text-indigo-900">{formatAlgoAmount(leg.amountAlgo)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-indigo-200 mt-3 pt-2 flex justify-between">
                    <span className="text-sm font-semibold text-indigo-900">Total To Sign</span>
                    <span className="font-mono font-semibold text-indigo-900">{formatAlgoAmount(algorandSummary.totalAlgo)}</span>
                  </div>

                  <p className="text-xs text-indigo-700 mt-2">
                    {algorandSummary.isExact
                      ? "Exact signing data loaded from backend prepare response."
                      : "Estimated preview. Exact payment legs will be loaded from backend just before wallet signature."}
                  </p>
                </div>
              )} */}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={purchasing || !selectedPriceInfo}
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                className="py-3"
              >
                {purchasing ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    <span>Processing Purchase...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <Shield className="w-5 h-5 mr-2" />
                    {selectedPriceInfo ? (
                      <>
                        {artwork?.registration_method === "competition"
                          ? `Purchase License for ${formatPrice(selectedPriceInfo.total_amount_sol)} (Competition)`
                          : `Purchase License (${formatPrice(selectedPriceInfo.total_amount_sol)})`
                        }
                      </>
                    ) : (
                      <>Calculate Price...</>
                    )}
                  </div>
                )}
              </Button>

              <div className="mt-4 text-xs text-gray-500 text-center">
                <p>
                  By purchasing a license, you agree to the platform's terms and
                  conditions.
                </p>
                <p className="mt-1">
                  License is {selectedPriceInfo?.duration_days >= 36500 ? "Perpetual (Unlimited)" : `valid for ${selectedPriceInfo?.duration_days} days`} from purchase.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Configuration Information */}
      {licenseConfig && (
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start">
            <Info className="w-6 h-6 text-blue-800 mt-0.5 mr-3" />
            <div>
              <h4 className="text-lg font-semibold text-blue-900 mb-2">
                License Configuration: {licenseConfig.configName}
              </h4>
              <p className="text-blue-800 mb-3">
                License fees are calculated as a percentage of the artwork
                price.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                {[
                  "PERSONAL_USE",
                  "NON_COMMERCIAL",
                  "COMMERCIAL",
                  "EXTENDED_COMMERCIAL",
                  "EXCLUSIVE",
                  "ARTWORK_OWNERSHIP",
                  "CUSTOM",
                ].map((type) => (
                  <div key={type} className="bg-white p-3 rounded-lg border border-blue-200">
                    <h5 className="font-medium text-blue-900 mb-1 flex items-center">
                      <Percent className="w-4 h-4 mr-1" /> {getLicenseTypeInfo(type).name}
                    </h5>
                    <p className="text-blue-700">
                      {priceInfo?.prices?.[type]?.license_percentage || "---"}% of price
                    </p>
                    <p className="text-blue-600 font-mono mt-1">
                      {formatPrice(priceInfo?.prices?.[type]?.total_amount_sol || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicensePage;
