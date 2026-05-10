import axios from "axios";
// import CurrencyConverter from '../utils/currencyUtils';
import { CurrencyConverter, UserIdentifier } from '../utils/currencyUtils';

const API_BASE_URL =
  import.meta.env.VITE_BASE_URL_BACKEND;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 40000, // ✅ Reduced timeout from 30s to 10s for faster failure detection
});

// Helper function to get user identifier (user ID for PayPal, wallet for crypto)
const getUserIdentifier = () => {
  const userData = localStorage.getItem("userData");
  if (userData) {
    try {
      const user = JSON.parse(userData);
      // For PayPal users, use user ID. For crypto users, use wallet address
      return user.paypal_merchant_id ? user.id : user.wallet_address;
    } catch (error) {
      console.error("Error parsing user data:", error);
    }
  }
  return null;
};

// ✅ DEPRECATED: Use UserIdentifier.hasPaymentMethod(user, "paypal") instead
// Helper function to check if user is PayPal user (kept for backward compatibility)
const isPayPalUser = () => {
  const userData = localStorage.getItem("userData");
  if (userData) {
    try {
      const user = JSON.parse(userData);
      return !!(user.paypal_merchant_id && user.paypal_onboarded);
    } catch (error) {
      console.error("Error parsing user data:", error);
    }
  }
  return false;
};

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  // console.log(
  //   `API Request: ${config.method?.toUpperCase()} ${
  //     config.url
  //   } - Token: ${!!token}`
  // );
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // console.log("API: Authorization header added");
  } else {
    // console.warn("API: No token available for request");
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(
      `❌ API Error: ${error.config?.url}`,
      error.response?.data || error.message
    );

    // Only auto-logout on 401 if we're not on auth-related endpoints and skipAuthRedirect is not set
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/") &&
      !error.config?.skipAuthRedirect
    ) {
      console.warn("API: Unauthorized - clearing auth and redirecting");
      localStorage.removeItem("token");
      localStorage.removeItem("userData");
      // Don't redirect if we're already on the auth page
      if (window.location.pathname !== "/auth") {
        window.location.href = "/auth";
      }
    }
    return Promise.reject(error);
  }
);

