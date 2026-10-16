import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/hooks/useApi";
import { fetchPosCatalog } from "@/pos/lib/catalog";
import {
  QUARANTINE_REASONS, VARIANCE_CAUSES, classifyVariance, closeReservation, decideVariance, demandSignals, quarantineUnit, recordCounted, reservationLive, reservedQty, reserveStock, resolveQuarantine, soldSerials,
  startCount, submitCount, traceSerial, type QuarantineItem, type StockCount, type VarianceCause,
} from "./inventoryOps";
import { lowStockSuggestions, requestReplenishment } from "./procurement";
import { Choice, CodeTag, EmptyState, errorMessage, Facts, Field, FormDialog, money, Panel, Pill, ReasonButton, SectionHeader, Stat, Tabbed, useRun, type OpsContext } from "./shared";

function Count({ count, ctx }: { count: StockCount; ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const [values, setValues] = useState<string[]>(count.lines.map((line) => (line.countedQty === undefined ? "" : String(line.countedQty))));
  const counting = count.status === "counting";
  return <Panel><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="INV-08" /><span className="text-xs text-muted-foreground">{count.number} · {count.location} · started by {count.startedBy}</span></div></div>
    <Pill tone={counting ? "info" : "good"}>{counting ? "Counting" : "Submitted"}</Pill></div>
    <p className="text-xs text-muted-foreground">Counting records what is on the shelf. It never changes the stock ledger; any difference becomes a variance for review.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Product</th><th className="pr-4">System</th><th className="pr-4">Counted</th><th>Difference</th></tr></thead><tbody>
      {count.lines.map((line, index) => { const diff = line.countedQty === undefined ? undefined : line.countedQty - line.systemQty;
        return <tr key={index} className="border-t border-border"><td className="py-2 pr-4">{line.product}</td><td className="pr-4 tabular-nums">{line.systemQty}</td>
          <td className="pr-4">{counting ? <div className="flex gap-2"><Input aria-label={"Counted " + line.product} className="w-24" type="number" min="0" value={values[index]} onChange={(e) => setValues(values.map((v, i) => (i === index ? e.target.value : v)))} />
            <Button size="sm" variant="outline" disabled={busy || values[index] === ""} onClick={() => void run(() => recordCounted(ctx.userName, count.id, index, Number(values[index])), "Count saved.")}>Save</Button></div> : <span className="tabular-nums">{line.countedQty}</span>}</td>
          <td className={"tabular-nums " + (diff ? "font-medium text-error" : "")}>{diff === undefined ? "—" : diff > 0 ? "+" + diff : diff}</td></tr>; })}</tbody></table></div>
    {counting && <div className="flex justify-end"><Button disabled={busy} onClick={() => void run(() => submitCount(ctx.userName, count.id), "Count submitted. Any differences are now variances.")}>Submit count</Button></div>}</Panel>;
}

function Counts({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { api } = useApi(); const { busy, run } = useRun(ctx.reload); const [creating, setCreating] = useState(false); const [form, setForm] = useState({ location: "Shop floor", lines: "" });
  const [cause, setCause] = useState<Record<string, { cause: string; who: string; evidence: string }>>({});
  const manager = ctx.can("manage"); const open = data.variances.filter((entry) => ["open", "ready", "awaiting_approval"].includes(entry.status));
  const loadCatalog = async () => { try { const items = await fetchPosCatalog(api); setForm((current) => ({ ...current, lines: items.slice(0, 50).map((item) => [item.name, item.quantity, item.price].join(", ")).join("\n") })); } catch { toast.error("Could not load products from Odoo. Type them in instead."); } };
  return <div className="space-y-6">
    <SectionHeader title="Stock counts" description="Count first, then review differences. Nothing is adjusted automatically." action={ctx.can("inventory", "manage") ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Start count</Button> : undefined} />
    <div className="space-y-4">{[...data.counts].reverse().map((count) => <Count key={count.id + count.history.length} count={count} ctx={ctx} />)}{!data.counts.length && <EmptyState icon={Boxes}>No counts yet.</EmptyState>}</div>
    <SectionHeader title={"Variances to review (" + open.length + ")"} description={"Classify the cause and who is responsible. Differences worth more than " + money(data.policy.varianceApprovalValue) + " need a manager who did not classify them."} />
    <div className="space-y-4">{open.map((entry) => { const draft = cause[entry.id] ?? { cause: "counting_error", who: "", evidence: "" };
      return <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="INV-09" /><span className="text-xs text-muted-foreground">{entry.number} · {entry.countNumber}</span></div>
        <h3 className="font-semibold">{entry.product}: {entry.variance > 0 ? "+" : ""}{entry.variance} units · {money(entry.value)}</h3></div><Pill tone={entry.status === "awaiting_approval" ? "bad" : entry.status === "ready" ? "info" : "warn"}>{entry.status.replace("_", " ")}</Pill></div>
        {entry.cause && <p className="text-sm text-muted-foreground">{VARIANCE_CAUSES[entry.cause]} · {entry.responsibility} · {entry.evidence}</p>}
        {entry.status !== "awaiting_approval" && <div className="grid gap-4 sm:grid-cols-4"><Choice label="Cause" value={draft.cause} onChange={(v) => setCause({ ...cause, [entry.id]: { ...draft, cause: v } })} options={Object.entries(VARIANCE_CAUSES) as [string, string][]} />
          <Input aria-label="Responsible" placeholder="Who is responsible" value={draft.who} onChange={(e) => setCause({ ...cause, [entry.id]: { ...draft, who: e.target.value } })} /><Input aria-label="Evidence" placeholder="Evidence" value={draft.evidence} onChange={(e) => setCause({ ...cause, [entry.id]: { ...draft, evidence: e.target.value } })} />
          <Button variant="outline" disabled={busy} onClick={() => void run(() => classifyVariance(ctx.userName, entry.id, draft.cause as VarianceCause, draft.who, draft.evidence, data.policy), "Variance classified.")}>Classify</Button></div>}
        {entry.cause && ctx.can("inventory", "manage") && <div className="flex flex-wrap gap-2"><ReasonButton label="Approve adjustment" variant="default" title="Approve stock adjustment" description="This records an adjustment to apply in Odoo. It does not edit stock here." placeholder="Basis for the adjustment" disabled={busy}
          onSubmit={(reason) => run(() => decideVariance(ctx.userName, entry.id, "approved", reason, manager), "Adjustment approved.")} /><ReasonButton label="Reject" title="Reject adjustment" placeholder="Why no adjustment?" disabled={busy} onSubmit={(reason) => run(() => decideVariance(ctx.userName, entry.id, "rejected", reason, manager), "Variance rejected.")} /></div>}</Panel>; })}
      {!open.length && <EmptyState icon={Boxes}>No variances waiting.</EmptyState>}</div>
    <FormDialog open={creating} onOpenChange={setCreating} title="Start a stock count" description="List what will be counted with the system quantity. You can load products from Odoo.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const lines = form.lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [product, qty, value] = line.split(/[,;\t]/).map((part) => part.trim()); return { product, systemQty: Number(qty), unitValue: Number(value || 0) }; });
        if (lines.some((line) => !line.product || !Number.isFinite(line.systemQty))) { toast.error("Each line needs a product and the system quantity."); return; }
        const result = await run(() => startCount(ctx.userName, form.location, lines), "Count started."); if (result) setCreating(false); }}>
        <Field label="Location"><Input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Products" hint="One per line: product, system quantity, unit value"><Textarea required rows={6} value={form.lines} onChange={(e) => setForm({ ...form, lines: e.target.value })} /></Field>
        <div className="flex justify-between gap-2"><Button type="button" variant="outline" onClick={() => void loadCatalog()}>Load from Odoo</Button><div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Start count</Button></div></div></form></FormDialog>
  </div>;
}

