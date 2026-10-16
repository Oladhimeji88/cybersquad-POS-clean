// @ts-ignore -- plain JS prototype ledger
import { postPayable } from "@/lib/finance";
import { updateCodStatus } from "@/pos/lib/store";
import type { OpsPolicy } from "./policy";
import { isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// LOG-01..22. A job records physical movement and custody. Delivery completes the shipment, never the money:
// COD stays outstanding until remitted, and a supplier pickup never makes store stock.
export type JobType = "delivery" | "supplier_pickup" | "supplier_to_store" | "direct_to_customer" | "customer_return" | "supplier_return";
export type JobStatus = "requested" | "assigned" | "picked_up" | "in_transit" | "delivered" | "failed" | "returned" | "cancelled";
export type PaymentMode = "prepaid" | "cod" | "part_cod";
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  delivery: "Cybervilla to customer", supplier_pickup: "Supplier pickup", supplier_to_store: "Supplier to store", direct_to_customer: "Supplier direct to customer",
  customer_return: "Customer return pickup", supplier_return: "Return to supplier",
};
const CUSTOMER_FACING: JobType[] = ["delivery", "direct_to_customer", "customer_return"];
const NEEDS_CODE: JobType[] = ["supplier_pickup", "supplier_to_store", "direct_to_customer"];
export const FAILURE_REASONS = ["Customer unreachable", "Wrong or incomplete address", "Customer refused", "Customer not available", "Payment not ready", "Item damaged in transit"] as const;
export const RETURN_OUTCOMES = { reserved: "Hold reserved for the customer", available: "Back to available stock", damaged: "Damaged: quarantine", returned_to_supplier: "Return to supplier" } as const;

export interface LogisticsJob extends Tracked {
  number: string; type: JobType; source: { kind: "sale" | "sourcing" | "return" | "po" | "supplier_return" | "manual"; ref?: string; label: string };
  customerName?: string; contact?: string; address: string; item: string; serial?: string;
  partner: string; custodian: string; owner: string; createdAt: string; etaAt?: string; status: JobStatus;
  pickupCode?: string; codeAccess: { at: string; by: string; purpose: "viewed" | "used" | "rejected" }[];
  custody: { at: string; by: string; from: string; to: string; note: string }[];
  payment: { mode: PaymentMode; orderValue: number; prepaid: number; codBalance: number };
  fee?: { payer: "customer" | "business"; charged: number; cost: number; billedRef?: string };
  pod?: { at: string; by: string; recipient: string; evidence: string; collected: number };
  failures: { at: string; by: string; reason: string; nextStep: "retry" | "return" }[];
  returnOutcome?: { at: string; by: string; outcome: keyof typeof RETURN_OUTCOMES };
  financeVia: "job" | "sale";
  remittance?: { at: string; by: string; reference: string; received: number; expected: number; shortNote?: string };
}

export const jobStore = recordStore<LogisticsJob>("logistics_jobs_v1", "logistics", (item) => item.number);

