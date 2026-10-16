import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Logo from "../components/figma/public/images/Login-bg.png";
import { API_BASE_URL } from '../config';
import { extractBackendErrorMessage } from '../lib/backendErrors';

export function ResetPasswordPage({ onResetComplete }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract email and OTP from URL parameters
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    const otpParam = params.get('otp');

    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
    if (otpParam) {
      setOtp(otpParam);
    }
  }, []);

  const validateForm = () => {
    if (!email || !otp || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return false;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      setError('Password must contain uppercase, lowercase, number, and special character');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/users/auth/password-reset/confirm/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user: email,
            otp: otp,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        setSuccess(true);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          onResetComplete();
        }, 2000);
      } else {
        setError(
          extractBackendErrorMessage(
            data,
            'Failed to reset password. Please try again.'
          )
        );
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError('Failed to reset password. Please try again or request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setNotice('');

    if (!email) {
      setError('Email is missing from the reset link. Request a new invite or reset link.');
      return;
    }

    try {
      setResendingOtp(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/resend-otp/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          channel: 'any',
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          extractBackendErrorMessage(
            data,
            'Failed to resend OTP. Please try again.'
          )
        );
        return;
      }

      setOtp('');
      setNotice(
        data?.message || 'A new OTP has been sent. Use the latest code from your email to continue.'
      );
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setResendingOtp(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-purple-100">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-900">Password Reset Successful!</h3>
              <p className="text-muted-foreground">
                Your password has been updated successfully. Redirecting you to login...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-purple-100">
        <CardHeader className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-br rounded-xl flex items-center justify-center shadow-lg">
            <img src={Logo} alt="logo" className="w-full h-full" />
          </div>
          <div className="text-center">
            <CardTitle className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Set Your Password
            </CardTitle>
            <CardDescription>Create a secure password for your admin account</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">This email was provided in your invitation</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">One-Time Code (OTP)</Label>
              <Input
                id="otp"
                type="text"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
              />
              <p className="text-xs text-muted-foreground">Check your email for the verification code</p>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-xs"
                onClick={handleResendOtp}
                disabled={resendingOtp || !email}
              >
                {resendingOtp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending OTP...
                  </>
                ) : (
                  "Didn't get the code or it expired? Resend OTP"
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters with uppercase, lowercase, number, and special character
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-500 text-sm p-4 bg-red-50 rounded-md">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="flex items-start gap-2 text-emerald-700 text-sm p-4 bg-emerald-50 rounded-md">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <Button 
              type="submit"
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Resetting Password...' : 'Set Password'}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              <p>
                Once you set your password, you'll be redirected to the login page.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
