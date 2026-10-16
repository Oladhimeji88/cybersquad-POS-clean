import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

const PERMISSION_FIELD_MAP = {
  Dashboard: "privilege_dashboard",
  "User Management": "privilege_user_management",
  "Job Management": "privilege_job_management",
  "Front Desk Management": "privilege_front_desk_management",
  "Lead Engineer Management": "privilege_lead_engineer_management",
  "Inventory Management": "privilege_inventory_management",
  "Payment & Finance": "privilege_payments_finance",
  "Can Approve Payouts": "can_approve_payouts",
  "Dispute Management": "privilege_dispute_management",
  "Reports & Analytics": "privilege_reports_analytics",
  "POS / Sales": "privilege_pos",
  "System Settings": "privilege_system_settings",
  "Backup Operator": "privilege_backup_operator",
  "Backup Approver": "privilege_backup_approver",
  "Backup Force Restore": "privilege_backup_force_restore",
  "Backup Lock Admin": "privilege_backup_lock_admin",
};

export function CreateRoleModal({ open, onClose, onCreated }) {
  const { api } = useApi();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
  });

  const [permissions, setPermissions] = useState({
    Dashboard: false,
    "User Management": false,
    "Job Management": false,
    "Front Desk Management": false,
    "Lead Engineer Management": false,
    "Inventory Management": false,
    "Payment & Finance": false,
    "Can Approve Payouts": false,
    "Dispute Management": false,
    "Reports & Analytics": false,
    "POS / Sales": false,
    "System Settings": false,
    "Backup Operator": false,
    "Backup Approver": false,
    "Backup Force Restore": false,
    "Backup Lock Admin": false,
  });

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const togglePermission = (permissionLabel) => {
    setPermissions((prev) => ({
      ...prev,
      [permissionLabel]: !prev[permissionLabel],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Role name is required");
      return;
    }

    setLoading(true);

    const payload = {
      name: formData.name,
      description: formData.description,
      active: formData.active,
    };

    Object.entries(PERMISSION_FIELD_MAP).forEach(([uiLabel, apiField]) => {
      payload[apiField] = Boolean(permissions[uiLabel]);
    });

    try {
      await api.post("/platform/admin-roles/", payload);
      toast.success("Admin role created successfully");
      
      // Reset form
      setFormData({ name: "", description: "", active: true });
      setPermissions(Object.keys(permissions).reduce((acc, key) => ({ ...acc, [key]: false }), {}));
      
      onCreated();
      onClose();
    } catch (error) {
      console.error("Create role error:", error);
      toast.error(error?.response?.data?.message || "Failed to create admin role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Admin Role</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Role Name*</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Front Desk Manager"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe what this role does..."
              value={formData.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="active" className="font-semibold">Is Active</Label>
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: checked }))}
            />
          </div>

          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-semibold mb-4">Role Permissions</h4>
            <div className="space-y-4">
              {Object.entries(permissions).map(([permission, enabled]) => (
                <div
                  key={permission}
                  className="flex items-center justify-between"
                >
                  <Label htmlFor={`create-perm-${permission}`} className="text-sm font-normal">
                    {permission}
                  </Label>
                  <Switch
                    id={`create-perm-${permission}`}
                    checked={enabled}
                    onCheckedChange={() => togglePermission(permission)}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Role"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
