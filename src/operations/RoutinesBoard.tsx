import { useEffect, useState } from "react";
import { CalendarCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getActiveShift, type CashShift } from "@/pos/lib/store";
import { buildAllWorkItems } from "./data";
import { OPENING_CHECKS, actionOverdue, addAction, allocateTeam, closeDay, closingChecks, completeAction, openDay, today, type ActionItem } from "./routines";
import { Choice, CodeTag, EmptyState, Field, FormDialog, Panel, Pill, ReasonButton, SectionHeader, Tabbed, useRun, type OpsContext } from "./shared";

function Today({ ctx }: { ctx: OpsContext }) {
  const date = today(); const { busy, run } = useRun(ctx.reload); const day = ctx.data.days.find((entry) => entry.date === date); const [shift, setShift] = useState<CashShift | null>(null);
  const [checked, setChecked] = useState<string[]>([]); const [area, setArea] = useState(""); const [person, setPerson] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { void getActiveShift().then(setShift).catch(() => setShift(null)); }, [ctx.data]);
  const items = buildAllWorkItems(ctx.data); const carryOver = items.filter((item) => item.exception); const checks = closingChecks(items, shift); const manage = ctx.can("operate", "sell", "manage");
  return <div className="space-y-6">
    <Panel><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CodeTag code="OPS-01" /><h3 className="font-semibold">Opening routine</h3></div><Pill tone={day?.opening ? "good" : "warn"}>{day?.opening ? "Opened by " + day.opening.by : "Not opened"}</Pill></div>
      <p className="text-sm text-muted-foreground">{carryOver.length} exception{carryOver.length === 1 ? "" : "s"} carried over from earlier work. Review them before the day starts.</p>
      {carryOver.slice(0, 5).map((item) => <p key={item.id} className="text-sm"><span className="font-medium">{item.title}</span> <span className="text-muted-foreground">· {item.owner} · {item.reason ?? item.state}</span></p>)}
      {!day?.opening && manage && <><div className="space-y-2">{OPENING_CHECKS.map((entry) => <label key={entry} className="flex items-center gap-2 text-sm"><Checkbox checked={checked.includes(entry)} onCheckedChange={(v) => setChecked(v === true ? [...checked, entry] : checked.filter((c) => c !== entry))} />{entry}</label>)}</div>
        <Button disabled={busy} onClick={() => void run(() => openDay(ctx.userName, date, checked, carryOver.length), "Day opened.")}>Open the day</Button></>}</Panel>
    <Panel><div className="flex items-center gap-2"><CodeTag code="OPS-02" /><h3 className="font-semibold">Team coverage</h3></div>
      {day?.allocations.length ? <ul className="text-sm">{day.allocations.map((entry) => <li key={entry.area}><span className="font-medium">{entry.area}</span> · {entry.person}</li>)}</ul> : <p className="text-sm text-muted-foreground">No coverage assigned yet today.</p>}
      {manage && <div className="grid gap-4 sm:grid-cols-3"><Input aria-label="Area" placeholder="Area, e.g. Sourcing desk" value={area} onChange={(e) => setArea(e.target.value)} /><Input aria-label="Who covers it" placeholder="Who covers it" value={person} onChange={(e) => setPerson(e.target.value)} />
        <Button variant="outline" disabled={busy} onClick={() => void run(() => allocateTeam(ctx.userName, date, area, person), "Coverage saved.").then(() => { setArea(""); setPerson(""); })}>Assign</Button></div>}</Panel>
    <Panel><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CodeTag code="OPS-06" /><h3 className="font-semibold">Closing routine</h3></div><Pill tone={day?.closing ? "good" : "warn"}>{day?.closing ? "Closed by " + day.closing.by : "Open"}</Pill></div>
      <p className="text-xs text-muted-foreground">Closing checks the real state. It never closes workflows for you, and unfinished work stays open with its owner.</p>
      <ul className="space-y-2">{checks.map((check) => <li key={check.label} className="flex items-start gap-2 text-sm"><Pill tone={check.ok ? "good" : "bad"}>{check.ok ? "Pass" : "Fix"}</Pill><span><span className="font-medium">{check.label}</span><span className="block text-xs text-muted-foreground">{check.detail}</span></span></li>)}</ul>
      {day?.opening && !day.closing && manage && <div className="flex flex-wrap gap-2"><Input aria-label="Closing note" className="w-96" placeholder="Handover note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button disabled={busy} onClick={() => void run(() => closeDay(ctx.userName, date, checks, note), "Day closed.")}>Close the day</Button></div>}
      {!day?.opening && <p className="text-sm text-muted-foreground">Open the day first.</p>}</Panel>
  </div>;
}

