import { useState, useEffect } from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "./ui/sidebar";
import {
	LayoutDashboard,
	Users,
	Briefcase,
	CreditCard,
	AlertTriangle,
	BarChart3,
	Settings,
	Bell,
	Megaphone,
	LogOut,
	Wrench,
	Clock,
	Store,
	MapPin,
	ShoppingCart,
	ClipboardList,
	Receipt,
	ShieldCheck,
	UserCog,
	History,
	ArrowDownLeft,
	ArrowUpRight,
	Truck,
	Banknote,
	Undo2,
} from "lucide-react";
import OperationsWorkspace from "../operations/OperationsWorkspace";
import OperationsOverview from "../operations/OperationsOverview";
import { ShiftHistoryTable } from "../pos/components/ShiftHistoryDialog";
import { SectionTabs } from "./SectionTabs";
import { FinanceOverview } from "./finance/FinanceOverview";
import { ReceivablesView } from "./finance/ReceivablesView";
import { PayablesView } from "./finance/PayablesView";
import { CodBilling } from "./finance/CodBilling";
import { RefundsView } from "./finance/RefundsView";
import { SettlementPayments } from "./finance/SettlementPayments";
import { useNavigate } from "react-router-dom";
import { DashboardOverview } from "./DashboardOverview";
import { SalesRecords } from "./SalesRecords";
import { UserManagement } from "./UserManagement";
import { JobManagement } from "./JobManagement";
import { PaymentFinance } from "./PaymentFinance";
import { DisputeManagement } from "./DisputeManagement";
import { SLAManagement } from "./SLAManagement";
import { ServiceManagement } from "./ServiceManagement";
import { NotificationsCenter } from "./NotificationsCenter";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { NotificationModal } from "./NotificationModal";
import { Badge } from "./ui/badge";
import { useApi } from "../hooks/useApi";
import { AdminManagement } from "./AdminManagement";
import { SystemSettings } from "./SystemSettings";
import { StoreManagement } from "./StoreManagement";
import { LiveTracking } from "./LiveTracking";
import { useWS } from "../context/WebSocketContext";
import Logo from "../components/figma/public/images/cybersquad black.png";

const sectionHeaders = {
	overview: {
		title: "Overview",
		description: "Platform performance, repair status, sales movement, and work that needs attention.",
	},
	sales: {
		title: "Sales & Operations",
		description: "Sales records, follow-ups, reserved orders, warranty lookup, and shift history.",
	},
	repairs: {
		title: "Repairs",
		description: "Manage repair jobs, live tracking, SLA performance, and service setup.",
	},
	finance: {
		title: "Finance",
		description: "Revenue, receivables, payables, COD billing, payments, payouts, disputes, and finance reports.",
	},
	people: {
		title: "People & Access",
		description: "Manage technicians, customers, admins, roles, stores, and permissions.",
	},
	notifications: {
		title: "Messaging Center",
		description: "Send platform messages and review notification history.",
	},
	settings: {
		title: "Settings",
		description: "Configure commissions, payouts, walk-in repair rules, notifications, and platform defaults.",
	},
};
const menuItems = [
	{ id: "overview", label: "Overview", icon: LayoutDashboard },
	{ id: "sales", label: "Sales & Operations", icon: ShoppingCart },
	{ id: "repairs", label: "Repairs", icon: Wrench },
	{ id: "finance", label: "Finance", icon: CreditCard },
	{ id: "people", label: "People & access", icon: Users },
	// Labeled/iconed distinctly from the header bell (NotificationModal.jsx),
	// which is the actual personal alert inbox — this page is the broadcast/
	// compose tool (NotificationsCenter.jsx: "Send Notification" + "History"),
	// a different concept that happened to share the same word and icon.
	{ id: "notifications", label: "Messaging Center", icon: Megaphone },
	{
		id: "settings",
		label: "Settings",
		icon: Settings,
		requiresSuperUser: true,
	},
];