const handleApiError = (error, context = "API call") => {
  console.error(`❌ ${context} Error:`, error);

  // Check if it's a blockchain-related error
  const isBlockchainError =
    context.includes("license") ||
    context.includes("purchase") ||
    context.includes("blockchain") ||
    context.includes("transaction");

  if (error.response) {
    const { status, data } = error.response;

    // Handle blockchain-specific errors
    if (isBlockchainError) {
      switch (status) {
        case 503:
          throw new Error(
            data.detail ||
            "Blockchain service temporarily unavailable. Please try again later."
          );
        case 400:
          if (data.detail?.includes("insufficient funds")) {
            throw new Error(
              "Insufficient funds for transaction. Please add ETH to your wallet."
            );
          } else if (
            data.detail?.includes("user rejected") ||
            data.detail?.includes("cancelled")
          ) {
            throw new Error("Transaction cancelled by user in MetaMask.");
          } else if (data.detail?.includes("demo mode")) {
            throw new Error(
              "Blockchain service is in demo mode. Real transactions are disabled."
            );
          }
          throw new Error(data.detail || "Invalid transaction parameters.");
        case 422:
          const errorMessages = Array.isArray(data.detail)
            ? data.detail
              .map((err) => `${err.loc?.join(".")}: ${err.msg}`)
              .join(", ")
            : JSON.stringify(data.detail);
          throw new Error(`Transaction validation failed: ${errorMessages}`);
        case 500:
          if (
            data.detail?.includes("gas") ||
            data.detail?.includes("transaction")
          ) {
            throw new Error(
              "Transaction failed. Please check your gas settings and try again."
            );
          }
          throw new Error(
            data.detail || "Blockchain transaction failed. Please try again."
          );
        default:
          throw new Error(
            data.detail ||
            `Blockchain error (${status}): ${data.message || "Unknown error"}`
          );
      }
    }

    // Handle standard API errors
    if (status === 422 && data.detail) {
      const errorMessages = Array.isArray(data.detail)
        ? data.detail
          .map((err) => `${err.loc?.join(".")}: ${err.msg}`)
          .join(", ")
        : JSON.stringify(data.detail);
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    throw new Error(
      data.detail ||
      data.message ||
      `${context} failed (${status}): Unknown error`
    );
  } else if (error.request) {
    if (isBlockchainError) {
      throw new Error(
        "No response from blockchain service. Please check your connection and try again."
      );
    }
    throw new Error(`No response received: ${error.message}`);
  } else {
    if (isBlockchainError) {
      // Handle MetaMask-specific errors
      if (error.code === 4001) {
        throw new Error("Transaction rejected by user in MetaMask.");
      } else if (error.code === -32603) {
        throw new Error(
          "Internal JSON-RPC error. Please check your transaction parameters."
        );
      } else if (error.message?.includes("insufficient funds")) {
        throw new Error(
          "Insufficient funds for transaction. Please add ETH to your wallet."
        );
      } else if (error.message?.includes("user denied")) {
        throw new Error("Transaction denied by user.");
      }
    }
    throw new Error(`${context} failed: ${error.message}`);
  }
};

export const authAPI = {
  // ✅ UPDATED: Login with email/password and optional 2FA code
  login: async (data) => {
    try {
      console.log("API: Attempting login");

      // Prepare login payload
      const loginPayload = {
        username: data.email || data.username,
        password: data.password,
      };

      // ✅ NEW: Include OTP code if provided (for 2FA)
      if (data.otp_code) {
        loginPayload.otp_code = data.otp_code;
      }

      const response = await api.post("/auth/login", loginPayload);

      // Store token if provided (existing functionality)
      if (response.data.access_token) {
        localStorage.setItem("token", response.data.access_token);
      }

      // Store user data if provided (existing functionality)
      if (response.data.user) {
        localStorage.setItem("userData", JSON.stringify(response.data.user));
      }

      return response.data;
    } catch (error) {
      // ✅ NEW: Handle 2FA-specific errors
      if (error.response?.status === 403 &&
        error.response?.data?.detail === "2FA code required") {
        // Re-throw with 2FA flag for frontend to handle
        const err = new Error("2FA code required");
        err.require2FA = true;
        err.response = error.response;
        throw err;
      }

      if (error.response?.status === 401 &&
        error.response?.data?.detail === "Invalid 2FA code") {
        // Re-throw with 2FA flag for frontend to handle
        const err = new Error("Invalid 2FA code");
        err.require2FA = true;
        err.response = error.response;
        throw err;
      }

      // Existing error handling
      return handleApiError(error, "Login");
    }
  },

  // Signup - requires authentication FIRST
  signup: (data) =>
    api
      .post("/auth/signup", {
        email: data.email,
        username: data.username,
        password: data.password,
        full_name: data.full_name || data.username,
        wallet_address: data.wallet_address || null,
        phone_number: data.phone_number || null,
      })
      .then((res) => {
        if (res.data.access_token)
          localStorage.setItem("token", res.data.access_token);
        if (res.data.user)
          localStorage.setItem("userData", JSON.stringify(res.data.user));
        return res.data;
      })
      .catch((error) => handleApiError(error, "Signup")),

  // FIXED: Connect wallet - properly check token and handle errors
  connectWallet: async (data) => {
    const token = localStorage.getItem("token");
    console.log("API: Making connect-wallet request with token:", !!token);
    console.log("API: Request data:", data);

    if (!token) {
      throw new Error("No authentication token available");
    }

    try {
      const response = await api.post("/auth/connect-wallet", data);
      console.log("API: Connect-wallet success:", response.data);

      // Update stored user data and token if provided
      if (response.data.access_token) {
        localStorage.setItem("token", response.data.access_token);
      }
      if (response.data.user) {
        localStorage.setItem("userData", JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error) {
      console.error("API: Connect-wallet error:", error.response || error);
      handleApiError(error, "Wallet connection");
    }
  },

  connectPayPal: async (data) => {
    return api
      .post("/auth/connect-paypal", data)
      .then((res) => {
        if (res.data.access_token) {
          localStorage.setItem("token", res.data.access_token);
        }
        if (res.data.user) {
          localStorage.setItem("userData", JSON.stringify(res.data.user));
        }
        return res.data;
      })
      .catch((error) => handleApiError(error, "PayPal connection"));
  },

  disconnectPayPal: async () => {
    return api
      .post("/auth/disconnect-paypal")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "PayPal disconnection"));
  },

  // Get current user info
  getCurrentUser: () =>
    api
      .get("/auth/me")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "User fetch")),

  // Logout
  logout: () =>
    api
      .post("/auth/logout")
      .then(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("userData");
      })
      .catch(() => {
        // Even if API call fails, clear local storage
        localStorage.removeItem("token");
        localStorage.removeItem("userData");
      }),

  // Password reset flow
  forgotPassword: (email) =>
    api
      .post("/auth/forgot-password", { email })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Forgot password")),

  verifyAuthOTP: (email, otp) =>
    api
      .post("/auth/verify-otp", { email, otp })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "OTP verification")),

  resetPassword: (email, otp, new_password) =>
    api
      .post("/auth/reset-password", { email, otp, new_password })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Password reset")),

  // Update password (for logged-in users)
  updatePassword: (current_password, new_password) =>
    api
      .post("/auth/update-password", { current_password, new_password })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Password update")),

  // ============================================
  // ✅ GOOGLE OAUTH ENDPOINTS
  // ============================================

  /**
   * Initiate Google OAuth login
   * Returns auth URL to redirect user to Google
   */
  googleLogin: async () => {
    try {
      const response = await api.get("/auth/google/login");
      return response.data;
    } catch (error) {
      handleApiError(error, "Google OAuth initiation");
    }
  },

  /**
   * Verify Google ID token
   * Used for Google Sign-In button integration
   */
  verifyGoogleToken: async (idToken) => {
    try {
      const response = await api.post("/auth/google/verify", {
        id_token: idToken,
      });

      // Store token if provided
      if (response.data.access_token) {
        localStorage.setItem("token", response.data.access_token);
      }

      return response.data;
    } catch (error) {
      handleApiError(error, "Google token verification");
    }
  },

  /**
   * Link Google account to existing user
   */
  linkGoogleAccount: async (idToken) => {
    try {
      const response = await api.post("/auth/link-google", {
        id_token: idToken,
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "Link Google account");
    }
  },

  /**
   * Unlink Google account from user
   */
  unlinkGoogleAccount: async () => {
    try {
      const response = await api.post("/auth/unlink-google");
      return response.data;
    } catch (error) {
      handleApiError(error, "Unlink Google account");
    }
  },


  // ============================================
  // ✅ TWO-FACTOR AUTHENTICATION (2FA) ENDPOINTS
  // ============================================

  /**
   * Enable 2FA for user account
   * Returns QR code and secret for authenticator app setup
   */
  enable2FA: async () => {
    try {
      const response = await api.post("/auth/2fa/enable");
      return response.data;
    } catch (error) {
      handleApiError(error, "Enable 2FA");
    }
  },

  /**
   * Verify 2FA setup with OTP code
   * Completes 2FA activation
   */
  verify2FASetup: async (otpCode) => {
    try {
      const response = await api.post("/auth/2fa/verify-setup", {
        otp_code: otpCode,
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "Verify 2FA setup");
    }
  },

  /**
   * Disable 2FA for user account
   * Requires current password or OTP for confirmation
   */
  disable2FA: async (password = null, otpCode = null) => {
    try {
      const payload = {};
      if (password) payload.password = password;
      if (otpCode) payload.otp_code = otpCode;

      const response = await api.post("/auth/2fa/disable", payload);
      return response.data;
    } catch (error) {
      handleApiError(error, "Disable 2FA");
    }
  },

  /**
   * Verify OTP code (for login or sensitive operations)
   */
  verify2FAOTP: async (otpCode) => {
    try {
      const response = await api.post("/auth/2fa/verify", {
        otp_code: otpCode,
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "Verify 2FA OTP");
    }
  },

  /**
   * Get 2FA status for current user
   */
  get2FAStatus: async () => {
    try {
      const response = await api.get("/auth/2fa/status");
      return response.data;
    } catch (error) {
      console.error("Failed to get 2FA status:", error);
      return { enabled: false };
    }
  },

  /**
   * Generate backup codes for 2FA
   */
  generateBackupCodes: async () => {
    try {
      const response = await api.post("/auth/2fa/backup-codes");
      return response.data;
    } catch (error) {
      handleApiError(error, "Generate backup codes");
    }
  },
  // Set password for OAuth-only users
  setPassword: async (newPassword) => {
    try {
      const response = await api.post("/auth/set-password", {
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "Set password");
    }
  },

  /**
   * Change password for logged-in user
   * Enhanced version with better error handling
   */
  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "Change password");
    }
  },

  /**
   * Update current user's profile information
   */
  updateProfile: async (data) => {
    try {
      const response = await api.patch("/auth/me/profile", data);
      return response.data;
    } catch (error) {
      handleApiError(error, "Update profile");
    }
  },

  /**
   * Send 6-digit OTP to email for profile completion
   */
  sendProfileOTP: async () => {
    try {
      const response = await api.post("/auth/send-profile-otp");
      return response.data;
    } catch (error) {
      handleApiError(error, "Send profile OTP");
    }
  }
};



