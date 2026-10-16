import type { OpsPolicy } from "./policy";
import { hoursFrom, isoNow, money, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// CX-01..06. CX keeps the customer relationship while a fix owner works the problem; silence becomes visible
// because every case carries the time its next customer update is due.
export type Severity = "low" | "medium" | "high" | "urgent";
export const SEVERITY_LABELS: Record<Severity, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export interface Complaint extends Tracked {
  number: string; customerName: string; customerPhone: string; link: { kind: "sale" | "repair" | "order" | "other"; ref: string }; issue: string; severity: Severity;
  cxOwner: string; fixOwner?: { team: string; person?: string; at: string }; createdAt: string; lastUpdateAt?: string; nextUpdateDueAt: string;
  updates: { at: string; by: string; channel: string; note: string }[];
  recovery?: { action: string; value: number; requestedBy: string; status: "approved" | "pending" | "rejected"; decidedBy?: string; note?: string };
  resolution?: { at: string; by: string; outcome: string };
}
export const complaintStore = recordStore<Complaint>("complaints_v1", "complaint", (item) => item.number);
export const updateHours = (severity: Severity, policy: OpsPolicy) => ({ urgent: policy.updateUrgentHours, high: policy.updateHighHours, medium: policy.updateMediumHours, low: policy.updateLowHours })[severity];

export function createComplaint(actor: string, input: { customerName: string; customerPhone: string; link: Complaint["link"]; issue: string; severity: Severity }, policy: OpsPolicy) {
  if (!input.customerName.trim() || !input.customerPhone.trim()) return reject("Select the customer first.");
  if (!input.issue.trim()) return reject("Capture the issue in the customer's words.");
  if (input.link.kind !== "other" && !input.link.ref.trim()) return reject("Link the sale, repair or order this is about.");
  return complaintStore.change<Complaint>(actor, (list) => {
    const now = isoNow();
    const item: Complaint = { id: crypto.randomUUID(), number: "CMP-" + String(list.length + 1).padStart(4, "0"), customerName: input.customerName.trim(), customerPhone: input.customerPhone.trim(), link: input.link,
      issue: input.issue.trim(), severity: input.severity, cxOwner: actor, createdAt: now, nextUpdateDueAt: hoursFrom(now, updateHours(input.severity, policy)), updates: [], history: [] };
    list.push(item); return { item, action: "opened", detail: SEVERITY_LABELS[input.severity] + " · " + item.issue, result: item };
  });
}
// CX keeps the customer; the fix owner changes. The customer never has to coordinate departments.
export function routeComplaint(actor: string, id: string, team: string, person: string) {
  if (!team.trim()) return reject("Choose the team that will fix it.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint"); if (item.resolution) throw new Error("This complaint is resolved.");
    item.fixOwner = { team: team.trim(), person: person.trim() || undefined, at: isoNow() };
    return { item, action: "routed", detail: team.trim() + (person.trim() ? " · " + person.trim() : "") + " · CX still owns the customer" };
  });
}
export function setSeverity(actor: string, id: string, severity: Severity, reason: string, policy: OpsPolicy) {
  if (!reason.trim()) return reject("Record why the priority changed.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint"); if (item.resolution) throw new Error("This complaint is resolved.");
    const before = item.severity; item.severity = severity; item.nextUpdateDueAt = hoursFrom(item.lastUpdateAt ?? item.createdAt, updateHours(severity, policy));
    return { item, action: "priority_changed", detail: before + " -> " + severity + " · " + reason.trim() };
  });
}
export function logCustomerUpdate(actor: string, id: string, channel: string, note: string, policy: OpsPolicy) {
  if (!note.trim()) return reject("Record what the customer was told.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint"); if (item.resolution) throw new Error("This complaint is resolved.");
    const at = isoNow(); item.updates.push({ at, by: actor, channel, note: note.trim() }); item.lastUpdateAt = at; item.nextUpdateDueAt = hoursFrom(at, updateHours(item.severity, policy));
    return { item, action: "customer_updated", detail: channel + " · " + note.trim() };
  });
}
// Service recovery above the limit needs a second person (CX-06).
export function requestRecovery(actor: string, id: string, action: string, value: number, policy: OpsPolicy) {
  if (!action.trim() || !(value >= 0)) return reject("Describe the gesture and its value.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint"); if (item.recovery && item.recovery.status !== "rejected") throw new Error("A recovery action is already recorded.");
    const needs = value > policy.recoveryApprovalLimit;
    item.recovery = { action: action.trim(), value: money(value), requestedBy: actor, status: needs ? "pending" : "approved" };
    return { item, action: "recovery_requested", detail: action.trim() + " · " + money(value) + (needs ? " · needs approval" : " · within authority") };
  });
}
export function decideRecovery(actor: string, id: string, decision: "approved" | "rejected", note: string, canApprove: boolean) {
  if (!canApprove) return reject("Only a manager can approve this.");
  if (!note.trim()) return reject("Record the reason.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint");
    if (item.recovery?.status !== "pending") throw new Error("There is no recovery action awaiting approval.");
    if (item.recovery.requestedBy === actor) throw new Error("You cannot approve your own request.");
    item.recovery.status = decision; item.recovery.decidedBy = actor; item.recovery.note = note.trim();
    return { item, action: "recovery_" + decision, detail: note.trim() };
  });
}
// A complaint closes on a recorded outcome, not because it was forwarded.
export function resolveComplaint(actor: string, id: string, outcome: string) {
  if (!outcome.trim()) return reject("Record the actual resolution.");
  return complaintStore.change(actor, (list) => {
    const item = complaintStore.find(list, id, "Complaint"); if (item.resolution) throw new Error("Already resolved.");
    if (!item.fixOwner) throw new Error("Route the complaint to the team that fixes it before resolving it.");
    if (!item.updates.length) throw new Error("Tell the customer the outcome and log that update first.");
    if (item.recovery?.status === "pending") throw new Error("A service-recovery approval is still pending.");
    item.resolution = { at: isoNow(), by: actor, outcome: outcome.trim() };
    return { item, action: "resolved", detail: outcome.trim() };
  });
}
export function complaintStatus(item: Complaint, now = Date.now()) {
  const row = (label: string, owner: string, waitingOn: string, next: string) => ({ label, owner, waitingOn, next });
  if (item.resolution) return row("Resolved", item.cxOwner, "Nothing", "None");
  if (!item.fixOwner) return row("Needs routing", item.cxOwner, "Fix owner", "Route to the team that can fix it");
  const overdue = Date.parse(item.nextUpdateDueAt) < now;
  return row(overdue ? "Customer update overdue" : "With " + item.fixOwner.team, item.cxOwner, "Fix by " + (item.fixOwner.person ?? item.fixOwner.team),
    overdue ? "Update the customer now" : "Chase the fix and update the customer by " + new Date(item.nextUpdateDueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}
export function complaintWorkItems(list: Complaint[], now: number): WorkItem[] {
  return list.filter((item) => !item.resolution).map((item) => {
    const status = complaintStatus(item, now); const overdue = Date.parse(item.nextUpdateDueAt) < now;
    const reason = overdue ? "Customer update overdue" : item.severity === "urgent" ? "Urgent" : item.recovery?.status === "pending" ? "Recovery needs approval" : undefined;
    return { id: "complaint:" + item.id, code: "CX-04", workflow: "Complaint", title: item.number + " · " + item.customerName + " · " + item.issue, state: status.label, owner: status.owner, waitingOn: status.waitingOn, nextAction: status.next,
      since: item.createdAt, dueAt: item.nextUpdateDueAt, exception: Boolean(reason), reason, tab: "support" as const, ref: item.id };
  });
}
