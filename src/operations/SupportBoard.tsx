import { useState } from "react";
import { Headset, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SaleCustomer } from "@/pos/lib/devices";
import CustomerPicker from "./CustomerPicker";
import { SEVERITY_LABELS, complaintStatus, createComplaint, decideRecovery, logCustomerUpdate, requestRecovery, resolveComplaint, routeComplaint, setSeverity, type Complaint, type Severity } from "./support";
import { Choice, CodeTag, EmptyState, Facts, Field, FormDialog, money, num, Panel, Pill, ReasonButton, SectionHeader, Step, Timeline, useRun, type OpsContext } from "./shared";

const TEAMS = ["Repairs", "Inventory", "Logistics", "Procurement", "Finance", "Sales", "Management"];
const CHANNELS: [string, string][] = [["call", "Call"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"], ["visit", "In person"]];
const tone: Record<Severity, "neutral" | "info" | "warn" | "bad"> = { low: "neutral", medium: "info", high: "warn", urgent: "bad" };

function Case({ item, ctx }: { item: Complaint; ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const { policy } = ctx.data; const status = complaintStatus(item); const overdue = !item.resolution && Date.parse(item.nextUpdateDueAt) < Date.now(); const manager = ctx.can("manage");
  const [route, setRoute] = useState({ team: "Repairs", person: "" }); const [update, setUpdate] = useState({ channel: "call", note: "" }); const [recovery, setRecovery] = useState({ action: "", value: "" }); const [outcome, setOutcome] = useState("");
  return <Panel>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code="CX-01" /><span className="text-xs text-muted-foreground">{item.number} · {item.link.kind === "other" ? "General" : item.link.kind + " " + item.link.ref}</span></div>
        <h3 className="font-semibold">{item.issue}</h3><p className="text-sm text-muted-foreground">{item.customerName} · {item.customerPhone}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={tone[item.severity]}>{SEVERITY_LABELS[item.severity]}</Pill><Pill tone={overdue ? "bad" : item.resolution ? "good" : "info"}>{status.label}</Pill></div>
    </div>
    <Facts items={[["Customer-facing owner", item.cxOwner], ["Fix owner", item.fixOwner ? item.fixOwner.team + (item.fixOwner.person ? " · " + item.fixOwner.person : "") : "Not routed"], ["Next customer update due", item.resolution ? "—" : new Date(item.nextUpdateDueAt).toLocaleString()], ["Last update", item.lastUpdateAt ? new Date(item.lastUpdateAt).toLocaleString() : "None yet"]]} />
    {overdue && <p className="rounded-md bg-error/10 p-4 text-sm text-error">The customer has not been updated within the {item.severity} standard. Update them now.</p>}
    {item.recovery && <p className="text-sm text-muted-foreground">Service recovery: {item.recovery.action} · {money(item.recovery.value)} · {item.recovery.status}{item.recovery.note ? " · " + item.recovery.note : ""}</p>}
    {item.resolution && <p className="text-sm text-muted-foreground">Resolved by {item.resolution.by}: {item.resolution.outcome}</p>}
    {item.updates.length > 0 && <ul className="space-y-1 border-l-2 border-border pl-4 text-sm">{item.updates.map((entry, index) => <li key={index}>{new Date(entry.at).toLocaleString()} · {entry.channel} · {entry.by}: {entry.note}</li>)}</ul>}
    {!item.resolution && <div className="space-y-4">
      <Step title="Tell the customer"><div className="grid gap-4 sm:grid-cols-4"><Choice label="Channel" value={update.channel} onChange={(v) => setUpdate({ ...update, channel: v })} options={CHANNELS} /><div className="sm:col-span-2"><Input aria-label="What the customer was told" placeholder="What the customer was told" value={update.note} onChange={(e) => setUpdate({ ...update, note: e.target.value })} /></div>
        <Button disabled={busy} onClick={() => void run(() => logCustomerUpdate(ctx.userName, item.id, update.channel, update.note, policy), "Update logged. The clock restarts.").then(() => setUpdate({ ...update, note: "" }))}>Log update</Button></div></Step>
      <Step title="Who fixes it"><div className="grid gap-4 sm:grid-cols-4"><Choice label="Team" value={route.team} onChange={(v) => setRoute({ ...route, team: v })} options={TEAMS.map((t): [string, string] => [t, t])} /><Input aria-label="Person" placeholder="Person (optional)" value={route.person} onChange={(e) => setRoute({ ...route, person: e.target.value })} />
        <Button variant="outline" disabled={busy} onClick={() => void run(() => routeComplaint(ctx.userName, item.id, route.team, route.person), "Routed. CX still owns the customer.")}>Route</Button>
        <ReasonButton label="Change priority" title="Change priority" placeholder="Why is the priority changing?" disabled={busy} onSubmit={async (reason) => { const next: Severity = item.severity === "urgent" ? "high" : item.severity === "high" ? "urgent" : item.severity === "medium" ? "high" : "medium"; await run(() => setSeverity(ctx.userName, item.id, next, reason, policy), "Priority changed to " + next + "."); }} /></div></Step>
      {(!item.recovery || item.recovery.status === "rejected") && <Step title="Service recovery (optional)"><div className="grid gap-4 sm:grid-cols-4"><div className="sm:col-span-2"><Input aria-label="Gesture" placeholder="Gesture, e.g. free delivery voucher" value={recovery.action} onChange={(e) => setRecovery({ ...recovery, action: e.target.value })} /></div>
        <Input aria-label="Value" type="number" min="0" placeholder="Value" value={recovery.value} onChange={(e) => setRecovery({ ...recovery, value: e.target.value })} /><Button variant="outline" disabled={busy} onClick={() => void run(() => requestRecovery(ctx.userName, item.id, recovery.action, num(recovery.value || "0"), policy), "Recovery recorded.")}>Record</Button></div>
        <p className="text-xs text-muted-foreground">Above {money(policy.recoveryApprovalLimit)} a manager must approve it.</p></Step>}
      {item.recovery?.status === "pending" && manager && <div className="flex gap-2"><ReasonButton label="Approve recovery" variant="default" title="Approve service recovery" placeholder="Reason" disabled={busy} onSubmit={(reason) => run(() => decideRecovery(ctx.userName, item.id, "approved", reason, manager), "Recovery approved.")} />
        <ReasonButton label="Reject" title="Reject service recovery" placeholder="Reason" disabled={busy} onSubmit={(reason) => run(() => decideRecovery(ctx.userName, item.id, "rejected", reason, manager), "Recovery rejected.")} /></div>}
      <Step title="Resolve"><p className="text-xs text-muted-foreground">Close only when the problem is actually fixed and the customer has been told, not when it has merely been passed on.</p>
        <div className="flex flex-wrap gap-2"><Input aria-label="Resolution" className="w-96" placeholder="What was done to resolve it" value={outcome} onChange={(e) => setOutcome(e.target.value)} /><Button disabled={busy} onClick={() => void run(() => resolveComplaint(ctx.userName, item.id, outcome), "Complaint resolved.")}>Resolve</Button></div></Step>
    </div>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History ({item.history.length})</summary><div className="pt-4"><Timeline events={item.history} /></div></details>
  </Panel>;
}

export default function SupportBoard({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [view, setView] = useState("open"); const [creating, setCreating] = useState(false); const [customer, setCustomer] = useState<SaleCustomer>();
  const [form, setForm] = useState({ kind: "sale", ref: "", issue: "", severity: "medium" });
  const sorted = [...data.complaints].filter((entry) => view === "all" || (view === "open") === !entry.resolution)
    .sort((a, b) => Number(Date.parse(a.nextUpdateDueAt) < Date.now()) * -1 - Number(Date.parse(b.nextUpdateDueAt) < Date.now()) * -1 || Date.parse(a.nextUpdateDueAt) - Date.parse(b.nextUpdateDueAt));
  return <section className="space-y-6">
    <SectionHeader title="Customer support" description="One record per complaint. CX keeps the customer; a fix owner does the work; silence shows up as an overdue update." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Log complaint</Button>} />
    <div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["open", "Open (" + data.complaints.filter((c) => !c.resolution).length + ")"], ["resolved", "Resolved"], ["all", "All"]]} /></div>
    <div className="space-y-4 motion-stagger">{sorted.map((item) => <Case key={item.id + item.history.length} item={item} ctx={ctx} />)}</div>{!sorted.length && <EmptyState icon={Headset}>No complaints here.</EmptyState>}
    <FormDialog open={creating} onOpenChange={setCreating} title="Log a complaint" description="Capture it once, in the customer's words. Link the sale, repair or order it is about.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault();
        const result = await run(() => createComplaint(ctx.userName, { customerName: customer?.name ?? "", customerPhone: customer?.phone ?? "", link: { kind: form.kind as "sale", ref: form.ref }, issue: form.issue, severity: form.severity as Severity }, data.policy), "Complaint logged.");
        if (result) { setCreating(false); setForm({ ...form, ref: "", issue: "" }); setCustomer(undefined); } }}>
        <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="About"><Choice label="About" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[["sale", "A sale"], ["repair", "A repair"], ["order", "An order"], ["other", "Something else"]]} /></Field>
          <Field label="Reference"><Input disabled={form.kind === "other"} placeholder="Sale, job or order number" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} /></Field></div>
        <Field label="The issue, in the customer's words"><Textarea required rows={3} value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} /></Field>
        <Field label="Severity" hint={"Next update due in " + { urgent: data.policy.updateUrgentHours, high: data.policy.updateHighHours, medium: data.policy.updateMediumHours, low: data.policy.updateLowHours }[form.severity as Severity] + " hours"}>
          <Choice label="Severity" value={form.severity} onChange={(v) => setForm({ ...form, severity: v })} options={Object.entries(SEVERITY_LABELS) as [string, string][]} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Log complaint</Button></div>
      </form></FormDialog>
  </section>;
}
