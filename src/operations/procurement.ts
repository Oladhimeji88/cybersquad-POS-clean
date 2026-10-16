// @ts-ignore -- plain JS prototype ledger
import { postPayable } from "@/lib/finance";
import type { OpsPolicy } from "./policy";
import { isoNow, money, nextNumber, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// PRO-01/02/06/07/13/15/18/19 and WAR-04. Suppliers must be approved to be used, cost evidence is append-only,
// a PO never becomes stock by existing, and low stock alone never silently buys anything.
export interface Supplier extends Tracked {
  name: string; contact: string; phone: string; paymentTermsDays: number; capabilities: string; status: "approved" | "pending" | "inactive"; createdAt: string;
}
export interface PriceEntry extends Tracked { supplierId: string; supplierName: string; product: string; unitCost: number; effectiveFrom: string; }
export interface POLine { product: string; qty: number; unitCost: number; received: number; }
export type DiscrepancyKind = "shortage" | "wrong_item" | "damage" | "serial_mismatch";
export interface Discrepancy { id: string; kind: DiscrepancyKind; line: number; qty: number; note: string; openedAt: string; openedBy: string; resolvedAt?: string; resolvedBy?: string; resolution?: string; }
export type PoChannel = "whatsapp" | "phone" | "email" | "portal";
export interface PurchaseOrder extends Tracked {
  number: string; supplierId: string; supplierName: string; paymentTermsDays: number; origin: { kind: "sourcing" | "replenishment" | "repair" | "manual"; ref?: string };
  lines: POLine[]; owner: string; channel: PoChannel; createdAt: string; expectedAt?: string; acknowledgedAt?: string; acknowledgement?: string;
  changes: { at: string; by: string; note: string; priceChanged: boolean; reviewed?: boolean }[];
  discrepancies: Discrepancy[]; cancelled?: { at: string; by: string; reason: string };
}
export interface SupplierReturn extends Tracked {
  number: string; poId: string; poNumber: string; supplierName: string; line: number; product: string; qty: number; unitValue: number; reason: string;
  kind: "return" | "warranty"; customerRef?: string; status: "open" | "shipped" | "credited" | "rejected"; createdAt: string; creditedAmount?: number; creditedAt?: string;
}
export interface Replenishment extends Tracked {
  number: string; product: string; quantity: number; reason: "low_stock" | "repeated_demand" | "manual"; note: string; status: "pending" | "approved" | "rejected" | "ordered"; createdAt: string; poId?: string;
}
export const DISCREPANCY_LABELS: Record<DiscrepancyKind, string> = { shortage: "Shortage", wrong_item: "Wrong item", damage: "Damaged", serial_mismatch: "Serial mismatch" };

export const supplierStore = recordStore<Supplier>("suppliers_v1", "supplier", (item) => item.name);
export const priceStore = recordStore<PriceEntry>("supplier_prices_v1", "price", (item) => item.supplierName + " · " + item.product);
export const poStore = recordStore<PurchaseOrder>("purchase_orders_v1", "po", (item) => item.number);
export const supplierReturnStore = recordStore<SupplierReturn>("supplier_returns_v1", "supplier_return", (item) => item.number);
export const replenishmentStore = recordStore<Replenishment>("replenishment_v1", "replenishment", (item) => item.number);

// ---- Suppliers (PRO-01) ----
export function addSupplier(actor: string, input: { name: string; contact: string; phone: string; paymentTermsDays: number; capabilities: string }) {
  if (!input.name.trim() || !input.phone.trim()) return reject("Enter the supplier name and a phone number.");
  if (!Number.isFinite(input.paymentTermsDays) || input.paymentTermsDays < 0) return reject("Payment terms must be zero or more days.");
  return supplierStore.change<Supplier>(actor, (list) => {
    if (list.some((entry) => entry.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new Error("This supplier already exists.");
    const item: Supplier = { id: crypto.randomUUID(), ...input, name: input.name.trim(), status: "pending", createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "added", detail: "awaiting approval", result: item };
  });
}
export function setSupplierStatus(actor: string, id: string, status: Supplier["status"], reason: string) {
  if (!reason.trim()) return reject("Enter the reason for this change.");
  return supplierStore.change(actor, (list) => {
    const item = supplierStore.find(list, id, "Supplier"); const before = item.status; item.status = status;
    return { item, action: "status_" + status, detail: before + " -> " + status + " · " + reason.trim() };
  });
}

// ---- Weekly price list (PRO-02): never overwrite old cost evidence ----
export function addPrice(actor: string, supplier: Supplier | undefined, product: string, unitCost: number, effectiveFrom: string) {
  if (!supplier || supplier.status !== "approved") return reject("Prices can only be recorded for an approved supplier.");
  if (!product.trim() || !(unitCost > 0) || !Number.isFinite(Date.parse(effectiveFrom))) return reject("Enter the product, a cost and an effective date.");
  return priceStore.change<PriceEntry>(actor, (list) => {
    const item: PriceEntry = { id: crypto.randomUUID(), supplierId: supplier.id, supplierName: supplier.name, product: product.trim(), unitCost: money(unitCost), effectiveFrom, history: [] };
    list.push(item); return { item, action: "recorded", detail: item.unitCost + " from " + effectiveFrom.slice(0, 10), result: item };
  });
}
// Pasted list: one "product, cost" per line. Returns the rows it could not read instead of guessing.
export function parsePriceList(text: string) {
  const rows: { product: string; cost: number }[] = []; const bad: string[] = [];
  for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    const match = line.match(/^(.*?)[,\t;]\s*([\d.,]+)$/); const cost = match ? Number(match[2].replace(/,/g, "")) : NaN;
    if (match && match[1].trim() && cost > 0) rows.push({ product: match[1].trim(), cost }); else bad.push(line);
  }
  return { rows, bad };
}
export function currentPrice(entries: PriceEntry[], supplierId: string, product: string, now = Date.now()) {
  return entries.filter((entry) => entry.supplierId === supplierId && entry.product.toLowerCase() === product.toLowerCase() && Date.parse(entry.effectiveFrom) <= now)
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) || Date.parse(b.history[0]?.at ?? "") - Date.parse(a.history[0]?.at ?? ""))[0];
}

