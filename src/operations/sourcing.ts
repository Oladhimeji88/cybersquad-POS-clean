import { appendAuditUnlocked, readFromStorage, withSaleLock, writeToStorage } from "@/pos/lib/store";
import type { SaleCustomer } from "@/pos/lib/devices";
import type { OpsPolicy } from "./policy";

// SAL-04 / SAL-08 / SAL-09 / PRO-03..05 / PRO-16 / PRO-17 / INV-05 / INV-06.
// Supplier availability, a PO or an expected delivery is never store stock: store stock only
// exists once Inventory records physical receipt, and direct fulfilment never touches store stock.
export type SourcingPath = "store" | "direct";
export type PaymentTerms = "prepaid" | "cod" | "deposit";
export const LOST_REASONS = ["Price too high", "Took too long", "Supplier could not supply", "No response", "Changed mind", "Bought elsewhere"] as const;

export interface SupplierOption {
  id: string; supplier: string; cost: number; availability: "full" | "partial" | "none"; availableQty: number;
  etaMinutes: number; note?: string; at: string; by: string;
}
export interface CustomerOffer { version: number; optionId: string; price: number; etaMinutes: number; at: string; by: string; validUntil: string; }
export interface SourcingEvent { at: string; by: string; action: string; detail: string; }
export interface SourcingRequest {
  id: string; number: string; customer: SaleCustomer; product: string; specification: string; quantity: number; urgent: boolean;
  owner: string; procurementOwner?: string; createdAt: string; firstResponseAt?: string;
  options: SupplierOption[]; offers: CustomerOffer[]; priceReview?: { at: string; note: string };
  commitment?: { at: string; by: string; offerVersion: number; terms: PaymentTerms; amountPaid: number };
  path?: SourcingPath;
  purchase?: { supplier: string; unitCost: number; reference: string; at: string; by: string; serial?: string };
  receipt?: { at: string; by: string; serial?: string; note?: string };
  delivery?: { at: string; by: string; recipient: string; reference?: string; packagingConfirmed?: boolean };
  remittedAt?: string; remittedBy?: string;
  failure?: { at: string; by: string; note: string };
  closed?: { at: string; by: string; outcome: "fulfilled" | "lost" | "cancelled"; reason?: string };
  history: SourcingEvent[];
}
const KEY = "sourcing_v1";

export async function getSourcing(): Promise<SourcingRequest[]> {
  const raw = await readFromStorage<SourcingRequest[]>(KEY);
  return Array.isArray(raw) ? raw : [];
}
async function change<T>(actor: string, mutate: (all: SourcingRequest[]) => { request: SourcingRequest; action: string; detail: string; result?: T }) {
  if (!actor.trim()) throw new Error("Sign in to record this action.");
  return withSaleLock(async () => {
    const all = await getSourcing(); const { request, action, detail, result } = mutate(all);
    request.history.push({ at: new Date().toISOString(), by: actor, action, detail });
    await writeToStorage(KEY, all);
    await appendAuditUnlocked(actor, "sourcing_" + action, request.number + " · " + detail);
    return result as T;
  });
}
function open(all: SourcingRequest[], id: string) {
  const request = all.find((entry) => entry.id === id);
  if (!request) throw new Error("Sourcing request not found.");
  if (request.closed) throw new Error("This request is already closed.");
  return request;
}
const money = (value: number) => Math.round(value * 100) / 100;
export const activeOffer = (request: SourcingRequest) => request.offers[request.offers.length - 1];
export const suggestedPrice = (cost: number, marginPercent: number) => Math.ceil(cost * (1 + marginPercent / 100) / 100) * 100;