function Quarantine({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [form, setForm] = useState({ product: "", qty: "1", serial: "", reason: "faulty", source: "", next: "" }); const allow = ctx.can("inventory", "manage");
  const outcomes: [QuarantineItem["status"], string][] = [["released", "Release to stock"], ["sent_to_repair", "Send to repair"], ["supplier_returned", "Return to supplier"], ["written_off", "Write off"]];
  return <div className="space-y-6"><SectionHeader title="Quarantine" description="Damaged, faulty or returned units sit here, out of sellable stock, with a reason and a next action." />
    {allow && <Panel><h3 className="font-semibold">Move a unit into quarantine</h3><div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Product" placeholder="Product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /><Input aria-label="Quantity" type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
      <Input aria-label="Serial or IMEI" placeholder="Serial / IMEI" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /><Choice label="Reason" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} options={Object.entries(QUARANTINE_REASONS) as [string, string][]} />
      <Input aria-label="Where it came from" placeholder="Where it came from" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /><div className="sm:col-span-2"><Input aria-label="Next action" placeholder="Next action" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></div>
      <Button disabled={busy} onClick={() => void run(() => quarantineUnit(ctx.userName, { product: form.product, qty: Number(form.qty), serial: form.serial, reason: form.reason as QuarantineItem["reason"], source: form.source, nextAction: form.next }), "Moved to quarantine.")}>Quarantine</Button></div></Panel>}
    <div className="space-y-4">{[...data.quarantine].reverse().map((entry) => <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="INV-10" /><span className="text-xs text-muted-foreground">{entry.number} · {QUARANTINE_REASONS[entry.reason]}</span></div>
      <h3 className="font-semibold">{entry.product} × {entry.qty}{entry.serial ? " · " + entry.serial : ""}</h3><p className="text-sm text-muted-foreground">Next: {entry.nextAction}{entry.source ? " · from " + entry.source : ""}</p></div>
      <Pill tone={entry.status === "quarantined" ? "warn" : "neutral"}>{entry.status.replace("_", " ")}</Pill></div>
      {entry.status === "quarantined" && allow && <div className="flex flex-wrap gap-2">{outcomes.map(([status, label]) => <ReasonButton key={status} label={label} title={label} placeholder="Inspection result or decision" disabled={busy} onSubmit={(reason) => run(() => resolveQuarantine(ctx.userName, entry.id, status as "released", reason), label + " recorded.")} />)}</div>}</Panel>)}
      {!data.quarantine.length && <EmptyState icon={Boxes}>Nothing in quarantine.</EmptyState>}</div></div>;
}

