import type { CashShift } from "@/pos/lib/store";
import { codeExists } from "./catalog";
import { isoNow, recordStore, reject, type Tracked } from "./records";
import type { WorkItem } from "./workItems";

// OPS-01..16. Daily routines check real state instead of asking people to retype it; the day cannot be closed
// over unowned work or an open cash shift; the action log carries overdue items forward; SOP adoption moves
// Learn -> Demonstrate -> Execute & Sustain with evidence; and a changed SOP stays open until the SOP,
// CyberSquad and Academy have all been reviewed.
export const OPENING_CHECKS = ["Cash float counted and shift opened", "Carry-over exceptions reviewed", "Team coverage assigned for today", "Stock and delivery handoffs from yesterday confirmed"] as const;
export const today = () => new Date().toISOString().slice(0, 10);

export interface EodSnapshot { generatedAt: string; figures: Record<string, string | number>; exceptions: number; }
export interface DayRecord extends Tracked {
  date: string; opening?: { at: string; by: string; carryOver: number }; allocations: { area: string; person: string }[];
  closing?: { at: string; by: string; note: string }; eod?: { submittedAt: string; by: string; narrative: string; snapshot: EodSnapshot };
}
export const dayStore = recordStore<DayRecord>("ops_days_v1", "day", (item) => item.date);
const ensure = (list: DayRecord[], date: string) => {
  let item = list.find((entry) => entry.date === date);
  if (!item) { item = { id: "day-" + date, date, allocations: [], history: [] }; list.push(item); }
  return item;
};
export function openDay(actor: string, date: string, checked: string[], carryOver: number) {
  const missing = OPENING_CHECKS.filter((entry) => !checked.includes(entry));
  if (missing.length) return reject("Complete every opening check first (" + missing.length + " left).");
  return dayStore.change(actor, (list) => {
    const item = ensure(list, date); if (item.opening) throw new Error("Today has already been opened.");
    item.opening = { at: isoNow(), by: actor, carryOver }; return { item, action: "opened", detail: carryOver + " carry-over exception(s) reviewed" };
  });
}
export function allocateTeam(actor: string, date: string, area: string, person: string) {
  if (!area.trim() || !person.trim()) return reject("Enter the area and who covers it.");
  return dayStore.change(actor, (list) => {
    const item = ensure(list, date); item.allocations = item.allocations.filter((entry) => entry.area.toLowerCase() !== area.trim().toLowerCase()).concat({ area: area.trim(), person: person.trim() });
    return { item, action: "allocated", detail: area.trim() + " -> " + person.trim() };
  });
}
// Closing verifies; it never force-closes work. Anything unresolved stays open with an owner.
export function closingChecks(items: WorkItem[], activeShift: CashShift | null) {
  const unowned = items.filter((item) => !item.owner.trim() || !item.nextAction.trim());
  return [
    { ok: !activeShift, label: "Cash shift closed", detail: activeShift ? "A shift is still open. Count and end it first." : "No open cash shift" },
    { ok: unowned.length === 0, label: "Every open workflow has an owner and next action", detail: unowned.length ? unowned.length + " without an owner or next action" : "All open work is owned" },
  ];
}
export function closeDay(actor: string, date: string, checks: { ok: boolean; label: string }[], note: string) {
  const failing = checks.filter((entry) => !entry.ok);
  if (failing.length) return reject("Cannot close the day: " + failing.map((entry) => entry.label).join("; ") + ".");
  return dayStore.change(actor, (list) => {
    const item = ensure(list, date); if (!item.opening) throw new Error("Open the day before closing it."); if (item.closing) throw new Error("Today is already closed.");
    item.closing = { at: isoNow(), by: actor, note: note.trim() }; return { item, action: "closed", detail: note.trim() || "closing checks passed" };
  });
}
// OPS-07: the figures come from the workflows; staff only add what the system cannot know.
export function submitEod(actor: string, date: string, snapshot: EodSnapshot, narrative: string) {
  return dayStore.change(actor, (list) => {
    const item = ensure(list, date); if (item.eod) throw new Error("The end-of-day report is already submitted.");
    item.eod = { submittedAt: isoNow(), by: actor, narrative: narrative.trim(), snapshot }; return { item, action: "eod_submitted", detail: snapshot.exceptions + " open exception(s)" + (narrative.trim() ? " · narrative added" : "") };
  });
}

