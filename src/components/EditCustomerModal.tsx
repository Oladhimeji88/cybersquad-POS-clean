import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { normalizeNigerianPhone } from "@/utils/phoneNumber";

export interface EditableCustomer {
  id: number | string;
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  profile?: {
    id: number | string;
    full_name?: string;
    address?: string;
    city?: string;
    lga?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

interface FormState {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  full_name: string;
  address: string;
  city: string;
  lga: string;
  state: string;
  country: string;
  postal_code: string;
}

const EMPTY_STATE: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  full_name: "",
  address: "",
  city: "",
  lga: "",
  state: "",
  country: "",
  postal_code: "",
};

function buildInitialState(customer: EditableCustomer | null): FormState {
  if (!customer) return { ...EMPTY_STATE };
  const profile = customer.profile ?? {};
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone_number: customer.phone_number ?? "",
    full_name: profile.full_name ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    lga: profile.lga ?? "",
    state: profile.state ?? "",
    country: profile.country ?? "",
    postal_code: profile.postal_code ?? "",
  };
}

const TOP_LEVEL_FIELDS = ["first_name", "last_name", "email", "phone_number"] as const;
const PROFILE_FIELDS = ["full_name", "address", "city", "lga", "state", "country", "postal_code"] as const;

export interface EditCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: EditableCustomer | null;
  onUpdated?: (updated: EditableCustomer) => void;
  title?: string;
  description?: string;
}

export function EditCustomerModal({
  open,
  onOpenChange,
  customer,
  onUpdated,
  title = "Edit Customer Details",
  description = "Update the customer's contact and address information.",
}: EditCustomerModalProps) {
  const { api } = useApi();
  const [form, setForm] = useState<FormState>(() => buildInitialState(customer));
  const [submitting, setSubmitting] = useState(false);

  const initialState = useMemo(() => buildInitialState(customer), [customer]);

  useEffect(() => {
    if (open) setForm(initialState);
  }, [open, initialState]);

  const customerId = customer?.id;

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error("Customer id is missing. Cannot update.");
      return;
    }

    const topLevel: Record<string, string> = {};
    TOP_LEVEL_FIELDS.forEach((key) => {
      if (form[key].trim() !== (initialState[key] || "").trim()) {
        topLevel[key] = form[key].trim();
      }
    });

    if (typeof topLevel.phone_number === "string" && topLevel.phone_number.length > 0) {
      const normalizedPhone = normalizeNigerianPhone(topLevel.phone_number);
      if (!normalizedPhone) {
        toast.error("Please enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678");
        return;
      }
      topLevel.phone_number = normalizedPhone;
    }

    const profileData: Record<string, string> = {};
    PROFILE_FIELDS.forEach((key) => {
      if (form[key].trim() !== (initialState[key] || "").trim()) {
        profileData[key] = form[key].trim();
      }
    });

    if (Object.keys(topLevel).length === 0 && Object.keys(profileData).length === 0) {
      toast.info("No changes to save.");
      return;
    }

    const payload: Record<string, unknown> = { ...topLevel };
    if (Object.keys(profileData).length > 0) payload.profile_data = profileData;

    try {
      setSubmitting(true);
      const res = await api.patch(`/users/profile/customers/${customerId}/`, payload);
      const updated = res?.data?.result ?? res?.data;
      toast.success(res?.data?.message || "Customer updated successfully.");
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (err: any) {
      const apiMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.detail;
      const finalMsg =
        typeof apiMsg === "string" && apiMsg.trim()
          ? apiMsg
          : "Failed to update customer. Please try again.";
      toast.error(finalMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-6 py-1">
            <section className="space-y-4">
              <h4 className="font-medium text-sm">Contact</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ec-first-name">First name</Label>
                  <Input
                    id="ec-first-name"
                    value={form.first_name}
                    onChange={setField("first_name")}
                    placeholder="Tunde"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-last-name">Last name</Label>
                  <Input
                    id="ec-last-name"
                    value={form.last_name}
                    onChange={setField("last_name")}
                    placeholder="Ibrahim"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ec-full-name">Full name (display)</Label>
                  <Input
                    id="ec-full-name"
                    value={form.full_name}
                    onChange={setField("full_name")}
                    placeholder="Tunde Ibrahim"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-email">Email</Label>
                  <Input
                    id="ec-email"
                    type="email"
                    value={form.email}
                    onChange={setField("email")}
                    placeholder="tunde@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-phone">Phone</Label>
                  <Input
                    id="ec-phone"
                    type="tel"
                    inputMode="tel"
                    value={form.phone_number}
                    onChange={setField("phone_number")}
                    placeholder="08012345678"
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="font-medium text-sm">Address</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ec-address">Street address</Label>
                  <Input
                    id="ec-address"
                    value={form.address}
                    onChange={setField("address")}
                    placeholder="12 Allen Avenue"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-city">City</Label>
                  <Input id="ec-city" value={form.city} onChange={setField("city")} placeholder="Ikeja" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-lga">LGA</Label>
                  <Input id="ec-lga" value={form.lga} onChange={setField("lga")} placeholder="Ikeja" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-state">State</Label>
                  <Input id="ec-state" value={form.state} onChange={setField("state")} placeholder="Lagos" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-country">Country</Label>
                  <Input
                    id="ec-country"
                    value={form.country}
                    onChange={setField("country")}
                    placeholder="Nigeria"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ec-postal">Postal code</Label>
                  <Input
                    id="ec-postal"
                    value={form.postal_code}
                    onChange={setField("postal_code")}
                    placeholder="100271"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        <DialogFooter className="gap-2 px-6 py-4 border-t bg-background shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !customerId}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditCustomerModal;
