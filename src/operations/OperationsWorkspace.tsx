import { type AppRole } from "@/auth/roleUtils";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Boxes, Briefcase, CalendarCheck, FileText, Headset, Landmark, LayoutDashboard, LibraryBig, PackageCheck, PackageOpen, PackageX, PhoneCall, ScrollText, ShieldCheck, ShoppingBag, ShoppingCart, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuth, type Ticket } from "@/frontdesk/lib/store";
import { getSales, orderBalance, type Sale } from "@/pos/lib/store";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { SaleRecordDetailModal } from "@/components/SaleRecordDetailModal";
import Enquiries from "./Enquiries";
import WarrantyLookup from "./WarrantyLookup";
import OperationsOverview from "./OperationsOverview";
import Sourcing from "./SourcingBoard";
import Returns from "./ReturnsBoard";
import AuditPolicy from "./AuditPolicy";
import ProcurementBoard from "./ProcurementBoard";
import LogisticsBoard from "./LogisticsBoard";
import InventoryBoard from "./InventoryBoard";
import SupportBoard from "./SupportBoard";
import QuotesBoard from "./QuotesBoard";
import DigitalBoard from "./DigitalBoard";
import FinanceBoard from "./FinanceBoard";
import ReportsBoard from "./ReportsBoard";
import RoutinesBoard from "./RoutinesBoard";
import LibraryBoard from "./LibraryBoard";
import { can, type Capability } from "./access";
import { loadOpsData, type OpsData } from "./data";
import { makeContext } from "./shared";

function Orders() {
  const [orders, setOrders] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const load = () => getSales().then((sales) => setOrders(sales.filter((sale) => sale.lifecycle === "reserved")));

  useEffect(() => { void load(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders Awaiting Collection</CardTitle>
        <CardDescription>
          Reserved in-store orders that still need payment, customer verification, or collection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 motion-stagger">
        {orders.map((sale) => (
          <div key={sale.id} className="rounded-lg border border-border p-4 transition-colors duration-200 hover:bg-muted/40 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">{sale.isDemo ? "Sample - " : ""}{sale.saleNumber} - {sale.customer?.name}</p>
              <p className="text-sm text-muted-foreground">
                Balance: {formatCurrency(orderBalance(sale))} - Expected {new Date(sale.collectionDueAt!).toLocaleString()}
              </p>
            </div>
            <Button variant="outline" onClick={() => setSelected(sale)}>Payment / collection</Button>
          </div>
        ))}
        {!orders.length && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <PackageOpen className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
            No orders awaiting collection.
          </div>
        )}
        <SaleRecordDetailModal sale={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => { if (!open) { setSelected(null); void load(); } }} />
      </CardContent>
    </Card>
  );
}

export interface ExtraTab { value: string; label: string; content: ReactNode; icon?: LucideIcon; }
const tabIcon = "h-4 w-4 shrink-0";

// Every area of the workspace, who it is for, and where it sits in the navigation. A tab only appears for roles that hold
// one of its capabilities, so each person sees their own work and nothing else.
interface Area { value: string; label: string; icon: LucideIcon; group: string; caps: Capability[] | null; }
const AREAS: Area[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard, group: "Work", caps: null },
  { value: "enquiries", label: "Follow-ups", icon: PhoneCall, group: "Sell", caps: ["sell", "support", "lead", "operate"] },
  { value: "quotes", label: "Quotes", icon: FileText, group: "Sell", caps: ["sell", "operate"] },
  { value: "orders", label: "Orders & collection", icon: PackageCheck, group: "Sell", caps: ["sell", "operate"] },
  { value: "digital", label: "Digital orders", icon: ShoppingCart, group: "Sell", caps: ["sell", "lead", "support", "finance", "operate"] },
  { value: "sourcing", label: "Sourcing", icon: Boxes, group: "Source and stock", caps: ["sell", "procure", "inventory", "logistics", "finance", "operate"] },
  { value: "procurement", label: "Procurement", icon: ShoppingBag, group: "Source and stock", caps: ["procure", "inventory", "finance", "operate"] },
  { value: "inventory", label: "Inventory", icon: Warehouse, group: "Source and stock", caps: ["inventory", "procure", "operate"] },
  { value: "logistics", label: "Logistics", icon: Truck, group: "Deliver", caps: ["logistics", "sell", "procure", "support", "finance", "inventory", "operate"] },
  { value: "returns", label: "Returns", icon: PackageX, group: "Serve", caps: ["sell", "support", "inventory", "logistics", "operate"] },
  { value: "support", label: "Support", icon: Headset, group: "Serve", caps: ["support", "sell", "operate"] },
  { value: "warranty", label: "Warranty lookup", icon: ShieldCheck, group: "Serve", caps: null },
  { value: "finance", label: "Finance", icon: Landmark, group: "Money", caps: ["finance", "operate"] },
  { value: "reports", label: "Reports", icon: BarChart3, group: "Run", caps: ["operate", "finance"] },
  { value: "routines", label: "Routines", icon: CalendarCheck, group: "Run", caps: ["operate", "sell"] },
  { value: "library", label: "Workflow library", icon: LibraryBig, group: "Run", caps: ["operate"] },
  { value: "audit", label: "Audit & policy", icon: ScrollText, group: "Run", caps: ["operate"] },
];

