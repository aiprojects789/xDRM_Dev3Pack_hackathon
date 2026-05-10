import React, { useState } from 'react';
import AuthForm from '../components/auth/AuthForm';
import ForgetPasswordForm from '../components/auth/ForgotPasswordForm';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const Auth = () => {
  const [showForgetPassword, setShowForgetPassword] = useState(false);
  const { verifyGoogleToken, isAuthenticated, user, isInitialized } = useAuth();
  const navigate = useNavigate();

  // ✅ Redirect if already authenticated
  if (isInitialized && isAuthenticated) {
    const redirectPath = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  // ✅ Google OAuth Handler
  const handleGoogleSuccess = async (credential) => {
    try {
      const response = await verifyGoogleToken(credential);
      
      // Navigate based on completion and role
      if (response.requires_profile_completion) {
        navigate('/complete-profile');
      } else if (response.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Google login failed:', error);
      toast.error('Google login failed. Please try again.');
    }
  };

  const handleGoogleError = (error) => {
    console.error('Google login error:', error);
    toast.error('Failed to connect with Google. Please try again.');
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-blue-700 opacity-90"></div>
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-20" 
        style={{ backgroundImage: "url('https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')" }}
      ></div>
      <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
        <div className="p-4 flex flex-col md:flex-row items-center justify-center gap-6">
          <div className="text-center flex flex-col items-center">
            <img src="/logo_white.png" alt="Logo" className="mx-auto mb-6 w-80" />
            <h1 className="text-4xl font-bold text-white mb-8 -mt-6">
              Welcome to XDRM
            </h1>
            <p className="text-white max-w-xs md:max-w-md text-sm md:text-base">
              A blockchain-powered platform that ensures your digital artwork remains yours, prevents unauthorized use, and creates ethical revenue streams.
            </p>
          </div>

          {showForgetPassword ? (
            <ForgetPasswordForm onBack={() => setShowForgetPassword(false)} />
          ) : (
            <AuthForm 
              onForgetPasswordClick={() => setShowForgetPassword(true)}
              onGoogleSuccess={handleGoogleSuccess}
              onGoogleError={handleGoogleError}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;