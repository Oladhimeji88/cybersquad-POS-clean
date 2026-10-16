import { getSalePayments } from "@/pos/lib/store";
import type { OpsData } from "./data";
import { reservationLive } from "./inventoryOps";
import { logisticsPerformance } from "./logistics";
import { poValue } from "./procurement";
import { LOST_REASONS, activeOffer, directMargin, sourcingTiming } from "./sourcing";
import type { EodSnapshot } from "./routines";
import { money } from "./records";
import type { WorkItem } from "./workItems";

// Management reporting (handoff section 16) derived from the workflow records. Nothing here is typed in by hand.
export type ReportRow = [label: string, value: string | number, note?: string];
export interface ReportSection { title: string; rows: ReportRow[]; }
const within = (iso: string | undefined, from: number, to: number) => Boolean(iso) && Date.parse(iso!) >= from && Date.parse(iso!) <= to;
const avg = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
const pct = (part: number, whole: number) => (whole ? Math.round(part / whole * 100) + "%" : "n/a");
const completedSales = (data: OpsData) => data.sales.filter((sale) => !sale.isDemo && (!sale.lifecycle || sale.lifecycle === "completed"));

// SAL-14: every lost sale carries a reason, whichever workflow it was lost in.
export function lostSales(data: OpsData, from: number, to: number) {
  const reasons = new Map<string, number>(); const add = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const known = (text: string) => LOST_REASONS.find((entry) => text.startsWith(entry)) ?? "Other / not recorded";
  data.sourcing.filter((entry) => entry.closed?.outcome === "lost" && within(entry.closed.at, from, to)).forEach((entry) => add(known(entry.closed?.reason ?? "")));
  data.enquiries.filter((entry) => entry.status === "lost" && within(entry.updatedAt, from, to)).forEach((entry) => add(known(entry.outcome ?? "")));
  data.webOrders.filter((entry) => entry.cancellation && within(entry.cancellation.at, from, to)).forEach(() => add("Other / not recorded"));
  data.abandoned.filter((entry) => entry.outcome && entry.outcome.result !== "converted" && within(entry.outcome.at, from, to)).forEach((entry) => add(entry.outcome!.result === "no_response" ? "No response" : "Changed mind"));
  data.quotes.filter((entry) => entry.status === "declined" && within(entry.decision?.at, from, to)).forEach(() => add("Other / not recorded"));
  return [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// OPS-15: did workflows reach the result they exist for, and in time, rather than just move through steps.
export function expectedResults(data: OpsData, from: number, to: number) {
  const src = data.sourcing.filter((entry) => entry.closed && within(entry.closed.at, from, to));
  const fulfilled = src.filter((entry) => entry.closed?.outcome === "fulfilled");
  const ontime = fulfilled.filter((entry) => sourcingTiming(entry, data.policy).state !== "breached");
  const returns = data.returns.filter((entry) => entry.closed && within(entry.closed.at, from, to));
  const complaints = data.complaints.filter((entry) => entry.resolution && within(entry.resolution.at, from, to));
  const orders = data.webOrders.filter((entry) => within(entry.createdAt, from, to) && (entry.fulfilment === "fulfilled" || entry.fulfilment === "cancelled"));
  return [
    { family: "Sourcing", finished: src.length, achieved: fulfilled.length, onTime: ontime.length, control: "Customer price and ETA recorded before purchase" },
    { family: "Returns and warranty", finished: returns.length, achieved: returns.filter((entry) => entry.disposition && entry.receipt || entry.disposition?.kind === "reject").length, onTime: undefined, control: "Inspected and dispositioned before restock or refund" },
    { family: "Complaints", finished: complaints.length, achieved: complaints.filter((entry) => entry.updates.length > 0).length, onTime: undefined, control: "Customer told the outcome before closure" },
    { family: "Digital orders", finished: orders.length, achieved: orders.filter((entry) => entry.fulfilment === "fulfilled").length, onTime: undefined, control: "Nothing fulfilled before payment was verified" },
  ];
}

export function buildReport(data: OpsData, from: number, to: number, now = Date.now()): ReportSection[] {
  const sales = completedSales(data).filter((sale) => within(sale.createdAt, from, to)); const revenue = money(sales.reduce((sum, sale) => sum + sale.total, 0));
  const paidRefunds = data.refunds.filter((refund) => !refund.isDemo && refund.status === "paid" && within(refund.paidAt, from, to) && refund.kind !== "deposit"); const refunded = money(paidRefunds.reduce((sum, refund) => sum + refund.total, 0));
  const sent = data.quotes.filter((quote) => quote.versions.some((version) => within(version.sentAt, from, to))); const accepted = sent.filter((quote) => quote.status === "accepted");
  const enquiries = data.enquiries.filter((entry) => within(entry.createdAt, from, to));
  const src = data.sourcing.filter((entry) => within(entry.createdAt, from, to));
  const quoted = src.filter((entry) => entry.offers.length); const fulfilled = src.filter((entry) => entry.closed?.outcome === "fulfilled");
  const lostForDelay = data.sourcing.filter((entry) => entry.closed?.outcome === "lost" && within(entry.closed.at, from, to) && ["Took too long", "Supplier could not supply"].includes(entry.closed.reason ?? ""));
  const directs = data.sourcing.filter((entry) => entry.path === "direct" && entry.purchase && activeOffer(entry));
  const margins = directs.map(directMargin).filter((value): value is number => value !== undefined);
  const withSerial = data.sourcing.filter((entry) => entry.purchase).filter((entry) => entry.purchase?.serial || entry.receipt?.serial);
  const perf = logisticsPerformance(data.jobs, from, to, now);
  const openComplaints = data.complaints.filter((entry) => !entry.resolution); const resolved = data.complaints.filter((entry) => entry.resolution && within(entry.resolution.at, from, to));
  const returnsIn = data.returns.filter((entry) => within(entry.createdAt, from, to)); const refundHours = paidRefunds.map((refund) => (Date.parse(refund.paidAt!) - Date.parse(refund.createdAt)) / 3600000);
  const reasonCounts = new Map<string, number>(); returnsIn.forEach((entry) => reasonCounts.set(entry.reason, (reasonCounts.get(entry.reason) ?? 0) + 1));
  const codSales = data.sales.filter((sale) => !sale.isDemo && sale.cod && ["delivered", "collected"].includes(sale.cod.status) && !sale.cod.settledAt);
  const codValue = money(codSales.reduce((sum, sale) => sum + sale.total, 0) + perf.codOutstandingValue);
  const payableOpen = money(data.pos.filter((po) => !po.cancelled).reduce((sum, po) => sum + poValue(po, "received"), 0));
  const lost = lostSales(data, from, to);
  return [
    { title: "Sales", rows: [["Revenue", revenue], ["Sales count", sales.length], ["Average transaction value", sales.length ? Math.round(revenue / sales.length) : 0], ["Paid returns", refunded], ["Net sales", money(revenue - refunded)],
      ["Quote conversion", pct(accepted.length, sent.length), sent.length + " quotes sent"], ["Follow-up completion", pct(enquiries.filter((entry) => entry.status !== "open").length, enquiries.length), enquiries.length + " opened"],
      ["Lost sales", lost.reduce((sum, entry) => sum + entry.count, 0), lost.slice(0, 3).map((entry) => entry.reason + " (" + entry.count + ")").join(", ") || "None"]] },
    { title: "Demand and sourcing", rows: [["Unavailable demand (requests)", src.length], ["Sourcing conversion", pct(fulfilled.length, src.length)],
      ["Average time to first supplier response (min)", avg(src.filter((entry) => entry.firstResponseAt).map((entry) => (Date.parse(entry.firstResponseAt!) - Date.parse(entry.createdAt)) / 60000))],
      ["Average time to customer quote (min)", avg(quoted.map((entry) => (Date.parse(entry.offers[0].at) - Date.parse(entry.createdAt)) / 60000))],
      ["Fulfilled within target", pct(fulfilled.filter((entry) => sourcingTiming(entry, data.policy).state !== "breached").length, fulfilled.length), "target " + data.policy.sourcingTargetMinutes + " min, a target not a guarantee"],
      ["Lost due to stock or delay", lostForDelay.length]] },
    { title: "Inventory", rows: [["Open stock counts", data.counts.filter((entry) => entry.status === "counting").length], ["Open variances", data.variances.filter((entry) => ["open", "ready", "awaiting_approval"].includes(entry.status)).length,
      "value " + money(data.variances.filter((entry) => ["open", "ready", "awaiting_approval"].includes(entry.status)).reduce((sum, entry) => sum + entry.value, 0))],
      ["Count variance by cause", [...new Set(data.variances.map((entry) => entry.cause).filter(Boolean))].length + " cause(s) classified"], ["In quarantine", data.quarantine.filter((entry) => entry.status === "quarantined").length],
      ["Active reservations", data.reservations.filter((entry) => reservationLive(entry, now)).length], ["Open receiving discrepancies", data.pos.reduce((sum, po) => sum + po.discrepancies.filter((entry) => !entry.resolvedAt).length, 0)],
      ["Serial completeness (purchases)", pct(withSerial.length, data.sourcing.filter((entry) => entry.purchase).length)]] },
    { title: "Logistics", rows: [["Jobs in period", data.jobs.filter((entry) => within(entry.createdAt, from, to)).length], ["Failed deliveries", perf.failedDeliveries], ["Custody exceptions", perf.custodyExceptions], ["Direct fulfilment jobs", perf.directFulfilment],
      ["COD outstanding (value)", perf.codOutstandingValue, "oldest " + perf.codOldestDays + " day(s)"], ...perf.partners.map((partner): ReportRow => ["Partner: " + partner.partner, partner.delivered + " delivered", "avg " + partner.averageMinutes + " min · failure " + partner.failureRate + "%"])] },
    { title: "Customer care, warranty and returns", rows: [["Open complaints", openComplaints.length], ["Update compliance", pct(openComplaints.filter((entry) => Date.parse(entry.nextUpdateDueAt) >= now).length, openComplaints.length), "open complaints with the next update not yet overdue"],
      ["Average resolution time (hours)", avg(resolved.map((entry) => (Date.parse(entry.resolution!.at) - Date.parse(entry.createdAt)) / 3600000))], ["Service recovery given", money(data.complaints.filter((entry) => entry.recovery?.status === "approved").reduce((sum, entry) => sum + (entry.recovery?.value ?? 0), 0))],
      ["Return and warranty cases", returnsIn.length, [...reasonCounts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => reason + " (" + count + ")").join(", ")], ["Refund turnaround (hours)", avg(refundHours)],
      ["Supplier returns awaiting credit", data.supplierReturns.filter((entry) => ["open", "shipped"].includes(entry.status)).length]] },
    { title: "Finance", rows: [["Collections (payments taken)", money(sales.flatMap((sale) => getSalePayments(sale)).reduce((sum, payment) => sum + payment.amount, 0))], ["COD receivable outstanding", codValue],
      ["Supplier bills raised from receipts", payableOpen], ["Unreconciled differences", data.reconciliations.filter((entry) => entry.status === "exception").length], ["Expenses awaiting approval", data.expenses.filter((entry) => entry.status === "requested").length],
      ["Direct-fulfilment margin", margins.length ? money(margins.reduce((sum, value) => sum + value, 0)) : "n/a", directs.length - margins.length > 0 ? "Data caveat: " + (directs.length - margins.length) + " without cost" : margins.length + " order(s) with full cost data"]] },
  ];
}

// OPS-07: the day's figures, generated. Staff add narrative only.
export function buildEod(data: OpsData, date: string, exceptions: WorkItem[]): EodSnapshot {
  const day = (iso?: string) => (iso ?? "").slice(0, 10) === date;
  const sales = completedSales(data).filter((sale) => day(sale.createdAt));
  return { generatedAt: new Date().toISOString(), exceptions: exceptions.filter((item) => item.exception).length, figures: {
    "Sales": sales.length, "Revenue": money(sales.reduce((sum, sale) => sum + sale.total, 0)),
    "Refunds paid": money(data.refunds.filter((refund) => !refund.isDemo && refund.status === "paid" && day(refund.paidAt)).reduce((sum, refund) => sum + refund.total, 0)),
    "Sourcing started": data.sourcing.filter((entry) => day(entry.createdAt)).length, "Sourcing fulfilled": data.sourcing.filter((entry) => entry.closed?.outcome === "fulfilled" && day(entry.closed.at)).length,
    "Sourcing lost": data.sourcing.filter((entry) => entry.closed?.outcome === "lost" && day(entry.closed.at)).length, "Digital orders": data.webOrders.filter((entry) => day(entry.createdAt)).length,
    "Deliveries completed": data.jobs.filter((entry) => day(entry.pod?.at)).length, "Failed deliveries": data.jobs.filter((entry) => entry.failures.some((failure) => day(failure.at))).length,
    "Returns opened": data.returns.filter((entry) => day(entry.createdAt)).length, "Complaints opened": data.complaints.filter((entry) => day(entry.createdAt)).length,
    "Complaints resolved": data.complaints.filter((entry) => day(entry.resolution?.at)).length, "Follow-ups due": data.enquiries.filter((entry) => entry.status === "open" && day(entry.followUpAt)).length,
    "Purchase orders raised": data.pos.filter((entry) => day(entry.createdAt)).length, "Open work items": exceptions.length, "Open exceptions": exceptions.filter((item) => item.exception).length } };
}