export interface JobInput {
  type: JobType; source: LogisticsJob["source"]; customerName?: string; contact?: string; address: string; item: string; serial?: string;
  partner: string; etaAt?: string; pickupCode?: string; payment: { mode: PaymentMode; orderValue: number; prepaid: number }; fee?: { payer: "customer" | "business"; charged: number; cost: number };
  codViaSale?: boolean;
}
export function createJob(actor: string, input: JobInput) {
  if (!input.item.trim()) return reject("Enter the item to move.");
  if (CUSTOMER_FACING.includes(input.type) && (!input.address.trim() || !input.customerName?.trim() || !input.contact?.trim())) return reject("Customer deliveries need the customer, contact and address.");
  if (!input.partner.trim()) return reject("Choose who will carry it.");
  if (input.etaAt && !Number.isFinite(Date.parse(input.etaAt))) return reject("Enter a valid ETA.");
  const { mode, orderValue, prepaid } = input.payment;
  if (!(orderValue >= 0) || !(prepaid >= 0)) return reject("Amounts cannot be negative.");
  if (mode === "prepaid" && orderValue > 0 && money(prepaid) < money(orderValue)) return reject("Prepaid means the full amount is already verified.");
  if (mode === "cod" && prepaid > 0) return reject("Full COD has no prepayment. Use part payment + COD for a deposit.");
  if (mode === "part_cod" && (!(prepaid > 0) || prepaid >= orderValue)) return reject("Part payment must be more than zero and less than the order value.");
  return jobStore.change<LogisticsJob>(actor, (list) => {
    const codBalance = mode === "prepaid" ? 0 : money(orderValue - prepaid);
    const item: LogisticsJob = { id: crypto.randomUUID(), number: "JOB-" + String(list.length + 1).padStart(4, "0"), type: input.type, source: input.source,
      customerName: input.customerName?.trim(), contact: input.contact?.trim(), address: input.address.trim(), item: input.item.trim(), serial: input.serial?.trim() || undefined,
      partner: input.partner.trim(), custodian: "Cybervilla", owner: actor, createdAt: isoNow(), etaAt: input.etaAt, status: "requested", pickupCode: input.pickupCode?.trim() || undefined, codeAccess: [],
      custody: [], payment: { mode, orderValue: money(orderValue), prepaid: money(prepaid), codBalance }, fee: input.fee, failures: [],
      financeVia: input.codViaSale && codBalance > 0 ? "sale" : "job", history: [] };
    list.push(item); return { item, action: "requested", detail: JOB_TYPE_LABELS[input.type] + " · " + item.item + " · " + mode.replace("_", " "), result: item };
  });
}
const open = (item: LogisticsJob) => { if (["delivered", "returned", "cancelled"].includes(item.status)) throw new Error("This job is already finished."); };
const handover = (item: LogisticsJob, actor: string, to: string, note: string) => { item.custody.push({ at: isoNow(), by: actor, from: item.custodian, to, note }); item.custodian = to; };

