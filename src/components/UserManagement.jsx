import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import {
	Users,
	UserCheck,
	UserRoundCheck,
	Search,
	Filter,
	Download,
	MoreVertical,
	CheckCircle,
	XCircle,
	FileDown,
	ChevronLeft,
	ChevronRight,
	Loader2,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { TechnicianDetailsModal } from "./TechnicianDetailsModal";
import { CustomerDetailsModal } from "./CustomerDetailsModal";
import { TechnicianJobsModal } from "./TechnicianJobsModal";
import { ReviewQueueModal } from "./ReviewQueueModal";
import { CustomerJobsModal } from "./CustomerJobsModal";
import { CustomerPaymentsModal } from "./CustomerPaymentsModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { useApi } from "../hooks/useApi";
import { getCustomerDirectory, normalizePhone } from "../operations/business";
import { exportRowsAsPdfReport } from "../lib/printReport";
import { StatCard } from "./ui/stat-card";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// ✅ Expertise formatter: ["Phone repair","Laptop repair","Network Connectivity"] -> ["Phone","Laptop","Network"]
function formatExpertise(expertise) {
	if (!Array.isArray(expertise)) return [];

	const labels = new Set();

	expertise.forEach((item) => {
		const s = String(item || "").toLowerCase();
		if (s.includes("phone")) labels.add("Phone");
		if (s.includes("laptop")) labels.add("Laptop");
		if (s.includes("network")) labels.add("Network");
		if (s.includes("tablet")) labels.add("Tablet");
	});

	return Array.from(labels);
}

function PaginationBar({
	page,
	pages,
	pageSize,
	canPrev,
	canNext,
	onPrev,
	onNext,
	onPageSizeChange,
}) {
	return (
		<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4">
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					onClick={onPrev}
					disabled={!canPrev}
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>

				<div className="text-sm text-muted-foreground">
					Page <span className="font-medium text-foreground">{page}</span>{" "}
					<span className="text-muted-foreground">of</span>{" "}
					<span className="font-medium text-foreground">{pages || 1}</span>
				</div>

				<Button
					variant="outline"
					size="icon"
					onClick={onNext}
					disabled={!canNext}
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-2 justify-end">
				<span className="text-sm text-muted-foreground">Show</span>

				<Select
					value={String(pageSize)}
					onValueChange={(v) => onPageSizeChange(Number(v))}
				>
					<SelectTrigger className="w-[95px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PAGE_SIZE_OPTIONS.map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<span className="text-sm text-muted-foreground">entries</span>
			</div>
		</div>
	);
}

export function UserManagement({ initialTab = "technicians", hideTabs = false } = {}) {
	const { api } = useApi();

	// ✅ SEPARATE search queries for each tab to prevent interference
	const [techSearchQuery, setTechSearchQuery] = useState("");
	const [customerSearchQuery, setCustomerSearchQuery] = useState("");

	const [selectedTechnician, setSelectedTechnician] = useState(null);
	const [selectedCustomer, setSelectedCustomer] = useState(null);

	const [showTechnicianDetails, setShowTechnicianDetails] = useState(false);
	const [showCustomerDetails, setShowCustomerDetails] = useState(false);
	const [showTechnicianJobs, setShowTechnicianJobs] = useState(false);
	const [showReviewQueue, setShowReviewQueue] = useState(false);
	const [showCustomerJobs, setShowCustomerJobs] = useState(false);
	const [showCustomerPayments, setShowCustomerPayments] = useState(false);

	// Keep filters separate so tabs don't fight each other
	const [techStatusFilter, setTechStatusFilter] = useState("all"); // all | verified | pending | suspended
	const [techWorkScopeFilter, setTechWorkScopeFilter] = useState("all"); // all | both | walkin_only | self_service_only
	const [customerStatusFilter, setCustomerStatusFilter] = useState("all"); // all | active | pending | suspended
	const [customerProfileCompleteOnly, setCustomerProfileCompleteOnly] = useState(false);

	const [showFilterPopover, setShowFilterPopover] = useState(false);

	// ✅ TECH pagination + data + LOADING STATE
	const [technicians, setTechnicians] = useState([]);
	const [techLoading, setTechLoading] = useState(false);
	const [techPage, setTechPage] = useState(1);
	const [techPageSize, setTechPageSize] = useState(10);
	const [techPagination, setTechPagination] = useState({
		count: 0,
		pages: 1,
		page: 1,
		page_size: 10,
		next: null,
		previous: null,
	});

	// ✅ CUSTOMER pagination + data + LOADING STATE
	const [customersList, setCustomersList] = useState([]);
	// Contacts saved from POS sales and repairs on this device; they have no backend account.
	const [localContacts, setLocalContacts] = useState([]);
	const [customerLoading, setCustomerLoading] = useState(false);
	const [customerPage, setCustomerPage] = useState(1);
	const [customerPageSize, setCustomerPageSize] = useState(10);
	const [customerPagination, setCustomerPagination] = useState({
		count: 0,
		pages: 1,
		page: 1,
		page_size: 10,
		next: null,
		previous: null,
	});

	// ✅ Fetch technicians with API-based filtering
	const fetchTechnicians = async () => {
		setTechLoading(true);
		try {
			const params = new URLSearchParams({
				page: techPage,
				page_size: techPageSize,
			});

			// Add status-specific filters
			if (techStatusFilter === "verified") {
				params.append("document_verified", "true");
			} else if (techStatusFilter === "not verified") {
				params.append("document_verified", "false");
			} else if (techStatusFilter === "suspended") {
				params.append("is_active", "false");
			}

			if (techWorkScopeFilter && techWorkScopeFilter !== "all") {
				params.append("work_scope", techWorkScopeFilter);
			}

			const res = await api.get(`/users/profile/technicians/?${params}`);

			const data = res?.data || {};
			setTechnicians(Array.isArray(data.result) ? data.result : []);
			setTechPagination(data.pagination || {});
		} catch (e) {
			console.error("Error fetching technicians:", e);
			setTechnicians([]);
			setTechPagination({
				count: 0,
				pages: 1,
				page: techPage,
				page_size: techPageSize,
				next: null,
				previous: null,
			});
		} finally {
			setTechLoading(false);
		}
	};

	useEffect(() => {
		fetchTechnicians();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [techPage, techPageSize, techStatusFilter, techWorkScopeFilter]);

	// ✅ Fetch customers with API-based filtering
	const fetchCustomers = async () => {
		setCustomerLoading(true);
		getCustomerDirectory()
			.then(setLocalContacts)
			.catch(() => setLocalContacts([]));
		try {
			const params = new URLSearchParams({
				page: customerPage,
				page_size: customerPageSize,
			});

			if (customerProfileCompleteOnly) {
				params.append("is_profile_complete", "true");
			}

			// Add status-specific filters
			if (customerStatusFilter === "active") {
				params.append("is_email_verified", "true");
			} else if (customerStatusFilter === "suspended") {
				params.append("is_active", "false");
			}

			const res = await api.get(`/users/profile/customers/?${params}`);

			const data = res?.data || {};
			setCustomersList(Array.isArray(data.result) ? data.result : []);
			setCustomerPagination(data.pagination || {});
		} catch (e) {
			console.error("Error fetching customers:", e);
			setCustomersList([]);
			setCustomerPagination({
				count: 0,
				pages: 1,
				page: customerPage,
				page_size: customerPageSize,
				next: null,
				previous: null,
			});
		} finally {
			setCustomerLoading(false);
		}
	};

	// ✅ Fetch customers when page, pageSize, or statusFilter changes
	useEffect(() => {
		fetchCustomers();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [customerPage, customerPageSize, customerStatusFilter, customerProfileCompleteOnly]);

	// ✅ Filter with ONLY search queries (status filtering is done by API)
	const filteredTechnicians = useMemo(() => {
		if (!techSearchQuery) return technicians;

		return technicians.filter((tech) => {
			const name = `${tech?.first_name || ""} ${tech?.last_name || ""}`
				.trim()
				.toLowerCase();
			const email = (tech?.email || "").toLowerCase();

			return (
				name.includes(techSearchQuery.toLowerCase()) ||
				email.includes(techSearchQuery.toLowerCase())
			);
		});
	}, [technicians, techSearchQuery]);

	const localExtras = useMemo(() => {
		// Backend rows come one page at a time, so local contacts are listed once, on the first page of the unfiltered list.
		if (customerPage !== 1 || customerStatusFilter !== "all" || customerProfileCompleteOnly) return [];
		const phones = new Set(customersList.map((customer) => normalizePhone(customer?.phone_number || "")).filter(Boolean));
		const emails = new Set(customersList.map((customer) => (customer?.email || "").trim().toLowerCase()).filter(Boolean));
		return localContacts
			.filter((contact) => !phones.has(normalizePhone(contact.phone || "")) && !(contact.email && emails.has(contact.email.trim().toLowerCase())))
			.map((contact) => ({
				id: `local-${contact.id}`,
				first_name: contact.name,
				last_name: "",
				email: contact.email || "",
				phone_number: contact.phone || "",
				is_active: true,
				__local: true,
			}));
	}, [customersList, localContacts, customerPage, customerStatusFilter, customerProfileCompleteOnly]);

	const filteredCustomers = useMemo(() => {
		const all = [...customersList, ...localExtras];
		if (!customerSearchQuery) return all;

		const query = customerSearchQuery.toLowerCase();
		const digits = customerSearchQuery.replace(/\D/g, "");
		return all.filter((customer) => {
			const name = `${customer?.first_name || ""} ${customer?.last_name || ""}`
				.trim()
				.toLowerCase();
			const email = (customer?.email || "").toLowerCase();
			const phone = normalizePhone(customer?.phone_number || "");

			return (
				name.includes(query) ||
				email.includes(query) ||
				Boolean(digits && phone.includes(normalizePhone(digits)))
			);
		});
	}, [customersList, localExtras, customerSearchQuery]);

	const technicianSummary = {
		total: techPagination?.count ?? technicians.length,
		shown: filteredTechnicians.length,
		verified: filteredTechnicians.filter((tech) => tech.is_verified || tech.status === "verified").length,
		suspended: filteredTechnicians.filter((tech) => tech.status === "suspended" || tech.is_active === false).length,
	};

	const customerSummary = {
		total: (customerPagination?.count ?? customersList.length) + localExtras.length,
		shown: filteredCustomers.length,
		active: filteredCustomers.filter((customer) => customer.is_active !== false).length,
		local: filteredCustomers.filter((customer) => customer.__local).length,
	};

	// Handle export for customers
	const handleCustomerExport = (format) => {
		const data = filteredCustomers.map((customer) => ({
			Name: customer?.first_name
				? `${customer.first_name} ${customer.last_name || ""}`.trim()
				: customer?.profile?.full_name || "-",
			Email: customer?.email || "-",
			Phone: customer?.phone_number || "-",
			Status: customer?.__local
				? "POS contact"
				: !customer?.is_active
				? "Suspended"
				: customer?.is_email_verified
					? "Active"
					: "Pending",
			"Jobs Posted": customer?.stats?.total_jobs ?? 0,
			"Total Spent": customer?.stats?.total_spent ?? 0,
			"Completion Rate": customer?.stats?.completion_rate
				? `${customer.stats.completion_rate}%`
				: "0%",
			City: customer?.profile?.city || "-",
			State: customer?.profile?.state || "-",
			"Date Joined": customer?.date_joined
				? new Date(customer.date_joined).toLocaleDateString()
				: "-",
		}));

		exportData(data, format, "customers");
	};

	// Handle export for technicians
	const handleTechnicianExport = (format) => {
		const data = filteredTechnicians.map((tech) => ({
			Name: tech?.first_name
				? `${tech.first_name} ${tech.last_name || ""}`.trim()
				: tech?.profile?.full_name || "-",
			Email: tech?.email || "-",
			Phone: tech?.phone_number || "-",
			Status: !tech?.is_active
				? "Suspended"
				: tech?.profile?.document_verified
					? "Verified"
					: "Not Verified",
			Expertise: formatExpertise(tech?.profile?.expertise).join(", ") || "-",
			Rating:
				tech?.stats?.avg_rating ?? (Number(tech?.profile?.rating || 0) || 0),
			"Total Jobs": tech?.stats?.total_jobs ?? 0,
			City: tech?.profile?.city || "-",
			State: tech?.profile?.state || "-",
			"Bank Name": tech?.profile?.account_info?.bank_name || "-",
			"Account Number": tech?.profile?.account_info?.account_number || "-",
			"Date Joined": tech?.date_joined
				? new Date(tech.date_joined).toLocaleDateString()
				: "-",
		}));

		exportData(data, format, "technicians");
	};

	// Generic export function
	const exportData = (data, format, type) => {
		if (format === "csv") {
			exportAsCSV(data, type);
		} else if (format === "excel") {
			exportAsExcel(data, type);
		} else if (format === "pdf") {
			exportAsPDF(data, type);
		}
	};

	// Export as CSV
	const exportAsCSV = (data, type) => {
		if (!data.length) return;

		const headers = Object.keys(data[0]);
		const csvContent = [
			headers.join(","),
			...data.map((row) =>
				headers
					.map((header) => {
						const value = row[header]?.toString() || "";
						return value.includes(",") ? `"${value}"` : value;
					})
					.join(","),
			),
		].join("\n");

		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `${type}_${new Date().toISOString().split("T")[0]}.csv`;
		link.click();
	};

	// Export as Excel (HTML table format)
	const exportAsExcel = (data, type) => {
		if (!data.length) return;

		const headers = Object.keys(data[0]);
		const htmlTable = `
      <table>
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${data
						.map(
							(row) => `
            <tr>${headers.map((h) => `<td>${row[h] || ""}</td>`).join("")}</tr>
          `,
						)
						.join("")}
        </tbody>
      </table>
    `;

		const blob = new Blob([htmlTable], { type: "application/vnd.ms-excel" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `${type}_${new Date().toISOString().split("T")[0]}.xls`;
		link.click();
	};

	// Export as PDF using print functionality (shared template — src/lib/printReport.js)
	const exportAsPDF = (data, type) => exportRowsAsPdfReport(data, type);

	const handleViewTechnicianDetails = (technician) => {
		setSelectedTechnician(technician);
		setShowTechnicianDetails(true);
	};

	const handleViewCustomerDetails = (customer) => {
		setSelectedCustomer(customer);
		setShowCustomerDetails(true);
	};

	const handleViewTechnicianJobs = (technician) => {
		setSelectedTechnician(technician);
		setShowTechnicianJobs(true);
	};

	const handleViewCustomerJobs = (customer) => {
		setSelectedCustomer(customer);
		setShowCustomerJobs(true);
	};

	const handleViewCustomerPayments = (customer) => {
		setSelectedCustomer(customer);
		setShowCustomerPayments(true);
	};

	return (
		<div className="space-y-6">
			<div>
				<h1>{hideTabs ? (initialTab === "customers" ? "Customer Management" : "Technician Management") : "User Management"}</h1>
				<p className="text-muted-foreground">
					{hideTabs ? (initialTab === "customers" ? "Manage customer accounts" : "Manage technician accounts") : "Manage technicians and customers"}
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					title="Technicians"
					value={technicianSummary.total}
					note={`${technicianSummary.shown} shown`}
					icon={Users}
					color="text-blue-600"
					bgColor="bg-blue-50"
				/>
				<StatCard
					title="Verified Technicians"
					value={technicianSummary.verified}
					note={`${technicianSummary.suspended} suspended in view`}
					icon={UserRoundCheck}
					color="text-emerald-600"
					bgColor="bg-emerald-50"
				/>
				<StatCard
					title="Customers"
					value={customerSummary.total}
					note={`${customerSummary.shown} shown`}
					icon={UserCheck}
					color="text-purple-600"
					bgColor="bg-purple-50"
				/>
				<StatCard
					title="Active Customers"
					value={customerSummary.active}
					note={`${customerSummary.local} local contacts in view`}
					icon={CheckCircle}
					color="text-teal-600"
					bgColor="bg-teal-50"
				/>
			</div>
			<Tabs defaultValue={initialTab} className="space-y-4">
				{!hideTabs && <TabsList>
					<TabsTrigger value="technicians">Technicians</TabsTrigger>
					<TabsTrigger value="customers">Customers</TabsTrigger>
				</TabsList>}

				{/* TECHNICIANS */}
				<TabsContent value="technicians" className="space-y-4">
					<Card>
						<CardHeader>
							<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
								<div>
									<CardTitle>Technician Management</CardTitle>
									<CardDescription>
										View and manage technician accounts
									</CardDescription>
								</div>

								<div className="flex items-center gap-2">
									<div className="relative">
										<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search technicians..."
											className="pl-8 w-[250px]"
											value={techSearchQuery}
											onChange={(e) => setTechSearchQuery(e.target.value)}
										/>
									</div>

									<Popover
										open={showFilterPopover}
										onOpenChange={setShowFilterPopover}
									>
										<PopoverTrigger asChild>
											<Button variant="outline" size="icon">
												<Filter className="w-4 h-4" />
											</Button>
										</PopoverTrigger>

										<PopoverContent className="w-64" align="end">
											<div className="space-y-4">
												<div>
													<h4 className="font-medium mb-4">Filter by Status</h4>
													<Select
														value={techStatusFilter}
														onValueChange={setTechStatusFilter}
													>
														<SelectTrigger>
															<SelectValue placeholder="Select status" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="all">All Status</SelectItem>
															<SelectItem value="verified">Verified</SelectItem>
															<SelectItem value="not verified">
																Not Verified
															</SelectItem>
															<SelectItem value="suspended">
																Suspended
															</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div>
													<h4 className="font-medium mb-4">Filter by Work Scope</h4>
													<Select
														value={techWorkScopeFilter}
														onValueChange={setTechWorkScopeFilter}
													>
														<SelectTrigger>
															<SelectValue placeholder="Select scope" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="all">All Scope</SelectItem>
															<SelectItem value="both">Both</SelectItem>
															<SelectItem value="walkin_only">Walk-in Only</SelectItem>
															<SelectItem value="self_service_only">Self Service Only</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div className="flex gap-2">
													<Button
														variant="outline"
														size="sm"
														className="flex-1"
														onClick={() => {
															setTechStatusFilter("all");
															setTechWorkScopeFilter("all");
															setTechSearchQuery("");
														}}
													>
														Reset
													</Button>
													<Button
														size="sm"
														className="flex-1"
														onClick={() => setShowFilterPopover(false)}
													>
														Apply
													</Button>
												</div>
											</div>
										</PopoverContent>
									</Popover>

									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" size="icon">
												<Download className="w-4 h-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuLabel>Export as</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onClick={() => handleTechnicianExport("pdf")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as PDF
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => handleTechnicianExport("excel")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as Excel
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => handleTechnicianExport("csv")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as CSV
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						</CardHeader>

						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Contact</TableHead>
										<TableHead>Expertise</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Rating</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>

								<TableBody>
									{/* ✅ Show loading state */}
									{techLoading ? (
										<TableRow>
											<TableCell colSpan={6} className="text-center py-10">
												<div className="flex items-center justify-center gap-2">
													<Loader2 className="h-4 w-4 animate-spin" />
													<span className="text-muted-foreground">
														Loading technicians...
													</span>
												</div>
											</TableCell>
										</TableRow>
									) : filteredTechnicians.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className="text-center text-muted-foreground py-10"
											>
												No technicians found.
											</TableCell>
										</TableRow>
									) : (
										filteredTechnicians.map((tech) => {
											const expertiseLabels = formatExpertise(
												tech?.profile?.expertise,
											);

											const rating =
												tech?.stats?.avg_rating ??
												(Number(tech?.profile?.rating || 0) || 0);

											return (
												<TableRow key={tech.id}>
													<TableCell>
														{tech?.first_name
															? `${tech.first_name} ${tech.last_name || ""}`.trim()
															: tech?.profile?.full_name || "-"}
													</TableCell>

													<TableCell className="text-muted-foreground">
														{tech?.email || tech?.phone_number || "-"}
													</TableCell>

													<TableCell>
														{expertiseLabels.length ? (
															<div className="flex flex-wrap gap-1">
																{expertiseLabels.map((label) => (
																	<Badge
																		key={label}
																		variant="secondary"
																		className="text-xs"
																	>
																		{label}
																	</Badge>
																))}
															</div>
														) : (
															<span className="text-muted-foreground">-</span>
														)}
													</TableCell>

													<TableCell>
														{!tech?.is_active ? (
															<Badge
																variant="destructive"
																className="bg-error text-white"
															>
																<XCircle className="h-4 w-4 mr-1" />
																suspended
															</Badge>
														) : (
															<Badge
																variant={
																	tech?.profile?.document_verified
																		? "default"
																		: "destructive"
																}
																className={
																	tech?.profile?.document_verified
																		? "bg-success text-white"
																		: "bg-warning text-white"
																}
															>
																{tech?.profile?.document_verified ? (
																	<CheckCircle className="h-4 w-4 mr-1" />
																) : (
																	<XCircle className="h-4 w-4 mr-1" />
																)}
																{tech?.profile?.document_verified
																	? "verified"
																	: "not verified"}
															</Badge>
														)}
													</TableCell>

													<TableCell>
														{rating > 0
															? `⭐ ${Number(rating).toFixed(2)}`
															: "-"}
													</TableCell>

													<TableCell>
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" size="icon">
																	<MoreVertical className="w-4 h-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuLabel>Actions</DropdownMenuLabel>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		handleViewTechnicianDetails(tech)
																	}
																>
																	View Details & Manage
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() => handleViewTechnicianJobs(tech)}
																>
																	View Jobs
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											);
										})
									)}
								</TableBody>
							</Table>

							{/* ✅ Pagination */}
							<PaginationBar
								page={techPagination?.page || techPage}
								pages={techPagination?.pages || 1}
								pageSize={techPageSize}
								canPrev={Boolean(techPagination?.previous)}
								canNext={Boolean(techPagination?.next)}
								onPrev={() => setTechPage((p) => Math.max(1, p - 1))}
								onNext={() => setTechPage((p) => p + 1)}
								onPageSizeChange={(n) => {
									setTechPageSize(n);
									setTechPage(1);
								}}
							/>
						</CardContent>
					</Card>

					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Active Technicians</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-semibold">342</div>
								<p className="text-sm text-muted-foreground">
									Currently verified
								</p>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Average Rating</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-3xl font-semibold">⭐ 4.6</div>
								<p className="text-sm text-muted-foreground">
									Across all technicians
								</p>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				{/* CUSTOMERS */}
				<TabsContent value="customers" className="space-y-4">
					<Card>
						<CardHeader>
							<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
								<div>
									<CardTitle>Customer Management</CardTitle>
									<CardDescription>
										View and manage customer accounts
									</CardDescription>
								</div>

								<div className="flex items-center gap-2">
									<div className="relative">
										<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search customers..."
											className="pl-8 w-[250px]"
											value={customerSearchQuery}
											onChange={(e) => setCustomerSearchQuery(e.target.value)}
										/>
									</div>

									<Popover>
										<PopoverTrigger asChild>
											<Button variant="outline" size="icon">
												<Filter className="w-4 h-4" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-64" align="end">
											<div className="space-y-4">
												<div>
													<h4 className="font-medium mb-4">Filter by Status</h4>
													<Select
														value={customerStatusFilter}
														onValueChange={setCustomerStatusFilter}
													>
														<SelectTrigger>
															<SelectValue placeholder="Select status" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="all">All Status</SelectItem>
															<SelectItem value="active">Active</SelectItem>
															<SelectItem value="suspended">
																Suspended
															</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div className="flex items-center justify-between gap-4">
													<Label
														htmlFor="customer-profile-complete-only"
														className="text-sm font-medium leading-tight"
													>
														Profile complete only
													</Label>
													<Switch
														id="customer-profile-complete-only"
														checked={customerProfileCompleteOnly}
														onCheckedChange={(next) => {
															setCustomerProfileCompleteOnly(Boolean(next));
															setCustomerPage(1);
														}}
													/>
												</div>

												<div className="flex gap-2">
													<Button
														variant="outline"
														size="sm"
														className="flex-1"
														onClick={() => {
															setCustomerStatusFilter("all");
															setCustomerSearchQuery("");
															setCustomerProfileCompleteOnly(false);
															setCustomerPage(1);
														}}
													>
														Reset
													</Button>
													<Button size="sm" className="flex-1">
														Apply
													</Button>
												</div>
											</div>
										</PopoverContent>
									</Popover>

									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" size="icon">
												<Download className="w-4 h-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuLabel>Export as</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onClick={() => handleCustomerExport("pdf")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as PDF
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => handleCustomerExport("excel")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as Excel
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => handleCustomerExport("csv")}
											>
												<FileDown className="w-4 h-4 mr-2" />
												Export as CSV
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						</CardHeader>

						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Email</TableHead>
										<TableHead>Phone</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Jobs Posted</TableHead>
										<TableHead>Total Spent</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>

								<TableBody>
									{/* ✅ Show loading state */}
									{customerLoading ? (
										<TableRow>
											<TableCell colSpan={7} className="text-center py-10">
												<div className="flex items-center justify-center gap-2">
													<Loader2 className="h-4 w-4 animate-spin" />
													<span className="text-muted-foreground">
														Loading customers...
													</span>
												</div>
											</TableCell>
										</TableRow>
									) : filteredCustomers.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={7}
												className="text-center text-muted-foreground py-10"
											>
												No customers found.
											</TableCell>
										</TableRow>
									) : (
										filteredCustomers.map((customer) => {
											const name = customer?.first_name
												? `${customer.first_name} ${customer.last_name || ""}`.trim()
												: customer?.profile?.full_name || "-";

											const email = customer?.email || "-";
											const status = customer?.is_email_verified
												? "active"
												: "pending";
											const totalJobs = customer?.stats?.total_jobs ?? "-";
											const totalSpent = customer?.stats?.total_spent ?? "-";

											return (
												<TableRow key={customer.id}>
													<TableCell>{name}</TableCell>
													<TableCell className="text-muted-foreground">
														{email}
													</TableCell>
													<TableCell className="text-muted-foreground">{customer?.phone_number || "-"}</TableCell>

													<TableCell>
														{customer?.__local ? (
														<Badge variant="outline">POS contact</Badge>
													) : !customer?.is_active ? (
															<Badge
																variant="destructive"
																className="bg-error text-white"
															>
																suspended
															</Badge>
														) : (
															<Badge
																variant={
																	status === "active" ? "default" : "outline"
																}
															>
																{status}
															</Badge>
														)}
													</TableCell>

													<TableCell>{totalJobs}</TableCell>
													<TableCell>
														{typeof totalSpent === "number"
															? `₦${totalSpent.toLocaleString()}`
															: totalSpent}
													</TableCell>

													<TableCell>

														{customer?.__local ? (

															<span className="text-xs text-muted-foreground">Saved on this device only</span>

														) : (

														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" size="icon">
																	<MoreVertical className="w-4 h-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuLabel>Actions</DropdownMenuLabel>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		handleViewCustomerDetails(customer)
																	}
																>
																	View Details & Manage
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() =>
																		handleViewCustomerJobs(customer)
																	}
																>
																	View Job History
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() =>
																		handleViewCustomerPayments(customer)
																	}
																>
																	View Payments
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>

														)}
													</TableCell>
												</TableRow>
											);
										})
									)}
								</TableBody>
							</Table>

							{/* ✅ Pagination */}
							<PaginationBar
								page={customerPagination?.page || customerPage}
								pages={customerPagination?.pages || 1}
								pageSize={customerPageSize}
								canPrev={Boolean(customerPagination?.previous)}
								canNext={Boolean(customerPagination?.next)}
								onPrev={() => setCustomerPage((p) => Math.max(1, p - 1))}
								onNext={() => setCustomerPage((p) => p + 1)}
								onPageSizeChange={(n) => {
									setCustomerPageSize(n);
									setCustomerPage(1);
								}}
							/>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* MODALS */}
			<TechnicianDetailsModal
				open={showTechnicianDetails}
				onOpenChange={setShowTechnicianDetails}
				technician={selectedTechnician}
				onUpdated={fetchTechnicians}
			/>
			<TechnicianJobsModal
				open={showTechnicianJobs}
				onOpenChange={setShowTechnicianJobs}
				technician={selectedTechnician}
			/>
			<ReviewQueueModal
				open={showReviewQueue}
				onOpenChange={setShowReviewQueue}
			/>
			<CustomerDetailsModal
				open={showCustomerDetails}
				onOpenChange={setShowCustomerDetails}
				customer={selectedCustomer}
				onViewJobs={() => {
					setShowCustomerDetails(false);
					setShowCustomerJobs(true);
				}}
				onViewPayments={() => {
					setShowCustomerDetails(false);
					setShowCustomerPayments(true);
				}}
				onUpdated={fetchCustomers}
			/>
			<CustomerJobsModal
				open={showCustomerJobs}
				onOpenChange={setShowCustomerJobs}
				customer={selectedCustomer}
			/>
			<CustomerPaymentsModal
				open={showCustomerPayments}
				onOpenChange={setShowCustomerPayments}
				customer={selectedCustomer}
			/>
		</div>
	);
}