// Admin API functions (if needed)
export const adminAPI = {
  getAllUsers: () =>
    api
      .get("/auth/admin/users")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Get all users")),

  deleteUser: (userId) =>
    api
      .delete(`/auth/admin/users/${userId}`)
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Delete user")),

  updateUserRole: (userId, role) =>
    api
      .put(`/auth/admin/users/${userId}/role`, { new_role: role })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Update user role")),

  getStats: () =>
    api
      .get("/auth/admin/stats")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Get admin stats")),

  getLicenseConfig: async () => {
    try {
      const response = await api.get("/admin/license-config");
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Fetch license configuration");
    }
  },

  updateLicenseConfig: async (configData) => {
    try {
      const response = await api.post("/admin/license-config", configData);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Update license configuration");
    }
  },
};

export const usageAPI = {
  getStats: async (tokenId, days = 30) => {
    try {
      const response = await api.get(`/drm/usage/stats/${tokenId}`, { params: { days } });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 403) {
        // Return structured zero-data if not found or no stats yet, avoid throwing error
        return { success: true, stats: { total_views: 0, total_downloads: 0, screenshot_attempts: 0 } };
      }
      handleApiError(error, `Fetch usage stats for ${tokenId}`);
      throw error;
    }
  }
};

// Enhanced artworksAPI with better error handling
export const artworksAPI = {
  update: async (artworkId, data) => {
    try {
      const response = await api.put(`/artwork/${artworkId}`, data);
      return response.data;
    } catch (error) {
      handleApiError(error, `Update artwork ${artworkId}`);
      throw error;
    }
  },

  checkDuplicates: async (formData) => {
    try {
      const response = await api.post("/artwork/check-duplicates", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000, // 1 minute for duplicate check
      });
      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error("Duplicate check timed out. Please try again.");
      }
      handleApiError(error, "Duplicate check");
    }
  },

  delist: async (artworkId) => {
    try {
      const response = await api.post(`/artwork/${artworkId}/delist`);
      return response.data;
    } catch (error) {
      handleApiError(error, "Delist artwork");
      throw error; // Re-throw to allow frontend to handle
    }
  },

  listForSale: async (artworkId, price) => {
    try {
      const response = await api.post(`/artwork/${artworkId}/list-for-sale`, {
        price: price
      });
      return response.data;
    } catch (error) {
      handleApiError(error, "List artwork for sale");
      throw error; // Re-throw to allow frontend to handle
    }
  },

  classifyAI: async (formData) => {
    try {
      const response = await api.post("/artwork/classify-ai", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 120000, // 2 minutes for AI classification
      });
      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error(
          "AI classification timed out. The model may be busy. Please try again."
        );
      }
      handleApiError(error, "AI classification");
    }
  },

  registerWithImage: async (formData) => {
    try {
      // // If PayPal user and price is in USD, convert to ETH before sending
      // if (isPayPalUser()) {
      //   const priceInUSD = formData.get("price");
      //   if (priceInUSD) {
      //     // const { currencyConverter } = await import("../utils/currencyUtils");
      //     const priceInETH = CurrencyConverter.usdToEth(priceInUSD);
      //     formData.set("price", priceInETH);
      //     console.log(
      //       `💰 Converted price: $${priceInUSD} -> ${priceInETH} ETH`
      //     );
      //   }
      // }

      const response = await api.post(
        "/artwork/register-with-image",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          timeout: 180000,
        }
      );
      return response.data;
    } catch (error) {

      if (error.code === "ECONNABORTED") {
        console.error('❌ Register with image failed:', error);
        throw new Error(
          "Registration timed out. Please try with a smaller image."
        );
      }
      handleApiError(error, "Register with image");
      throw error;
    }
  },

  confirmRegistration: async (data) => {
    try {
      const safeData = JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      );

      const response = await api.post("/artwork/confirm-registration", safeData, {
        timeout: 60000, // 1 minute for confirmation
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(
          "Confirmation endpoint not found. Please check server configuration."
        );
      }
      handleApiError(error, "Confirm registration");
    }
  },

  // Rest of your existing methods...
  getAll: async (params = {}) => {
    try {
      const response = await api.get("/artwork", { 
        params,
        skipAuthRedirect: true 
      });

      // ✅ Handle multiple response formats - simplified
      const data = response.data;
      let artworks = [];

      if (Array.isArray(data)) {
        artworks = data;
      } else if (data?.artworks) {
        artworks = Array.isArray(data.artworks) ? data.artworks : [];
      } else if (data?.data) {
        artworks = Array.isArray(data.data) ? data.data : [];
      } else if (data?.results) {
        artworks = Array.isArray(data.results) ? data.results : [];
      }

      return {
        data: artworks,
        artworks: artworks, // Also include for backward compatibility
        total: data?.total || artworks.length,
        page: data?.page || 1,
        size: data?.size || 20,
        has_next: data?.has_next || false,
      };
    } catch (error) {
      handleApiError(error, "Fetch artworks");
      throw error; // Re-throw to allow caller to handle
    }
  },

  // ✅ Get artwork counts by payment method
  getCounts: () =>
    api
      .get("/artwork/counts")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Get artwork counts")),

  getById: (tokenId) =>
    api
      .get(`/artwork/${tokenId}`, { skipAuthRedirect: true })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, `Fetch artwork ${tokenId}`)),

  getByOwner: async (ownerAddress, params = {}) => {
    try {
      // Use the provided ownerAddress, or get current user's identifier
      const userIdentifier = ownerAddress || getUserIdentifier();
      if (!userIdentifier) {
        throw new Error("User identifier not found");
      }

      console.log(`📍 Fetching artworks for: ${userIdentifier}`);
      const response = await api.get(`/artwork/owner/${userIdentifier}`, {
        params,
      });

      let artworks = [];
      let total = 0;

      if (response.data && Array.isArray(response.data.artworks)) {
        artworks = response.data.artworks;
        total = response.data.total || artworks.length;
      } else if (Array.isArray(response.data)) {
        artworks = response.data;
        total = response.data.length;
      } else if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        artworks = response.data.data;
        total = response.data.total || artworks.length;
      }

      console.log(`📦 Owner artworks:`, { count: artworks.length, total });

      return {
        data: artworks,
        total: total,
        page: response.data?.page || 1,
        size: response.data?.size || 20,
        has_next: response.data?.has_next || false,
      };
    } catch (error) {
      console.warn(`Owner artworks failed:`, error.message);
      return {
        data: [],
        total: 0,
        page: 1,
        size: 20,
        has_next: false,
      };
    }
  },

  // UPDATED: Get by creator - uses user identifier
  getByCreator: async (creatorAddress, params = {}) => {
    try {
      const userIdentifier = creatorAddress || getUserIdentifier();
      if (!userIdentifier) {
        throw new Error("User identifier not found");
      }

      console.log(`📍 Fetching creator artworks for: ${userIdentifier}`);
      const response = await api.get(`/artwork/creator/${userIdentifier}`, {
        params,
      });

      let artworks = [];
      let total = 0;

      if (response.data && Array.isArray(response.data.artworks)) {
        artworks = response.data.artworks;
        total = response.data.total || artworks.length;
      } else if (Array.isArray(response.data)) {
        artworks = response.data;
        total = response.data.length;
      }

      console.log(`📦 Creator artworks:`, { count: artworks.length, total });

      return {
        data: artworks,
        total: total,
        page: response.data?.page || 1,
        size: response.data?.size || 20,
        has_next: response.data?.has_next || false,
      };
    } catch (error) {
      console.warn(`Creator artworks failed:`, error.message);
      return {
        data: [],
        total: 0,
        page: 1,
        size: 20,
        has_next: false,
      };
    }
  },

  // NEW: Category methods
  getCategories: async (type = null) => {
    try {
      const params = type ? { type } : {};
      const response = await api.get("/artwork/categories", { params });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      // Return default categories if API fails
      return getDefaultCategories(type);
    }
  },

  createCategory: async (categoryData) => {
    try {
      const response = await api.post("/artwork/categories", categoryData);
      return response.data;
    } catch (error) {
      handleApiError(error, "Create category");
    }
  },

  getBlockchainInfo: (artworkId, network = null) =>
    api
      .get(`/artwork/${artworkId}/blockchain`, { 
        params: network ? { network } : {},
        skipAuthRedirect: true 
      })
      .then((res) => res.data)
      .catch((error) =>
        handleApiError(error, `Fetch blockchain info ${artworkId}`)
      ),

  getByTokenId: (artworkId) => {
    return api.get(`/artwork/${artworkId}`, { skipAuthRedirect: true });
  },

  // ✅ UPDATED: Prepare sale transaction with better error handling

  // In your artworksAPI.js, remove the Web3 import and usage:
  prepareSaleTransaction: async (data) => {
    try {
      console.log("🔄 Preparing sale transaction:", data);

      // ✅ REMOVE THIS: Don't convert price here, frontend should send wei
      // const salePriceWei = Web3.utils.toWei(data.sale_price.toString(), 'ether');

      const requestData = {
        token_id: (typeof data.token_id === 'string' && /^\d+$/.test(data.token_id)) ? parseInt(data.token_id) : data.token_id,
        artwork_id: data.artwork_id,
        buyer_address: data.buyer_address,
        seller_address: data.seller_address,
        sale_price_wei: data.sale_price_wei,
        sale_price: data.sale_price_eth ?? data.sale_price,
        payment_method: data.payment_method || 'crypto',  // ✅ ADD THIS // ✅ Use wei value sent from frontend
        network: data.network // ✅ Add network context
      };

      const response = await api.post(
        "/artwork/prepare-sale-transaction",
        requestData,
        {
          timeout: 30000,
        }
      );

      console.log("✅ Sale preparation response:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ Sale preparation failed:", error);
      return handleApiError(error, "Prepare sale transaction");
    }
  },

  confirmSale: async (data) => {
    try {
      console.log("🔄 Confirming sale transaction:", data);

      const requestData = {
        tx_hash: data.tx_hash,
        token_id: (typeof data.token_id === 'string' && /^\d+$/.test(data.token_id)) ? parseInt(data.token_id) : data.token_id,
        artwork_id: data.artwork_id,
        buyer_address: data.buyer_address,
        seller_address: data.seller_address,
        sale_price_wei: data.sale_price_wei,
        sale_price_eth: data.sale_price_eth ?? data.sale_price,
        payment_method: data.payment_method || "crypto",
        network: data.network,
      };

      const response = await api.post("/artwork/confirm-sale", requestData, {
        timeout: 30000, // 30 second timeout
      });

      console.log("✅ Sale confirmation response:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ Sale confirmation failed:", error);
      return handleApiError(error, "Confirm sale");
    }
  },

  // ✅ NEW: Check if artwork is owned by current user
  checkOwnership: async (tokenId) => {
    try {
      const response = await api.get(`/artwork/${tokenId}/ownership-check`);
      return response.data;
    } catch (error) {
      console.error("Failed to check ownership:", error);
      return { is_owner: false, error: error.message };
    }
  },

  confirmPaypalPayment: async (data) => {
    try {
      const response = await api.post("/artwork/confirm-paypal-payment", data);
      return response.data;
    } catch (error) {
      console.error("PayPal confirmation failed:", error);
      throw error;
    }
  },

  getBlockchainHealth: async () => {
    try {
      const response = await api.get("/license/health/blockchain");
      return response.data;
    } catch (error) {
      console.error("Failed to get blockchain health:", error);
      return {
        success: false,
        connected: false,
        error: error.message,
      };
    }
  },

  // ✅ NEW: Register off-chain artwork on blockchain
  registerOnChain: async (artworkId) => {
    try {
      const response = await api.post(`/artwork/${artworkId}/register-on-chain`);
      return response.data;
    } catch (error) {
      console.error("Failed to prepare blockchain registration:", error);
      handleApiError(error, "Prepare blockchain registration");
      throw error;
    }
  },

  // ✅ NEW: Confirm blockchain registration
  confirmOnChainRegistration: async (artworkId, txHash, network = null) => {
    try {
      const response = await api.post(`/artwork/${artworkId}/confirm-on-chain-registration`, {
        tx_hash: txHash,
        network: network
      });
      return response.data;
    } catch (error) {
      console.error("Failed to confirm blockchain registration:", error);
      handleApiError(error, "Confirm blockchain registration");
      throw error;
    }
  },
};

