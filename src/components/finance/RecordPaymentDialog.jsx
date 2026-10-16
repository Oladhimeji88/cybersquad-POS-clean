import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useApi } from "../../hooks/useApi";
import { formatCurrency } from "../../lib/currency";
import { recordSettlementPayment, settlementBalance } from "../../finance/lib/settlements";
import { syncSettlementChain } from "../../finance/lib/odooSync";
import { currentActor, ReceivableBadge } from "./shared";
import { settlementStatus } from "../../finance/lib/settlements";

const today = () => new Date().toISOString().slice(0, 10);

// Records a payment against an outstanding settlement receivable (US6).
export function RecordPaymentDialog({ open, onOpenChange, settlements, initialId, onRecorded }) {
  const { api } = useApi();
  const open_ = settlements.filter((item) => settlementBalance(item) > 0);
  const [settlementId, setSettlementId] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = open_.find((item) => item.id === settlementId);

  useEffect(() => {
    if (!open) return;
    const first = open_.find((item) => item.id === initialId) ?? open_[0];
    setSettlementId(first?.id ?? ""); setAmount(first ? String(settlementBalance(first)) : "");
    setReference(""); setNotes(""); setPaidOn(today()); setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialId]);

  const pick = (id) => {
    setSettlementId(id);
    const next = open_.find((item) => item.id === id);
    setAmount(next ? String(settlementBalance(next)) : "");
  };

  const submit = async () => {
    setError("");
    if (!selected) return setError("Choose a settlement.");
    setBusy(true);
    try {
      const actor = currentActor();
      const updated = await recordSettlementPayment(selected.id, { reference, amount: Number(amount), paidOn, notes, actor });
      const sync = await syncSettlementChain(api, updated.id, actor);
      toast[sync.ok ? "success" : "warning"](sync.ok ? "Payment recorded and synced to Odoo." : "Payment recorded. Odoo sync is pending: " + sync.error);
      onRecorded?.(); onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the payment.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Log a payment against an outstanding invoice or settlement.</DialogDescription>
        </DialogHeader>
        {open_.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">There are no outstanding settlements to record a payment against.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Invoice / settlement</Label>
              <Select value={settlementId} onValueChange={pick}>
                <SelectTrigger aria-label="Settlement"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {open_.map((item) => <SelectItem key={item.id} value={item.id}>{item.courier} - {item.periodLabel} ({formatCurrency(settlementBalance(item))})</SelectItem>)}
                </SelectContent>
              </Select>
              {selected && <div className="flex items-center gap-2 text-xs text-muted-foreground"><ReceivableBadge status={settlementStatus(selected)} />Outstanding {formatCurrency(settlementBalance(selected))}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="pay-ref">Reference No.</Label><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PAY-2026-001" /></div>
              <div className="space-y-1.5"><Label htmlFor="pay-amt">Amount</Label><Input id="pay-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="pay-date">Payment date</Label><Input id="pay-date" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="pay-notes">Notes (optional)</Label><Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {open_.length > 0 && <Button disabled={busy} onClick={submit}>{busy ? "Recording..." : "Record Payment"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
