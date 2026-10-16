import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import type { SalePaymentMode } from "../lib/store";
export default function ReserveOrderDialog({ total, busy, onClose, onSave }: {
  total: number; busy: boolean; onClose: () => void;
  onSave: (amount: number, mode: SalePaymentMode, dueAt: string) => void;
}) {
  const [amount, setAmount] = useState("0"); const [mode, setMode] = useState<SalePaymentMode>("cash"); const [due, setDue] = useState("");
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>Reserve for collection</DialogTitle><DialogDescription>Reserve the selected items at the current price. No quotation or approval request is sent.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(Number(amount), mode, new Date(due).toISOString()); }}>
      <p>Total: {formatCurrency(total)}</p>
      <label className="block text-sm">Payment received now<Input aria-label="Deposit received" type="number" min={0} max={total} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="block text-sm">Payment method<select className="block w-full border rounded p-2 bg-background" value={mode} onChange={(event) => setMode(event.target.value as SalePaymentMode)}><option value="cash">Cash</option><option value="pos">Card terminal</option><option value="bank_transfer">Bank transfer</option></select></label>
      <label className="block text-sm">Expected collection<Input aria-label="Expected collection" type="datetime-local" required value={due} onChange={(event) => setDue(event.target.value)} /></label>
      <p className="text-sm text-muted-foreground">Only record payments already received. Remaining balance is due before release.</p>
      <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Reserve order"}</Button>
    </form>
  </DialogContent></Dialog>;
}
