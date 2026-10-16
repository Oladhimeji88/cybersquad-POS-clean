import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "../ui/button";
import { StatCard } from "../ui/stat-card";
import { useApi } from "../../hooks/useApi";
import { fetchReceivables } from "../../lib/finance";
import { formatCurrency } from "../../lib/currency";
import { getSettlements } from "../../finance/lib/settlements";
import { LedgerView } from "./LedgerView";
import { mergeReceivables, normaliseOdooRows } from "./ledger";
import { LedgerPaymentDialog } from "./LedgerPaymentDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

// Accounts Receivable: Odoo customer invoices plus Speedef settlements
// (local until their Odoo invoice exists). Read-only except recording a
// payment against a settlement.
export function ReceivablesView({ onNavigate }) {
  const { api } = useApi();
  const [odoo, setOdoo] = useState(undefined); // undefined = loading, null = unavailable
  const [settlements, setSettlements] = useState([]);
  const [payFor, setPayFor] = useState(null);
  const [payRow, setPayRow] = useState(null);

  const load = useCallback(async () => {
    const [remote, local] = await Promise.all([fetchReceivables(api), getSettlements()]);
    setOdoo(remote); setSettlements(local);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return mergeReceivables(settlements, normaliseOdooRows(odoo, "customer"));
  }, [odoo, settlements]);

  // Paid this month = settlement payments received this month (Odoo rows only expose a balance).
  const paidThisMonth = settlements.flatMap((item) => item.payments)
    .filter((payment) => new Date(payment.paidOn).getMonth() === new Date().getMonth() && new Date(payment.paidOn).getFullYear() === new Date().getFullYear())
    .reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <>
      <LedgerView
        rows={rows} loading={odoo === undefined} unavailable={odoo === null}
        unavailableWhat="Customer invoices" partyLabel="Customer" referenceLabel="Invoice No."
        emptyText="No receivables for this period."
        renderStats={(totals) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Outstanding" value={formatCurrency(totals.outstanding)} note={`${totals.outstandingCount} open`} icon={Wallet} />
            <StatCard title="Overdue" value={formatCurrency(totals.overdue)} note={`${totals.overdueCount} overdue`} icon={AlertTriangle} color="text-error" bgColor="bg-error/10" />
            <StatCard title="Due This Month" value={formatCurrency(totals.dueThisMonth)} icon={CalendarClock} color="text-warning" bgColor="bg-warning/15" />
            <StatCard title="Paid This Month" value={formatCurrency(paidThisMonth)} note="Speedef settlements" icon={CheckCircle2} color="text-success" bgColor="bg-success/10" />
          </div>
        )}
        rowAction={(row) => row.source === "settlement" ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate?.("cod")}>View</Button>
            {row.balance > 0 && <Button size="sm" onClick={() => setPayFor(row.settlement.id)}>Record payment</Button>}
          </div>
        ) : row.balance > 0 ? <Button size="sm" onClick={() => setPayRow(row)}>Record payment</Button> : null}
      />
      <LedgerPaymentDialog kind="receivable" row={payRow} onOpenChange={(v) => !v && setPayRow(null)} onRecorded={load} />
      <RecordPaymentDialog open={!!payFor} onOpenChange={(value) => !value && setPayFor(null)} settlements={settlements} initialId={payFor} onRecorded={load} />
    </>
  );
}