export function assignJob(actor: string, id: string, partner: string, etaAt?: string) {
  if (!partner.trim()) return reject("Choose the partner or rider.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item); item.partner = partner.trim(); if (etaAt && Number.isFinite(Date.parse(etaAt))) item.etaAt = etaAt;
    if (item.status === "requested" || item.status === "failed") item.status = "assigned";
    return { item, action: "assigned", detail: item.partner + (item.etaAt ? " · ETA " + new Date(item.etaAt).toLocaleString() : "") };
  });
}
// The pickup code is shown only to authorised users and every view and use is logged (PRO-08 / LOG-03).
export async function revealPickupCode(actor: string, id: string) {
  return jobStore.change<string>(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); if (!item.pickupCode) throw new Error("This job has no pickup code.");
    item.codeAccess.push({ at: isoNow(), by: actor, purpose: "viewed" });
    return { item, action: "code_viewed", detail: "pickup code viewed", result: item.pickupCode };
  });
}
export async function pickUp(actor: string, id: string, enteredCode: string, serial: string) {
  // A wrong code is a security event: record the attempt first, then refuse.
  const current = (await jobStore.all()).find((entry) => entry.id === id);
  if (current?.pickupCode && enteredCode.trim() !== current.pickupCode) {
    await jobStore.change(actor, (list) => {
      const item = jobStore.find(list, id, "Job"); item.codeAccess.push({ at: isoNow(), by: actor, purpose: "rejected" });
      return { item, action: "code_rejected", detail: "wrong pickup code entered" };
    });
    throw new Error("That pickup code does not match.");
  }
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item);
    if (!["requested", "assigned"].includes(item.status)) throw new Error("This item is already with the carrier.");
    if (item.pickupCode) item.codeAccess.push({ at: isoNow(), by: actor, purpose: "used" });
    if (item.serial && serial.trim() && item.serial !== serial.trim()) throw new Error("Serial does not match the order. Raise a delivery discrepancy with Procurement.");
    if (serial.trim() && !item.serial) item.serial = serial.trim();
    handover(item, actor, item.partner, "picked up"); item.status = "picked_up";
    return { item, action: "picked_up", detail: "custody to " + item.partner + (item.serial ? " · serial " + item.serial : "") };
  });
}
export function markInTransit(actor: string, id: string) {
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item); if (item.status !== "picked_up") throw new Error("Only a picked-up item can be in transit.");
    item.status = "in_transit"; return { item, action: "in_transit", detail: "with " + item.custodian };
  });
}
export function recordCustodyChange(actor: string, id: string, to: string, note: string) {
  if (!to.trim()) return reject("Enter who now has the item.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item); const from = item.custodian; handover(item, actor, to.trim(), note.trim() || "handover");
    return { item, action: "custody_changed", detail: from + " -> " + to.trim() };
  });
}
// Proof of delivery completes physical fulfilment only. Collected cash is noted; settlement is a separate step.
export function recordProofOfDelivery(actor: string, id: string, recipient: string, evidence: string, collected: number) {
  if (!recipient.trim() || !evidence.trim()) return reject("Record who received it and the evidence (photo, signature or reference).");
  return jobStore.change<{ sale?: string }>(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item);
    if (!["picked_up", "in_transit"].includes(item.status)) throw new Error("Pick the item up before delivering it.");
    if (item.payment.codBalance > 0 && !(collected >= 0)) throw new Error("Enter the cash collected.");
    item.pod = { at: isoNow(), by: actor, recipient: recipient.trim(), evidence: evidence.trim(), collected: item.payment.codBalance > 0 ? money(collected) : 0 };
    item.status = "delivered";
    handover(item, actor, item.type === "supplier_to_store" ? "Inventory (receipt pending)" : recipient.trim(), "delivered");
    const note = item.payment.codBalance > 0 && money(collected) !== item.payment.codBalance ? " · collected " + money(collected) + " vs " + item.payment.codBalance + " expected" : "";
    return { item, action: "delivered", detail: "to " + recipient.trim() + note, result: { sale: item.financeVia === "sale" && item.source.kind === "sale" ? item.source.ref : undefined } };
  });
}
// Delivering a sale's COD order moves that sale to "delivered" so the existing settlement flow picks it up without re-entry.
export async function deliverJob(actor: string, id: string, recipient: string, evidence: string, collected: number) {
  const { sale } = await recordProofOfDelivery(actor, id, recipient, evidence, collected);
  if (sale) { try { await updateCodStatus(sale, "delivered", actor); } catch { /* already moved on in the sales record */ } }
}
export function recordFailure(actor: string, id: string, reason: string, nextStep: "retry" | "return") {
  if (!reason.trim()) return reject("Select why the delivery failed.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item); if (!["picked_up", "in_transit"].includes(item.status)) throw new Error("Only an item in transit can fail delivery.");
    item.failures.push({ at: isoNow(), by: actor, reason: reason.trim(), nextStep }); item.status = "failed";
    return { item, action: "failed", detail: reason.trim() + " · next: " + nextStep + " · custody stays with " + item.custodian };
  });
}
export function retryDelivery(actor: string, id: string, etaAt: string) {
  if (!Number.isFinite(Date.parse(etaAt))) return reject("Enter the new delivery time.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); if (item.status !== "failed") throw new Error("Only a failed delivery can be retried.");
    item.status = "in_transit"; item.etaAt = etaAt; return { item, action: "retry", detail: "new ETA " + new Date(etaAt).toLocaleString() };
  });
}
// INV-12: a failed delivery comes back into controlled custody and its fate is decided, never assumed.
export function receiveFailedReturn(actor: string, id: string, outcome: keyof typeof RETURN_OUTCOMES) {
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); if (item.status !== "failed") throw new Error("Only a failed delivery is returned to the shop.");
    handover(item, actor, "Cybervilla (Returns Inspection)", "returned after failed delivery"); item.status = "returned"; item.returnOutcome = { at: isoNow(), by: actor, outcome };
    return { item, action: "returned", detail: RETURN_OUTCOMES[outcome] };
  });
}
export function cancelJob(actor: string, id: string, reason: string) {
  if (!reason.trim()) return reject("Enter the reason.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); open(item); if (["picked_up", "in_transit", "failed"].includes(item.status)) throw new Error("The item is already out. Record the outcome instead.");
    item.status = "cancelled"; return { item, action: "cancelled", detail: reason.trim() };
  });
}
export function setDeliveryFee(actor: string, id: string, payer: "customer" | "business", charged: number, cost: number) {
  if (!(charged >= 0) || !(cost >= 0)) return reject("Fees cannot be negative.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); if (item.fee?.billedRef) throw new Error("This fee is already on a partner bill.");
    item.fee = { payer, charged: money(charged), cost: money(cost) };
    return { item, action: "fee_set", detail: payer + " pays · charged " + money(charged) + " · cost " + money(cost) };
  });
}
// Finance: partner remittance for job-level COD. Short or late money stays visible until explained.
export function recordRemittance(actor: string, id: string, reference: string, received: number) {
  if (!reference.trim() || !(received >= 0)) return reject("Enter the remittance reference and the amount received.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job");
    if (item.financeVia === "sale") throw new Error("This COD belongs to a POS sale. Settle it in Finance > COD settlements.");
    if (!item.pod || item.payment.codBalance <= 0) throw new Error("There is no delivered COD balance to settle.");
    if (item.remittance) throw new Error("Remittance is already recorded.");
    item.remittance = { at: isoNow(), by: actor, reference: reference.trim(), received: money(received), expected: item.pod.collected };
    const short = money(item.pod.collected - received);
    return { item, action: short > 0 ? "remitted_short" : "remitted", detail: reference.trim() + " · received " + money(received) + " of " + item.pod.collected + (short > 0 ? " · SHORT " + short : "") };
  });
}
export function explainShortfall(actor: string, id: string, note: string) {
  if (!note.trim()) return reject("Record the explanation.");
  return jobStore.change(actor, (list) => {
    const item = jobStore.find(list, id, "Job"); if (!item.remittance || item.remittance.received >= item.remittance.expected) throw new Error("There is no shortfall to explain.");
    item.remittance.shortNote = note.trim(); return { item, action: "shortfall_explained", detail: note.trim() };
  });
}
// FIN-08: one idempotent partner bill per partner and period, built from delivered jobs' costs.
export function partnerCharges(jobs: LogisticsJob[], partner: string) {
  const billable = jobs.filter((job) => job.partner === partner && job.status === "delivered" && job.fee && job.fee.cost > 0 && !job.fee.billedRef);
  return { jobs: billable, total: money(billable.reduce((sum, job) => sum + (job.fee?.cost ?? 0), 0)) };
}
export async function postPartnerBill(actor: string, partner: string, period: string) {
  const all = await jobStore.all(); const { jobs, total } = partnerCharges(all, partner);
  if (!jobs.length) throw new Error("No unbilled deliveries for " + partner + ".");
  const reference = "LOG-" + partner.replace(/\W+/g, "").toUpperCase() + "-" + period;
  const bill = postPayable(partner, { reference, amount: total, dueInDays: 14 });
  if (!bill?.ok) throw new Error(bill?.error ?? "Could not post the partner bill. Turn on finance prototype mode or connect Odoo.");
  for (const job of jobs) await jobStore.change(actor, (list) => { const item = jobStore.find(list, job.id, "Job"); item.fee!.billedRef = reference; return { item, action: "partner_billed", detail: reference }; });
  return { reference, total, count: jobs.length };
}

