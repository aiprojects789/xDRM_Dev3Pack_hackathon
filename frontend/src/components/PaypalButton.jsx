import React, { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from "@mui/material";
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const PayPalButton = () => {
  const [onboarding, setOnboarding] = useState(false);
  const { enablePayPal, loading: settingsLoading } = useSettings()
  const {
    isAuthenticated,
    isPayPalConnected,
    connectPayPal,
    disconnectPayPal,
    loading,
    user
  } = useAuth();

  if (settingsLoading) return null;
  if (!enablePayPal) return null;

  const handleConnectPayPal = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in first to connect your PayPal account');
      return;
    }

    setOnboarding(true);
    try {
      const token = localStorage.getItem('token');
      console.log('Token:', token); // Add this debug line
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/paypal/onboard-seller`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to start PayPal onboarding';

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Check for different possible response structures
      if (data.onboarded || data.merchant_id) {
        // Already onboarded
        await connectPayPal(data.merchant_id);
        toast.success('PayPal account already connected!');
      } else if (data.signup_url || data.approve_url) {
        // Start onboarding process
        sessionStorage.setItem('paypal_onboarding', 'true');
        window.location.href = data.signup_url || data.approve_url;
      } else {
        console.log('PayPal response:', data);
        throw new Error('Invalid response from server - no onboarding URL provided');
      }
    } catch (error) {
      console.error('PayPal connection failed:', error);
      toast.error('Failed to connect PayPal: ' + error.message);
    } finally {
      setOnboarding(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectPayPal();
  };

  // Don't show if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }


  // User is authenticated and PayPal is connected
  if (isPayPalConnected) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4 text-blue-600" />
          <div className="flex flex-col">
            <span className="text-xs text-gray-700 font-medium">
              PayPal Payouts Enabled
            </span>
            <span className="text-xs text-gray-500">
              Faster payouts active
            </span>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // User is authenticated but PayPal not connected
  return (
    <Button
      onClick={handleConnectPayPal}
      disabled={onboarding || loading}
      variant="outlined"
      color="primary"
      startIcon={<CreditCard />}
      size="small"
    >
      {onboarding ? "Connecting..." : "Enable PayPal Payouts"}
    </Button>
  );
};

export default PayPalButton;