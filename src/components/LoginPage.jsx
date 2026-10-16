import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Shield } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
// import { API_BASE_URL } from "../config";
import  Logo from "../components/figma/public/images/Login-bg.png"
import { API_BASE_URL } from '../config';


export function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

   
      // ✅ This is where you add your backend call
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Basic validation
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/token/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(responseData.detail || "Incorrect username or password");
        } else {
          throw new Error(responseData.detail || "Login failed. Please try again later.");
        }
      }
      
      if (responseData?.access && responseData?.refresh) {
        onLogin(responseData.access, responseData.refresh);
      } else {
        throw new Error("Invalid response from server - missing tokens");
      }
    } catch (error) {
      console.error("Login error: ", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }
  // const handleSubmit = (e: React.FormEvent) => {
  //   e.preventDefault();
  //   // Mock login - in production, this would validate credentials
  //   onLogin();
  // };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-purple-100">
        <CardHeader className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 bg-gradient-to-br  rounded-xl flex items-center justify-center shadow-lg">
            {/* <Shield className="w-8 h-8 text-white" /> */}
              <img src={Logo} alt="logo" className="w-full h-full" />
          </div>
          <div className="text-center">
            <CardTitle className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Cybersquad Admin </CardTitle>
            <CardDescription>Sign in to access admin dashboard</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" onChange={() => setError("")}>
            <div className="space-y-2">
              <Label htmlFor="username">username/email</Label>
              <Input
                id="username"
                type="username"
                placeholder="admin@cybersquad.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="text-right">
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-sm"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Forgot password?
                </Button>
              </div>
            </div>
            {error && (
              <div className="text-red-500 text-sm text-center p-2 bg-red-50 rounded-md">
                {error}
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <ForgotPasswordModal open={showForgotPassword} onOpenChange={setShowForgotPassword} />
    </div>
  );
}