import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { artworksAPI } from '../services/api';
import { cacheService } from '../services/cacheService';
import LoadingSpinner from './common/LoadingSpinner';
import { CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const PayPalCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const hasProcessed = useRef(false); // ✅ Prevent duplicate processing

  useEffect(() => {
    const processPayment = async () => {
      // ✅ Check if already processed
      if (hasProcessed.current) {
        console.log('⚠️ Payment already processed, skipping duplicate request');
        return;
      }

      try {
        const token = searchParams.get('token');
        const type = searchParams.get('type');
        const tokenId = searchParams.get('token_id');
        const licenseType = searchParams.get('license_type');

        if (!token) {
          throw new Error('No payment token received');
        }

        // ✅ Mark as processing
        hasProcessed.current = true;

        const confirmation = await artworksAPI.confirmPaypalPayment({
          order_id: token,
          type: type,
          token_id: tokenId ? parseInt(tokenId) : null,
          license_type: licenseType
        });

        if (confirmation.success) {
          setStatus('success');
          
          // ✅ NEW: Invalidate all caches after successful PayPal payment
          cacheService.invalidateAll();
          
          // ✅ Check if already processed (from backend response)
          if (confirmation.already_processed) {
            toast.success(`Payment already completed! ${type} has been processed.`);
          } else {
            toast.success(`Payment completed! ${type} has been processed.`);
          }

          setTimeout(() => {
            switch (type) {
              case 'registration':
                navigate('/dashboard/artworks');
                break;
              case 'artwork':
                navigate(`/artwork/${tokenId}`);
                break;
              case 'license':
                navigate('/licenses');
                break;
              default:
                navigate('/dashboard');
            }
          }, 3000);
        } else {
          throw new Error(confirmation.message || 'Payment confirmation failed');
        }

      } catch (error) {
        console.error('Payment processing failed:', error);
        setStatus('error');
        
        // ✅ Reset flag on error so user can retry
        if (error.response?.status !== 400) {
          hasProcessed.current = false;
        }
        
        toast.error('Payment processing failed');
      }
    };

    processPayment();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="flex justify-center mb-6">
          {status === 'processing' && <LoadingSpinner size="large" />}
          {status === 'success' && <CheckCircle className="w-16 h-16 text-green-500" />}
          {status === 'error' && <XCircle className="w-16 h-16 text-red-500" />}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {status === 'processing' && 'Processing your payment...'}
          {status === 'success' && 'Payment Successful!'}
          {status === 'error' && 'Payment Failed'}
        </h2>
        <p className="text-gray-600 mb-6">
          {status === 'processing' && 'Please wait while we confirm your payment...'}
          {status === 'success' && 'Your transaction has been completed successfully.'}
          {status === 'error' && 'There was an error processing your payment.'}
        </p>
        {status === 'success' && (
          <p className="text-sm text-green-600">Redirecting you in a few seconds...</p>
        )}
        {status === 'error' && (
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <span className="text-white">Go Back</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PayPalCallback;