// components/SLAManagement.jsx
import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Search,
  Filter,
  Download,
  Clock,
  AlertTriangle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Eye,
  ShieldCheck,
  Zap,
  BarChart2,
  UserCheck,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { SLADetailsModal } from "./SLADetailsModal";
import { SLAConfigManagement } from "./SLAConfigManagement";
import { FilterModal } from "./FilterModal";
import { ExportModal } from "./ExportModal";
import { ExtendSLAModal } from "./ExtendSLAModal";
import { calculateTimeRemaining } from "../utils/timeFormat";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const FILTER_LABELS = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
};

const STATS_GRID_BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

const getStatsGridColumns = () => {
  if (typeof window === "undefined") return 1;
  if (window.innerWidth >= STATS_GRID_BREAKPOINTS.desktop) return 3;
  if (window.innerWidth >= STATS_GRID_BREAKPOINTS.tablet) return 2;
  return 1;
};

const formatSeconds = (s) => {
  if (!s && s !== 0) return "N/A";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

const formatDelta = (pct) => {
  if (pct === null || pct === undefined) return null;
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
};

const formatDay = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
};

const formatStageName = (stage) =>
  stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatExtensionReason = (key) =>
  key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function SLAManagement() {
  const { api } = useApi();
  const [activeSlaTab, setActiveSlaTab] = useState("live");

  // ── Dashboard Stats State ──────────────────────────────────
  const [statsRange, setStatsRange] = useState("week");
  const [dashStats, setDashStats] = useState(null);
  const [dashStatsLoading, setDashStatsLoading] = useState(false);
  const [statsGridColumns, setStatsGridColumns] = useState(getStatsGridColumns);

  // ── Table State ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExtendSLA, setShowExtendSLA] = useState(false);

  const [slaData, setSlaData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    count: 0,
    pages: 1,
  });

  const [filters, setFilters] = useState({
    type: "all",
    stage: "all",
    sla_status: "all",
    dateFrom: null,
    dateTo: null,
  });

  // ── Fetch Dashboard Stats ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setDashStatsLoading(true);
      try {
        const res = await api.get(
          `/sla/admin/dashboard/stats/?range=${statsRange}`,
        );
        if (!cancelled) setDashStats(res?.data?.result || null);
      } catch (e) {
        console.error("Error fetching SLA stats:", e);
      } finally {
        if (!cancelled) setDashStatsLoading(false);
      }
    };
    fetch();
    return () => {
      cancelled = true;
    };
  }, [statsRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleResize = () => {
      setStatsGridColumns(getStatsGridColumns());
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Fetch Table Data ───────────────────────────────────────
  const fetchSLAData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: pagination.pageSize,
      });
      if (searchQuery) params.append("search", searchQuery);
      if (filters.type !== "all") params.append("type", filters.type);
      if (filters.stage !== "all") params.append("stage", filters.stage);
      if (filters.sla_status !== "all")
        params.append("sla_status", filters.sla_status);
      if (filters.dateFrom)
        params.append("deadline_after", filters.dateFrom.toISOString());
      if (filters.dateTo)
        params.append("deadline_before", filters.dateTo.toISOString());

      const response = await api.get(`/sla/admin/overview/?${params}`);
      if (response.data.success) {
        setSlaData(response.data.result || []);
        setPagination((prev) => ({
          ...prev,
          count: response.data.pagination.count,
          pages: response.data.pagination.pages,
        }));
      }
    } catch (error) {
      console.error("Error fetching SLA data:", error);
      toast.error("Failed to load SLA data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSLAData();
  }, [pagination.page, pagination.pageSize, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const delay = setTimeout(() => {
      if (pagination.page === 1) fetchSLAData();
      else setPagination((prev) => ({ ...prev, page: 1 }));
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived display values ─────────────────────────────────
  const s = dashStats?.stats;
  const d = dashStats?.deltas;

  const topStatCards = s
    ? [
        {
          label: "Total SLAs",
          value: s.total_slas,
          delta: formatDelta(d?.total_slas_change_pct),
          icon: ShieldCheck,
          iconColor: "#8b5cf6",
          positive: true,
        },
        {
          label: "Avg Adherence Rate",
          value:
            s.avg_adherence_rate != null
              ? `${s.avg_adherence_rate.toFixed(1)}%`
              : "N/A",
          delta: null,
          icon: TrendingUp,
          iconColor: "#00A63E",
          positive: true,
        },
        {
          label: "Active Stage Breaches",
          value: s.breached_active_stage,
          delta: formatDelta(d?.breached_active_stage_change_pct),
          icon: AlertTriangle,
          iconColor: "#E7000B",
          positive: false,
        },
        {
          label: "Avg Response Time",
          value: formatSeconds(s.avg_response_time_seconds),
          delta: null,
          icon: Zap,
          iconColor: "#D08700",
          positive: null,
        },
        {
          label: "Total Extensions",
          value: s.total_extensions,
          delta: formatDelta(d?.extensions_change_pct),
          icon: Clock,
          iconColor: "#6366f1",
          positive: false,
        },
        {
          label: "Breach Rate",
          value: s.breach_rate != null ? `${s.breach_rate.toFixed(1)}%` : "N/A",
          delta: null,
          icon: BarChart2,
          iconColor: "#E7000B",
          positive: false,
        },
      ]
    : [];

  const volumeChartData =
    dashStats?.sla_volume?.map((d) => ({
      day: formatDay(d.day),
      count: d.count,
    })) || [];

  const problematicStages = dashStats?.most_problematic_stages || [];

  const extensionReasons = dashStats?.extension_reasons
    ? Object.entries(dashStats.extension_reasons).map(([key, count]) => ({
        reason: formatExtensionReason(key),
        count,
      }))
    : [];

  const topPerformers = dashStats?.top_performers || [];

  // ── Badge helpers ──────────────────────────────────────────
  const getSLAStatusBadge = (status) => {
    switch (status) {
      case "On Track":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-600 border-green-200 rounded-full px-4 py-0.5 text-[11px] font-medium"
          >
            On Track
          </Badge>
        );
      case "At Risk":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-600 border-yellow-200 rounded-full px-4 py-0.5 text-[11px] font-medium"
          >
            At Risk
          </Badge>
        );
      case "Breached":
        return (
          <Badge
            variant="destructive"
            className="bg-red-500 text-white border-none rounded-full px-4 py-0.5 text-[11px] font-medium uppercase"
          >
            Breached
          </Badge>
        );
      default:
        return (
          <Badge
            variant="secondary"
            className="rounded-full px-4 py-0.5 text-[11px]"
          >
            {status}
          </Badge>
        );
    }
  };

  const getStageBadge = (stage) => {
    const stageMap = {
      offers_sent: { label: "Offers Sent", color: "purple" },
      offer_confirmed: { label: "Offer Confirmed", color: "purple" },
      awaiting_shipping_fee: { label: "Awaiting Shipping Fee", color: "blue" },
      ready_to_schedule: { label: "Ready To Schedule", color: "blue" },
      pickup_scheduled: { label: "Pickup Scheduled", color: "blue" },
      technician_en_route: { label: "En Route", color: "blue" },
      technician_arrived: { label: "Arrived", color: "blue" },
      picked_up: { label: "Picked Up", color: "pink" },
      diagnosing: { label: "Diagnosing", color: "pink" },
      quote_sent: { label: "Quote Sent", color: "pink" },
      quote_accepted: { label: "Quote Accepted", color: "pink" },
      awaiting_service_fee: { label: "Awaiting Service Fee", color: "pink" },
      service_fee_paid: { label: "Service Fee Paid", color: "pink" },
      repair_in_progress: { label: "Repair In Progress", color: "pink" },
      repaired: { label: "Repaired", color: "green" },
      delivered: { label: "Delivered", color: "green" },
      closed: { label: "Closed", color: "slate" },
    };
    const stageInfo = stageMap[stage?.toLowerCase()] || {
      label: stage,
      color: "slate",
    };
    const colorClasses = {
      purple: "bg-purple-50 text-purple-600 border-purple-100",
      blue: "bg-blue-50 text-blue-600 border-blue-100",
      pink: "bg-pink-50 text-pink-600 border-pink-100",
      green: "bg-green-50 text-green-600 border-green-100",
      slate: "bg-slate-50 text-slate-600 border-slate-100",
    };
    return (
      <Badge
        variant="outline"
        className={`${colorClasses[stageInfo.color]} rounded-full px-4 py-0.5 font-normal text-[11px]`}
      >
        {stageInfo.label}
      </Badge>
    );
  };

  const getTimeRemainingDisplay = (deadlineAt) => {
    if (!deadlineAt) return <span className="text-slate-400 text-xs">N/A</span>;
    const timeInfo = calculateTimeRemaining(deadlineAt);
    if (!timeInfo) return <span className="text-slate-400 text-xs">N/A</span>;
    return (
      <div className="flex items-center gap-2 text-xs">
        <Clock
          className={`h-4 w-4 ${timeInfo.isOverdue ? "text-red-500" : "text-slate-400"}`}
        />
        <span
          className={
            timeInfo.isOverdue ? "text-red-500 font-semibold" : "text-slate-600"
          }
        >
          {timeInfo.display}
        </span>
      </div>
    );
  };

  const handleViewDetails = (job) => {
    setSelectedJob(job);
    setShowDetails(true);
  };
  const handleExtendSLA = (job) => {
    setSelectedJob(job);
    setShowExtendSLA(true);
  };
  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  return (
    <div className="space-y-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            SLA Management
          </h1>
          <p className="text-slate-500 text-sm">
            Track and manage service level agreement timelines
          </p>
        </div>
        {activeSlaTab === "live" && (
          <Select value={statsRange} onValueChange={setStatsRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
        <Button
          type="button"
          variant={activeSlaTab === "live" ? "default" : "ghost"}
          size="sm"
          className={activeSlaTab === "live" ? "bg-purple-600 hover:bg-purple-700" : ""}
          onClick={() => setActiveSlaTab("live")}
        >
          Live SLAs
        </Button>
        <Button
          type="button"
          variant={activeSlaTab === "policies" ? "default" : "ghost"}
          size="sm"
          className={activeSlaTab === "policies" ? "bg-purple-600 hover:bg-purple-700" : ""}
          onClick={() => setActiveSlaTab("policies")}
        >
          SLA Policies
        </Button>
      </div>

      {activeSlaTab === "policies" ? (
        <SLAConfigManagement />
      ) : (
        <>

      {/* ── Stats Section ── */}
      {dashStatsLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : dashStats ? (
        <>
          {/* Top stat cards */}
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${statsGridColumns}, minmax(0, 1fr))`,
            }}
          >
            {topStatCards.map((card) => (
              <Card
                key={card.label}
                className="shadow-none border-slate-200 rounded-lg"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <card.icon
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: card.iconColor }}
                    />
                    <span className="text-xs text-slate-500 leading-tight">
                      {card.label}
                    </span>
                  </div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {card.value}
                  </div>
                  {card.delta && (
                    <p className="text-xs mt-1">
                      <span
                        className={
                          card.positive === false
                            ? card.delta.startsWith("+")
                              ? "text-red-500"
                              : "text-green-600"
                            : card.delta.startsWith("+")
                              ? "text-green-600"
                              : "text-red-500"
                        }
                      >
                        {card.delta}
                      </span>
                      <span className="text-slate-400"> vs prev</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* SLA Volume Chart */}
            <Card className="shadow-none border-slate-200 rounded-lg md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">
                  SLA Volume
                </CardTitle>
                <CardDescription className="text-xs">
                  Daily SLAs — {FILTER_LABELS[statsRange]}
                  {dashStats.volume_change_pct !== undefined && (
                    <span
                      className={`ml-2 font-medium ${dashStats.volume_change_pct >= 0 ? "text-green-600" : "text-red-500"}`}
                    >
                      {formatDelta(dashStats.volume_change_pct)} vs prev period
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={volumeChartData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                      cursor={{ fill: "#f8fafc" }}
                    />
                    <Bar
                      dataKey="count"
                      name="SLAs"
                      fill="#8b5cf6"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Extension Reasons */}
            <Card className="shadow-none border-slate-200 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">
                  Extension Reasons
                </CardTitle>
                <CardDescription className="text-xs">
                  {s.total_extensions} total — {s.technician_extensions}{" "}
                  technician / {s.admin_extensions} admin
                </CardDescription>
              </CardHeader>
              <CardContent>
                {extensionReasons.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No extensions recorded
                  </p>
                ) : (
                  <div className="space-y-4 mt-1">
                    {extensionReasons.map((r) => (
                      <div
                        key={r.reason}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs text-slate-600 leading-tight max-w-[160px]">
                          {r.reason}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold rounded-full px-2"
                        >
                          {r.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom row */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Most Problematic Stages */}
            <Card className="shadow-none border-slate-200 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">
                  Most Problematic Stages
                </CardTitle>
                <CardDescription className="text-xs">
                  Stages ranked by lowest adherence
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left text-slate-400 font-medium px-6 py-2">
                        Stage
                      </th>
                      <th className="text-center text-slate-400 font-medium px-4 py-2">
                        Overdue
                      </th>
                      <th className="text-center text-slate-400 font-medium px-4 py-2">
                        On Time
                      </th>
                      <th className="text-right text-slate-400 font-medium px-6 py-2">
                        Adherence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {problematicStages.map((stage, i) => (
                      <tr
                        key={stage.stage}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40"
                      >
                        <td className="px-6 py-2 font-medium text-slate-700">
                          {formatStageName(stage.stage)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {stage.overdue > 0 ? (
                            <span className="text-red-500 font-semibold">
                              {stage.overdue}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-green-600">
                            {stage.on_time}
                          </span>
                        </td>
                        <td className="px-6 py-2 text-right">
                          <span
                            className={`font-semibold ${stage.adherence_rate === 100 ? "text-green-600" : stage.adherence_rate === 0 ? "text-red-500" : "text-yellow-600"}`}
                          >
                            {stage.adherence_rate.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Top Performers */}
            <Card className="shadow-none border-slate-200 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">
                  Top Performers
                </CardTitle>
                <CardDescription className="text-xs">
                  Technicians ranked by SLA adherence
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topPerformers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No performance data available
                  </p>
                ) : (
                  <div className="space-y-4">
                    {topPerformers.map((tech, i) => {
                      const adherence = (tech.sla_adherence_rate * 100).toFixed(
                        1,
                      );
                      return (
                        <div
                          key={tech.technician_id}
                          className="flex items-center gap-4"
                        >
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <UserCheck className="h-4 w-4 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700">
                              Technician #{tech.technician_id}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-purple-500"
                                  style={{ width: `${adherence}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {adherence}%
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {tech.sla_breach_count > 0 ? (
                              <span className="text-[11px] text-red-500">
                                {tech.sla_breach_count} breach
                                {tech.sla_breach_count > 1 ? "es" : ""}
                              </span>
                            ) : (
                              <span className="text-[11px] text-green-600">
                                No breaches
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {/* ── Active Job SLA Table ── */}
      <Card className="shadow-none border-slate-200 rounded-lg overflow-hidden">
        <CardHeader
          className="flex flex-row items-start justify-between pb-6 pt-6"
          style={{ paddingLeft: "24px", paddingRight: "24px" }}
        >
          <div className="space-y-1">
            <CardTitle className="text-base font-medium text-slate-900">
              Active Job SLA
            </CardTitle>
            <CardDescription className="text-slate-500 text-xs">
              Real-time tracking of job timelines and status
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SLA..."
                className="pl-8 w-[250px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg border-slate-200 bg-white"
              onClick={() => setShowFilterModal(true)}
            >
              <Filter className="h-4 w-4 text-slate-500" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg border-slate-200 bg-white"
              onClick={() => setShowExportModal(true)}
            >
              <Download className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-200">
                <TableHead
                  style={{ paddingLeft: "24px" }}
                  className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider"
                >
                  SLA ID
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  Type
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  Job
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  Stage
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  Time Remaining
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  SLA Status
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs h-10 uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-slate-500">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : slaData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-sm text-slate-500">No SLA data found</p>
                  </TableCell>
                </TableRow>
              ) : (
                slaData.map((item) => (
                  <TableRow
                    key={item.sla_id}
                    className="border-slate-100 hover:bg-slate-50/30"
                  >
                    <TableCell style={{ paddingLeft: "24px" }} className="py-4">
                      <span className="font-semibold text-slate-700 text-xs">
                        {item.sla_id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-slate-50/50 text-slate-600 border-slate-200 rounded-md font-normal text-[10px] px-2 py-0.5"
                      >
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs font-medium">
                      {item.job}
                    </TableCell>
                    <TableCell>{getStageBadge(item.stage)}</TableCell>
                    <TableCell>
                      {getTimeRemainingDisplay(item.deadline_at)}
                    </TableCell>
                    <TableCell>{getSLAStatusBadge(item.sla_status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-purple-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExtendSLA(item);
                          }}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-purple-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(item);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div
            className="flex items-center justify-between border-t border-slate-100"
            style={{
              paddingLeft: "24px",
              paddingRight: "24px",
              paddingTop: "16px",
              paddingBottom: "16px",
            }}
          >
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-slate-200 disabled:opacity-30"
                disabled={pagination.page === 1}
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
              >
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </Button>
              <div className="text-xs text-slate-500">
                Page{" "}
                <span className="text-slate-900 font-medium">
                  {pagination.page}
                </span>{" "}
                of{" "}
                <span className="text-slate-900 font-medium">
                  {pagination.pages || 1}
                </span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-slate-200"
                disabled={pagination.page >= pagination.pages}
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Show</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(v) =>
                  setPagination((prev) => ({
                    ...prev,
                    pageSize: Number(v),
                    page: 1,
                  }))
                }
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
              <span className="text-xs text-slate-400">entries</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {selectedJob && (
        <>
          <SLADetailsModal
            open={showDetails}
            onClose={() => {
              setShowDetails(false);
              fetchSLAData();
            }}
            jobId={selectedJob.job.split(" / ")[0]}
          />
          <ExtendSLAModal
            open={showExtendSLA}
            onClose={() => {
              setShowExtendSLA(false);
              fetchSLAData();
            }}
            jobId={selectedJob.job.split(" / ")[0]}
            slaId={selectedJob.sla_id}
            currentStage={selectedJob.stage}
            timeRemaining={
              selectedJob.deadline_at
                ? calculateTimeRemaining(selectedJob.deadline_at)?.display
                : "N/A"
            }
            slaStatus={selectedJob.sla_status}
          />
        </>
      )}

      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        type="sla"
        initialFilters={filters}
        onApply={handleApplyFilters}
      />
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        type="sla"
      />
        </>
      )}
    </div>
  );
}
