import { deviceIdentifiers } from "@/pos/lib/devices";
import { appendAuditUnlocked, getRefunds, getSales, readFromStorage, withSaleLock, writeToStorage, type Sale } from "@/pos/lib/store";

// RET-01..05 / INV-11 / REF-01..03 / WAR-01. A physical return enters Returns Inspection and never goes
// straight back to sellable stock; disposition is a recorded decision, and a refund case only closes once paid.
export type ReturnType = "return" | "warranty" | "wrong_item" | "damaged_delivery";
export type Disposition = "restock" | "quarantine" | "repair" | "supplier_return" | "refund" | "reject";
export type ReturnCondition = "like_new" | "used" | "damaged" | "faulty";
export const RETURN_TYPE_LABELS: Record<ReturnType, string> = { return: "Customer return", warranty: "Warranty claim", wrong_item: "Wrong item / variant", damaged_delivery: "Damaged on delivery" };
export const DISPOSITION_LABELS: Record<Disposition, string> = { restock: "Restock", quarantine: "Quarantine", repair: "Send to repair", supplier_return: "Return to supplier", refund: "Refund customer", reject: "Decline with reason" };
export const CONDITION_LABELS: Record<ReturnCondition, string> = { like_new: "Like new", used: "Used", damaged: "Damaged", faulty: "Faulty" };

export interface ReturnCase {
  id: string; number: string; type: ReturnType; saleId: string; saleNumber: string; customerName: string; customerPhone: string;
  item: string; serial?: string; reason: string; owner: string; createdAt: string;
  receipt?: { at: string; by: string; condition: ReturnCondition; serial?: string; evidence: string };
  classification?: { at: string; by: string; result: "covered" | "not_covered"; note: string };
  disposition?: { at: string; by: string; kind: Disposition; note: string };
  closed?: { at: string; by: string; note: string };
  history: { at: string; by: string; action: string; detail: string }[];
}
const KEY = "returns_v1";

export async function getReturns(): Promise<ReturnCase[]> {
  const raw = await readFromStorage<ReturnCase[]>(KEY);
  return Array.isArray(raw) ? raw : [];
}
async function change<T>(actor: string, mutate: (all: ReturnCase[]) => { item: ReturnCase; action: string; detail: string; result?: T }) {
  if (!actor.trim()) throw new Error("Sign in to record this action.");
  return withSaleLock(async () => {
    const all = await getReturns(); const { item, action, detail, result } = mutate(all);
    item.history.push({ at: new Date().toISOString(), by: actor, action, detail });
    await writeToStorage(KEY, all);
    await appendAuditUnlocked(actor, "return_" + action, item.number + " · " + detail);
    return result as T;
  });
}
function openCase(all: ReturnCase[], id: string) {
  const item = all.find((entry) => entry.id === id);
  if (!item) throw new Error("Return case not found.");
  if (item.closed) throw new Error("This case is already closed.");
  return item;
}

export function returnableSales(sales: Sale[]) {
  return sales.filter((sale) => !sale.isDemo && (!sale.lifecycle || sale.lifecycle === "completed"));
}
export function createReturn(actor: string, sale: Sale | undefined, input: { type: ReturnType; item: string; serial: string; reason: string }) {
  if (!sale || sale.isDemo) return Promise.reject(new Error("Link the original sale before a return is logged."));
  if (!input.item.trim() || !input.reason.trim()) return Promise.reject(new Error("Enter the item and the reason."));
  const serial = input.serial.trim();
  const known = sale.lines.flatMap((line) => line.devices ?? []).flatMap(deviceIdentifiers);
  if (serial && known.length && !known.includes(serial)) return Promise.reject(new Error("That serial or IMEI is not on the original sale."));
  return change<ReturnCase>(actor, (all) => {
    const item: ReturnCase = { id: crypto.randomUUID(), number: "RTN-" + String(all.length + 1).padStart(4, "0"), type: input.type, saleId: sale.id, saleNumber: sale.saleNumber,
      customerName: sale.customer?.name ?? "Walk-in customer", customerPhone: sale.customer?.phone ?? "", item: input.item.trim(), serial: serial || undefined, reason: input.reason.trim(),
      owner: actor, createdAt: new Date().toISOString(), history: [] };
    all.push(item);
    return { item, action: "requested", detail: RETURN_TYPE_LABELS[input.type] + " · " + sale.saleNumber + " · " + input.reason.trim(), result: item };
  });
}

