import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAuth, getOnlineBookings, getTickets, setAuth, User } from "@/frontdesk/lib/store";
import { userHasRole } from "@/auth/roleUtils";
import { useApi } from "@/hooks/useApi";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  UsersRound,
  Wrench,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  Laptop,
  UserRound,
  Globe,
  CreditCard,
  AlertTriangle,
  Clock3,
  Bell,
  ClipboardCheck,
  Tag,
  ShoppingCart,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import cybersquadLogo from "@/frontdesk/assets/cybersquad-logo.png";
import cybersquadLightLogo from "@/frontdesk/assets/cybersquad black.png";
import { useWS } from "@/context/WebSocketContext";
import { NotificationDropdown } from "@/frontdesk/components/NotificationDropdown";
import { hasPrivilege } from "@/auth/privileges";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showCountBadge?: boolean;
  countType?: "online_bookings" | "draft_tickets" | "qa_reviews";
}

function WalkInIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block ${className ?? "w-5 h-5"}`}>
      <Laptop className="w-full h-full" />
      <UserRound className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-sidebar p-[2px]" />
    </span>
  );
}

const frontDeskNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/walk-in", label: "Walk In", icon: WalkInIcon },
  { path: "/drafts", label: "Draft Tickets", icon: ClipboardList, showCountBadge: true, countType: "draft_tickets" },
  { path: "/self-service", label: "Corporate / Bulk Jobs", icon: Globe, showCountBadge: true, countType: "online_bookings" },
  { path: "/operations", label: "Operations", icon: Briefcase },
];

const adminNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/operations", label: "Operations", icon: Briefcase },
  { path: "/admin/users", label: "User Management", icon: UsersRound },
  { path: "/admin/jobs", label: "Job Management", icon: ClipboardList },
  { path: "/admin/payments", label: "Payment", icon: CreditCard },
  { path: "/admin/disputes", label: "Dispute Management", icon: AlertTriangle },
  { path: "/admin/dispute-sla", label: "Dispute SLA", icon: Clock3 },
  { path: "/admin/services", label: "Service Management", icon: Wrench },
  { path: "/admin/management", label: "Admin Management", icon: Settings },
  { path: "/admin/notifications", label: "Notifications", icon: Bell, showCountBadge: true },
];

const engineerNavItems: NavItem[] = [
  { path: "/engineer", label: "Technician Desk", icon: Wrench },
  { path: "/engineer/done-jobs", label: "Done Jobs", icon: ClipboardList },
  { path: "/inventory", label: "Inventory", icon: Package },
];

const qaNavItems: NavItem[] = [
  { path: "/qa", label: "QA Desk", icon: ClipboardCheck },
];

const inventoryManagerNavItems: NavItem[] = [
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/operations", label: "Operations", icon: Briefcase },
];

const posNavItems: NavItem[] = [
  { path: "/pos", label: "New Sale", icon: ShoppingCart },
  { path: "/operations", label: "Operations", icon: Briefcase },
];

const operationsOnlyNavItems: NavItem[] = [
  { path: "/operations", label: "Operations", icon: Briefcase },
];

const THEME_KEY = "cybersquad_theme";

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { api } = useApi();
  const [isDark, setIsDark] = useState(false);
  const { isConnected, unreadCount, updateUnreadCount } = useWS();
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingOnlineBookings, setPendingOnlineBookings] = useState(0);
  const [pendingDraftTickets, setPendingDraftTickets] = useState(0);
  const [pendingQaReviews, setPendingQaReviews] = useState(0);
  const activeLogo = isDark ? cybersquadLogo : cybersquadLightLogo;
  // A user can hold several roles (for example front desk plus sales/POS); the sidebar combines the pages of each.
  const heldRoles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const navByRole: Record<string, NavItem[]> = {
    front_desk: frontDeskNavItems,
    engineer: engineerNavItems,
    qa: qaNavItems,
    inventory_manager: inventoryManagerNavItems,
    sales: posNavItems,
    admin: adminNavItems,
    procurement: operationsOnlyNavItems,
    logistics: operationsOnlyNavItems,
    finance: operationsOnlyNavItems,
    cx: operationsOnlyNavItems,
    marketing: operationsOnlyNavItems,
    operations: operationsOnlyNavItems,
  };
  const baseNavItems = (() => {
    const ordered = user?.role ? [user.role, ...heldRoles.filter((role) => role !== user.role)] : heldRoles;
    const seen = new Set<string>();
    const items: NavItem[] = [];
    for (const role of ordered.length ? ordered : ["front_desk"]) {
      for (const item of navByRole[role] ?? []) {
        if (!seen.has(item.path)) { seen.add(item.path); items.push(item); }
      }
    }
    return items;
  })();

  const canSeeDeviceCategories =
    userHasRole(user, "front_desk", "qa", "inventory_manager") &&
    hasPrivilege("privilege_lead_engineer_management");

  const navItems = canSeeDeviceCategories
    ? [...baseNavItems, { path: "/device-categories", label: "Device Categories", icon: Tag } as NavItem]
    : baseNavItems;
  const ROLE_LABELS: Record<string, string> = {
    front_desk: "Front Desk",
    engineer: "Technician",
    qa: "QA Desk",
    inventory_manager: "Inventory Manager",
    sales: "Sales / Cashier",
    admin: "Admin",
    procurement: "Procurement",
    logistics: "Logistics",
    finance: "Finance",
    cx: "Customer Experience",
    marketing: "Marketing",
    operations: "Operations",
  };
  const roleLabel = (user?.role ? [user.role, ...heldRoles.filter((role) => role !== user.role)] : heldRoles)
    .map((role) => ROLE_LABELS[role] ?? "")
    .filter(Boolean)
    .join(" + ");

  useEffect(() => {
    let mounted = true;

    const loadOnlineBookingCount = async () => {
      try {
        const res = await api.get("/jobs/admin/bookings/", {
          params: { job_group_type: "parent", page_size: 1 },
        });
        if (mounted && res.data?.success) {
          setPendingOnlineBookings(res.data.pagination?.count || res.data.result?.length || 0);
          return;
        }
        const bookings = await getOnlineBookings();
        if (mounted) {
          setPendingOnlineBookings(
            bookings.filter((booking) => booking.status !== "processed").length
          );
        }
      } catch {
        if (mounted) setPendingOnlineBookings(0);
      }
    };

    const loadDraftTicketCount = async () => {
      try {
        const userStr = localStorage.getItem("user");
        let storeId;
        if (userStr) {
          const authUser = JSON.parse(userStr);
          storeId = authUser.assigned_stores?.[0]?.id;
        }

        if (!storeId) {
          if (mounted) setPendingDraftTickets(0);
          return;
        }

        const res = await api.get(`/jobs/store/${storeId}/jobs/?status=registered,awaiting_diagnosis_fee&page_size=1000`);
        if (mounted && res.data?.success) {
          setPendingDraftTickets(res.data.pagination?.count || res.data.result?.length || 0);
        } else if (mounted) {
          setPendingDraftTickets(0);
        }
      } catch {
        if (mounted) setPendingDraftTickets(0);
      }
    };


    void getAuth()
      .then((authUser) => {
        if (mounted) setUser(authUser);
      })
      .catch(() => {
        if (mounted) setUser(null);
      });
    void loadOnlineBookingCount();
    void loadDraftTicketCount();

    const fetchUnreadCount = async () => {
      try {
        const res = await api.get("/notifications/notifications/unread_count/");
        const count = res?.data?.result?.unread_count || 0;
        updateUnreadCount(count);
      } catch (e) {
        console.error("Error fetching unread count:", e);
      }
    };
    if (user?.role && user.role !== "admin") {
      void fetchUnreadCount();
    }

    const refreshInterval = window.setInterval(() => {
      void loadOnlineBookingCount();
      void loadDraftTicketCount();
    }, 60000);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "repair_shop_online_bookings" || event.key === null) {
        void loadOnlineBookingCount();
      }
      if (event.key === "repair_shop_tickets" || event.key === null) {
        void loadDraftTicketCount();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadOnlineBookingCount();
        void loadDraftTicketCount();
      }
    };

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    setIsDark(document.documentElement.classList.contains("dark"));

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem("user");
    localStorage.removeItem("auth_token");
    await setAuth(null);
    setUser(null);
    navigate("/");
  };

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem(THEME_KEY, nextIsDark ? "dark" : "light");
    } catch {
      // Ignore persistence failures in restricted environments.
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center">
            <img src={activeLogo} alt="Cybersquad" className="h-8 w-auto" />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badgeCount =
              item.countType === "draft_tickets"
                ? pendingDraftTickets
                : item.countType === "qa_reviews"
                ? pendingQaReviews
                : pendingOnlineBookings;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-4 px-4 py-4 rounded-lg border border-transparent text-sm font-medium transition-all ${
                  isActive
                    ? "bg-sidebar-accent text-primary border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <item.icon className="w-5 h-5" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.showCountBadge && (
                  <span
                    className={`ml-auto inline-flex min-w-6 h-6 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                      badgeCount > 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-4 px-4 py-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
              {user?.storeLocation && (
                <p className="text-[11px] text-muted-foreground truncate">
                  Store: {user.storeLocation}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card/80 flex items-center justify-between px-6 lg:px-8 shrink-0">
          <div className="flex items-center min-w-0">
            <button
              className="lg:hidden mr-4 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold text-foreground truncate">
              {navItems.find((i) => i.path === location.pathname)?.label || "Ticket Details"}
            </h2>
          </div>
          <div className="flex items-center">
            {isConnected && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mr-4 hidden sm:flex">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Live</span>
              </div>
            )}

            <NotificationDropdown
              open={showNotifications}
              onOpenChange={setShowNotifications}
              onUnreadCountChange={updateUnreadCount}
              unreadCount={unreadCount}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-muted-foreground hover:text-foreground"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
