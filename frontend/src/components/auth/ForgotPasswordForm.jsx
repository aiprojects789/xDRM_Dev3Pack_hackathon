import React, { useState } from 'react';
import { Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button, TextField, InputAdornment, Input } from '@mui/material';
import { authAPI } from '../../services/api';

const ForgotPasswordForm = ({ onBack }) => {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  // Step 1: Send email
  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authAPI.forgotPassword(email);
      console.log("Successfully sent code!");
      setStep('verify');
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify + Reset Password
const handleVerifyCode = async (e) => {
  e.preventDefault();
  setError(null);

  if (newPassword !== confirmPassword) {
    setError('Passwords do not match');
    return;
  }
  setLoading(true);

try {
  await authAPI.resetPassword(email, verificationCode, newPassword);
  console.log("Password reset success");

  // ✅ Success ke baad error clear + form reset
  setError(null);
  setStep("done");

  // ✅ 3 second delay aur navigate (taki user success message dekh sake)
  setTimeout(() => {
    onBack(); // Switch back to login form
  }, 3000);

} catch (err) {
  setError(err.message || "Invalid code or server error");
} finally {
  setLoading(false);
}

};


  return (
    <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-xl">
      <div className="max-w-md w-full space-y-8">
        <div>
          <p onClick={onBack} className="flex items-center text-lg text-purple-800 hover:text-purple-700 cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Login
          </p>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {step === 'email' && 'Reset your password'}
            {step === 'verify' && 'Enter verification code'}
            {step === 'done' && 'Password Reset Successful'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === 'email' && 'Enter your email address to receive a verification code'}
            {step === 'verify' && 'We sent a code to your email'}
            {step === 'done' && 'Your password has been updated successfully.'}
          </p>
        </div>

        <div className="mt-8 bg-white py-8 px-4 shadow rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form className="space-y-6" onSubmit={handleSubmitEmail}>
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Mail style={{ color: 'gray' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit"
                color="secondary"
                variant='contained'
                disabled={loading}
                fullWidth
                className='!my-5'
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
            </form>
          )}

          {/* Step 2: Verify + Reset */}
          {step === 'verify' && (
            <form className="space-y-6" onSubmit={handleVerifyCode}>
              <Input
                placeholder="Verification Code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
                fullWidth
              />
              <Input
                placeholder="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                fullWidth
              />
              <Input
                placeholder="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                fullWidth
              />
              <Button
                type="submit"
                color="secondary"
                variant='contained'
                disabled={loading}
                fullWidth
                className='!my-5'
              >
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}

          {/* Step 3: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-4">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <p className="text-gray-600 text-center text-sm">
                Redirecting you to the login page in a few seconds...
              </p>
              <Button
                onClick={onBack}
                color="secondary"
                variant="contained"
                fullWidth
                className="!mt-6"
              >
                Go to Login Now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
