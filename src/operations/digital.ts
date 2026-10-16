import { createSourcing } from "./sourcing";
import type { OpsPolicy } from "./policy";
import { hoursFrom, isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// DIG-02..12, SAL-10/11/15. Website, Instagram, WhatsApp and phone orders use the same order object as the shop.
// Order intent is not payment: nothing is allocated, sourced or sent until payment is verified, and a cancellation
// is not a refund until the money has actually gone back.
export type Channel = "website" | "instagram" | "whatsapp" | "phone";
export const CHANNEL_LABELS: Record<Channel, string> = { website: "Website", instagram: "Instagram", whatsapp: "WhatsApp", phone: "Phone" };
export interface WebItem { product: string; qty: number; unitPrice: number; }
export interface Notice { at: string; event: string; text: string; sentAt?: string; sentBy?: string; }
export interface WebOrder extends Tracked {
  number: string; channel: Channel; customerName: string; customerPhone: string; customerEmail?: string; items: WebItem[]; total: number; owner: string; createdAt: string;
  payment: "pending" | "failed" | "verified"; paymentRef?: string; fulfilment: "new" | "allocated" | "sourcing" | "dispatched" | "fulfilled" | "cancelled"; allocationRef?: string; sourcingId?: string;
  amendments: { at: string; by: string; reason: string; before: WebItem[]; after: WebItem[]; beforeTotal: number; afterTotal: number }[];
  cancellation?: { at: string; by: string; reason: string; refund: "none" | "pending" | "paid"; refundRef?: string; refundAmount: number };
  notices: Notice[];
}
export interface AbandonedInterest extends Tracked {
  number: string; customerName: string; contact: string; product: string; channel: Channel; value: number; owner: string; createdAt: string; followUpDueAt: string;
  outcome?: { at: string; by: string; result: "converted" | "not_interested" | "no_response"; note: string };
}
export const webOrderStore = recordStore<WebOrder>("web_orders_v1", "web_order", (item) => item.number);
export const abandonedStore = recordStore<AbandonedInterest>("abandoned_interest_v1", "abandoned", (item) => item.number);
export const itemsTotal = (items: WebItem[]) => money(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
const validItems = (items: WebItem[]) => items.length > 0 && items.every((item) => item.product.trim() && Number.isInteger(item.qty) && item.qty > 0 && item.unitPrice > 0);

// DIG-12: customer messages come from the event that happened, ready to send, rather than being retyped.
const TEMPLATES: Record<string, (order: WebOrder) => string> = {
  received: (order) => "Hi " + order.customerName + ", we have received your order " + order.number + " (" + order.total + "). We will confirm once payment is verified.",
  paid: (order) => "Hi " + order.customerName + ", payment for " + order.number + " is confirmed. We are getting your order ready.",
  payment_failed: (order) => "Hi " + order.customerName + ", we could not confirm payment for " + order.number + ". Please try again or contact us.",
  allocated: (order) => "Hi " + order.customerName + ", your items for " + order.number + " are set aside and ready for dispatch or collection.",
  sourcing: (order) => "Hi " + order.customerName + ", we are sourcing the items for " + order.number + ". We will update you with the price and time shortly.",
  dispatched: (order) => "Hi " + order.customerName + ", " + order.number + " is on its way.",
  fulfilled: (order) => "Hi " + order.customerName + ", " + order.number + " is complete. Thank you for shopping with Cybervilla.",
  cancelled: (order) => "Hi " + order.customerName + ", " + order.number + " has been cancelled." + (order.cancellation?.refund === "pending" ? " Your refund is being processed." : ""),
  refunded: (order) => "Hi " + order.customerName + ", your refund for " + order.number + " has been paid.",
};
function notify(order: WebOrder, event: keyof typeof TEMPLATES) { order.notices.push({ at: isoNow(), event, text: TEMPLATES[event](order) }); }
export const whatsappLink = (phone: string, text: string) => "https://wa.me/" + phone.replace(/\D/g, "").replace(/^0/, "234") + "?text=" + encodeURIComponent(text);

export function createWebOrder(actor: string, input: { channel: Channel; customerName: string; customerPhone: string; customerEmail?: string; items: WebItem[] }) {
  if (!input.customerName.trim() || !input.customerPhone.trim()) return reject("Enter the customer name and phone.");
  if (!validItems(input.items)) return reject("Each item needs a product, whole quantity and price.");
  return webOrderStore.change<WebOrder>(actor, (list) => {
    const item: WebOrder = { id: crypto.randomUUID(), number: "WEB-" + String(list.length + 1).padStart(4, "0"), channel: input.channel, customerName: input.customerName.trim(), customerPhone: input.customerPhone.trim(),
      customerEmail: input.customerEmail?.trim() || undefined, items: input.items.map((entry) => ({ ...entry, product: entry.product.trim() })), total: itemsTotal(input.items), owner: actor, createdAt: isoNow(),
      payment: "pending", fulfilment: "new", amendments: [], notices: [], history: [] };
    notify(item, "received"); list.push(item);
    return { item, action: "created", detail: CHANNEL_LABELS[input.channel] + " · " + item.items.length + " item(s) · " + item.total, result: item };
  });
}
export function recordOnlinePayment(actor: string, id: string, result: "verified" | "failed", reference: string) {
  if (result === "verified" && !reference.trim()) return reject("Enter the payment reference you verified.");
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); if (item.fulfilment === "cancelled") throw new Error("This order is cancelled.");
    if (item.payment === "verified") throw new Error("Payment is already verified.");
    item.payment = result; item.paymentRef = reference.trim() || item.paymentRef; notify(item, result === "verified" ? "paid" : "payment_failed");
    return { item, action: "payment_" + result, detail: reference.trim() || result };
  });
}
const needPaid = (item: WebOrder) => { if (item.payment !== "verified") throw new Error("Payment is not verified yet. Nothing can be fulfilled until it is."); if (item.fulfilment === "cancelled") throw new Error("This order is cancelled."); };
export function allocateStock(actor: string, id: string, reference: string) {
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); needPaid(item); if (item.fulfilment !== "new") throw new Error("This order has already moved on.");
    item.fulfilment = "allocated"; item.allocationRef = reference.trim() || undefined; notify(item, "allocated");
    return { item, action: "allocated", detail: reference.trim() ? "reservation " + reference.trim() : "stock set aside" };
  });
}
// DIG-04: no physical stock hands the same order to sourcing, with an owner and the customer still informed.
export async function sendOrderToSourcing(actor: string, id: string) {
  const order = (await webOrderStore.all()).find((entry) => entry.id === id);
  if (!order) throw new Error("Order not found.");
  if (order.payment !== "verified") throw new Error("Payment is not verified yet. Nothing can be sourced until it is.");
  if (order.fulfilment !== "new") throw new Error("This order has already moved on.");
  const request = await createSourcing(actor, { customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail }, product: order.items.map((entry) => entry.product).join(", "),
    specification: "From " + order.number + " (" + CHANNEL_LABELS[order.channel] + ")", quantity: order.items.reduce((sum, entry) => sum + entry.qty, 0), urgent: false });
  await webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); item.fulfilment = "sourcing"; item.sourcingId = request.id; notify(item, "sourcing");
    return { item, action: "sent_to_sourcing", detail: request.number };
  });
  return request;
}
export function markDispatched(actor: string, id: string) {
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); needPaid(item); if (!["allocated", "sourcing"].includes(item.fulfilment)) throw new Error("Allocate stock or complete sourcing first.");
    item.fulfilment = "dispatched"; notify(item, "dispatched"); return { item, action: "dispatched", detail: "on its way" };
  });
}
export function markFulfilled(actor: string, id: string) {
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); needPaid(item); if (!["allocated", "dispatched", "sourcing"].includes(item.fulfilment)) throw new Error("This order has not been allocated or dispatched.");
    item.fulfilment = "fulfilled"; notify(item, "fulfilled"); return { item, action: "fulfilled", detail: "handover evidenced" };
  });
}
// DIG-10: an amendment keeps what the order said before, with who changed it and why.
export function amendOrder(actor: string, id: string, items: WebItem[], reason: string) {
  if (!reason.trim()) return reject("Record why the order is changing.");
  if (!validItems(items)) return reject("Each item needs a product, whole quantity and price.");
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); if (["dispatched", "fulfilled", "cancelled"].includes(item.fulfilment)) throw new Error("This order can no longer be amended.");
    const beforeTotal = item.total; const afterTotal = itemsTotal(items);
    item.amendments.push({ at: isoNow(), by: actor, reason: reason.trim(), before: item.items, after: items.map((entry) => ({ ...entry })), beforeTotal, afterTotal });
    item.items = items.map((entry) => ({ ...entry, product: entry.product.trim() })); item.total = afterTotal;
    const diff = money(afterTotal - beforeTotal);
    return { item, action: "amended", detail: reason.trim() + " · " + beforeTotal + " -> " + afterTotal + (item.payment === "verified" && diff !== 0 ? (diff > 0 ? " · collect " + diff + " more" : " · refund " + -diff) : "") };
  });
}
// DIG-11 / SAL-15: cancelling an order ends it; the refund is its own step and stays open until paid.
export function cancelOrder(actor: string, id: string, reason: string) {
  if (!reason.trim()) return reject("Record why the order is cancelled.");
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); if (item.fulfilment === "cancelled") throw new Error("Already cancelled.");
    if (["dispatched", "fulfilled"].includes(item.fulfilment)) throw new Error("This order has already left. Use a return instead.");
    const refund = item.payment === "verified";
    item.fulfilment = "cancelled"; item.cancellation = { at: isoNow(), by: actor, reason: reason.trim(), refund: refund ? "pending" : "none", refundAmount: refund ? item.total : 0 }; notify(item, "cancelled");
    return { item, action: "cancelled", detail: reason.trim() + (refund ? " · refund of " + item.total + " outstanding" : "") };
  });
}
export function completeOrderRefund(actor: string, id: string, reference: string) {
  if (!reference.trim()) return reject("Enter the payout reference.");
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); if (item.cancellation?.refund !== "pending") throw new Error("There is no refund waiting to be paid.");
    item.cancellation.refund = "paid"; item.cancellation.refundRef = reference.trim(); notify(item, "refunded");
    return { item, action: "refund_paid", detail: reference.trim() + " · " + item.cancellation.refundAmount };
  });
}
export function markNoticeSent(actor: string, id: string, index: number) {
  return webOrderStore.change(actor, (list) => {
    const item = webOrderStore.find(list, id, "Order"); const notice = item.notices[index]; if (!notice || notice.sentAt) throw new Error("This message is already marked as sent.");
    notice.sentAt = isoNow(); notice.sentBy = actor; return { item, action: "customer_notified", detail: notice.event };
  });
}

