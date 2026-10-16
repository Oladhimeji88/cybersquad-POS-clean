import { getSalePayments, type Refund, type Sale, type SalePaymentMode } from "@/pos/lib/store";
import type { OpsPolicy } from "./policy";
import { isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// FIN-09/10/13/14/18/20. Spending is requested with evidence, approved by someone other than the requester above
// the limit, and paid against a reference. Reconciliation compares the system's own figure with real cash or bank
// evidence and keeps any difference in a queue with an owner until it is explained.
export type ExpenseKind = "expense" | "petty_cash" | "internal_purchase" | "fixed_asset" | "petty_topup";
export const EXPENSE_LABELS: Record<ExpenseKind, string> = { expense: "Expense", petty_cash: "Petty cash", internal_purchase: "Internal purchase", fixed_asset: "Fixed asset", petty_topup: "Petty cash top-up" };
export interface Expense extends Tracked {
  number: string; kind: ExpenseKind; requester: string; purpose: string; category: string; amount: number; supplier?: string; evidence: string; status: "requested" | "approved" | "rejected" | "paid";
  approvalRequired: boolean; decision?: { by: string; at: string; note: string }; paid?: { at: string; by: string; reference: string }; assetRef?: string; createdAt: string;
}
export interface Reconciliation extends Tracked {
  number: string; date: string; method: SalePaymentMode; systemAmount: number; actualAmount: number; variance: number; status: "matched" | "exception" | "explained"; owner: string; reason?: string; resolution?: string; createdAt: string;
}
export const expenseStore = recordStore<Expense>("expenses_v1", "expense", (item) => item.number);
export const reconciliationStore = recordStore<Reconciliation>("reconciliations_v1", "reconciliation", (item) => item.number);

export const pettyCashBalance = (list: Expense[]) => money(list.filter((entry) => entry.status === "paid").reduce((sum, entry) => sum + (entry.kind === "petty_topup" ? entry.amount : entry.kind === "petty_cash" ? -entry.amount : 0), 0));
export function requestExpense(actor: string, input: { kind: Exclude<ExpenseKind, "petty_topup">; purpose: string; category: string; amount: number; supplier: string; evidence: string }, policy: OpsPolicy) {
  if (!input.purpose.trim() || !input.category.trim() || !(input.amount > 0)) return reject("Enter the purpose, category and amount.");
  if (!input.evidence.trim()) return reject("Attach the evidence: receipt, invoice or quote reference.");
  return expenseStore.change<Expense>(actor, (list) => {
    const required = input.kind === "fixed_asset" || input.amount > policy.expenseApprovalLimit;
    const item: Expense = { id: crypto.randomUUID(), number: "EXP-" + String(list.length + 1).padStart(4, "0"), kind: input.kind, requester: actor, purpose: input.purpose.trim(), category: input.category.trim(), amount: money(input.amount),
      supplier: input.supplier.trim() || undefined, evidence: input.evidence.trim(), status: required ? "requested" : "approved", approvalRequired: required, createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "requested", detail: EXPENSE_LABELS[input.kind] + " · " + item.amount + " · " + item.purpose + (required ? " · needs approval" : " · within authority"), result: item };
  });
}
export function topUpPettyCash(actor: string, amount: number, reference: string) {
  if (!(amount > 0) || !reference.trim()) return reject("Enter the amount and the cash or bank reference.");
  return expenseStore.change<Expense>(actor, (list) => {
    const item: Expense = { id: crypto.randomUUID(), number: "EXP-" + String(list.length + 1).padStart(4, "0"), kind: "petty_topup", requester: actor, purpose: "Petty cash float", category: "Petty cash", amount: money(amount), evidence: reference.trim(),
      status: "paid", approvalRequired: false, paid: { at: isoNow(), by: actor, reference: reference.trim() }, createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "topped_up", detail: "float +" + item.amount, result: item };
  });
}
export function decideExpense(actor: string, id: string, decision: "approved" | "rejected", note: string, canApprove: boolean) {
  if (!canApprove) return reject("Only an authorised approver can decide this.");
  if (!note.trim()) return reject("Record the reason.");
  return expenseStore.change(actor, (list) => {
    const item = expenseStore.find(list, id, "Request"); if (item.status !== "requested") throw new Error("This request is not awaiting approval.");
    if (item.requester === actor) throw new Error("You cannot approve your own request.");
    item.status = decision; item.decision = { by: actor, at: isoNow(), note: note.trim() };
    return { item, action: decision, detail: note.trim() };
  });
}
export function payExpense(actor: string, id: string, reference: string) {
  if (!reference.trim()) return reject("Enter the payment reference.");
  return expenseStore.change(actor, (list) => {
    const item = expenseStore.find(list, id, "Request"); if (item.status !== "approved") throw new Error("Only an approved request can be paid.");
    if (item.kind === "petty_cash" && item.amount > pettyCashBalance(list)) throw new Error("Petty cash balance is too low. Top it up first.");
    item.status = "paid"; item.paid = { at: isoNow(), by: actor, reference: reference.trim() };
    if (item.kind === "fixed_asset") item.assetRef = "AST-" + String(list.filter((entry) => entry.assetRef).length + 1).padStart(4, "0");
    return { item, action: "paid", detail: reference.trim() + (item.assetRef ? " · asset " + item.assetRef : "") };
  });
}

// What the system says was taken for one payment method on one day, net of refunds paid that day by the same method.
export function systemAmountFor(sales: Sale[], refunds: Refund[], date: string, method: SalePaymentMode) {
  const day = (iso?: string) => (iso ?? "").slice(0, 10) === date;
  const taken = sales.filter((sale) => !sale.isDemo && sale.lifecycle !== "cancelled").flatMap((sale) => getSalePayments(sale).filter((payment) => payment.mode === method && day(payment.recordedAt ?? sale.createdAt))).reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = refunds.filter((refund) => !refund.isDemo && refund.status === "paid" && refund.mode === method && day(refund.paidAt)).reduce((sum, refund) => sum + refund.total, 0);
  return money(taken - refunded);
}
export function recordReconciliation(actor: string, input: { date: string; method: SalePaymentMode; systemAmount: number; actualAmount: number; reason: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !(input.actualAmount >= 0)) return reject("Enter the date and the amount counted or banked.");
  const variance = money(input.actualAmount - input.systemAmount);
  if (variance !== 0 && !input.reason.trim()) return reject("The amounts differ by " + variance + ". Record the suspected reason; it goes to the exceptions queue.");
  return reconciliationStore.change<Reconciliation>(actor, (list) => {
    if (list.some((entry) => entry.date === input.date && entry.method === input.method && entry.status !== "explained" && entry.variance === variance)) throw new Error("This difference is already recorded.");
    const item: Reconciliation = { id: crypto.randomUUID(), number: "REC-" + String(list.length + 1).padStart(4, "0"), date: input.date, method: input.method, systemAmount: money(input.systemAmount), actualAmount: money(input.actualAmount),
      variance, status: variance === 0 ? "matched" : "exception", owner: actor, reason: input.reason.trim() || undefined, createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: variance === 0 ? "matched" : "exception", detail: input.method + " " + input.date + " · system " + item.systemAmount + " vs actual " + item.actualAmount + (variance ? " · difference " + variance : ""), result: item };
  });
}
export function explainReconciliation(actor: string, id: string, resolution: string) {
  if (!resolution.trim()) return reject("Record how the difference was explained.");
  return reconciliationStore.change(actor, (list) => {
    const item = reconciliationStore.find(list, id, "Reconciliation"); if (item.status !== "exception") throw new Error("There is no open difference here.");
    item.status = "explained"; item.resolution = resolution.trim(); return { item, action: "explained", detail: resolution.trim() };
  });
}
export function financeWorkItems(source: { expenses: Expense[]; reconciliations: Reconciliation[]; now: number }): WorkItem[] {
  const { now } = source; const items: WorkItem[] = []; const days = (iso: string) => Math.floor((now - Date.parse(iso)) / 86400000);
  for (const entry of source.expenses.filter((value) => ["requested", "approved"].includes(value.status))) {
    const approval = entry.status === "requested";
    items.push({ id: "exp:" + entry.id, code: entry.kind === "fixed_asset" ? "FIN-18" : entry.kind === "internal_purchase" ? "PRO-20" : entry.kind === "petty_cash" ? "FIN-10" : "FIN-09", workflow: EXPENSE_LABELS[entry.kind],
      title: entry.number + " · " + entry.purpose + " · " + entry.amount, state: approval ? "Awaiting approval" : "Approved, unpaid", owner: approval ? "Admin" : "Finance", waitingOn: approval ? "Approver" : "Payment", nextAction: approval ? "Approve or reject" : "Pay and record the reference",
      since: entry.createdAt, exception: days(entry.createdAt) >= 2, reason: days(entry.createdAt) >= 2 ? "Waiting over 2 days" : undefined, tab: "finance", ref: entry.id });
  }
  for (const entry of source.reconciliations.filter((value) => value.status === "exception")) {
    items.push({ id: "rec:" + entry.id, code: "FIN-14", workflow: "Unreconciled transaction", title: entry.number + " · " + entry.method.replace("_", " ") + " · " + entry.date + " · " + (entry.variance > 0 ? "+" : "") + entry.variance, state: "Unreconciled", owner: entry.owner,
      waitingOn: "Explanation", nextAction: "Find the cause and record it", since: entry.createdAt, exception: true, reason: "Difference of " + entry.variance, tab: "finance", ref: entry.id });
  }
  return items;
}
