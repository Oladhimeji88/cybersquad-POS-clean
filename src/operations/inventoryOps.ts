import { deviceIdentifiers } from "@/pos/lib/devices";
import type { Refund, Sale } from "@/pos/lib/store";
import type { OpsPolicy } from "./policy";
import { hoursFrom, isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// INV-02/04/08/09/10/13. A count records what was found and never rewrites the ledger by itself; a variance needs a
// cause, an owner and (above the limit) an approver; quarantined and reserved units are not sellable stock.
export type VarianceCause = "counting_error" | "damage" | "theft_loss" | "supplier_shortage" | "unrecorded_sale" | "other";
export const VARIANCE_CAUSES: Record<VarianceCause, string> = { counting_error: "Counting error", damage: "Damage", theft_loss: "Theft or loss", supplier_shortage: "Supplier shortage", unrecorded_sale: "Unrecorded sale", other: "Other" };
export interface CountLine { product: string; systemQty: number; unitValue: number; countedQty?: number; }
export interface StockCount extends Tracked { number: string; location: string; startedBy: string; startedAt: string; status: "counting" | "submitted"; lines: CountLine[]; }
export interface Variance extends Tracked {
  number: string; countId: string; countNumber: string; product: string; variance: number; unitValue: number; value: number; status: "open" | "ready" | "awaiting_approval" | "approved" | "rejected";
  cause?: VarianceCause; responsibility?: string; evidence?: string; classifiedBy?: string; decision?: { by: string; at: string; note: string }; createdAt: string;
}
export interface QuarantineItem extends Tracked {
  number: string; product: string; qty: number; serial?: string; reason: "damaged" | "faulty" | "returned" | "failed_delivery" | "supplier_issue"; source: string; nextAction: string;
  status: "quarantined" | "released" | "written_off" | "supplier_returned" | "sent_to_repair"; createdAt: string;
}
export interface Reservation extends Tracked {
  number: string; product: string; qty: number; serial?: string; customerName: string; reference: string; expiresAt: string; status: "active" | "released" | "converted"; createdAt: string;
}
export const QUARANTINE_REASONS: Record<QuarantineItem["reason"], string> = { damaged: "Damaged", faulty: "Faulty", returned: "Customer return", failed_delivery: "Failed delivery", supplier_issue: "Supplier issue" };

export const countStore = recordStore<StockCount>("stock_counts_v1", "count", (item) => item.number);
export const varianceStore = recordStore<Variance>("stock_variances_v1", "variance", (item) => item.number);
export const quarantineStore = recordStore<QuarantineItem>("quarantine_v1", "quarantine", (item) => item.number);
export const reservationStore = recordStore<Reservation>("reservations_v1", "reservation", (item) => item.number);

// ---- Counts (INV-08) ----
export function startCount(actor: string, location: string, lines: { product: string; systemQty: number; unitValue: number }[]) {
  if (!location.trim()) return reject("Enter where the count is taking place.");
  if (!lines.length) return reject("Add at least one product to count.");
  return countStore.change<StockCount>(actor, (list) => {
    const item: StockCount = { id: crypto.randomUUID(), number: "CNT-" + String(list.length + 1).padStart(4, "0"), location: location.trim(), startedBy: actor, startedAt: isoNow(), status: "counting",
      lines: lines.map((line) => ({ product: line.product.trim(), systemQty: Math.max(0, line.systemQty), unitValue: Math.max(0, line.unitValue) })), history: [] };
    list.push(item); return { item, action: "started", detail: item.location + " · " + item.lines.length + " products", result: item };
  });
}
export function recordCounted(actor: string, id: string, line: number, qty: number) {
  if (!Number.isInteger(qty) || qty < 0) return reject("Counted quantity must be a whole number, zero or more.");
  return countStore.change(actor, (list) => {
    const item = countStore.find(list, id, "Count"); if (item.status !== "counting") throw new Error("This count is already submitted.");
    if (!item.lines[line]) throw new Error("Choose a line from the count.");
    item.lines[line].countedQty = qty; return { item, action: "counted", detail: item.lines[line].product + " = " + qty };
  });
}
// Submitting raises one variance case per difference. The ledger is untouched.
export async function submitCount(actor: string, id: string) {
  const created: Variance[] = [];
  const count = await countStore.change<StockCount>(actor, (list) => {
    const item = countStore.find(list, id, "Count"); if (item.status !== "counting") throw new Error("This count is already submitted.");
    const missing = item.lines.filter((line) => line.countedQty === undefined);
    if (missing.length) throw new Error("Count every product first (" + missing.length + " left).");
    item.status = "submitted";
    const differences = item.lines.filter((line) => line.countedQty !== line.systemQty).length;
    return { item, action: "submitted", detail: differences + " variance(s) raised for review", result: item };
  });
  for (const line of count.lines.filter((entry) => entry.countedQty !== entry.systemQty)) {
    created.push(await varianceStore.change<Variance>(actor, (list) => {
      const variance = line.countedQty! - line.systemQty;
      const item: Variance = { id: crypto.randomUUID(), number: "VAR-" + String(list.length + 1).padStart(4, "0"), countId: count.id, countNumber: count.number, product: line.product, variance,
        unitValue: line.unitValue, value: money(Math.abs(variance) * line.unitValue), status: "open", createdAt: isoNow(), history: [] };
      list.push(item); return { item, action: "raised", detail: line.product + " " + (variance > 0 ? "+" : "") + variance + " · value " + item.value, result: item };
    }));
  }
  return { count, variances: created };
}

// ---- Variance review (INV-09) ----
export function classifyVariance(actor: string, id: string, cause: VarianceCause, responsibility: string, evidence: string, policy: OpsPolicy) {
  if (!responsibility.trim() || !evidence.trim()) return reject("Record who is responsible and the evidence for the cause.");
  return varianceStore.change(actor, (list) => {
    const item = varianceStore.find(list, id, "Variance"); if (!["open", "ready", "awaiting_approval"].includes(item.status)) throw new Error("This variance is already decided.");
    item.cause = cause; item.responsibility = responsibility.trim(); item.evidence = evidence.trim(); item.classifiedBy = actor;
    item.status = item.value > policy.varianceApprovalValue ? "awaiting_approval" : "ready";
    return { item, action: "classified", detail: VARIANCE_CAUSES[cause] + " · " + responsibility.trim() + " · " + (item.status === "awaiting_approval" ? "needs approval" : "within limit") };
  });
}
// Approving records an adjustment to apply in Odoo; it never edits stock quantities here.
export function decideVariance(actor: string, id: string, decision: "approved" | "rejected", note: string, canApproveLarge: boolean) {
  if (!note.trim()) return reject("Record the reason for the decision.");
  return varianceStore.change(actor, (list) => {
    const item = varianceStore.find(list, id, "Variance");
    if (item.status === "open") throw new Error("Classify the cause and responsibility first.");
    if (!["ready", "awaiting_approval"].includes(item.status)) throw new Error("This variance is already decided.");
    if (item.status === "awaiting_approval" && !canApproveLarge) throw new Error("This variance is above the approval limit. A manager must decide it.");
    if (item.status === "awaiting_approval" && item.classifiedBy === actor) throw new Error("The person who classified it cannot also approve it.");
    item.status = decision; item.decision = { by: actor, at: isoNow(), note: note.trim() };
    return { item, action: decision, detail: (decision === "approved" ? "adjust " + item.variance + " in Odoo · " : "no adjustment · ") + note.trim() };
  });
}

// ---- Quarantine (INV-10) ----
export function quarantineUnit(actor: string, input: { product: string; qty: number; serial: string; reason: QuarantineItem["reason"]; source: string; nextAction: string }) {
  if (!input.product.trim() || !Number.isInteger(input.qty) || input.qty < 1 || !input.nextAction.trim()) return reject("Enter the product, quantity and the next action.");
  return quarantineStore.change<QuarantineItem>(actor, (list) => {
    const serial = input.serial.trim();
    if (serial && list.some((entry) => entry.serial === serial && entry.status === "quarantined")) throw new Error("This serial is already in quarantine.");
    const item: QuarantineItem = { id: crypto.randomUUID(), number: "QRN-" + String(list.length + 1).padStart(4, "0"), product: input.product.trim(), qty: input.qty, serial: serial || undefined,
      reason: input.reason, source: input.source.trim(), nextAction: input.nextAction.trim(), status: "quarantined", createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "quarantined", detail: item.product + " x" + item.qty + " · " + QUARANTINE_REASONS[input.reason], result: item };
  });
}
export function resolveQuarantine(actor: string, id: string, outcome: Exclude<QuarantineItem["status"], "quarantined">, note: string) {
  if (!note.trim()) return reject("Record the inspection result or decision.");
  return quarantineStore.change(actor, (list) => {
    const item = quarantineStore.find(list, id, "Quarantine record"); if (item.status !== "quarantined") throw new Error("This item has already left quarantine.");
    item.status = outcome; return { item, action: outcome, detail: note.trim() };
  });
}

// ---- Reservations (INV-04) ----
export const soldSerials = (sales: Sale[], refunds: Refund[]) => {
  const returned = new Set(refunds.filter((refund) => refund.status !== "cancelled").flatMap((refund) => refund.lines.flatMap((line) => line.deviceIds)));
  return new Set(sales.filter((sale) => !sale.isDemo && sale.lifecycle !== "cancelled").flatMap((sale) => sale.lines.flatMap((line) => (line.devices ?? []).filter((unit) => !returned.has(unit.id)).flatMap(deviceIdentifiers))));
};
export const reservationLive = (entry: Reservation, now = Date.now()) => entry.status === "active" && Date.parse(entry.expiresAt) > now;
export function reservedQty(list: Reservation[], product: string, now = Date.now()) {
  return list.filter((entry) => reservationLive(entry, now) && entry.product.toLowerCase() === product.toLowerCase()).reduce((sum, entry) => sum + entry.qty, 0);
}
export function reserveStock(actor: string, input: { product: string; qty: number; serial: string; customerName: string; reference: string }, sold: Set<string>, quarantined: QuarantineItem[], policy: OpsPolicy) {
  if (!input.product.trim() || !input.customerName.trim() || !Number.isInteger(input.qty) || input.qty < 1) return reject("Enter the product, quantity and customer.");
  const serial = input.serial.trim();
  if (serial && sold.has(serial)) return reject("That serial or IMEI has already been sold.");
  if (serial && quarantined.some((entry) => entry.serial === serial && entry.status === "quarantined")) return reject("That unit is in quarantine and cannot be reserved.");
  return reservationStore.change<Reservation>(actor, (list) => {
    if (serial && list.some((entry) => entry.serial === serial && reservationLive(entry))) throw new Error("That unit is already reserved for another customer.");
    const now = isoNow();
    const item: Reservation = { id: crypto.randomUUID(), number: "RSV-" + String(list.length + 1).padStart(4, "0"), product: input.product.trim(), qty: input.qty, serial: serial || undefined, customerName: input.customerName.trim(),
      reference: input.reference.trim(), expiresAt: hoursFrom(now, policy.reservationHours), status: "active", createdAt: now, history: [] };
    list.push(item); return { item, action: "reserved", detail: item.product + " x" + item.qty + " for " + item.customerName + " until " + new Date(item.expiresAt).toLocaleString(), result: item };
  });
}
export function closeReservation(actor: string, id: string, outcome: "released" | "converted", note: string) {
  return reservationStore.change(actor, (list) => {
    const item = reservationStore.find(list, id, "Reservation"); if (item.status !== "active") throw new Error("This reservation is already closed.");
    item.status = outcome; return { item, action: outcome, detail: note.trim() || outcome };
  });
}

// ---- Serial trace (INV-02): everywhere one serial or IMEI appears, so duplicates and misassignment are visible ----
export function traceSerial(query: string, data: { sales: Sale[]; reservations: Reservation[]; quarantine: QuarantineItem[]; returns: { number: string; serial?: string; item: string }[]; sourcing: { number: string; purchase?: { serial?: string }; receipt?: { serial?: string }; product: string }[]; jobs: { number: string; serial?: string; item: string }[] }) {
  const key = query.trim().toLowerCase(); if (!key) return [];
  const hits: { where: string; ref: string; detail: string }[] = [];
  for (const sale of data.sales) for (const line of sale.lines) for (const unit of line.devices ?? []) if (deviceIdentifiers(unit).some((id) => id.toLowerCase() === key)) hits.push({ where: "Sale", ref: sale.saleNumber, detail: line.name + (sale.lifecycle === "cancelled" ? " (cancelled)" : "") });
  for (const entry of data.reservations) if (entry.serial?.toLowerCase() === key) hits.push({ where: "Reservation", ref: entry.number, detail: entry.product + " · " + entry.status });
  for (const entry of data.quarantine) if (entry.serial?.toLowerCase() === key) hits.push({ where: "Quarantine", ref: entry.number, detail: entry.product + " · " + entry.status.replace("_", " ") });
  for (const entry of data.returns) if (entry.serial?.toLowerCase() === key) hits.push({ where: "Return", ref: entry.number, detail: entry.item });
  for (const entry of data.sourcing) if ([entry.purchase?.serial, entry.receipt?.serial].some((value) => value?.toLowerCase() === key)) hits.push({ where: "Sourcing", ref: entry.number, detail: entry.product });
  for (const entry of data.jobs) if (entry.serial?.toLowerCase() === key) hits.push({ where: "Logistics", ref: entry.number, detail: entry.item });
  return hits;
}

// Repeated unmet demand is a signal for a person to consider stocking the item, never an automatic purchase.
export function demandSignals(sourcing: { product: string; createdAt: string }[], now = Date.now(), minRequests = 3, days = 30) {
  const counts = new Map<string, { product: string; count: number }>();
  for (const request of sourcing.filter((entry) => now - Date.parse(entry.createdAt) <= days * 86400000)) {
    const key = request.product.trim().toLowerCase(); const row = counts.get(key) ?? { product: request.product.trim(), count: 0 }; row.count++; counts.set(key, row);
  }
  return [...counts.values()].filter((row) => row.count >= minRequests).sort((a, b) => b.count - a.count);
}

export function inventoryWorkItems(source: { counts: StockCount[]; variances: Variance[]; quarantine: QuarantineItem[]; reservations: Reservation[]; policy: OpsPolicy; now: number }): WorkItem[] {
  const { now } = source; const items: WorkItem[] = []; const days = (iso: string) => Math.floor((now - Date.parse(iso)) / 86400000);
  for (const count of source.counts.filter((entry) => entry.status === "counting")) {
    const aged = days(count.startedAt) >= 1;
    items.push({ id: "count:" + count.id, code: "INV-08", workflow: "Stock count", title: count.number + " · " + count.location, state: "Counting", owner: count.startedBy, waitingOn: "Remaining counts", nextAction: "Finish counting and submit",
      since: count.startedAt, exception: aged, reason: aged ? "Count left open" : undefined, tab: "inventory", ref: count.id });
  }
  for (const entry of source.variances.filter((value) => ["open", "ready", "awaiting_approval"].includes(value.status))) {
    const approval = entry.status === "awaiting_approval"; const aged = days(entry.createdAt) >= 2;
    items.push({ id: "variance:" + entry.id, code: "INV-09", workflow: "Inventory variance", title: entry.number + " · " + entry.product + " (" + (entry.variance > 0 ? "+" : "") + entry.variance + ")", state: entry.status === "open" ? "Needs investigation" : approval ? "Awaiting approval" : "Ready to decide",
      owner: approval ? "Admin" : "Inventory", waitingOn: entry.status === "open" ? "Cause and responsibility" : approval ? "Manager approval" : "Adjustment decision", nextAction: entry.status === "open" ? "Investigate and classify" : approval ? "Approve or reject the adjustment" : "Approve or reject the adjustment",
      since: entry.createdAt, exception: approval || aged, reason: approval ? "Over approval limit" : aged ? "Variance ageing" : undefined, tab: "inventory", ref: entry.id });
  }
  for (const entry of source.quarantine.filter((value) => value.status === "quarantined")) {
    const aged = days(entry.createdAt) >= 7;
    items.push({ id: "qrn:" + entry.id, code: "INV-10", workflow: "Quarantine", title: entry.number + " · " + entry.product + " x" + entry.qty, state: "In quarantine", owner: "Inventory", waitingOn: "Inspection decision", nextAction: entry.nextAction,
      since: entry.createdAt, exception: aged, reason: aged ? "In quarantine over 7 days" : undefined, tab: "inventory", ref: entry.id });
  }
  for (const entry of source.reservations.filter((value) => value.status === "active")) {
    const expired = Date.parse(entry.expiresAt) <= now;
    if (expired) items.push({ id: "rsv:" + entry.id, code: "INV-04", workflow: "Stock reservation", title: entry.number + " · " + entry.product + " · " + entry.customerName, state: "Reservation expired", owner: "Inventory", waitingOn: "Release or convert", nextAction: "Release the stock or convert it to a sale",
      since: entry.createdAt, dueAt: entry.expiresAt, exception: true, reason: "Reservation expired", tab: "inventory", ref: entry.id });
  }
  return items;
}