// DIG-06: keep commercially useful abandoned intent for a follow-up without heavy CRM admin.
export function recordAbandoned(actor: string, input: { customerName: string; contact: string; product: string; channel: Channel; value: number; followUpHours: number }) {
  if (!input.customerName.trim() || !input.contact.trim() || !input.product.trim()) return reject("Enter who, how to reach them and what they wanted.");
  return abandonedStore.change<AbandonedInterest>(actor, (list) => {
    const now = isoNow(); const item: AbandonedInterest = { id: crypto.randomUUID(), number: "ABD-" + String(list.length + 1).padStart(4, "0"), customerName: input.customerName.trim(), contact: input.contact.trim(),
      product: input.product.trim(), channel: input.channel, value: Math.max(0, input.value), owner: actor, createdAt: now, followUpDueAt: hoursFrom(now, Math.max(1, input.followUpHours)), history: [] };
    list.push(item); return { item, action: "recorded", detail: item.product + " · " + CHANNEL_LABELS[input.channel], result: item };
  });
}
export function closeAbandoned(actor: string, id: string, result: "converted" | "not_interested" | "no_response", note: string) {
  if (!note.trim()) return reject("Record what happened.");
  return abandonedStore.change(actor, (list) => {
    const item = abandonedStore.find(list, id, "Interest"); if (item.outcome) throw new Error("Already closed.");
    item.outcome = { at: isoNow(), by: actor, result, note: note.trim() }; return { item, action: result, detail: note.trim() };
  });
}

