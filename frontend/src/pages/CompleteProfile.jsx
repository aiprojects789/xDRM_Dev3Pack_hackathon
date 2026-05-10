import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Phone, User, ArrowRight, Loader2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { countries } from '../utils/countries';

const CompleteProfile = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [phoneBody, setPhoneBody] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries.find(c => c.iso === 'PK') || countries[0]);
  const [fullName, setFullName] = useState(user?.username || '');
  const [otp, setOtp] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (user?.phone_number) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const completeProfile = async () => {
    try {
      const sanitizedPhone = phoneBody.replace(/^0+/, '');
      const fullPhoneNumber = `+${selectedCountry.code}${sanitizedPhone}`;
      await authAPI.updateProfile({
        phone_number: fullPhoneNumber,
        full_name: fullName
      });
      toast.success('Profile completed successfully!');
      await refreshUser();
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to complete profile:', error);
      toast.error(error.message || 'Failed to update profile');
    }
  };

  const onSignInSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }

    if (!phoneBody) {
      toast.error('Phone number is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await authAPI.sendProfileOTP();
      setShowOTP(true);
      toast.success('Verification code sent to your email!');
    } catch (error) {
      console.error("OTP Error:", error);
      toast.error(error.message || 'Failed to send verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onOTPVerify = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    setIsVerifying(true);
    try {
      await authAPI.verifyAuthOTP(user.email, otp);
      toast.success('Identity verified!');
      await completeProfile();
    } catch (error) {
      console.error("OTP Error:", error);
      toast.error(error.response?.data?.detail || 'Invalid code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
            <p className="text-gray-500 mt-2">
              {showOTP 
                ? `We've sent a 6-digit code to ${user?.email}`
                : "Please provide your details to continue using XDRM securely."
              }
            </p>
          </div>

          <form onSubmit={showOTP ? onOTPVerify : onSignInSubmit} className="space-y-6">
            {!showOTP ? (
              <>
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-gray-50"
                      placeholder="Your Name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-5 w-5 text-gray-400" />
                    </div>
                    <select
                      id="country"
                      required
                      value={selectedCountry.iso}
                      onChange={(e) => {
                        const country = countries.find(c => c.iso === e.target.value);
                        setSelectedCountry(country);
                      }}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-gray-50"
                    >
                      {countries.map((c) => (
                        <option key={c.iso} value={c.iso}>
                          {c.country} (+{c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-none">
                      <div className="flex items-center justify-center px-4 h-full border border-gray-200 rounded-xl bg-gray-100 text-gray-600 font-medium min-w-[70px]">
                        +{selectedCountry.code}
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="tel"
                        id="phoneNumber"
                        required
                        value={phoneBody}
                        onChange={(e) => setPhoneBody(e.target.value.replace(/\D/g, ''))}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-gray-50"
                        placeholder="3001234567"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                  Enter Verification Code <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="otp"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-gray-50 text-center tracking-[1em] font-bold text-xl"
                    placeholder="000000"
                  />
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowOTP(false)} 
                  className="mt-2 text-xs text-purple-600 hover:underline"
                >
                  Change details?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isVerifying}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-purple-200 active:scale-95"
            >
              {isSubmitting || isVerifying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="text-white">{showOTP ? 'Verify & Complete' : 'Send Verification Code'}</span>
                  <ArrowRight className="w-5 h-5 text-white" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfile;
