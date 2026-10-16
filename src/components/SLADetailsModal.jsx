// components/SLADetailsModal.jsx
import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import { formatSeconds, calculateTimeRemaining } from "../utils/timeFormat";

export function SLADetailsModal({ open, onClose, jobId }) {
  const { api } = useApi();
  const [loading, setLoading] = useState(true);
  const [timelineData, setTimelineData] = useState(null);
  const [activeTab, setActiveTab] = useState("timeline");

  useEffect(() => {
    if (open && jobId) {
      fetchTimelineData();
    }
  }, [open, jobId]);

  const fetchTimelineData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/sla/jobs/${jobId}/timeline/`);

      if (response.data.success) {
        setTimelineData(response.data.result);
      }
    } catch (error) {
      console.error("Error fetching timeline:", error);
      toast.error("Failed to load SLA details");
    } finally {
      setLoading(false);
    }
  };

  const getSLAStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case "COMPLETED":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            Completed
          </Badge>
        );
      case "ACTIVE":
        return (
          <Badge
            variant="default"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            Active
          </Badge>
        );
      case "OVERDUE":
        return <Badge variant="destructive">Overdue</Badge>;
      case "PENDING":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStageIcon = (status) => {
    switch (status?.toUpperCase()) {
      case "COMPLETED":
        return <CheckCircle className="w-4 h-4 text-white" />;
      case "ACTIVE":
        return <Clock className="w-4 h-4 text-white" />;
      case "OVERDUE":
        return <XCircle className="w-4 h-4 text-white" />;
      default:
        return <Clock className="w-4 h-4 text-white" />;
    }
  };

  const getStageColor = (status) => {
    switch (status?.toUpperCase()) {
      case "COMPLETED":
        return "bg-green-600";
      case "ACTIVE":
        return "bg-blue-600";
      case "OVERDUE":
        return "bg-red-600";
      default:
        return "bg-gray-300";
    }
  };

  const formatStageLabel = (stage) => {
    return stage
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!timelineData) return null;

  const currentStage = timelineData.timeline.find(
    (s) => s.status === "ACTIVE" || s.status === "OVERDUE",
  );
  const completedStages = timelineData.timeline.filter(
    (s) => s.status === "COMPLETED",
  );
  const pendingStages = timelineData.timeline.filter(
    (s) => s.status === "PENDING",
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>SLA Timeline Details</DialogTitle>
          <DialogDescription>
            Job status: {formatStageLabel(timelineData.job_status)}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-6">
            {/* Current Stage Highlight */}
            {currentStage && (
              <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-10 h-10 rounded-full ${getStageColor(currentStage.status)} flex items-center justify-center`}
                    >
                      {getStageIcon(currentStage.status)}
                    </div>
                    <div>
                      <h4 className="font-semibold">
                        {formatStageLabel(currentStage.stage)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {currentStage.is_overdue ? "Overdue" : "In Progress"}
                      </p>
                    </div>
                  </div>
                  {getSLAStatusBadge(currentStage.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Started</p>
                    <p className="font-medium">
                      {currentStage.started_at
                        ? new Date(currentStage.started_at).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Deadline</p>
                    <p className="font-medium">
                      {currentStage.deadline_at ? (
                        <>
                          {new Date(currentStage.deadline_at).toLocaleString()}
                          {!currentStage.is_overdue && (
                            <span className="text-xs text-purple-600 ml-2">
                              (
                              {
                                calculateTimeRemaining(currentStage.deadline_at)
                                  ?.display
                              }
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        "N/A"
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Extensions Used</p>
                    <p className="font-medium">
                      {formatSeconds(currentStage.extension.used_seconds)} /{" "}
                      {formatSeconds(currentStage.extension.max_seconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reminders Sent</p>
                    <p className="font-medium">{currentStage.reminders_sent}</p>
                  </div>
                </div>

                {currentStage.can_request_extension && (
                  <div className="mt-4 p-2 bg-blue-50 rounded text-sm text-blue-700">
                    ✓ Extension requests available
                  </div>
                )}
                {currentStage.disabled_reason && (
                  <div className="mt-4 p-2 bg-slate-50 rounded text-sm text-slate-600">
                    {currentStage.disabled_reason}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Tab Navigation */}
            <div className="border-b">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`pb-2 px-1 border-b-2 transition-colors ${
                    activeTab === "timeline"
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Full Timeline
                </button>
                <button
                  onClick={() => setActiveTab("metadata")}
                  className={`pb-2 px-1 border-b-2 transition-colors ${
                    activeTab === "metadata"
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  SLA Metadata
                </button>
              </div>
            </div>

            {/* Timeline Tab */}
            {activeTab === "timeline" && (
              <div className="space-y-4">
                <h4 className="font-semibold">Complete Stage Timeline</h4>
                <div className="space-y-4 border-l-2 border-purple-200 pl-4 ml-2">
                  {timelineData.timeline.map((stage, index) => (
                    <div key={`${stage.stage}-${index}`} className="relative">
                      <div
                        className={`absolute -left-[1.3rem] w-6 h-6 rounded-full ${getStageColor(stage.status)} flex items-center justify-center`}
                      >
                        {getStageIcon(stage.status)}
                      </div>
                      <div
                        className={
                          stage.status === "PENDING" ? "opacity-50" : ""
                        }
                      >
                        <p className="text-sm font-medium">
                          {formatStageLabel(stage.stage)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Status: {stage.status}
                          {stage.is_overdue && (
                            <span className="text-red-600 font-semibold ml-2">
                              (OVERDUE)
                            </span>
                          )}
                        </p>
                        {stage.started_at && (
                          <p className="text-xs text-muted-foreground">
                            Started:{" "}
                            {new Date(stage.started_at).toLocaleString()}
                          </p>
                        )}
                        {stage.deadline_at && (
                          <p className="text-xs text-muted-foreground">
                            Deadline:{" "}
                            {new Date(stage.deadline_at).toLocaleString()}
                          </p>
                        )}
                        {stage.completed_at && (
                          <p className="text-xs text-muted-foreground">
                            Completed:{" "}
                            {new Date(stage.completed_at).toLocaleString()}
                          </p>
                        )}
                        {stage.extension.used_seconds > 0 && (
                          <p className="text-xs text-blue-600">
                            Extensions:{" "}
                            {formatSeconds(stage.extension.used_seconds)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata Tab */}
            {activeTab === "metadata" && timelineData.sla_metadata && (
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Configuration</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.config.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Version:</span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.config.version}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Service Type:
                      </span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.config.service_type}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Default:</span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.config.is_default
                          ? "Yes"
                          : "No"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Usage Statistics</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Extensions:</span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.usage.extensions_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Admin Extensions:
                      </span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.usage.admin_extensions_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Reassignments:
                      </span>
                      <span className="ml-2 font-medium">
                        {timelineData.sla_metadata.usage.reassignments_count}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Policy Limits</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      Max Reassignments:{" "}
                      <span className="font-medium">
                        {timelineData.sla_metadata.policy.max_reassignments}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Allowed Extension States:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {timelineData.sla_metadata.policy.allowed_extension_states.map(
                        (state) => (
                          <Badge
                            key={state}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {formatStageLabel(state)}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />
      </DialogContent>
    </Dialog>
  );
}
