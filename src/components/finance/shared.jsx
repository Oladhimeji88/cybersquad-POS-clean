import { useState } from "react";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { AlertTriangle, CheckCircle2, CloudOff, FlaskConical, Loader2 } from "lucide-react";
import { prototypeEnabled, prototypeOutage, resetPrototypeLedger, setPrototypeEnabled, setPrototypeOutage } from "../../lib/finance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export const RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

export function RangeSelect({ value, onChange, className = "w-[150px]" }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="Date range"><SelectValue /></SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Who is recording a finance action (audit trail). Best effort — same stored
// "user" blob the rest of the admin reads.
export function currentActor() {
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    const user = stored?.user ?? stored;
    return user?.full_name || user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";
  } catch {
    return "Admin";
  }
}

const TONES = {
  green: "border-transparent bg-success/10 text-success",
  amber: "border-transparent bg-warning/15 text-warning",
  red: "border-transparent bg-error/10 text-error",
  blue: "border-transparent bg-primary/10 text-primary",
  grey: "border-transparent bg-secondary text-muted-foreground",
};
export const toneBadge = (tone, label) => <Badge className={TONES[tone] ?? TONES.grey}>{label}</Badge>;

const RECEIVABLE = {
  outstanding: ["amber", "Outstanding"], partially_paid: ["blue", "Partially Paid"], paid: ["green", "Paid"], overdue: ["red", "Overdue"],
};
export function ReceivableBadge({ status }) {
  const [tone, label] = RECEIVABLE[status] ?? ["grey", status ?? "-"];
  return toneBadge(tone, label);
}
const COD = {
  pending: ["amber", "Pending"], delivered: ["green", "Delivered"], collected: ["blue", "Collected"],
  settled: ["grey", "Settled"], cancelled: ["red", "Cancelled"],
};
export function CodBadge({ status }) {
  const [tone, label] = COD[status] ?? ["grey", status ?? "-"];
  return toneBadge(tone, label);
}

export function OdooBadge({ odoo }) {
  if (odoo?.state === "synced") return <Badge className={TONES.green}><CheckCircle2 />{odoo.reconciled ? "Reconciled" : "In Odoo"}</Badge>;
  if (odoo?.state === "failed") return <Badge className={TONES.red} title={odoo.error}><AlertTriangle />Sync failed</Badge>;
  return <Badge className={TONES.grey}><CloudOff />Not in Odoo</Badge>;
}

export const fmtDate = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export function LoadingRow({ label = "Loading..." }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

// Shown instead of numbers when the Odoo-backed endpoint isn't deployed or
// failed — never a fabricated zero.
export function OdooUnavailable({ what }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{what} come from Odoo and could not be loaded. They will appear here once the finance endpoint is available; nothing is estimated in the meantime.</span>
      </CardContent>
    </Card>
  );
}

export function SyncFailureBanner({ count }) {
  if (!count) return null;
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {count} record{count === 1 ? "" : "s"} failed to sync to Odoo. Open the item and use Retry; nothing has been posted twice.
    </div>
  );
}

export function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return { pages, current, slice: rows.slice((current - 1) * size, current * size) };
}
export function Pager({ page, pages, total, size, onPage }) {
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>{total === 0 ? "No records" : `Showing ${(page - 1) * size + 1}-${Math.min(page * size, total)} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        <span>{page} / {pages}</span>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  );
}

// Shown on every finance screen while prototype mode stands in for Odoo.
export function PrototypeBanner() {
  const [outage, setOutage] = useState(prototypeOutage());
  if (!prototypeEnabled()) return null;
  const toggleOutage = () => { setPrototypeOutage(!outage); setOutage(!outage); };
  const reset = () => { if (window.confirm("Reset the demo Odoo invoices, bills and payments?")) { resetPrototypeLedger(); window.location.reload(); } };
  const turnOff = () => { setPrototypeEnabled(false); window.location.reload(); };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>Prototype mode: Odoo is simulated in this browser. COD orders, settlements and POS refunds are real local records.</span>
      <span className="ml-auto flex gap-3">
        <button type="button" className="underline" onClick={toggleOutage}>{outage ? "End simulated outage" : "Simulate Odoo outage"}</button>
        <button type="button" className="underline" onClick={reset}>Reset demo Odoo</button>
        <button type="button" className="underline" onClick={turnOff}>Use real Odoo only</button>
      </span>
    </div>
  );
}
