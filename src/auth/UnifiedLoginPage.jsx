import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { ForgotPasswordModal } from "../components/ForgotPasswordModal";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { API_BASE_URL } from "../config";
import { getLandingPath, resolveAppRoleFromAuthPayload } from "./roleUtils";
import cybersquadLogo from "../frontdesk/assets/cybersquad-logo.png";
import cybersquadLightLogo from "../frontdesk/assets/cybersquad black.png";
import loginBackground from "../frontdesk/assets/logini.png";

export function getRoleFromApiResult(responseData) {
  return resolveAppRoleFromAuthPayload(responseData);
}

export { getLandingPath };

export default function UnifiedLoginPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  const activeLogo = isDark ? cybersquadLogo : cybersquadLightLogo;

  useEffect(() => {
    let mounted = true;
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const payload = JSON.parse(userStr);
        if (payload?.access) {
          const role = getRoleFromApiResult(payload);
          if (role) {
            const landingPath = getLandingPath(role);
            navigate(landingPath, { replace: true });
            return;
          }

          localStorage.removeItem("user");
          localStorage.removeItem("auth_token");
        }
      }
    } catch (err) {
      console.error("Error checking existing auth:", err);
    } finally {
      if (mounted) {
        setAuthChecked(true);
      }
    }
    return () => { mounted = false; };
  }, [navigate]);

  useEffect(() => {
    document.body.classList.add("frontdesk-theme");
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      document.body.classList.remove("frontdesk-theme");
      observer.disconnect();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: email.trim(),
          password,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(responseData.detail || "Incorrect username or password");
        }
        throw new Error(responseData.detail || "Login failed. Please try again later.");
      }

      if (!responseData?.access || !responseData?.refresh) {
        throw new Error("Invalid response from server - missing tokens");
      }

      const role = getRoleFromApiResult(responseData);
      if (!role) {
        throw new Error("Login succeeded but this account does not have a supported dashboard role.");
      }

      localStorage.setItem("user", JSON.stringify(responseData));
      localStorage.setItem("auth_token", responseData.access);

      const landingPath = getLandingPath(role);
      navigate(landingPath, { replace: true });
    } catch (loginError) {
      console.error("Unified login error:", loginError);
      setError(
        loginError instanceof Error
          ? loginError.message
          : "An unexpected error occurred during sign in.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <div className="frontdesk-theme login-shell">
        <div className="login-hero">
          <img src={loginBackground} alt="" aria-hidden="true" />
          <p className="login-tagline">
            Streamline your device repair workflow. From intake to quality check,
            manage every ticket, part, and customer in one place.
          </p>
        </div>

        <div className="login-panel">
          <div className="w-full max-w-sm motion-rise">
            <div className="mb-8">
              <img src={activeLogo} alt="Cybersquad" className="h-6 w-auto mb-4" />
              <h1 className="text-2xl font-semibold text-foreground mb-2">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" onChange={() => setError("")}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@cybersquad.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary border-border pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="press absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <div className="text-right">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot password?
                  </Button>
                </div>
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {loading ? "Signing in..." : "Sign In"}
                {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </form>
            {/* Local development only (stripped from production builds): browse the app with no backend account. */}
            {import.meta.env.DEV && (
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => {
                  localStorage.setItem("prototype_session", "1");
                  localStorage.setItem("user", JSON.stringify({
                    access: "prototype", refresh: "prototype",
                    user: { id: 0, name: "Prototype Admin", email: "prototype@local", is_superuser: true, role: "admin" },
                    roles: [{ name: "admin" }, { name: "sales" }],
                  }));
                  navigate("/admin", { replace: true });
                }}
              >
                Continue as prototype admin (no backend)
              </Button>
            )}
          </div>
        </div>
      </div>

      <ForgotPasswordModal open={showForgotPassword} onOpenChange={setShowForgotPassword} />
    </>
  );
}
