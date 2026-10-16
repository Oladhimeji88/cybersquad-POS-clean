import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useApi } from "../../hooks/useApi";
import { recordLedgerPayment } from "../../lib/finance";
import { formatCurrency } from "../../lib/currency";
import { logAudit } from "../../pos/lib/store";
import { currentActor, ReceivableBadge } from "./shared";

const today = () => new Date().toISOString().slice(0, 10);

// Payment against an Odoo invoice (kind="receivable") or vendor bill (kind="payable").
// Speedef settlements use RecordPaymentDialog instead, which also updates the COD orders.
export function LedgerPaymentDialog({ kind, row, onOpenChange, onRecorded }) {
  const { api } = useApi();
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (row) { setReference(""); setAmount(String(row.balance)); setPaidOn(today()); setNotes(""); setError(""); }
  }, [row]);

  if (!row) return null;
  const payable = kind === "payable";

  const submit = async () => {
    setError("");
    const value = Number(amount);
    if (!reference.trim()) return setError("Enter a payment reference.");
    if (!(value > 0)) return setError("Enter a payment amount.");
    if (value > row.balance) return setError("Payment exceeds the outstanding balance.");
    setBusy(true);
    const result = await recordLedgerPayment(api, kind, row, { reference: reference.trim(), amount: value, paidOn, notes });
    setBusy(false);
    if (!result.ok) { setError(result.error); await logAudit(currentActor(), "odoo_sync_failed", `${row.reference} · payment ${reference} · ${result.error}`); return; }
    await logAudit(currentActor(), payable ? "bill_payment" : "invoice_payment", `${row.reference} · ${reference.trim()} · ${value.toFixed(2)}`);
    toast.success(payable ? "Bill payment recorded in Odoo." : "Payment recorded and reconciled in Odoo.");
    onRecorded?.(); onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{payable ? "Pay bill" : "Record payment"} - {row.reference}</DialogTitle>
          <DialogDescription>{row.party}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ReceivableBadge status={row.status} />Outstanding {formatCurrency(row.balance)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="lp-ref">Reference No.</Label><Input id="lp-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="lp-amt">Amount</Label><Input id="lp-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="lp-date">Payment date</Label><Input id="lp-date" type="date" max={today()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="lp-notes">Notes (optional)</Label><Textarea id="lp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>{busy ? "Saving..." : payable ? "Pay bill" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
