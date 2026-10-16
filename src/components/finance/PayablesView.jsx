import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "../ui/button";
import { StatCard } from "../ui/stat-card";
import { useApi } from "../../hooks/useApi";
import { fetchPayables } from "../../lib/finance";
import { formatCurrency } from "../../lib/currency";
import { LedgerPaymentDialog } from "./LedgerPaymentDialog";
import { LedgerView } from "./LedgerView";
import { normaliseOdooRows } from "./ledger";

// Accounts Payable: vendor bills, read straight from Odoo (the app never
// creates bills — the PRD only asks to view them).
export function PayablesView() {
  const { api } = useApi();
  const [odoo, setOdoo] = useState(undefined);
  const [payRow, setPayRow] = useState(null);
  const load = useCallback(() => fetchPayables(api).then(setOdoo), [api]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => normaliseOdooRows(odoo, "vendor"), [odoo]);

  const dayStart = new Date().setHours(0, 0, 0, 0); const weekEnd = dayStart + 8 * 86400000 - 1;
  const dueThisWeek = rows.filter((r) => r.status !== "paid" && r.dueOn && new Date(r.dueOn).getTime() <= weekEnd && new Date(r.dueOn).getTime() >= dayStart)
    .reduce((sum, r) => sum + r.balance, 0);
  const paidThisMonth = rows.filter((r) => r.status === "paid" && r.issuedOn && new Date(r.issuedOn).getMonth() === new Date().getMonth())
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
    <LedgerView
      rows={rows} loading={odoo === undefined} unavailable={odoo === null}
      unavailableWhat="Vendor bills" partyLabel="Vendor" referenceLabel="Bill No."
      emptyText="No vendor bills for this period."
      renderStats={(totals) => (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Payables" value={formatCurrency(totals.outstanding)} note={`${totals.outstandingCount} outstanding`} icon={Wallet} />
          <StatCard title="Overdue" value={formatCurrency(totals.overdue)} icon={AlertTriangle} color="text-error" bgColor="bg-error/10" />
          <StatCard title="Due This Week" value={formatCurrency(dueThisWeek)} icon={CalendarClock} color="text-warning" bgColor="bg-warning/15" />
          <StatCard title="Paid This Month" value={formatCurrency(paidThisMonth)} icon={CheckCircle2} color="text-success" bgColor="bg-success/10" />
        </div>
      )}
      rowAction={(row) => row.balance > 0 ? <Button size="sm" variant="outline" onClick={() => setPayRow(row)}>Pay bill</Button> : null}
    />
    <LedgerPaymentDialog kind="payable" row={payRow} onOpenChange={(v) => !v && setPayRow(null)} onRecorded={load} />
    </>
  );
}