export function DashboardLayout({ onLogout }) {
	const { api } = useApi();
	const { isConnected, unreadCount, updateUnreadCount } = useWS();

	const navigate = useNavigate();
	const [activeView, setActiveView] = useState("overview");
	// The tab open inside each multi-screen section; dashboard cards set these to land on the right screen.
	const [sectionTabs, setSectionTabs] = useState({ sales: "records", repairs: "jobs", finance: "overview", people: "technicians" });
	const openSection = (section, tab) => {
		setSectionTabs((current) => ({ ...current, [section]: tab }));
		setActiveView(section);
	};
	const [showNotifications, setShowNotifications] = useState(false);
	const [isSuperUser, setIsSuperUser] = useState(false);
	const [userRole, setUserRole] = useState(null);
	// Filters carried from a Dashboard card click into Job Management / Sales,
	// so the destination page opens already scoped to what was clicked.
	const [jobsInitialFilter, setJobsInitialFilter] = useState(null);
	const [salesInitialFilter, setSalesInitialFilter] = useState(null);

	// Fetch user role and privileges on mount
	useEffect(() => {
		const fetchUserRole = async () => {
			try {
				const res = await api.get("/users/profile/admin/roles-privileges/");
				const data = res?.data?.result;

				// Check if user is superuser
				const isSuperAdmin =
					data?.is_superuser ||
					data?.roles?.some((role) => role.name === "Super Admin");

				setIsSuperUser(isSuperAdmin);
				setUserRole(data);

				console.log("User role data:", data);
				console.log("Is super admin:", isSuperAdmin);
			} catch (e) {
				console.error("Error fetching user role:", e);
			}
		};

		fetchUserRole();
	}, []);

	// Fetch initial unread count on mount (only once, then WebSocket keeps it updated)
	useEffect(() => {
		const fetchUnreadCount = async () => {
			try {
				const res = await api.get("/notifications/notifications/unread_count/");
				const count = res?.data?.result?.unread_count || 0;
				updateUnreadCount(count);
				console.log("Initial unread count:", count);
			} catch (e) {
				console.error("Error fetching unread count:", e);
			}
		};

		fetchUnreadCount();
	}, [api, updateUnreadCount]);

	// Filter menu items based on user role
	const filteredMenuItems = menuItems.filter((item) => {
		if (item.requiresSuperUser) {
			return isSuperUser;
		}
		return true;
	});

	const openRepair = (ticket) => navigate("/ticket/" + encodeURIComponent(ticket.id));
	const tabState = (section) => ({
		value: sectionTabs[section],
		onValueChange: (tab) => setSectionTabs((current) => ({ ...current, [section]: tab })),
	});

	const renderContent = () => {
		switch (activeView) {
			case "overview":
				return (
					<div className="space-y-8">
						<DashboardOverview
							onViewSales={(filter) => {
								setSalesInitialFilter(filter ?? null);
								openSection("sales", "records");
							}}
							onViewSLA={() => openSection("repairs", "sla")}
							onViewJobs={(filter) => {
								setJobsInitialFilter(filter ?? null);
								openSection("repairs", "jobs");
							}}
						/>
						<div className="space-y-4">
							<h2 className="text-base font-semibold text-foreground">Needs attention</h2>
							<OperationsOverview
								roles={["admin"]}
								attentionOnly
								onOpenRepair={openRepair}
								onEnquiries={() => openSection("sales", "enquiries")}
								onOpenTab={(tab) => openSection("sales", tab)}
							/>
						</div>
					</div>
				);
			case "sales":
				return (
					<OperationsWorkspace
						key={sectionTabs.sales}
						admin
						hideOverview
						hideHeader
						initialTab={sectionTabs.sales}
						extraTabs={[
							{
								value: "records",
								label: "Sales records",
								icon: Receipt,
								content: <SalesRecords initialFilter={salesInitialFilter} />,
							},
							{
								value: "shift-history",
								label: "Shift history",
								icon: History,
								content: (
									<div className="glass-card p-4">
										<ShiftHistoryTable showVariance />
									</div>
								),
							},
						]}
					/>
				);
			case "repairs":
				return (
					<SectionTabs
						{...tabState("repairs")}
						tabs={[
							{ value: "jobs", label: "Jobs", icon: ClipboardList, content: <JobManagement initialFilter={jobsInitialFilter} /> },
							{ value: "tracking", label: "Live tracking", icon: MapPin, content: <LiveTracking /> },
							{ value: "sla", label: "SLA", icon: Clock, content: <SLAManagement /> },
							{ value: "services", label: "Services", icon: Wrench, content: <ServiceManagement /> },
						]}
					/>
				);
			case "finance":
				return (
					<SectionTabs
						{...tabState("finance")}
						tabs={[
							{ value: "overview", label: "Overview", icon: LayoutDashboard, content: <FinanceOverview onNavigate={(tab) => openSection("finance", tab)} /> },
							{ value: "receivables", label: "Receivables", icon: ArrowDownLeft, content: <ReceivablesView onNavigate={(tab) => openSection("finance", tab)} /> },
							{ value: "payables", label: "Payables", icon: ArrowUpRight, content: <PayablesView /> },
							{ value: "cod", label: "COD Billing", icon: Truck, content: <CodBilling /> },
							// Existing repair-payment screens, now split across the PRD's top-level tabs.
							{ value: "payments", label: "Payments", icon: CreditCard, content: <div className="space-y-6"><SettlementPayments /><PaymentFinance show={["payments", "vouchers"]} /></div> },
							{ value: "payouts", label: "Payouts", icon: Banknote, content: <PaymentFinance show={["payouts"]} showSummary={false} /> },
							{ value: "refunds", label: "Refunds", icon: Undo2, content: <RefundsView /> },
							{ value: "disputes", label: "Disputes", icon: AlertTriangle, content: <DisputeManagement userRole={userRole} /> },
							{ value: "reports", label: "Reports", icon: BarChart3, content: <PaymentFinance show={["reports"]} showSummary={false} /> },
						]}
					/>
				);
			case "people":
				return (
					<SectionTabs
						{...tabState("people")}
						tabs={[
							{ value: "technicians", label: "Technicians", icon: UserCog, content: <UserManagement initialTab="technicians" hideTabs /> },
							{ value: "customers", label: "Customers", icon: Users, content: <UserManagement initialTab="customers" hideTabs /> },
							{ value: "admins", label: "Admins & roles", icon: ShieldCheck, show: isSuperUser, content: <AdminManagement /> },
							{ value: "stores", label: "Stores", icon: Store, show: isSuperUser, content: <StoreManagement /> },
						]}
					/>
				);
			case "notifications":
				return <NotificationsCenter />;
			case "settings":
				return <SystemSettings />;
			default:
				return <DashboardOverview />;
		}
	};

	return (
		<SidebarProvider>
			<div className="flex min-h-screen w-full">
				<Sidebar>
					<SidebarHeader className="border-b border-sidebar-border p-4">
						<div className="flex items-center gap-2">
							<div className="flex flex-col">
								{/* Fixed height, auto width — a fixed-width box squeezed this logo since it didn't match the PNG's aspect ratio. */}
								<img src={Logo} alt="Cybersquad" className="h-10 w-auto" />
								<span className="text-sm mt-1 text-muted-foreground">
									Admin Panel
								</span>
							</div>
						</div>
					</SidebarHeader>
					<SidebarContent>
						<SidebarGroup>
							<SidebarGroupLabel>Main Menu</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{filteredMenuItems.map((item) => (
										<SidebarMenuItem key={item.id}>
											<SidebarMenuButton
												onClick={() => setActiveView(item.id)}
												isActive={activeView === item.id}
											>
												<item.icon className="w-4 h-4" />
												<span>{item.label}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
						<SidebarGroup className="mt-auto">
							<SidebarGroupContent>
								<SidebarMenu>
									<SidebarMenuItem>
										<SidebarMenuButton onClick={onLogout}>
											<LogOut className="w-4 h-4" />
											<span>Logout</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</SidebarContent>
				</Sidebar>
				<main className="flex-1 overflow-auto">
					<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
						<div className="flex h-14 items-center px-4 gap-4">
							<SidebarTrigger />
							<div className="flex-1" />

							{/* WebSocket connection indicator */}
							{isConnected && (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
									<span>Live</span>
								</div>
							)}

							<Button
								variant="ghost"
								size="icon"
								className="relative"
								onClick={() => setShowNotifications(true)}
							>
								<Bell className="w-4 h-4" />
								{unreadCount > 0 && (
									<Badge
										variant="destructive"
										className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
									>
										{unreadCount > 99 ? "99+" : unreadCount}
									</Badge>
								)}
							</Button>
						</div>
					</div>
					<div className="space-y-6 p-6">
						<Card>
							<CardHeader>
								<CardTitle>{sectionHeaders[activeView]?.title || "Dashboard"}</CardTitle>
								<CardDescription>{sectionHeaders[activeView]?.description}</CardDescription>
							</CardHeader>
						</Card>
						<div key={activeView} className="motion-rise">
							{renderContent()}
						</div>
					</div>
				</main>
			</div>
			<NotificationModal
				open={showNotifications}
				onOpenChange={setShowNotifications}
				onUnreadCountChange={updateUnreadCount}
			/>
		</SidebarProvider>
	);
}
