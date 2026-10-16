import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

export function EditServiceModal({
  open,
  onClose,
  onSaved,
  service = null,
  deviceCategories = [],
}) {
  const { api } = useApi();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    title: "",
    description: "",
    service_type: "",
    base_price: "",
    is_active: true,
  });

  useEffect(() => {
    if (!open) return;

    setForm({
      name: service?.name || "",
      title: service?.title || "",
      description: service?.description || "",
      service_type: service?.service_type || "",
      base_price:
        service?.base_price === null || service?.base_price === undefined
          ? ""
          : String(service.base_price),
      is_active: service?.is_active ?? true,
    });
  }, [service, open]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!service?.id) return;

    if (!form.name.trim()) {
      toast.error("Service name is required.");
      return;
    }

    if (!form.title.trim()) {
      toast.error("Service title is required.");
      return;
    }

    if (!form.service_type) {
      toast.error("Service type is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        service_type: form.service_type,
        base_price: String(form.base_price === "" ? "0.00" : form.base_price),
        is_active: Boolean(form.is_active),
      };

      const res = await api.patch(`/jobs/services/${service.id}/`, payload);
      const updated = res?.data?.result || { ...service, ...payload };
      toast.success("Service updated.");
      onSaved?.(updated);
      onClose?.();
    } catch (error) {
      console.error("Failed to update service:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Failed to update service."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Service</DialogTitle>
          <DialogDescription>
            Update the service details, pricing, and active status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Service</Label>
              <Input
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="e.g. Phone Screen"
              />
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                placeholder="Customer-facing title"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.service_type}
                onValueChange={(value) => setField("service_type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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

            <div className="space-y-2">
              <Label>Base Price (NGN)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.base_price}
                onChange={(event) => setField("base_price", event.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Describe the service..."
              className="min-h-[60px]"
            />
          </div>

          <label className="flex items-center gap-4 rounded-lg border p-2">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(checked) =>
                setField("is_active", checked === true)
              }
            />
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive services are hidden from frontdesk pricing flows.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Service
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditServiceModal;
