import { useEffect, useMemo, useState } from "react";
import { humanizeLabel as formatLabel } from "../lib/text";
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

const PAYMENT_TYPE_OPTIONS = [
  "repair_fee",
  "diagnosis_fee",
  "shipping_fee",
  "service_fee",
  "corporate_parent_payment",
  "deposit",
  "balance",
];

const CHANNEL_OPTIONS = ["self_service", "walk_in", "corporate"];

function toDateTimeLocalValue(value) {
  if (!value) return "";

  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function toIsoDateTime(value) {
  if (!value) return undefined;

  try {
    return new Date(value).toISOString();
  } catch {
    return undefined;
  }
}


export function VoucherFormModal({ open, onClose, onSaved, voucher = null }) {
  const { api } = useApi();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    voucher_type: "percentage",
    discount_percentage: "",
    discount_amount: "",
    currency: "NGN",
    applicable_payment_types: [],
    applicable_channels: [],
    max_total_uses: "",
    max_uses_per_customer: "1",
    valid_from: "",
    valid_until: "",
    status: "active",
  });

  useEffect(() => {
    if (!open) return;

    setForm({
      code: voucher?.code || "",
      voucher_type: voucher?.voucher_type || "percentage",
      discount_percentage: voucher?.discount_percentage || "",
      discount_amount: voucher?.discount_amount || "",
      currency: voucher?.currency || "NGN",
      applicable_payment_types: Array.isArray(voucher?.applicable_payment_types)
        ? voucher.applicable_payment_types
        : [],
      applicable_channels: Array.isArray(voucher?.applicable_channels)
        ? voucher.applicable_channels
        : [],
      max_total_uses:
        voucher?.max_total_uses === null || voucher?.max_total_uses === undefined
          ? ""
          : String(voucher.max_total_uses),
      max_uses_per_customer:
        voucher?.max_uses_per_customer === null || voucher?.max_uses_per_customer === undefined
          ? "1"
          : String(voucher.max_uses_per_customer),
      valid_from: toDateTimeLocalValue(voucher?.valid_from),
      valid_until: toDateTimeLocalValue(voucher?.valid_until),
      status: voucher?.status || "active",
    });
  }, [open, voucher]);

  const isEditing = Boolean(voucher?.id);
  const isPercentageVoucher = form.voucher_type === "percentage";
  const isFixedAmountVoucher = form.voucher_type === "fixed_amount";

  const toggleListValue = (key, value, checked) => {
    setForm((prev) => {
      const currentValues = Array.isArray(prev[key]) ? prev[key] : [];
      const nextValues = checked
        ? Array.from(new Set([...currentValues, value]))
        : currentValues.filter((entry) => entry !== value);

      return {
        ...prev,
        [key]: nextValues,
      };
    });
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const payload = useMemo(() => {
    const nextPayload = {
      code: form.code.trim().toUpperCase(),
      voucher_type: form.voucher_type,
      currency: form.currency.trim().toUpperCase() || "NGN",
      applicable_payment_types: form.applicable_payment_types,
      applicable_channels: form.applicable_channels,
      max_total_uses: form.max_total_uses ? Number(form.max_total_uses) : undefined,
      max_uses_per_customer: form.max_uses_per_customer
        ? Number(form.max_uses_per_customer)
        : undefined,
      valid_from: toIsoDateTime(form.valid_from),
      valid_until: toIsoDateTime(form.valid_until),
      status: form.status,
    };

    if (isPercentageVoucher) {
      nextPayload.discount_percentage = form.discount_percentage || "0.00";
    }

    if (isFixedAmountVoucher) {
      nextPayload.discount_amount = form.discount_amount || "0.00";
    }

    return Object.fromEntries(
      Object.entries(nextPayload).filter(([, value]) => value !== undefined)
    );
  }, [form, isFixedAmountVoucher, isPercentageVoucher]);

  const handleSave = async () => {
    if (!payload.code) {
      toast.error("Voucher code is required.");
      return;
    }

    if (isPercentageVoucher && !form.discount_percentage) {
      toast.error("Discount percentage is required for percentage vouchers.");
      return;
    }

    if (isFixedAmountVoucher && !form.discount_amount) {
      toast.error("Discount amount is required for fixed amount vouchers.");
      return;
    }

    setSaving(true);

    try {
      if (isEditing) {
        await api.patch(`/vouchers/admin/${voucher.id}/`, payload);
        toast.success("Voucher updated.");
      } else {
        await api.post("/vouchers/admin/", payload);
        toast.success("Voucher created.");
      }

      onSaved?.();
      onClose?.();
    } catch (error) {
      console.error("Failed to save voucher:", error);
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error?.message ||
          error?.response?.data?.detail ||
          "Failed to save voucher."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Voucher" : "Create Voucher"}</DialogTitle>
          <DialogDescription>
            Set discount rules, usage limits, and scope for this voucher.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Voucher Code</Label>
              <Input
                value={form.code}
                onChange={(event) => setField("code", event.target.value)}
                placeholder="WELCOME20"
              />
            </div>

            <div className="space-y-2">
              <Label>Voucher Type</Label>
              <Select
                value={form.voucher_type}
                onValueChange={(value) => setField("voucher_type", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                  <SelectItem value="full_waiver">Full Waiver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {isPercentageVoucher && (
              <div className="space-y-2">
                <Label>Discount Percentage</Label>
                <Input
                  type="number"
                  value={form.discount_percentage}
                  onChange={(event) => setField("discount_percentage", event.target.value)}
                  placeholder="20.00"
                />
              </div>
            )}

            {isFixedAmountVoucher && (
              <div className="space-y-2">
                <Label>Discount Amount</Label>
                <Input
                  type="number"
                  value={form.discount_amount}
                  onChange={(event) => setField("discount_amount", event.target.value)}
                  placeholder="5000.00"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(event) => setField("currency", event.target.value.toUpperCase())}
                placeholder="NGN"
                maxLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setField("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <Label>Applicable Payment Types</Label>
            <div className="grid gap-4 md:grid-cols-2">
              {PAYMENT_TYPE_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-4 rounded-lg border px-4 py-2">
                  <Checkbox
                    checked={form.applicable_payment_types.includes(option)}
                    onCheckedChange={(checked) =>
                      toggleListValue("applicable_payment_types", option, checked === true)
                    }
                  />
                  <span className="text-sm">{formatLabel(option)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <Label>Applicable Channels</Label>
            <div className="grid gap-4 md:grid-cols-3">
              {CHANNEL_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-4 rounded-lg border px-4 py-2">
                  <Checkbox
                    checked={form.applicable_channels.includes(option)}
                    onCheckedChange={(checked) =>
                      toggleListValue("applicable_channels", option, checked === true)
                    }
                  />
                  <span className="text-sm">{formatLabel(option)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Maximum Total Uses</Label>
              <Input
                type="number"
                value={form.max_total_uses}
                onChange={(event) => setField("max_total_uses", event.target.value)}
                placeholder="100"
              />
            </div>

            <div className="space-y-2">
              <Label>Maximum Uses Per Customer</Label>
              <Input
                type="number"
                value={form.max_uses_per_customer}
                onChange={(event) => setField("max_uses_per_customer", event.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valid From</Label>
              <Input
                type="datetime-local"
                value={form.valid_from}
                onChange={(event) => setField("valid_from", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Valid Until</Label>
              <Input
                type="datetime-local"
                value={form.valid_until}
                onChange={(event) => setField("valid_until", event.target.value)}
              />
            </div>
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
                Save Voucher
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