// Inventory: the item enters Returns Inspection. It is not available stock.
export function receiveReturn(actor: string, id: string, condition: ReturnCondition, serial: string, evidence: string) {
  if (!evidence.trim()) return Promise.reject(new Error("Describe the condition and what was received."));
  return change(actor, (all) => {
    const item = openCase(all, id);
    if (item.receipt) throw new Error("This item is already in inspection.");
    if (item.serial && serial.trim() && item.serial !== serial.trim()) throw new Error("The received serial does not match the one on the case.");
    item.receipt = { at: new Date().toISOString(), by: actor, condition, serial: serial.trim() || item.serial, evidence: evidence.trim() };
    return { item, action: "received_for_inspection", detail: CONDITION_LABELS[condition] + " · serial " + (item.receipt.serial ?? "n/a") };
  });
}

// Warranty eligibility is a technical judgement, never a front-desk guess.
export function classifyWarranty(actor: string, id: string, actorIsAdmin: boolean, result: "covered" | "not_covered", note: string) {
  if (!actorIsAdmin) return Promise.reject(new Error("Warranty classification needs a technical or management decision."));
  if (!note.trim()) return Promise.reject(new Error("Record the assessment behind the decision."));
  return change(actor, (all) => {
    const item = openCase(all, id);
    if (item.type !== "warranty") throw new Error("Only warranty claims are classified.");
    if (!item.receipt) throw new Error("Receive the item into inspection before assessing it.");
    item.classification = { at: new Date().toISOString(), by: actor, result, note: note.trim() };
    return { item, action: "warranty_classified", detail: result + " · " + note.trim() };
  });
}

export function recordDisposition(actor: string, id: string, kind: Disposition, note: string) {
  if (!note.trim()) return Promise.reject(new Error("Record the evidence or reason for this outcome."));
  return change(actor, (all) => {
    const item = openCase(all, id);
    if (item.disposition) throw new Error("A disposition is already recorded.");
    if (kind !== "reject" && !item.receipt) throw new Error("The item must be received into inspection before this outcome.");
    if (item.type === "warranty" && !item.classification) throw new Error("Classify the warranty claim before choosing an outcome.");
    if (item.type === "warranty" && item.classification?.result === "not_covered" && kind !== "reject" && kind !== "refund") throw new Error("This claim is not covered. Decline it or agree a paid alternative.");
    if (kind === "restock" && ["damaged", "faulty"].includes(item.receipt!.condition)) throw new Error("Damaged or faulty items cannot be restocked. Quarantine, repair or return to supplier.");
    item.disposition = { at: new Date().toISOString(), by: actor, kind, note: note.trim() };
    return { item, action: "disposition_" + kind, detail: DISPOSITION_LABELS[kind] + " · " + note.trim() };
  });
}

export async function refundPaidFor(item: ReturnCase) {
  const refunds = await getRefunds();
  return refunds.some((refund) => refund.saleId === item.saleId && refund.status === "paid" && Date.parse(refund.createdAt) >= Date.parse(item.createdAt));
}
export function closeReturn(actor: string, id: string, note: string) {
  return withSaleLock(async () => {
    const all = await getReturns(); const item = openCase(all, id);
    if (!item.disposition) throw new Error("Record the disposition before closing.");
    if (item.disposition.kind === "refund" && !(await refundPaidFor(item))) throw new Error("The refund has not been paid yet. Complete it from the sale record first.");
    item.closed = { at: new Date().toISOString(), by: actor, note: note.trim() || "Resolved" };
    item.history.push({ at: item.closed.at, by: actor, action: "closed", detail: item.closed.note });
    await writeToStorage(KEY, all);
    await appendAuditUnlocked(actor, "return_closed", item.number + " · " + item.closed.note);
  });
}

export function returnStatus(item: ReturnCase) {
  const row = (label: string, owner: string, waitingOn: string, next: string) => ({ label, owner, waitingOn, next });
  if (item.closed) return row("Closed", item.owner, "Nothing", "None");
  if (item.type === "warranty" && item.receipt && !item.classification) return row("Awaiting assessment", "Technical", "Warranty assessment", "Assess and classify the claim");
  if (!item.receipt && item.disposition?.kind !== "reject") return row("Awaiting item", item.owner, "Physical return", "Receive the item into inspection");
  if (!item.disposition) return row("In inspection", "Inventory", "Disposition decision", "Choose the outcome");
  if (item.disposition.kind === "refund") return row("Awaiting refund", "Finance", "Refund payout", "Pay the refund, then close the case");
  return row("Ready to close", item.owner, "Customer update", "Tell the customer and close the case");
}
