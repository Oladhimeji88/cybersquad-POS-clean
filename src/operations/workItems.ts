import type { Ticket } from "@/frontdesk/lib/store";
import { orderBalance, type Refund, type Sale } from "@/pos/lib/store";
import { repairStage, type BlockerContext, type Enquiry } from "./business";
import type { OpsPolicy } from "./policy";
import { returnStatus, type ReturnCase } from "./returns";
import { sourcingStatus, sourcingTiming, type SourcingRequest } from "./sourcing";

// One shape for every open workflow, so owner, state, wait, next action and age read the same everywhere.
export type WorkTab = "sourcing" | "returns" | "enquiries" | "repair" | "sale" | "procurement" | "logistics" | "inventory" | "support" | "quotes" | "digital" | "finance" | "routines" | "library";
export interface WorkItem {
  id: string; code: string; workflow: string; title: string; state: string; owner: string; waitingOn: string; nextAction: string;
  since: string; dueAt?: string; exception: boolean; reason?: string; tab: WorkTab; ref?: string;
}
export const CLOSED_REPAIR = ["completed", "closed", "delivered", "cancelled"];
const days = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 86400000));

export function buildWorkItems(source: {
  sales: Sale[]; refunds: Refund[]; tickets: Ticket[]; enquiries: Enquiry[]; sourcing: SourcingRequest[]; returns: ReturnCase[]; policy: OpsPolicy; now?: number;
}): WorkItem[] {
  const now = source.now ?? Date.now(); const items: WorkItem[] = [];
  for (const sale of source.sales.filter((entry) => !entry.isDemo)) {
    const customer = sale.customer?.name ?? "Customer";
    if (sale.lifecycle === "reserved") {
      const balance = orderBalance(sale) > 0; const overdue = Boolean(sale.collectionDueAt && Date.parse(sale.collectionDueAt) < now);
      items.push({ id: "order:" + sale.id, code: "SAL-05", workflow: "Order / reservation", title: sale.saleNumber + " · " + customer, state: balance ? "Order balance due" : "Paid, uncollected",
        owner: sale.cashierName, waitingOn: balance ? "Customer payment" : "Customer collection", nextAction: balance ? "Confirm payment and arrange collection" : "Contact customer for collection",
        since: sale.orderCreatedAt ?? sale.createdAt, dueAt: sale.collectionDueAt, exception: overdue, reason: overdue ? "Collection overdue" : undefined, tab: "sale", ref: sale.id });
    }
    // COD: delivery completes the shipment, not the money (FIN-04 / LOG-12).
    if (sale.cod && ["delivered", "collected"].includes(sale.cod.status) && !sale.cod.settledAt) {
      const since = sale.cod.history[sale.cod.history.length - 1]?.at ?? sale.createdAt; const aged = days(since, now) >= 3;
      items.push({ id: "cod:" + sale.id, code: "FIN-04", workflow: "COD receivable", title: sale.saleNumber + " · " + customer, state: "Delivered / Payment outstanding", owner: "Finance",
        waitingOn: sale.cod.courier + " remittance", nextAction: "Record settlement and reconcile", since, exception: aged, reason: aged ? "COD not remitted" : undefined, tab: "sale", ref: sale.id });
    }
  }
  for (const ticket of source.tickets.filter((entry) => !CLOSED_REPAIR.includes(entry.status))) {
    const stage = repairStage(ticket); const since = ticket.updatedAt || ticket.createdAt; const aged = days(since, now) >= source.policy.repairAgedDays;
    items.push({ id: "repair:" + ticket.id, code: "REP-13", workflow: "Repair", title: ticket.jobId + " · " + ticket.customer.name, state: stage,
      owner: ticket.assignedEngineer || (stage === "QC pending" ? "QA desk" : "Front desk"), waitingOn: stage.replace(/^Awaiting /, "").replace(/^./, (c) => c.toUpperCase()), nextAction: "Review " + stage.toLowerCase(),
      since, exception: aged, reason: aged ? "No update for " + days(since, now) + " days" : undefined, tab: "repair", ref: ticket.id });
  }
  for (const enquiry of source.enquiries.filter((entry) => entry.status === "open")) {
    const overdue = Date.parse(enquiry.followUpAt) < now;
    items.push({ id: "enquiry:" + enquiry.id, code: "SAL-01", workflow: "Follow-up", title: enquiry.customer.name + " · " + enquiry.request, state: overdue ? "Overdue follow-up" : "Follow-up",
      owner: enquiry.owner, waitingOn: "Customer", nextAction: "Contact customer", since: enquiry.createdAt, dueAt: enquiry.followUpAt, exception: overdue, reason: overdue ? "Follow-up overdue" : undefined, tab: "enquiries" });
  }
  for (const refund of source.refunds.filter((entry) => !entry.isDemo && entry.status === "pending")) {
    const approval = refund.approval?.status === "required"; const aged = days(refund.createdAt, now) >= 2;
    items.push({ id: "refund:" + refund.id, code: "REF-02", workflow: "Refund", title: "Refund · " + refund.saleNumber, state: approval ? "Refund awaiting approval" : "Repayment pending",
      owner: approval ? "Admin" : refund.actor, waitingOn: approval ? "Manager approval" : "Payout", nextAction: approval ? "Approve or reject refund" : "Complete repayment and record reference",
      since: refund.createdAt, exception: approval || aged, reason: approval ? "Needs approval" : aged ? "Refund ageing" : undefined, tab: "sale", ref: refund.saleId });
  }
  for (const request of source.sourcing.filter((entry) => !entry.closed)) {
    const status = sourcingStatus(request); const timing = sourcingTiming(request, source.policy, now);
    const reason = request.failure ? "Supplier failure" : request.priceReview ? "Price changed after commitment"
      : timing.state === "breached" ? "Past " + timing.target + " min target" : timing.state === "approaching" ? "Nearing " + timing.target + " min target" : undefined;
    items.push({ id: "sourcing:" + request.id, code: request.path === "direct" ? "SAL-09" : "SAL-04", workflow: request.path === "direct" ? "Direct supplier to customer" : "Rapid sourcing",
      title: request.number + " · " + request.product + " · " + request.customer.name, state: status.label, owner: status.owner, waitingOn: status.waitingOn, nextAction: status.next,
      since: request.createdAt, exception: Boolean(reason), reason, tab: "sourcing", ref: request.id });
  }
  for (const item of source.returns.filter((entry) => !entry.closed)) {
    const status = returnStatus(item); const aged = days(item.createdAt, now) >= 2;
    items.push({ id: "return:" + item.id, code: item.type === "warranty" ? "WAR-01" : "RET-02", workflow: "Return / warranty", title: item.number + " · " + item.item + " · " + item.customerName, state: status.label,
      owner: status.owner, waitingOn: status.waitingOn, nextAction: status.next, since: item.createdAt, exception: aged, reason: aged ? "Case ageing" : undefined, tab: "returns", ref: item.id });
  }
  return items;
}

// A saved owner / next action / due date overrides what the system inferred.
export function withOverrides(items: WorkItem[], blockers: Record<string, BlockerContext>, now = Date.now()): WorkItem[] {
  return items.map((item) => {
    const context = blockers[item.id]; if (!context) return item;
    const overdue = Boolean(context.dueAt && Date.parse(context.dueAt) < now);
    return { ...item, owner: context.owner, nextAction: context.nextAction, dueAt: context.dueAt || item.dueAt, exception: item.exception || overdue, reason: item.reason ?? (overdue ? "Action overdue" : undefined) };
  });
}
export const ageLabel = (since: string, now = Date.now()) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(since)) / 60000));
  return minutes < 60 ? minutes + " min" : minutes < 1440 ? Math.floor(minutes / 60) + " h" : Math.floor(minutes / 1440) + " d";
};