function Reservations({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [form, setForm] = useState({ product: "", qty: "1", serial: "", customerName: "", reference: "" }); const allow = ctx.can("sell", "inventory", "manage");
  const sold = soldSerials(data.sales, data.refunds);
  return <div className="space-y-6"><SectionHeader title="Reservations" description={"Set stock aside for a customer so it cannot be double-sold. Holds expire after " + data.policy.reservationHours + " hours."} />
    {allow && <Panel><div className="grid gap-4 sm:grid-cols-5"><Input aria-label="Product" placeholder="Product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /><Input aria-label="Quantity" type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
      <Input aria-label="Serial or IMEI" placeholder="Serial / IMEI" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /><Input aria-label="Customer" placeholder="Customer" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
      <Input aria-label="Order reference" placeholder="Order reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
      <Button disabled={busy} onClick={() => void run(() => reserveStock(ctx.userName, { product: form.product, qty: Number(form.qty), serial: form.serial, customerName: form.customerName, reference: form.reference }, sold, data.quarantine, data.policy), "Stock reserved.")}>Reserve</Button></div></Panel>}
    <div className="space-y-4">{[...data.reservations].reverse().map((entry) => { const live = reservationLive(entry); const expired = entry.status === "active" && !live;
      return <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="INV-04" /><span className="text-xs text-muted-foreground">{entry.number}{entry.reference ? " · " + entry.reference : ""}</span></div>
        <h3 className="font-semibold">{entry.product} × {entry.qty}{entry.serial ? " · " + entry.serial : ""}</h3><p className="text-sm text-muted-foreground">For {entry.customerName} · {expired ? "expired " : "until "}{new Date(entry.expiresAt).toLocaleString()} · {reservedQty(data.reservations, entry.product)} of this product currently held</p></div>
        <Pill tone={expired ? "bad" : live ? "info" : "neutral"}>{expired ? "Expired" : entry.status}</Pill></div>
        {entry.status === "active" && allow && <div className="flex gap-2"><ReasonButton label="Release" title="Release this reservation" placeholder="Why is it released?" disabled={busy} onSubmit={(reason) => run(() => closeReservation(ctx.userName, entry.id, "released", reason), "Released.")} />
          <ReasonButton label="Converted to sale" variant="default" title="Mark as sold" placeholder="Sale number" disabled={busy} onSubmit={(reason) => run(() => closeReservation(ctx.userName, entry.id, "converted", reason), "Marked as converted.")} /></div>}</Panel>; })}
      {!data.reservations.length && <EmptyState icon={Boxes}>No reservations.</EmptyState>}</div></div>;
}

function SerialTrace({ ctx }: { ctx: OpsContext }) {
  const [query, setQuery] = useState(""); const { data } = ctx;
  const hits = traceSerial(query, { sales: data.sales, reservations: data.reservations, quarantine: data.quarantine, returns: data.returns, sourcing: data.sourcing, jobs: data.jobs });
  return <div className="space-y-4"><SectionHeader title="Serial and IMEI trace" description="See everywhere one serial appears, so a duplicate or wrong assignment is obvious before it becomes a sale." />
    <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Serial or IMEI" className="pl-10" placeholder="Enter a serial or IMEI" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
    {query.trim() && <div className="space-y-2">{hits.map((hit, index) => <div key={index} className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 text-sm"><Pill tone="info">{hit.where}</Pill><span className="font-medium">{hit.ref}</span><span className="text-muted-foreground">{hit.detail}</span></div>)}
      {!hits.length && <EmptyState icon={Search}>This serial is not on any record.</EmptyState>}{hits.length > 1 && <p className="text-sm text-warning">This serial appears in {hits.length} places. Check it has not been assigned twice.</p>}</div>}</div>;
}

function Signals({ ctx }: { ctx: OpsContext }) {
  const { api } = useApi(); const { busy, run } = useRun(ctx.reload); const [items, setItems] = useState<{ product: string; quantity: number }[] | null>(null);
  const load = async () => { try { const catalog = await fetchPosCatalog(api); setItems(catalog.map((item) => ({ product: item.name, quantity: item.quantity }))); } catch (error) { toast.error(errorMessage(error, "Could not read stock from Odoo.")); } };
  const low = items ? lowStockSuggestions(items, ctx.data.replenishments, ctx.data.policy.lowStockThreshold) : [];
  const demand = demandSignals(ctx.data.sourcing);
  return <div className="space-y-6"><SectionHeader title="Stock signals" description={"Items at or below " + ctx.data.policy.lowStockThreshold + " units and items customers keep asking for. These only suggest; Procurement decides."} action={<Button variant="outline" onClick={() => void load()}>Check stock levels</Button>} />
    <Facts items={[["Products checked", items ? items.length : "Not checked"], ["Low stock", items ? low.length : "—"], ["Repeated demand", demand.length]]} />
    {low.slice(0, 20).map((entry) => <Panel key={entry.product}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm"><span className="font-medium">{entry.product}</span> · {entry.quantity} left</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestReplenishment(ctx.userName, { product: entry.product, quantity: 5, reason: "low_stock", note: entry.quantity + " left" }), "Added to Procurement's decision queue.")}>Send for decision</Button></div></Panel>)}
    {demand.map((entry) => <Panel key={entry.product}><span className="text-sm"><span className="font-medium">{entry.product}</span> · asked for {entry.count} times in 30 days and not in the shop</span></Panel>)}</div>;
}

export default function InventoryBoard({ ctx }: { ctx: OpsContext }) {
  const [tab, setTab] = useState("counts"); const { data } = ctx;
  return <section className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Open variances" value={data.variances.filter((v) => ["open", "ready", "awaiting_approval"].includes(v.status)).length} tone="warn" /><Stat label="In quarantine" value={data.quarantine.filter((q) => q.status === "quarantined").length} />
      <Stat label="Active reservations" value={data.reservations.filter((r) => reservationLive(r)).length} /><Stat label="Counts in progress" value={data.counts.filter((c) => c.status === "counting").length} /></div>
    <Tabbed value={tab} onChange={setTab} tabs={[["counts", "Counts and variances"], ["quarantine", "Quarantine"], ["reservations", "Reservations"], ["serial", "Serial trace"], ["signals", "Stock signals"]]} />
    {tab === "counts" && <Counts ctx={ctx} />}{tab === "quarantine" && <Quarantine ctx={ctx} />}{tab === "reservations" && <Reservations ctx={ctx} />}{tab === "serial" && <SerialTrace ctx={ctx} />}{tab === "signals" && <Signals ctx={ctx} />}
  </section>;
}
