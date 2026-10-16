import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { toast } from 'sonner'; 
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  Mail,
  Phone,
  Calendar, 
  MapPin,
  Star,
  Briefcase,
  FileText,
  CreditCard,
  CheckCircle,
  XCircle,
  Shield,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { ScrollArea } from './ui/scroll-area';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useApi } from '../hooks/useApi';

const MEDIA_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://backend.staging.cybersquadapp.com';

function toAbsoluteUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${MEDIA_BASE_URL}${path}`;
}

function formatExpertise(expertise) {
  if (!Array.isArray(expertise)) return [];
  const labels = new Set();

  expertise.forEach((item) => {
    const s = String(item || '').toLowerCase();
    if (s.includes('phone')) labels.add('Phone');
    if (s.includes('laptop')) labels.add('Laptop');
    if (s.includes('network')) labels.add('Network');
    if (s.includes('tablet')) labels.add('Tablet');
  });

  return Array.from(labels);
}

export function TechnicianDetailsModal({
  open,
  onOpenChange,
  technician,
  onUpdated,
}) {
  const { api } = useApi();

  // ✅ ALL HOOKS FIRST
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [localWorkScope, setLocalWorkScope] = useState('both');

  useEffect(() => {
    if (technician?.profile) {
      setLocalWorkScope(technician.profile.work_scope || 'both');
    }
  }, [technician]);

  // ✅ Memoized values with safe defaults
  const fullName = useMemo(() => {
    if (!technician) return '-';
    return (technician?.first_name || technician?.last_name)
      ? `${technician?.first_name || ''} ${technician?.last_name || ''}`.trim()
      
      : (technician?.profile?.full_name || '-');
  }, [technician]);

  const email = useMemo(() => technician?.email || '-', [technician]);
  const phone = useMemo(() => technician?.phone_number || '-', [technician]);

  const location = useMemo(() => {
    if (!technician) return '-';
    const p = technician?.profile || {};
    const parts = [p?.city, p?.state, p?.country].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (p?.address) return p.address;
    return '-';
  }, [technician]);

  const joinedDate = useMemo(() => {
  if (!technician?.date_joined) return '-';
  try {
    const date = new Date(technician.date_joined);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return '-';
  }
}, [technician]);

  const expertiseLabels = useMemo(
    () => (technician ? formatExpertise(technician?.profile?.expertise) : []),
    [technician]
  );

  const ratingNum = useMemo(() => {
    if (!technician) return 0;
    const fromStats = technician?.stats?.avg_rating;
    if (typeof fromStats === 'number') return fromStats;
    const fromProfile = Number(technician?.profile?.rating || 0);
    return Number.isFinite(fromProfile) ? fromProfile : 0;
  }, [technician]);

  const docVerified = useMemo(
    () => Boolean(technician?.profile?.document_verified),
    [technician]
  );

  const avatarUrl = useMemo(
    () => toAbsoluteUrl(technician?.profile?.avatar),
    [technician]
  );

  const docs = useMemo(() => {
    if (!technician) return [];
    const certificate = technician?.profile?.certificate_upload;
    const idUpload = technician?.profile?.id_upload;

    return [
      {
        key: 'certificate',
        title: 'Training Certificate',
        icon: Shield,
        path: certificate,
      },
      {
        key: 'id',
        title: 'ID Document',
        icon: FileText,
        path: idUpload,
      },
    ];
  }, [technician]);

  const hasAnyDoc = useMemo(
    () => Boolean(technician?.profile?.certificate_upload || technician?.profile?.id_upload),
    [technician]
  );
const isSuspended = useMemo(
  () => !Boolean(technician?.is_active),  // ✅ CORRECT
  [technician]
);

  // ✅ NOW safe to return early
  if (!technician) return null;

  const getInitials = (name) => {
    const safe = (name || '').trim();
    if (!safe) return 'NA';
    return safe
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const statusClass = docVerified ? 'bg-success text-white' : 'bg-warning text-white';

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      console.log('technician profile id',technician.profile?.id )
      await api.patch(`/users/profile/technicians/${technician.profile?.id}/approve/` , {
      document_verified: true,  
    });

     toast.success(`${fullName} has been approved successfully!`);

      setShowApproveDialog(false);
      onOpenChange(false);
      onUpdated?.();
    } catch (e) {
      console.error('Approve failed:', e);
      toast.error('Failed to approve technician. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {

    try {
      setActionLoading(true);
      await api.post(`/users/profile/${technician?.id}/suspend/`, {
         action: 'suspend',
      });

      toast.success(`${fullName}'s account has been suspended.`);

      setShowSuspendDialog(false);
      onOpenChange(false);
      onUpdated?.();
    } catch (e) {
      console.error('Suspend failed:', e);
      toast.error('Failed to suspend account. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
  try {
    setActionLoading(true);
    await api.post(`/users/profile/${technician?.id}/suspend/`, {
      action: 'activate',
    });

    toast.success(`${fullName}'s account has been reactivated successfully!`);

    setShowReactivateDialog(false);
    onOpenChange(false);
    onUpdated?.();
  } catch (e) {
    console.error('Reactivate failed:', e);
    toast.error('Failed to reactivate account. Please try again.');
  } finally {
    setActionLoading(false);
  }
};

const handleReject = async () => {
  try {
    setActionLoading(true);
    // Rejecting technician by setting document_verified to false
    await api.patch(`/users/profile/technicians/${technician.profile?.id}/approve/`, {
      document_verified: false,  // Reject by marking as not verified
    });

    toast.success(`${fullName}'s application has been rejected.`);

    setShowRejectDialog(false);
    setRejectReason(''); // Clear reason
    onOpenChange(false);
    onUpdated?.(); // Optionally trigger a refetch or update in parent
  } catch (e) {
    console.error('Reject failed:', e);
     toast.error('Failed to reject technician. Please try again.');
  } finally {
    setActionLoading(false);
  }
};

const handleUpdateWorkScope = async (newValue) => {
  try {
    setActionLoading(true);
    await api.post(`/users/technician-ops-clearance/`, {
      technician_id: technician.profile?.id || technician.id,
      work_scope: newValue,
      requires_ops_approval: false,
      cleared_as_lead_engineer: false,
      notes: "Work scope updated by admin"
    });

    setLocalWorkScope(newValue);
    toast.success(`Work scope updated successfully.`);
    onUpdated?.();
  } catch (e) {
    console.error('Update work scope failed:', e);
    toast.error('Failed to update work scope. Please try again.');
  } finally {
    setActionLoading(false);
  }
};
  const openDoc = (path) => {
    const url = toAbsoluteUrl(path);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Technician Details</DialogTitle>
            <DialogDescription>
              Complete information and documents for verification
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
            <div className="space-y-6">
              {/* Technician Header */}
              <div className="flex items-start gap-4">
                <Avatar className="w-16 h-16">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
                    {getInitials(fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{fullName}</h3>
                      <p className="text-sm text-muted-foreground">{email}</p>
                      {expertiseLabels.length ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {expertiseLabels.map((x) => (
                            <Badge key={x} variant="secondary" className="text-xs">
                              {x}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-2">No expertise set</p>
                      )}
                    </div>
                    {isSuspended ? (
                      <Badge className="bg-error text-white">
                        <XCircle className="h-4 w-4" />
                        <span className="ml-1">suspended</span>
                      </Badge>
                    ) : (
                      <Badge className={statusClass}>
                        {docVerified ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="ml-1">{docVerified ? 'verified' : 'not verified'}</span>
                      </Badge>
                    )}
                  </div>
                  {ratingNum > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="w-4 h-4 fill-warning text-warning" />
                      <span className="font-medium">{ratingNum.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Contact Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Contact Information</h4>
                <div className="grid gap-4">
                  <div className="flex items-center gap-4 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span>
                    <span>{email}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Phone:</span>
                    <span>{phone}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span>{location}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Joined:</span>
                    <span>{joinedDate}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Professional Details */}
              <div className="space-y-4">
                <h4 className="font-medium">Professional Details</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Briefcase className="w-4 h-4" />
                      <span className="text-xs">Expertise</span>
                    </div>
                    {expertiseLabels.length ? (
                      <div className="flex flex-wrap gap-1">
                        {expertiseLabels.map((x) => (
                          <Badge key={x} variant="secondary" className="text-xs">
                            {x}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No expertise set</p>
                    )}
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Briefcase className="w-4 h-4" />
                      <span className="text-xs">Work Scope</span>
                    </div>
                    <Select
                      value={localWorkScope}
                      onValueChange={handleUpdateWorkScope}
                      disabled={actionLoading}
                    >
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Select scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both</SelectItem>
                        <SelectItem value="walkin_only">Walk-in Only</SelectItem>
                        <SelectItem value="self_service_only">Self Service Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Verification Documents */}
              <div className="space-y-4">
                <h4 className="font-medium">Verification Documents</h4>
                {!hasAnyDoc ? (
                  <div className="p-4 border rounded-lg text-sm text-muted-foreground">
                    No documents uploaded yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {docs.map((d) => {
                      const Icon = d.icon;
                      const exists = Boolean(d.path);
                      return (
                        <div
                          key={d.key}
                          className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-purple-600" />
                              </div>
                              <div>
                                <h5 className="font-medium">{d.title}</h5>
                                <p className="text-sm text-muted-foreground">
                                  {exists ? 'Uploaded' : 'Not uploaded'}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!exists}
                              onClick={() => exists && openDoc(d.path)}
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Bank Details */}
              <div className="space-y-4">
                <h4 className="font-medium">Bank Details</h4>
                <div className="p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Bank Name:</span>
                          <p className="font-medium">
                            {technician?.profile?.account_info?.bank_name || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account Number:</span>
                          <p className="font-medium">
                            {technician?.profile?.account_info?.account_number || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account Name:</span>
                          <p className="font-medium">
                            {technician?.profile?.account_info?.account_name ||
                              technician?.profile?.full_name ||
                              fullName ||
                              '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!docVerified ? (
              <>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={!hasAnyDoc || actionLoading}
                >
                  Reject
                </Button>
                <Button
                  className="flex-1 bg-success hover:bg-success-700"
                  onClick={() => setShowApproveDialog(true)}
                  disabled={!hasAnyDoc || actionLoading}
                >
                  Approve
                </Button>
              </>
            ) : isSuspended ? (
              <Button
                className="flex-1 bg-success hover:bg-success-700"
                onClick={() => setShowReactivateDialog(true)}
                disabled={actionLoading}
              >
                Reactivate Account
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setShowSuspendDialog(true)}
                disabled={actionLoading}
              >
                Suspend Account
              </Button>
            )}
          </div>
            </div>
          </ScrollArea>

          <Separator />

      
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Technician?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve {fullName}'s application? They will be able to start
              accepting jobs immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-success text-white hover:bg-success-700"
              disabled={actionLoading}
            >
              {actionLoading ? 'Approving...' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to suspend {fullName}'s account? This will prevent them from
              accepting new jobs until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading}
            >
              {actionLoading ? 'Suspending...' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        {/* Reactivate Confirmation Dialog */}
        <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reactivate Account?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reactivate {fullName}'s account? They will regain full access to accept jobs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReactivate}
                className="bg-success text-white hover:bg-success-700"
                disabled={actionLoading}
              >
                {actionLoading ? 'Reactivating...' : 'Reactivate'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Technician?</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting {fullName}'s application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason">Rejection Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              className="mt-2"
              rows={4}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!rejectReason.trim()}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}