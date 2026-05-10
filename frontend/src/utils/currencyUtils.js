// Currency conversion utilities
export class CurrencyConverter {
  static ethToUsdRate = 2700; // Example rate - you should get this from an API

  /**
   * Get the native currency symbol for a network
   * @param {string} network - Network key (e.g., 'wirefluid', 'sepolia')
   * @returns {string} - Currency symbol (e.g., 'WIRE', 'ETH')
   */
  static getSymbol(network) {
    if (!network) return "ETH";
    
    // Normalize network string
    const net = String(network).toLowerCase().trim();
    
    // WireFluid network aliases
    if (net === "wirefluid" || net === "wire" || net === "wire-fluid") {
      return "WIRE";
    }
    
    // Ethereum network aliases
    if (net === "sepolia" || net === "ethereum" || net === "eth" || net === "mainnet") {
      return "ETH";
    }

    // Algorand network aliases
    if (net === "algorand" || net === "algo") {
      return "ALGO";
    }

    // Solana network aliases
    if (net === "solana" || net === "sol") {
      return "SOL";
    }
    
    return "ETH"; // Default fallback for unknown networks
  }

  static ethToUsdRate = 2700; 
  static algoToUsdRate = 0.25; 
  static solToUsdRate = 150; // Example rate for SOL

  static ethToUsd(ethAmount) {
    return parseFloat(ethAmount) * this.ethToUsdRate;
  }

  static usdToEth(usdAmount) {
    return parseFloat(usdAmount) / this.ethToUsdRate;
  }

  static algoToUsd(algoAmount) {
    return parseFloat(algoAmount) * this.algoToUsdRate;
  }

  static usdToAlgo(usdAmount) {
    return parseFloat(usdAmount) / this.algoToUsdRate;
  }

  static solToUsd(solAmount) {
    return parseFloat(solAmount) * this.solToUsdRate;
  }

  static usdToSol(usdAmount) {
    return parseFloat(usdAmount) / this.solToUsdRate;
  }

  /**
   * Format crypto amount with correct symbol
   * @param {number|string} amount - The numeric amount
   * @param {string} network - Optional network key for symbol resolution
   * @returns {string} - Formatted string (e.g., "0.5 WIRE")
   */
  static formatCrypto(amount, network = "sepolia") {
    const numAmount = parseFloat(amount);
    const symbol = this.getSymbol(network);

    if (isNaN(numAmount) || numAmount === 0) {
      return `0 ${symbol}`;
    }

    // ✅ Use enough precision for small amounts, then remove trailing zeros
    let formatted;
    if (numAmount < 0.001) {
      formatted = numAmount.toFixed(6);
    } else if (numAmount < 0.01) {
      formatted = numAmount.toFixed(5);
    } else {
      formatted = numAmount.toFixed(4);
    }

    // Remove trailing zeros (e.g., "0.000900" -> "0.0009")
    return `${parseFloat(formatted)} ${symbol}`;
  }

  // Alias for backward compatibility
  static formatEth(ethAmount, network = "sepolia") {
    return this.formatCrypto(ethAmount, network);
  }

  static formatUsd(usdAmount) {
    return `$${parseFloat(usdAmount).toFixed(2)}`;
  }

  static formatDual(amount, network = "sepolia") {
    const net = String(network).toLowerCase().trim();
    let usdAmount;
    
    if (net === "algorand" || net === "algo") {
      usdAmount = this.algoToUsd(amount);
    } else if (net === "solana" || net === "sol") {
      usdAmount = this.solToUsd(amount);
    } else {
      usdAmount = this.ethToUsd(amount);
    }
    
    return `${this.formatCrypto(amount, network)} (${this.formatUsd(usdAmount)})`;
  }
}

// User identification utilities
export class UserIdentifier {
  static getUserIdentifier(user) {
    if (!user) {
      // ✅ Fallback: Try to get from localStorage
      try {
        const savedUser = localStorage.getItem('userData');
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          return this.getUserIdentifier(parsedUser);
        }
      } catch (e) {
        console.error('Error parsing saved user data:', e);
      }
      return null;
    }

    // ✅ Priority 1: Use user.id (most common)
    if (user.id) {
      return String(user.id);
    }

    // ✅ Priority 2: Use user_id (PayPal users)
    if (user.user_id) {
      return String(user.user_id);
    }

    // ✅ Priority 3: Use _id (MongoDB ID)
    if (user._id) {
      return String(user._id);
    }

    // ✅ Priority 4: Use wallet_address (crypto users)
    if (user.wallet_address) {
      return user.wallet_address;
    }