export function createSourcing(actor: string, input: { customer: SaleCustomer; product: string; specification: string; quantity: number; urgent: boolean }) {
  if (!input.customer.name.trim() || !input.customer.phone.trim()) return Promise.reject(new Error("Select the customer first."));
  if (!input.product.trim()) return Promise.reject(new Error("Enter the exact product."));
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return Promise.reject(new Error("Quantity must be a whole number."));
  return change<SourcingRequest>(actor, (all) => {
    const now = new Date().toISOString();
    const request: SourcingRequest = { id: crypto.randomUUID(), number: "SRC-" + String(all.length + 1).padStart(4, "0"), customer: input.customer,
      product: input.product.trim(), specification: input.specification.trim(), quantity: input.quantity, urgent: input.urgent, owner: actor, createdAt: now, options: [], offers: [], history: [] };
    all.push(request);
    return { request, action: "started", detail: request.product + " x" + request.quantity + " for " + request.customer.name, result: request };
  });
}

export function addSupplierOption(actor: string, id: string, input: Omit<SupplierOption, "id" | "at" | "by">) {
  if (!input.supplier.trim() || !(input.cost > 0) || !(input.etaMinutes >= 0)) return Promise.reject(new Error("Enter the supplier, cost and ETA."));
  if (input.availability !== "none" && !(input.availableQty > 0)) return Promise.reject(new Error("Enter how many units the supplier has."));
  return change(actor, (all) => {
    const request = open(all, id); const at = new Date().toISOString();
    request.options.push({ ...input, supplier: input.supplier.trim(), cost: money(input.cost), id: crypto.randomUUID(), at, by: actor });
    request.firstResponseAt ??= at; request.procurementOwner ??= actor;
    return { request, action: "option_recorded", detail: input.supplier + " · " + input.availability + " · cost " + money(input.cost) };
  });
}

// Returns the customer-facing price and ETA. After a commitment, a new price is held for explicit review (PRO-16).
export function returnOffer(actor: string, id: string, optionId: string, price: number, policy: OpsPolicy) {
  return change(actor, (all) => {
    const request = open(all, id); const option = request.options.find((entry) => entry.id === optionId);
    if (!option || option.availability === "none") throw new Error("Choose a supplier option that can supply the item.");
    if (!(price > 0)) throw new Error("Enter the customer price.");
    if (price < option.cost) throw new Error("The customer price is below supplier cost. Raise it or get a manager to approve a commercial exception.");
    const at = new Date(); const previous = activeOffer(request);
    request.offers.push({ version: request.offers.length + 1, optionId, price: money(price), etaMinutes: option.etaMinutes, at: at.toISOString(), by: actor,
      validUntil: new Date(at.getTime() + policy.offerValidHours * 3600000).toISOString() });
    if (request.commitment) {
      request.priceReview = { at: at.toISOString(), note: "Price changed from " + previous.price + " to " + money(price) + " after the customer committed." };
      request.commitment = undefined;
    }
    return { request, action: "offer_returned", detail: "v" + request.offers.length + " · price " + money(price) + " · ETA " + option.etaMinutes + " min" };
  });
}

export function commitToOffer(actor: string, id: string, terms: PaymentTerms, amountPaid: number) {
  return change(actor, (all) => {
    const request = open(all, id); const offer = activeOffer(request);
    if (!offer) throw new Error("There is no customer offer to commit to.");
    if (Date.parse(offer.validUntil) < Date.now()) throw new Error("This offer has expired. Ask Procurement to refresh it.");
    if (terms === "prepaid" && money(amountPaid) < money(offer.price * request.quantity)) throw new Error("Prepaid orders need the full amount recorded.");
    if (terms === "deposit" && !(amountPaid > 0)) throw new Error("Enter the deposit received.");
    request.commitment = { at: new Date().toISOString(), by: actor, offerVersion: offer.version, terms, amountPaid: terms === "cod" ? 0 : money(amountPaid) };
    request.priceReview = undefined;
    return { request, action: "customer_committed", detail: "offer v" + offer.version + " · " + terms + " · paid " + request.commitment.amountPaid };
  });
}

