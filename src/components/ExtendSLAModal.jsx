// components/ExtendSLAModal.jsx
import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Clock, AlertTriangle } from "lucide-react";
import { formatDuration } from "../utils/timeFormat";

export function ExtendSLAModal({
  open,
  onClose,
  jobId,
  slaId,
  currentStage,
  timeRemaining,
  slaStatus,
}) {
  const { api } = useApi();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stageDetails, setStageDetails] = useState(null);
  const [error, setError] = useState(null);
  const [extensionTime, setExtensionTime] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && jobId) {
      fetchStageDetails();
    } else {
      // Reset form when modal closes
      setExtensionTime("");
      setReason("");
      setNote("");
      setError(null);
    }
  }, [open, jobId]);

  const fetchStageDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/sla/jobs/${jobId}/stage_details/`);

      if (response.data.success) {
        setStageDetails(response.data.result);
      }
    } catch (error) {
      console.error("Error fetching stage details:", error);
      const errorMsg =
        error.response?.data?.error?.message ||
        "Failed to load extension options";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!extensionTime || !reason.trim()) {
      toast.error("Please select extension duration and provide a reason");
      return;
    }

    if (reason === "OTHER" && !note.trim()) {
      toast.error("Please provide additional notes for 'Other' reason");
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        requested_seconds: parseInt(extensionTime),
        reason_code: reason,
      };

      if (reason === "OTHER" && note.trim()) {
        payload.note = note.trim();
      }

      const response = await api.post(
        `/sla/jobs/${jobId}/extensions/`,
        payload,
      );

      if (response.data.success) {
        toast.success("SLA timeline extended successfully");
        onClose();
        // Reset form
        setExtensionTime("");
        setReason("");
        setNote("");
      }
    } catch (error) {
      console.error("Error extending SLA:", error);
      const errorMsg =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        "Failed to extend SLA timeline";
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Check if job is overdue/breached
  const isOverdue = slaStatus === "Breached" || timeRemaining === "Overdue";

  // Get extensions config - prioritize admin_extensions
  const extensions =
    stageDetails?.rule?.admin_extensions || stageDetails?.rule?.extensions;

  // Check if we have valid extension options
  const hasExtensionOptions =
    extensions?.options_seconds &&
    Array.isArray(extensions.options_seconds) &&
    extensions.options_seconds.length > 0;

  const hasReasonOptions =
    extensions?.reasons &&
    Array.isArray(extensions.reasons) &&
    extensions.reasons.length > 0;

  const canExtend =
    !isOverdue && hasExtensionOptions && hasReasonOptions && !error;
  const requiresNote = extensions?.other_requires_note && reason === "OTHER";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Extend SLA Timeline
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Add additional time to the SLA deadline for {slaId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea
          className="flex-1 overflow-y-auto pr-4"
          style={{ maxHeight: "calc(90vh - 200px)" }}
        >
          <div className="space-y-4">
            {/* Error Message */}
            {error && (
              <div
                style={{
                  borderRadius: "10px",
                  border: "0.8px solid #FCA5A5",
                  backgroundColor: "#FEF2F2",
                  padding: "12px",
                }}
              >
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <AlertTriangle
                      className="w-5 h-5"
                      style={{ color: "#DC2626" }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "#DC2626" }}
                    >
                      Error Loading Extension Options
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "#DC2626" }}
                    >
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Overdue Warning */}
            {isOverdue && (
              <div
                style={{
                  borderRadius: "10px",
                  border: "0.8px solid #FCA5A5",
                  backgroundColor: "#FEF2F2",
                  padding: "12px",
                }}
              >
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <AlertTriangle
                      className="w-5 h-5"
                      style={{ color: "#DC2626" }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "#DC2626" }}
                    >
                      SLA Already Breached
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "#DC2626" }}
                    >
                      This job has already exceeded its SLA deadline. Extensions
                      cannot be applied to overdue jobs. Please review the
                      timeline and take appropriate action.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* No Extension Available */}
            {!isOverdue &&
              !error &&
              (!hasExtensionOptions || !hasReasonOptions) && (
                <div
                  style={{
                    borderRadius: "10px",
                    border: "0.8px solid #FCD34D",
                    backgroundColor: "#FFFBEB",
                    padding: "12px",
                  }}
                >
                  <div className="flex gap-4">
                    <div className="mt-0.5">
                      <AlertTriangle
                        className="w-5 h-5"
                        style={{ color: "#D97706" }}
                      />
                    </div>
                    <div className="space-y-1">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "#D97706" }}
                      >
                        Extensions Not Available
                      </p>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "#D97706" }}
                      >
                        Extension options are not configured for this job stage.
                        Please contact support if you believe this is an error.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* Policy Notice */}
            {canExtend && (
              <div
                style={{
                  borderRadius: "10px",
                  border: "0.8px solid #BEDBFF",
                  backgroundColor: "#EFF6FF",
                  padding: "12px",
                }}
              >
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <Clock className="w-5 h-5" style={{ color: "#1447E6" }} />
                  </div>
                  <div className="space-y-1">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "#1447E6" }}
                    >
                      SLA Extension Policy
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "#1447E6" }}
                    >
                      Extensions should only be granted when circumstances
                      beyond normal processing require additional time. All
                      extensions are tracked and logged.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Job Details Summary */}
            <div
              style={{
                borderRadius: "10px",
                backgroundColor: "#F3F4F6",
                paddingTop: "12px",
                paddingRight: "12px",
                paddingBottom: "12px",
                paddingLeft: "12px",
              }}
            >
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">SLA ID:</span>
                  <span className="text-slate-900 font-medium">{slaId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Current Stage:</span>
                  <span className="text-slate-900 font-medium">
                    {currentStage
                      ?.split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Time Remaining:</span>
                  <span
                    className={`font-medium ${isOverdue ? "text-red-600" : "text-slate-900"}`}
                  >
                    {timeRemaining}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">SLA Status:</span>
                  <span
                    className={`font-medium ${isOverdue ? "text-red-600" : "text-slate-900"}`}
                  >
                    {slaStatus}
                  </span>
                </div>
                {stageDetails?.extensions && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Extensions Used:</span>
                      <span className="text-slate-900 font-medium">
                        {stageDetails.extensions.usage.used_requests} /{" "}
                        {stageDetails.extensions.limits.max_requests}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Time Extended:</span>
                      <span className="text-slate-900 font-medium">
                        {formatDuration(
                          stageDetails.extensions.usage.used_seconds,
                        )}{" "}
                        /{" "}
                        {formatDuration(
                          stageDetails.extensions.limits
                            .max_total_extension_seconds,
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Extension Form - Only show if extensions are available */}
            {canExtend && (
              <>
                {/* Extension Duration Input */}
                <div className="space-y-2">
                  <Label
                    htmlFor="extension"
                    className="text-sm font-medium text-slate-900"
                  >
                    Extension Duration *
                  </Label>
                  <Select
                    value={extensionTime}
                    onValueChange={setExtensionTime}
                  >
                    <SelectTrigger
                      id="extension"
                      className="h-10 bg-white border-slate-200 rounded-lg text-slate-700"
                    >
                      <SelectValue placeholder="Select extension time" />
                    </SelectTrigger>
                    <SelectContent>
                      {extensions.options_seconds.map((seconds) => (
                        <SelectItem key={seconds} value={String(seconds)}>
                          {formatDuration(seconds)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reason Selection */}
                <div className="space-y-2">
                  <Label
                    htmlFor="reason"
                    className="text-sm font-medium text-slate-900"
                  >
                    Reason *
                  </Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger
                      id="reason"
                      className="h-10 bg-white border-slate-200 rounded-lg text-slate-700"
                    >
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {extensions.reasons.map((reasonCode) => (
                        <SelectItem key={reasonCode} value={reasonCode}>
                          {reasonCode
                            .split("_")
                            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                            .join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Note Input (shown when OTHER is selected) */}
                {requiresNote && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="note"
                      className="text-sm font-medium text-slate-900"
                    >
                      Additional Notes (Required for "Other") *
                    </Label>
                    <Textarea
                      id="note"
                      placeholder="Provide detailed explanation for this extension..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[80px] bg-white border-slate-200 rounded-lg text-slate-700 resize-none"
                    />
                    <p className="text-xs text-slate-500">
                      This note will be logged in the audit trail.
                    </p>
                  </div>
                )}

                {/* Audit Trail Preview */}
                <div
                  style={{
                    borderRadius: "10px",
                    border: "0.8px solid #DDD6FE",
                    backgroundColor: "#F5F3FF",
                    paddingTop: "12.8px",
                    paddingRight: "12.8px",
                    paddingBottom: "12.8px",
                    paddingLeft: "12.8px",
                  }}
                >
                  <p className="text-sm font-medium text-slate-900 mb-2">
                    Audit Trail Entry Preview:
                  </p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    <li>• Action: Admin SLA Extension</li>
                    <li>• Timestamp: {new Date().toLocaleString()}</li>
                    <li>
                      • Extension:{" "}
                      {extensionTime
                        ? formatDuration(parseInt(extensionTime))
                        : "(Not selected)"}
                    </li>
                    <li>
                      • Reason:{" "}
                      {reason
                        ? reason
                            .split("_")
                            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                            .join(" ")
                        : "(Not selected)"}
                    </li>
                    {requiresNote && note && <li>• Note: {note}</li>}
                  </ul>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <Separator className="my-4" />

        <DialogFooter className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 border-slate-200 rounded-lg text-slate-900"
          >
            {canExtend ? "Cancel" : "Close"}
          </Button>
          {canExtend && (
            <Button
              onClick={handleExtend}
              disabled={
                !extensionTime ||
                !reason.trim() ||
                (requiresNote && !note.trim()) ||
                submitting
              }
              className="h-10 px-4 bg-purple-600 hover:bg-[#6d28d9] disabled:opacity-50 text-white rounded-lg"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Extending...
                </>
              ) : (
                "Extend SLA"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
