import React, { useEffect, useState } from 'react';
import { Form, Input } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaUnlock } from 'react-icons/fa';
import GoogleLoginButton from '../common/GoogleLoginButton';
import { MdSecurity } from 'react-icons/md';

const layout = {
  labelCol: { span: 24 },
  wrapperCol: { span: 24 },
};

const validateMessages = {
  required: '${label} is required!',
  types: {
    email: '${label} is not a valid email!',
    number: '${label} is not a valid number!',
  },
  number: {
    range: '${label} must be between ${min} and ${max}',
  },
};

const AuthForm = ({ onForgetPasswordClick, onGoogleSuccess, onGoogleError }) => {
  const [authMode, setAuthMode] = useState('login');
  const [require2FA, setRequire2FA] = useState(false); // ✅ NEW: 2FA state
  const [otpCode, setOtpCode] = useState(''); // ✅ NEW: OTP code
  const [currentEmail, setCurrentEmail] = useState(''); // ✅ NEW: Store email for 2FA
  const [currentPassword, setCurrentPassword] = useState(''); // ✅ NEW: Store password for 2FA
  const { loginWithCredentials, signup, loading } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    const { email, password, name } = values.user;
    
    if (authMode === 'signup') {
      try {
        await signup({
          email,
          password,
          username: name,
          phone_number: values.user.phone_number,
        });
        
        alert('Successfully Registered. Please login to continue.');
        setAuthMode('login');
        form.resetFields();
      } catch (error) {
        console.error('Registration failed:', error);
      }
    } else {
      try {
        // Store credentials for potential 2FA retry
        setCurrentEmail(email);
        setCurrentPassword(password);

        const response = await loginWithCredentials(email, password);
        
        if (response.role === 'admin') {
          navigate('/admin/dashboard');
        } 
// ✅ NEW: Check if 2FA is required
        if (response.require2FA) {
          setRequire2FA(true);
          // Don't reset form, keep email/password filled
          return;
        }

        // ✅ UPDATED: Handle successful login
        if (response.success) {
          if (response.data?.role === 'admin') {
            navigate('/admin/dashboard');
          } else {
            navigate('/dashboard');
          }
        }
      } catch (error) {
        console.error('Login failed:', error);
      }
    }
  };

    // ✅ NEW: Handle 2FA submission
  const handle2FASubmit = async (e) => {
    e.preventDefault();
    
    if (otpCode.length !== 6) {
      alert('Please enter a valid 6-digit code');
      return;
    }

    try {
      const response = await loginWithCredentials(currentEmail, currentPassword, otpCode);
      
      if (response.success) {
        if (response.data?.role === 'admin') {
          navigate('/admin/dashboard');
        } else {
          navigate('/dashboard');
        }
      } else if (response.require2FA) {
        // Still needs 2FA - code was invalid
        alert(response.message || 'Invalid 2FA code. Please try again.');
      }
    } catch (error) {
      console.error('2FA verification failed:', error);
      alert('Invalid 2FA code. Please try again.');
    }
  };

  // ✅ NEW: Go back from 2FA screen
  const handleBack2FA = () => {
    setRequire2FA(false);
    setOtpCode('');
  };

  // Custom username validator
  const validateUsername = (_, value) => {
    if (!value) {
      return Promise.reject(new Error('Username is required!'));
    }
    
    const usernamePattern = /^[a-zA-Z0-9_]+$/;
    if (!usernamePattern.test(value)) {
      return Promise.reject(new Error('Username can only contain letters, numbers, and underscores'));
    }
    
    if (value.length < 3) {
      return Promise.reject(new Error('Username must be at least 3 characters long'));
    }
    
    if (value.length > 30) {
      return Promise.reject(new Error('Username must be less than 30 characters'));
    }
    
    return Promise.resolve();
  };

  useEffect(() => {
    form.resetFields();
    setRequire2FA(false); // ✅ NEW: Reset 2FA state when switching modes
    setOtpCode('');
  }, [authMode, form]);

    // ✅ NEW: Render 2FA screen if required
  if (require2FA && authMode === 'login') {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
            <MdSecurity className="text-3xl text-purple-600" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Two-Factor Authentication</h1>
          <p className="text-gray-600">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <form onSubmit={handle2FASubmit} className="space-y-6">
          {/* OTP Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Authentication Code
            </label>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-center text-3xl tracking-widest font-mono focus:border-purple-600 focus:outline-none"
              maxLength={6}
              autoFocus
              required
            />
            <p className="mt-2 text-sm text-gray-500 text-center">
              Code expires in 30 seconds
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 focus:ring-4 focus:ring-purple-300 text-white w-full py-3 rounded-md transition-all duration-200 ease-in-out font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify & Login'}
          </button>

          {/* Back Button */}
          <button
            type="button"
            onClick={handleBack2FA}
            disabled={loading}
            className="w-full text-purple-600 hover:text-purple-700 font-medium py-2 disabled:opacity-50"
          >
            ← Back to login
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Having trouble? Make sure your device time is synced correctly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-xl">
      <Form
        {...layout}
        form={form}
        name="auth"
        onFinish={onFinish}
        style={{ maxWidth: 600 }}
        layout="vertical"
        validateMessages={validateMessages}
      >
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-5">
          {authMode === 'signup' ? 'Create Account' : 'Login'}
        </h1>

        {authMode === 'signup' && (
          <Form.Item 
            name={['user', 'name']} 
            label="Username" 
            rules={[{ validator: validateUsername }]}
            help="Only letters, numbers, and underscores allowed (3-30 characters)"
          >
            <Input 
              className="border-2 border-gray-300 focus:!border-purple-600 hover:!border-purple-600 !py-2 px-4 text-lg rounded-md" 
              placeholder="e.g., john_doe123"
            />
          </Form.Item>
        )}

        <Form.Item 
          name={['user', 'email']} 
          label="Email" 
          rules={[{ type: 'email', required: true }]}
        >
          <Input className="focus:!border-purple-600 hover:!border-purple-600 border-2 border-gray-300 !py-2 px-4 text-lg rounded-md" />
        </Form.Item>
        {authMode === 'signup' && (
          <Form.Item 
            name={['user', 'phone_number']} 
            label="Phone Number" 
            rules={[
              { required: true, message: 'Please input your phone number!' },
              { pattern: /^\+?[1-9]\d{1,14}$/, message: 'Please enter a valid phone number (e.g. +923001234567)' }
            ]}
          >
            <Input 
              className="focus:!border-purple-600 hover:!border-purple-600 border-2 border-gray-300 !py-2 px-4 text-lg rounded-md" 
              placeholder="e.g. +923001234567"
            />
          </Form.Item>
        )}

        <Form.Item
          name={['user', 'password']}
          label="Password"
          rules={[
            {
              required: true,
              pattern: /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/,
              message: 'Password must be at least 8 characters, include upper and lower case, number, and special character.',
            },
          ]}
        >
          <Input.Password
            iconRender={(visible) => (visible ? <FaUnlock color="gray" /> : <FaLock color="gray" />)}
            className="border-2 border-gray-300 !py-2 px-4 text-lg rounded-md active:!border-purple-600 focus:!border-purple-600 hover:!border-purple-600"
          />
        </Form.Item>

        <div className="text-sm flex justify-end mb-5">
          <p
            onClick={onForgetPasswordClick}
            className="font-medium text-blue-800 hover:text-blue-700 cursor-pointer"
          >
            Forgot your password?
          </p>
        </div>

        {/* <Form.Item label={null}> */}
        <div className="space-y-4 mt-6">
          
          <button
            type="submit"
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 focus:ring-4 focus:ring-purple-300 text-white w-full py-3 rounded-md transition-all duration-200 ease-in-out font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span style={{ color: 'white' }}>
              {loading 
                ? (authMode === 'signup' ? 'Signing up...' : 'Logging in...')
                : (authMode === 'signup' ? 'Sign Up' : 'Login')
              }
            </span>
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* ✅ Google Login Button */}
          <GoogleLoginButton
            onSuccess={onGoogleSuccess}
            onError={onGoogleError}
            disabled={loading}
            text={authMode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
          />
        
        </div>
        

        <div>
          {authMode === 'signup' ? (
            <p className="text-center">
              Already have an account?{' '}
              <span
                className="text-purple-600 cursor-pointer hover:underline font-medium"
                onClick={() => setAuthMode('login')}
              >
                Login
              </span>
            </p>
          ) : (
            <p className="text-center">
              Don't have an account?{' '}
              <span
                className="text-purple-600 cursor-pointer hover:underline font-medium"
                onClick={() => setAuthMode('signup')}
              >
                Signup
              </span>
            </p>
          )}
        </div>
      </Form>
    </div>
  );
};

export default AuthForm;