// ---- Meeting action log (OPS-10) ----
export interface ActionItem extends Tracked { number: string; meeting: "daily" | "weekly" | "monthly"; meetingDate: string; kind: "action" | "decision"; text: string; owner: string; dueDate: string; status: "open" | "done"; doneNote?: string; createdAt: string; }
export const actionStore = recordStore<ActionItem>("ops_actions_v1", "action", (item) => item.number);
export function addAction(actor: string, input: { meeting: ActionItem["meeting"]; meetingDate: string; kind: ActionItem["kind"]; text: string; owner: string; dueDate: string }) {
  if (!input.text.trim() || !input.owner.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return reject("Enter what was decided, who owns it and a due date.");
  return actionStore.change<ActionItem>(actor, (list) => {
    const item: ActionItem = { id: crypto.randomUUID(), number: "ACT-" + String(list.length + 1).padStart(4, "0"), ...input, text: input.text.trim(), owner: input.owner.trim(), status: "open", createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "added", detail: input.kind + " · " + item.text + " · " + item.owner + " by " + input.dueDate, result: item };
  });
}
export function completeAction(actor: string, id: string, note: string) {
  if (!note.trim()) return reject("Record the outcome.");
  return actionStore.change(actor, (list) => {
    const item = actionStore.find(list, id, "Action"); if (item.status === "done") throw new Error("Already done.");
    item.status = "done"; item.doneNote = note.trim(); return { item, action: "done", detail: note.trim() };
  });
}
export const actionOverdue = (item: ActionItem, now = Date.now()) => item.status === "open" && Date.parse(item.dueDate + "T23:59:59") < now;

// ---- SOP adoption (OPS-12/13/14) ----
export interface Adoption extends Tracked {
  person: string; code: string; assignedAt: string; learnedAt?: string; demonstration?: { at: string; assessor: string; checkpoint: string }; sustainedAt?: string; coaching: { at: string; by: string; note: string }[];
}
export const adoptionStore = recordStore<Adoption>("sop_adoption_v1", "adoption", (item) => item.person + " · " + item.code);
export const adoptionStage = (item: Adoption) => item.sustainedAt ? "Sustained" : item.demonstration ? "Demonstrated" : item.learnedAt ? "Learned" : "Assigned";
export function assignTraining(actor: string, person: string, code: string) {
  if (!person.trim() || !codeExists(code)) return reject("Choose a person and a valid workflow code.");
  return adoptionStore.change<Adoption>(actor, (list) => {
    if (list.some((entry) => entry.person.toLowerCase() === person.trim().toLowerCase() && entry.code === code)) throw new Error("This workflow is already assigned to " + person.trim() + ".");
    const item: Adoption = { id: crypto.randomUUID(), person: person.trim(), code, assignedAt: isoNow(), coaching: [], history: [] };
    list.push(item); return { item, action: "assigned", detail: code, result: item };
  });
}
export function markLearned(actor: string, id: string) {
  return adoptionStore.change(actor, (list) => {
    const item = adoptionStore.find(list, id, "Assignment"); if (item.learnedAt) throw new Error("Already marked as learned.");
    item.learnedAt = isoNow(); return { item, action: "learned", detail: "lesson understood" };
  });
}
// Completing a lesson is not adoption. Someone else must see the person do the real workflow.
export function recordDemonstration(actor: string, id: string, assessor: string, checkpoint: string) {
  if (!assessor.trim() || !checkpoint.trim()) return reject("Record who observed it and what was demonstrated.");
  return adoptionStore.change(actor, (list) => {
    const item = adoptionStore.find(list, id, "Assignment"); if (!item.learnedAt) throw new Error("The lesson must be learned before it is demonstrated.");
    if (item.demonstration) throw new Error("Already demonstrated.");
    if (assessor.trim().toLowerCase() === item.person.toLowerCase()) throw new Error("The person cannot assess their own demonstration.");
    item.demonstration = { at: isoNow(), assessor: assessor.trim(), checkpoint: checkpoint.trim() }; return { item, action: "demonstrated", detail: "observed by " + assessor.trim() + " · " + checkpoint.trim() };
  });
}
export function addCoaching(actor: string, id: string, note: string) {
  if (!note.trim()) return reject("Record the coaching evidence.");
  return adoptionStore.change(actor, (list) => {
    const item = adoptionStore.find(list, id, "Assignment"); if (!item.demonstration) throw new Error("Coaching starts after the workflow has been demonstrated.");
    item.coaching.push({ at: isoNow(), by: actor, note: note.trim() }); return { item, action: "coached", detail: note.trim() };
  });
}
export function markSustained(actor: string, id: string) {
  return adoptionStore.change(actor, (list) => {
    const item = adoptionStore.find(list, id, "Assignment"); if (!item.demonstration) throw new Error("Demonstrate the workflow first.");
    if (!item.coaching.length) throw new Error("Sustained adoption needs coaching evidence from live work.");
    if (item.sustainedAt) throw new Error("Already sustained."); item.sustainedAt = isoNow(); return { item, action: "sustained", detail: item.coaching.length + " coaching note(s)" };
  });
}

// ---- SOP change management (OPS-16) ----
export type ReviewArea = "sop" | "cybersquad" | "academy";
export interface SopVersion extends Tracked { code: string; version: number; summary: string; effectiveDate: string; owner: string; reviews: Record<ReviewArea, { by: string; at: string } | null>; createdAt: string; }
export const sopStore = recordStore<SopVersion>("sop_versions_v1", "sop", (item) => item.code + " v" + item.version);
export const sopAligned = (item: SopVersion) => Boolean(item.reviews.sop && item.reviews.cybersquad && item.reviews.academy);
export function proposeSopChange(actor: string, code: string, summary: string, effectiveDate: string) {
  if (!codeExists(code)) return reject("Choose a valid workflow code.");
  if (!summary.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return reject("Describe the change and give the effective date.");
  return sopStore.change<SopVersion>(actor, (list) => {
    const latest = Math.max(0, ...list.filter((entry) => entry.code === code).map((entry) => entry.version));
    const item: SopVersion = { id: crypto.randomUUID(), code, version: latest + 1, summary: summary.trim(), effectiveDate, owner: actor, reviews: { sop: null, cybersquad: null, academy: null }, createdAt: isoNow(), history: [] };
    list.push(item); return { item, action: "proposed", detail: "effective " + effectiveDate + " · " + item.summary, result: item };
  });
}
export function confirmReview(actor: string, id: string, area: ReviewArea) {
  return sopStore.change(actor, (list) => {
    const item = sopStore.find(list, id, "SOP version"); if (item.reviews[area]) throw new Error("This review is already confirmed.");
    item.reviews[area] = { by: actor, at: isoNow() }; return { item, action: "reviewed_" + area, detail: sopAligned(item) ? "all three reviewed: aligned" : area + " reviewed" };
  });
}
export function routinesWorkItems(source: { actions: ActionItem[]; sop: SopVersion[]; now: number }): WorkItem[] {
  const { now } = source; const items: WorkItem[] = [];
  for (const action of source.actions.filter((entry) => entry.status === "open")) {
    const overdue = actionOverdue(action, now);
    items.push({ id: "action:" + action.id, code: "OPS-10", workflow: action.kind === "decision" ? "Management decision" : "Meeting action", title: action.number + " · " + action.text, state: overdue ? "Carried forward, overdue" : "Open action", owner: action.owner,
      waitingOn: "Owner", nextAction: "Complete and record the outcome", since: action.createdAt, dueAt: action.dueDate, exception: overdue, reason: overdue ? "Manager action overdue" : undefined, tab: "routines", ref: action.id });
  }
  for (const version of source.sop.filter((entry) => !sopAligned(entry))) {
    const late = Date.parse(version.effectiveDate + "T00:00:00") <= now;
    const missing = (["sop", "cybersquad", "academy"] as ReviewArea[]).filter((area) => !version.reviews[area]);
    items.push({ id: "sop:" + version.id, code: "OPS-16", workflow: "SOP change", title: version.code + " v" + version.version + " · " + version.summary, state: "Awaiting alignment", owner: version.owner, waitingOn: "Review of " + missing.join(", "), nextAction: "Confirm the remaining reviews",
      since: version.createdAt, dueAt: version.effectiveDate, exception: late, reason: late ? "In effect but not aligned" : undefined, tab: "library", ref: version.id });
  }
  return items;
}
