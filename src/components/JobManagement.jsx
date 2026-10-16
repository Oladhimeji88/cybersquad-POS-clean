import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent } from "./ui/tabs";
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
  Search,
  Filter,
  Download,
  MoreVertical,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { JobDetailsModal } from "./JobDetailsModal";
import { FilterModal } from "./FilterModal";
import { RepairStatusCards } from "./RepairStatusCards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useApi } from "../hooks/useApi";
import { exportRowsAsPdfReport } from "../lib/printReport";
import {
  PENDING_STATUSES,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  CANCELLED_STATUSES,
} from "../lib/jobStatusGroups";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

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

// The Completed tab already covers completed jobs, so Job Management leaves that card off the stage strip.
const HIDDEN_STATUS_CARDS = ["completed"];
// Whole-list views that have no stage card: every active job, completed jobs and cancelled jobs.
const BROADER_JOB_LISTS = [
  { tab: "active", label: "All active", statuses: ACTIVE_STATUSES },
  { tab: "completed", label: "Completed", statuses: COMPLETED_STATUSES },
  { tab: "cancelled", label: "Cancelled", statuses: CANCELLED_STATUSES },
];

export function JobManagement({ initialFilter } = {}) {
  const { api } = useApi();
  const [listCounts, setListCounts] = useState({});
  useEffect(() => {
    let mounted = true;
    Promise.all(
      BROADER_JOB_LISTS.map((list) =>
        api
          .get("/jobs/admin/bookings/", { params: { status: list.statuses.join(","), page_size: 1 } })
          .then((res) => res?.data?.pagination?.count ?? 0)
          .catch(() => null),
      ),
    ).then((values) => {
      if (!mounted) return;
      setListCounts(Object.fromEntries(BROADER_JOB_LISTS.map((list, i) => [list.tab, values[i]])));
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Was declared and never wired to anything — no input rendered it, no
  // fetch read it, so this page (unlike Sales/Payments/Payouts) had no
  // free-text search at all. One search box, applied across all four tabs'
  // fetches below, so "find this customer's job" works regardless of which
  // tab it's actually sitting in.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  // Which tab is showing — controlled so a Dashboard card click can jump
  // straight to the right one (see the initialFilter effect below).
  const [activeTab, setActiveTab] = useState(initialFilter?.tab || "pending");

  const requestVersions = useRef({ pending: 0, active: 0, completed: 0, cancelled: 0 });

  // Filter states for each tab
  const [pendingFilters, setPendingFilters] = useState({});
  const [activeFilters, setActiveFilters] = useState({});
  const [completedFilters, setCompletedFilters] = useState({});
  const [cancelledFilters, setCancelledFilters] = useState({});

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [currentFilterTab, setCurrentFilterTab] = useState("pending");


  // Pending Offers State
  const [pendingJobs, setPendingJobs] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
  const [pendingPagination, setPendingPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Active Jobs State
  const [activeJobs, setActiveJobs] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(10);
  const [activePagination, setActivePagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Completed Jobs State
  const [completedJobs, setCompletedJobs] = useState([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState(null);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(10);
  const [completedPagination, setCompletedPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Cancelled Jobs State
  const [cancelledJobs, setCancelledJobs] = useState([]);
  const [cancelledLoading, setCancelledLoading] = useState(false);
  const [cancelledError, setCancelledError] = useState(null);
  const [cancelledPage, setCancelledPage] = useState(1);
  const [cancelledPageSize, setCancelledPageSize] = useState(10);
  const [cancelledPagination, setCancelledPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Fetch Pending Offers with filters
  const fetchPendingJobs = async () => {
    const requestVersion = ++requestVersions.current.pending;
    setPendingLoading(true);
    setPendingError(null);

    try {
      let baseStatuses = PENDING_STATUSES.join(",");

      // Apply status filter if not "all"
      if (pendingFilters.status && pendingFilters.status !== "all") {
        baseStatuses = pendingFilters.status;
      }

      let url = `/jobs/admin/bookings/?status=${baseStatuses}&page=${pendingPage}&page_size=${pendingPageSize}`;

      // Optional: backend filters if it supports this param, ignores it otherwise
      // (same defensive pattern as PaymentFinance.jsx's payments/payouts search).
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      // Add service_type filter
      if (
        pendingFilters.service_type &&
        pendingFilters.service_type !== "all"
      ) {
        url += `&service_type=${pendingFilters.service_type}`;
      }

      // Add source_channel filter (multi-select, comma-separated)
      if (pendingFilters.source_channel) {
        url += `&source_channel=${pendingFilters.source_channel}`;
      }

      // Add workflow_type filter (single value)
      if (
        pendingFilters.workflow_type &&
        pendingFilters.workflow_type !== "all"
      ) {
        url += `&workflow_type=${pendingFilters.workflow_type}`;
      }

      // Add date filters
      if (pendingFilters.dateFrom) {
        url += `&date_from=${pendingFilters.dateFrom.toISOString().split("T")[0]}`;
      }
      if (pendingFilters.dateTo) {
        url += `&date_to=${pendingFilters.dateTo.toISOString().split("T")[0]}`;
      }

      const res = await api.get(url);
      const data = res?.data || {};
      if (requestVersion !== requestVersions.current.pending) return;
      setPendingJobs(Array.isArray(data.result) ? data.result : []);
      setPendingPagination(data.pagination || {});
    } catch (e) {
      if (requestVersion !== requestVersions.current.pending) return;
      setPendingError("Failed to load pending jobs");
      console.error("Error fetching pending jobs:", e);
    } finally {
      if (requestVersion === requestVersions.current.pending) setPendingLoading(false);
    }
  };

  // Fetch Active Jobs with filters
  const fetchActiveJobs = async () => {
    const requestVersion = ++requestVersions.current.active;
    setActiveLoading(true);
    setActiveError(null);

    try {
      let baseStatuses = ACTIVE_STATUSES.join(",");

      // Apply status filter if not "all"
      if (activeFilters.status && activeFilters.status !== "all") {
        baseStatuses = activeFilters.status;
      }

      let url = `/jobs/admin/bookings/?status=${baseStatuses}&page=${activePage}&page_size=${activePageSize}`;

      // Optional: backend filters if it supports this param, ignores it otherwise
      // (same defensive pattern as PaymentFinance.jsx's payments/payouts search).
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      // Add service_type filter
      if (activeFilters.service_type && activeFilters.service_type !== "all") {
        url += `&service_type=${activeFilters.service_type}`;
      }

      // Add source_channel filter (multi-select, comma-separated)
      if (activeFilters.source_channel) {
        url += `&source_channel=${activeFilters.source_channel}`;
      }

      // Add workflow_type filter (single value)
      if (
        activeFilters.workflow_type &&
        activeFilters.workflow_type !== "all"
      ) {
        url += `&workflow_type=${activeFilters.workflow_type}`;
      }

      // Add date filters
      if (activeFilters.dateFrom) {
        url += `&date_from=${activeFilters.dateFrom.toISOString().split("T")[0]}`;
      }
      if (activeFilters.dateTo) {
        url += `&date_to=${activeFilters.dateTo.toISOString().split("T")[0]}`;
      }

      const res = await api.get(url);
      const data = res?.data || {};
      if (requestVersion !== requestVersions.current.active) return;
      setActiveJobs(Array.isArray(data.result) ? data.result : []);
      setActivePagination(data.pagination || {});
    } catch (e) {
      if (requestVersion !== requestVersions.current.active) return;
      setActiveError("Failed to load active jobs");
      console.error("Error fetching active jobs:", e);
    } finally {
      if (requestVersion === requestVersions.current.active) setActiveLoading(false);
    }
  };

  // Fetch Completed Jobs with filters
  const fetchCompletedJobs = async () => {
    const requestVersion = ++requestVersions.current.completed;
    setCompletedLoading(true);
    setCompletedError(null);

    try {
      let baseStatuses = COMPLETED_STATUSES.join(",");

      // Apply status filter if not "all"
      if (completedFilters.status && completedFilters.status !== "all") {
        baseStatuses = completedFilters.status;
      }

      let url = `/jobs/admin/bookings/?status=${baseStatuses}&page=${completedPage}&page_size=${completedPageSize}`;

      // Optional: backend filters if it supports this param, ignores it otherwise
      // (same defensive pattern as PaymentFinance.jsx's payments/payouts search).
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      // Add service_type filter
      if (
        completedFilters.service_type &&
        completedFilters.service_type !== "all"
      ) {
        url += `&service_type=${completedFilters.service_type}`;
      }

      // Add source_channel filter (multi-select, comma-separated)
      if (completedFilters.source_channel) {
        url += `&source_channel=${completedFilters.source_channel}`;
      }

      // Add workflow_type filter (single value)
      if (
        completedFilters.workflow_type &&
        completedFilters.workflow_type !== "all"
      ) {
        url += `&workflow_type=${completedFilters.workflow_type}`;
      }

      // Add date filters
      if (completedFilters.dateFrom) {
        url += `&date_from=${completedFilters.dateFrom.toISOString().split("T")[0]}`;
      }
      if (completedFilters.dateTo) {
        url += `&date_to=${completedFilters.dateTo.toISOString().split("T")[0]}`;
      }

      const res = await api.get(url);
      const data = res?.data || {};
      if (requestVersion !== requestVersions.current.completed) return;
      setCompletedJobs(Array.isArray(data.result) ? data.result : []);
      setCompletedPagination(data.pagination || {});
    } catch (e) {
      if (requestVersion !== requestVersions.current.completed) return;
      setCompletedError("Failed to load completed jobs");
      console.error("Error fetching completed jobs:", e);
    } finally {
      if (requestVersion === requestVersions.current.completed) setCompletedLoading(false);
    }
  };

  // Fetch Cancelled Jobs with filters
  const fetchCancelledJobs = async () => {
    const requestVersion = ++requestVersions.current.cancelled;
    setCancelledLoading(true);
    setCancelledError(null);

    try {
      let baseStatuses = CANCELLED_STATUSES.join(",");

      // Apply status filter if not "all"
      if (cancelledFilters.status && cancelledFilters.status !== "all") {
        baseStatuses = cancelledFilters.status;
      }

      let url = `/jobs/admin/bookings/?status=${baseStatuses}&page=${cancelledPage}&page_size=${cancelledPageSize}`;

      // Optional: backend filters if it supports this param, ignores it otherwise
      // (same defensive pattern as PaymentFinance.jsx's payments/payouts search).
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      // Add service_type filter
      if (
        cancelledFilters.service_type &&
        cancelledFilters.service_type !== "all"
      ) {
        url += `&service_type=${cancelledFilters.service_type}`;
      }

      // Add source_channel filter (multi-select, comma-separated)
      if (cancelledFilters.source_channel) {
        url += `&source_channel=${cancelledFilters.source_channel}`;
      }

      // Add workflow_type filter (single value)
      if (
        cancelledFilters.workflow_type &&
        cancelledFilters.workflow_type !== "all"
      ) {
        url += `&workflow_type=${cancelledFilters.workflow_type}`;
      }

      // Add date filters
      if (cancelledFilters.dateFrom) {
        url += `&date_from=${cancelledFilters.dateFrom.toISOString().split("T")[0]}`;
      }
      if (cancelledFilters.dateTo) {
        url += `&date_to=${cancelledFilters.dateTo.toISOString().split("T")[0]}`;
      }

      const res = await api.get(url);
      const data = res?.data || {};
      if (requestVersion !== requestVersions.current.cancelled) return;
      setCancelledJobs(Array.isArray(data.result) ? data.result : []);
      setCancelledPagination(data.pagination || {});
    } catch (e) {
      if (requestVersion !== requestVersions.current.cancelled) return;
      setCancelledError("Failed to load cancelled jobs");
      console.error("Error fetching cancelled jobs:", e);
    } finally {
      if (requestVersion === requestVersions.current.cancelled) setCancelledLoading(false);
    }
  };

  // Fetch on mount and when pagination or filters change
  useEffect(() => {
    fetchPendingJobs();
  }, [pendingPage, pendingPageSize, pendingFilters, searchQuery]);

  useEffect(() => {
    fetchActiveJobs();
  }, [activePage, activePageSize, activeFilters, searchQuery]);

  useEffect(() => {
    fetchCompletedJobs();
  }, [completedPage, completedPageSize, completedFilters, searchQuery]);

  useEffect(() => {
    fetchCancelledJobs();
  }, [cancelledPage, cancelledPageSize, cancelledFilters, searchQuery]);

  // Resets every tab back to page 1 in the same update as the search text
  // change (not a separate effect keyed on searchQuery) — that way each
  // fetch effect above sees the new search term and page 1 together in one
  // re-render, instead of firing once for the search change and again a
  // moment later when the page reset lands.
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setPendingPage(1);
    setActivePage(1);
    setCompletedPage(1);
    setCancelledPage(1);
  };

  // Jump to a tab and scope it to a given status
  // filter handed in from the Dashboard's Repair Status cards.
  const applyStatusFilter = ({ tab, status }) => {
    if (!tab) return;

    setActiveTab(tab);

    if (tab === "pending") {
      setPendingFilters((prev) => ({ ...prev, status: status || "all" }));
      setPendingPage(1);
    } else if (tab === "active") {
      setActiveFilters((prev) => ({ ...prev, status: status || "all" }));
      setActivePage(1);
    } else if (tab === "completed") {
      setCompletedFilters((prev) => ({ ...prev, status: status || "all" }));
      setCompletedPage(1);
    } else if (tab === "cancelled") {
      setCancelledFilters((prev) => ({ ...prev, status: status || "all" }));
      setCancelledPage(1);
    }
  };

  // Apply a filter handed in from the Dashboard's Repair Status cards. Fires
  // again whenever a new object is passed (each card click creates a fresh one).
  useEffect(() => {
    if (!initialFilter?.tab) return;
    applyStatusFilter(initialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter]);

  const handleViewDetails = (job) => {
    setSelectedJob(job);
    setShowJobDetails(true);
  };

  const handleOpenFilter = (tab) => {
    setCurrentFilterTab(tab);
    setShowFilterModal(true);
  };

  const handleApplyFilter = (filters) => {
    if (currentFilterTab === "pending") {
      setPendingFilters(filters);
      setPendingPage(1); // Reset to first page
    } else if (currentFilterTab === "active") {
      setActiveFilters(filters);
      setActivePage(1);
    } else if (currentFilterTab === "completed") {
      setCompletedFilters(filters);
      setCompletedPage(1);
    } else if (currentFilterTab === "cancelled") {
      setCancelledFilters(filters);
      setCancelledPage(1);
    }
  };

  const getCurrentFilters = () => {
    const baseFilter = {
      tabType: currentFilterTab,
    };

    if (currentFilterTab === "pending") {
      return { ...baseFilter, ...pendingFilters };
    } else if (currentFilterTab === "active") {
      return { ...baseFilter, ...activeFilters };
    } else if (currentFilterTab === "completed") {
      return { ...baseFilter, ...completedFilters };
    } else if (currentFilterTab === "cancelled") {
      return { ...baseFilter, ...cancelledFilters };
    }
    return baseFilter;
  };

  // Handle export for jobs
  const handleJobExport = (format, jobs, type) => {
    const data = jobs.map((job) => ({
      "Job ID": job?.id || "-",
      Title: job?.title || "-",
      "Service Type": job?.service_type
        ? job.service_type.charAt(0).toUpperCase() + job.service_type.slice(1)
        : "-",
      Status: job?.status
        ? job.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
        : "-",
      Customer: job?.customer_name || "-",
      "Customer Email": job?.customer_email || "-",
      Technician: job?.technician_name || "Not Assigned",
      "Technician Email": job?.technician_email || "-",
      "Quote Amount": job?.service_quote_amount
        ? `₦${Number(job.service_quote_amount).toLocaleString()}`
        : "-",
      Location:
        `${job?.city || ""}, ${job?.state || ""}`
          .trim()
          .replace(/^,|,$/g, "") || "-",
      "Has Dispute": job?.has_open_dispute ? "Yes" : "No",
      "Shipment Status": job?.shipment_status
        ? job.shipment_status
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())
        : "-",
      "Lifecycle Stage": job?.lifecycle_stage
        ? job.lifecycle_stage
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())
        : "-",
      Completed: job?.is_completed ? "Yes" : "No",
      "Customer Rating": job?.customer_rating || "-",
      "Created At": job?.created_at
        ? new Date(job.created_at).toLocaleString()
        : "-",
      "Updated At": job?.updated_at
        ? new Date(job.updated_at).toLocaleString()
        : "-",
    }));

    exportData(data, format, type);
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

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "delivered":
      case "completed":
        return "default";
      case "cancelled":
      case "quote_rejected":
        return "destructive";
      case "offers_sent":
      case "offer_confirmed":
      case "quote_sent":
        return "outline";
      case "picked_up":
      case "repair_in_progress":
      case "repaired":
        return "secondary";
      default:
        return "outline";
    }
  };

  const renderJobsTable = (
    jobs,
    loading,
    error,
    pagination,
    page,
    pageSize,
    setPage,
    setPageSize,
  ) => (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Technician</TableHead>
            <TableHead>Service Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center">
                Loading...
              </TableCell>
            </TableRow>
          )}
          {!loading && error && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-red-500">
                {error}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            !error &&
            jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="max-w-[180px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium font-mono">
                      {job.display_id || `#${job.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">#{job.id}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {job.title || "-"}
                </TableCell>
                <TableCell>{job.customer_name || "-"}</TableCell>
                <TableCell>{job.technician_name || "Unassigned"}</TableCell>
                <TableCell className="capitalize">
                  {job.service_type || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusColor(job.status)}>
                    {job.status?.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(job.created_at)}
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
                      <DropdownMenuItem onClick={() => handleViewDetails(job)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          {!loading && !error && jobs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-muted-foreground"
              >
                No jobs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {jobs.length > 0 && (
        <PaginationBar
          page={pagination?.page || page}
          pages={pagination?.pages || 1}
          pageSize={pageSize}
          canPrev={Boolean(pagination?.previous)}
          canNext={Boolean(pagination?.next)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Job Management</h1>
          <p className="text-muted-foreground">
            Oversee and manage all platform jobs
          </p>
        </div>
        <div className="relative md:w-[280px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer, job ID..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Repair Status</h2>
          <p className="text-sm text-muted-foreground">
            Click a stage to filter jobs, or open a full list below.
          </p>
        </div>
        <RepairStatusCards
          onSelect={applyStatusFilter}
          excludeKeys={HIDDEN_STATUS_CARDS}
          gridClassName="grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm" role="group" aria-label="Job lists">
          {BROADER_JOB_LISTS.map((list) => (
            <button
              key={list.tab}
              type="button"
              onClick={() => applyStatusFilter({ tab: list.tab, status: "all" })}
              className={`press underline-offset-4 hover:underline ${
                activeTab === list.tab ? "font-semibold text-primary" : "text-muted-foreground"
              }`}
            >
              {list.label}
              {listCounts[list.tab] !== undefined && listCounts[list.tab] !== null ? ` (${listCounts[list.tab]})` : ""}
            </button>
          ))}
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Pending Offers</CardTitle>
                  <CardDescription>
                    Jobs waiting for technician acceptance
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenFilter("pending")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
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
                        onClick={() =>
                          handleJobExport("pdf", pendingJobs, "pending_offers")
                        }
                      >
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport(
                            "excel",
                            pendingJobs,
                            "pending_offers",
                          )
                        }
                      >
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport("csv", pendingJobs, "pending_offers")
                        }
                      >
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderJobsTable(
                pendingJobs,
                pendingLoading,
                pendingError,
                pendingPagination,
                pendingPage,
                pendingPageSize,
                setPendingPage,
                setPendingPageSize,
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Active Jobs</CardTitle>
                  <CardDescription>
                    Real-time monitoring of ongoing jobs
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenFilter("active")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
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
                        onClick={() =>
                          handleJobExport("pdf", activeJobs, "active_jobs")
                        }
                      >
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport("excel", activeJobs, "active_jobs")
                        }
                      >
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport("csv", activeJobs, "active_jobs")
                        }
                      >
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderJobsTable(
                activeJobs,
                activeLoading,
                activeError,
                activePagination,
                activePage,
                activePageSize,
                setActivePage,
                setActivePageSize,
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Completed Jobs</CardTitle>
                  <CardDescription>
                    History of successfully finished jobs
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenFilter("completed")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
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
                        onClick={() =>
                          handleJobExport(
                            "pdf",
                            completedJobs,
                            "completed_jobs",
                          )
                        }
                      >
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport(
                            "excel",
                            completedJobs,
                            "completed_jobs",
                          )
                        }
                      >
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport(
                            "csv",
                            completedJobs,
                            "completed_jobs",
                          )
                        }
                      >
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderJobsTable(
                completedJobs,
                completedLoading,
                completedError,
                completedPagination,
                completedPage,
                completedPageSize,
                setCompletedPage,
                setCompletedPageSize,
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Cancelled Jobs</CardTitle>
                  <CardDescription>
                    Audit trail of cancellation reasons
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenFilter("cancelled")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
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
                        onClick={() =>
                          handleJobExport(
                            "pdf",
                            cancelledJobs,
                            "cancelled_jobs",
                          )
                        }
                      >
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport(
                            "excel",
                            cancelledJobs,
                            "cancelled_jobs",
                          )
                        }
                      >
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleJobExport(
                            "csv",
                            cancelledJobs,
                            "cancelled_jobs",
                          )
                        }
                      >
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderJobsTable(
                cancelledJobs,
                cancelledLoading,
                cancelledError,
                cancelledPagination,
                cancelledPage,
                cancelledPageSize,
                setCancelledPage,
                setCancelledPageSize,
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <JobDetailsModal
        open={showJobDetails}
        onOpenChange={setShowJobDetails}
        job={selectedJob}
        onUpdated={() => {
          // refresh all tabs after any action inside the modal
          fetchPendingJobs();
          fetchActiveJobs();
          fetchCompletedJobs();
          fetchCancelledJobs();
        }}
      />

      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        type="job"
        initialFilters={getCurrentFilters()}
        onApply={handleApplyFilter}
      />
    </div>
  );
}