function Actions({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [creating, setCreating] = useState(false); const [view, setView] = useState("open");
  const [form, setForm] = useState({ meeting: "weekly", kind: "action", text: "", owner: "", due: "", date: today() });
  const list = data.actions.filter((entry) => view === "all" || (view === "open") === (entry.status === "open")).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return <div className="space-y-6"><SectionHeader title="Meeting actions and decisions" description="Every action has an owner and a due date. Overdue ones are carried forward and flagged until they are done." action={ctx.can("operate", "manage") ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Add</Button> : undefined} />
    <div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["open", "Open (" + data.actions.filter((a) => a.status === "open").length + ")"], ["done", "Done"], ["all", "All"]]} /></div>
    <div className="space-y-4">{list.map((entry: ActionItem) => { const overdue = actionOverdue(entry);
      return <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="OPS-10" /><span className="text-xs text-muted-foreground">{entry.number} · {entry.meeting} meeting {entry.meetingDate}</span></div>
        <h3 className="font-semibold">{entry.text}</h3><p className="text-sm text-muted-foreground">{entry.owner} · due {entry.dueDate}{overdue ? " · carried forward" : ""}</p>{entry.doneNote && <p className="text-sm text-muted-foreground">Outcome: {entry.doneNote}</p>}</div>
        <div className="flex gap-2"><Pill tone="neutral">{entry.kind}</Pill><Pill tone={entry.status === "done" ? "good" : overdue ? "bad" : "info"}>{entry.status === "done" ? "Done" : overdue ? "Overdue" : "Open"}</Pill></div></div>
        {entry.status === "open" && <ReasonButton label="Mark done" variant="default" title="Complete this action" placeholder="What was the outcome?" disabled={busy} onSubmit={(note) => run(() => completeAction(ctx.userName, entry.id, note), "Action completed.")} />}</Panel>; })}
      {!list.length && <EmptyState icon={CalendarCheck}>Nothing here.</EmptyState>}</div>
    <FormDialog open={creating} onOpenChange={setCreating} title="Add an action or decision" description="Capture what was decided, who owns it and when it is due.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await run(() => addAction(ctx.userName, { meeting: form.meeting as "weekly", meetingDate: form.date, kind: form.kind as "action", text: form.text, owner: form.owner, dueDate: form.due }), "Added.");
        if (result) { setCreating(false); setForm({ ...form, text: "", owner: "", due: "" }); } }}>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Meeting"><Choice label="Meeting" value={form.meeting} onChange={(v) => setForm({ ...form, meeting: v })} options={[["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]]} /></Field>
          <Field label="Type"><Choice label="Type" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[["action", "Action"], ["decision", "Decision or policy issue"]]} /></Field><Field label="Meeting date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field></div>
        <Field label="What was decided"><Input required value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Owner"><Input required value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field><Field label="Due date"><Input required type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Save</Button></div></form></FormDialog></div>;
}

export default function RoutinesBoard({ ctx }: { ctx: OpsContext }) {
  const [tab, setTab] = useState("today");
  return <section className="space-y-6"><Tabbed value={tab} onChange={setTab} tabs={[["today", "Today"], ["actions", "Actions and decisions"]]} />{tab === "today" ? <Today ctx={ctx} /> : <Actions ctx={ctx} />}</section>;
}