// ---- Purchase orders (PRO-06/07/15/18) ----
export function poStatus(po: PurchaseOrder) {
  if (po.cancelled) return "Cancelled";
  if (po.discrepancies.some((entry) => !entry.resolvedAt)) return "Discrepancy open";
  if (po.changes.some((entry) => entry.priceChanged && !entry.reviewed)) return "Supplier price change";
  const ordered = po.lines.reduce((sum, line) => sum + line.qty, 0); const received = po.lines.reduce((sum, line) => sum + line.received, 0);
  if (received >= ordered) return "Complete";
  if (received > 0) return "Partially received";
  return po.acknowledgedAt ? "Confirmed by supplier" : "Awaiting supplier";
}
export const poValue = (po: PurchaseOrder, field: "qty" | "received" = "qty") => money(po.lines.reduce((sum, line) => sum + line[field] * line.unitCost, 0));

export function createPO(actor: string, supplier: Supplier | undefined, origin: PurchaseOrder["origin"], lines: { product: string; qty: number; unitCost: number }[], channel: PoChannel, expectedAt?: string) {
  if (!supplier || supplier.status !== "approved") return reject("Choose an approved supplier. Inactive or unapproved suppliers cannot be used.");
  if (!lines.length || lines.some((line) => !line.product.trim() || !Number.isInteger(line.qty) || line.qty < 1 || !(line.unitCost > 0))) return reject("Each line needs a product, a whole quantity and a cost.");
  if (expectedAt && !Number.isFinite(Date.parse(expectedAt))) return reject("Enter a valid expected date.");
  return poStore.change<PurchaseOrder>(actor, (list) => {
    const item: PurchaseOrder = { id: crypto.randomUUID(), number: "PO-" + String(list.length + 1).padStart(4, "0"), supplierId: supplier.id, supplierName: supplier.name,
      paymentTermsDays: supplier.paymentTermsDays, origin, lines: lines.map((line) => ({ ...line, product: line.product.trim(), unitCost: money(line.unitCost), received: 0 })), owner: actor, channel,
      createdAt: isoNow(), expectedAt, changes: [], discrepancies: [], history: [] };
    list.push(item); return { item, action: "created", detail: supplier.name + " · " + poValue(item) + " via " + channel, result: item };
  });
}
export function acknowledgePO(actor: string, id: string, note: string) {
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order"); if (item.cancelled) throw new Error("This order is cancelled.");
    item.acknowledgedAt = isoNow(); item.acknowledgement = note.trim() || "Supplier confirmed";
    return { item, action: "acknowledged", detail: item.acknowledgement };
  });
}
// A supplier change by WhatsApp or phone is recorded here so the PO stays the system of record. A new price must be reviewed.
export function recordSupplierChange(actor: string, id: string, note: string, newCosts: (number | undefined)[]) {
  if (!note.trim()) return reject("Record what the supplier changed.");
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order"); if (item.cancelled) throw new Error("This order is cancelled.");
    const moves: string[] = [];
    newCosts.forEach((cost, index) => { const line = item.lines[index]; if (line && cost !== undefined && cost > 0 && money(cost) !== line.unitCost) { moves.push(line.product + " " + line.unitCost + " -> " + money(cost)); line.unitCost = money(cost); } });
    item.changes.push({ at: isoNow(), by: actor, note: note.trim() + (moves.length ? " (" + moves.join("; ") + ")" : ""), priceChanged: moves.length > 0 });
    return { item, action: moves.length ? "supplier_price_change" : "supplier_change", detail: note.trim() + (moves.length ? " · " + moves.join("; ") : "") };
  });
}
export function reviewPriceChange(actor: string, id: string, note: string) {
  if (!note.trim()) return reject("Record how the new price was handled with Sales.");
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order"); const open = item.changes.filter((entry) => entry.priceChanged && !entry.reviewed);
    if (!open.length) throw new Error("There is no price change to review.");
    open.forEach((entry) => { entry.reviewed = true; });
    return { item, action: "price_change_reviewed", detail: note.trim() };
  });
}
// Receiving can be partial. The vendor bill follows what was physically received, not what was ordered.
export function receivePO(actor: string, id: string, receipts: { line: number; qty: number }[], note: string) {
  const entries = receipts.filter((entry) => entry.qty > 0);
  if (!entries.length) return reject("Enter at least one received quantity.");
  return poStore.change<{ complete: boolean }>(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order"); if (item.cancelled) throw new Error("This order is cancelled.");
    for (const entry of entries) {
      const line = item.lines[entry.line];
      if (!line || !Number.isInteger(entry.qty)) throw new Error("Invalid receipt line.");
      if (line.received + entry.qty > line.qty) throw new Error("Cannot receive more than was ordered for " + line.product + ". Raise a discrepancy instead.");
    }
    entries.forEach((entry) => { item.lines[entry.line].received += entry.qty; });
    const complete = item.lines.every((line) => line.received >= line.qty);
    const bill = postPayable(item.supplierName, { reference: item.number, amount: poValue(item, "received"), dueInDays: item.paymentTermsDays });
    return { item, action: complete ? "received_complete" : "received_partial", detail: entries.map((entry) => item.lines[entry.line].product + " x" + entry.qty).join(", ") + (note.trim() ? " · " + note.trim() : "") + (bill?.ok ? " · supplier bill updated" : ""), result: { complete } };
  });
}
export function raiseDiscrepancy(actor: string, id: string, line: number, kind: DiscrepancyKind, qty: number, note: string) {
  if (!note.trim()) return reject("Describe the discrepancy.");
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order");
    if (!item.lines[line]) throw new Error("Choose a line on the order.");
    item.discrepancies.push({ id: crypto.randomUUID(), kind, line, qty: Math.max(0, qty), note: note.trim(), openedAt: isoNow(), openedBy: actor });
    return { item, action: "discrepancy_opened", detail: DISCREPANCY_LABELS[kind] + " · " + item.lines[line].product + " · " + note.trim() };
  });
}
export function resolveDiscrepancy(actor: string, id: string, discrepancyId: string, resolution: string) {
  if (!resolution.trim()) return reject("Record how the supplier resolved it.");
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order"); const entry = item.discrepancies.find((value) => value.id === discrepancyId);
    if (!entry || entry.resolvedAt) throw new Error("This discrepancy is already resolved.");
    Object.assign(entry, { resolvedAt: isoNow(), resolvedBy: actor, resolution: resolution.trim() });
    return { item, action: "discrepancy_resolved", detail: DISCREPANCY_LABELS[entry.kind] + " · " + resolution.trim() };
  });
}
export function cancelPO(actor: string, id: string, reason: string) {
  if (!reason.trim()) return reject("Enter the reason.");
  return poStore.change(actor, (list) => {
    const item = poStore.find(list, id, "Purchase order");
    if (item.cancelled) throw new Error("Already cancelled.");
    if (item.lines.some((line) => line.received > 0)) throw new Error("Goods were already received. Raise a supplier return instead.");
    item.cancelled = { at: isoNow(), by: actor, reason: reason.trim() };
    return { item, action: "cancelled", detail: reason.trim() };
  });
}

