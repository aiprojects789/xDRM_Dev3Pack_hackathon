import React, { createContext, useContext, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";

const Web3Context = createContext();

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
};

// ==============================
// Network Configurations
// ==============================
const NETWORK_CONFIGS = {
  solana: {
    type: "solana",
    chainId: "devnet",
    chainName: "Solana Devnet",
    nativeCurrency: {
      name: "SOL",
      symbol: "SOL",
      decimals: 9,
    },
    rpcUrls: ["https://api.devnet.solana.com"],
    blockExplorerUrls: ["https://explorer.solana.com/?cluster=devnet"],
    faucetUrl: "https://faucet.solana.com/",
    label: "Solana Devnet",
    shortLabel: "Solana",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
    programId: "HSCkL11uw81nhy7mkqSkEhzqHW2k5A5PGmWU2YXbMiKK",
  },
};

export { NETWORK_CONFIGS };

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState("0");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState("solana");

  // Solana state
  const { 
    publicKey, 
    connected: solanaConnected, 
    disconnect: disconnectSolana, 
    sendTransaction: solanaSendTransaction, 
    signTransaction: solanaSignTransaction 
  } = useWallet();
  const { connection } = useConnection();

  // Sync Solana connection state
  useEffect(() => {
    if (solanaConnected && publicKey) {
      const address = publicKey.toBase58();
      setAccount(address);
      setConnected(true);
      setSelectedNetwork("solana");
      updateBalance(address);
    } else {
      setAccount(null);
      setConnected(false);
      setBalance("0");
    }
  }, [solanaConnected, publicKey]);

  const updateBalance = async (address) => {
    if (!address || !connection) return;
    try {
      const bal = await connection.getBalance(new (await import("@solana/web3.js")).PublicKey(address));
      setBalance((bal / 1e9).toFixed(4));
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  const connectWallet = async () => {
    // Solana Wallet Adapter handles this via its own provider/components
    // This is a placeholder for context consistency
    setConnecting(true);
    try {
      // Wallet connection is handled by the WalletModalButton/WalletMultiButton
      toast.success("Wallet ready!");
    } catch (error) {
      toast.error("Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnectSolana();
      setAccount(null);
      setConnected(false);
      setBalance("0");
      toast.success("Wallet disconnected");
    } catch (error) {
      toast.error("Disconnect failed");
    }
  };

  const value = {
    account,
    balance,
    connected,
    connecting,
    selectedNetwork,
    setSelectedNetwork: (n) => {
      if (n !== "solana") toast.error("Only Solana is supported");
    },
    currentNetworkConfig: NETWORK_CONFIGS.solana,
    networkConfigs: NETWORK_CONFIGS,
    connectWallet,
    disconnectWallet,
    updateBalance,
    refreshBalance: () => account && updateBalance(account),
    isCorrectNetwork: true,
    chainId: "devnet",
    currencySymbol: "SOL",
    // Solana specific
    publicKey,
    connection,
    sendSolanaTx: solanaSendTransaction,
    signSolanaTx: solanaSignTransaction,
    solanaConnected: solanaConnected,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};
