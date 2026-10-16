import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditLog, type AuditEntry } from "@/pos/lib/store";
import { DEFAULT_POLICY, getPolicy, savePolicy, type OpsPolicy } from "./policy";
import { Choice, EmptyState, errorMessage, Field } from "./shared";

const NUMBER_FIELDS: [keyof OpsPolicy, string, string][] = [
  ["sourcingTargetMinutes", "Customer fulfilment target (minutes)", "Shown as elapsed time and escalated. It is a target, not a promise to the customer."],
  ["supplierToStoreMinutes", "Supplier-to-store target (minutes)", "Movement ambition where practical."],
  ["marginPercent", "Default margin on supplier cost (%)", "Suggests the customer price. Procurement can override it."],
  ["offerValidHours", "Customer offer validity (hours)", "After this a new offer is needed before the customer can commit."],
  ["repairAgedDays", "Repair counts as aged after (days)", "Days without an update before it is flagged as an exception."],
  ["supplierAckHours", "Supplier acknowledgement (hours)", "A purchase order with no supplier confirmation after this long is flagged."],
  ["quoteValidDays", "Quote validity (days)", "How long a sent quote can be accepted."],
  ["reservationHours", "Stock reservation hold (hours)", "After this a reservation expires and shows as an exception."],
  ["codAgedDays", "COD not remitted after (days)", "Delivered cash-on-delivery older than this is flagged."],
];
const LIMIT_FIELDS: [keyof OpsPolicy, string, string][] = [
  ["expenseApprovalLimit", "Spending needing approval above", "Fixed assets always need approval. The approver cannot be the requester."],
  ["discountApprovalPercent", "Quote discount needing approval above (%)", "A manager approves before the quote is sent."],
  ["varianceApprovalValue", "Stock variance needing approval above", "Value of the difference, not the unit count."],
  ["recoveryApprovalLimit", "Service recovery needing approval above", "Gestures to customers after a service failure."],
  ["lowStockThreshold", "Low stock at or below (units)", "Suggests a replenishment decision; never buys by itself."],
];
const UPDATE_FIELDS: [keyof OpsPolicy, string][] = [["updateUrgentHours", "Urgent"], ["updateHighHours", "High"], ["updateMediumHours", "Medium"], ["updateLowHours", "Low"]];

export default function AuditPolicy({ actor, canEdit = false }: { actor: string; canEdit?: boolean }) {
  const [policy, setPolicy] = useState<OpsPolicy>(DEFAULT_POLICY); const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<AuditEntry[]>([]); const [query, setQuery] = useState("");
  useEffect(() => { void getPolicy().then(setPolicy); void getAuditLog().then(setLog).catch(() => toast.error("Could not load the audit trail.")); }, []);
  const shown = log.filter((entry) => (entry.action + " " + entry.detail + " " + entry.actor).toLowerCase().includes(query.toLowerCase())).slice(-150).reverse();
  return <div className="space-y-6">
    <Card>
      <CardHeader><CardTitle>Operating policy</CardTitle><CardDescription>Rules that are still open or likely to change live here instead of in code. Every change is recorded below.</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={async (event) => { event.preventDefault(); setBusy(true);
          try { setPolicy(await savePolicy(actor, policy)); setLog(await getAuditLog()); toast.success("Policy saved."); }
          catch (error) { toast.error(errorMessage(error, "Could not save policy.")); } finally { setBusy(false); } }}>
          <div className="grid gap-6 md:grid-cols-2">
            {[...NUMBER_FIELDS, ...LIMIT_FIELDS].map(([key, label, hint]) => <Field key={key} label={label} hint={hint}>
              <Input type="number" min="0" step="any" required disabled={!canEdit} value={String(policy[key])} onChange={(event) => setPolicy({ ...policy, [key]: Number(event.target.value) })} /></Field>)}
            <div className="md:col-span-2"><Field label="Customer update standard (hours between updates, by complaint severity)">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{UPDATE_FIELDS.map(([key, label]) => <div key={key} className="space-y-1"><span className="text-xs text-muted-foreground">{label}</span>
                <Input aria-label={label + " severity hours"} type="number" min="0" step="any" required disabled={!canEdit} value={String(policy[key])} onChange={(event) => setPolicy({ ...policy, [key]: Number(event.target.value) })} /></div>)}</div></Field></div>
            <Field label="Direct-sale packaging" hint="Open decision. Until it is decided, direct deliveries do not require a packaging check.">
              <Choice label="Direct-sale packaging" disabled={!canEdit} value={policy.directPackaging} onChange={(value) => setPolicy({ ...policy, directPackaging: value as OpsPolicy["directPackaging"] })}
                options={[["undecided", "Not decided yet"], ["required", "Required before delivery"], ["not_required", "Not required"]]} /></Field>
          </div>
          {canEdit ? <Button disabled={busy} type="submit">{busy ? "Saving..." : "Save policy"}</Button> : <p className="text-sm text-muted-foreground">Only management can change policy. You can see the current rules.</p>}
        </form>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Audit trail</CardTitle><CardDescription>Sales, refunds, sourcing, returns and policy changes. Entries are append-only.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Input aria-label="Search audit trail" placeholder="Search by action, reference or person" value={query} onChange={(event) => setQuery(event.target.value)} />
        {shown.length ? <ul className="divide-y divide-border">{shown.map((entry) => <li key={entry.id} className="space-y-1 py-4 text-sm">
          <p><span className="font-medium">{entry.action.replaceAll("_", " ")}</span> <span className="text-muted-foreground">· {entry.actor} · {new Date(entry.at).toLocaleString()}</span></p>
          <p className="text-muted-foreground">{entry.detail}</p></li>)}</ul>
          : <EmptyState icon={ScrollText}>No matching entries.</EmptyState>}
      </CardContent>
    </Card>
  </div>;
}