// Helper function to provide default categories if API fails
const getDefaultCategories = (type) => {
  const allCategories = {
    medium: [
      {
        name: "Painting",
        type: "medium",
        description: "Oil, acrylic, watercolor, etc.",
      },
      {
        name: "Drawing",
        type: "medium",
        description: "Pencil, charcoal, ink, etc.",
      },
      {
        name: "Sculpture",
        type: "medium",
        description: "Stone, wood, metal, clay, etc.",
      },
      {
        name: "Printmaking",
        type: "medium",
        description: "Etching, lithography, screen printing, etc.",
      },
      {
        name: "Photography",
        type: "medium",
        description: "Digital, film, black & white, etc.",
      },
      {
        name: "Digital Art",
        type: "medium",
        description: "AI art, 3D modeling, vector, animation",
      },
      {
        name: "Mixed Media / Collage",
        type: "medium",
        description: "Combination of different artistic mediums",
      },
      {
        name: "Textile & Fiber Art",
        type: "medium",
        description: "Weaving, embroidery, fashion, tapestry",
      },
      {
        name: "Calligraphy / Typography",
        type: "medium",
        description: "Artistic writing and lettering",
      },
      {
        name: "Installation Art",
        type: "medium",
        description: "Large-scale, immersive artworks",
      },
      {
        name: "Performance Art",
        type: "medium",
        description: "Live artistic performance",
      },
      {
        name: "Other Medium",
        type: "medium",
        description: "Other artistic medium not listed",
      },
    ],
    style: [
      {
        name: "Abstract",
        type: "style",
        description: "Non-representational art",
      },
      {
        name: "Realism / Hyperrealism",
        type: "style",
        description: "Art that resembles reality",
      },
      {
        name: "Impressionism",
        type: "style",
        description: "Emphasis on light and movement",
      },
      {
        name: "Expressionism",
        type: "style",
        description: "Emotional experience over physical reality",
      },
      {
        name: "Surrealism",
        type: "style",
        description: "Dream-like, unconscious mind",
      },
      {
        name: "Cubism",
        type: "style",
        description: "Geometric forms and multiple perspectives",
      },
      {
        name: "Minimalism",
        type: "style",
        description: "Extreme simplicity of form",
      },
      {
        name: "Pop Art",
        type: "style",
        description: "Popular culture influences",
      },
      {
        name: "Conceptual Art",
        type: "style",
        description: "Idea or concept over aesthetic",
      },
      {
        name: "Street Art / Graffiti",
        type: "style",
        description: "Public space art",
      },
      {
        name: "Contemporary / Modern",
        type: "style",
        description: "Current artistic trends",
      },
      {
        name: "Traditional / Folk / Indigenous",
        type: "style",
        description: "Cultural and traditional art forms",
      },
      {
        name: "Other Style",
        type: "style",
        description: "Other artistic style not listed",
      },
    ],
    subject: [
      {
        name: "Portraits",
        type: "subject",
        description: "Art focused on people's faces or figures",
      },
      {
        name: "Landscapes",
        type: "subject",
        description: "Natural scenery and environments",
      },
      {
        name: "Still Life",
        type: "subject",
        description: "Arrangements of inanimate objects",
      },
      {
        name: "Figurative Art",
        type: "subject",
        description: "Human body, gestures, and forms",
      },
      {
        name: "Animals & Wildlife",
        type: "subject",
        description: "Animal subjects and wildlife",
      },
      {
        name: "Architecture & Urban Scenes",
        type: "subject",
        description: "Buildings and cityscapes",
      },
      {
        name: "Fantasy & Mythological",
        type: "subject",
        description: "Imaginary and mythical subjects",
      },
      {
        name: "Religious & Spiritual",
        type: "subject",
        description: "Religious and spiritual themes",
      },
      {
        name: "Political / Social Commentary",
        type: "subject",
        description: "Social and political themes",
      },
      {
        name: "Nature & Environment",
        type: "subject",
        description: "Natural world and environmental themes",
      },
      {
        name: "Abstract Concepts",
        type: "subject",
        description: "Non-representational ideas and concepts",
      },
      {
        name: "Other Subject",
        type: "subject",
        description: "Other subject matter not listed",
      },
    ],
  };

  return type
    ? allCategories[type] || []
    : [
      ...allCategories.medium,
      ...allCategories.style,
      ...allCategories.subject,
    ];
};

