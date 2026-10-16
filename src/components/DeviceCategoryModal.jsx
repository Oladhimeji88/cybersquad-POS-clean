import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

function slugifyCategoryName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function DeviceCategoryModal({
  open,
  onClose,
  onSaved,
  category = null,
}) {
  const { api } = useApi();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    label: "",
    description: "",
    is_active: true,
    is_default: false,
    sort_order: "0",
  });

  useEffect(() => {
    if (!open) return;

    setForm({
      name: category?.name || "",
      label: category?.label || "",
      description: category?.description || "",
      is_active: category?.is_active ?? true,
      is_default: category?.is_default ?? false,
      sort_order: String(category?.sort_order ?? 0),
    });
  }, [category, open]);

  const isEditing = Boolean(category?.id);

  const normalizedName = useMemo(() => slugifyCategoryName(form.name), [form.name]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!normalizedName) {
      toast.error("Category name is required.");
      return;
    }

    if (!form.label.trim()) {
      toast.error("Category label is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: normalizedName,
        label: form.label.trim(),
        description: form.description.trim(),
        is_active: Boolean(form.is_active),
        is_default: Boolean(form.is_default),
        sort_order: Number(form.sort_order || 0),
      };

      if (isEditing) {
        await api.patch(`/jobs/device-categories/${category.id}/`, payload);
        toast.success("Device category updated.");
      } else {
        await api.post("/jobs/device-categories/", payload);
        toast.success("Device category created.");
      }

      onSaved?.();
      onClose?.();
    } catch (error) {
      console.error("Failed to save device category:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          "Failed to save device category."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Device Category" : "Add Device Category"}</DialogTitle>
          <DialogDescription>
            Frontdesk ticket creation reads from this list. Active categories will appear in the
            intake dropdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="e.g. projector"
              />
              <p className="text-xs text-muted-foreground">
                Saved as <span className="font-mono">{normalizedName || "projector"}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(event) => setField("label", event.target.value)}
                placeholder="e.g. Projector"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Optional internal note for this category"
              className="min-h-[96px]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[160px_1fr_1fr]">
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(event) => setField("sort_order", event.target.value)}
                placeholder="0"
              />
            </div>

            <label className="flex items-center gap-4 rounded-lg border p-4">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) => setField("is_active", checked === true)}
              />
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Show in frontdesk forms</p>
              </div>
            </label>

            <label className="flex items-center gap-4 rounded-lg border p-4">
              <Checkbox
                checked={form.is_default}
                onCheckedChange={(checked) => setField("is_default", checked === true)}
              />
              <div>
                <p className="text-sm font-medium">Default</p>
                <p className="text-xs text-muted-foreground">Fallback choice for new tickets</p>
              </div>
            </label>
          </div>
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
                Save Category
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
