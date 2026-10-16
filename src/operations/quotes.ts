// @ts-ignore -- plain JS prototype ledger
import { postReceivable } from "@/lib/finance";
import type { OpsPolicy } from "./policy";
import { hoursFrom, isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// SAL-06 / SAL-12. A quote that has been sent is never edited: a change is a new version, the old one stays on record,
// and only the latest unexpired version can be accepted. Discounts above the limit need a second person.
export interface QuoteLine { description: string; qty: number; unitPrice: number; }
export interface QuoteVersion { version: number; lines: QuoteLine[]; discountPercent: number; discountReason?: string; total: number; at: string; by: string; sentAt?: string; validUntil?: string; revisionReason?: string; }
export interface Quote extends Tracked {
  number: string; customerName: string; customerPhone: string; company?: string; creditDays?: number; versions: QuoteVersion[]; status: "draft" | "sent" | "accepted" | "declined";
  approval?: { status: "required" | "approved" | "rejected"; by?: string; note?: string }; decision?: { at: string; by: string; note: string }; invoiceRef?: string; createdAt: string;
}
export const quoteStore = recordStore<Quote>("quotes_v1", "quote", (item) => item.number);
export const latestVersion = (quote: Quote) => quote.versions[quote.versions.length - 1];
export const quoteTotal = (lines: QuoteLine[], discountPercent: number) => money(lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) * (1 - discountPercent / 100));
export const quoteExpired = (quote: Quote, now = Date.now()) => { const version = latestVersion(quote); return quote.status === "sent" && Boolean(version.validUntil) && Date.parse(version.validUntil!) < now; };

function checkLines(lines: QuoteLine[], discountPercent: number, reason: string) {
  if (!lines.length || lines.some((line) => !line.description.trim() || !Number.isInteger(line.qty) || line.qty < 1 || !(line.unitPrice > 0))) throw new Error("Each line needs a description, whole quantity and price.");
  if (!(discountPercent >= 0) || discountPercent > 100) throw new Error("Discount must be between 0 and 100 percent.");
  if (discountPercent > 0 && !reason.trim()) throw new Error("Record the reason for the discount.");
}
const approvalFor = (discountPercent: number, policy: OpsPolicy): Quote["approval"] => discountPercent > policy.discountApprovalPercent ? { status: "required" } : undefined;

