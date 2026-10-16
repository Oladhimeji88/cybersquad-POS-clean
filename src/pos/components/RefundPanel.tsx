import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuth } from "@/frontdesk/lib/store";
import { userHasRole } from "@/auth/roleUtils";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { createRefund, getRefunds, refundableQuantity, refundLineValue, updateRefund, decideRefund, getSalePayments, REFUND_APPROVAL_LIMIT, type Sale, type Refund, type RefundLine, type SalePaymentMode } from "../lib/store";
import { printRefundReceipt } from "../lib/receipt";

export default function RefundPanel({ sale, onChanged }: { sale: Sale; onChanged?: () => void }) {
  const [refunds, setRefunds] = useState<Refund[]>([]); const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<RefundLine[]>([]); const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<Refund["condition"]>("resellable");
  const [mode, setMode] = useState<SalePaymentMode>("cash"); const [cashPaid, setCashPaid] = useState(false);
  const [actor, setActor] = useState(""); const [role, setRole] = useState(""); const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false); const [references, setReferences] = useState<Record<string, string>>({});
  const [depositAmount, setDepositAmount] = useState("");
  const refresh = () => getRefunds().then(setRefunds);
  useEffect(() => { refresh().catch(() => toast.error("Could not load refunds."));
    getAuth().then((user) => { setActor(user?.name ?? ""); setRole(userHasRole(user, "admin") ? "admin" : user?.role ?? ""); setAllowed(userHasRole(user, "sales", "admin")); });
  }, [sale.id]);
  const related = refunds.filter((refund) => refund.saleId === sale.id);
  const deposit = sale.lifecycle === "reserved";
  const availableMoney = getSalePayments(sale).reduce((sum, payment) => sum + payment.amount, 0) -
    related.filter((refund) => refund.status !== "cancelled").reduce((sum, refund) => sum + refund.total, 0);
  const total = deposit ? Number(depositAmount) || 0 : selection.reduce((sum, line) => sum + refundLineValue(sale, line.lineIndex, line.quantity), 0);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); try { await action(); await refresh(); onChanged?.(); } catch (error) { toast.error(error instanceof Error ? error.message : "Refund action failed."); } finally { setBusy(false); }
  };
  return <section className="space-y-4 border-t border-border pt-4">
    <div className="flex justify-between items-center"><h3 className="font-semibold">Refunds</h3>
      {allowed && sale.lifecycle !== "cancelled" && availableMoney > 0 && <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Close form" : deposit ? "Refund deposit" : "Return / refund"}</Button>}
    </div>
    {editing && <form className="space-y-4 rounded-lg border border-border p-4" onSubmit={(event) => {
      event.preventDefault(); void run(async () => {
        await createRefund({ saleId: sale.id, lines: deposit ? [] : selection, reason, condition: deposit ? "not_returned" : condition, mode, actor, actorRole: role, cashPaid, depositAmount: Number(depositAmount) });
        setEditing(false); setSelection([]); setReason(""); setCashPaid(false);
        toast.success(role !== "admin" && total > REFUND_APPROVAL_LIMIT ? "Refund sent for admin approval." : mode === "cash" ? "Cash refund recorded." : "Refund recorded as awaiting repayment.");
      });
    }}>
      {deposit ? <><Label htmlFor="refund-deposit">Deposit to repay (maximum {formatCurrency(availableMoney)})</Label><Input id="refund-deposit" type="number" step="0.01" min="0.01" max={availableMoney} required value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></> :
        sale.lines.map((line, index) => {
          const chosen = selection.find((entry) => entry.lineIndex === index);
          const remaining = refundableQuantity(sale, index, refunds);
          const change = (quantity: number, deviceIds: string[]) => setSelection((current) => [...current.filter((entry) => entry.lineIndex !== index), ...(quantity > 0 ? [{ lineIndex: index, quantity, deviceIds }] : [])]);
          return <div key={index} className="border-b border-border pb-2 space-y-2"><p className="text-sm font-medium">{line.name} · {remaining} refundable</p>
            {line.tracking === "serial" ? line.devices?.map((unit) => {
              const returned = related.some((refund) => refund.status !== "cancelled" && refund.lines.some((entry) => entry.deviceIds.includes(unit.id)));
              return <label key={unit.id} className="flex gap-2 text-sm"><input type="checkbox" disabled={returned || busy} checked={chosen?.deviceIds.includes(unit.id) ?? false}
                onChange={(event) => { const ids = event.target.checked ? [...(chosen?.deviceIds ?? []), unit.id] : (chosen?.deviceIds ?? []).filter((id) => id !== unit.id); change(ids.length, ids); }} />
                {unit.imei ?? unit.serialNumber}{returned ? " ? already returned" : ""}</label>;
            }) : <Input type="number" min={0} max={remaining} step={1} aria-label={"Return quantity for " + line.name} value={chosen?.quantity ?? 0} onChange={(event) => change(Number(event.target.value), [])} />}
          </div>;
        })}
      <Label htmlFor="refund-reason">Reason</Label><Input id="refund-reason" required value={reason} onChange={(event) => setReason(event.target.value)} />
      {!deposit && <label className="block text-sm">Returned condition<select aria-label="Returned condition" className="block w-full border rounded p-2 bg-background" value={condition} onChange={(event) => setCondition(event.target.value as Refund["condition"])}>
        <option value="resellable">Resellable ? inventory review required</option><option value="faulty">Faulty ? keep out of available stock</option><option value="not_returned">Item not returned</option>
      </select></label>}
      <label className="block text-sm">Repayment method<select aria-label="Refund method" className="block w-full border rounded p-2 bg-background" value={mode} onChange={(event) => setMode(event.target.value as SalePaymentMode)}>
        <option value="cash">Cash</option><option value="pos">Card terminal</option><option value="bank_transfer">Bank transfer</option>
      </select></label>
      {mode === "cash" && (role === "admin" || total <= REFUND_APPROVAL_LIMIT) ? <label className="flex gap-2 text-sm"><input type="checkbox" required checked={cashPaid} onChange={(event) => setCashPaid(event.target.checked)} />I have handed this cash to the customer.</label> :
        <p className="text-sm text-muted-foreground">{role !== "admin" && total > REFUND_APPROVAL_LIMIT ? "Refunds above " + formatCurrency(REFUND_APPROVAL_LIMIT) + " need admin approval before any money is repaid. " : ""}This records a pending refund. Confirm repayment with its reference after the card or bank refund has completed.</p>}
      <p className="font-medium">Refund amount: {formatCurrency(total)}</p><Button disabled={busy || total <= 0} type="submit">{busy ? "Saving..." : "Record refund"}</Button>
    </form>}
    {!related.length && <p className="text-sm text-muted-foreground">No refunds recorded.</p>}
    {related.map((refund) => <div key={refund.id} className="rounded-lg border border-border p-4 space-y-2 text-sm">
      <p className="font-medium">{formatCurrency(refund.total)} · {refund.status} · {refund.mode.replaceAll("_", " ")}</p>
      <p>{refund.reason} · {refund.actor}</p><p className="text-muted-foreground">Stock disposition: {refund.condition.replaceAll("_", " ")}. Inventory release is separate.</p>
      {refund.reference && <p>Repayment reference: {refund.reference}</p>}
      {refund.cancellationReason && <p>Cancelled: {refund.cancellationReason}</p>}
      <Button size="sm" variant="outline" onClick={() => printRefundReceipt(refund, sale)}>Print refund record</Button>
      {refund.approval && <p>Approval: {refund.approval.status}{refund.approval.by ? " by " + refund.approval.by : ""}{refund.approval.note ? " · " + refund.approval.note : ""}</p>}
      {refund.status === "pending" && refund.approval?.status === "required" && (role === "admin" ? <div className="space-y-2">
        <Input aria-label={"Approval note for " + refund.id} placeholder="Approval note / rejection reason" value={references[refund.id] ?? ""} onChange={(event) => setReferences({ ...references, [refund.id]: event.target.value })} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => decideRefund(refund.id, "approved", actor, role, references[refund.id] ?? ""))}>Approve</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => decideRefund(refund.id, "rejected", actor, role, references[refund.id] ?? ""))}>Reject</Button></div>
      </div> : <p className="text-muted-foreground">Waiting for an admin to approve this refund.</p>)}
      {allowed && refund.status === "pending" && refund.approval?.status !== "required" && <div className="space-y-2"><Input aria-label={"Repayment reference for " + refund.id} placeholder="Repayment reference / cancellation reason" value={references[refund.id] ?? ""} onChange={(event) => setReferences({ ...references, [refund.id]: event.target.value })} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => updateRefund(refund.id, "paid", references[refund.id] ?? ""))}>Confirm repayment</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => updateRefund(refund.id, "cancelled", references[refund.id] ?? ""))}>Cancel request</Button></div></div>}
    </div>)}
  </section>;
}
