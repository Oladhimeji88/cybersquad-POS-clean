import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

import { useState, useEffect, useMemo } from "react";
import {
  MapPin,
  Calendar,
  DollarSign,
  Briefcase,
  Clock,
  AlertCircle,
  Package,
  Loader2,
  Smartphone,
  FileText,
  Wrench,
  Box,
  Store,
  Tag,
  Link as LinkIcon,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import JobLocationPanel from "./tracking/JobLocationPanel";
import { toast } from "sonner";

const MEDIA_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://backend.staging.cybersquadapp.com";

function toAbsoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${MEDIA_BASE_URL}${path}`;
}

const prettyStatus = (s) => (s ? s.replace(/_/g, " ") : "-");

const formatPartLabel = (part) => {
  if (part === null || part === undefined) return "-";
  if (typeof part === "string" || typeof part === "number") return String(part);
  if (typeof part !== "object") return String(part);

  const name =
    part.part?.name ||
    part.part_name ||
    part.name ||
    part.sku ||
    part.code ||
    "Part";
  const qty =
    part.qty ??
    part.quantity ??
    part.units ??
    part.count;

  return qty !== null && qty !== undefined && qty !== ""
    ? `${name} x${qty}`
    : String(name);
};

export function JobDetailsModal({
  open,
  onOpenChange,
  job: initialJob,
  onUpdated,
}) {
  const { api } = useApi();

  // Full job details
  const [jobDetails, setJobDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // Job status timeline
  const [statusHistory, setStatusHistory] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // technicians list
  const [availableTechnicians, setAvailableTechnicians] = useState([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);

  // REASSIGN (single select)
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [reassigning, setReassigning] = useState(false);

  // OFFER (multi select)
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState([]);
  const [offering, setOffering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Backend requires a non-blank `note` when moving a job to cancelled.
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Fetch full job details
  const fetchJobDetails = async (jobId) => {
    if (!jobId) return;

    setLoadingDetails(true);
    setDetailsError(null);

    try {
      const res = await api.get(`/jobs/${jobId}/`);
      const data = res?.data?.result || res?.data?.data || null;
      setJobDetails(data);
    } catch (e) {
      console.error("Error fetching job details:", e);
      setDetailsError("Failed to load complete job details");
      toast.error("Failed to load job details");
    } finally {
      setLoadingDetails(false);
    }
  };

  // Fetch job status timeline
  const fetchStatusTimeline = async (jobId) => {
    if (!jobId) return;

    setLoadingTimeline(true);

    try {
      const res = await api.get(`/jobs/${jobId}/status/`);
      const data = res?.data?.result || res?.data?.data || {};
      setStatusHistory(Array.isArray(data.history) ? data.history : []);
    } catch (e) {
      console.error("Error fetching status timeline:", e);
      setStatusHistory([]);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    if (open && initialJob?.id) {
      fetchJobDetails(initialJob.id);
      fetchStatusTimeline(initialJob.id);
      fetchAvailableTechnicians();
      setSelectedTechnicianIds([]);
      setSelectedTechnician("");
      setShowCancelForm(false);
      setCancelReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialJob?.id]);

  const fetchAvailableTechnicians = async () => {
    setLoadingTechnicians(true);
    try {
      const res = await api.get(
        "/users/profile/technicians/?document_verified=true&page=1&page_size=50",
      );
      const data = res?.data || {};
      setAvailableTechnicians(Array.isArray(data.result) ? data.result : []);
    } catch (e) {
      console.error("Error fetching technicians:", e);
      toast.error("Failed to load technicians");
      setAvailableTechnicians([]);
    } finally {
      setLoadingTechnicians(false);
    }
  };

  // Use jobDetails if available, fallback to initialJob
  const job = jobDetails || initialJob;

  // Memoized values
  const customerAvatarUrl = useMemo(
    () => toAbsoluteUrl(job?.customer?.avatar_url),
    [job],
  );
  const technicianAvatarUrl = useMemo(
    () => toAbsoluteUrl(job?.technician?.avatar_url),
    [job],
  );

  // Why was this job cancelled? `/jobs/<id>/` (JobDetailSerializer) does not
  // expose the cancellation fields, so prefer the admin bookings row we were
  // opened from (JobAdminListSerializer does) and fall back to the status
  // history note, which is where the reason lives for older jobs.
  const cancellation = useMemo(() => {
    if (String(job?.status || "") !== "cancelled") return null;

    const cancelEntry = [...statusHistory]
      .reverse()
      .find((entry) => String(entry.to_status || "") === "cancelled");

    const reason =
      jobDetails?.cancellation_reason ||
      initialJob?.cancellation_reason ||
      cancelEntry?.note ||
      "";

    return {
      reason,
      at:
        jobDetails?.cancelled_at ||
        initialJob?.cancelled_at ||
        cancelEntry?.timestamp ||
        null,
      by:
        jobDetails?.cancelled_by_name ||
        initialJob?.cancelled_by_name ||
        cancelEntry?.changed_by ||
        null,
    };
  }, [job?.status, jobDetails, initialJob, statusHistory]);

  const diagnosisMedia = useMemo(() => {
    if (!job?.assessment?.media) return [];
    return job.assessment.media.filter((m) => m.kind === "diagnosis");
  }, [job]);

  const intakeMedia = useMemo(() => {
    if (!job?.media) return [];
    return job.media.filter((m) =>
      ["image", "damage", "intake"].includes(String(m.kind || "").toLowerCase()),
    );
  }, [job]);

  const repairMedia = useMemo(() => {
    if (!job?.repair?.current_state) return [];
    return job.repair.current_state;
  }, [job]);

  if (!job) return null;

  // Derived flags
  const isJobFinished =
    job?.status === "completed" ||
    job?.status === "delivered" ||
    job?.status === "cancelled" ||
    Boolean(job?.is_completed);

  const ACTIVE_STATUSES = [
    "awaiting_shipping_fee",
    "pickup_scheduled",
    "picked_up",
    "diagnosing",
    "quote_sent",
    "quote_accepted",
    "awaiting_service_fee",
    "service_fee_paid",
    "repair_in_progress",
    "repaired",
  ];

  const isActiveBooking =
    !isJobFinished && ACTIVE_STATUSES.includes(job?.status);
  const canReassignTechnician =
    isActiveBooking && Boolean(job?.technician?.name || job?.technician_name);
  const canOfferTechnicians =
    !isJobFinished && !job?.technician?.name && !job?.technician_name;
  const canCancelBooking = !isJobFinished;

  // Helpers
  const getStatusColor = (status) => {
    switch (status) {
      case "delivered":
      case "completed":
        return "bg-success text-white";
      case "cancelled":
      case "quote_rejected":
        return "bg-error text-white";
      case "repair_in_progress":
      case "repaired":
        return "bg-purple-600 text-white";
      case "offers_sent":
      case "quote_sent":
        return "bg-amber-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getLifecycleColor = (stage) => {
    switch (stage) {
      case "completed":
        return "bg-success text-white";
      case "started":
        return "bg-blue-600 text-white";
      case "not_started":
        return "bg-gray-500 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAmount = (amount, currency = "NGN") => {
    if (amount === null || amount === undefined || amount === "") return "-";
    const symbol = currency === "NGN" ? "₦" : currency;
    return `${symbol}${parseFloat(amount).toLocaleString()}`;
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getTechId = (tech) => String(tech?.profile?.id ?? tech?.id ?? "");
  const getTechName = (tech) =>
    tech?.profile?.full_name ||
    tech?.first_name ||
    `Technician #${getTechId(tech)}`;
  const getTechRating = (tech) => tech?.profile?.rating ?? "0.00";

  const toggleTechnician = (techId, checked) => {
    if (!techId) return;
    setSelectedTechnicianIds((prev) => {
      const exists = prev.includes(techId);
      if (checked === true) return exists ? prev : [...prev, techId];
      if (checked === false)
        return exists ? prev.filter((id) => id !== techId) : prev;
      return exists ? prev.filter((id) => id !== techId) : [...prev, techId];
    });
  };

  const openMedia = (path) => {
    const url = toAbsoluteUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Actions
  const handleReassignTechnician = async () => {
    if (!job?.id) return;
    const technicianId = Number(selectedTechnician);
    if (!Number.isFinite(technicianId)) {
      toast.error("Please select a technician");
      return;
    }

    setReassigning(true);
    try {
      await api.post(`/jobs/${job.id}/admin/assign-manual/`, {
        technician_id: technicianId,
        force: true,
      });
      toast.success("Technician reassigned successfully");
      onUpdated?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Error reassigning technician:", e);
      toast.error("Failed to reassign technician");
    } finally {
      setReassigning(false);
    }
  };

  const handleOfferToTechnicians = async () => {
    if (!job?.id) return;
    const technicianIds = selectedTechnicianIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));

    if (technicianIds.length === 0) {
      toast.error("Please select at least one technician");
      return;
    }

    setOffering(true);
    try {
      await api.post("/jobs/offers/bulk/", {
        job_id: job.id,
        technician_ids: technicianIds,
      });
      toast.success("Offer sent to selected technicians");
      onUpdated?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Error offering job to technicians:", e);
      toast.error("Failed to send offers");
    } finally {
      setOffering(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!job?.id) return;

    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Please provide a reason for cancelling this booking");
      return;
    }

    setCancelling(true);
    try {
      await api.post(`/jobs/${job.id}/status/update/`, {
        status: "cancelled",
        note: reason,
      });
      toast.success("Booking cancelled successfully");
      setShowCancelForm(false);
      setCancelReason("");
      onUpdated?.();
      onOpenChange(false);
    } catch (e) {
      console.error("Error cancelling booking:", e);
      const data = e?.response?.data;
      toast.error(
        data?.error?.fields?.note?.[0] ||
          data?.error?.message ||
          data?.message ||
          "Failed to cancel booking",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>Job Details</DialogTitle>
              <DialogDescription>
                Complete job information and booking details
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : detailsError ? (
          <div className="text-center py-8 text-red-500">
            <p>{detailsError}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
            <div className="space-y-6">
              {/* Job Header */}
              <div>
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-xs font-mono">
                    {job.display_id || `#${job.id}`}
                  </span>
                  {job.external_id && job.external_id !== job.display_id && (
                    <span className="text-xs text-muted-foreground/60">({job.external_id})</span>
                  )}
                </div>

                <h3 className="font-semibold text-lg">
                  {job.title || "Untitled Job"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {job.description || "-"}
                </p>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">
                    {job.service_type || job.device_type}
                  </Badge>

                  <Badge className={getLifecycleColor(job.lifecycle_stage)}>
                    {job.lifecycle_stage?.replace(/_/g, " ")}
                  </Badge>

                  <Badge className={getStatusColor(job.status)}>
                    {job.status?.replace(/_/g, " ")}
                  </Badge>

                  {job.is_warranty_claim && (
                    <Badge className="bg-amber-500 text-white">
                      Warranty Claim
                    </Badge>
                  )}

                  {job.is_repeat_case && (
                    <Badge className="bg-orange-500 text-white">
                      Repeat Case
                    </Badge>
                  )}

                  {job.has_open_dispute && (
                    <Badge className="bg-red-600 text-white">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Dispute Open
                    </Badge>
                  )}
                </div>
              </div>

              {cancellation && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Cancellation Reason
                  </div>
                  <p className="text-sm text-foreground">
                    {cancellation.reason || "No reason was recorded."}
                  </p>
                  {(cancellation.by || cancellation.at) && (
                    <p className="text-xs text-muted-foreground">
                      {cancellation.by ? `Cancelled by ${cancellation.by}` : "Cancelled"}
                      {cancellation.at ? ` on ${formatDate(cancellation.at)}` : ""}
                    </p>
                  )}
                </div>
              )}

              <Separator />

              {/* Job Classification */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Job Classification
                </h4>

                <div className="grid gap-2 md:grid-cols-2 p-4 border rounded-lg bg-muted/30">
                  {job.source_channel && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Source:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.source_channel.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.workflow_type && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Workflow:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.workflow_type.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.job_group_type && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Job Type:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.job_group_type.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.job_relation_type && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Relation:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.job_relation_type.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.payment_profile && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Payment Profile:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.payment_profile.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.assignment_mode && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Assignment Mode:</span>
                      <span className="ml-2 font-medium capitalize">
                        {job.assignment_mode.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {job.service && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Service:</span>
                      <span className="ml-2 font-medium">
                        {job.service.name}
                        {job.service.code && (
                          <span className="text-muted-foreground ml-1">({job.service.code})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {job.store && (
                    <div className="text-sm flex items-center gap-1">
                      <span className="text-muted-foreground">Store:</span>
                      <Store className="h-4 w-4 ml-2 text-muted-foreground" />
                      <span className="ml-1 font-medium">
                        {job.store.name}
                        {job.store.code && (
                          <span className="text-muted-foreground ml-1">({job.store.code})</span>
                        )}
                      </span>
                    </div>
                  )}

                  {job.parent_job && (
                    <div className="text-sm flex items-center gap-1">
                      <span className="text-muted-foreground">Parent Job:</span>
                      <LinkIcon className="h-4 w-4 ml-2 text-muted-foreground" />
                      <span className="ml-1 font-medium font-mono">
                        #{job.parent_job}
                      </span>
                    </div>
                  )}

                  {job.service_sla_hours && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">SLA:</span>
                      <span className="ml-2 font-medium">{job.service_sla_hours}h</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Open Dispute Warning */}
              {job.has_open_dispute && (
                <>
                  <div className="p-4 border-2 border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                    <div className="flex items-start gap-4">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-red-900 dark:text-red-100">
                          Open Dispute
                        </h4>
                        <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                          This job has an active dispute that requires
                          attention. Please review and take necessary action.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* Device Information */}
              {(job.brand || job.model_name || job.serial_imei) && (
                <>
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      Device Information
                    </h4>

                    <div className="grid gap-4 md:grid-cols-2">
                      {job.brand && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Brand:</span>
                          <span className="ml-2 font-medium">{job.brand}</span>
                        </div>
                      )}
                      {job.model_name && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Model:</span>
                          <span className="ml-2 font-medium">
                            {job.model_name}
                          </span>
                        </div>
                      )}
                      {job.serial_imei && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">
                            Serial/IMEI:
                          </span>
                          <span className="ml-2 font-medium">
                            {job.serial_imei}
                          </span>
                        </div>
                      )}
                      {job.os_name && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">OS:</span>
                          <span className="ml-2 font-medium">
                            {job.os_name} {job.os_version}
                          </span>
                        </div>
                      )}
                      {job.color && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Color:</span>
                          <span className="ml-2 font-medium">{job.color}</span>
                        </div>
                      )}
                      {job.storage && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">
                            Storage:
                          </span>
                          <span className="ml-2 font-medium">
                            {job.storage}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {intakeMedia.length > 0 && (
                <>
                  <div className="space-y-4">
                    <h4 className="font-medium">Customer Uploaded Images</h4>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {intakeMedia.map((media) => (
                        <div
                          key={media.id}
                          className="relative aspect-square rounded-lg border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => openMedia(media.file)}
                        >
                          <img
                            src={toAbsoluteUrl(media.file)}
                            alt={media.caption || "Customer upload"}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                            {media.caption || "Image"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* Customer Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Customer Information</h4>

                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <Avatar className="w-10 h-10">
                    {customerAvatarUrl ? (
                      <AvatarImage
                        src={customerAvatarUrl}
                        alt={job.customer?.name || job.customer_name}
                      />
                    ) : null}
                    <AvatarFallback className="bg-blue-100 text-blue-600">
                      {getInitials(job.customer?.name || job.customer_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <p className="font-medium">
                      {job.customer?.name || job.customer_name || "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.customer?.email || job.customer_email || "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.customer?.phone_number || "-"}
                    </p>

                    {job.customer_rating !== null &&
                      job.customer_rating !== undefined && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Rating: ⭐ {job.customer_rating}/5
                        </p>
                      )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Assessment/Diagnosis */}
              {job.assessment && (
                <>
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Assessment & Diagnosis
                    </h4>

                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                      {job.assessment.preliminary_diagnosis && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Preliminary Diagnosis
                          </Label>
                          <p className="text-sm mt-1">
                            {job.assessment.preliminary_diagnosis}
                          </p>
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2">
                        {job.assessment.estimated_hours && (
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Estimated Hours
                            </Label>
                            <p className="text-sm mt-1">
                              {job.assessment.estimated_hours}h
                            </p>
                          </div>
                        )}
                        {job.assessment.quoted_amount !== null && (
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Quoted Amount
                            </Label>
                            <p className="text-sm mt-1">
                              {formatAmount(
                                job.assessment.quoted_amount,
                                job.assessment.currency,
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {job.assessment.parts_required &&
                        job.assessment.parts_required.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Parts Required
                            </Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {job.assessment.parts_required.map(
                                (part, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {formatPartLabel(part)}
                                  </Badge>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {diagnosisMedia.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Diagnosis Media
                          </Label>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {diagnosisMedia.map((media) => (
                              <div
                                key={media.id}
                                className="relative aspect-square rounded-lg border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => openMedia(media.file)}
                              >
                                <img
                                  src={toAbsoluteUrl(media.file)}
                                  alt={media.caption || "Diagnosis"}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                                  {media.caption || "Image"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* Repair Information */}
              {job.repair && repairMedia.length > 0 && (
                <>
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Repair Completion
                    </h4>

                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">
                          Proof of Completion
                        </Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {repairMedia.map((media) => (
                            <div
                              key={media.id}
                              className="relative aspect-square rounded-lg border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => openMedia(media.file)}
                            >
                              <img
                                src={toAbsoluteUrl(media.file)}
                                alt={media.caption || "Repair"}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                                {media.caption || "Repaired"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {job.repair.parts_used &&
                        job.repair.parts_used.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Parts Used
                            </Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {job.repair.parts_used.map((part, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  <Box className="h-4 w-4 mr-1" />
                                  {formatPartLabel(part)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* Technician Information */}
              {job.technician?.name || job.technician_name ? (
                <>
                  <div className="space-y-4">
                    <h4 className="font-medium">Assigned Technician</h4>

                    <div className="flex items-start gap-4 p-4 border rounded-lg">
                      <Avatar className="w-10 h-10">
                        {technicianAvatarUrl ? (
                          <AvatarImage
                            src={technicianAvatarUrl}
                            alt={job.technician?.name || job.technician_name}
                          />
                        ) : null}
                        <AvatarFallback className="bg-purple-100 text-purple-600">
                          {getInitials(
                            job.technician?.name || job.technician_name,
                          )}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <p className="font-medium">
                          {job.technician?.name || job.technician_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {job.technician?.email || job.technician_email || "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {job.technician?.phone_number || "-"}
                        </p>
                        {job.technician?.rating && (
                          <p className="text-sm mt-1">
                            ⭐ {job.technician.rating}/5
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {canReassignTechnician && (
                    <>
                      <div className="space-y-4">
                        <h4 className="font-medium">Reassign Technician</h4>

                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="technician-select">
                              Select Available Technician
                            </Label>

                            <Select
                              value={selectedTechnician}
                              onValueChange={setSelectedTechnician}
                              disabled={loadingTechnicians}
                            >
                              <SelectTrigger id="technician-select">
                                <SelectValue
                                  placeholder={
                                    loadingTechnicians
                                      ? "Loading..."
                                      : "Choose a technician"
                                  }
                                />
                              </SelectTrigger>

                              <SelectContent>
                                {availableTechnicians.map((tech) => {
                                  const techProfileId = String(
                                    tech?.profile?.id ?? "",
                                  );
                                  if (!techProfileId) return null;

                                  return (
                                    <SelectItem
                                      key={techProfileId}
                                      value={techProfileId}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>
                                          {tech?.profile?.full_name ||
                                            tech?.first_name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          ⭐ {tech?.profile?.rating || "0.00"}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            onClick={handleReassignTechnician}
                            disabled={reassigning || !selectedTechnician}
                          >
                            {reassigning
                              ? "Reassigning..."
                              : "Reassign Technician"}
                          </Button>
                        </div>
                      </div>

                      <Separator />
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="p-4 border border-amber-200 rounded-lg bg-amber-50 dark:bg-amber-950">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-sm font-medium">
                        No technician assigned yet
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {canOfferTechnicians && (
                    <>
                      <div className="space-y-4">
                        <h4 className="font-medium">
                          Offer Job to Technicians
                        </h4>

                        <div className="space-y-2">
                          <Label>Select one or more technicians</Label>

                          <div className="rounded-lg border p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                {selectedTechnicianIds.length} selected
                              </p>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedTechnicianIds([])}
                                disabled={selectedTechnicianIds.length === 0}
                              >
                                Clear
                              </Button>
                            </div>

                            {loadingTechnicians ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading technicians...
                              </div>
                            ) : availableTechnicians.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No technicians available
                              </p>
                            ) : (
                              <div className="max-h-56 overflow-auto pr-2 space-y-2">
                                {availableTechnicians.map((tech) => {
                                  const techId = getTechId(tech);
                                  const checked =
                                    selectedTechnicianIds.includes(techId);

                                  return (
                                    <label
                                      key={techId}
                                      className="flex items-start gap-4 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(v) =>
                                          toggleTechnician(techId, v)
                                        }
                                      />

                                      <div className="flex-1">
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-sm font-medium">
                                            {getTechName(tech)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            ⭐ {getTechRating(tech)}
                                          </span>
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <Separator />
                    </>
                  )}
                </>
              )}

              {/* Job Details */}
              <div className="space-y-4">
                <h4 className="font-medium">Job Information</h4>

                <div className="grid gap-4">
                  <div className="flex items-center gap-4 text-sm">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Service Quote:
                    </span>
                    <span className="font-medium">
                      {formatAmount(
                        job.service_quote_amount,
                        job.service_currency,
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Shipment Status:
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {job.shipment_status?.replace(/_/g, " ") || "-"}
                    </Badge>
                  </div>

                  {job.pickup_date && (
                    <div className="flex items-center gap-4 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Pickup Scheduled:
                      </span>
                      <span>
                        {job.pickup_date} {job.pickup_time || ""}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span>
                      {[job.address, job.city, job.state, job.country]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{formatDate(job.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span>{formatDate(job.updated_at)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Live technician location + route history */}
              <JobLocationPanel jobId={job.id} />

              <Separator />

              {/* Job Status Timeline */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Status Timeline
                </h4>

                {loadingTimeline ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No status history available
                  </p>
                ) : (
                  <div className="space-y-4">
                    {statusHistory.map((entry, idx) => {
                      const isLast = idx === statusHistory.length - 1;

                      return (
                        <div
                          key={idx}
                          className="grid grid-cols-[22px_1fr] gap-4"
                        >
                          {/* Left rail (dot + line) */}
                          <div className="relative flex flex-col items-center">
                            {/* <div className="mt-1 h-4 w-4 rounded-full bg-primary ring-4 ring-primary/15" /> */}
                            {!isLast && (
                              <div className="mt-2 w-px flex-1 bg-border" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="rounded-lg border bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="text-xs capitalize px-2 py-0.5"
                                  >
                                    {prettyStatus(entry.from_status)}
                                  </Badge>

                                  <span className="text-xs text-muted-foreground">
                                    →
                                  </span>

                                  <Badge className="text-xs capitalize px-2 py-0.5">
                                    {prettyStatus(entry.to_status)}
                                  </Badge>
                                </div>

                                {entry.changed_by && (
                                  <p className="text-xs text-muted-foreground">
                                    by {entry.changed_by} (
                                    {entry.role || "system"})
                                  </p>
                                )}

                                {entry.note && (
                                  <p className="text-xs text-muted-foreground italic">
                                    Note: {entry.note}
                                  </p>
                                )}
                              </div>

                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(entry.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cancellation reason — required by the backend on every cancel */}
              {canCancelBooking && showCancelForm && (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <Label htmlFor="cancel-reason">
                    Reason for cancellation{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Why is this booking being cancelled? e.g. customer requested a refund, parts unavailable, duplicate booking..."
                    rows={3}
                    maxLength={500}
                    disabled={cancelling}
                  />
                  <p className="text-xs text-muted-foreground">
                    This is saved on the job and shown to anyone reviewing the
                    record later. {cancelReason.trim().length}/500
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>

                {canCancelBooking && !showCancelForm && (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setShowCancelForm(true)}
                  >
                    Cancel Booking
                  </Button>
                )}

                {canCancelBooking && showCancelForm && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowCancelForm(false);
                        setCancelReason("");
                      }}
                      disabled={cancelling}
                    >
                      Keep Booking
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleCancelBooking}
                      disabled={cancelling || !cancelReason.trim()}
                    >
                      {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                    </Button>
                  </>
                )}

                {canOfferTechnicians && (
                  <Button
                    className="flex-1"
                    onClick={handleOfferToTechnicians}
                    disabled={offering || selectedTechnicianIds.length === 0}
                  >
                    {offering
                      ? "Sending Offers..."
                      : `Offer to ${selectedTechnicianIds.length || 0} Technician(s)`}
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
