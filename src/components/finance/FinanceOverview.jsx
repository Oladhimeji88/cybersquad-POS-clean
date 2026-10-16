import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Banknote, CreditCard, FileText, Landmark, PackageCheck, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatCard } from "../ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useApi } from "../../hooks/useApi";
import { fetchFinanceOverview } from "../../lib/finance";
import { fetchRepairSales } from "../../lib/repairSales";
import { fetchWebsiteSalesSummary } from "../../lib/websiteSales";
import { formatAmount, formatCurrency } from "../../lib/currency";
import { getSalesSummary, getSales, isWithinRange } from "../../pos/lib/store";
import { getSettlements, settlementBalance } from "../../finance/lib/settlements";
import { fmtDate, OdooUnavailable, RangeSelect, SyncFailureBanner, toneBadge, PrototypeBanner } from "./shared";

// Finance Overview (US8). Odoo is the source of truth for AR / AP / cash; when
// its endpoint isn't there those cards say so rather than guessing. Revenue
// reuses exactly the sources the existing Payments page folds together.
export function FinanceOverview({ onNavigate }) {
  const { api } = useApi();
  const [range, setRange] = useState("30d");
  const [odoo, setOdoo] = useState(undefined);
  const [revenue, setRevenue] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [local, setLocal] = useState({ settlements: [], cod: [] });

  useEffect(() => {
    let live = true;
    setOdoo(undefined);
    (async () => {
      const [remote, pos, repair, website, settlements, sales] = await Promise.all([
        fetchFinanceOverview(api, range), getSalesSummary(range), fetchRepairSales(api, range),
        fetchWebsiteSalesSummary(api, range), getSettlements(), getSales(),
      ]);
      if (!live) return;
      setOdoo(remote);
      setRevenue({ pos: pos.totalRevenue, repair, website: website?.revenue ?? 0 });
      setLocal({ settlements, cod: sales.filter((sale) => sale.cod && !sale.isDemo) });
    })();
    return () => { live = false; };
  }, [api, range]);

  // Pending payouts aren't range-based on the backend — same figure the Payments tab shows.
  useEffect(() => {
    let live = true;
    api.get("/payouts/platform/dashboard-stats/", { showLoader: false }).then((res) => {
      const p = res?.data?.result?.payouts; if (!live || !p) return;
      const sum = (key) => Number(p[key]?.total_amount) || 0;
      setPayouts(sum("pending_approval") + sum("approved_pending_disbursement") + sum("processing"));
    }).catch(() => {});
    return () => { live = false; };
  }, [api]);

  const figures = useMemo(() => {
    const payments = local.settlements.flatMap((item) => item.payments.map((payment) => ({ ...payment, settlement: item })));
    const paymentsInRange = payments.filter((p) => isWithinRange(p.paidOn, range));
    return {
      localReceivable: local.settlements.reduce((sum, item) => sum + settlementBalance(item), 0),
      outstandingCod: local.cod.filter((sale) => ["pending", "delivered", "collected"].includes(sale.cod.status) && sale.lifecycle !== "cancelled")
        .reduce((sum, sale) => sum + sale.total, 0),
      localPayments: paymentsInRange.reduce((sum, p) => sum + p.amount, 0),
      activity: [
        ...local.settlements.map((item) => ({ at: item.issuedOn, reference: item.reference, type: "Settlement", party: item.courier, amount: item.net, tone: "amber", label: "Issued" })),
        ...payments.map((p) => ({ at: p.recordedAt, reference: p.reference, type: "Payment", party: p.settlement.courier, amount: p.amount, tone: "green", label: "Received" })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
      failures: local.settlements.filter((item) => item.odoo.state === "failed" || item.payments.some((p) => p.odoo.state === "failed")).length,
    };
  }, [local, range]);

  const revenueTotal = revenue ? revenue.pos + revenue.website + (revenue.repair ?? 0) : null;
  const odooValue = (key) => (odoo ? formatCurrency(odoo[key]) : undefined);

  return (
    <div className="space-y-4">
      <PrototypeBanner />
      <SyncFailureBanner count={figures.failures} />
      <div className="flex justify-end"><RangeSelect value={range} onChange={setRange} /></div>
      {odoo === null && <OdooUnavailable what="Accounts receivable, accounts payable, cash/bank balance and payments from Odoo" />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Revenue" value={revenueTotal === null ? undefined : formatCurrency(revenueTotal)} note={revenue?.repair == null ? "POS + website (repairs unavailable)" : "Repairs + POS + website"} icon={TrendingUp} />
        <StatCard title="Accounts Receivable" value={odooValue("receivable") ?? (odoo === null ? formatCurrency(figures.localReceivable) : undefined)} note={odoo ? "From Odoo" : odoo === null ? "Speedef settlements only" : undefined} icon={Wallet} color="text-warning" bgColor="bg-warning/15" />
        <StatCard title="Accounts Payable" value={odooValue("payable")} note={odoo === null ? "Awaiting Odoo" : "From Odoo"} icon={CreditCard} color="text-error" bgColor="bg-error/10" />
        <StatCard title="Cash / Bank Balance" value={odooValue("cash_balance")} note={odoo === null ? "Awaiting Odoo" : "From Odoo"} icon={Landmark} color="text-success" bgColor="bg-success/10" />
        <StatCard title="Outstanding COD" value={formatCurrency(figures.outstandingCod)} note="Sold, not yet settled" icon={PackageCheck} onClick={() => onNavigate?.("cod")} />
        <StatCard title="Payments Received" value={odoo ? formatCurrency(odoo.payments_received) : formatCurrency(figures.localPayments)} note={odoo ? "From Odoo" : "Speedef settlements only"} icon={Banknote} color="text-success" bgColor="bg-success/10" />
        <StatCard title="Pending Payouts" value={payouts === null ? undefined : formatCurrency(payouts)} note="Technician payouts, all dates" icon={ArrowUpRight} onClick={() => onNavigate?.("payments")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Financial Activity</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Party</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {figures.activity.length === 0 ? <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No settlement activity yet.</TableCell></TableRow>
                  : figures.activity.map((row) => (
                    <TableRow key={row.type + row.reference}><TableCell>{fmtDate(row.at)}</TableCell><TableCell>{row.reference}</TableCell><TableCell>{row.type}</TableCell>
                      <TableCell>{row.party}</TableCell><TableCell className="text-right">{formatAmount(row.amount)}</TableCell><TableCell>{toneBadge(row.tone, row.label)}</TableCell></TableRow>))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Quick Links</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[["Generate settlement", "cod", FileText], ["Record payment", "receivables", Banknote], ["View reports", "payments", TrendingUp]].map(([label, tab, Icon]) => (
              <button key={label} type="button" onClick={() => onNavigate?.(tab)} className="flex w-full items-center justify-between rounded-lg border p-3 text-sm hover:bg-secondary/40">
                <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{label}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </button>))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
