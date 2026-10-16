import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREAS, WORKFLOW_CATALOG, coverage, type Where } from "./catalog";
import { adoptionStage, addCoaching, assignTraining, confirmReview, markLearned, markSustained, proposeSopChange, recordDemonstration, sopAligned, type ReviewArea } from "./routines";
import { Choice, CodeTag, EmptyState, Field, FormDialog, Panel, Pill, ReasonButton, SectionHeader, Stat, Tabbed, Timeline, useRun, type OpsContext } from "./shared";

const WHERE_LABELS: Record<string, string> = { overview: "Work queue", enquiries: "Follow-ups", orders: "Orders", quotes: "Quotes", digital: "Digital orders", sourcing: "Sourcing", procurement: "Procurement", logistics: "Logistics", inventory: "Inventory", returns: "Returns", support: "Support",
  finance: "Finance", reports: "Reports", routines: "Routines", library: "Library", audit: "Audit and policy", pos: "POS terminal", repairs: "Repairs desk (separate)", "finance-admin": "Admin finance" };
const STAGES = ["Assigned", "Learned", "Demonstrated", "Sustained"];

function Coverage() {
  const [area, setArea] = useState("all"); const rows = coverage(); const total = WORKFLOW_CATALOG.length; const gaps = WORKFLOW_CATALOG.filter((entry) => !entry.where);
  const list = WORKFLOW_CATALOG.filter((entry) => area === "all" || entry.area === area);
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Workflow codes" value={total} /><Stat label="Built in this workspace" value={WORKFLOW_CATALOG.filter((e) => e.where && e.where !== "repairs").length} /><Stat label="In the repairs desk" value={WORKFLOW_CATALOG.filter((e) => e.where === "repairs").length} /><Stat label="Not built yet" value={gaps.length} tone={gaps.length ? "warn" : "neutral"} note={gaps.map((g) => g.code).join(", ")} /></div>
    <div className="grid gap-4 sm:grid-cols-3">{rows.map((row) => <div key={row.area} className="rounded-lg border border-border bg-card p-4 text-sm"><p className="font-medium">{row.area}</p><p className="text-muted-foreground">{row.built + row.repairs} of {row.total} have a screen</p></div>)}</div>
    <div className="w-56"><Choice label="Area" value={area} onChange={setArea} options={[["all", "All areas"], ...AREAS.map((a): [string, string] => [a, a])]} /></div>
    <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-secondary/50 text-left text-xs text-muted-foreground"><tr><th className="p-4">Code</th><th className="p-4">Workflow</th><th className="p-4">Owner</th><th className="p-4">Where it is done</th></tr></thead>
      <tbody>{list.map((entry) => <tr key={entry.code} className="border-t border-border"><td className="p-4"><CodeTag code={entry.code} /></td><td className="p-4">{entry.name}</td><td className="p-4 text-muted-foreground">{entry.owner}</td>
        <td className="p-4">{entry.where ? WHERE_LABELS[entry.where as Where] : <Pill tone="warn">Not built yet</Pill>}</td></tr>)}</tbody></table></div></div>;
}

function Adoption({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [creating, setCreating] = useState(false); const [form, setForm] = useState({ person: "", code: "SAL-04" }); const [assessor, setAssessor] = useState(ctx.userName);
  const manage = ctx.can("operate", "manage");
  return <div className="space-y-6"><SectionHeader title="SOP adoption" description="Learn, then demonstrate to someone else on real work, then show it sustained with coaching evidence. Finishing a lesson is not adoption." action={manage ? <Button onClick={() => setCreating(true)}>Assign a workflow</Button> : undefined} />
    <div className="grid gap-4 sm:grid-cols-4">{STAGES.map((stage) => <Stat key={stage} label={stage} value={data.adoption.filter((a) => adoptionStage(a) === stage).length} />)}</div>
    <div className="space-y-4">{data.adoption.map((entry) => { const stage = adoptionStage(entry); const catalog = WORKFLOW_CATALOG.find((c) => c.code === entry.code);
      return <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code={entry.code} /><span className="text-xs text-muted-foreground">{catalog?.name}</span></div><h3 className="font-semibold">{entry.person}</h3></div><Pill tone={stage === "Sustained" ? "good" : "info"}>{stage}</Pill></div>
        {entry.demonstration && <p className="text-sm text-muted-foreground">Demonstrated to {entry.demonstration.assessor}: {entry.demonstration.checkpoint}</p>}
        {entry.coaching.length > 0 && <ul className="space-y-1 border-l-2 border-border pl-4 text-sm">{entry.coaching.map((c, i) => <li key={i}>{new Date(c.at).toLocaleDateString()} · {c.by}: {c.note}</li>)}</ul>}
        {manage && stage !== "Sustained" && <div className="flex flex-wrap items-center gap-2">
          {stage === "Assigned" && <Button size="sm" disabled={busy} onClick={() => void run(() => markLearned(ctx.userName, entry.id), "Marked as learned.")}>Lesson understood</Button>}
          {stage === "Learned" && <><Input aria-label="Assessor" className="w-48" placeholder="Observed by" value={assessor} onChange={(e) => setAssessor(e.target.value)} /><ReasonButton label="Record demonstration" variant="default" title="Record a demonstration" description="Someone other than the person must have watched them do it." placeholder="What was demonstrated on real work?" disabled={busy} onSubmit={(checkpoint) => run(() => recordDemonstration(ctx.userName, entry.id, assessor, checkpoint), "Demonstration recorded.")} /></>}
          {stage === "Demonstrated" && <><ReasonButton label="Add coaching note" title="Coaching evidence" placeholder="What did live work show?" disabled={busy} onSubmit={(text) => run(() => addCoaching(ctx.userName, entry.id, text), "Coaching recorded.")} />
            <Button size="sm" disabled={busy} onClick={() => void run(() => markSustained(ctx.userName, entry.id), "Marked as sustained.")}>Mark sustained</Button></>}</div>}</Panel>; })}
      {!data.adoption.length && <EmptyState icon={BookOpen}>No workflows assigned for training yet.</EmptyState>}</div>
    <FormDialog open={creating} onOpenChange={setCreating} title="Assign a workflow" description="Pick the person and the workflow code they must learn and demonstrate.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await run(() => assignTraining(ctx.userName, form.person, form.code), "Workflow assigned."); if (result) { setCreating(false); setForm({ ...form, person: "" }); } }}>
        <Field label="Person"><Input required value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} /></Field>
        <Field label="Workflow"><Choice label="Workflow" value={form.code} onChange={(v) => setForm({ ...form, code: v })} options={WORKFLOW_CATALOG.map((c): [string, string] => [c.code, c.code + " · " + c.name])} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Assign</Button></div></form></FormDialog></div>;
}

