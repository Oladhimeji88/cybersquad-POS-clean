import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Store,
  Loader2,
  ClipboardList,
  Clock,
  CheckCircle2,
  FileEdit,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreVertical,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { JobDetailsModal } from "./JobDetailsModal";

const ALL_STORE_STATUSES =
  "registered,awaiting_diagnosis_fee,awaiting_assignment,awaiting_reassignment," +
  "diagnosing,repeat_case_validation_pending,warranty_validation_pending,warranty_validated," +
  "quote_sent,quote_accepted,awaiting_payment,payment_confirmed,repair_in_progress,repaired," +
  "submitted_for_qc_review,qc_passed,ready_for_collection,delivered,closed,cancelled";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "registered,awaiting_diagnosis_fee,awaiting_assignment,awaiting_reassignment", label: "Draft / Intake" },
  { value: "diagnosing,quote_sent,quote_accepted,awaiting_payment,payment_confirmed,repair_in_progress,repaired,submitted_for_qc_review,qc_passed,repeat_case_validation_pending,warranty_validation_pending,warranty_validated", label: "In Progress" },
  { value: "ready_for_collection,delivered,closed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value ?? "-"}</p>
    </div>
  );
}

export function StoreDetailModal({ open, onOpenChange, store }) {
  const { api } = useApi();

  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobDetails, setShowJobDetails] = useState(false);

  useEffect(() => {
    if (!open || !store?.id) return;
    fetchStats();
  }, [open, store?.id]);

  useEffect(() => {
    if (!open || !store?.id) return;
    fetchJobs();
  }, [open, store?.id, page, pageSize, statusFilter]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await api.get(`/jobs/store/${store.id}/dashboard/stats/?range=30d`);
      if (res?.data?.success) setStatsData(res.data.result);
    } catch {
      // stats not critical — fail silently
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const statuses =
        statusFilter === "all" ? ALL_STORE_STATUSES : statusFilter;
      const res = await api.get(
        `/jobs/store/${store.id}/jobs/?status=${statuses}&page=${page}&page_size=${pageSize}`
      );
      const data = res?.data || {};
      setJobs(Array.isArray(data.result) ? data.result : []);
      setPagination(data.pagination || {});
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status) => {
    if (["delivered", "closed", "ready_for_collection"].includes(status))
      return "default";
    if (["cancelled"].includes(status)) return "destructive";
    if (["registered", "awaiting_diagnosis_fee", "awaiting_assignment", "awaiting_reassignment"].includes(status))
      return "secondary";
    return "outline";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <Store className="w-5 h-5 text-muted-foreground" />
              <div>
                <DialogTitle>{store.name}</DialogTitle>
                <DialogDescription>
                  {store.code} &middot; {store.city}, {store.country}
                  <Badge
                    className="ml-2"
                    variant={store.is_active ? "default" : "secondary"}
                  >
                    {store.is_active ? "Active" : "Inactive"}
                  </Badge>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
            <div className="space-y-6">
              {/* Stats */}
              {statsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    icon={ClipboardList}
                    label="Total (30d)"
                    value={
                      statsData
                        ? (statsData.active_jobs ?? 0) + (statsData.completed_count ?? 0)
                        : pagination.count
                    }
                    color="text-blue-500"
                  />
                  <StatCard
                    icon={Clock}
                    label="Active"
                    value={statsData?.active_jobs}
                    color="text-amber-500"
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="Completed"
                    value={statsData?.completed_count}
                    color="text-green-500"
                  />
                  <StatCard
                    icon={FileEdit}
                    label="Drafts"
                    value={statsData?.draft_count}
                    color="text-purple-500"
                  />
                </div>
              )}

              {/* Jobs Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-medium">Jobs</h4>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    )}
                    {!jobsLoading && jobs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No jobs found
                        </TableCell>
                      </TableRow>
                    )}
                    {!jobsLoading &&
                      jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {job.display_id || `#${job.id}`}
                          </TableCell>
                          <TableCell>
                            {job.customer?.name || job.customer_name || "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {[job.brand, job.model_name].filter(Boolean).join(" ") || job.device_type || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusColor(job.status)} className="capitalize text-xs">
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
                                <DropdownMenuItem
                                  onClick={() => { setSelectedJob(job); setShowJobDetails(true); }}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                {jobs.length > 0 && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={!pagination.previous}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page <span className="font-medium text-foreground">{pagination.page || page}</span>{" "}
                        of <span className="font-medium text-foreground">{pagination.pages || 1}</span>
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!pagination.next}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Show</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                      >
                        <SelectTrigger className="w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">entries</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <JobDetailsModal
        open={showJobDetails}
        onOpenChange={setShowJobDetails}
        job={selectedJob}
        onUpdated={fetchJobs}
      />
    </>
  );
}
