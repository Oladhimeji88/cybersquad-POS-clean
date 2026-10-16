import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight, Eye, Wallet, ShoppingCart, Store, Globe2, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { formatCurrency } from "../frontdesk/lib/invoice";
import { useApi } from "../hooks/useApi";
import { fetchRepairSales } from "../lib/repairSales";
import { getSalePaymentLabel, getSales, isWithinRange } from "../pos/lib/store";
import { SaleRecordDetailModal } from "./SaleRecordDetailModal";
import { StatCard } from "./ui/stat-card";

const PAGE_SIZE = 15;

const CHANNEL_OPTIONS = [
  { value: "all", label: "All Channels" },
  { value: "in_store", label: "In-Store" },
  { value: "website", label: "Website" },
];

// Same range set as the dashboard's own time filter, so "not broad enough"
// isn't a recurring complaint — this page can reach any period that filter can.
const DATE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

// `initialFilter` arrives from the Dashboard's Sales cards — e.g.
// { dateScope: "today", channel: "in_store" } or { dateScope: "today", search: "<item name>" } —
// so this page opens already scoped to whatever card was clicked.
export function SalesRecords({ initialFilter } = {}) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialFilter?.search || "");
  const [channel, setChannel] = useState(initialFilter?.channel || "all");
  const [dateScope, setDateScope] = useState(initialFilter?.dateScope || "all");
  const { api } = useApi();
  const [repairSales, setRepairSales] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSales()
      .then((data) => {
        if (mounted) setSales(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setRepairSales(null);
    fetchRepairSales(api, dateScope).then((value) => { if (mounted) setRepairSales(value); });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateScope]);

  // Re-apply whenever a new filter object arrives from the dashboard (each
  // card click passes a freshly created object, so this fires every time).
  useEffect(() => {
    if (!initialFilter) return;
    setSearch(initialFilter.search || "");
    setChannel(initialFilter.channel || "all");
    setDateScope(initialFilter.dateScope || "all");
    setPage(1);
  }, [initialFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...sales].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.filter((sale) => {
      if (!isWithinRange(sale.createdAt, dateScope)) return false;
      if (channel !== "all" && sale.channel !== channel) return false;
      if (!query) return true;
      return (
        sale.saleNumber.toLowerCase().includes(query) ||
        sale.cashierName.toLowerCase().includes(query) ||
        (sale.customer?.name ?? "").toLowerCase().includes(query) ||
        (sale.customer?.phone ?? "").includes(query) ||
        sale.lines.some((line) => line.devices?.some((unit) =>
          [unit.serialNumber, unit.imei, unit.imei2].some((value) => value?.toLowerCase().includes(query)))) ||
        sale.lines.some((line) => line.name.toLowerCase().includes(query))
      );
    });
  }, [sales, search, channel, dateScope]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredRevenue = filtered.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const inStoreCount = filtered.filter((sale) => sale.channel !== "website").length;
  const websiteCount = filtered.filter((sale) => sale.channel === "website").length;

  const openSale = (sale) => {
    setSelectedSale(sale);
    setShowDetail(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Sales</h1>
        <p className="text-muted-foreground">This device — not yet synced to a shared backend.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Filtered Revenue"
          value={formatCurrency(filteredRevenue)}
          note={DATE_OPTIONS.find((o) => o.value === dateScope)?.label || "All Dates"}
          icon={Wallet}
          color="text-teal-600"
          bgColor="bg-teal-50"
        />
        <StatCard
          title="Sales Count"
          value={filtered.length}
          note={`${pageItems.length} shown on this page`}
          icon={ShoppingCart}
          color="text-sky-600"
          bgColor="bg-sky-50"
        />
        <StatCard
          title="In-Store Sales"
          value={inStoreCount}
          note={channel === "website" ? "Hidden by channel filter" : "Current filter"}
          icon={Store}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Website Sales"
          value={websiteCount}
          note={channel === "in_store" ? "Hidden by channel filter" : "Current filter"}
          icon={Globe2}
          color="text-purple-600"
          bgColor="bg-purple-50"
        />
        <StatCard
          title="Repair Sales"
          value={repairSales === null ? "—" : formatCurrency(repairSales)}
          note="Backend job revenue · ignores channel filter"
          icon={Wrench}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Sale Records</CardTitle>
              <CardDescription>
                {filtered.length} sale(s)
                {dateScope !== "all" ? ` · ${DATE_OPTIONS.find((o) => o.value === dateScope)?.label}` : ""}
                {channel !== "all" ? ` · ${CHANNEL_OPTIONS.find((o) => o.value === channel)?.label}` : ""}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={dateScope}
                onValueChange={(v) => {
                  setDateScope(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={channel}
                onValueChange={(v) => {
                  setChannel(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by sale #, cashier, or item..."
                  className="pl-8 w-[280px]"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale #</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No sales found
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                pageItems.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-sm font-medium">{sale.saleNumber}<span className="block text-xs">{sale.lifecycle ?? "completed"}</span>{sale.isDemo && <span className="block text-xs text-muted-foreground">Sample sale</span>}</TableCell>
                    <TableCell>{sale.cashierName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {sale.channel === "website" ? "Website" : "In-Store"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sale.lines.reduce((sum, l) => sum + l.quantity, 0)} item(s)
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getSalePaymentLabel(sale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(sale.total)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(sale.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openSale(sale)} aria-label={`Open ${sale.saleNumber}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-4 pt-4">
              <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">{pages}</span>
              </span>
              <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleRecordDetailModal open={showDetail} onOpenChange={setShowDetail} sale={selectedSale} />
    </div>
  );
}
