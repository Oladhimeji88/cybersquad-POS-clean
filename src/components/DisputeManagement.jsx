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
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useState, useEffect } from "react";
import { DisputeDetailsModal } from "./DisputeDetailsModal";
import { FilterModal } from "./FilterModal";
import { ExportModal } from "./ExportModal";
import { DisputeTypeModal } from "./DisputeTypeModal";
import { useApi } from "../hooks/useApi";
import { exportRowsAsPdfReport } from "../lib/printReport";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DASHBOARD_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "all_time", label: "All Time" },
];

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

// Helper function to convert Date to ISO date-only string
function toISODateOnly(d) {
  if (!d) return null;
  const iso = new Date(d).toISOString();
  return iso.split("T")[0];
}

function formatResolutionTime(seconds) {
  const totalSeconds = Number(seconds) || 0;
  if (totalSeconds <= 0) return "0m";

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function DisputeManagement({ userRole }) {
  const { api } = useApi();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDisputeId, setSelectedDisputeId] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDisputeTypeModal, setShowDisputeTypeModal] = useState(false);

  // Filters state
  const [filters, setFilters] = useState({
    status: "all",
    type: "all",
    dateFrom: null,
    dateTo: null,
  });

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statsPeriod, setStatsPeriod] = useState("this_month");
  const [pagination, setPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Data state
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    closed: 0,
    pendingResponse: 0,
    avgResolutionTime: "0m",
    period: "this_month",
    updatedAt: null,
  });

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    setStatsError(null);

    try {
      const res = await api.get("/disputes/admin/dashboard-stats/", {
        params: { period: statsPeriod },
        showLoader: false,
      });
      const result = res?.data?.result || {};

      setStats({
        total: Number(result?.dispute_counts?.total) || 0,
        open: Number(result?.dispute_counts?.open) || 0,
        closed: Number(result?.dispute_counts?.closed) || 0,
        pendingResponse:
          Number(result?.dispute_counts?.pending_response) || 0,
        avgResolutionTime: formatResolutionTime(
          result?.resolution_metrics?.avg_resolution_time_seconds,
        ),
        period: result?.period || statsPeriod,
        updatedAt: result?.timestamp || null,
      });
    } catch (e) {
      console.error("Error fetching dispute dashboard stats:", e);
      setStatsError("Failed to load dispute dashboard stats");
      setStats({
        total: 0,
        open: 0,
        closed: 0,
        pendingResponse: 0,
        avgResolutionTime: "0m",
        period: statsPeriod,
        updatedAt: null,
      });
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch disputes
  const fetchDisputes = async () => {
    setLoading(true);
    try {
      // Determine if user is a superuser
      const isSuperUser =
        userRole?.is_superuser ||
        userRole?.roles?.some((role) => role.name === "Super Admin");

      // Build endpoint URL based on user role
      let endpoint = `/disputes/admin/?page=${page}&page_size=${pageSize}`;

      // If not a superuser, filter by assigned staff
      if (!isSuperUser && userRole?.user_id) {
        endpoint += `&assigned_staff_id=${userRole.user_id}`;
      }

      // Add status filter
      if (filters.status !== "all") {
        endpoint += `&status=${filters.status}`;
      }

      if (filters.type !== "all") {
        endpoint += `&dispute_type=${filters.type}`;
      }

      // Add date filters (start_date and end_date)
      const startDate = toISODateOnly(filters.dateFrom);
      const endDate = toISODateOnly(filters.dateTo);

      if (startDate) {
        endpoint += `&start_date=${startDate}`;
      }
      if (endDate) {
        endpoint += `&end_date=${endDate}`;
      }

      const res = await api.get(endpoint);
      const data = res?.data || {};

      setDisputes(Array.isArray(data.result) ? data.result : []);
      setPagination(data.pagination || {});
    } catch (e) {
      console.error("Error fetching disputes:", e);
      setDisputes([]);
      setPagination({
        count: 0,
        pages: 1,
        page: page,
        page_size: pageSize,
        next: null,
        previous: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole) {
      fetchDisputes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, userRole, filters]);

  useEffect(() => {
    if (userRole) {
      fetchDashboardStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, statsPeriod]);

  // Filter disputes based on search query (client-side)
  const filteredDisputes = disputes.filter((dispute) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      dispute.customer_full_name?.toLowerCase().includes(query) ||
      dispute.technician_name?.toLowerCase().includes(query) ||
      String(dispute.id).toLowerCase().includes(query) ||
      dispute.dispute_type?.toLowerCase().includes(query) ||
      dispute.title?.toLowerCase().includes(query) ||
      dispute.status?.toLowerCase().includes(query) ||
      dispute.assigned_staff_email?.toLowerCase().includes(query) ||
      dispute.priority?.toLowerCase().includes(query)
    );
  });

  const handleViewDetails = (disputeId) => {
    setSelectedDisputeId(disputeId);
    setShowDetails(true);
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
    setSelectedDisputeId(null);
    fetchDisputes();
    fetchDashboardStats();
  };

  // Handle filter application
  const handleApplyFilters = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page when filters change
  };

  // Export handler for disputes
  const handleExport = ({ fileFormat }) => {
    const data = filteredDisputes.map((dispute) => ({
      "Dispute ID": dispute?.id || "-",
      Title: dispute?.title || "No title",
      Type: dispute?.dispute_type
        ? dispute.dispute_type
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())
        : "-",
      Priority: dispute?.priority
        ? dispute.priority.charAt(0).toUpperCase() + dispute.priority.slice(1)
        : "-",
      Status: dispute?.status
        ? dispute.status
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())
        : "-",
      Customer: dispute?.customer_full_name || "-",
      "Customer Email": dispute?.customer_email || "-",
      Technician: dispute?.technician_name || "-",
      "Assigned Staff": dispute?.assigned_staff_email || "Unassigned",
      "Customer Statement": dispute?.customer_initial_statement || "-",
      "Technician Statement": dispute?.technician_statement || "-",
      "Created At": dispute?.created_at
        ? new Date(dispute.created_at).toLocaleString()
        : "-",
      "Resolved At": dispute?.resolved_at
        ? new Date(dispute.resolved_at).toLocaleString()
        : "Not resolved",
    }));

    exportData(data, fileFormat, "disputes");
  };

  // Generic export function
  const exportData = (data, format, type) => {
    if (format === "csv" || format === "excel") {
      exportAsCSV(data, type);
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

  // Export as PDF using print functionality (shared template — src/lib/printReport.js)
  const exportAsPDF = (data, type) => exportRowsAsPdfReport(data, type);

  const getStatusLabel = (status) => {
    const statusMap = {
      created: "Pending",
      assigned: "Assigned",
      under_review: "Under Review",
      awaiting_customer: "Awaiting Customer",
      awaiting_technician: "Awaiting Technician",
      awaiting_staff_assignment: "Awaiting Staff Assignment",
      judgement: "Judgement",
      closed: "Closed",
      resolved: "Resolved",
    };
    return statusMap[status] || status;
  };

  const getStatusVariant = (status) => {
    const variantMap = {
      created: "secondary",
      assigned: "default",
      under_review: "default",
      awaiting_customer: "outline",
      awaiting_technician: "outline",
      awaiting_staff_assignment: "secondary",
      judgement: "default",
      closed: "outline",
      resolved: "outline",
    };
    return variantMap[status] || "outline";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Dispute Management</h1>
          <p className="text-muted-foreground">
            Handle customer and technician complaints
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.updatedAt
              ? `Updated ${new Date(stats.updatedAt).toLocaleString()}`
              : statsLoading
                ? "Loading live dispute stats..."
                : "Live dispute stats"}
            {statsError ? " • Live stats unavailable" : ""}
          </p>
        </div>

        <Select value={statsPeriod} onValueChange={setStatsPeriod}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {DASHBOARD_PERIOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="dispute-stats-grid">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Total Disputes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              For selected period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Open Disputes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.open}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Require attention
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Pending Response</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {stats.pendingResponse}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Waiting on customer or technician
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Closed Disputes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.closed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Successfully resolved
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Average Resolution Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.avgResolutionTime}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across resolved disputes
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>All Disputes</CardTitle>
              <CardDescription>
                View and manage platform disputes
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, or type..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowFilterModal(true)}
                    >
                      <Filter className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Filter</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowExportModal(true)}
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading disputes...
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDisputes.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-8 text-muted-foreground"
                      >
                        {searchQuery
                          ? "No disputes found matching your search."
                          : "No disputes found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDisputes.map((dispute) => (
                      <TableRow
                        key={dispute.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewDetails(dispute.id)}
                      >
                        <TableCell className="font-medium">
                          #{dispute.id}
                        </TableCell>
                        <TableCell>{dispute.title || "No title"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {dispute.dispute_type?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{dispute.customer_full_name}</TableCell>
                        <TableCell>{dispute.technician_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              dispute.priority === "high"
                                ? "destructive"
                                : dispute.priority === "medium"
                                  ? "default"
                                  : "secondary"
                            }
                            className="w-20 justify-center"
                          >
                            {dispute.priority === "high" && (
                              <AlertTriangle className="h-4 w-4 mr-1" />
                            )}
                            {dispute.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(dispute.status)}>
                            {getStatusLabel(dispute.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {dispute.assigned_staff_email || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(dispute.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

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
            </>
          )}
        </CardContent>
      </Card>

      {selectedDisputeId && (
        <DisputeDetailsModal
          open={showDetails}
          onClose={handleCloseDetails}
          disputeId={selectedDisputeId}
        />
      )}

      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        type="dispute"
        initialFilters={filters}
        onApply={handleApplyFilters}
      />

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        type="dispute"
        onExport={handleExport}
      />

      <DisputeTypeModal
        open={showDisputeTypeModal}
        onClose={() => setShowDisputeTypeModal(false)}
      />
    </div>
  );
}
