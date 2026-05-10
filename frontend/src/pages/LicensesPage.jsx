import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { UserIdentifier, CurrencyConverter } from "../utils/currencyUtils";
import {
  Shield,
  ExternalLink,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wallet,
  CreditCard,
} from "lucide-react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { licensesAPI } from "../services/api";
import toast from "react-hot-toast";
import { Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";

const truncateId = (id) => {
  if (!id) return "N/A";
  const idStr = String(id);
  if (idStr.length <= 16) return idStr;
  return `${idStr.substring(0, 6)}...${idStr.substring(idStr.length - 4)}`;
};

const LicensesPage = () => {
  const { account, sendTransaction, publicKey, connection, sendSolanaTx } = useWeb3();
  const { isAuthenticated, user } = useAuth();

  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("purchased");
  const [error, setError] = useState(null);

  // Get user identifier
  const userIdentifier = UserIdentifier.getUserIdentifier(user);
  // ✅ Use capability checks instead of user type
  const availablePaymentMethods = UserIdentifier.getAvailablePaymentMethods(user);
  const hasPayPal = UserIdentifier.hasPaymentMethod(user, "paypal");
  const hasWallet = UserIdentifier.hasWalletAddress(user);

  useEffect(() => {
    if (isAuthenticated && userIdentifier) {
      fetchLicenses();
    }
  }, [isAuthenticated, userIdentifier, activeTab]);

  const fetchLicenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const asLicensee = activeTab === "purchased";
      console.log(
        `🔍 Fetching licenses for ${userIdentifier} as ${asLicensee ? "licensee" : "licensor"
        }`
      );

      const response = await licensesAPI.getByUser(userIdentifier, {
        as_licensee: asLicensee,
      });

      console.log("📄 Raw licenses response:", response);

      if (response.licenses) {
        setLicenses(response.licenses);
      } else if (response.data) {
        setLicenses(response.data);
      } else {
        setLicenses([]);
      }

      console.log(`✅ Found ${licenses.length} licenses`);

    } catch (err) {
      console.error("Failed to fetch licenses:", err);
      setError("Failed to load licenses");
      setLicenses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeLicense = async (licenseId) => {
    if (activeTab !== "sold") {
      toast.error("Only licensors can revoke licenses");
      return;
    }

    if (!window.confirm("Are you sure you want to revoke this license? This action cannot be undone and will record the revocation on the blockchain.")) {
      return;
    }

    try {
      const revokeToast = toast.loading("Preparing license revocation...");
      const response = await licensesAPI.revoke(licenseId);
      toast.dismiss(revokeToast);

      if (response.already_revoked) {
        toast.success(response.message);
        fetchLicenses();
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
          const transaction = new Transaction().add(
            new TransactionInstruction({
              keys: [],
              programId: new PublicKey(program_id),
              data: Buffer.from(memo),
            })
          );

          const signToast = toast.loading("Please sign the transaction in your Solana wallet...");
          const txHash = await sendSolanaTx(transaction, connection);
          toast.dismiss(signToast);

          if (!txHash) throw new Error("Failed to receive transaction hash");

          const confirmToast = toast.loading("Confirming on platform...");
          const confirmRes = await licensesAPI.confirmRevoke(licenseId, { tx_hash: txHash });
          toast.dismiss(confirmToast);

          if (confirmRes.success) {
            toast.success("License revoked successfully on Solana!");
            fetchLicenses();
          } else {
            toast.error(confirmRes.message || "Failed to confirm revocation");
          }
        } catch (solError) {
          toast.error(solError.message || "Solana transaction failed");
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
            fetchLicenses();
          } else {
            toast.error(confirmRes.message || "Failed to confirm revocation");
          }
        } catch (err) {
          toast.error(err.message || "EVM transaction failed");
        }
      } else {
        if (response.success) {
          toast.success("License revoked successfully!");
          fetchLicenses();
        } else {
          toast.error(response.message || "Failed to revoke license");
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Failed to revoke");
    }
  };

  // ✅ UPDATED: Calculate days remaining with fallbacks
  const calculateDaysRemaining = (license) => {
    // First try end_date
    if (license.end_date) {
      try {
        const end = new Date(license.end_date);
        const now = new Date();
        const diffTime = end - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
      } catch {
        // Fall through to duration calculation
      }
    }

    // Calculate from purchase_time + duration_days
    if (license.purchase_time && license.duration_days) {
      try {
        const purchaseDate = new Date(license.purchase_time);
        const endDate = new Date(purchaseDate);
        endDate.setDate(purchaseDate.getDate() + license.duration_days);

        // Handle perpetual licenses (100 years = perpetual)
        if (license.duration_days >= 36500) {
          return null; // Signals lifetime access
        }
        const now = new Date();
        const diffTime = endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
      } catch {
        return null;
      }
    }

    return null;
  };

  // ✅ UPDATED: Format license amount with better fallbacks
  const formatLicenseAmount = (license) => {
    // Try multiple possible amount fields, prioritizing Solana fields
    const amount =
      license.total_amount_sol ||
      license.actual_amount_sol ||
      license.total_amount_eth ||
      license.actual_amount_eth ||
      license.fee_paid ||
      0;

    // Use unified formatDual helper which handles symbol and conversion
    return CurrencyConverter.formatDual(amount, license.network || "solana");
  };

  const getLicenseTypeInfo = (type) => {
    const info = {
      PERSONAL_USE: {
        name: "Personal Use",
        color: "blue",
        bgColor: "bg-blue-50",
        textColor: "text-blue-800",
        borderColor: "border-blue-200",
        badgeBg: "bg-blue-100",
        description: "Personal and non-commercial display only",
      },
      NON_COMMERCIAL: {
        name: "Non-Commercial",
        color: "purple",
        bgColor: "bg-purple-50",
        textColor: "text-purple-800",
        borderColor: "border-purple-200",
        badgeBg: "bg-purple-100",
        description: "Educational or non-profit usage rights",
      },
      COMMERCIAL: {
        name: "Commercial",
        color: "green",
        bgColor: "bg-green-50",
        textColor: "text-green-800",
        borderColor: "border-green-200",
        badgeBg: "bg-green-100",
        description: "Standard commercial marketing usage",
      },
      EXTENDED_COMMERCIAL: {
        name: "Extended Commercial",
        color: "indigo",
        bgColor: "bg-indigo-50",
        textColor: "text-indigo-800",
        borderColor: "border-indigo-200",
        badgeBg: "bg-indigo-100",
        description: "Unlimited commercial use & resale rights",
      },
      EXCLUSIVE: {
        name: "Exclusive",
        color: "orange",
        bgColor: "bg-orange-50",
        textColor: "text-orange-800",
        borderColor: "border-orange-200",
        badgeBg: "bg-orange-100",
        description: "Sole access and full usage rights",
      },
      RESPONSIBLE_USE: {
        name: "Responsible Use",
        color: "teal",
        bgColor: "bg-teal-50",
        textColor: "text-teal-800",
        borderColor: "border-teal-200",
        badgeBg: "bg-teal-100",
        description: "Ethical usage with AI protection (Legacy)",
      },
      ARTWORK_OWNERSHIP: {
        name: "Artwork Ownership",
        color: "rose",
        bgColor: "bg-rose-50",
        textColor: "text-rose-800",
        borderColor: "border-rose-200",
        badgeBg: "bg-rose-100",
        description: "Full IP transfer and digital ownership",
      },
      CUSTOM: {
        name: "Custom",
        color: "gray",
        bgColor: "bg-gray-50",
        textColor: "text-gray-800",
        borderColor: "border-gray-200",
        badgeBg: "bg-gray-100",
        description: "Individually negotiated license terms",
      },
      // Legacy compatibility
      LINK_ONLY: {
        name: "Link Only",
        color: "blue",
        bgColor: "bg-blue-50",
        textColor: "text-blue-800",
        borderColor: "border-blue-200",
        badgeBg: "bg-blue-100",
        description: "Basic access to artwork link",
      },
      ACCESS_WITH_WM: {
        name: "Access with Watermark",
        color: "purple",
        bgColor: "bg-purple-50",
        textColor: "text-purple-800",
        borderColor: "border-purple-200",
        badgeBg: "bg-purple-100",
        description: "Full access with watermark protection",
      },
      FULL_ACCESS: {
        name: "Full Access",
        color: "green",
        bgColor: "bg-green-50",
        textColor: "text-green-800",
        borderColor: "border-green-200",
        badgeBg: "bg-green-100",
        description: "Complete access without restrictions",
      },
    };
    return info[type] || info["PERSONAL_USE"];
  };

  const formatAddress = (address) => {
    if (!address) return "Unknown";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  const getExplorerTxUrl = (license) => {
    const txHash = license?.transaction_hash;
    if (!txHash) return null;

    const network = String(license?.network || "").toLowerCase();
    if (network === "algorand") {
      return `https://testnet.explorer.perawallet.app/tx/${txHash}`;
    }
    if (network === "wirefluid") {
      return `https://wirefluidscan.com/tx/${txHash}`;
    }

    return `https://sepolia.etherscan.io/tx/${txHash}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    } catch {
      return "Invalid date";
    }
  };

  // ✅ UPDATED: Get actual duration days with fallback (Default to Perpetual 36500)
  const getDurationDays = (license) => {
    return license.duration_days || 36500;
  };

  // ✅ UPDATED: Check if license is active (No expiration check needed for perpetual)
  const isLicenseActive = (license) => {
    return license.is_active;
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-8">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Authentication Required
          </h2>
          <p className="text-gray-600 mb-4">
            Please log in to view your licenses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="bg-blue-800 p-3 rounded-full">
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Licenses</h1>
        <p className="text-lg text-gray-600">Manage your artwork licenses</p>
        <p className="text-sm text-gray-500 mt-1">
          Available Methods: {availablePaymentMethods.length > 0 ? availablePaymentMethods.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ') : 'None'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          User ID: {userIdentifier}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 rounded-lg p-1 inline-flex">
          <button
            onClick={() => setActiveTab("purchased")}
            className={`px-6 py-2 rounded-md font-medium transition-colors ${activeTab === "purchased"
                ? "bg-white text-blue-800 shadow"
                : "text-gray-600 hover:text-gray-900"
              }`}
          >
            Licenses Purchased
          </button>
          <button
            onClick={() => setActiveTab("sold")}
            className={`px-6 py-2 rounded-md font-medium transition-colors ${activeTab === "sold"
                ? "bg-white text-blue-800 shadow"
                : "text-gray-600 hover:text-gray-900"
              }`}
          >
            Licenses Sold
          </button>
        </div>
      </div>

      {/* Debug Info */}
      {licenses.length > 0 && (
        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            Showing {licenses.length} licenses as{" "}
            <strong>{activeTab === "purchased" ? "Buyer" : "Owner"}</strong>
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="large" />
        </div>
      ) : error ? (
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            Error Loading Licenses
          </h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchLicenses}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      ) : licenses.length === 0 ? (
        <div className="text-center bg-gray-50 border border-gray-200 rounded-lg p-8">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Licenses {activeTab === "purchased" ? "Purchased" : "Sold"} Yet
          </h3>
          <p className="text-gray-600 mb-4">
            {activeTab === "purchased"
              ? "You haven't purchased any licenses yet. Explore artworks to get started."
              : "You haven't sold any licenses yet. Set prices for your artworks to start licensing."}
          </p>
          {activeTab === "purchased" && (
            <Link
              to="/explorer"
              className="inline-block px-6 py-3 bg-blue-800 text-white rounded-lg hover:bg-blue-900"
            >
              Explore Artworks
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {licenses.map((license) => {
            const licenseInfo = getLicenseTypeInfo(license.license_type);
            const isActive = isLicenseActive(license);
            const durationDays = getDurationDays(license);

            return (
              <div
                key={license.license_id || license.token_id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* License Header */}
                <div
                  className={`${licenseInfo.bgColor} p-4 border-b ${licenseInfo.borderColor}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-3 py-1 ${licenseInfo.badgeBg} ${licenseInfo.textColor} text-sm font-medium rounded-full`}
                    >
                      {licenseInfo.name}
                    </span>
                    {isActive ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {licenseInfo.description}
                  </p>
                </div>

                {/* License Details */}
                <div className="p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Artwork Token ID
                      </div>
                      <Link
                        to={`/artwork/${license.artwork_id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium flex items-center"
                      >
                        #{truncateId(license.token_id)}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Link>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        License ID
                      </div>
                      <div className="font-mono text-sm text-gray-900">
                        #{truncateId(license.license_id)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        {activeTab === "purchased" ? "Owner" : "Buyer"}
                      </div>
                      <div className="text-sm text-gray-900">
                        {(() => {
                          // ✅ For purchased licenses: Show owner info
                          if (activeTab === "purchased") {
                            // ✅ For off-chain (PayPal) licenses: ALWAYS show email (not ID)
                            if (license.payment_method === "paypal" || !license.owner_address) {
                              // ✅ Priority: Email > Name > ID (but prefer email)
                              if (license.owner_email) {
                                return license.owner_email;
                              } else if (license.owner_name) {
                                return license.owner_name;
                              } else if (license.owner_id) {
                                // ✅ Fallback: Show ID only if email/name not available
                                return `${license.owner_id.substring(0, 8)}...`;
                              } else {
                                return "Unknown";
                              }
                            } else {
                              // ✅ For on-chain licenses: Show wallet address
                              return formatAddress(license.owner_address);
                            }
                          } else {
                            // ✅ For sold licenses: Show buyer info
                            if (license.payment_method === "paypal" || !license.buyer_address) {
                              // ✅ Priority: Email > Name > ID (but prefer email)
                              if (license.buyer_email) {
                                return license.buyer_email;
                              } else if (license.buyer_name) {
                                return license.buyer_name;
                              } else if (license.buyer_id) {
                                // ✅ Fallback: Show ID only if email/name not available
                                return `${license.buyer_id.substring(0, 8)}...`;
                              } else {
                                return "Unknown";
                              }
                            } else {
                              // ✅ For on-chain licenses: Show wallet address
                              return formatAddress(license.buyer_address);
                            }
                          }
                        })()}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Amount Paid
                      </div>
                      <div className="font-semibold text-gray-900">
                        {formatLicenseAmount(license)}
                      </div>
                    </div>

                    {license.payment_method && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">
                          Payment Method
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${license.payment_method === "paypal"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-blue-100 text-blue-800"
                            }`}
                        >
                          {license.payment_method === "paypal" ? (
                            <CreditCard className="w-3 h-3 mr-1" />
                          ) : (
                            <Wallet className="w-3 h-3 mr-1" />
                          )}
                          {license.payment_method === "paypal"
                            ? "PayPal"
                            : "Crypto"}
                        </span>
                      </div>
                    )}

                    {license.transaction_hash && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1 flex items-center">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Transaction Detail
                        </div>
                        {(() => {
                          const txUrl = getExplorerTxUrl(license);
                          if (!txUrl) return null;
                          return (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 font-mono break-all flex items-center"
                            >
                              {license.transaction_hash.substring(0, 15)}...
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          );
                        })()}
                      </div>
                    )}

                    {license.purchase_time && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1 flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          Purchase Date
                        </div>
                        <div className="text-sm text-gray-900">
                          {formatDate(license.purchase_time)}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Duration
                      </div>
                      <div className="text-sm text-gray-900">
                        Perpetual (Lifetime)
                      </div>
                    </div>

                    {license.terms_hash && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1 flex items-center">
                          <Database className="w-3 h-3 mr-1" />
                          License Terms (IPFS)
                        </div>
                        <a
                          href={`https://ipfs.io/ipfs/${license.terms_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 font-mono break-all flex items-center"
                        >
                          {license.terms_hash.substring(0, 15)}...
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    )}

                    <div className="pt-3 border-t">
                      <div
                        className={`text-sm font-medium ${isActive ? "text-green-600" : "text-red-600"
                          }`}
                      >
                        {isActive ? "Active" : "Inactive"}
                        {license.status && ` (${license.status})`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="p-4 bg-gray-50 border-t">
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to={`/artwork/${license.artwork_id}`}
                      className="text-center px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 transition-colors"
                    >
                      View Artwork
                    </Link>
                    {activeTab === "sold" && isActive && (
                      <button
                        onClick={() => handleRevokeLicense(license.license_id)}
                        className="text-center px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 border border-red-200 transition-colors flex items-center justify-center"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LicensesPage;