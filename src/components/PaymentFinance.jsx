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
  Search,
  Filter,
  Download,
  MoreVertical,
  TrendingUp,
  CreditCard,
  Wallet,
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

import { PaymentDetailsModal } from "./PaymentDetailsModal";
import { PayoutDetailsModal } from "./PayoutDetailsModal";
import { PayoutBreakdownModal } from "./PayoutBreakdownModal";
import { ProcessPayoutsModal } from "./ProcessPayoutsModal";
import { FinanceReportsTab } from "./FinanceReportsTab";
import { VoucherManagementTab } from "./VoucherManagementTab";

import { FilterModal } from "./FilterModal";
import { ExportModal } from "./ExportModal";

import { useApi } from "../hooks/useApi";
import { getSalesSummary } from "../pos/lib/store";
import { fetchWebsiteSalesSummary } from "../lib/websiteSales";
import { formatAmount } from "../lib/currency";

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

// -----------------------------
// Helpers (formatting + filtering)
// -----------------------------
function toISODateOnly(d) {
  if (!d) return null;
  // Works with Date object
  const iso = new Date(d).toISOString();
  return iso.split("T")[0];
}

function safeNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatType(type) {
  if (!type) return "-";
  return String(type)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function getStatusStyle(status) {
  switch (status) {
    case "succeeded":
    case "completed":
      return { backgroundColor: "#22c55e", color: "white" };
    case "failed":
    case "refunded":
      return { backgroundColor: "#ef4444", color: "white" };
    case "initiated":
    case "pending":
      return { backgroundColor: "#f97316", color: "white" };
    default:
      return { backgroundColor: "#6b7280", color: "white" };
  }
}

function formatPayoutState(state) {
  if (!state) return "-";
  return String(state).replace(/_/g, " ");
}

function getPayoutStateStyle(state) {
  switch (state) {
    case "PAID":
      return { backgroundColor: "#22c55e", color: "white" };
    case "READY_FOR_APPROVAL":
      return { backgroundColor: "#f97316", color: "white" };
    case "APPROVED":
    case "PROCESSING":
      return { backgroundColor: "#3b82f6", color: "white" };
    case "FAILED":
    case "REJECTED":
      return { backgroundColor: "#ef4444", color: "white" };
    default:
      return { backgroundColor: "#6b7280", color: "white" };
  }
}

function getTechnicianLabel(payout) {
  const techName = payout?.earnings?.technician_name; // optional if backend adds later
  const techId = payout?.earnings?.technician_id;
  if (techName) return techName;
  if (techId) return `Technician #${techId}`;
  return "-";
}

function getTechnicianAmount(payout) {
  return payout?.earnings?.technician_amount;
}

function withinDateRange(isoDateTime, fromDate, toDate) {
  if (!isoDateTime) return true;
  const t = new Date(isoDateTime).getTime();
  if (fromDate) {
    const f = new Date(fromDate);
    f.setHours(0, 0, 0, 0);
    if (t < f.getTime()) return false;
  }
  if (toDate) {
    const tt = new Date(toDate);
    tt.setHours(23, 59, 59, 999);
    if (t > tt.getTime()) return false;
  }
  return true;
}

function matchesText(value, q) {
  if (!q) return true;
  const s = String(value ?? "").toLowerCase();
  return s.includes(q.toLowerCase());
}

function toCSV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const str = String(v ?? "");
    // quote if needed
    if (str.includes(",") || str.includes('"') || str.includes("\n"))
      return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

function downloadTextFile(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readCanApprovePayouts() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return false;
    const stored = JSON.parse(raw);
    if (stored?.can_approve_payouts === true) return true;
    if (stored?.user?.is_superuser === true) return true;
    if (Array.isArray(stored?.roles)) {
      return stored.roles.some((r) => r?.can_approve_payouts === true);
    }
    return false;
  } catch {
    return false;
  }
}

const ALL_TABS = ["payments", "payouts", "reports", "vouchers"];

