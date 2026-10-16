import { useState } from "react";
import { toast } from "sonner";
import { Eye, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FAILURE_REASONS, JOB_TYPE_LABELS, RETURN_OUTCOMES, assignJob, cancelJob, createJob, deliverJob, explainShortfall, jobIsClosed, jobState, logisticsPerformance, markInTransit, partnerCharges, pickUp, postPartnerBill,
  receiveFailedReturn, recordCustodyChange, recordFailure, recordRemittance, retryDelivery, revealPickupCode, setDeliveryFee, type JobInput, type JobType, type LogisticsJob, type PaymentMode,
} from "./logistics";
import { Choice, CodeTag, EmptyState, Facts, Field, FormDialog, money, num, Panel, Pill, ReasonButton, SectionHeader, Stat, Step, Tabbed, Timeline, useRun, type OpsContext } from "./shared";

const STATUS_TONE = { requested: "neutral", assigned: "info", picked_up: "info", in_transit: "info", delivered: "good", failed: "bad", returned: "warn", cancelled: "neutral" } as const;
const PAYMENT: [string, string][] = [["prepaid", "Prepaid (verified)"], ["cod", "Full cash on delivery"], ["part_cod", "Part payment + COD"]];

function JobCard({ job, ctx }: { job: LogisticsJob; ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const move = ctx.can("logistics", "manage"); const money_ = ctx.can("finance", "manage"); const codeAccess = ctx.can("logistics", "procure", "manage");
  const state = jobState(job); const [partner, setPartner] = useState(job.partner); const [eta, setEta] = useState(""); const [code, setCode] = useState(""); const [serial, setSerial] = useState(""); const [shownCode, setShownCode] = useState("");
  const [pod, setPod] = useState({ recipient: "", evidence: "", collected: "" }); const [fail, setFail] = useState({ reason: "", next: "retry" }); const [outcome, setOutcome] = useState("reserved"); const [custody, setCustody] = useState({ to: "", note: "" });
  const [remit, setRemit] = useState({ reference: "", received: "" }); const [note, setNote] = useState(""); const [fee, setFee] = useState({ payer: job.fee?.payer ?? "customer", charged: String(job.fee?.charged ?? ""), cost: String(job.fee?.cost ?? "") });
  const inFlight = ["picked_up", "in_transit"].includes(job.status); const closed = jobIsClosed(job);
  return <Panel>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code={job.type === "direct_to_customer" ? "LOG-07" : job.type === "supplier_to_store" ? "LOG-05" : "LOG-06"} /><span className="text-xs text-muted-foreground">{job.number} · {JOB_TYPE_LABELS[job.type]} · {job.source.label}</span></div>
        <h3 className="font-semibold">{job.item}{job.serial ? " · " + job.serial : ""}</h3>{job.customerName && <p className="text-sm text-muted-foreground">{job.customerName} · {job.contact} · {job.address}</p>}</div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={STATUS_TONE[job.status]}>{state.label}</Pill>{job.payment.codBalance > 0 && <Pill tone="warn">COD {money(job.payment.codBalance)}</Pill>}</div>
    </div>
    <Facts items={[["Owner", state.owner], ["Waiting on", state.waitingOn], ["Next action", state.next], ["Current custodian", job.custodian + (job.etaAt ? " · ETA " + new Date(job.etaAt).toLocaleString() : "")]]} />
    {job.payment.orderValue > 0 && <p className="text-sm text-muted-foreground">Order {money(job.payment.orderValue)} · paid up front {money(job.payment.prepaid)} · to collect {money(job.payment.codBalance)}{job.financeVia === "sale" ? " · money settles through the POS sale and Finance COD settlements" : ""}</p>}
    {job.pod && <p className="text-sm text-muted-foreground">Delivered to {job.pod.recipient} · {job.pod.evidence}{job.payment.codBalance > 0 ? " · collected " + money(job.pod.collected) : ""}. Delivery completes the shipment, not the payment.</p>}
    {!closed && move && <div className="space-y-4">
      {["requested", "assigned"].includes(job.status) && <Step title="Assign and collect">
        <div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Partner or rider" placeholder="Partner or rider" value={partner} onChange={(e) => setPartner(e.target.value)} /><Input aria-label="ETA" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
          <Button variant="outline" disabled={busy} onClick={() => void run(() => assignJob(ctx.userName, job.id, partner, eta ? new Date(eta).toISOString() : undefined), "Assigned.")}>Assign</Button></div>
        {job.pickupCode && codeAccess && <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={async () => { try { setShownCode(await revealPickupCode(ctx.userName, job.id)); await ctx.reload(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not show the code."); } }}><Eye className="h-4 w-4" aria-hidden="true" />Show pickup code (logged)</Button>{shownCode && <span className="rounded-md bg-secondary px-2 py-1 font-mono text-sm tabular-nums">{shownCode}</span>}</div>}
        <div className="grid gap-4 sm:grid-cols-4">{job.pickupCode && <Input aria-label="Pickup code" placeholder="Pickup code from supplier" value={code} onChange={(e) => setCode(e.target.value)} />}<Input aria-label="Serial or IMEI" placeholder="Serial / IMEI at pickup" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <Button disabled={busy} onClick={() => void run(() => pickUp(ctx.userName, job.id, code, serial), "Picked up. Custody moved to the carrier.")}>Confirm pickup</Button></div></Step>}
      {job.status === "picked_up" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markInTransit(ctx.userName, job.id), "Marked in transit.")}>Mark in transit</Button>}
      {inFlight && <Step title="Delivery result"><div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Received by" placeholder="Received by" value={pod.recipient} onChange={(e) => setPod({ ...pod, recipient: e.target.value })} />
        <Input aria-label="Evidence" placeholder="Photo, signature or reference" value={pod.evidence} onChange={(e) => setPod({ ...pod, evidence: e.target.value })} />
        {job.payment.codBalance > 0 && <Input aria-label="Cash collected" type="number" min="0" placeholder={"Cash collected (" + job.payment.codBalance + ")"} value={pod.collected} onChange={(e) => setPod({ ...pod, collected: e.target.value })} />}
        <Button disabled={busy} onClick={() => void run(() => deliverJob(ctx.userName, job.id, pod.recipient, pod.evidence, job.payment.codBalance > 0 ? num(pod.collected) : 0), "Proof of delivery recorded.")}>Delivered</Button></div>
        <div className="grid gap-4 sm:grid-cols-4"><Choice label="Why it failed" value={fail.reason} placeholder="Delivery failed? Choose why" onChange={(v) => setFail({ ...fail, reason: v })} options={FAILURE_REASONS.map((r): [string, string] => [r, r])} />
          <Choice label="Next step" value={fail.next} onChange={(v) => setFail({ ...fail, next: v })} options={[["retry", "Retry delivery"], ["return", "Bring it back"]]} />
          <Button variant="outline" disabled={busy || !fail.reason} onClick={() => void run(() => recordFailure(ctx.userName, job.id, fail.reason, fail.next as "retry"), "Failure recorded. Custody stays with the carrier.")}>Delivery failed</Button></div>
        <div className="grid gap-4 sm:grid-cols-4"><Input aria-label="New custodian" placeholder="Handed to (rider or partner)" value={custody.to} onChange={(e) => setCustody({ ...custody, to: e.target.value })} /><Input aria-label="Handover note" placeholder="Note" value={custody.note} onChange={(e) => setCustody({ ...custody, note: e.target.value })} />
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => recordCustodyChange(ctx.userName, job.id, custody.to, custody.note), "Custody updated.")}>Record handover</Button></div></Step>}
      {job.status === "failed" && <Step title="After a failed delivery"><p className="text-sm text-muted-foreground">{job.failures[job.failures.length - 1]?.reason}. The customer must be contacted before a retry or a return.</p>
        <div className="grid gap-4 sm:grid-cols-4"><Input aria-label="New ETA" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} /><Button variant="outline" disabled={busy || !eta} onClick={() => void run(() => retryDelivery(ctx.userName, job.id, new Date(eta).toISOString()), "Retry scheduled.")}>Retry delivery</Button></div>
        <div className="grid gap-4 sm:grid-cols-4"><Choice label="Outcome" value={outcome} onChange={setOutcome} options={Object.entries(RETURN_OUTCOMES) as [string, string][]} />
          <Button disabled={busy} onClick={() => void run(() => receiveFailedReturn(ctx.userName, job.id, outcome as keyof typeof RETURN_OUTCOMES), "Item received back into controlled custody.")}>Receive item back</Button></div></Step>}
      {["requested", "assigned"].includes(job.status) && <div className="flex justify-end"><ReasonButton label="Cancel job" variant="ghost" title="Cancel this job" placeholder="Why is it cancelled?" disabled={busy} onSubmit={(reason) => run(() => cancelJob(ctx.userName, job.id, reason), "Job cancelled.")} /></div>}
    </div>}
    {money_ && job.status !== "cancelled" && <Step title="Finance">
      <div className="grid gap-4 sm:grid-cols-5"><Choice label="Who pays the delivery fee" value={fee.payer} onChange={(v) => setFee({ ...fee, payer: v as "customer" })} options={[["customer", "Customer pays"], ["business", "Cybervilla pays"]]} />
        <Input aria-label="Fee charged" type="number" min="0" placeholder="Charged to customer" value={fee.charged} onChange={(e) => setFee({ ...fee, charged: e.target.value })} /><Input aria-label="Partner cost" type="number" min="0" placeholder="Partner charge" value={fee.cost} onChange={(e) => setFee({ ...fee, cost: e.target.value })} />
        <Button variant="outline" disabled={busy || Boolean(job.fee?.billedRef)} onClick={() => void run(() => setDeliveryFee(ctx.userName, job.id, fee.payer as "customer", num(fee.charged || "0"), num(fee.cost || "0")), "Fee saved.")}>Save fee</Button>
        {job.fee && <span className="self-center text-xs text-muted-foreground">Margin {money(job.fee.charged - job.fee.cost)}{job.fee.billedRef ? " · billed " + job.fee.billedRef : ""}</span>}</div>
      {job.pod && job.payment.codBalance > 0 && job.financeVia === "job" && !job.remittance && <div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Remittance reference" placeholder="Remittance reference" value={remit.reference} onChange={(e) => setRemit({ ...remit, reference: e.target.value })} />
        <Input aria-label="Amount received" type="number" min="0" placeholder={"Received (expected " + job.pod.collected + ")"} value={remit.received} onChange={(e) => setRemit({ ...remit, received: e.target.value })} />
        <Button disabled={busy} onClick={() => void run(() => recordRemittance(ctx.userName, job.id, remit.reference, num(remit.received)), "Remittance recorded.")}>Record remittance</Button></div>}
      {job.remittance && job.remittance.received < job.remittance.expected && !job.remittance.shortNote && <div className="flex flex-wrap gap-2"><Input aria-label="Shortfall explanation" className="w-80" placeholder={"Short by " + money(job.remittance.expected - job.remittance.received) + ". What explains it?"} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => explainShortfall(ctx.userName, job.id, note), "Shortfall explained.")}>Record explanation</Button></div>}
      {job.remittance && <p className="text-sm text-muted-foreground">Remitted {money(job.remittance.received)} of {money(job.remittance.expected)} · {job.remittance.reference}{job.remittance.shortNote ? " · " + job.remittance.shortNote : ""}</p>}</Step>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Custody and history ({job.history.length})</summary><div className="space-y-4 pt-4">
      {job.custody.length > 0 && <ul className="space-y-1 text-sm">{job.custody.map((entry, index) => <li key={index}>{new Date(entry.at).toLocaleString()} · {entry.from} → {entry.to} ({entry.note})</li>)}</ul>}
      {job.codeAccess.length > 0 && <p className="text-xs text-muted-foreground">Pickup code: {job.codeAccess.map((entry) => entry.purpose + " by " + entry.by).join("; ")}</p>}<Timeline events={job.history} /></div></details>
  </Panel>;
}

