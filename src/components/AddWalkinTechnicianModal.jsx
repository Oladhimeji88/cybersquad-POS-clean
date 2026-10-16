import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '../hooks/useApi';
import { Checkbox } from './ui/checkbox';
import { extractBackendErrorMessage } from '../lib/backendErrors';
import { normalizeNigerianPhone } from '../utils/phoneNumber';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
const EXPERTISE_OPTIONS = ['Phone', 'Tablet', 'Laptop'];

export function AddWalkinTechnicianModal({ open, onClose, onCreated }) {
  const { api } = useApi();

  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone_number: '',
    store: '', // store id
    expertise: [],
    years_experience: 1,
    availability: true,
  });

  // Fetch stores when modal opens
  useEffect(() => {
    if (open) {
      const fetchStores = async () => {
        setLoadingStores(true);
        try {
          const res = await api.get('/users/stores/?is_active=true');
          setStores(res?.data?.result || []);
        } catch (error) {
          console.error('Failed to load stores:', error);
          toast.error('Failed to load stores');
        } finally {
          setLoadingStores(false);
        }
      };

      fetchStores();
    }
  }, [open]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setSaving(false);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
        phone_number: '',
        store: '',
        expertise: [],
        years_experience: 1,
        availability: true,
      });
    }
  }, [open]);

  const parseFullName = (fullName) => {
    const cleaned = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return { first_name: '', last_name: '' };

    const parts = cleaned.split(' ');
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ').trim(); // may be empty
    return { first_name, last_name };
  };

  const getErrorMessage = (err) => {
    const data = err?.response?.data;

    if (!data) return err?.message || 'Failed to create technician';

    return extractBackendErrorMessage(data, err?.message || 'Failed to create technician');
  };

  const toggleExpertise = (exp) => {
    setFormData((prev) => {
      const newExpertise = prev.expertise.includes(exp)
        ? prev.expertise.filter((e) => e !== exp)
        : [...prev.expertise, exp];
      return { ...prev, expertise: newExpertise };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');

    const { first_name, last_name } = parseFullName(formData.full_name);

    if (!first_name) {
      toast.error('Please enter the full name');
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!password) {
      toast.error('Password is required');
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      toast.error('Password must be at least 8 characters and include uppercase, lowercase, number, and special character');
      return;
    }

    if (password !== formData.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }

    if (!formData.phone_number) {
      toast.error('Phone number is required');
      return;
    }

    const normalizedPhone = normalizeNigerianPhone(formData.phone_number);
    if (!normalizedPhone) {
      toast.error('Please enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678');
      return;
    }

    if (!formData.store) {
      toast.error('Please select a store');
      return;
    }

    if (formData.expertise.length === 0) {
      toast.error('Please select at least one area of expertise');
      return;
    }

    const payload = {
      email,
      password,
      first_name,
      last_name,
      phone_number: normalizedPhone,
      store: Number(formData.store),
      expertise: formData.expertise.map(e => e.toLowerCase()), // Lowercased as per example payload
      years_experience: Number(formData.years_experience),
      availability: formData.availability,
    };

    setSaving(true);
    try {
      await api.post('/users/admin/create-walkin-technician/', payload);

      toast.success('Walk-in technician created successfully');
      onClose?.();
      onCreated?.();
    } catch (err) {
      console.error('Create technician failed:', err);
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v) => {
    if (!v) onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Add Walk-in Technician
          </DialogTitle>
          <DialogDescription>Create a new walk-in technician account</DialogDescription>
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
              placeholder="technician@cybersquad.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              pattern={EMAIL_REGEX.source}
              title="Please enter a valid email address"
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters with uppercase, lowercase, number, and special character.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              type="password"
              placeholder="Confirm password"
              value={formData.confirm_password}
              onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              type="tel"
              placeholder="+2348012345678"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              title="Please enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678"
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store">Store Location</Label>
            <Select
              value={formData.store}
              onValueChange={(value) => setFormData({ ...formData, store: value })}
              disabled={saving || loadingStores}
            >
              <SelectTrigger id="store">
                <SelectValue placeholder={loadingStores ? "Loading stores..." : "Select store"} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Expertise</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {EXPERTISE_OPTIONS.map((exp) => (
                <div key={exp} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`exp-${exp}`}
                    checked={formData.expertise.includes(exp)}
                    onCheckedChange={() => toggleExpertise(exp)}
                    disabled={saving}
                  />
                  <Label htmlFor={`exp-${exp}`} className="font-normal cursor-pointer">
                    {exp}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="years_experience">Years of Experience</Label>
            <Input
              id="years_experience"
              type="number"
              min="0"
              max="50"
              value={formData.years_experience}
              onChange={(e) => setFormData({ ...formData, years_experience: parseInt(e.target.value) || 0 })}
              required
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label htmlFor="availability">Availability</Label>
              <p className="text-sm text-muted-foreground">Is the technician currently available?</p>
            </div>
            <Switch
              id="availability"
              checked={formData.availability}
              onCheckedChange={(checked) => setFormData({ ...formData, availability: checked })}
              disabled={saving}
            />
          </div>

          {/* <div className="p-4 bg-purple-50 rounded-lg text-sm text-purple-900">
            The technician will receive an email with their login credentials and setup instructions.
          </div> */}

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
                'Create Technician'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