export default function OperationsWorkspace({ admin = false, onOpenRepair, initialTab, extraTabs = [], hideOverview = false, hideHeader = false }: {
  admin?: boolean; onOpenRepair?: (ticket: Ticket) => void; initialTab?: string; extraTabs?: ExtraTab[]; hideOverview?: boolean; hideHeader?: boolean;
}) {
  const navigate = useNavigate(); const [roles, setRoles] = useState<AppRole[]>(admin ? ["admin"] : []); const [userName, setUserName] = useState(admin ? "Admin" : "");
  const [data, setData] = useState<OpsData | null>(null); const [tab, setTab] = useState(initialTab ?? (hideOverview ? "records" : "overview"));
  useEffect(() => { getAuth().then((user) => { setUserName(user?.name ?? (admin ? "Admin" : "")); if (!admin) setRoles(user?.roles?.length ? user.roles : user?.role ? [user.role] : []); }); }, [admin]);
  const reload = useCallback(async () => { setData(await loadOpsData()); }, []);
  useEffect(() => { void reload(); }, [reload]);
  const openRepair = onOpenRepair ?? ((ticket: Ticket) => navigate("/ticket/" + encodeURIComponent(ticket.id)));
  const areas = useMemo(() => AREAS.filter((area) => !(hideOverview && area.value === "overview") && (area.caps === null || can(roles, ...area.caps))), [roles, hideOverview]);
  const available = useMemo(() => new Set([...extraTabs.map((entry) => entry.value), ...areas.map((area) => area.value)]), [extraTabs, areas]);
  const fallback = extraTabs[0]?.value ?? areas[0]?.value ?? "warranty";
  useEffect(() => { if (roles.length && !available.has(tab)) setTab(fallback); }, [tab, fallback, available, roles]);
  useEffect(() => { if (initialTab && available.has(initialTab)) setTab(initialTab); }, [initialTab, available]);
  const ctx = data ? makeContext(roles, userName, data, reload) : null;
  const groups = [...new Set(areas.map((area) => area.group))];

  const pane = (value: string) => {
    if (value === "overview") return <OperationsOverview roles={roles} onOpenRepair={openRepair} onEnquiries={() => setTab("enquiries")} onOpenTab={(next) => setTab(next)} />;
    if (value === "enquiries") return <Enquiries />;
    if (value === "orders") return <Orders />;
    if (value === "warranty") return <WarrantyLookup onSelect={roles.includes("front_desk") ? (record) => navigate("/new-ticket?intakeType=warranty&warrantyId=" + encodeURIComponent(record.id)) : undefined} />;
    if (value === "sourcing") return <Sourcing roles={roles} userName={userName} />;
    if (value === "returns") return <Returns roles={roles} userName={userName} />;
    if (!ctx) return <p className="text-sm text-muted-foreground">Loading...</p>;
    switch (value) {
      case "procurement": return <ProcurementBoard ctx={ctx} />;
      case "logistics": return <LogisticsBoard ctx={ctx} />;
      case "inventory": return <InventoryBoard ctx={ctx} />;
      case "support": return <SupportBoard ctx={ctx} />;
      case "quotes": return <QuotesBoard ctx={ctx} />;
      case "digital": return <DigitalBoard ctx={ctx} />;
      case "finance": return <FinanceBoard ctx={ctx} />;
      case "reports": return <ReportsBoard ctx={ctx} />;
      case "routines": return <RoutinesBoard ctx={ctx} />;
      case "library": return <LibraryBoard ctx={ctx} />;
      case "audit": return <AuditPolicy actor={userName} canEdit={can(roles, "manage")} />;
      default: return null;
    }
  };

  return <div className="space-y-6 motion-rise">
    {!hideHeader && (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Business operations</CardTitle>
          <CardDescription>Sell, source, deliver, serve and run the day from one place. You see the areas that belong to your role.</CardDescription>
        </CardHeader>
      </Card>
    )}
    <Tabs value={tab} onValueChange={setTab} className="gap-6 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
      <Card className="md:sticky md:top-4">
        <CardContent className="p-2">
          <TabsList className="flex h-auto w-full gap-1 overflow-x-auto bg-transparent p-0 md:flex-col md:items-stretch md:overflow-visible">
            {extraTabs.length > 0 && <p className="hidden px-2 pt-2 text-xs font-medium text-muted-foreground md:block">Records</p>}
            {extraTabs.map((entry) => <TabsTrigger key={entry.value} value={entry.value} className="justify-start gap-2">{entry.icon ? <entry.icon className={tabIcon} aria-hidden="true" /> : <Briefcase className={tabIcon} aria-hidden="true" />}{entry.label}</TabsTrigger>)}
            {groups.map((group) => <div key={group} className="contents">
              <p className="hidden px-2 pt-4 text-xs font-medium text-muted-foreground md:block">{group}</p>
              {areas.filter((area) => area.group === group).map((area) => <TabsTrigger key={area.value} value={area.value} className="justify-start gap-2"><area.icon className={tabIcon} aria-hidden="true" />{area.value === "overview" && !roles.includes("admin") ? "My work" : area.label}</TabsTrigger>)}
            </div>)}
          </TabsList>
        </CardContent>
      </Card>
      <div className="min-w-0">
        {extraTabs.map((entry) => <TabsContent key={entry.value} value={entry.value} className="mt-0 motion-rise">{entry.content}</TabsContent>)}
        {areas.map((area) => <TabsContent key={area.value} value={area.value} className="mt-0 motion-rise">{tab === area.value && pane(area.value)}</TabsContent>)}
      </div>
    </Tabs>
  </div>;
}
