import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { Mail, Lock, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { extractBackendErrorMessage } from '../lib/backendErrors';


export function ForgotPasswordModal({ open, onOpenChange }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetState = () => {
    setStep('email');
    setEmail('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/users/auth/password-reset/`,
        { user: email },
        {
          headers: {
            'Content-Type': 'application/json',
          },  
        }
      );
      
      if (response.data.success) {
        setStep('reset');
        setNotice('A verification code has been sent to your email.');
      } else {
        setError(
          extractBackendErrorMessage(
            response.data,
            'Failed to send OTP. Please try again.'
          )
        );
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      setError(
        extractBackendErrorMessage(error.response?.data, '') ||
        'Failed to send OTP. Please check your email and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setNotice('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/auth/resend-otp/`,
        {
          email,
          channel: 'any',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      setOtp('');
      setNotice(
        response.data?.message || 'A new verification code has been sent. Use the latest code from your email.'
      );
    } catch (error) {
      console.error('Error resending OTP:', error);
      setError(
        extractBackendErrorMessage(error.response?.data, '') ||
        'Failed to resend OTP. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    
    // Validate OTP
    if (otp.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    
    // Validate password
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/users/auth/password-reset/confirm/`,
        {
          user: email,
          otp,
          new_password: newPassword,
          confirm_password: confirmPassword
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.data.success) {
        setStep('success');
      } else {
        setError(
          extractBackendErrorMessage(
            response.data,
            'Failed to reset password. Please try again.'
          )
        );
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      setError(
        extractBackendErrorMessage(error.response?.data, '') ||
        'Failed to reset password. Please check your OTP and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const renderStep = () => {
    switch (step) {
      case 'email':
        return (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-purple-100 rounded-full">
              <Mail className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-center space-y-2">
              <DialogTitle>Forgot Password?</DialogTitle>
              <DialogDescription>
                Enter your email address and we'll send you a code to reset your password.
              </DialogDescription>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@cybersquad.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Sending...' : 'Send Code'}
              </Button>
            </div>
          </form>
        );

      case 'reset':
        return (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="flex justify-start mb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('email')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
            <div className="flex items-center justify-center w-10 h-10 mx-auto bg-purple-100 rounded-full">
              <Lock className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-center space-y-1">
              <DialogTitle className="text-lg">Reset Your Password</DialogTitle>
              <DialogDescription className="text-xs">
                Enter the code sent to {email} and set your new password
              </DialogDescription>
            </div>
            
            {/* Verification Code Section */}
            <div className="space-y-2">
              <Label htmlFor="otp" className="text-sm">Verification Code</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-10 w-10" />
                    <InputOTPSlot index={1} className="h-10 w-10" />
                    <InputOTPSlot index={2} className="h-10 w-10" />
                    <InputOTPSlot index={3} className="h-10 w-10" />
                    <InputOTPSlot index={4} className="h-10 w-10" />
                    <InputOTPSlot index={5} className="h-10 w-10" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button 
                type="button" 
                variant="link" 
                className="w-full p-0 h-auto text-xs" 
                onClick={handleResendOtp}
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : "Didn't receive the code? Resend"}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">And set new password</span>
              </div>
            </div>

            {/* Password Section */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10"
                required
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10"
                required
              />
            </div>
            
            {error && <p className="text-sm text-error">{error}</p>}
            {notice && <p className="text-sm text-emerald-600">{notice}</p>}
            
            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        );

      case 'success':
        return (
          <div className="space-y-4 text-center py-4">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-success-50 rounded-full">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <div className="space-y-2">
              <DialogTitle>Password Reset Successful!</DialogTitle>
              <DialogDescription>
                Your password has been successfully reset. You can now sign in with your new password.
              </DialogDescription>
            </div>
            <Button className="w-full" onClick={handleClose}>
              Back to Sign In
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden p-6">
        {step !== 'email' && step !== 'success' && <div className="pt-8" />}
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