export function createPurchase(actor: string, id: string, path: SourcingPath, supplier: string, reference: string, serial: string) {
  return change(actor, (all) => {
    const request = open(all, id); const offer = activeOffer(request);
    if (!request.commitment || !offer) throw new Error("The customer must commit before a purchase is made.");
    const option = request.options.find((entry) => entry.id === offer.optionId)!;
    if (!reference.trim()) throw new Error("Enter the purchase order or supplier reference.");
    request.path = path;
    request.purchase = { supplier: supplier.trim() || option.supplier, unitCost: option.cost, reference: reference.trim(), at: new Date().toISOString(), by: actor, serial: serial.trim() || undefined };
    request.failure = undefined;
    return { request, action: "purchase_created", detail: path + " · " + request.purchase.supplier + " · ref " + request.purchase.reference };
  });
}

// Inventory only: this is what makes the item physically Cybervilla's (INV-01 / INV-05).
export function receiveIntoStore(actor: string, id: string, serial: string, note: string, serialised: boolean) {
  return change(actor, (all) => {
    const request = open(all, id);
    if (request.path !== "store" || !request.purchase) throw new Error("Only store-bound purchases are received into the shop.");
    if (request.receipt) throw new Error("This item is already received.");
    if (serialised && !serial.trim() && !request.purchase.serial) throw new Error("Capture the serial or IMEI at receipt.");
    if (request.purchase.serial && serial.trim() && request.purchase.serial !== serial.trim()) throw new Error("Serial does not match the one captured at pickup. Raise a delivery discrepancy.");
    request.receipt = { at: new Date().toISOString(), by: actor, serial: serial.trim() || request.purchase.serial, note: note.trim() || undefined };
    return { request, action: "received", detail: "serial " + (request.receipt.serial ?? "n/a") };
  });
}

export function recordDelivery(actor: string, id: string, recipient: string, reference: string, packagingConfirmed: boolean, policy: OpsPolicy) {
  return change(actor, (all) => {
    const request = open(all, id);
    if (!request.purchase) throw new Error("Create the purchase first.");
    if (request.path === "store" && !request.receipt) throw new Error("Inventory must receive the item before it is handed to the customer.");
    if (request.delivery) throw new Error("Delivery is already recorded.");
    if (!recipient.trim()) throw new Error("Enter who received the item (proof of delivery).");
    if (request.path === "direct" && policy.directPackaging === "required" && !packagingConfirmed) throw new Error("Confirm the required direct-sale packaging first.");
    request.delivery = { at: new Date().toISOString(), by: actor, recipient: recipient.trim(), reference: reference.trim() || undefined, packagingConfirmed };
    return { request, action: "delivered", detail: "to " + recipient.trim() };
  });
}

export function recordRemittance(actor: string, id: string) {
  return change(actor, (all) => {
    const request = open(all, id);
    if (request.commitment?.terms !== "cod" || !request.delivery) throw new Error("There is no delivered COD balance to settle.");
    request.remittedAt = new Date().toISOString(); request.remittedBy = actor;
    return { request, action: "cod_remitted", detail: "COD balance settled" };
  });
}

// PRO-17: supplier failure keeps the request open with an owner and the customer's payment exposure visible.
export function reportSupplierFailure(actor: string, id: string, note: string) {
  if (!note.trim()) return Promise.reject(new Error("Describe what went wrong."));
  return change(actor, (all) => {
    const request = open(all, id);
    request.failure = { at: new Date().toISOString(), by: actor, note: note.trim() };
    request.procurementOwner ??= actor;
    return { request, action: "supplier_failed", detail: note.trim() };
  });
}