// ---- Supplier returns and supplier warranty (PRO-19 / WAR-04) ----
export const returnedQty = (returns: SupplierReturn[], poId: string, line: number) =>
  returns.filter((entry) => entry.poId === poId && entry.line === line && entry.status !== "rejected").reduce((sum, entry) => sum + entry.qty, 0);
export function createSupplierReturn(actor: string, po: PurchaseOrder | undefined, existing: SupplierReturn[], line: number, qty: number, reason: string, kind: SupplierReturn["kind"], customerRef: string) {
  if (!po || !po.lines[line]) return reject("Link the original purchase order and line.");
  if (!reason.trim() || !Number.isInteger(qty) || qty < 1) return reject("Enter a whole quantity and the reason.");
  if (qty > po.lines[line].received - returnedQty(existing, po.id, line)) return reject("You can only return goods that were received and not already returned.");
  return supplierReturnStore.change<SupplierReturn>(actor, (list) => {
    const item: SupplierReturn = { id: crypto.randomUUID(), number: "SRT-" + String(list.length + 1).padStart(4, "0"), poId: po.id, poNumber: po.number, supplierName: po.supplierName, line,
      product: po.lines[line].product, qty, unitValue: po.lines[line].unitCost, reason: reason.trim(), kind, customerRef: customerRef.trim() || undefined, status: "open", createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "opened", detail: kind + " · " + item.product + " x" + qty + " · expected credit " + money(qty * item.unitValue), result: item };
  });
}
export function markReturnShipped(actor: string, id: string) {
  return supplierReturnStore.change(actor, (list) => {
    const item = supplierReturnStore.find(list, id, "Supplier return"); if (item.status !== "open") throw new Error("This return has already moved on.");
    item.status = "shipped"; return { item, action: "shipped", detail: "item sent back to " + item.supplierName };
  });
}
export function settleSupplierCredit(actor: string, id: string, outcome: "credited" | "rejected", amount: number, note: string) {
  if (outcome === "credited" && !(amount > 0)) return reject("Enter the credit or refund received.");
  if (!note.trim()) return reject("Record the supplier's response.");
  return supplierReturnStore.change(actor, (list) => {
    const item = supplierReturnStore.find(list, id, "Supplier return"); if (["credited", "rejected"].includes(item.status)) throw new Error("This return is already settled.");
    item.status = outcome; item.creditedAmount = outcome === "credited" ? money(amount) : 0; item.creditedAt = isoNow();
    return { item, action: outcome, detail: (outcome === "credited" ? "credit " + money(amount) : "rejected") + " · " + note.trim() };
  });
}

