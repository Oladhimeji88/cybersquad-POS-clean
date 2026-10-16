import { useEffect, useMemo, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Loader2, RefreshCw, Store, Users, Wallet } from "lucide-react";
import { formatAmount } from "../lib/currency";
import { humanizeLabel as formatLabel } from "../lib/text";
import { getSales } from "../pos/lib/store";

const PAYMENT_TYPE_OPTIONS = [
  { value: "all", label: "All Payment Types" },
  { value: "repair_fee", label: "Repair Fee" },
  { value: "diagnosis_fee", label: "Diagnosis Fee" },
  { value: "shipping_fee", label: "Shipping Fee" },
  { value: "service_fee", label: "Service Fee" },
  { value: "corporate_parent_payment", label: "Corporate Parent Payment" },
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Balance" },
];

const SOURCE_CHANNEL_OPTIONS = [
  { value: "all", label: "All Channels" },
  { value: "self_service", label: "Self Service" },
  { value: "walk_in", label: "Walk In" },
  { value: "corporate", label: "Corporate" },
];

const PROVIDER_OPTIONS = [
  { value: "all", label: "All Providers" },
  { value: "paystack", label: "Paystack" },
  { value: "manual", label: "Manual" },
];

function getTodayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function getMonthStartIsoDate() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().split("T")[0];
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}


function formatBreakdown(breakdown, currency) {
  const entries = Object.entries(breakdown || {});
  if (entries.length === 0) return "-";

  return entries
    .map(([key, value]) => `${formatLabel(key)}: ${formatAmount(value, currency)}`)
    .join(" • ");
}