function Charges({ ctx }: { ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const partners = [...new Set(ctx.data.jobs.map((job) => job.partner))]; const period = new Date().toISOString().slice(0, 7);
  const perf = logisticsPerformance(ctx.data.jobs, 0, Date.now() + 1);
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Failed deliveries" value={perf.failedDeliveries} tone={perf.failedDeliveries ? "warn" : "neutral"} /><Stat label="Custody exceptions" value={perf.custodyExceptions} tone={perf.custodyExceptions ? "bad" : "neutral"} />
      <Stat label="COD outstanding (jobs)" value={money(perf.codOutstandingValue)} note={"oldest " + perf.codOldestDays + " day(s)"} /><Stat label="Direct fulfilment jobs" value={perf.directFulfilment} /></div>
    <div className="space-y-4">{perf.partners.map((entry) => { const charges = partnerCharges(ctx.data.jobs, entry.partner); return <Panel key={entry.partner}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{entry.partner}</h3>
      <span className="text-sm text-muted-foreground">{entry.jobs} jobs · {entry.delivered} delivered · average {entry.averageMinutes} min · failure rate {entry.failureRate}%</span></div>
      {ctx.can("finance", "manage") && <div className="flex flex-wrap items-center gap-4"><span className="text-sm">Unbilled partner charges: <span className="font-medium tabular-nums">{money(charges.total)}</span> across {charges.jobs.length} deliveries</span>
        <Button size="sm" variant="outline" disabled={busy || !charges.jobs.length} onClick={() => void run(() => postPartnerBill(ctx.userName, entry.partner, period), "Partner bill posted to payables.")}>Post bill for {period}</Button></div>}</Panel>; })}
      {!partners.length && <EmptyState icon={Truck}>No jobs yet, so no partner performance to show.</EmptyState>}</div></div>;
}

export default function LogisticsBoard({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [tab, setTab] = useState("jobs"); const [view, setView] = useState("active"); const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: "delivery", sourceKey: "", customerName: "", contact: "", address: "", item: "", serial: "", partner: "Speedaf", eta: "", pickupCode: "", mode: "prepaid", orderValue: "", prepaid: "" });
  const sourceOptions: [string, string][] = [["", "No linked record"], ...data.sales.filter((sale) => !sale.isDemo && sale.lifecycle !== "cancelled").slice(-40).reverse().map((sale): [string, string] => ["sale:" + sale.id, "Sale " + sale.saleNumber + " · " + (sale.customer?.name ?? "walk-in")]),
    ...data.sourcing.filter((entry) => !entry.closed).map((entry): [string, string] => ["sourcing:" + entry.id, "Sourcing " + entry.number + " · " + entry.product]), ...data.pos.filter((po) => !po.cancelled).map((po): [string, string] => ["po:" + po.id, "PO " + po.number + " · " + po.supplierName]),
    ...data.returns.filter((entry) => !entry.closed).map((entry): [string, string] => ["return:" + entry.id, "Return " + entry.number + " · " + entry.item])];
  // One entry of the customer, address and item, inherited from the record being moved, not typed again.
  const pick = (key: string) => {
    const [kind, ref] = key.split(":"); const next = { ...form, sourceKey: key };
    if (kind === "sale") { const sale = data.sales.find((entry) => entry.id === ref); if (sale) { Object.assign(next, { customerName: sale.customer?.name ?? "", contact: sale.customer?.phone ?? "", address: sale.cod?.address ?? form.address, item: sale.lines.map((line) => line.name).join(", "),
      mode: sale.cod ? "cod" : "prepaid", orderValue: String(sale.total), prepaid: "0" }); } }
    if (kind === "sourcing") { const entry = data.sourcing.find((value) => value.id === ref); if (entry) Object.assign(next, { customerName: entry.customer.name, contact: entry.customer.phone, item: entry.product, serial: entry.purchase?.serial ?? "", type: entry.path === "direct" ? "direct_to_customer" : "supplier_to_store" }); }
    if (kind === "return") { const entry = data.returns.find((value) => value.id === ref); if (entry) Object.assign(next, { customerName: entry.customerName, contact: entry.customerPhone, item: entry.item, serial: entry.serial ?? "", type: "customer_return" }); }
    setForm(next);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); const [kind, ref] = form.sourceKey.split(":"); const sale = kind === "sale" ? data.sales.find((entry) => entry.id === ref) : undefined; const mode = form.mode as PaymentMode;
    const source: JobInput["source"] = form.sourceKey ? { kind: kind as "sale", ref, label: sourceOptions.find(([key]) => key === form.sourceKey)?.[1] ?? kind } : { kind: "manual", label: "Manual request" };
    const result = await run(() => createJob(ctx.userName, { type: form.type as JobType, source, customerName: form.customerName, contact: form.contact, address: form.address, item: form.item, serial: form.serial, partner: form.partner,
      etaAt: form.eta ? new Date(form.eta).toISOString() : undefined, pickupCode: form.pickupCode, payment: { mode, orderValue: Number(form.orderValue || 0), prepaid: Number(form.prepaid || 0) }, codViaSale: Boolean(sale?.cod) }), "Logistics job created.");
    if (result) { setCreating(false); setForm({ ...form, sourceKey: "", item: "", serial: "", pickupCode: "" }); }
  };
  const visible = data.jobs.filter((job) => view === "all" || (view === "active") === !jobIsClosed(job)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-6">
    <SectionHeader title="Logistics" description="Pickup, custody and delivery. Delivery completes the shipment; money is settled separately." action={ctx.can("logistics", "sell", "procure", "support", "manage") ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New job</Button> : undefined} />
    <Tabbed value={tab} onChange={setTab} tabs={[["jobs", "Jobs"], ["partners", "Partners and charges"]]} />
    {tab === "jobs" && <><div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["active", "Active (" + data.jobs.filter((job) => !jobIsClosed(job)).length + ")"], ["closed", "Completed"], ["all", "All"]]} /></div>
      <div className="space-y-4 motion-stagger">{visible.map((job) => <JobCard key={job.id + job.history.length} job={job} ctx={ctx} />)}</div>{!visible.length && <EmptyState icon={Truck}>No logistics jobs here.</EmptyState>}</>}
    {tab === "partners" && <Charges ctx={ctx} />}
    <FormDialog open={creating} onOpenChange={setCreating} title="New logistics job" description="Pick the linked record and its customer, address and item come with it.">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Linked record"><Choice label="Linked record" value={form.sourceKey} onChange={pick} options={sourceOptions} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Type"><Choice label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={Object.entries(JOB_TYPE_LABELS) as [string, string][]} /></Field><Field label="Carrier"><Input required value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })} /></Field></div>
        <Field label="Item"><Input required value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Customer"><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field><Field label="Phone"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field></div>
        <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Serial or IMEI"><Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></Field><Field label="Pickup code (if the supplier gave one)"><Input value={form.pickupCode} onChange={(e) => setForm({ ...form, pickupCode: e.target.value })} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Payment"><Choice label="Payment" value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} options={PAYMENT} /></Field>
          <Field label="Order value"><Input type="number" min="0" value={form.orderValue} onChange={(e) => setForm({ ...form, orderValue: e.target.value })} /></Field><Field label="Paid already"><Input type="number" min="0" value={form.prepaid} onChange={(e) => setForm({ ...form, prepaid: e.target.value })} /></Field></div>
        <Field label="ETA"><Input type="datetime-local" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Create job</Button></div>
      </form></FormDialog>
  </section>;
}