export function closeSourcing(actor: string, id: string, outcome: "fulfilled" | "lost" | "cancelled", reason: string) {
  return change(actor, (all) => {
    const request = open(all, id);
    if (outcome === "fulfilled") {
      if (!request.delivery) throw new Error("Record delivery or handover before closing as fulfilled.");
      if (request.commitment?.terms === "cod" && !request.remittedAt) throw new Error("COD is still outstanding. Record the remittance before closing.");
    } else if (!reason.trim()) throw new Error("Select the reason.");
    request.closed = { at: new Date().toISOString(), by: actor, outcome, reason: reason.trim() || undefined };
    return { request, action: "closed_" + outcome, detail: reason.trim() || "fulfilled" };
  });
}

export function sourcingStatus(request: SourcingRequest) {
  const offer = activeOffer(request);
  const row = (label: string, owner: string, waitingOn: string, next: string) => ({ label, owner, waitingOn, next });
  if (request.closed) return row({ fulfilled: "Fulfilled", lost: "Lost", cancelled: "Cancelled" }[request.closed.outcome], request.owner, "Nothing", "None");
  const procurement = request.procurementOwner ?? "Procurement";
  if (request.failure) return row("Supplier failed", procurement, "Alternative or refund decision", "Source another supplier or start a refund");
  if (!request.options.length) return row("Awaiting Procurement", procurement, "Supplier response", "Compare approved suppliers");
  if (!offer) return row("Awaiting Procurement", procurement, "Customer price", "Return price and ETA to Sales");
  if (request.priceReview) return row("Price change: review", request.owner, "Customer re-confirmation", "Explain the new price and re-confirm");
  if (!request.commitment) return row("Awaiting Customer", request.owner, "Customer commitment", "Get the customer's decision");
  if (!request.purchase) return row("Awaiting Purchase", procurement, "Purchase order", "Buy from the chosen supplier");
  if (request.path === "store" && !request.receipt) return row("In transit to store", "Logistics", "Physical receipt", "Collect from supplier and hand to Inventory");
  if (request.path === "direct" && !request.delivery) return row("Direct delivery", "Logistics", "Proof of delivery", "Deliver to the customer");
  if (!request.delivery) return row("Received, awaiting handover", request.owner, "Customer handover", "Hand over to the customer");
  if (request.commitment.terms === "cod" && !request.remittedAt) return row("Delivered / Payment outstanding", "Finance", "COD remittance", "Record remittance and reconcile");
  return row("Ready to close", request.owner, "Close-out", "Close as fulfilled");
}

export function sourcingTiming(request: SourcingRequest, policy: OpsPolicy, now = Date.now()) {
  const end = request.closed ? Date.parse(request.closed.at) : now;
  const elapsedMinutes = Math.max(0, Math.round((end - Date.parse(request.createdAt)) / 60000));
  const target = policy.sourcingTargetMinutes;
  const state: "done" | "on_track" | "approaching" | "breached" = request.closed ? "done" : elapsedMinutes > target ? "breached" : elapsedMinutes >= target * 0.75 ? "approaching" : "on_track";
  return { elapsedMinutes, target, state };
}
export function formatMinutes(minutes: number) {
  if (minutes < 60) return minutes + " min";
  if (minutes < 1440) return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
  return Math.floor(minutes / 1440) + "d " + Math.floor((minutes % 1440) / 60) + "h";
}
export function directMargin(request: SourcingRequest) {
  const offer = activeOffer(request);
  return request.purchase && offer ? money((offer.price - request.purchase.unitCost) * request.quantity) : undefined;
}

// Sales and Technicians must not see supplier identities or cost comparisons (permissions section of the handoff).
export function redactSupplierDetail(request: SourcingRequest): SourcingRequest {
  const hidden = new Set(["option_recorded", "purchase_created", "supplier_failed"]);
  return { ...request, options: [], history: request.history.map((event) => hidden.has(event.action) ? { ...event, detail: "Recorded by Procurement" } : event), failure: request.failure ? { ...request.failure, note: "Supplier issue. Procurement is resolving it." } : undefined,
    purchase: request.purchase ? { ...request.purchase, supplier: "Approved supplier", unitCost: 0 } : undefined };
}