function Changes({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [creating, setCreating] = useState(false); const [form, setForm] = useState({ code: "SAL-04", summary: "", date: new Date().toISOString().slice(0, 10) }); const manage = ctx.can("operate", "manage");
  const areas: [ReviewArea, string][] = [["sop", "SOP document"], ["cybersquad", "CyberSquad behaviour"], ["academy", "Academy lesson"]];
  return <div className="space-y-6"><SectionHeader title="SOP changes" description="A changed workflow stays open until the SOP, CyberSquad and the Academy lesson have each been reviewed against it." action={manage ? <Button onClick={() => setCreating(true)}>Propose a change</Button> : undefined} />
    <div className="space-y-4">{[...data.sop].reverse().map((entry) => { const aligned = sopAligned(entry);
      return <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code={entry.code} /><span className="text-xs text-muted-foreground">version {entry.version} · effective {entry.effectiveDate} · owner {entry.owner}</span></div><h3 className="font-semibold">{entry.summary}</h3></div>
        <Pill tone={aligned ? "good" : Date.parse(entry.effectiveDate + "T00:00:00") <= Date.now() ? "bad" : "warn"}>{aligned ? "Aligned" : "Awaiting alignment"}</Pill></div>
        <div className="flex flex-wrap gap-2">{areas.map(([area, label]) => entry.reviews[area] ? <Pill key={area} tone="good">{label} reviewed by {entry.reviews[area]!.by}</Pill>
          : manage ? <Button key={area} size="sm" variant="outline" disabled={busy} onClick={() => void run(() => confirmReview(ctx.userName, entry.id, area), label + " review confirmed.")}>Confirm {label.toLowerCase()} reviewed</Button> : <Pill key={area} tone="warn">{label}: pending</Pill>)}</div>
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History</summary><div className="pt-4"><Timeline events={entry.history} /></div></details></Panel>; })}
      {!data.sop.length && <EmptyState icon={BookOpen}>No SOP changes recorded.</EmptyState>}</div>
    <FormDialog open={creating} onOpenChange={setCreating} title="Propose an SOP change" description="Record what is changing and when it takes effect.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await run(() => proposeSopChange(ctx.userName, form.code, form.summary, form.date), "Change recorded."); if (result) { setCreating(false); setForm({ ...form, summary: "" }); } }}>
        <Field label="Workflow"><Choice label="Workflow" value={form.code} onChange={(v) => setForm({ ...form, code: v })} options={WORKFLOW_CATALOG.map((c): [string, string] => [c.code, c.code + " · " + c.name])} /></Field>
        <Field label="What is changing"><Input required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
        <Field label="Effective date"><Input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Record change</Button></div></form></FormDialog></div>;
}

export default function LibraryBoard({ ctx }: { ctx: OpsContext }) {
  const [tab, setTab] = useState("coverage");
  return <section className="space-y-6"><Tabbed value={tab} onChange={setTab} tabs={[["coverage", "Workflow library"], ["adoption", "SOP adoption"], ["changes", "SOP changes"]]} />
    {tab === "coverage" && <Coverage />}{tab === "adoption" && <Adoption ctx={ctx} />}{tab === "changes" && <Changes ctx={ctx} />}</section>;
}
