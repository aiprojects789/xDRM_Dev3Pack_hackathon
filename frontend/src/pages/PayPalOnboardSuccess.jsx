import React, { useEffect,useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const PayPalOnboardSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { connectPayPal } = useAuth();
  const [processed, setProcessed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showManualButton, setShowManualButton] = useState(false);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const MAX_POLLING_ATTEMPTS = 10; // 10 attempts = 20 seconds
  
  // ✅ Check onboarding status from backend if merchant ID not in URL
  const checkOnboardingStatus = async (isPolling = false) => {
    try {
      setCheckingStatus(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BASE_URL_BACKEND}/paypal/onboarding-status`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.onboarded && data.merchant_id) {
          console.log('✅ Onboarding already completed - Merchant ID:', data.merchant_id);
          // ✅ Connect PayPal with merchant ID from backend
          const result = await connectPayPal(data.merchant_id);
          if (result && !result.error) {
            toast.success('PayPal account connected successfully!');
            const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
            console.log('🔗 Retrieved return URL from sessionStorage (manual):', returnUrl);
            sessionStorage.removeItem('paypal_return_url'); // Clean up
            setTimeout(() => {
              console.log('🔗 Navigating to:', returnUrl);
              // Use window.location for absolute navigation to ensure it works
              if (returnUrl.startsWith('/')) {
                window.location.href = returnUrl;
              } else {
                navigate(returnUrl, { replace: true });
              }
            }, 2000);
          } else {
            throw new Error('Failed to connect PayPal account');
          }
        } else {
          // ✅ If polling, continue checking (webhook might be processing)
          if (isPolling && pollingAttempts < MAX_POLLING_ATTEMPTS) {
            console.log(`⏳ Waiting for webhook... Attempt ${pollingAttempts + 1}/${MAX_POLLING_ATTEMPTS}`);
            return; // Continue polling
          }
          // ✅ Show manual completion button if onboarding not complete
          setShowManualButton(true);
          throw new Error('Onboarding not yet completed');
        }
      } else {
        throw new Error('Failed to check onboarding status');
      }
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);
      // ✅ Only show manual button if not polling or max attempts reached
      if (!isPolling || pollingAttempts >= MAX_POLLING_ATTEMPTS) {
        if (!showManualButton) {
          setShowManualButton(true);
        }
      }
    } finally {
      setCheckingStatus(false);
    }
  };
  
  // ✅ Polling function to check for webhook completion
  const pollForWebhookCompletion = async () => {
    if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
      console.log('⏰ Max polling attempts reached. Showing manual button.');
      setShowManualButton(true);
      setCheckingStatus(false);
      return;
    }
    
    setPollingAttempts(prev => {
      const newAttempts = prev + 1;
      console.log(`🔄 Polling attempt ${newAttempts}/${MAX_POLLING_ATTEMPTS}...`);
      return newAttempts;
    });
    
    // Wait 2 seconds before checking
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check status
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BASE_URL_BACKEND}/paypal/onboarding-status`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.onboarded && data.merchant_id) {
          console.log('✅✅✅ Webhook completed! Merchant ID found:', data.merchant_id);
          // ✅ Connect PayPal with merchant ID from backend
          const result = await connectPayPal(data.merchant_id);
          if (result && !result.error) {
            toast.success('PayPal account connected successfully via webhook!');
            const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
            console.log('🔗 Retrieved return URL from sessionStorage (webhook):', returnUrl);
            sessionStorage.removeItem('paypal_return_url'); // Clean up
            setTimeout(() => {
              console.log('🔗 Navigating to:', returnUrl);
              // Use window.location for absolute navigation to ensure it works
              if (returnUrl.startsWith('/')) {
                window.location.href = returnUrl;
              } else {
                navigate(returnUrl, { replace: true });
              }
            }, 2000);
            return; // Stop polling
          }
        }
      }
      
      // ✅ Continue polling if merchant_id not found yet
      if (pollingAttempts < MAX_POLLING_ATTEMPTS - 1) {
        setTimeout(() => pollForWebhookCompletion(), 2000);
      } else {
        console.log('⏰ Max polling attempts reached. Showing manual button.');
        setShowManualButton(true);
        setCheckingStatus(false);
      }
    } catch (error) {
      console.error('❌ Error during polling:', error);
      // Continue polling on error (might be temporary)
      if (pollingAttempts < MAX_POLLING_ATTEMPTS - 1) {
        setTimeout(() => pollForWebhookCompletion(), 2000);
      } else {
        setShowManualButton(true);
        setCheckingStatus(false);
      }
    }
  };
  
  // ✅ Manual completion handler
  const handleManualCompletion = async () => {
    try {
      setCheckingStatus(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BASE_URL_BACKEND}/paypal/complete-onboarding-manual`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.merchant_id) {
          console.log('✅ Manual onboarding completion successful - Merchant ID:', data.merchant_id);
          // ✅ Connect PayPal with merchant ID
          const result = await connectPayPal(data.merchant_id);
          if (result && !result.error) {
            toast.success('PayPal account connected successfully!');
            const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
            console.log('🔗 Retrieved return URL from sessionStorage (manual completion):', returnUrl);
            sessionStorage.removeItem('paypal_return_url'); // Clean up
            setTimeout(() => {
              console.log('🔗 Navigating to:', returnUrl);
              // Use window.location for absolute navigation to ensure it works
              if (returnUrl.startsWith('/')) {
                window.location.href = returnUrl;
              } else {
                navigate(returnUrl, { replace: true });
              }
            }, 2000);
          } else {
            throw new Error('Failed to connect PayPal account');
          }
        } else {
          throw new Error(data.message || 'Onboarding completion failed');
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || 'Failed to complete onboarding');
      }
    } catch (error) {
      console.error('❌ Error in manual completion:', error);
      toast.error(error.message || 'Could not complete onboarding. Please try again or contact support.');
    } finally {
      setCheckingStatus(false);
    }
  };
  
  useEffect(() => {
    if (processed) return; // ✅ Prevent duplicate calls
    
    // Log sessionStorage on component mount to debug
    console.log('🔍 PayPalOnboardSuccess mounted - Checking sessionStorage:');
    console.log('🔍 paypal_return_url:', sessionStorage.getItem('paypal_return_url'));
    console.log('🔍 All sessionStorage keys:', Object.keys(sessionStorage));
    
    const handleOnboardingComplete = async () => {
      // ✅ Try multiple query parameter names
      const merchantId = searchParams.get('merchantIdInPayPal') || 
                        searchParams.get('merchantId') || 
                        searchParams.get('merchant_id');
      
      console.log('🔍 Onboarding callback - Merchant ID:', merchantId);
      console.log('🔍 All search params:', Object.fromEntries(searchParams.entries()));
      
      if (merchantId) {
        setProcessed(true); // ✅ Mark as processed
        
        try {
          // ✅ Connect the PayPal account (saves merchant_id to user)
          const result = await connectPayPal(merchantId);
          
          if (result && !result.error) {
            toast.success('PayPal account connected successfully!');
            // ✅ Redirect to stored return URL or dashboard after 2 seconds
            const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
            console.log('🔗 Retrieved return URL from sessionStorage:', returnUrl);
            console.log('🔗 All sessionStorage keys:', Object.keys(sessionStorage));
            sessionStorage.removeItem('paypal_return_url'); // Clean up
            setTimeout(() => {
              console.log('🔗 Navigating to:', returnUrl);
              // Use window.location for absolute navigation to ensure it works
              if (returnUrl.startsWith('/')) {
                window.location.href = returnUrl;
              } else {
                navigate(returnUrl, { replace: true });
              }
            }, 2000);
          } else {
            const errorMsg = result?.error || 'Unknown error';
            console.error('❌ PayPal connection failed:', errorMsg);
            toast.error(`Failed to link PayPal account: ${errorMsg}`);
            const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
            sessionStorage.removeItem('paypal_return_url'); // Clean up
            setTimeout(() => {
              navigate(returnUrl, { replace: true });
            }, 3000);
          }
        } catch (error) {
          console.error('❌ Error connecting PayPal:', error);
          toast.error('Failed to link PayPal account');
          const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
          sessionStorage.removeItem('paypal_return_url'); // Clean up
          setTimeout(() => {
            navigate(returnUrl);
          }, 3000);
        }
      } else {
        // ✅ No merchant ID in URL - webhook se merchant_id check karo
        console.warn('⚠️ No merchant ID found in callback URL - checking backend status (webhook might have saved it)...');
        await checkOnboardingStatus(false);
        
        // ✅ Start polling for webhook completion (if not already completed)
        if (!showManualButton && pollingAttempts === 0) {
          console.log('🔄 Starting polling for webhook completion...');
          setTimeout(() => pollForWebhookCompletion(), 2000);
        }
      }
    };

    handleOnboardingComplete();
  }, [searchParams, connectPayPal, navigate, processed]);
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="flex justify-center mb-6">
          {checkingStatus ? (
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
          ) : (
            <CheckCircle className="w-16 h-16 text-green-500" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {checkingStatus 
            ? 'Verifying PayPal Connection...' 
            : showManualButton 
              ? 'Complete PayPal Setup' 
              : 'PayPal Connected Successfully!'}
        </h2>
        <p className="text-gray-600 mb-6">
          {checkingStatus 
            ? pollingAttempts > 0
              ? `Waiting for webhook to process... (${pollingAttempts}/${MAX_POLLING_ATTEMPTS})`
              : 'Please wait while we verify your PayPal account connection...'
            : showManualButton
              ? 'If you completed the PayPal onboarding process, click the button below to finalize the connection. Webhook may take a few seconds to process.'
              : 'Your PayPal account has been linked. Redirecting...'}
        </p>
        {showManualButton && !checkingStatus && (
          <button
            onClick={handleManualCompletion}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Complete PayPal Connection
          </button>
        )}
        {showManualButton && !checkingStatus && (
          <button
            onClick={() => {
              const returnUrl = sessionStorage.getItem('paypal_return_url') || '/dashboard';
              sessionStorage.removeItem('paypal_return_url');
              navigate(returnUrl, { replace: true });
            }}
            className="mt-3 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        )}
      </div>
    </div>
  );
};

export default PayPalOnboardSuccess;