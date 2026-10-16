import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import {
  AlertTriangle,
  Calendar,
  FileText,
  User,
  Wrench,
  UserPlus,
  CheckCircle,
  XCircle,
  MessageSquare,
  Image as ImageIcon,
  Gavel,
  Upload,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

const BASE_URL = "http://72.61.18.174:8000";

export function DisputeDetailsModal({ open, onClose, disputeId }) {
  const { api } = useApi();
  const [dispute, setDispute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [hasMoreAdmins, setHasMoreAdmins] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Finalize dispute state
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);
  const [resolverComments, setResolverComments] = useState("");

  // Media upload state
  const [showMediaUploadForm, setShowMediaUploadForm] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaStatement, setMediaStatement] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);

  // Fetch dispute details
  const fetchDisputeDetails = async () => {
    if (!disputeId) return;

    setLoading(true);
    try {
      const res = await api.get(`/disputes/${disputeId}/`);
      setDispute(res?.data || null);
    } catch (e) {
      console.error("Error fetching dispute details:", e);
      setDispute(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch admins for assignment
  const fetchAdmins = async (page = 1) => {
    try {
      const res = await api.get(
        `/users/profile/admins/?page=${page}&page_size=20`,
      );
      const data = res?.data || {};
      const adminList = Array.isArray(data.result) ? data.result : [];

      if (page === 1) {
        setAdmins(adminList);
      } else {
        setAdmins((prev) => [...prev, ...adminList]);
      }

      setHasMoreAdmins(Boolean(data.pagination?.next));
    } catch (e) {
      console.error("Error fetching admins:", e);
    }
  };

  useEffect(() => {
    if (open && disputeId) {
      fetchDisputeDetails();
      fetchAdmins();
      setShowFinalizeForm(false);
      setResolverComments("");
      setShowMediaUploadForm(false);
      setMediaFiles([]);
      setMediaStatement("");
    }
  }, [open, disputeId]);

  const handleMoveToReview = async () => {
    if (!dispute) return;

    setActionLoading(true);
    try {
      await api.post(`/disputes/${dispute.id}/move-to-review/`);
      alert("Dispute moved to under review successfully");
      fetchDisputeDetails();
    } catch (e) {
      console.error("Error moving to review:", e);
      alert(
        e?.response?.data?.error?.message?.[0] ||
          "Failed to move dispute to review",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignStaff = async () => {
    if (!dispute || !selectedAdmin) return;

    setActionLoading(true);
    try {
      await api.post(`/disputes/${dispute.id}/assign/`, {
        staff_id: selectedAdmin,
      });
      alert("Staff assigned successfully");
      fetchDisputeDetails();
      setSelectedAdmin("");
    } catch (e) {
      console.error("Error assigning staff:", e);
      const errorMsg =
        e?.response?.data?.error?.message?.[0] || "Failed to assign staff";
      alert(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizeDispute = async () => {
    if (!dispute || !resolverComments.trim()) {
      alert("Please provide resolver comments");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to finalize this dispute? This will pass judgement.",
      )
    )
      return;

    setActionLoading(true);
    try {
      await api.post(`/disputes/${dispute.id}/finalize/`, {
        resolver_comments: resolverComments.trim(),
      });
      alert("Dispute finalized successfully");
      setShowFinalizeForm(false);
      setResolverComments("");
      fetchDisputeDetails();
    } catch (e) {
      console.error("Error finalizing dispute:", e);
      alert(
        e?.response?.data?.error?.message?.[0] || "Failed to finalize dispute",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseDispute = async () => {
    if (!dispute) return;

    if (!confirm("Are you sure you want to close this dispute?")) return;

    setActionLoading(true);
    try {
      await api.post(`/disputes/${dispute.id}/close/`);
      alert("Dispute closed successfully");
      onClose();
    } catch (e) {
      console.error("Error closing dispute:", e);
      alert(
        e?.response?.data?.error?.message?.[0] || "Failed to close dispute",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleMediaUpload = async () => {
    if (!dispute || (mediaFiles.length === 0 && !mediaStatement.trim())) {
      alert("Please provide at least a statement or select files");
      return;
    }

    setUploadLoading(true);
    try {
      const formData = new FormData();

      // Add statement if provided
      if (mediaStatement.trim()) {
        formData.append("statement", mediaStatement.trim());
      }

      // Add files to formData
      mediaFiles.forEach((file) => {
        formData.append("files", file);
      });

      await api.post(`/disputes/${dispute.id}/staff/note/`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      alert("Staff note saved successfully");
      setShowMediaUploadForm(false);
      setMediaFiles([]);
      setMediaStatement("");
      fetchDisputeDetails();
    } catch (e) {
      console.error("Error uploading staff note:", e);
      alert(
        e?.response?.data?.error?.message?.[0] || "Failed to save staff note",
      );
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);

    // Validate file sizes (2MB max per file)
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB in bytes
    const oversized = files.filter((file) => file.size > MAX_SIZE);

    if (oversized.length > 0) {
      alert(
        `The following files exceed 2MB limit:\n${oversized.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB)`).join("\n")}`,
      );
      e.target.value = ""; // Clear the input
      return;
    }

    setMediaFiles(files);
  };

  const removeFile = (index) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      created: "Pending",
      assigned: "Assigned",
      under_review: "Under Review",
      awaiting_customer: "Awaiting Customer",
      awaiting_technician: "Awaiting Technician",
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
      judgement: "default",
      closed: "outline",
      resolved: "outline",
    };
    return variantMap[status] || "outline";
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getAuthorBadgeVariant = (authorType) => {
    const variantMap = {
      customer: "default",
      technician: "secondary",
      staff: "outline",
      system: "outline",
    };
    return variantMap[authorType] || "outline";
  };

  const canAssignStaff = () => {
    return (
      dispute?.customer_responded &&
      dispute?.technician_responded &&
      dispute?.status !== "under_review"
    );
  };

  const canMoveToReview = () => {
    return dispute?.status === "assigned";
  };

  const canFinalize = () => {
    return dispute?.status === "under_review";
  };

  const canClose = () => {
    return dispute?.status !== "closed";
  };

  const canUploadMedia = () => {
    return dispute?.status !== "closed";
  };

  if (loading || !dispute) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
          <div className="text-center py-8 text-muted-foreground">
            {loading ? "Loading dispute details..." : "Dispute not found"}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispute Details</DialogTitle>
          <DialogDescription>
            Complete information for dispute #{dispute.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Dispute ID</p>
              <p className="font-medium">#{dispute.id}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={getStatusVariant(dispute.status)}>
                {getStatusLabel(dispute.status)}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Priority</p>
              <Badge
                variant={
                  dispute.priority === "high"
                    ? "destructive"
                    : dispute.priority === "medium"
                      ? "default"
                      : "secondary"
                }
              >
                {dispute.priority === "high" && (
                  <AlertTriangle className="h-4 w-4 mr-1" />
                )}
                {dispute.priority}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Dispute Type</p>
              <Badge variant="outline">
                {dispute.dispute_type?.replace("_", " ")}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Job and Parties Info */}
          <div className="space-y-4">
            {dispute.job && (
              <div className="flex items-start gap-4">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Job Reference</p>
                  <p className="font-medium">
                    #{dispute.job.id} - {dispute.job.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Service: {dispute.job.service?.name} | Status:{" "}
                    {dispute.job.status}
                  </p>
                </div>
              </div>
            )}

            {dispute.customer && (
              <div className="flex items-start gap-4">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{dispute.customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {dispute.customer.email}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Contact: {dispute.customer_contact}
                  </p>
                  <Badge
                    variant={
                      dispute.customer_responded ? "default" : "secondary"
                    }
                    className="mt-1"
                  >
                    {dispute.customer_responded ? "Responded" : "Not Responded"}
                  </Badge>
                </div>
              </div>
            )}

            {dispute.technician && (
              <div className="flex items-start gap-4">
                <Wrench className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Technician</p>
                  <p className="font-medium">{dispute.technician.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {dispute.technician.email}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Contact: {dispute.technician_contact}
                  </p>
                  <Badge
                    variant={
                      dispute.technician_responded ? "default" : "secondary"
                    }
                    className="mt-1"
                  >
                    {dispute.technician_responded
                      ? "Responded"
                      : "Not Responded"}
                  </Badge>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium">
                  {formatTimestamp(dispute.created_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Response window: {dispute.response_window_hours} hours
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Statements/Timeline */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Dispute Timeline
            </h4>
            <div className="space-y-4">
              {dispute.statements && dispute.statements.length > 0 ? (
                dispute.statements.map((statement) => (
                  <div
                    key={statement.index}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={getAuthorBadgeVariant(statement.author_type)}
                        >
                          {statement.author_type}
                        </Badge>
                        {statement.author && (
                          <span className="text-sm font-medium">
                            {statement.author.name ||
                              statement.author.email ||
                              "Unknown"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(statement.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm">{statement.statement}</p>
                    {statement.media && statement.media.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {statement.media.map((mediaUrl, idx) => (
                          <a
                            key={idx}
                            href={
                              mediaUrl.startsWith("http")
                                ? mediaUrl
                                : `${BASE_URL}${mediaUrl}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ImageIcon className="h-4 w-4" />
                            Media {idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No statements yet
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Assigned Staff */}
          {dispute.assigned_staff && (
            <>
              <div className="space-y-2">
                <h4 className="font-medium">Assigned Staff</h4>
                <div className="p-4 bg-purple-50 rounded-lg">
                  {typeof dispute.assigned_staff === "object" ? (
                    <div>
                      <p className="font-medium">
                        {dispute.assigned_staff.name ||
                          dispute.assigned_staff.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ID: {dispute.assigned_staff.id}
                      </p>
                      {dispute.assigned_staff.email && (
                        <p className="text-sm text-muted-foreground">
                          {dispute.assigned_staff.email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium">
                      Admin #{dispute.assigned_staff}
                    </p>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Actions */}
          <div className="space-y-4">
            <h4 className="font-medium">Actions</h4>

            {/* Upload Media Evidence / Add Staff Note */}
            {canUploadMedia() && !showMediaUploadForm && (
              <Button
                variant="outline"
                onClick={() => setShowMediaUploadForm(true)}
                disabled={actionLoading || uploadLoading}
              >
                <Upload className="w-4 h-4 mr-2" />
                Add Staff Note
              </Button>
            )}

            {/* Media Upload Form */}
            {showMediaUploadForm && canUploadMedia() && (
              <div className="border rounded-lg p-4 space-y-4 bg-blue-50">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <h5 className="font-medium">Add Staff Note</h5>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Statement (Optional)
                  </label>
                  <Textarea
                    placeholder="Add investigation findings, comments, or notes..."
                    value={mediaStatement}
                    onChange={(e) => setMediaStatement(e.target.value)}
                    rows={3}
                    className="resize-none"
                    disabled={uploadLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Attach Files (Optional - Images/Videos)
                  </label>
                  <Input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    disabled={uploadLoading}
                  />
                  {mediaFiles.length > 0 && (
                    <div className="space-y-1">
                      {mediaFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between text-sm bg-white p-2 rounded"
                        >
                          <span className="truncate flex-1">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            disabled={uploadLoading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleMediaUpload}
                    disabled={
                      (mediaFiles.length === 0 && !mediaStatement.trim()) ||
                      uploadLoading
                    }
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadLoading ? "Saving..." : "Save Note"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowMediaUploadForm(false);
                      setMediaFiles([]);
                      setMediaStatement("");
                    }}
                    disabled={uploadLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Assign Staff */}
            {!dispute.assigned_staff && canAssignStaff() && (
              <div className="flex gap-2">
                <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select admin to assign..." />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((admin) => (
                      <SelectItem key={admin.id} value={String(admin.id)}>
                        {admin.profile?.full_name ||
                          admin.email ||
                          `Admin ${admin.id}`}
                        {admin.profile?.permissions_level && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({admin.profile.permissions_level})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAssignStaff}
                  disabled={!selectedAdmin || actionLoading}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Assign
                </Button>
              </div>
            )}

            {!canAssignStaff() && !dispute.assigned_staff && (
              <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-4">
                Cannot assign staff until both customer and technician have
                responded.
              </div>
            )}

            {/* Finalize Dispute (Pass Judgement) */}
            {canFinalize() && !showFinalizeForm && (
              <Button
                variant="default"
                onClick={() => setShowFinalizeForm(true)}
                disabled={actionLoading}
              >
                <Gavel className="w-4 h-4 mr-2" />
                Pass Judgement
              </Button>
            )}

            {/* Finalize Form */}
            {showFinalizeForm && canFinalize() && (
              <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Gavel className="w-4 h-4" />
                  <h5 className="font-medium">Finalize Dispute</h5>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Resolver Comments (Required)
                  </label>
                  <Textarea
                    placeholder="E.g., After review, the technician is at fault, and customer will be refunded."
                    value={resolverComments}
                    onChange={(e) => setResolverComments(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleFinalizeDispute}
                    disabled={!resolverComments.trim() || actionLoading}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finalize Dispute
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowFinalizeForm(false);
                      setResolverComments("");
                    }}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Other Actions */}
            <div className="flex flex-wrap gap-2">
              {canMoveToReview() && (
                <Button
                  variant="outline"
                  onClick={handleMoveToReview}
                  disabled={actionLoading}
                >
                  Move to Review
                </Button>
              )}

              {canClose() && (
                <Button
                  variant="destructive"
                  onClick={handleCloseDispute}
                  disabled={actionLoading}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Close Dispute
                </Button>
              )}
            </div>

            {/* Next Statuses Info */}
            {dispute.next_statuses && dispute.next_statuses.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Available transitions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {dispute.next_statuses.map((status, idx) => (
                    <li key={idx}>
                      {status.label} {status.hint && `- ${status.hint}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
