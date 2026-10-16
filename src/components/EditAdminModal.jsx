import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

import { UserCog, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useApi } from '../hooks/useApi';

const PERMISSIONS_LEVEL_TO_ROLE_ID = {
  super_admin: 1,
  admin: 2,
  support_admin: 3,
};

export function EditAdminModal({ open, onClose, admin, roles = [], onUpdated }) {
  const { api } = useApi();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // selected role id as string: "1" | "2" | "3"
  const [roleId, setRoleId] = useState('');
  const [assignmentId, setAssignmentId] = useState(null);

  const displayName = useMemo(() => {
    const first = admin?.first_name || '';
    const last = admin?.last_name || '';
    const combined = `${first} ${last}`.trim();
    if (combined) return combined;

    const fullName = admin?.profile?.full_name?.trim();
    if (fullName) return fullName;

    return '—';
  }, [admin]);

  const selectedRoleObj = useMemo(() => {
    return roles.find((r) => String(r.id) === String(roleId)) || null;
  }, [roles, roleId]);

  // When modal opens: fetch admin detail to get admin_assignments (role + assignment id)
  useEffect(() => {
    if (!open || !admin?.id) {
      // Reset state when modal closes
      if (!open) {
        setRoleId('');
        setAssignmentId(null);
        setLoading(false);
      }
      return;
    }

    const loadAdminDetail = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/users/profile/admins/${admin.id}/`);
        const data = res?.data?.result || res?.data || {};

        const assignments = Array.isArray(data.admin_assignments) ? data.admin_assignments : [];
        const activeAssignment = assignments.find((a) => a?.active) || assignments[0] || null;

        if (activeAssignment?.role?.id) {
          setRoleId(String(activeAssignment.role.id));
          setAssignmentId(activeAssignment?.id ? Number(activeAssignment.id) : null);
          return;
        }

        // fallback to profile.permissions_level if assignment missing
        const level = data?.profile?.permissions_level;
        const fallbackRoleId = PERMISSIONS_LEVEL_TO_ROLE_ID[level] || '';
        setRoleId(fallbackRoleId ? String(fallbackRoleId) : '');
        setAssignmentId(null);
      } catch (e) {
        console.error('Failed to load admin detail:', e);

        // fallback to what SystemSettings already passed
        if (admin?.roleId) setRoleId(String(admin.roleId));
        else if (admin?.profile?.permissions_level) {
          const fallback = PERMISSIONS_LEVEL_TO_ROLE_ID[admin.profile.permissions_level];
          setRoleId(fallback ? String(fallback) : '');
        }

        setAssignmentId(admin?.assignmentId || null);
      } finally {
        setLoading(false);
      }
    };

    loadAdminDetail();
  }, [open, admin?.id]); // Removed api from dependencies to prevent infinite loop

  const handleSave = async () => {
    if (!roleId) {
      toast.error('Please select a role');
      return;
    }

    try {
      setSaving(true);

      // 1) Remove existing assignment (enforce "one role per admin")
      if (assignmentId) {
        await api.delete(`/platform/admin-assignments/${assignmentId}/`);
      }

      // 2) Add new assignment
      await api.post('/platform/admin-assignments/', {
        user_id: admin.id,
        role_id: Number(roleId),
        active: true,
      });

      toast.success('Admin role updated successfully');
      onUpdated?.();
      onClose();
    } catch (e) {
      console.error('Role update failed:', e);
      toast.error('Failed to update admin role');
    } finally {
      setSaving(false);
    }
  };

  // Build a dynamic permissions list for display
  const rolePermissionLines = useMemo(() => {
    if (!selectedRoleObj) return [];

    const lines = [];
    if (selectedRoleObj?.privilege_dashboard) lines.push('Dashboard access');
    if (selectedRoleObj?.privilege_user_management) lines.push('User Management access');
    if (selectedRoleObj?.privilege_job_management) lines.push('Job Management access');
    if (selectedRoleObj?.privilege_payments_finance) lines.push('Payments & Finance access');
    if (selectedRoleObj?.privilege_dispute_management) lines.push('Dispute Management access');
    if (selectedRoleObj?.privilege_reports_analytics) lines.push('Reports & Analytics access');
    if (selectedRoleObj?.privilege_system_settings) lines.push('System Settings access');
    if (selectedRoleObj?.can_approve_payouts) lines.push('Can approve payouts');

    return lines.length ? lines : ['No privileges enabled'];
  }, [selectedRoleObj]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Edit Admin User
          </DialogTitle>
          <DialogDescription>Update role and permissions for {displayName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-6">
            {/* Admin Summary */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{displayName}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{admin?.email || '—'}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={admin?.is_active ? 'default' : 'secondary'}>
                  {admin?.is_active ? 'active' : 'inactive'}
                </Badge>
              </div>
            </div>

            {/* Role Select */}
            <div className="space-y-2">
              <Label htmlFor="role">Admin Role</Label>

              <Select value={roleId} onValueChange={setRoleId} disabled={loading}>
                <SelectTrigger id="role">
                  <SelectValue placeholder={loading ? 'Loading role...' : 'Select role'} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <p className="text-xs text-muted-foreground">
                {selectedRoleObj?.description || 'Select a role to see its permissions.'}
              </p>
            </div>

            {/* Permissions Preview */}
            <div className="p-4 bg-purple-50 rounded-lg space-y-2">
              <h4 className="text-sm font-medium text-purple-900">Role Permissions</h4>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-purple-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading admin assignments...
                </div>
              ) : (
                <div className="text-sm text-purple-800 space-y-1">
                  {rolePermissionLines.map((line) => (
                    <p key={line}>• {line}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
              <strong>Note:</strong> If this admin already has a role, it will be removed first so they only keep one role.
            </div>
                    <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !roleId}>
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
          </div>
        </ScrollArea>


      </DialogContent>
    </Dialog>
  );
}