export function createQuote(actor: string, input: { customerName: string; customerPhone: string; company?: string; creditDays?: number; lines: QuoteLine[]; discountPercent: number; discountReason: string }, policy: OpsPolicy) {
  if (!input.customerName.trim() || !input.customerPhone.trim()) return reject("Select the customer first.");
  try { checkLines(input.lines, input.discountPercent, input.discountReason); } catch (error) { return Promise.reject(error); }
  return quoteStore.change<Quote>(actor, (list) => {
    const at = isoNow(); const item: Quote = { id: crypto.randomUUID(), number: "QUO-" + String(list.length + 1).padStart(4, "0"), customerName: input.customerName.trim(), customerPhone: input.customerPhone.trim(),
      company: input.company?.trim() || undefined, creditDays: input.company?.trim() ? input.creditDays ?? 30 : undefined, status: "draft", approval: approvalFor(input.discountPercent, policy), createdAt: at, history: [],
      versions: [{ version: 1, lines: input.lines, discountPercent: input.discountPercent, discountReason: input.discountReason.trim() || undefined, total: quoteTotal(input.lines, input.discountPercent), at, by: actor }] };
    list.push(item); return { item, action: "created", detail: "v1 · total " + latestVersion(item).total + (item.approval ? " · discount needs approval" : ""), result: item };
  });
}
export function reviseQuote(actor: string, id: string, lines: QuoteLine[], discountPercent: number, discountReason: string, reason: string, policy: OpsPolicy) {
  if (!reason.trim()) return reject("Record why the quote is being changed.");
  try { checkLines(lines, discountPercent, discountReason); } catch (error) { return Promise.reject(error); }
  return quoteStore.change(actor, (list) => {
    const item = quoteStore.find(list, id, "Quote"); if (["accepted", "declined"].includes(item.status)) throw new Error("This quote is already decided.");
    const previous = latestVersion(item);
    item.versions.push({ version: previous.version + 1, lines, discountPercent, discountReason: discountReason.trim() || undefined, total: quoteTotal(lines, discountPercent), at: isoNow(), by: actor, revisionReason: reason.trim() });
    item.status = "draft"; item.approval = approvalFor(discountPercent, policy);
    return { item, action: "revised", detail: "v" + (previous.version + 1) + " replaces v" + previous.version + " · " + reason.trim() };
  });
}
export function decideQuoteDiscount(actor: string, id: string, decision: "approved" | "rejected", note: string, canApprove: boolean) {
  if (!canApprove) return reject("Only a manager can approve this discount.");
  if (!note.trim()) return reject("Record the reason.");
  return quoteStore.change(actor, (list) => {
    const item = quoteStore.find(list, id, "Quote"); if (item.approval?.status !== "required") throw new Error("This quote is not awaiting approval.");
    if (latestVersion(item).by === actor) throw new Error("You cannot approve a discount you gave.");
    item.approval = { status: decision, by: actor, note: note.trim() };
    return { item, action: "discount_" + decision, detail: note.trim() };
  });
}
export function sendQuote(actor: string, id: string, policy: OpsPolicy) {
  return quoteStore.change(actor, (list) => {
    const item = quoteStore.find(list, id, "Quote"); if (item.status !== "draft") throw new Error("Only a draft can be sent.");
    if (item.approval?.status === "required") throw new Error("The discount must be approved before this is sent.");
    if (item.approval?.status === "rejected") throw new Error("The discount was rejected. Revise the quote.");
    const version = latestVersion(item); version.sentAt = isoNow(); version.validUntil = hoursFrom(version.sentAt, policy.quoteValidDays * 24); item.status = "sent";
    return { item, action: "sent", detail: "v" + version.version + " valid until " + new Date(version.validUntil).toLocaleDateString() };
  });
}
export function acceptQuote(actor: string, id: string, note: string) {
  return quoteStore.change<{ invoiced: boolean }>(actor, (list) => {
    const item = quoteStore.find(list, id, "Quote"); if (item.status !== "sent") throw new Error("Only a sent quote can be accepted.");
    if (quoteExpired(item)) throw new Error("This quote has expired. Revise it and send a new version.");
    const version = latestVersion(item); let invoiced = false;
    if (item.company) { const result = postReceivable(item.company, { reference: item.number, amount: version.total, dueInDays: item.creditDays ?? 30 }); invoiced = Boolean(result?.ok); if (invoiced) item.invoiceRef = item.number; }
    item.status = "accepted"; item.decision = { at: isoNow(), by: actor, note: note.trim() || "Accepted" };
    return { item, action: "accepted", detail: "v" + version.version + " · " + version.total + (invoiced ? " · invoice raised on " + item.creditDays + " day terms" : ""), result: { invoiced } };
  });
}
export function declineQuote(actor: string, id: string, reason: string) {
  if (!reason.trim()) return reject("Record why the customer declined.");
  return quoteStore.change(actor, (list) => {
    const item = quoteStore.find(list, id, "Quote"); if (["accepted", "declined"].includes(item.status)) throw new Error("This quote is already decided.");
    item.status = "declined"; item.decision = { at: isoNow(), by: actor, note: reason.trim() };
    return { item, action: "declined", detail: reason.trim() };
  });
}
export function quoteWorkItems(list: Quote[], now: number): WorkItem[] {
  const items: WorkItem[] = [];
  for (const quote of list.filter((entry) => ["draft", "sent"].includes(entry.status))) {
    const version = latestVersion(quote); const approval = quote.approval?.status === "required"; const expired = quoteExpired(quote, now);
    const soon = quote.status === "sent" && version.validUntil && !expired && Date.parse(version.validUntil) - now < 86400000;
    const state = approval ? "Discount awaiting approval" : quote.status === "draft" ? "Draft, not sent" : expired ? "Expired, no decision" : "Awaiting customer";
    items.push({ id: "quote:" + quote.id, code: quote.company ? "SAL-12" : "SAL-06", workflow: quote.company ? "Business quote" : "Quote", title: quote.number + " · " + (quote.company ?? quote.customerName), state,
      owner: approval ? "Admin" : version.by, waitingOn: approval ? "Manager approval" : quote.status === "draft" ? "Sending" : "Customer decision",
      nextAction: approval ? "Approve or reject the discount" : quote.status === "draft" ? "Send it to the customer" : expired ? "Chase, revise and resend" : "Follow up",
      since: quote.createdAt, dueAt: version.validUntil, exception: approval || expired || Boolean(soon), reason: approval ? "Discount needs approval" : expired ? "Quote expired" : soon ? "Expires within 24 hours" : undefined, tab: "quotes", ref: quote.id });
  }
  return items;
}
