import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

export function CreateServiceModal({
  open,
  onClose,
  onCreated,
  deviceCategories = [],
  defaultCategoryName = "other",
}) {
  const { api } = useApi();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    title: "",
    service_type: defaultCategoryName,
    base_price: "",
    sla_hours: "36",
    description: "",
    expertise_tags: "", // comma separated in UI
  });

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;

    setForm((prev) => {
      const availableTypes = deviceCategories.map((category) => category.name);
      const nextServiceType =
        availableTypes.includes(prev.service_type) || availableTypes.length === 0
          ? prev.service_type
          : defaultCategoryName;

      return {
        ...prev,
        service_type: nextServiceType || defaultCategoryName,
      };
    });
  }, [defaultCategoryName, deviceCategories, open]);

  const handleCreate = async () => {
    if (!form.code.trim()) return toast.error("Service code is required");
    if (!form.name.trim()) return toast.error("Service name is required");
    if (!form.title.trim()) return toast.error("Service title is required");

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        service_type: form.service_type,
        title: form.title.trim(),
        base_price: String(form.base_price || "0.00"),
        currency: "NGN",
        is_active: false, // ✅ create as inactive (as you requested)
        sla_hours: Number(form.sla_hours || 36),
        expertise_tags: form.expertise_tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        description: form.description.trim(),
      };

      await api.post("/jobs/services/", payload);

      toast.success("Service created successfully");
      onCreated?.();
    } catch (e) {
      console.error("Create service failed:", e);
      toast.error("Failed to create service");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="w-[96vw] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Service</DialogTitle>
          <DialogDescription>
            Creates a new service as <span className="font-medium">inactive</span> by default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setField("code", e.target.value)} placeholder="e.g. PHONE-SCREEN" />
            </div>

            <div className="space-y-1">
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={(v) => setField("service_type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deviceCategories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Phone Screen" />
          </div>

          <div className="space-y-1">
            <Label>Title (customer-facing)</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. My phone screen is cracked..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Base Price (NGN)</Label>
              <Input type="number" value={form.base_price} onChange={(e) => setField("base_price", e.target.value)} placeholder="0" />
            </div>

            <div className="space-y-1">
              <Label>SLA (hours)</Label>
              <Input type="number" value={form.sla_hours} onChange={(e) => setField("sla_hours", e.target.value)} placeholder="36" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Expertise Tags (comma separated)</Label>
            <Input value={form.expertise_tags} onChange={(e) => setField("expertise_tags", e.target.value)} placeholder="screen, diagnosis" />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Describe the service..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Service
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