export function FinanceReportsTab() {
  const { api } = useApi();
  const [stores, setStores] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [referenceLoading, setReferenceLoading] = useState(true);

  const [draftFilters, setDraftFilters] = useState({
    startDate: getMonthStartIsoDate(),
    endDate: getTodayIsoDate(),
    paymentType: "all",
    sourceChannel: "all",
    provider: "all",
    storeId: "all",
    technicianId: "all",
    currency: "NGN",
  });
  const [appliedFilters, setAppliedFilters] = useState(draftFilters);

  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(null);
  const [dailyReport, setDailyReport] = useState(null);
  const [technicianReport, setTechnicianReport] = useState(null);
  const [storeReport, setStoreReport] = useState(null);
  const [voucherReport, setVoucherReport] = useState(null);

  // These daily/technician/store/voucher reports all come from job-payment
  // endpoints and are sliceable by dimensions (payment type, source channel,
  // technician, store) that only apply to jobs — a POS retail sale has none
  // of those, so it can't be folded into those breakdowns without misreporting
  // them. Instead, in-store POS revenue for the same date range is fetched
  // separately here and shown as its own card, so "how much did we actually
  // make in this period" is answerable without corrupting the job-specific
  // tables below. (Website sales have no backend endpoint yet — see
  // src/lib/websiteSales.js — so only in-store is available today.)
  const [posRangeRevenue, setPosRangeRevenue] = useState(0);
  const [posRangeCount, setPosRangeCount] = useState(0);
  const [posRangeLoading, setPosRangeLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadReferenceData = async () => {
      setReferenceLoading(true);

      try {
        const [storesResponse, techniciansResponse] = await Promise.all([
          api.get("/users/stores/?page=1&page_size=100", { showLoader: false }),
          api.get("/users/profile/technicians/?page=1&page_size=100", { showLoader: false }),
        ]);

        if (!mounted) return;

        setStores(Array.isArray(storesResponse?.data?.result) ? storesResponse.data.result : []);
        setTechnicians(
          Array.isArray(techniciansResponse?.data?.result) ? techniciansResponse.data.result : []
        );
      } catch (error) {
        console.error("Failed to load finance report references:", error);
        if (!mounted) return;
        setStores([]);
        setTechnicians([]);
      } finally {
        if (mounted) {
          setReferenceLoading(false);
        }
      }
    };

    void loadReferenceData();

    return () => {
      mounted = false;
    };
  }, [api]);

  useEffect(() => {
    let mounted = true;

    const loadReports = async () => {
      setReportsLoading(true);
      setReportsError(null);

      try {
        const sharedParams = {
          start_date: appliedFilters.startDate,
          end_date: appliedFilters.endDate,
          currency: appliedFilters.currency,
          ...(appliedFilters.paymentType !== "all"
            ? { payment_type: appliedFilters.paymentType }
            : {}),
          ...(appliedFilters.sourceChannel !== "all"
            ? { source_channel: appliedFilters.sourceChannel }
            : {}),
          ...(appliedFilters.provider !== "all" ? { provider: appliedFilters.provider } : {}),
          ...(appliedFilters.storeId !== "all" ? { store: appliedFilters.storeId } : {}),
          ...(appliedFilters.technicianId !== "all"
            ? { technician: appliedFilters.technicianId }
            : {}),
        };

        const [dailyResponse, technicianResponse, storeResponse, voucherResponse] =
          await Promise.all([
            api.get("/reports/admin/revenue/daily/", {
              params: sharedParams,
              showLoader: false,
            }),
            api.get("/reports/admin/revenue/by-technician/", {
              params: sharedParams,
              showLoader: false,
            }),
            api.get("/reports/admin/revenue/by-store/", {
              params: sharedParams,
              showLoader: false,
            }),
            api.get("/reports/admin/vouchers/", {
              params: {
                start_date: appliedFilters.startDate,
                end_date: appliedFilters.endDate,
              },
              showLoader: false,
            }),
          ]);

        if (!mounted) return;

        setDailyReport(dailyResponse?.data?.result || null);
        setTechnicianReport(technicianResponse?.data?.result || null);
        setStoreReport(storeResponse?.data?.result || null);
        setVoucherReport(voucherResponse?.data?.result || null);
      } catch (error) {
        console.error("Failed to load finance reports:", error);
        if (!mounted) return;
        setReportsError(
          error?.response?.data?.message || "Failed to load finance reports."
        );
        setDailyReport(null);
        setTechnicianReport(null);
        setStoreReport(null);
        setVoucherReport(null);
      } finally {
        if (mounted) {
          setReportsLoading(false);
        }
      }
    };

    void loadReports();

    return () => {
      mounted = false;
    };
  }, [api, appliedFilters]);

  useEffect(() => {
    let mounted = true;
    setPosRangeLoading(true);

    const from = appliedFilters.startDate ? new Date(appliedFilters.startDate).setHours(0, 0, 0, 0) : null;
    // End-of-day so a sale made on the end date itself is included.
    const to = appliedFilters.endDate
      ? new Date(appliedFilters.endDate).setHours(23, 59, 59, 999)
      : null;

    getSales().then((sales) => {
      if (!mounted) return;
      const inRange = sales.filter((sale) => {
        if (sale.isDemo) return false;
        const created = new Date(sale.createdAt).getTime();
        return (from === null || created >= from) && (to === null || created <= to);
      });
      setPosRangeRevenue(inRange.reduce((sum, sale) => sum + sale.total, 0));
      setPosRangeCount(inRange.length);
      setPosRangeLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [appliedFilters.startDate, appliedFilters.endDate]);

  const storeOptions = useMemo(
    () =>
      stores.map((store) => ({
        value: String(store.id),
        label: store.name,
      })),
    [stores]
  );

  const technicianOptions = useMemo(
    () =>
      technicians
        .map((technician) => {
          const profileId = technician?.profile?.id;
          if (!profileId) return null;

          const displayName =
            technician?.profile?.full_name ||
            [technician?.first_name, technician?.last_name].filter(Boolean).join(" ") ||
            technician?.email ||
            `Technician #${profileId}`;

          return {
            value: String(profileId),
            label: displayName,
          };
        })
        .filter(Boolean),
    [technicians]
  );

  const revenueSummary = dailyReport?.summary || {
    total_revenue: "0.00",
    total_transactions: 0,
    avg_transaction: "0.00",
    currency: appliedFilters.currency,
  };

  const voucherSummary = voucherReport?.summary || {
    total_discounts: "0.00",
    total_usages: 0,
    full_waiver_count: 0,
  };

  const setDraftFilter = (key, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    const nextFilters = {
      startDate: getMonthStartIsoDate(),
      endDate: getTodayIsoDate(),
      paymentType: "all",
      sourceChannel: "all",
      provider: "all",
      storeId: "all",
      technicianId: "all",
      currency: "NGN",
    };

    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Revenue & Voucher Reports</CardTitle>
          <CardDescription>
            Run live admin reports for daily revenue, technician/store performance, and voucher
            usage.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={draftFilters.startDate}
                onChange={(event) => setDraftFilter("startDate", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={draftFilters.endDate}
                onChange={(event) => setDraftFilter("endDate", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Type</Label>
              <Select
                value={draftFilters.paymentType}
                onValueChange={(value) => setDraftFilter("paymentType", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source Channel</Label>
              <Select
                value={draftFilters.sourceChannel}
                onValueChange={(value) => setDraftFilter("sourceChannel", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_CHANNEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={draftFilters.provider}
                onValueChange={(value) => setDraftFilter("provider", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Store</Label>
              <Select
                value={draftFilters.storeId}
                onValueChange={(value) => setDraftFilter("storeId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={referenceLoading ? "Loading stores..." : "All Stores"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {storeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Technician</Label>
              <Select
                value={draftFilters.technicianId}
                onValueChange={(value) => setDraftFilter("technicianId", value)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={referenceLoading ? "Loading technicians..." : "All Technicians"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {technicianOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={draftFilters.currency}
                onChange={(event) =>
                  setDraftFilter("currency", event.target.value.toUpperCase() || "NGN")
                }
                placeholder="NGN"
                maxLength={3}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAppliedFilters({ ...draftFilters })} disabled={reportsLoading}>
              {reportsLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run Reports
                </>
              )}
            </Button>
            <Button variant="outline" onClick={resetFilters} disabled={reportsLoading}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {reportsError ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">{reportsError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-green-600" />
              Job Revenue (Selected Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatAmount(revenueSummary.total_revenue, revenueSummary.currency)}
            </div>
            {/* Jobs only — this report's other breakdowns (payment type,
                source channel, technician, store) are job-specific dimensions
                a POS sale doesn't have, so POS revenue is a separate card
                (below) instead of being blended in here. */}
            <p className="text-xs text-muted-foreground mt-1">
              {Number(revenueSummary.total_transactions || 0).toLocaleString()} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-success" />
              POS Revenue (Selected Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {posRangeLoading ? (
              <div className="flex items-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold">
                  {formatAmount(posRangeRevenue, "NGN")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {posRangeCount.toLocaleString()} in-store sales — this device only, website not synced yet
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Average Transaction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatAmount(revenueSummary.avg_transaction, revenueSummary.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Based on current daily report</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Store className="w-4 h-4 text-purple-600" />
              Voucher Discounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatAmount(voucherSummary.total_discounts, appliedFilters.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {Number(voucherSummary.total_usages || 0).toLocaleString()} usages in range
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge className="bg-orange-600 text-white">Voucher</Badge>
              Full Waivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {Number(voucherSummary.full_waiver_count || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Waived payments in selected period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Revenue</CardTitle>
          <CardDescription>
            Revenue totals grouped by day with payment-type breakdowns.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {reportsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (dailyReport?.by_day || []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No daily revenue data for this filter.</div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">By Payment Type</h4>
                  <div className="space-y-2">
                    {Object.entries(dailyReport?.by_payment_type || {}).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm"
                      >
                        <span>{formatLabel(key)}</span>
                        <span className="font-medium">
                          {formatAmount(value?.total, revenueSummary.currency)} • {value?.count || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">By Source Channel</h4>
                  <div className="space-y-2">
                    {Object.entries(dailyReport?.by_source_channel || {}).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm"
                      >
                        <span>{formatLabel(key)}</span>
                        <span className="font-medium">
                          {formatAmount(value?.total, revenueSummary.currency)} • {value?.count || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead>Payment Breakdown</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.by_day.map((entry) => (
                      <TableRow key={entry.date}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(entry.revenue, revenueSummary.currency)}
                        </TableCell>
                        <TableCell className="text-right">{entry.transaction_count}</TableCell>
                        <TableCell>{formatBreakdown(entry.by_payment_type, revenueSummary.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Technician</CardTitle>
            <CardDescription>
              View revenue performance by individual technicians.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {reportsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (technicianReport?.data || []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No technician revenue data for this filter.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicianReport.data.map((entry) => (
                      <TableRow key={entry.technician_id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-medium">{entry.technician_name || "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {entry.technician_email || "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(entry.total_revenue, appliedFilters.currency)}
                        </TableCell>
                        <TableCell className="text-right">{entry.transaction_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Store</CardTitle>
            <CardDescription>Compare revenue concentration across store locations.</CardDescription>
          </CardHeader>

          <CardContent>
            {reportsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (storeReport?.data || []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No store revenue data for this filter.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeReport.data.map((entry) => (
                      <TableRow key={entry.store_id}>
                        <TableCell className="font-medium">{entry.store_name || `Store #${entry.store_id}`}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(entry.total_revenue, appliedFilters.currency)}
                        </TableCell>
                        <TableCell className="text-right">{entry.transaction_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Voucher Report</CardTitle>
          <CardDescription>
            Discount totals and voucher usage in the selected reporting window.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {reportsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border px-4 py-4">
                  <p className="text-sm text-muted-foreground">Total Discounts</p>
                  <p className="text-xl font-semibold">
                    {formatAmount(voucherSummary.total_discounts, appliedFilters.currency)}
                  </p>
                </div>
                <div className="rounded-lg border px-4 py-4">
                  <p className="text-sm text-muted-foreground">Total Usages</p>
                  <p className="text-xl font-semibold">
                    {Number(voucherSummary.total_usages || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border px-4 py-4">
                  <p className="text-sm text-muted-foreground">Full Waivers</p>
                  <p className="text-xl font-semibold">
                    {Number(voucherSummary.full_waiver_count || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">By Voucher</h4>
                  {(voucherReport?.by_voucher || []).length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No voucher usage found in this period.
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Voucher</TableHead>
                            <TableHead className="text-right">Discounts</TableHead>
                            <TableHead className="text-right">Usages</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {voucherReport.by_voucher.map((entry) => (
                            <TableRow key={entry.voucher_id || entry.voucher_code}>
                              <TableCell className="font-medium">
                                {entry.voucher_code || `Voucher #${entry.voucher_id}`}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatAmount(
                                  entry.total_discount || entry.total_discounts,
                                  appliedFilters.currency
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {Number(entry.usage_count || entry.total_usages || 0).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">By Payment Type</h4>
                  {(voucherReport?.by_payment_type || []).length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No payment-type voucher data found in this period.
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Payment Type</TableHead>
                            <TableHead className="text-right">Discounts</TableHead>
                            <TableHead className="text-right">Usages</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {voucherReport.by_payment_type.map((entry) => (
                            <TableRow key={entry.payment_type}>
                              <TableCell>{formatLabel(entry.payment_type)}</TableCell>
                              <TableCell className="text-right">
                                {formatAmount(
                                  entry.total_discount || entry.total_discounts,
                                  appliedFilters.currency
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {Number(entry.usage_count || entry.total_usages || 0).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