export function orderStatus(item: WebOrder) {
  const row = (label: string, owner: string, waitingOn: string, next: string) => ({ label, owner, waitingOn, next });
  if (item.cancellation) return item.cancellation.refund === "pending" ? row("Cancelled, refund outstanding", "Finance", "Refund payout", "Pay the refund and record the reference") : row("Cancelled", item.owner, "Nothing", "None");
  if (item.fulfilment === "fulfilled") return row("Fulfilled", item.owner, "Nothing", "None");
  if (item.payment === "pending") return row("Awaiting payment", "Finance", "Payment verification", "Verify the payment");
  if (item.payment === "failed") return row("Payment failed", item.owner, "Customer retry", "Contact the customer to retry payment");
  if (item.fulfilment === "new") return row("Paid, awaiting stock decision", item.owner, "Allocation", "Allocate stock or send to sourcing");
  if (item.fulfilment === "allocated") return row("Stock allocated", item.owner, "Dispatch or collection", "Dispatch or hand over");
  if (item.fulfilment === "sourcing") return row("Being sourced", "Procurement", "Sourcing result", "Follow the sourcing request");
  return row("On its way", "Logistics", "Delivery", "Confirm delivery and mark fulfilled");
}
export function digitalWorkItems(source: { orders: WebOrder[]; abandoned: AbandonedInterest[]; policy: OpsPolicy; now: number }): WorkItem[] {
  const { now } = source; const items: WorkItem[] = []; const hours = (iso: string) => (now - Date.parse(iso)) / 3600000;
  for (const order of source.orders) {
    const status = orderStatus(order); const done = order.fulfilment === "fulfilled" || (order.cancellation && order.cancellation.refund !== "pending"); if (done) continue;
    const reason = order.payment === "failed" ? "Payment failed" : order.payment === "pending" && hours(order.createdAt) > 2 ? "Payment unverified over 2 hours" : order.cancellation ? "Refund outstanding" : order.payment === "verified" && order.fulfilment === "new" && hours(order.createdAt) > 1 ? "Paid, no stock decision" : undefined;
    items.push({ id: "web:" + order.id, code: order.cancellation ? "DIG-11" : order.payment !== "verified" ? "DIG-05" : "DIG-03", workflow: CHANNEL_LABELS[order.channel] + " order", title: order.number + " · " + order.customerName, state: status.label, owner: status.owner,
      waitingOn: status.waitingOn, nextAction: status.next, since: order.createdAt, exception: Boolean(reason), reason, tab: "digital", ref: order.id });
  }
  for (const entry of source.abandoned.filter((value) => !value.outcome)) {
    const due = Date.parse(entry.followUpDueAt) <= now;
    items.push({ id: "abd:" + entry.id, code: "DIG-09", workflow: "Digital follow-up", title: entry.number + " · " + entry.customerName + " · " + entry.product, state: due ? "Follow-up due" : "Follow-up scheduled", owner: entry.owner,
      waitingOn: "Customer", nextAction: "Contact the customer", since: entry.createdAt, dueAt: entry.followUpDueAt, exception: due, reason: due ? "Follow-up due" : undefined, tab: "digital", ref: entry.id });
  }
  return items;
}
