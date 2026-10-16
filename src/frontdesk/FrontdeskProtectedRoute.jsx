import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getLandingPath, userHasRole } from "../auth/roleUtils";
import AppLayout from "./components/AppLayout";
import { getAuth } from "./lib/store";
import { WebSocketProvider } from "../context/WebSocketContext";

export default function FrontdeskProtectedRoute({ allowedRoles, children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    document.body.classList.add("frontdesk-theme");

    return () => {
      document.body.classList.remove("frontdesk-theme");
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void getAuth()
      .then((authUser) => {
        if (mounted) {
          setUser(authUser);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="frontdesk-theme min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (allowedRoles && !userHasRole(user, ...allowedRoles)) {
    return <Navigate to={getLandingPath(user.role)} replace />;
  }

  return (
    <div className="frontdesk-theme">
      <WebSocketProvider>
        <AppLayout>{children}</AppLayout>
      </WebSocketProvider>
    </div>
  );
}
