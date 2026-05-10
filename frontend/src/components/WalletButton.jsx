import React, { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { useSettings } from '../context/SettingsContext';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

const WalletButton = () => {
  const { enableCrypto, loading: settingsLoading } = useSettings();
  const {
    connected,
    account,
    balance,
    disconnectWallet,
    updateBalance,
  } = useWeb3();

  const {
    isAuthenticated,
    connectWallet: authConnectWallet,
    loading,
    user,
  } = useAuth();

  // ✅ Calculate isFullyConnected for Solana
  const isFullyConnected = connected && account && user?.solana_wallet_address === account;

  // Debug the wallet connection state
  useEffect(() => {
    if (!settingsLoading && enableCrypto) {
      console.log("Solana WalletButton State:", {
        isAuthenticated,
        connected,
        account,
        userSolanaAddress: user?.solana_wallet_address,
        isFullyConnected,
      });
    }
  }, [isAuthenticated, connected, account, user, isFullyConnected, settingsLoading, enableCrypto]);

  // Automatically link wallet when Solana connects if not already linked
  useEffect(() => {
    const autoLinkWallet = async () => {
      if (isAuthenticated && connected && account && user && !user.solana_wallet_address && !loading) {
        console.log("🔗 Auto-linking Solana wallet:", account);
        try {
          const result = await authConnectWallet(account);
          if (result && !result.error) {
            toast.success("Solana wallet linked to your account!");
          }
        } catch (error) {
          console.error("Failed to auto-link wallet:", error);
        }
      }
    };
    autoLinkWallet();
  }, [isAuthenticated, connected, account, user, loading, authConnectWallet]);

  if (settingsLoading || !enableCrypto || !isAuthenticated) return null;

  const handleDisconnect = () => {
    disconnectWallet();
  };

  // ✅ User is authenticated and wallet is fully connected and linked
  if (isFullyConnected) {
    return (
      <div className="flex items-center space-x-1">
        {/* Connected Wallet Info */}
        <div className="flex items-center space-x-2 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4 text-purple-600" />
          <div className="flex flex-col">
            <span className="text-xs text-gray-700 font-medium">
              {account.substring(0, 4)}...{account.substring(account.length - 4)}
            </span>
            <span className="text-xs text-gray-500">
              {balance} SOL
            </span>
          </div>
          <button
            onClick={() => updateBalance(account)}
            className="text-xs text-purple-600 hover:text-purple-700 p-1 rounded hover:bg-purple-100"
            title="Refresh balance"
          >
            🔄
          </button>
        </div>

        {/* Disconnect Button */}
        <button
          onClick={handleDisconnect}
          className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // User is authenticated but wallet not fully connected/linked yet
  return (
    <div className="flex items-center space-x-2">
      {connected && account && user?.solana_wallet_address !== account && (
        <div className="flex items-center space-x-2 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 text-yellow-600" />
          <div className="flex flex-col">
            <span className="text-xs text-gray-700">
              {account.substring(0, 4)}...{account.substring(account.length - 4)}
            </span>
            <button 
              onClick={() => authConnectWallet(account)}
              className="text-[10px] text-yellow-700 underline font-bold uppercase"
            >
              Link to Account
            </button>
          </div>
        </div>
      )}

      {!connected && (
        <WalletMultiButton className="solana-wallet-button" />
      )}
    </div>
  );
};

export default WalletButton;