export function jobState(job: LogisticsJob) {
  const row = (label: string, owner: string, waitingOn: string, next: string) => ({ label, owner, waitingOn, next });
  if (job.status === "cancelled") return row("Cancelled", job.owner, "Nothing", "None");
  if (job.status === "returned") return row("Returned to shop", "Inventory", "Disposition", "Decide the outcome in Returns Inspection");
  if (job.status === "failed") return row("Delivery failed", job.owner, "Customer contact", job.failures[job.failures.length - 1]?.nextStep === "return" ? "Bring the item back and receive it" : "Agree a new time and retry");
  if (job.status === "delivered") {
    if (job.payment.codBalance > 0 && job.financeVia === "job" && !job.remittance) return row("Delivered / Payment outstanding", "Finance", job.partner + " remittance", "Record the remittance and reconcile");
    if (job.remittance && job.remittance.received < job.remittance.expected && !job.remittance.shortNote) return row("Settlement short", "Finance", "Shortfall explanation", "Chase " + job.partner + " and record the outcome");
    if (job.payment.codBalance > 0 && job.financeVia === "sale") return row("Delivered / Payment outstanding", "Finance", "COD settlement", "Settle in Finance > COD settlements");
    if (job.type === "supplier_to_store") return row("Arrived at store", "Inventory", "Physical receipt", "Receive it before it counts as stock");
    return row("Completed", job.owner, "Nothing", "None");
  }
  if (job.status === "requested") return row("Awaiting pickup", "Logistics", "Carrier assignment", "Assign a partner and collect");
  if (job.status === "assigned") return row("Assigned", "Logistics", "Pickup", NEEDS_CODE.includes(job.type) ? "Collect using the pickup code" : "Collect and dispatch");
  if (job.status === "picked_up") return row("Picked up", "Logistics", "Dispatch", "Mark in transit");
  return row("In transit", "Logistics", "Proof of delivery", "Deliver and capture proof");
}
export const jobIsClosed = (job: LogisticsJob) => jobState(job).label === "Completed" || job.status === "cancelled";