    return null;
  }

  /**
   * Check if user has a wallet address (capability check)
   * @param {Object} user - User object
   * @returns {boolean} - True if user has wallet_address
   */
  static hasWalletAddress(user) {
    if (!user) return false;
    return !!user.wallet_address;
  }

  /**
   * Check if user has a specific payment method onboarded (generic capability check)
   * @param {Object} user - User object
   * @param {string} methodName - Payment method name ("paypal", "stripe", "credit_card", etc.)
   * @returns {boolean} - True if user has that payment method onboarded
   */
  static hasPaymentMethod(user, methodName) {
    if (!user || !methodName) return false;

    switch (methodName.toLowerCase()) {
      case "paypal":
        return !!(user.paypal_merchant_id && user.paypal_onboarded);
      case "stripe":
        return !!(user.stripe_account_id && user.stripe_onboarded);
      case "credit_card":
        return !!(user.credit_card_onboarded);
      default:
        return false;
    }
  }

  /**
   * Get all available payment methods for a user
   * @param {Object} user - User object
   * @returns {string[]} - Array of available payment method names
   */
  static getAvailablePaymentMethods(user) {
    if (!user) return [];

    const methods = [];

    // Crypto (wallet) - always available if wallet_address exists
    if (this.hasWalletAddress(user)) {
      methods.push("crypto");
    }

    // PayPal
    if (this.hasPaymentMethod(user, "paypal")) {
      methods.push("paypal");
    }

    // Stripe (future)
    if (this.hasPaymentMethod(user, "stripe")) {
      methods.push("stripe");
    }

    // Credit Card (future)
    if (this.hasPaymentMethod(user, "credit_card")) {
      methods.push("credit_card");
    }

    return methods;
  }

  /**
   * Get available off-chain payment methods (excludes crypto)
   * @param {Object} user - User object
   * @returns {string[]} - Array of available off-chain payment methods
   */
  static getAvailableOffChainPaymentMethods(user) {
    const allMethods = this.getAvailablePaymentMethods(user);
    return allMethods.filter(method => method !== "crypto");
  }

  // DEPRECATED: Use hasWalletAddress instead
  static isCryptoUser(user) {
    if (!user) return false;
    return !!user.wallet_address;
  }

  // DEPRECATED: Use hasPaymentMethod(user, "paypal") instead
  static isPayPalUser(user) {
    if (!user) return false;
    // PayPal user: has user_id or id, but no wallet_address
    return (!!user.user_id || !!user.id) && !user.wallet_address;
  }
}

// Artwork status utilities
export class ArtworkStatus {
  /**
   * Check if artwork is registered on blockchain
   * @param {Object} artwork - Artwork object
   * @returns {boolean} - True if artwork is on-chain
   */
  static isOnChainArtwork(artwork) {
    if (!artwork) return false;

    // NEW: Check registration_method field (preferred method)
    const registrationMethod = artwork.registration_method;
    if (registrationMethod === "on-chain") {
      return true;
    }
    if (registrationMethod === "off-chain" || registrationMethod === "competition") {
      return false;
    }

    // NEW: Check is_on_chain field (preferred method)
    if (artwork.is_on_chain !== undefined && artwork.is_on_chain !== null) {
      return artwork.is_on_chain === true;
    }

    // Backward compatibility: Check old fields
    const paymentMethod = artwork.payment_method;
    const isVirtualToken = artwork.is_virtual_token;

    // If has payment_method or is_virtual_token, use those
    if (paymentMethod === "paypal" || isVirtualToken === true) {
      return false; // Off-chain
    }

    // If has creator_address, assume on-chain (legacy artworks)
    if (artwork.creator_address) {
      return true;
    }

    // Default: assume off-chain if no clear indication
    return false;
  }

  /**
   * Check if artwork is registered off-chain
   * @param {Object} artwork - Artwork object
   * @returns {boolean} - True if artwork is off-chain
   */
  static isOffChainArtwork(artwork) {
    return !this.isOnChainArtwork(artwork);
  }

  /**
   * Get registration method of artwork
   * @param {Object} artwork - Artwork object
   * @returns {string} - "on-chain" or "off-chain"
   */
  static getRegistrationMethod(artwork) {
    if (!artwork) return "on-chain";

    // NEW: Check registration_method field (preferred method)
    if (artwork.registration_method) {
      return artwork.registration_method;
    }

    // Derive from is_on_chain
    if (artwork.is_on_chain !== undefined) {
      return artwork.is_on_chain ? "on-chain" : "off-chain";
    }

    // Backward compatibility: Check old fields
    const paymentMethod = artwork.payment_method;
    const isVirtualToken = artwork.is_virtual_token;

    if (paymentMethod === "paypal" || isVirtualToken === true) {
      return "off-chain";
    }

    // Default: assume on-chain
    return "on-chain";
  }

  /**
   * Get display label for artwork registration status
   * @param {Object} artwork - Artwork object
   * @returns {string} - Display label
   */
  static getRegistrationLabel(artwork) {
    const method = this.getRegistrationMethod(artwork);
    if (method === "on-chain") return "Registered on-chain";
    if (method === "competition") return "Competition Entry";
    return "Registered off-chain";
  }
}
