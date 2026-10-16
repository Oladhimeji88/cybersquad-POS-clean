import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { UserPlus, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '../hooks/useApi';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddAdminModal({ open, onClose, roles = [], onCreated }) {
  const { api } = useApi();

  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role_id: '', // store as string from Select
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setSaving(false);
      setFormData({
        full_name: '',
        email: '',
        role_id: '',
      });
    }
  }, [open]);

  // role object from selected role_id
  const selectedRole = useMemo(() => {
    return roles.find((r) => String(r.id) === String(formData.role_id)) || null;
  }, [roles, formData.role_id]);

  const parseFullName = (fullName) => {
    const cleaned = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return { first_name: '', last_name: '' };

    const parts = cleaned.split(' ');
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ').trim(); // may be empty
    return { first_name, last_name };
  };

  // Generate a temporary password to satisfy backend validation
  const generateTempPassword = () => {
    const bytes = new Uint8Array(10);
    window.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `Tmp@${hex.slice(0, 10)}A!1`;
  };

  // Convert backend errors into a safe string for toast
  const getErrorMessage = (err) => {
    const data = err?.response?.data;

    if (!data) return err?.message || 'Failed to create admin user';

    // If backend returns a plain string
    if (typeof data === 'string') return data;

    // Common shapes
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.detail === 'string') return data.detail;

    // Your backend shape: { error: { code, message, type, timestamp } }
    const e = data?.error;

    // e.message might be an object of field errors: { password: "required" }
    if (typeof e?.message === 'string') return e.message;

    if (e?.message && typeof e.message === 'object') {
      const firstKey = Object.keys(e.message)[0];
      const firstVal = e.message[firstKey];

      if (Array.isArray(firstVal)) return `${firstKey}: ${firstVal.join(', ')}`;
      return `${firstKey}: ${String(firstVal)}`;
    }

    // Last resort: stringify safely
    try {
      return JSON.stringify(e || data);
    } catch {
      return 'Failed to create admin user';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const email = String(formData.email || '').trim();

    if (!formData.role_id) {
      toast.error('Please select a role');
      return;
    }

    const { first_name, last_name } = parseFullName(formData.full_name);

    if (!first_name) {
      toast.error('Please enter the full name');
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // position must be: "Super Admin" / "Admin" / "Support Admin"
    // we’ll use the role name coming from /platform/admin-roles/
    const position = String(selectedRole?.name || 'Admin');

    const payload = {
      email,
      password: generateTempPassword(), // ✅ satisfy backend validation
      first_name,
      last_name,
      role_id: Number(formData.role_id),
      profile_data: { position },
    };

    setSaving(true);
    try {
      await api.post('/platform/admin-assignments/create-admin-user/', payload);

      toast.success('Admin user created successfully');
      onClose?.();
      onCreated?.();
    } catch (err) {
      console.error('Create admin failed:', err);
      toast.error(getErrorMessage(err)); // ✅ never pass objects to toast
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v) => {
    // only close when user dismisses the modal
    if (!v) onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Add Admin User
          </DialogTitle>
          <DialogDescription>Create a new admin account with assigned role and permissions</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              placeholder="Enter full name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@cybersquad.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              pattern={EMAIL_REGEX.source}
              title="Please enter a valid email address"
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role_id">Role</Label>
            <Select
              value={formData.role_id}
              onValueChange={(value) => setFormData({ ...formData, role_id: value })}
              disabled={saving}
            >
              <SelectTrigger id="role_id">
                <SelectValue placeholder="Select admin role" />
              </SelectTrigger>

              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {String(r.name ?? '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-xs text-muted-foreground">
              {selectedRole?.name ? `Position will be set to: ${String(selectedRole.name)}` : 'Select a role to continue'}
            </p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg text-sm text-purple-900">
            The admin will receive an email with their login credentials and setup instructions.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>

            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Admin'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