// Update your API services to match the new backend endpoints:

export const licensesAPI = {
  // Purchase license with the updated system
  purchase: async (data) => {
    try {
      const formData = new FormData();
      if (data.artwork_id) {
          formData.append("artwork_id", data.artwork_id);
      }
      if (data.token_id) {
          formData.append("token_id", data.token_id.toString());
      }
      formData.append("license_type", data.license_type);
      if (data.network) {
          formData.append("network", data.network);
      }

      const response = await api.post("/license/purchase", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw handleApiError(error, "Purchase license");
    }
  },


  // Calculate license price
  calculatePrice: async (artworkPrice, licenseType, artworkId = null) => {
    try {
      const response = await api.get("/license/prices/calculate", {
        params: { 
          artwork_price: artworkPrice, 
          license_type: licenseType,
          artwork_id: artworkId 
        },
      });
      return response.data;
    } catch (error) {
      console.error("Failed to calculate license price:", error);
      return { success: false, error: error.message };
    }
  },

  // License configuration management
  getLicenseConfigs: async (activeOnly = false) => {
    try {
      const response = await api.get("/license/config", {
        params: { active_only: activeOnly },
      });
      return response.data;
    } catch (error) {
      console.error("Failed to get license configs:", error);
      return [];
    }
  },

  getActiveLicenseConfig: async () => {
    try {
      const response = await api.get("/license/config/active");
      return response.data;
    } catch (error) {
      console.error("Failed to get active license config:", error);
      return null;
    }
  },

  createLicenseConfig: async (configData) => {
    try {
      const response = await api.post("/license/config", configData);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Create license config");
    }
  },

  updateLicenseConfig: async (configId, updateData) => {
    try {
      const response = await api.put(`/license/config/${configId}`, updateData);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Update license config");
    }
  },

  // Purchase license with REAL blockchain transactions
  purchaseSimple: async (data) => {
    try {
      const formData = new FormData();
      if (data.artwork_id || data.artworkId) {
          formData.append("artwork_id", data.artwork_id || data.artworkId);
      }
      if (data.token_id || data.tokenId) {
          formData.append("token_id", (data.token_id || data.tokenId).toString());
      }
      formData.append("license_type", data.license_type);
      if (data.network) {
          formData.append("network", data.network);
      }
      if (data.duration_days) {
          formData.append("duration_days", data.duration_days.toString());
      }
      if (data.buyer_address) {
          formData.append("buyer_address", data.buyer_address);
      }

      console.log("🔄 Preparing REAL blockchain license purchase:", data);

      const response = await api.post("/license/purchase-simple", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000,
      });

      console.log("✅ License purchase response:", response.data);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Purchase license simple");
    }
  },

  // Purchase license with PayPal for PayPal-registered artworks
  purchasePaypal: async (data) => {
    try {
      const formData = new FormData();
      if (data.artwork_id || data.artworkId) {
          formData.append("artwork_id", data.artwork_id || data.artworkId);
      }
      if (data.token_id || data.tokenId) {
          formData.append("token_id", (data.token_id || data.tokenId).toString());
      }
      formData.append("license_type", data.license_type);
      if (data.network) {
          formData.append("network", data.network);
      }
      if (data.duration_days) {
          formData.append("duration_days", data.duration_days.toString());
      }

      console.log("🔄 Preparing PayPal license purchase:", data);

      const response = await api.post("/license/purchase-paypal", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000,
      });

      console.log("✅ PayPal license purchase response:", response.data);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Purchase license PayPal");
    }
  },

  // Confirm license purchase after MetaMask transaction
  confirmPurchase: async (confirmationData) => {
    try {
      console.log(
        "🔄 Confirming license purchase with blockchain:",
        confirmationData
      );

      const response = await api.post(
        "/license/confirm-purchase",
        confirmationData,
        {
          timeout: 30000,
        }
      );

      console.log("✅ License confirmation response:", response.data);
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Confirm license purchase");
    }
  },

  // Check blockchain health
  getBlockchainHealth: async () => {
    try {
      const response = await api.get("/license/health/blockchain");
      return response.data;
    } catch (error) {
      console.error("Failed to get blockchain health:", error);
      return {
        success: false,
        connected: false,
        error: error.message,
      };
    }
  },

  // Get license prices
  getPrices: async (artworkPrice = null, artworkId = null) => {
    try {
      const params = {};
      if (artworkPrice) params.artwork_price = artworkPrice;
      if (artworkId) {
        params.artwork_id = artworkId;
      } else if (artworkPrice === null && !artworkId) {
         // Fallback if only one arg provided which might be the ID
         params.artwork_id = artworkPrice; 
      }
      
      const response = await api.get("/license/prices", { params });
      return response.data;
    } catch (error) {
      console.error("Failed to get license prices:", error);
      return {
        success: false,
        prices: {},
      };
    }
  },


  // Revoke license
  revoke: async (licenseId) => {
    try {
      const response = await api.post(`/license/${licenseId}/revoke`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, `Revoke license ${licenseId}`);
    }
  },
  // Confirm revoke after blockchain transaction
  confirmRevoke: async (licenseId, confirmationData) => {
    try {
      const response = await api.post(`/license/${licenseId}/revoke/confirm`, confirmationData);
      return response.data;
    } catch (error) {
      throw handleApiError(error, `Confirm revoke license ${licenseId}`);
    }
  },

  getByUser: async (userAddress, params = {}) => {
    try {
      const userIdentifier = userAddress || getUserIdentifier();
      if (!userIdentifier) {
        throw new Error("User identifier not found");
      }

      console.log(`🔍 Fetching licenses for user: ${userIdentifier}`, params);

      const queryParams = new URLSearchParams();
      if (params.as_licensee !== undefined) {
        queryParams.append("as_licensee", params.as_licensee.toString());
      }
      if (params.page) {
        queryParams.append("page", params.page.toString());
      }
      if (params.size) {
        queryParams.append("size", params.size.toString());
      }

      const url = `/license/user/${userIdentifier}${queryParams.toString() ? "?" + queryParams.toString() : ""
        }`;
      const response = await api.get(url);

      console.log("📄 Raw API response:", response.data);

      let licenses = [];
      if (response.data?.licenses) {
        licenses = response.data.licenses;
      } else if (Array.isArray(response.data)) {
        licenses = response.data;
      }

      console.log(
        `✅ Found ${licenses.length} licenses for user ${userIdentifier}`
      );

      // Log first license to see structure
      if (licenses.length > 0) {
        console.log("📋 First license structure:", licenses[0]);
      }

      return {
        data: licenses,
        licenses: licenses,
        total: response.data?.total || licenses.length,
        page: response.data?.page || 1,
        size: response.data?.size || 20,
        has_next: response.data?.has_next || false,
      };
    } catch (error) {
      console.error(`❌ User licenses API failed:`, error);
      return {
        data: [],
        licenses: [],
        total: 0,
        page: 1,
        size: 20,
        has_next: false,
        error: error.message,
      };
    }
  },

  // Get buyer licenses directly from blockchain
  getBuyerFromBlockchain: async (buyerAddress) => {
    try {
      const response = await api.get(`/license/buyer/${buyerAddress}`);
      return response.data;
    } catch (error) {
      console.error("Failed to get buyer licenses from blockchain:", error);
      return { success: false, licenses: [], error: error.message };
    }
  },

  // Get license info from blockchain
  getLicenseInfo: async (licenseId) => {
    try {
      const response = await api.get(`/license/${licenseId}/info`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get license info for ${licenseId}:`, error);
      return { success: false, error: error.message };
    }
  },

  // Get license status
  getLicenseStatus: async (licenseId) => {
    try {
      const response = await api.get(`/license/${licenseId}/status`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get license status for ${licenseId}:`, error);
      return { success: false, error: error.message };
    }
  },

  // Keep existing methods for compatibility
  getAll: async (params = {}) => {
    try {
      const response = await api.get("/license", { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Fetch licenses");
    }
  },

  getById: async (licenseId) => {
    try {
      const response = await api.get(`/license/${licenseId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, `Fetch license ${licenseId}`);
    }
  },

  getByArtwork: async (artworkId, params = {}) => {
    try {
      const response = await api.get(`/license/artwork/${artworkId}`, { 
        params,
        skipAuthRedirect: true 
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error, `Fetch artwork licenses ${artworkId}`);
    }
  },

  // // DEPRECATED: Old grant methods
  // grant: async (data) => {
  //   try {
  //     const response = await api.post("/license/grant", data);
  //     return response.data;
  //   } catch (error) {
  //     throw handleApiError(error, "Grant license");
  //   }
  // },

  // grantWithDocument: async (licenseData) => {
  //   try {
  //     const formData = new FormData();
  //     formData.append("token_id", licenseData.token_id.toString());
  //     formData.append("licensee_address", licenseData.licensee_address);
  //     formData.append(
  //       "duration_days",
  //       licenseData.duration_days?.toString() || "30"
  //     );
  //     formData.append("license_type", licenseData.license_type);

  //     const response = await api.post(
  //       "/license/grant-with-document",
  //       formData,
  //       {
  //         headers: {
  //           "Content-Type": "multipart/form-data",
  //         },
  //       }
  //     );

  //     return response.data;
  //   } catch (error) {
  //     throw handleApiError(error, "Grant license with document");
  //   }
  // },

  // ✅ Get pending license requests for owner
  getPendingRequests: async (params = {}) => {
    try {
      const response = await api.get("/license/pending-requests", { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error, "Get pending license requests");
    }
  },

  // ✅ Approve license request
  approveRequest: async (licenseId, action = "approve") => {
    try {
      const formData = new FormData();
      formData.append("action", action);

      const response = await api.post(`/license/${licenseId}/approve`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw handleApiError(error, `Approve/reject license ${licenseId}`);
    }
  },
};

// FIXED: Transactions API with proper data structure
export const transactionsAPI = {
  create: async (data) => {
    console.log(
      "Creating transaction with data:",
      JSON.stringify(data, null, 2)
    );
    try {
      const response = await api.post("/transaction", data);
      return response.data;
    } catch (error) {
      console.error("Transaction creation error:", error.response?.data);
      throw error;
    }
  },

  update: (txHash, data) =>
    api
      .put(`/transaction/${txHash}`, data)
      .then((res) => res.data)
      .catch((error) => handleApiError(error, `Update transaction ${txHash}`)),

  getAll: (params = {}) =>
    api
      .get("/transaction", { params })
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Fetch transactions")),

  getById: (txHash) =>
    api
      .get(`/transaction/${txHash}`)
      .then((res) => res.data)
      .catch((error) => handleApiError(error, `Fetch transaction ${txHash}`)),

  // FIXED: User transactions with proper data structure and type filtering
  getByUser: async (userAddress, params = {}) => {
    try {
      const userIdentifier = userAddress || getUserIdentifier();
      if (!userIdentifier) {
        throw new Error("User identifier not found");
      }

      const response = await api.get(`/transaction/user/${userIdentifier}`, {
        params,
      });

      let transactions = [];
      let total = 0;

      if (response.data && Array.isArray(response.data.transactions)) {
        transactions = response.data.transactions;
        total = response.data.total || transactions.length;
      } else if (Array.isArray(response.data)) {
        transactions = response.data;
        total = response.data.length;
      } else if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        transactions = response.data.data;
        total = response.data.total || transactions.length;
      }

      console.log(`📦 User transactions:`, {
        count: transactions.length,
        total,
      });

      return {
        data: transactions,
        total: total,
      };
    } catch (error) {
      console.warn(`User transactions failed:`, error.message);
      return {
        data: [],
        total: 0,
      };
    }
  },
};



export const recommendationAPI = {
  // Get personalized recommendations for user (with optional payment_method filter)
  getRecommendations: async (userId, k = 5, paymentMethod = null) => {
    try {
      let url = `/recommend/${userId}?k=${k}`;
      if (paymentMethod && paymentMethod !== "all") {
        url += `&payment_method=${paymentMethod}`;
      }
      // ✅ Increased timeout for recommendations (60 seconds - complex operation)
      const response = await api.get(url, {
        timeout: 60000, // 60 seconds for recommendations
      });
      return response.data;
    } catch (error) {
      // ✅ Silent error handling - recommendations are non-critical
      if (error.code === 'ECONNABORTED') {
        console.warn("⚠️ Recommendations API timeout - continuing without recommendations");
      } else {
        console.warn("⚠️ Failed to fetch recommendations - continuing without recommendations");
      }
      // Return empty recommendations if API fails
      return {
        recommendations: {
          recommended_for_you: [],
          search_based: [],
          purchase_based: [],
          upload_based: [],
          view_based: [],
        },
        has_history: false,
        message: "Recommendations unavailable",
      };
    }
  },

  // Search artworks with semantic search
  searchArtworks: async (query, k = 20) => {
    try {
      const response = await api.get(
        `/search?query=${encodeURIComponent(query)}&k=${k}`
      );
      return response.data;
    } catch (error) {
      console.error("Search failed:", error);
      throw new Error("Search service is temporarily unavailable");
    }
  },

  // Track artwork view for recommendations
  trackArtworkView: async (artworkId) => {
    try {
      const response = await api.post(`/artwork/${artworkId}/view`);
      return response.data;
    } catch (error) {
      console.error("Failed to track artwork view:", error);
      // Don't throw error for tracking failures
      return { success: false };
    }
  },
};

// Web3 API
export const web3API = {
  getStatus: () =>
    api
      .get("/web3/status")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Web3 status")),

  getArtworkCount: () =>
    api
      .get("/web3/artwork-count")
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Artwork count")),

  prepareRegisterTransaction: (data) =>
    api
      .post("/web3/prepare-transaction/register", data)
      .then((res) => res.data)
      .catch((error) =>
        handleApiError(error, "Prepare registration transaction")
      ),

  prepareLicenseTransaction: (data) =>
    api
      .post("/web3/prepare-transaction/license", data)
      .then((res) => res.data)
      .catch((error) => handleApiError(error, "Prepare license transaction")),

  waitForTransaction: (txHash) =>
    api
      .get(`/web3/transactions/${txHash}/wait`)
      .then((res) => res.data)
      .catch((error) =>
        handleApiError(error, `Wait for transaction ${txHash}`)
      ),

  getTransactionReceipt: (txHash) =>
    api
      .get(`/web3/transactions/${txHash}/receipt`)
      .then((res) => res.data)
      .catch((error) => handleApiError(error, `Transaction receipt ${txHash}`)),

  getTokenIdFromTx: (txHash) =>
    api
      .get(`/web3/transactions/${txHash}/token-id`)
      .then((res) => res.data)
      .catch((error) =>
        handleApiError(error, `Token ID from transaction ${txHash}`)
      ),
};



// Health check utility
export const checkAPIHealth = async () => {
  try {
    const response = await api.get("/health");
    return { healthy: true, data: response.data };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
};

// Token management utilities
export const getAuthToken = () => localStorage.getItem("token");
export const setAuthToken = (token) => localStorage.setItem("token", token);
export const clearAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("userData");
};

export default api;
