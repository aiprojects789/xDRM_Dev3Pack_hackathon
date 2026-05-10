// import React, { useEffect, useState } from 'react';
// import { useNavigate, useSearchParams } from 'react-router-dom';
// import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
// import toast from 'react-hot-toast';
// import { handlePayPalCallback } from '../services/api';

// const PayPalOAuthCallback = () => {
//   const [searchParams] = useSearchParams();
//   const navigate = useNavigate();
//   const [status, setStatus] = useState('processing'); // processing, success, error
//   const [message, setMessage] = useState('Connecting your PayPal account...');

//   useEffect(() => {
//     const processCallback = async () => {
//       try {
//         // Get OAuth parameters from URL
//         const code = searchParams.get('code');
//         const state = searchParams.get('state');
//         const error = searchParams.get('error');
//         const errorDescription = searchParams.get('error_description');

//         // Check if OAuth was initiated by us
//         const wasInitiated = sessionStorage.getItem('paypal_oauth_initiated');
        
//         if (!wasInitiated) {
//           throw new Error('Invalid OAuth request - session not found');
//         }

//         // Clear the session flag
//         sessionStorage.removeItem('paypal_oauth_initiated');

//         // Handle OAuth error
//         if (error) {
//           throw new Error(errorDescription || error);
//         }

//         // Validate required parameters
//         if (!code || !state) {
//           throw new Error('Missing OAuth parameters');
//         }

//         setMessage('Verifying with PayPal...');

//         // Exchange code for tokens
//         const response = await handlePayPalCallback(code, state);

//         if (response.success) {
//           setStatus('success');
//           setMessage('PayPal connected successfully!');
//           toast.success('PayPal connected! You can now make automatic payments.');
          
//           // Redirect to dashboard after 2 seconds
//           setTimeout(() => {
//             navigate('/dashboard');
//           }, 2000);
//         } else {
//           throw new Error(response.message || 'Failed to connect PayPal');
//         }

//       } catch (error) {
//         console.error('❌ OAuth callback error:', error);
//         setStatus('error');
//         setMessage(error.message || 'Failed to connect PayPal account');
//         toast.error(error.message || 'Failed to connect PayPal');

//         // Redirect to dashboard after 3 seconds
//         setTimeout(() => {
//           navigate('/dashboard');
//         }, 3000);
//       }
//     };

//     processCallback();
//   }, [searchParams, navigate]);

//   return (
//     <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
//       <div className="max-w-md w-full">
//         <div className="bg-white rounded-lg shadow-lg p-8">
//           {/* Header */}
//           <div className="text-center mb-6">
//             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
//               {status === 'processing' && (
//                 <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
//               )}
//               {status === 'success' && (
//                 <CheckCircle className="w-8 h-8 text-green-600" />
//               )}
//               {status === 'error' && (
//                 <XCircle className="w-8 h-8 text-red-600" />
//               )}
//             </div>
            
//             <h1 className="text-2xl font-bold text-gray-900 mb-2">
//               {status === 'processing' && 'Connecting PayPal'}
//               {status === 'success' && 'Connected Successfully'}
//               {status === 'error' && 'Connection Failed'}
//             </h1>
            
//             <p className="text-gray-600">
//               {message}
//             </p>
//           </div>

//           {/* Progress Indicator */}
//           {status === 'processing' && (
//             <div className="space-y-3">
//               <div className="flex items-center space-x-3">
//                 <div className="flex-shrink-0">
//                   <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
//                 </div>
//                 <span className="text-sm text-gray-600">Verifying OAuth code...</span>
//               </div>
//               <div className="flex items-center space-x-3">
//                 <div className="flex-shrink-0">
//                   <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-75"></div>
//                 </div>
//                 <span className="text-sm text-gray-600">Exchanging tokens...</span>
//               </div>
//               <div className="flex items-center space-x-3">
//                 <div className="flex-shrink-0">
//                   <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-150"></div>
//                 </div>
//                 <span className="text-sm text-gray-600">Saving connection...</span>
//               </div>
//             </div>
//           )}

//           {/* Success Message */}
//           {status === 'success' && (
//             <div className="bg-green-50 border border-green-200 rounded-lg p-4">
//               <div className="flex items-start space-x-3">
//                 <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
//                 <div className="flex-1">
//                   <h3 className="text-sm font-medium text-green-900 mb-1">
//                     All Set!
//                   </h3>
//                   <p className="text-sm text-green-700">
//                     Your PayPal account is now connected. Future transactions will be automatic - no more redirect popups!
//                   </p>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Error Message */}
//           {status === 'error' && (
//             <div className="bg-red-50 border border-red-200 rounded-lg p-4">
//               <div className="flex items-start space-x-3">
//                 <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
//                 <div className="flex-1">
//                   <h3 className="text-sm font-medium text-red-900 mb-1">
//                     Connection Failed
//                   </h3>
//                   <p className="text-sm text-red-700 mb-2">
//                     {message}
//                   </p>
//                   <button
//                     onClick={() => navigate('/dashboard')}
//                     className="text-sm text-red-600 hover:text-red-700 underline"
//                   >
//                     Go to Dashboard
//                   </button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Auto-redirect notice */}
//           <div className="mt-6 text-center">
//             <p className="text-xs text-gray-500">
//               {status === 'success' 
//                 ? 'Redirecting to dashboard in 2 seconds...'
//                 : status === 'error'
//                 ? 'Redirecting to dashboard in 3 seconds...'
//                 : 'Please wait...'
//               }
//             </p>
//           </div>
//         </div>

//         {/* Security Notice */}
//         <div className="mt-4 text-center">
//           <p className="text-xs text-gray-500">
//             🔒 Your PayPal credentials are securely stored and encrypted
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PayPalOAuthCallback;