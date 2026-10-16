import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, PackageCheck, Truck } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { StatCard } from "../ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatCurrency } from "../../lib/currency";
import { getSales, isWithinRange, updateCodStatus } from "../../pos/lib/store";
import { getSettlements, isBillableCod, settlementBalance, settlementPaid, settlementStatus } from "../../finance/lib/settlements";
import { seedDemoCodOrders } from "../../finance/lib/demo";
import { prototypeEnabled } from "../../lib/finance";
import { CodBadge, currentActor, fmtDate, OdooBadge, Pager, paginate, RangeSelect, ReceivableBadge, SyncFailureBanner, PrototypeBanner } from "./shared";
import { GenerateSettlementDialog } from "./GenerateSettlementDialog";
import { SettlementDialog } from "./SettlementDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

const STATUS_OPTIONS = [["all", "All statuses"], ["pending", "Pending"], ["delivered", "Delivered"], ["collected", "Collected"], ["settled", "Settled"], ["cancelled", "Cancelled"]];
const PAGE_SIZE = 10;

// COD orders are read from the same POS store the terminal writes to, so a
// COD sale rung up at the till is immediately here, linked by saleNumber.
export function CodBilling() {
  const [sales, setSales] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [tab, setTab] = useState("overview");
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const [all, sets] = await Promise.all([getSales(), getSettlements()]);
    setSales(all.filter((sale) => sale.cod && !sale.isDemo)); setSettlements(sets);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const live = sales.filter((sale) => sale.cod.status !== "cancelled");
    const billable = sales.filter(isBillableCod);
    return {
      orders: live.length,
      delivered: live.filter((sale) => ["delivered", "collected", "settled"].includes(sale.cod.status)).length,
      billable: billable.reduce((sum, sale) => sum + sale.total, 0),
      received: settlements.reduce((sum, item) => sum + settlementPaid(item), 0),
    };
  }, [sales, settlements]);
  const failures = settlements.filter((item) => item.odoo.state === "failed" || item.payments.some((p) => p.odoo.state === "failed")).length;

  const rows = useMemo(() => sales.filter((sale) => (status === "all" || sale.cod.status === status) && isWithinRange(sale.createdAt, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sales, status, range]);
  const { slice, pages, current } = paginate(rows, page, PAGE_SIZE);

  const act = async (sale, next) => {
    try { await updateCodStatus(sale.id, next, currentActor()); toast.success(`${sale.saleNumber} marked ${next}.`); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update the order."); }
  };
  const opened = settlements.find((item) => item.id === openId);

  return (
    <div className="space-y-4">
      <PrototypeBanner />
      <SyncFailureBanner count={failures} />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">COD Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total COD Orders" value={stats.orders.toLocaleString()} icon={PackageCheck} />
            <StatCard title="Delivered" value={stats.delivered.toLocaleString()} icon={Truck} color="text-success" bgColor="bg-success/10" />
            <StatCard title="Billable Amount" value={formatCurrency(stats.billable)} note="Delivered/collected, unsettled" icon={FileText} />
            <StatCard title="Settled Amount" value={formatCurrency(stats.received)} note="Payments received" icon={CheckCircle2} color="text-success" bgColor="bg-success/10" />
          </div>
          <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">Bundle delivered Speedef orders for a billing period into one receivable.</p>
            <div className="flex gap-2">
              {prototypeEnabled() && <Button variant="outline" onClick={async () => { try { await seedDemoCodOrders(currentActor()); toast.success("Added 6 demo COD orders."); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add demo orders."); } }}>Add demo COD orders</Button>}
              <Button onClick={() => setGenerating(true)}><FileText className="mr-2 h-4 w-4" />Generate Settlement</Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card><CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]" aria-label="COD status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <RangeSelect value={range} onChange={(v) => { setRange(v); setPage(1); }} />
            </div>
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Order ID</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Order Value</TableHead><TableHead className="text-right">COD Fee</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {slice.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No COD transactions match these filters.</TableCell></TableRow>
                  : slice.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{fmtDate(sale.createdAt)}</TableCell><TableCell className="font-medium">{sale.saleNumber}</TableCell>
                      <TableCell>{sale.customer?.name}<div className="text-xs text-muted-foreground">{sale.cod.address}</div></TableCell>
                      <TableCell className="text-right">{formatCurrency(sale.total)}</TableCell><TableCell className="text-right">{formatCurrency(sale.cod.fee)}</TableCell>
                      <TableCell><CodBadge status={sale.cod.status} /></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-1">
                        {sale.cod.status === "pending" && <Button size="sm" variant="outline" onClick={() => act(sale, "delivered")}>Delivered</Button>}
                        {["pending", "delivered"].includes(sale.cod.status) && <Button size="sm" variant="outline" onClick={() => act(sale, "collected")}>Collected</Button>}
                        {["pending", "delivered"].includes(sale.cod.status) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Cancel ${sale.saleNumber}? The sale is removed from revenue.`) && act(sale, "cancelled")}>Cancel</Button>}
                        {sale.cod.settlementId && <Button size="sm" variant="ghost" onClick={() => { setOpenId(sale.cod.settlementId); }}>Settlement</Button>}
                      </div></TableCell>
                    </TableRow>))}
              </TableBody>
            </Table></div>
            <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="settlements">
          <Card><CardContent className="space-y-4 p-4">
            <div className="flex justify-end"><Button onClick={() => setGenerating(true)}>Generate Settlement</Button></div>
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Net</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead>Odoo</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {settlements.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No settlements generated yet.</TableCell></TableRow>
                  : [...settlements].reverse().map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.reference}</TableCell><TableCell>{item.periodLabel}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.gross)}</TableCell><TableCell className="text-right">{formatCurrency(item.fees)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.net)}</TableCell><TableCell className="text-right">{formatCurrency(settlementBalance(item))}</TableCell>
                      <TableCell><ReceivableBadge status={settlementStatus(item)} /></TableCell><TableCell><OdooBadge odoo={item.odoo} /></TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setOpenId(item.id)}>View</Button></TableCell>
                    </TableRow>))}
              </TableBody>
            </Table></div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <GenerateSettlementDialog open={generating} onOpenChange={setGenerating} onCreated={async (s) => { await load(); setTab("settlements"); setOpenId(s.id); }} />
      <SettlementDialog settlement={opened} onOpenChange={(v) => !v && setOpenId(null)} onChanged={load} onRecordPayment={(id) => setPayFor(id)} />
      <RecordPaymentDialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)} settlements={settlements} initialId={payFor} onRecorded={load} />
    </div>
  );
}