// ---- Replenishment decision queue (PRO-13 / INV-13) ----
export function requestReplenishment(actor: string, input: { product: string; quantity: number; reason: Replenishment["reason"]; note: string }) {
  if (!input.product.trim() || !Number.isInteger(input.quantity) || input.quantity < 1) return reject("Enter the product and a whole quantity.");
  return replenishmentStore.change<Replenishment>(actor, (list) => {
    const item: Replenishment = { id: crypto.randomUUID(), number: nextNumber("RPL", list.length), product: input.product.trim(), quantity: input.quantity, reason: input.reason, note: input.note.trim(), status: "pending", createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "requested", detail: item.product + " x" + item.quantity + " · " + input.reason.replace("_", " "), result: item };
  });
}
export function decideReplenishment(actor: string, id: string, decision: "approved" | "rejected", note: string) {
  if (!note.trim()) return reject("Record the reason for the decision.");
  return replenishmentStore.change(actor, (list) => {
    const item = replenishmentStore.find(list, id, "Replenishment request"); if (item.status !== "pending") throw new Error("This request is already decided.");
    item.status = decision; return { item, action: decision, detail: note.trim() };
  });
}
export async function orderFromReplenishment(actor: string, replenishmentId: string, supplier: Supplier | undefined, unitCost: number, channel: PoChannel) {
  const request = (await replenishmentStore.all()).find((entry) => entry.id === replenishmentId);
  if (!request || request.status !== "approved") throw new Error("Only an approved replenishment can be ordered.");
  const po = await createPO(actor, supplier, { kind: "replenishment", ref: request.number }, [{ product: request.product, qty: request.quantity, unitCost }], channel);
  await replenishmentStore.change(actor, (list) => {
    const item = replenishmentStore.find(list, replenishmentId, "Replenishment request"); item.status = "ordered"; item.poId = po.id;
    return { item, action: "ordered", detail: po.number };
  });
  return po;
}
// Low stock or repeated demand only ever creates a suggestion; a person decides.
export function lowStockSuggestions(stock: { product: string; quantity: number }[], open: Replenishment[], threshold: number) {
  return stock.filter((entry) => entry.quantity <= threshold && !open.some((request) => ["pending", "approved"].includes(request.status) && request.product.toLowerCase() === entry.product.toLowerCase()));
}

