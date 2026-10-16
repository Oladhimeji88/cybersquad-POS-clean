import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getLandingPath, resolveAppRoleFromAuthPayload } from "../auth/roleUtils";
import { DashboardLayout } from "../components/DashboardLayout";
import { WebSocketProvider } from "../context/WebSocketContext";

export default function AdminApp() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectPath, setRedirectPath] = useState(null);

  useEffect(() => {
    const checkAuth = () => {
      try {
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          const role = resolveAppRoleFromAuthPayload(user);

          if (user?.access && user?.refresh && role === "admin") {
            setIsAuthenticated(true);
          } else if (user?.access && user?.refresh && role) {
            setRedirectPath(getLandingPath(role));
          } else {
            localStorage.removeItem("user");
            localStorage.removeItem("auth_token");
          }
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        localStorage.clear();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("auth_token");
      localStorage.removeItem("prototype_session");
      setIsAuthenticated(false);
      navigate("/admin", { replace: true });
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Loading...
      </div>
    );
  }

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <WebSocketProvider>
      <DashboardLayout onLogout={handleLogout} />
    </WebSocketProvider>
  );
}