// `show` picks which inner tabs this instance offers, so Finance can surface
// Payments, Payouts and Reports as their own top-level tabs (PRD navigation)
// without duplicating the data loading. `showSummary` hides the headline cards
// when the instance isn't the first one on screen.
export function PaymentFinance({ show = ALL_TABS, showSummary = true }) {
  const { api } = useApi();

  const canApprovePayouts = useMemo(() => readCanApprovePayouts(), []);

  // UI tab control
  const [activeTab, setActiveTab] = useState(show[0] ?? "payments");

  // Revenue on this page previously only counted jobs — but the business
  // actually collects money through three channels: repair jobs (backend,
  // real-time), in-store POS sales (this browser's local storage only, no
  // backend endpoint yet), and website sales (Odoo eCommerce — endpoint not
  // deployed yet, so fetchWebsiteSalesSummary always resolves null for now
  // and every figure below shows that honestly instead of pretending it's
  // zero). Total Revenue and Payments Today below fold in all three so the
  // headline numbers on this page reflect where the business's money
  // actually comes from, not just the jobs pipeline.
  const [posSalesSummary, setPosSalesSummary] = useState(null);
  const [posWebsiteSalesToday, setPosWebsiteSalesToday] = useState(null);
  const [posAllTimeRevenue, setPosAllTimeRevenue] = useState(0);
  const [posWebsiteAllTime, setPosWebsiteAllTime] = useState(null);

  // Feeds "Total Revenue (All-Time)" and "Payments Today" below.
  useEffect(() => {
    let mounted = true;
    Promise.all([
      getSalesSummary("today"),
      fetchWebsiteSalesSummary(api, "today"),
      getSalesSummary("all"),
      fetchWebsiteSalesSummary(api, "all"),
    ]).then(([summary, website, allTimeSummary, websiteAllTime]) => {
      if (!mounted) return;
      setPosSalesSummary(summary);
      setPosWebsiteSalesToday(website);
      setPosAllTimeRevenue(allTimeSummary?.totalRevenue ?? 0);
      setPosWebsiteAllTime(websiteAllTime);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const websiteAvailable = posWebsiteAllTime !== null;
  const revenueSourcesNote = websiteAvailable ? "Jobs + in-store + website" : "Jobs + in-store";

  useEffect(() => {
    if (!canApprovePayouts && activeTab === "payouts") {
      setActiveTab("payments");
    }
  }, [canApprovePayouts, activeTab]);

  // Shared modals
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [modalType, setModalType] = useState("payment"); // 'payment' | 'payout'

  // -----------------------------
  // Details Modals
  // -----------------------------
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);

  const [selectedPayout, setSelectedPayout] = useState(null);
  const [showPayoutDetails, setShowPayoutDetails] = useState(false);
  const [showPayoutBreakdown, setShowPayoutBreakdown] = useState(false);
  const [showProcessPayouts, setShowProcessPayouts] = useState(false);

  // -----------------------------
  // Filters (payments + payouts)
  // -----------------------------
  const [paymentFilters, setPaymentFilters] = useState({
    status: "all", // initiated | succeeded | failed | refunded | all
    provider: "all", // paystack | card | flutterwave | all
    type: "all", // shipping_fee | service_fee | ... | all
    minAmount: "all", // string number or 'all'
    maxAmount: "all", // string number or 'all'
    dateFrom: null,
    dateTo: null,
  });

  const [payoutFilters, setPayoutFilters] = useState({
    state: "all", // READY_FOR_APPROVAL | APPROVED | PROCESSING | PAID | FAILED | REJECTED | all
    minAmount: "all", // string number or 'all'
    maxAmount: "all", // string number or 'all'
    dateFrom: null,
    dateTo: null,
  });

  // -----------------------------
  // Search (payments + payouts)
  // -----------------------------
  const [paymentsSearchQuery, setPaymentsSearchQuery] = useState("");
  const [payoutsSearchQuery, setPayoutsSearchQuery] = useState("");

  // -----------------------------
  // Payments state (API)
  // -----------------------------
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);
  const [paymentsPagination, setPaymentsPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // Fetch payments (server-side filters + search where possible)
  const fetchPayments = async () => {
    setPaymentsLoading(true);
    setPaymentsError(null);

    try {
      const params = {
        page: paymentsPage,
        page_size: paymentsPageSize,
      };

      // Optional: if backend supports these query params, it will filter dataset properly.
      // If backend ignores unknown params, no problem.
      if (paymentsSearchQuery?.trim())
        params.search = paymentsSearchQuery.trim();
      if (paymentFilters.status !== "all")
        params.status = paymentFilters.status;
      if (paymentFilters.provider !== "all")
        params.provider = paymentFilters.provider;
      if (paymentFilters.type !== "all") params.type = paymentFilters.type;
      // Optional: if backend supports these query params, it will filter dataset properly.
      // If backend ignores unknown params, no problem.
      if (paymentsSearchQuery?.trim())
        params.search = paymentsSearchQuery.trim();
      if (paymentFilters.status !== "all")
        params.status = paymentFilters.status;
      if (paymentFilters.provider !== "all")
        params.provider = paymentFilters.provider;
      if (paymentFilters.type !== "all") params.type = paymentFilters.type;

      if (
        paymentFilters.minAmount !== "all" &&
        paymentFilters.minAmount !== "" &&
        paymentFilters.minAmount != null
      ) {
        params.min_amount = paymentFilters.minAmount;
      }

      if (
        paymentFilters.maxAmount !== "all" &&
        paymentFilters.maxAmount !== "" &&
        paymentFilters.maxAmount != null
      ) {
        params.max_amount = paymentFilters.maxAmount;
      }

      const df = toISODateOnly(paymentFilters.dateFrom);
      const dt = toISODateOnly(paymentFilters.dateTo);
      if (df) params.date_from = df;
      if (dt) params.date_to = dt;

      const res = await api.get("/payments/admin/", { params });
      const data = res?.data || {};

      setPayments(Array.isArray(data.result) ? data.result : []);
      setPaymentsPagination(data.pagination || {});
    } catch (e) {
      setPaymentsError("Failed to load payments");
      console.error("Error fetching payments:", e);
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentsPage, paymentsPageSize, paymentFilters, paymentsSearchQuery]);

  // -----------------------------
  // Payouts state (API)
  // -----------------------------
  const [payouts, setPayouts] = useState([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsError, setPayoutsError] = useState(null);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [payoutsPageSize, setPayoutsPageSize] = useState(10);
  const [payoutsPagination, setPayoutsPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  // -----------------------------
  // Finance dashboard stats (API)
  // -----------------------------
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  // The Dashboard's "Total Revenue" and this page's used to disagree even at
  // matching scopes, because each called a different backend endpoint for
  // what both labeled "revenue": this page used
  // /payouts/platform/dashboard-stats/'s revenue.all_time.total_gross, while
  // the Dashboard uses /jobs/admin/dashboard/stats/?range=. Two independently
  // computed aggregates for the same metric will drift — different status
  // filters, different gross/net treatment, no guarantee they're even
  // recomputed on the same cadence. The fix is a single source of truth: this
  // page now calls the exact same endpoint (range=all, since this card is
  // all-time) that the Dashboard already calls, so the jobs-revenue figure
  // both pages show is the same query, not two guesses at the same number.
  // /payouts/platform/dashboard-stats/ is kept for what only it has —
  // payouts, commissions, escrow.
  const [jobsRevenueAllTime, setJobsRevenueAllTime] = useState(0);

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    setStatsError(null);

    // Independent try/catches (not a single Promise.all) so a failure in
    // either call doesn't wipe out data the other one successfully returned.
    try {
      const payoutsStatsRes = await api.get("/payouts/platform/dashboard-stats/", {
        showLoader: false,
      });
      setDashboardStats(payoutsStatsRes?.data?.result || null);
    } catch (e) {
      setStatsError("Failed to load dashboard stats");
      console.error("Error fetching finance dashboard stats:", e);
      setDashboardStats(null);
    }

    try {
      const jobsStatsRes = await api.get("/jobs/admin/dashboard/stats/?range=all", {
        showLoader: false,
      });
      setJobsRevenueAllTime(jobsStatsRes?.data?.result?.stats?.revenue ?? 0);
    } catch (e) {
      console.error("Error fetching jobs revenue (all-time):", e);
      setJobsRevenueAllTime(0);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPayouts = async () => {
    setPayoutsLoading(true);
    setPayoutsError(null);

    try {
      const params = {
        page: payoutsPage,
        page_size: payoutsPageSize,
      };

      if (payoutsSearchQuery?.trim()) params.search = payoutsSearchQuery.trim();
      if (payoutFilters.state !== "all") params.state = payoutFilters.state;

      const df = toISODateOnly(payoutFilters.dateFrom);
      const dt = toISODateOnly(payoutFilters.dateTo);
      if (df) params.date_from = df;
      if (dt) params.date_to = dt;

      if (
        payoutFilters.minAmount !== "all" &&
        payoutFilters.minAmount !== "" &&
        payoutFilters.minAmount != null
      ) {
        params.min_amount = payoutFilters.minAmount;
      }

      if (
        payoutFilters.maxAmount !== "all" &&
        payoutFilters.maxAmount !== "" &&
        payoutFilters.maxAmount != null
      ) {
        params.max_amount = payoutFilters.maxAmount;
      }

      const res = await api.get("/payouts/", { params });
      const data = res?.data;

      // supports:
      // 1) { result: [...], pagination: {...} }
      // 2) [ ... ]
      const result = Array.isArray(data)
        ? data
        : Array.isArray(data?.result)
          ? data.result
          : [];
      const pagination = Array.isArray(data) ? null : data?.pagination;

      setPayouts(result);

      if (pagination) setPayoutsPagination(pagination);
      else {
        setPayoutsPagination((prev) => ({
          ...prev,
          page: payoutsPage,
          page_size: payoutsPageSize,
        }));
      }
    } catch (e) {
      setPayoutsError("Failed to load payouts");
      console.error("Error fetching payouts:", e);
      setPayouts([]);
    } finally {
      setPayoutsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutsPage, payoutsPageSize, payoutFilters, payoutsSearchQuery]);

  // -----------------------------
  // Client-side fallback filtering
  // (Even if backend doesn’t filter, UI still works)
  // -----------------------------
  const filteredPayments = useMemo(() => {
    return (payments || [])
      .filter((p) => {
        // Search matches: id, job, job_title, customer_name, provider, status, type
        const q = paymentsSearchQuery?.trim();
        if (!q) return true;

        return (
          matchesText(p.id, q) ||
          matchesText(p.job, q) ||
          matchesText(p.job_title, q) ||
          matchesText(p.customer_name, q) ||
          matchesText(p.provider, q) ||
          matchesText(p.status, q) ||
          matchesText(p.type, q)
        );
      })
      .filter((p) => {
        if (
          paymentFilters.status !== "all" &&
          p.status !== paymentFilters.status
        )
          return false;
        if (
          paymentFilters.provider !== "all" &&
          String(p.provider || "").toLowerCase() !== paymentFilters.provider
        )
          return false;
        if (paymentFilters.type !== "all" && p.type !== paymentFilters.type)
          return false;

        if (
          paymentFilters.minAmount !== "all" &&
          paymentFilters.minAmount != null &&
          paymentFilters.minAmount !== ""
        ) {
          const min = safeNumber(paymentFilters.minAmount);
          const amt = safeNumber(p.amount);
          if (amt < min) return false;
        }

        if (
          paymentFilters.maxAmount !== "all" &&
          paymentFilters.maxAmount != null &&
          paymentFilters.maxAmount !== ""
        ) {
          const max = safeNumber(paymentFilters.maxAmount);
          const amt = safeNumber(p.amount);
          if (amt > max) return false;
        }

        if (
          !withinDateRange(
            p.created_at,
            paymentFilters.dateFrom,
            paymentFilters.dateTo,
          )
        )
          return false;
        return true;
      });
  }, [payments, paymentsSearchQuery, paymentFilters]);

  const filteredPayouts = useMemo(() => {
    return (payouts || [])
      .filter((p) => {
        const q = payoutsSearchQuery?.trim();
        if (!q) return true;

        return (
          matchesText(p.id, q) ||
          matchesText(p.job_id, q) ||
          matchesText(p.state, q) ||
          matchesText(p?.earnings?.technician_id, q) ||
          matchesText(p?.earnings?.technician_amount, q)
        );
      })
      .filter((p) => {
        if (payoutFilters.state !== "all" && p.state !== payoutFilters.state)
          return false;

        if (
          payoutFilters.minAmount !== "all" &&
          payoutFilters.minAmount != null &&
          payoutFilters.minAmount !== ""
        ) {
          const min = safeNumber(payoutFilters.minAmount);
          const amt = safeNumber(p?.earnings?.technician_amount);
          if (amt < min) return false;
        }

        if (
          payoutFilters.maxAmount !== "all" &&
          payoutFilters.maxAmount != null &&
          payoutFilters.maxAmount !== ""
        ) {
          const max = safeNumber(payoutFilters.maxAmount);
          const amt = safeNumber(p?.earnings?.technician_amount);
          if (amt > max) return false;
        }

        if (
          !withinDateRange(
            p.created_at,
            payoutFilters.dateFrom,
            payoutFilters.dateTo,
          )
        )
          return false;
        return true;
      });
  }, [payouts, payoutsSearchQuery, payoutFilters]);

  // -----------------------------
  // Actions
  // -----------------------------
  const handleViewPaymentDetails = (payment) => {
    setSelectedPayment(payment);
    setShowPaymentDetails(true);
  };

  const handleViewPayoutDetails = (payout) => {
    setSelectedPayout(payout);
    setShowPayoutDetails(true);
  };

  const handleViewPayoutBreakdown = (payout) => {
    setSelectedPayout(payout);
    setShowPayoutBreakdown(true);
  };

  const handleExportPayoutRow = (payout) => {
    // Row export (single payout) — always works (CSV download)
    const row = {
      id: payout?.id,
      job_id: payout?.job_id,
      currency: payout?.currency,
      state: payout?.state,
      technician_id: payout?.earnings?.technician_id,
      gross_amount: payout?.earnings?.gross_amount,
      platform_commission: payout?.earnings?.platform_commission,
      technician_amount: payout?.earnings?.technician_amount,
      created_at: payout?.created_at,
      updated_at: payout?.updated_at,
    };

    const csv = toCSV([row]);
    downloadTextFile(`payout_${payout?.id}.csv`, csv, "text/csv");
  };

  const openFilters = (type) => {
    setModalType(type);
    setShowFilterModal(true);
  };

  const openExport = (type) => {
    setModalType(type);
    setShowExportModal(true);
  };

  const applyFilters = (type, nextFilters) => {
    if (type === "payment") {
      setPaymentFilters((prev) => ({ ...prev, ...nextFilters }));
      setPaymentsPage(1);
    } else if (type === "payout") {
      setPayoutFilters((prev) => ({ ...prev, ...nextFilters }));
      setPayoutsPage(1);
    }
  };

  const handleExport = ({ type, fileFormat, dateFrom, dateTo }) => {
    // Export what the user is currently looking at (filtered rows on the current page)
    const rows = type === "payment" ? filteredPayments : filteredPayouts;

    // Date range from export modal can override (optional)
    const finalRows = rows.filter((r) =>
      withinDateRange(r.created_at, dateFrom, dateTo),
    );

    if (fileFormat === "csv" || fileFormat === "excel") {
      // For Excel, CSV is the simplest universal download.
      // If you want real XLSX, install "xlsx" and generate workbook.
      const csv = toCSV(finalRows);
      const ext = fileFormat === "excel" ? "csv" : "csv";
      downloadTextFile(`${type}s_export.${ext}`, csv, "text/csv");
      return;
    }

    if (fileFormat === "pdf") {
      // Same formatted-table template Job/Dispute/User Management use
      // (src/lib/printReport.js) — this used to just dump raw JSON into a
      // <pre> tag, a noticeably rougher export than every other admin page.
      exportRowsAsPdfReport(finalRows, type);
      return;
    }
  };

  // -----------------------------
  // Stats (based on current fetched pages)
  // -----------------------------
  const totalRevenue = useMemo(() => {
    return (payments || [])
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + safeNumber(p.amount), 0);
  }, [payments]);

  const paymentsToday = useMemo(() => {
    return (payments || []).filter((p) => {
      const paymentDate = new Date(p.created_at);
      const today = new Date();
      return paymentDate.toDateString() === today.toDateString();
    }).length;
  }, [payments]);

  const paymentsTodayAmount = useMemo(() => {
    return (payments || [])
      .filter((p) => {
        const paymentDate = new Date(p.created_at);
        const today = new Date();
        return (
          paymentDate.toDateString() === today.toDateString() &&
          p.status === "succeeded"
        );
      })
      .reduce((sum, p) => sum + safeNumber(p.amount), 0);
  }, [payments]);

  const pendingPayouts = useMemo(() => {
    // consider NOT paid as pending bucket
    return (payouts || []).filter((p) => p.state && p.state !== "PAID");
  }, [payouts]);

  const pendingPayoutsAmount = useMemo(() => {
    return pendingPayouts.reduce(
      (sum, p) => sum + safeNumber(p?.earnings?.technician_amount),
      0,
    );
  }, [pendingPayouts]);

  const commissionEarned = useMemo(() => {
    return (payouts || []).reduce(
      (sum, p) => sum + safeNumber(p?.earnings?.platform_commission),
      0,
    );
  }, [payouts]);

  const financeSummary = useMemo(() => {
    // Jobs-revenue component now always comes from jobsRevenueAllTime (see
    // the comment by its declaration) regardless of whether the payouts
    // endpoint below loaded — that's what makes it match the Dashboard's
    // figure, and it shouldn't stop matching just because a payouts-specific
    // call had trouble.
    const totalRevenueAmount = jobsRevenueAllTime + posAllTimeRevenue + (posWebsiteAllTime?.revenue ?? 0);

    if (!dashboardStats) {
      const posTodayAmount = (posSalesSummary?.totalRevenue ?? 0) + (posWebsiteSalesToday?.revenue ?? 0);
      const posTodayCount = (posSalesSummary?.totalSalesCount ?? 0) + (posWebsiteSalesToday?.count ?? 0);

      return {
        totalRevenueAmount,
        totalRevenueLabel: `${revenueSourcesNote}`,
        paymentsTodayAmount: paymentsTodayAmount + posTodayAmount,
        paymentsTodayCount: paymentsToday + posTodayCount,
        pendingPayoutAmount: pendingPayoutsAmount,
        pendingPayoutCount: pendingPayouts.length,
        commissionAmount: commissionEarned,
        commissionLabel: "From payouts (page)",
        availableForPayout: pendingPayoutsAmount,
        escrowBalance: totalRevenue,
        commissionBalance: commissionEarned,
        updatedAt: null,
      };
    }

    const paymentsCollectedToday =
      dashboardStats?.payments_collected?.today || {};
    const commissionsAllTime = dashboardStats?.commissions?.all_time || {};
    const payoutsSummary = dashboardStats?.payouts || {};
    const technicianEarnings = dashboardStats?.technician_earnings || {};
    const ledgerSummary = dashboardStats?.ledger_summary || {};

    const pendingApproval = payoutsSummary.pending_approval || {};
    const approvedPending = payoutsSummary.approved_pending_disbursement || {};
    const processing = payoutsSummary.processing || {};

    const pendingPayoutCount =
      safeNumber(pendingApproval.count) +
      safeNumber(approvedPending.count) +
      safeNumber(processing.count);
    const pendingPayoutAmount =
      safeNumber(pendingApproval.total_amount) +
      safeNumber(approvedPending.total_amount) +
      safeNumber(processing.total_amount);
    const effectiveRate = safeNumber(commissionsAllTime.effective_rate);
    const posTodayAmount = (posSalesSummary?.totalRevenue ?? 0) + (posWebsiteSalesToday?.revenue ?? 0);
    const posTodayCount = (posSalesSummary?.totalSalesCount ?? 0) + (posWebsiteSalesToday?.count ?? 0);

    return {
      totalRevenueAmount,
      totalRevenueLabel: `${revenueSourcesNote}`,
      paymentsTodayAmount: safeNumber(paymentsCollectedToday.total) + posTodayAmount,
      paymentsTodayCount: safeNumber(paymentsCollectedToday.count) + posTodayCount,
      pendingPayoutAmount,
      pendingPayoutCount,
      commissionAmount: safeNumber(commissionsAllTime.total_commission),
      commissionLabel: `${effectiveRate.toLocaleString()}% effective rate`,
      availableForPayout: safeNumber(technicianEarnings.available_for_payout),
      escrowBalance: safeNumber(ledgerSummary.platform_escrow_balance),
      commissionBalance: safeNumber(ledgerSummary.platform_commission_balance),
      updatedAt: dashboardStats.timestamp || null,
    };
  }, [
    commissionEarned,
    dashboardStats,
    paymentsToday,
    paymentsTodayAmount,
    pendingPayouts.length,
    pendingPayoutsAmount,
    totalRevenue,
    posSalesSummary,
    posWebsiteSalesToday,
    posAllTimeRevenue,
    posWebsiteAllTime,
    revenueSourcesNote,
    jobsRevenueAllTime,
  ]);

  return (
    <div className="space-y-6">
      {showSummary && (
      <>
      <div>
        <h1>Payment & Finance</h1>
        <p className="text-muted-foreground">
          Monitor payments, payouts, revenue, and voucher reporting
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <p className="text-sm">
                <span className="text-base">₦</span> Total Revenue (All-Time)
              </p>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ₦{financeSummary.totalRevenueAmount.toLocaleString()}
            </div>
            {/* All three channels the business actually collects money
                through: repair jobs, in-store POS (this device), and website
                sales (once that backend endpoint exists). The jobs portion
                is fetched from the exact same endpoint the Dashboard's
                "Total Revenue" uses (see jobsRevenueAllTime above) instead of
                a second, independently-computed figure — that's what makes
                the two numbers agree instead of drifting. The Dashboard's is
                the same three sources for a selected time range instead of
                all-time; the Reports tab's is the same three for a custom
                date range. */}
            <p className="text-xs text-muted-foreground mt-1">{financeSummary.totalRevenueLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Payments Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ₦{financeSummary.paymentsTodayAmount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {financeSummary.paymentsTodayCount} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-purple-600" />
              Pending Payouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ₦{financeSummary.pendingPayoutAmount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {financeSummary.pendingPayoutCount} payouts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              Commission Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ₦{financeSummary.commissionAmount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{financeSummary.commissionLabel}</p>
          </CardContent>
        </Card>
      </div>

      </>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        {show.length > 1 && (
        <TabsList>
          {show.includes("payments") && <TabsTrigger value="payments">Payments</TabsTrigger>}
          {show.includes("payouts") && canApprovePayouts && <TabsTrigger value="payouts">Payouts</TabsTrigger>}
          {show.includes("reports") && <TabsTrigger value="reports">Reports</TabsTrigger>}
          {show.includes("vouchers") && <TabsTrigger value="vouchers">Vouchers</TabsTrigger>}
        </TabsList>
        )}

        {/* -----------------------------
            PAYMENTS TAB
        ------------------------------ */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Customer Payments</CardTitle>
                  <CardDescription>
                    View all customer payment transactions
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search payments..."
                      className="pl-8 w-[250px]"
                      value={paymentsSearchQuery}
                      onChange={(e) => {
                        setPaymentsSearchQuery(e.target.value);
                        setPaymentsPage(1);
                      }}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openFilters("payment")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openExport("payment")}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* Keep the payment flow info box like old UI */}
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-900">
                  <strong>Payment Flow:</strong> Customer may pay
                  shipping/service fees. Status changes include{" "}
                  <code>initiated</code>, <code>succeeded</code>,{" "}
                  <code>failed</code>. Use filters to narrow results.
                </p>
              </div>

              {paymentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : paymentsError ? (
                <div className="text-center py-12 text-red-500">
                  {paymentsError}
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No payments found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">
                            #{payment.id}
                          </TableCell>
                          <TableCell className="font-medium">
                            #{payment.job}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {payment.job_title}
                          </TableCell>
                          <TableCell>{payment.customer_name}</TableCell>
                          <TableCell className="text-sm">
                            {formatType(payment.type)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatAmount(payment.amount, payment.currency)}
                          </TableCell>
                          <TableCell className="capitalize">
                            {payment.provider}
                          </TableCell>
                          <TableCell>
                            <Badge
                              style={getStatusStyle(payment.status)}
                              className="inline-flex items-center border-0"
                            >
                              <span className="capitalize">
                                {payment.status}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(payment.created_at)}
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
                                    handleViewPaymentDetails(payment)
                                  }
                                >
                                  View Details
                                </DropdownMenuItem>

                                {/* ONLY REMOVED: View Receipt */}
                                {payment.status === "failed" && (
                                  <DropdownMenuItem>
                                    Retry Payment
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <PaginationBar
                    page={paymentsPagination?.page || paymentsPage}
                    pages={paymentsPagination?.pages || 1}
                    pageSize={paymentsPageSize}
                    canPrev={Boolean(paymentsPagination?.previous)}
                    canNext={Boolean(paymentsPagination?.next)}
                    onPrev={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPaymentsPage((p) => p + 1)}
                    onPageSizeChange={(n) => {
                      setPaymentsPageSize(n);
                      setPaymentsPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -----------------------------
            PAYOUTS TAB
        ------------------------------ */}
        {!canApprovePayouts && show.length === 1 && show[0] === "payouts" && (
          <p className="text-sm text-muted-foreground">Your account is not allowed to view or approve payouts.</p>
        )}
        {canApprovePayouts && (
        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Technician Payouts</CardTitle>
                  <CardDescription>
                    Manage technician earnings and payouts
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search payouts..."
                      className="pl-8 w-[250px]"
                      value={payoutsSearchQuery}
                      onChange={(e) => {
                        setPayoutsSearchQuery(e.target.value);
                        setPayoutsPage(1);
                      }}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openFilters("payout")}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openExport("payout")}
                  >
                    <Download className="w-4 h-4" />
                  </Button>

                  <Button onClick={() => setShowProcessPayouts(true)}>
                    Process Payouts
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {payoutsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : payoutsError ? (
                <div className="text-center py-12 text-red-500">
                  {payoutsError}
                </div>
              ) : filteredPayouts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No payouts found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payout ID</TableHead>
                        <TableHead>Technician</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredPayouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell className="font-medium">
                            #{payout.id}
                          </TableCell>
                          <TableCell>{getTechnicianLabel(payout)}</TableCell>

                          <TableCell className="text-right font-medium">
                            {formatAmount(
                              getTechnicianAmount(payout),
                              payout.currency,
                            )}
                          </TableCell>

                          <TableCell className="font-medium">
                            #{payout.job_id}
                          </TableCell>

                          <TableCell>
                            <Badge
                              style={getPayoutStateStyle(payout.state)}
                              className="inline-flex items-center border-0"
                            >
                              <span className="capitalize">
                                {formatPayoutState(payout.state)}
                              </span>
                            </Badge>
                          </TableCell>

                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(payout.created_at)}
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
                                    handleViewPayoutDetails(payout)
                                  }
                                >
                                  View Details
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() =>
                                    handleViewPayoutBreakdown(payout)
                                  }
                                >
                                  View Breakdown
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => handleExportPayoutRow(payout)}
                                >
                                  Export Report (CSV)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <PaginationBar
                    page={payoutsPagination?.page || payoutsPage}
                    pages={payoutsPagination?.pages || 1}
                    pageSize={payoutsPageSize}
                    canPrev={
                      Boolean(payoutsPagination?.previous) || payoutsPage > 1
                    }
                    canNext={Boolean(payoutsPagination?.next)}
                    onPrev={() => setPayoutsPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPayoutsPage((p) => p + 1)}
                    onPageSizeChange={(n) => {
                      setPayoutsPageSize(n);
                      setPayoutsPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="reports">
          <FinanceReportsTab />
        </TabsContent>

        <TabsContent value="vouchers">
          <VoucherManagementTab />
        </TabsContent>
      </Tabs>

      {/* -----------------------------
          MODALS (RESTORED)
      ------------------------------ */}
      {selectedPayment && (
        <PaymentDetailsModal
          open={showPaymentDetails}
          onClose={() => setShowPaymentDetails(false)}
          payment={selectedPayment}
        />
      )}

      {selectedPayout && (
        <>
          <PayoutDetailsModal
            open={showPayoutDetails}
            onClose={() => setShowPayoutDetails(false)}
            payout={selectedPayout}
          />

          <PayoutBreakdownModal
            open={showPayoutBreakdown}
            onClose={() => setShowPayoutBreakdown(false)}
            payout={selectedPayout}
          />
        </>
      )}

      <ProcessPayoutsModal
        open={showProcessPayouts}
        onClose={() => setShowProcessPayouts(false)}
        onProcessed={() => {
          fetchPayouts();
          fetchDashboardStats();
        }}
      />

      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        type={modalType}
        initialFilters={
          modalType === "payment" ? paymentFilters : payoutFilters
        }
        onApply={(next) => applyFilters(modalType, next)}
      />

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        type={modalType}
        onExport={handleExport}
      />
    </div>
  );
}