// ---- Work queue entries ----
export function procurementWorkItems(source: { pos: PurchaseOrder[]; returns: SupplierReturn[]; replenishments: Replenishment[]; policy: OpsPolicy; now: number }): WorkItem[] {
  const { policy, now } = source; const items: WorkItem[] = []; const age = (iso: string) => now - Date.parse(iso);
  for (const po of source.pos.filter((entry) => !entry.cancelled && poStatus(entry) !== "Complete")) {
    const status = poStatus(po); const overdue = Boolean(po.expectedAt && Date.parse(po.expectedAt) < now);
    const slowAck = !po.acknowledgedAt && age(po.createdAt) > policy.supplierAckHours * 3600000;
    const reason = status === "Discrepancy open" ? "Supplier discrepancy open" : status === "Supplier price change" ? "Supplier changed the price" : overdue ? "Delivery overdue" : slowAck ? "No supplier acknowledgement" : undefined;
    items.push({ id: "po:" + po.id, code: "PRO-06", workflow: "Purchase order", title: po.number + " · " + po.supplierName, state: status, owner: po.owner,
      waitingOn: status === "Awaiting supplier" ? "Supplier confirmation" : status === "Discrepancy open" ? "Supplier resolution" : status === "Supplier price change" ? "Price review" : "Supplier delivery",
      nextAction: status === "Discrepancy open" ? "Chase the supplier to resolve it" : status === "Supplier price change" ? "Review the new price and tell Sales" : status === "Awaiting supplier" ? "Get supplier acknowledgement" : "Receive the goods",
      since: po.createdAt, dueAt: po.expectedAt, exception: Boolean(reason), reason, tab: "procurement", ref: po.id });
  }
  for (const entry of source.returns.filter((value) => ["open", "shipped"].includes(value.status))) {
    const aged = age(entry.createdAt) > 3 * 86400000;
    items.push({ id: "srt:" + entry.id, code: entry.kind === "warranty" ? "WAR-04" : "PRO-19", workflow: entry.kind === "warranty" ? "Supplier warranty" : "Supplier return", title: entry.number + " · " + entry.product + " · " + entry.supplierName,
      state: entry.status === "open" ? "Return to send" : "Awaiting supplier credit", owner: "Procurement", waitingOn: entry.status === "open" ? "Dispatch back to supplier" : "Supplier credit or refund",
      nextAction: entry.status === "open" ? "Send the item and record it" : "Chase and record the credit", since: entry.createdAt, exception: aged, reason: aged ? "Credit ageing" : undefined, tab: "procurement", ref: entry.id });
  }
  for (const entry of source.replenishments.filter((value) => value.status === "pending" || value.status === "approved")) {
    items.push({ id: "rpl:" + entry.id, code: "PRO-13", workflow: "Replenishment", title: entry.number + " · " + entry.product + " x" + entry.quantity, state: entry.status === "pending" ? "Awaiting decision" : "Approved, not ordered",
      owner: "Procurement", waitingOn: entry.status === "pending" ? "Replenishment decision" : "Purchase order", nextAction: entry.status === "pending" ? "Approve or reject" : "Order from an approved supplier", since: entry.createdAt, exception: false, tab: "procurement", ref: entry.id });
  }
  return items;
}