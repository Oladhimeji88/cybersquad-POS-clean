import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getCustomerDirectory, saveCustomer, normalizePhone, type DirectoryCustomer } from "./business";
import type { SaleCustomer } from "@/pos/lib/devices";

export default function CustomerPicker({ value, onChange }: { value?: SaleCustomer; onChange: (customer: SaleCustomer) => void }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<DirectoryCustomer[]>([]);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "" }); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) getCustomerDirectory().then(setCustomers).catch(() => toast.error("Could not load customers.")); }, [open]);
  const matches = customers.filter((customer) => (customer.name + " " + customer.phone + " " + customer.email).toLowerCase().includes(query.toLowerCase()) ||
    Boolean(query.replace(/\D/g, "") && normalizePhone(customer.phone).includes(normalizePhone(query))));
  const choose = (customer: SaleCustomer) => { onChange(customer); setOpen(false); };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>{value?.name ? "Change customer" : "Select / add customer"}</Button>
      {value?.name && <><span className="text-sm">{value.name} · {value.phone}</span><Button type="button" variant="ghost" onClick={() => onChange({ name: "", phone: "" })}>Clear</Button></>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent style={{ maxWidth: "36rem", maxHeight: "85vh", overflowY: "auto" }}>
      <DialogHeader><DialogTitle>Customers</DialogTitle><DialogDescription>Search existing customers or create a contact without losing the current sale.</DialogDescription></DialogHeader>
      <Input aria-label="Search customers" placeholder="Name, phone or email" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {matches.slice(0, 30).map((customer) => <button type="button" key={customer.id} className="w-full text-left border border-border rounded-lg p-4 hover:bg-secondary" onClick={() => choose(customer)}>
          <span className="block font-medium">{customer.name}</span><span className="text-sm text-muted-foreground">{customer.phone} · {customer.email}</span>
        </button>)}
        {!matches.length && <p className="text-sm text-muted-foreground">No matching customer.</p>}
      </div>
      <form className="border-t border-border pt-4 space-y-4" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true);
        try {
          const existing = customers.find((customer) => normalizePhone(customer.phone) === normalizePhone(draft.phone));
          if (existing) { toast.info("This phone is already registered. Existing customer selected."); choose(existing); }
          else choose(await saveCustomer(draft));
          setDraft({ name: "", phone: "", email: "" });
        } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save customer."); }
        finally { setBusy(false); }
      }}>
        <p className="font-medium">Add customer</p>
        <Label htmlFor="directory-name">Name</Label><Input id="directory-name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <Label htmlFor="directory-phone">Phone</Label><Input id="directory-phone" type="tel" required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        <Label htmlFor="directory-email">Email (optional)</Label><Input id="directory-email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        <Button disabled={busy} type="submit">{busy ? "Saving..." : "Save and select customer"}</Button>
      </form>
    </DialogContent></Dialog>
  </div>;
}
