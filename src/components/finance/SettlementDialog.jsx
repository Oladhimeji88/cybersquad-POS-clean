import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useApi } from "../../hooks/useApi";
import { formatCurrency } from "../../lib/currency";
import { settlementBalance, settlementPaid, settlementStatus } from "../../finance/lib/settlements";
import { syncSettlementChain } from "../../finance/lib/odooSync";
import { currentActor, fmtDate, OdooBadge, ReceivableBadge } from "./shared";

const Stat = ({ label, value }) => <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></div>;

// Settlement detail: totals, the included orders, payments received, and the
// Odoo state with Send / Retry.
export function SettlementDialog({ settlement, onOpenChange, onChanged, onRecordPayment }) {
  const { api } = useApi();
  const [busy, setBusy] = useState(false);
  if (!settlement) return null;
  const synced = settlement.odoo.state === "synced" && settlement.payments.every((p) => p.odoo.state === "synced");

  const send = async () => {
    setBusy(true);
    const result = await syncSettlementChain(api, settlement.id, currentActor());
    setBusy(false);
    toast[result.ok ? "success" : "error"](result.ok ? "Synced to Odoo." : "Odoo sync failed: " + result.error);
    onChanged?.();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">{settlement.courier} Settlement - {settlement.periodLabel}<ReceivableBadge status={settlementStatus(settlement)} /><OdooBadge odoo={settlement.odoo} /></DialogTitle>
          <DialogDescription>{settlement.reference} · issued {fmtDate(settlement.issuedOn)} · due {fmtDate(settlement.dueOn)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Gross COD value" value={formatCurrency(settlement.gross)} />
          <Stat label="Fees / deductions" value={formatCurrency(settlement.fees)} />
          <Stat label="Net amount payable" value={formatCurrency(settlement.net)} />
          <Stat label="Outstanding" value={formatCurrency(settlementBalance(settlement))} />
        </div>
        {settlement.odoo.state === "failed" && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">Last Odoo sync failed{settlement.odoo.error ? ": " + settlement.odoo.error : "."}</p>}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Included transactions</h4>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Order ID</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Fee</TableHead></TableRow></TableHeader>
            <TableBody>{settlement.lines.map((line, index) => (
              <TableRow key={line.saleId}><TableCell>{index + 1}</TableCell><TableCell>{line.saleNumber}</TableCell><TableCell>{line.customer}</TableCell>
                <TableCell className="text-right">{formatCurrency(line.amount)}</TableCell><TableCell className="text-right">{formatCurrency(line.fee)}</TableCell></TableRow>))}</TableBody>
          </Table>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Payments received ({formatCurrency(settlementPaid(settlement))})</h4>
          {settlement.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Odoo</TableHead></TableRow></TableHeader>
              <TableBody>{settlement.payments.map((p) => (
                <TableRow key={p.id}><TableCell>{p.reference}</TableCell><TableCell>{fmtDate(p.paidOn)}</TableCell><TableCell className="text-right">{formatCurrency(p.amount)}</TableCell><TableCell><OdooBadge odoo={p.odoo} /></TableCell></TableRow>))}</TableBody>
            </Table>)}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {!synced && <Button variant="outline" disabled={busy} onClick={send}>{busy ? "Syncing..." : settlement.odoo.state === "failed" || settlement.payments.some((p) => p.odoo.state === "failed") ? "Retry Odoo sync" : "Send to Odoo"}</Button>}
          {settlementBalance(settlement) > 0 && <Button onClick={() => onRecordPayment(settlement.id)}>Record payment</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