export function logisticsWorkItems(jobs: LogisticsJob[], policy: OpsPolicy, now: number): WorkItem[] {
  const items: WorkItem[] = [];
  for (const job of jobs.filter((entry) => !jobIsClosed(entry))) {
    const state = jobState(job); const since = job.createdAt; const inFlight = ["assigned", "picked_up", "in_transit"].includes(job.status);
    const lastCustody = job.custody[job.custody.length - 1]?.at ?? job.createdAt;
    const target = job.type === "supplier_to_store" ? policy.supplierToStoreMinutes : 0; const late = target > 0 && job.status !== "delivered" && (now - Date.parse(since)) / 60000 > target;
    const ambiguous = inFlight && (!job.custodian.trim() || now - Date.parse(lastCustody) > 24 * 3600000);
    const codAged = job.status === "delivered" && job.pod && job.payment.codBalance > 0 && !job.remittance && job.financeVia === "job" && now - Date.parse(job.pod.at) > policy.codAgedDays * 86400000;
    const reason = job.status === "failed" ? "Failed delivery" : ambiguous ? "Custody unclear" : codAged ? "COD not remitted" : state.label === "Settlement short" ? "Short settlement" : late ? "Past " + target + " min target" : job.etaAt && inFlight && Date.parse(job.etaAt) < now ? "Past ETA" : undefined;
    items.push({ id: "job:" + job.id, code: job.type === "supplier_to_store" ? "LOG-05" : job.type === "direct_to_customer" ? "LOG-07" : job.type === "customer_return" ? "LOG-19" : job.type === "supplier_return" ? "LOG-20" : "LOG-06",
      workflow: JOB_TYPE_LABELS[job.type], title: job.number + " · " + job.item + (job.customerName ? " · " + job.customerName : ""), state: state.label, owner: state.owner, waitingOn: state.waitingOn, nextAction: state.next,
      since, dueAt: job.etaAt, exception: Boolean(reason), reason, tab: "logistics", ref: job.id });
  }
  return items;
}

// LOG-22: pickup and delivery turnaround, failure rate, COD exposure and partner performance from the jobs themselves.
export function logisticsPerformance(jobs: LogisticsJob[], from: number, to: number, now = Date.now()) {
  const inRange = jobs.filter((job) => Date.parse(job.createdAt) >= from && Date.parse(job.createdAt) <= to);
  const partners = [...new Set(inRange.map((job) => job.partner))].map((partner) => {
    const mine = inRange.filter((job) => job.partner === partner); const delivered = mine.filter((job) => job.pod);
    const minutes = delivered.map((job) => (Date.parse(job.pod!.at) - Date.parse(job.createdAt)) / 60000);
    const attempts = mine.filter((job) => job.failures.length || job.pod).length;
    return { partner, jobs: mine.length, delivered: delivered.length, failedAttempts: mine.reduce((sum, job) => sum + job.failures.length, 0),
      failureRate: attempts ? Math.round(mine.filter((job) => job.failures.length).length / attempts * 100) : 0, averageMinutes: minutes.length ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : 0 };
  });
  const outstanding = jobs.filter((job) => job.pod && job.payment.codBalance > 0 && !job.remittance && job.financeVia === "job");
  return { partners, codOutstandingValue: money(outstanding.reduce((sum, job) => sum + (job.pod?.collected ?? 0), 0)), codOldestDays: outstanding.length ? Math.floor((now - Math.min(...outstanding.map((job) => Date.parse(job.pod!.at)))) / 86400000) : 0,
    failedDeliveries: inRange.filter((job) => job.failures.length).length, custodyExceptions: jobs.filter((job) => ["assigned", "picked_up", "in_transit"].includes(job.status) && now - Date.parse(job.custody[job.custody.length - 1]?.at ?? job.createdAt) > 24 * 3600000).length,
    directFulfilment: inRange.filter((job) => job.type === "direct_to_customer").length };
}
