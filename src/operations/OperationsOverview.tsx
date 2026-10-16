import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlarmClock, Banknote, Boxes, ClipboardCheck, PackageCheck, PackageX, Percent, RotateCcw, ShieldCheck, TrendingUp, Truck, Wrench, type LucideIcon } from "lucide-react";
import { getAuth, getTickets, mapBackendTicketToFrontend, type Ticket } from "@/frontdesk/lib/store";
import { useApi } from "@/hooks/useApi";
// @ts-ignore -- plain JS helper
import { fetchRepairSales } from "@/lib/repairSales";
import { getSales, getRefunds, orderBalance, type Sale, type Refund } from "@/pos/lib/store";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { SaleRecordDetailModal } from "@/components/SaleRecordDetailModal";
import { getBusiness, periodBounds, repairStage } from "./business";
import { getSourcing, sourcingTiming, type SourcingRequest } from "./sourcing";
import { getReturns, type ReturnCase } from "./returns";
import { DEFAULT_POLICY, getPolicy, type OpsPolicy } from "./policy";
import { buildAllWorkItems, loadOpsData, type OpsData } from "./data";
import type { WorkItem } from "./workItems";
import WorkQueue, { ownsItem } from "./WorkQueue";
import { Choice } from "./shared";

const KPI_ICONS: Record<string, LucideIcon> = {
  "Gross sales": Banknote, "Paid returns": RotateCcw, "Net sales": TrendingUp, "Sales / average value": TrendingUp, "Sales from repairs": Wrench,
  "Open repairs": Wrench, "Paid, uncollected": PackageCheck, "Order balances": Banknote, "Enquiry conversion": Percent,
  "Active sourcing": Boxes, "Past sourcing target": AlarmClock, "Open return cases": PackageX, "COD outstanding": Truck, "New repair jobs": ClipboardCheck, "Completed repairs": ClipboardCheck, "Warranty / repeat intake": ShieldCheck,
};
export default function OperationsOverview({ onOpenRepair, onEnquiries, onOpenTab, roles, attentionOnly = false }: {
  onOpenRepair: (ticket: Ticket) => void; onEnquiries: () => void; onOpenTab?: (tab: string) => void; roles: string[]; attentionOnly?: boolean;
}) {
  const { api } = useApi();
  const [sales, setSales] = useState<Sale[]>([]); const [refunds, setRefunds] = useState<Refund[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]); const [state, setState] = useState<Awaited<ReturnType<typeof getBusiness>>>();
  const [period, setPeriod] = useState("today"); const [selected, setSelected] = useState<Sale | null>(null);
  const [ops, setOps] = useState<OpsData | null>(null); const [sourcing, setSourcing] = useState<SourcingRequest[]>([]); const [returns, setReturns] = useState<ReturnCase[]>([]); const [policy, setPolicy] = useState<OpsPolicy>(DEFAULT_POLICY);
  const [loadedAt, setLoadedAt] = useState(""); const [repairSource, setRepairSource] = useState("Saved repair records");
  const [repairSales, setRepairSales] = useState<number | null>(null);
  const [loading, setLoading] = useState(false); const [userName, setUserName] = useState("");
  const management = roles.includes("admin"); const isFrontDesk = roles.includes("front_desk");
  useEffect(() => { getAuth().then((user) => setUserName(user?.name ?? "")); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const loaded = await loadOpsData(); const [orders, refundList, repairs, context, sourced, returned, rules] = [loaded.sales, loaded.refunds, loaded.tickets, await getBusiness(), loaded.sourcing, loaded.returns, loaded.policy];
      setOps(loaded); setSales(orders); setRefunds(refundList); setTickets(repairs); setState(context); setSourcing(sourced); setReturns(returned); setPolicy(rules);
      if (management || isFrontDesk) {
        try {
          const response = await api.get("/jobs/admin/bookings/", { params: { page_size: 1000 } });
          if (response.data?.success && Array.isArray(response.data.result)) {
            const remote = response.data.result.map(mapBackendTicketToFrontend);
            const merged = new Map(repairs.filter((ticket) => !/^\d+$/.test(ticket.id)).map((ticket) => [ticket.id, ticket]));
            remote.forEach((ticket: Ticket) => merged.set(ticket.id, ticket)); setTickets([...merged.values()]);
            setRepairSource(Number(response.data.pagination?.count ?? remote.length) > remote.length ? "Repair snapshot (first 1,000 records; full history awaits reporting API)" : "Current backend repair snapshot");
          }
        } catch { setRepairSource("Saved repair records · backend unavailable"); }
      }
      setLoadedAt(new Date().toLocaleTimeString());
    } catch { toast.error("Could not load operational records."); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [management, isFrontDesk]);
  // Backend job revenue, the same figure as the Dashboard. Only periods the backend reports are shown.
  const REPAIR_SALES_RANGE: Record<string, string> = { today: "today", "30": "30d", "90": "90d" };
  useEffect(() => {
    setRepairSales(null);
    const range = REPAIR_SALES_RANGE[period];
    if (!management || !range) return;
    let active = true;
    void fetchRepairSales(api, range).then((value: number | null) => { if (active) setRepairSales(value); });
    return () => { active = false; };
  }, [period, management]);
  const [from, to] = periodBounds(period);
  const inPeriod = (date: string) => Date.parse(date) >= from && Date.parse(date) <= to;
  const completed = sales.filter((sale) => !sale.isDemo && (!sale.lifecycle || sale.lifecycle === "completed") && inPeriod(sale.createdAt));
  const paidRefunds = refunds.filter((refund) => !refund.isDemo && refund.status === "paid" && inPeriod(refund.paidAt ?? refund.createdAt));
  const gross = completed.reduce((sum, sale) => sum + sale.total, 0);
  const returned = paidRefunds.filter((refund) => refund.kind !== "deposit").reduce((sum, refund) => sum + refund.total, 0);
  const orders = sales.filter((sale) => !sale.isDemo && sale.lifecycle === "reserved");
  const active = tickets.filter((ticket) => !["completed", "closed", "delivered", "cancelled"].includes(ticket.status));
  const enquiries = state?.enquiries ?? [];
  const enquiryCohort = enquiries.filter((enquiry) => inPeriod(enquiry.createdAt));
  const conversion = enquiryCohort.length ? Math.round(enquiryCohort.filter((entry) => entry.status === "converted").length / enquiryCohort.length * 100) : 0;
  const allItems = ops ? buildAllWorkItems({ ...ops, tickets }) : [];
  const visible = management ? allItems : allItems.filter((item) => ownsItem(item, roles, userName));
  const openItem = (item: WorkItem) => {
    const tab = item.tab;
    if (tab === "repair") { const ticket = tickets.find((entry) => entry.id === item.ref); if (ticket) onOpenRepair(ticket); }
    else if (tab === "sale") setSelected(sales.find((sale) => sale.id === item.ref) ?? null);
    else if (tab === "enquiries") onEnquiries();
    else onOpenTab?.(tab);
  };
  const performance = new Map<string, { count: number; amount: number }>();
  completed.forEach((sale) => { const row = performance.get(sale.cashierName) ?? { count: 0, amount: 0 }; row.count++; row.amount += sale.total; performance.set(sale.cashierName, row); });
  const products = new Map<string, { name: string; quantity: number; amount: number }>();
  completed.forEach((sale) => sale.lines.forEach((line) => { const row = products.get(line.productId) ?? { name: line.name, quantity: 0, amount: 0 }; row.quantity += line.quantity; row.amount += line.quantity * line.unitPrice; products.set(line.productId, row); }));
  return <div className="space-y-4">
    {management ? <>
    <div className="flex flex-wrap justify-between gap-4"><div className="w-44"><Choice label="Reporting period" value={period} onChange={setPeriod} options={[["today", "Today"], ["week", "This week"], ["previous_week", "Previous week"], ["30", "30 days"], ["60", "60 days"], ["90", "90 days"]]} /></div><Button variant="outline" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing..." : "Refresh"}</Button></div>
    <p className="text-xs text-muted-foreground">Sales and follow-ups: records on this device. {repairSource}. Updated {loadedAt || "just now"}. Gross margin requires product cost data.</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 motion-stagger">
      {[
        ["Gross sales", formatCurrency(gross)], ["Paid returns", formatCurrency(returned)], ["Net sales", formatCurrency(gross - returned)],
        ["Sales / average value", completed.length + " / " + formatCurrency(completed.length ? gross / completed.length : 0)],
        ["Sales from repairs", repairSales === null ? "—" : formatCurrency(repairSales)],
        ["Open repairs", String(active.length)], ["Paid, uncollected", String(orders.filter((sale) => orderBalance(sale) === 0).length)],
        ["Order balances", formatCurrency(orders.reduce((sum, sale) => sum + orderBalance(sale), 0))],
        ["Active sourcing", String(sourcing.filter((entry) => !entry.closed).length)],
        ["Past sourcing target", String(sourcing.filter((entry) => sourcingTiming(entry, policy).state === "breached").length)],
        ["Open return cases", String(returns.filter((entry) => !entry.closed).length)],
        ["COD outstanding", formatCurrency(sales.filter((sale) => !sale.isDemo && sale.cod && ["delivered", "collected"].includes(sale.cod.status) && !sale.cod.settledAt).reduce((sum, sale) => sum + sale.total, 0))],
        ["Enquiry conversion", conversion + "% (" + enquiryCohort.length + " enquiries opened in period)"],
        ["New repair jobs", String(tickets.filter((ticket) => inPeriod(ticket.createdAt)).length)],
        ["Completed repairs", String(tickets.filter((ticket) => ["completed", "closed", "delivered"].includes(ticket.status) && inPeriod(ticket.handedOverAt ?? ticket.updatedAt)).length)],
        ["Warranty / repeat intake", String(tickets.filter((ticket) => (ticket.isWarranty || ticket.isRepeatCase) && inPeriod(ticket.createdAt)).length)],
      ].filter(([label]) => !attentionOnly || ["Paid returns", "Net sales", "Paid, uncollected", "Order balances", "Past sourcing target", "COD outstanding", "Enquiry conversion", "Warranty / repeat intake"].includes(label)).map(([label, value]) => { const Icon = KPI_ICONS[label]; return <div key={label} className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md"><p className="flex items-center gap-2 text-xs text-muted-foreground">{Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />}{label}</p><p className="text-lg font-semibold mt-2">{value}</p></div>; })}
    </div>
    {!attentionOnly && <>
    <div className="grid md:grid-cols-2 gap-4"><div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-2"><h3 className="font-medium">Salesperson performance</h3>{[...performance].map(([name, row]) => <p key={name} className="text-sm">{name}: {row.count} sales · {formatCurrency(row.amount)}</p>)}{!performance.size && <p className="text-sm text-muted-foreground">No completed sales in this period.</p>}</div>
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-2"><h3 className="font-medium">Products sold</h3>{[...products.values()].sort((a, b) => b.amount - a.amount).slice(0, 8).map((row) => <p key={row.name} className="text-sm">{row.name}: {row.quantity} · {formatCurrency(row.amount)}</p>)}</div></div>
    </>}
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-2"><h3 className="font-medium">Repairs waiting on parts</h3>
        {(() => { const parts = active.filter((ticket) => repairStage(ticket) === "Awaiting parts");
          return parts.length ? parts.map((ticket) => <p key={ticket.id} className="text-sm">{ticket.jobId} · waiting {Math.floor((Date.now() - Date.parse(ticket.updatedAt || ticket.createdAt)) / 86400000)} days</p>) : <p className="text-sm text-muted-foreground">No repairs are waiting on parts.</p>; })()}</div>
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-2"><h3 className="font-medium">Branch comparison</h3>
        {(() => { const rows = new Map<string, { sales: number; revenue: number }>();
          completed.forEach((sale) => { const key = sale.branch ?? "Unassigned"; const entry = rows.get(key) ?? { sales: 0, revenue: 0 }; entry.sales++; entry.revenue += sale.total; rows.set(key, entry); });
          return rows.size ? [...rows].map(([branch, entry]) => <p key={branch} className="text-sm">{branch}: {entry.sales} sales · {formatCurrency(entry.revenue)}</p>) : <p className="text-sm text-muted-foreground">No branch activity in this period.</p>; })()}
        <p className="text-xs text-muted-foreground">Repair volume by branch needs a branch on each repair job.</p></div>
    </div>
    </> : <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold">My work</h2><p className="text-sm text-muted-foreground">Follow-ups, orders and actions assigned to you.</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing..." : "Refresh"}</Button></div>}
    {(() => { const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      const due = enquiries.filter((enquiry) => enquiry.status === "open" && (management || enquiry.owner === userName) && Date.parse(enquiry.followUpAt) <= endOfDay.getTime())
        .sort((a, b) => Date.parse(a.followUpAt) - Date.parse(b.followUpAt));
      return <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm space-y-2"><div className="flex justify-between"><h3 className="font-semibold">Follow-ups due today or overdue ({due.length})</h3>
        <Button size="sm" variant="outline" onClick={onEnquiries}>Open follow-ups</Button></div>
        {!due.length && <p className="text-sm text-muted-foreground">Nothing due today.</p>}
        {due.slice(0, 8).map((enquiry) => <p key={enquiry.id} className="text-sm">{Date.parse(enquiry.followUpAt) < Date.now() ? "Overdue · " : "Today · "}{enquiry.customer.name} · {enquiry.request} · {enquiry.owner} · {new Date(enquiry.followUpAt).toLocaleString()}</p>)}
      </div>; })()}
    <WorkQueue items={visible} management={management} title={management ? "Open work and exceptions" : "My open work"}
      description="Every open workflow with its owner, age, what it is waiting on and the next action." onOpen={openItem} refresh={() => void load()} />
    <SaleRecordDetailModal sale={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => { if (!open) { setSelected(null); void load(); } }} />
  </div>;
}
