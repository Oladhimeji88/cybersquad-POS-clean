import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCREPANCY_LABELS, acknowledgePO, addPrice, addSupplier, cancelPO, createPO, createSupplierReturn, currentPrice, decideReplenishment, markReturnShipped, orderFromReplenishment, parsePriceList, poStatus, poValue,
  raiseDiscrepancy, receivePO, recordSupplierChange, requestReplenishment, resolveDiscrepancy, returnedQty, reviewPriceChange, setSupplierStatus, settleSupplierCredit, type DiscrepancyKind, type PoChannel, type PurchaseOrder,
} from "./procurement";
import { demandSignals } from "./inventoryOps";
import { Choice, CodeTag, EmptyState, errorMessage, Facts, Field, FormDialog, money, num, Panel, Pill, ReasonButton, SectionHeader, Step, Stat, Tabbed, Timeline, useRun, type OpsContext } from "./shared";

const CHANNELS: [string, string][] = [["whatsapp", "WhatsApp"], ["phone", "Phone"], ["email", "Email"], ["portal", "Supplier portal"]];
const today = () => new Date().toISOString().slice(0, 10);

function PoCard({ po, ctx, canSeeCost }: { po: PurchaseOrder; ctx: OpsContext; canSeeCost: boolean }) {
  const { busy, run } = useRun(ctx.reload); const buy = ctx.can("procure", "manage"); const receive = ctx.can("procure", "inventory", "manage");
  const [note, setNote] = useState(""); const [qty, setQty] = useState<string[]>(po.lines.map(() => "")); const [costs, setCosts] = useState<string[]>(po.lines.map(() => ""));
  const [disc, setDisc] = useState({ line: "0", kind: "shortage", qty: "1", note: "" }); const [ret, setRet] = useState({ line: "0", qty: "1", reason: "", kind: "return", customerRef: "" }); const [resolution, setResolution] = useState("");
  const status = poStatus(po); const open = po.discrepancies.filter((entry) => !entry.resolvedAt); const finished = status === "Complete" || status === "Cancelled";
  const tone = status === "Complete" ? "good" : status === "Cancelled" ? "neutral" : open.length || status === "Supplier price change" ? "bad" : "info";
  return <Panel>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code="PRO-06" /><span className="text-xs text-muted-foreground">{po.number} · {po.origin.kind}{po.origin.ref ? " " + po.origin.ref : ""} · via {po.channel}</span></div>
        <h3 className="font-semibold">{po.supplierName}</h3></div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={tone}>{status}</Pill>{po.expectedAt && <Pill tone={Date.parse(po.expectedAt) < Date.now() && !finished ? "bad" : "neutral"}>Expected {new Date(po.expectedAt).toLocaleDateString()}</Pill>}</div>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Product</th><th className="pr-4">Ordered</th><th className="pr-4">Received</th>{canSeeCost && <th>Unit cost</th>}</tr></thead>
      <tbody>{po.lines.map((line, index) => <tr key={index} className="border-t border-border"><td className="py-2 pr-4">{line.product}</td><td className="pr-4 tabular-nums">{line.qty}</td><td className="pr-4 tabular-nums">{line.received}</td>{canSeeCost && <td className="tabular-nums">{money(line.unitCost)}</td>}</tr>)}</tbody></table></div>
    {canSeeCost && <Facts items={[["Order value", money(poValue(po))], ["Received value (supplier bill)", money(poValue(po, "received"))], ["Supplier acknowledged", po.acknowledgedAt ? new Date(po.acknowledgedAt).toLocaleString() : "Not yet"], ["Payment terms", po.paymentTermsDays + " days"]]} />}
    {open.map((entry) => <div key={entry.id} className="space-y-2 rounded-md bg-error/10 p-4 text-sm"><p className="font-medium text-error">{DISCREPANCY_LABELS[entry.kind]} · {po.lines[entry.line]?.product}: {entry.note}</p>
      {buy && <div className="flex flex-wrap gap-2"><Input aria-label="Supplier resolution" className="w-72" placeholder="How the supplier resolved it" value={resolution} onChange={(e) => setResolution(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => resolveDiscrepancy(ctx.userName, po.id, entry.id, resolution), "Discrepancy resolved.")}>Mark resolved</Button></div>}</div>)}
    {po.changes.filter((entry) => entry.priceChanged && !entry.reviewed).length > 0 && buy && <Step title="Supplier changed the price">
      <p className="text-sm text-muted-foreground">{po.changes[po.changes.length - 1].note}</p>
      <div className="flex flex-wrap gap-2"><Input aria-label="How it was handled" className="w-80" placeholder="How the new price was handled with Sales" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => reviewPriceChange(ctx.userName, po.id, note), "Price change reviewed.")}>Mark reviewed</Button></div></Step>}
    {!finished && <div className="space-y-4">
      {buy && !po.acknowledgedAt && <Step title="Supplier acknowledgement"><div className="flex flex-wrap gap-2"><Input aria-label="Acknowledgement" className="w-80" placeholder="e.g. Confirmed on WhatsApp 10:42" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => acknowledgePO(ctx.userName, po.id, note), "Acknowledgement recorded.")}>Record acknowledgement</Button></div></Step>}
      {receive && <Step title="Goods received"><p className="text-xs text-muted-foreground">Receive what physically arrived. The supplier bill follows what was received, and partial deliveries stay open.</p>
        <div className="grid gap-4 sm:grid-cols-4">{po.lines.map((line, index) => <Field key={index} label={line.product + " (" + (line.qty - line.received) + " outstanding)"}>
          <Input type="number" min="0" max={line.qty - line.received} value={qty[index]} onChange={(e) => setQty(qty.map((v, i) => (i === index ? e.target.value : v)))} /></Field>)}</div>
        <Button size="sm" disabled={busy} onClick={() => void run(() => receivePO(ctx.userName, po.id, po.lines.map((_, index) => ({ line: index, qty: Number(qty[index] || 0) })), ""), "Receipt recorded.").then(() => setQty(po.lines.map(() => "")))}>Confirm receipt</Button></Step>}
      {receive && <Step title="Something wrong with the delivery?"><div className="grid gap-4 sm:grid-cols-5">
        <Choice label="Line" value={disc.line} onChange={(v) => setDisc({ ...disc, line: v })} options={po.lines.map((line, index): [string, string] => [String(index), line.product])} />
        <Choice label="Kind" value={disc.kind} onChange={(v) => setDisc({ ...disc, kind: v })} options={Object.entries(DISCREPANCY_LABELS) as [string, string][]} />
        <Input aria-label="Units affected" type="number" min="0" value={disc.qty} onChange={(e) => setDisc({ ...disc, qty: e.target.value })} />
        <Input aria-label="What happened" placeholder="What happened" value={disc.note} onChange={(e) => setDisc({ ...disc, note: e.target.value })} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => raiseDiscrepancy(ctx.userName, po.id, Number(disc.line), disc.kind as DiscrepancyKind, Number(disc.qty), disc.note), "Discrepancy opened.")}>Raise discrepancy</Button></div></Step>}
      {buy && <Step title="Supplier changed something?"><p className="text-xs text-muted-foreground">Record changes agreed by WhatsApp or phone so this order stays the record. Enter a new unit cost only if the price moved.</p>
        <div className="grid gap-4 sm:grid-cols-4">{po.lines.map((line, index) => <Input key={index} aria-label={"New cost for " + line.product} type="number" min="0" placeholder={"New cost: " + line.product} value={costs[index]} onChange={(e) => setCosts(costs.map((v, i) => (i === index ? e.target.value : v)))} />)}
          <div className="sm:col-span-2"><Input aria-label="What changed" placeholder="What the supplier changed" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => recordSupplierChange(ctx.userName, po.id, note, costs.map((value) => (value ? Number(value) : undefined))), "Change recorded.")}>Record change</Button></div></Step>}
      {buy && !po.lines.some((line) => line.received > 0) && <div className="flex justify-end"><ReasonButton label="Cancel order" variant="ghost" title="Cancel this order" placeholder="Why is it being cancelled?" disabled={busy} onSubmit={(reason) => run(() => cancelPO(ctx.userName, po.id, reason), "Order cancelled.")} /></div>}
    </div>}
    {po.lines.some((line) => line.received > 0) && receive && <Step title="Return goods to the supplier"><div className="grid gap-4 sm:grid-cols-6">
      <Choice label="Line" value={ret.line} onChange={(v) => setRet({ ...ret, line: v })} options={po.lines.map((line, index): [string, string] => [String(index), line.product + " (" + (line.received - returnedQty(ctx.data.supplierReturns, po.id, index)) + " returnable)"])} />
      <Input aria-label="Quantity" type="number" min="1" value={ret.qty} onChange={(e) => setRet({ ...ret, qty: e.target.value })} />
      <Choice label="Type" value={ret.kind} onChange={(v) => setRet({ ...ret, kind: v })} options={[["return", "Return"], ["warranty", "Supplier warranty"]]} />
      <div className="sm:col-span-2"><Input aria-label="Reason" placeholder="Reason" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} /></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => createSupplierReturn(ctx.userName, po, ctx.data.supplierReturns, Number(ret.line), Number(ret.qty), ret.reason, ret.kind as "return", ret.customerRef), "Supplier return opened.")}>Open return</Button></div></Step>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History ({po.history.length})</summary><div className="pt-4"><Timeline events={po.history} /></div></details>
  </Panel>;
}

function Orders({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const [creating, setCreating] = useState(false); const [view, setView] = useState("active"); const { busy, run } = useRun(ctx.reload);
  const [form, setForm] = useState({ supplierId: "", channel: "whatsapp", expected: "", lines: "" });
  const canSeeCost = ctx.can("procure", "finance", "manage"); const approved = data.suppliers.filter((entry) => entry.status === "approved");
  const visible = data.pos.filter((po) => view === "all" || (view === "active") === (!po.cancelled && poStatus(po) !== "Complete")).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const parse = () => form.lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [product, qty, cost] = line.split(/[,;\t]/).map((part) => part.trim()); return { product, qty: Number(qty), unitCost: Number((cost ?? "").replace(/,/g, "")) }; });
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4">
      <Stat label="Open orders" value={data.pos.filter((po) => !po.cancelled && poStatus(po) !== "Complete").length} />
      <Stat label="Open discrepancies" value={data.pos.reduce((sum, po) => sum + po.discrepancies.filter((entry) => !entry.resolvedAt).length, 0)} tone="warn" />
      <Stat label="Awaiting acknowledgement" value={data.pos.filter((po) => !po.cancelled && !po.acknowledgedAt).length} />
      {canSeeCost && <Stat label="Received, billed" value={money(data.pos.filter((po) => !po.cancelled).reduce((sum, po) => sum + poValue(po, "received"), 0))} />}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["active", "Open orders"], ["done", "Complete or cancelled"], ["all", "All"]]} /></div>
      {ctx.can("procure", "manage") && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New purchase order</Button>}</div>
    <div className="space-y-4 motion-stagger">{visible.map((po) => <PoCard key={po.id + po.history.length} po={po} ctx={ctx} canSeeCost={canSeeCost} />)}</div>
    {!visible.length && <EmptyState icon={ShoppingBag}>No purchase orders here.</EmptyState>}
    <FormDialog open={creating} onOpenChange={setCreating} title="New purchase order" description="Only approved suppliers can be used. Goods count as stock only once Inventory receives them.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const supplier = approved.find((entry) => entry.id === form.supplierId);
        await run(() => createPO(ctx.userName, supplier, { kind: "manual" }, parse(), form.channel as PoChannel, form.expected || undefined), "Purchase order created.").then((result) => { if (result) { setCreating(false); setForm({ ...form, lines: "" }); } }); }}>
        <Field label="Supplier"><Choice label="Supplier" value={form.supplierId} placeholder="Choose an approved supplier" onChange={(v) => setForm({ ...form, supplierId: v })} options={approved.map((entry): [string, string] => [entry.id, entry.name])} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Sent by"><Choice label="Channel" value={form.channel} onChange={(v) => setForm({ ...form, channel: v })} options={CHANNELS} /></Field>
          <Field label="Expected delivery"><Input type="date" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} /></Field></div>
        <Field label="Items" hint="One per line: product, quantity, unit cost"><Textarea required rows={4} value={form.lines} onChange={(e) => setForm({ ...form, lines: e.target.value })} placeholder={"iPhone 15 128GB, 2, 900000"} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Create order</Button></div>
      </form></FormDialog>
  </div>;
}

function Suppliers({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const buy = ctx.can("procure", "manage"); const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", phone: "", terms: "7", capabilities: "" }); const [price, setPrice] = useState({ supplierId: "", product: "", cost: "", from: today(), paste: "" });
  const approved = data.suppliers.filter((entry) => entry.status === "approved"); const supplier = approved.find((entry) => entry.id === price.supplierId);
  const products = [...new Set(data.prices.map((entry) => entry.supplierId + "|" + entry.product.toLowerCase()))];
  const tone = { approved: "good", pending: "warn", inactive: "neutral" } as const;
  return <div className="space-y-6">
    <SectionHeader title="Approved suppliers" description="Inactive or unapproved suppliers cannot be used for purchases." action={buy ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" />Add supplier</Button> : undefined} />
    <div className="space-y-4">{data.suppliers.map((entry) => <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold">{entry.name}</h3><p className="text-sm text-muted-foreground">{entry.contact} · {entry.phone} · {entry.paymentTermsDays} day terms{entry.capabilities ? " · " + entry.capabilities : ""}</p></div>
      <div className="flex items-center gap-2"><Pill tone={tone[entry.status]}>{entry.status}</Pill>
        {buy && entry.status !== "approved" && <ReasonButton label="Approve" variant="default" title={"Approve " + entry.name} placeholder="Why is this supplier approved?" disabled={busy} onSubmit={(reason) => run(() => setSupplierStatus(ctx.userName, entry.id, "approved", reason), "Supplier approved.")} />}
        {buy && entry.status === "approved" && <ReasonButton label="Deactivate" title={"Deactivate " + entry.name} placeholder="Why is this supplier being deactivated?" disabled={busy} onSubmit={(reason) => run(() => setSupplierStatus(ctx.userName, entry.id, "inactive", reason), "Supplier deactivated.")} />}</div></div></Panel>)}
      {!data.suppliers.length && <EmptyState icon={ShoppingBag}>No suppliers yet.</EmptyState>}</div>
    {buy && approved.length > 0 && <Panel><h3 className="font-semibold">Weekly price list</h3><p className="text-sm text-muted-foreground">Each price is added with its effective date. Earlier prices are kept as cost evidence and never overwritten.</p>
      <Field label="Supplier"><Choice label="Supplier" value={price.supplierId} placeholder="Choose supplier" onChange={(v) => setPrice({ ...price, supplierId: v })} options={approved.map((entry): [string, string] => [entry.id, entry.name])} /></Field>
      <div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Product" placeholder="Product" value={price.product} onChange={(e) => setPrice({ ...price, product: e.target.value })} /><Input aria-label="Unit cost" type="number" min="0" placeholder="Unit cost" value={price.cost} onChange={(e) => setPrice({ ...price, cost: e.target.value })} />
        <Input aria-label="Effective from" type="date" value={price.from} onChange={(e) => setPrice({ ...price, from: e.target.value })} />
        <Button disabled={busy} onClick={() => void run(() => addPrice(ctx.userName, supplier, price.product, num(price.cost), price.from), "Price recorded.")}>Add price</Button></div>
      <Field label="Or paste this week's list" hint="One per line: product, cost"><Textarea rows={3} value={price.paste} onChange={(e) => setPrice({ ...price, paste: e.target.value })} /></Field>
      <Button variant="outline" disabled={busy || !price.paste.trim()} onClick={async () => { const { rows, bad } = parsePriceList(price.paste); if (bad.length) { toast.error("Could not read " + bad.length + " line(s): " + bad[0]); return; }
        await run(async () => { for (const row of rows) await addPrice(ctx.userName, supplier, row.product, row.cost, price.from); }, rows.length + " prices recorded."); setPrice({ ...price, paste: "" }); }}>Import pasted list</Button>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Supplier</th><th className="pr-4">Product</th><th className="pr-4">Current cost</th><th>Changes</th></tr></thead><tbody>
        {products.map((key) => { const [supplierId, product] = key.split("|"); const row = currentPrice(data.prices, supplierId, product); if (!row) return null;
          return <tr key={key} className="border-t border-border"><td className="py-2 pr-4">{row.supplierName}</td><td className="pr-4">{row.product}</td><td className="pr-4 tabular-nums">{money(row.unitCost)}</td><td className="tabular-nums">{data.prices.filter((entry) => entry.supplierId === supplierId && entry.product.toLowerCase() === product).length} on record</td></tr>; })}</tbody></table></div></Panel>}
    <FormDialog open={adding} onOpenChange={setAdding} title="Add supplier" description="New suppliers start as pending until someone approves them.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); await run(() => addSupplier(ctx.userName, { name: form.name, contact: form.contact, phone: form.phone, paymentTermsDays: Number(form.terms), capabilities: form.capabilities }), "Supplier added.").then((result) => { if (result) { setAdding(false); setForm({ name: "", contact: "", phone: "", terms: "7", capabilities: "" }); } }); }}>
        <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Contact person"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field><Field label="Phone"><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Payment terms (days)"><Input type="number" min="0" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field><Field label="What they supply"><Input value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={busy} type="submit">Save supplier</Button></div></form></FormDialog>
  </div>;
}

function SupplierReturns({ ctx }: { ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const [note, setNote] = useState(""); const [amount, setAmount] = useState(""); const buy = ctx.can("procure", "manage", "finance");
  const list = [...ctx.data.supplierReturns].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className="space-y-4"><SectionHeader title="Supplier returns and warranty" description="Expected credit stays open until the supplier actually settles it. Start a return from the purchase order it came from." />
    {list.map((entry) => <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code={entry.kind === "warranty" ? "WAR-04" : "PRO-19"} /><span className="text-xs text-muted-foreground">{entry.number} · {entry.poNumber}</span></div>
      <h3 className="font-semibold">{entry.product} × {entry.qty} · {entry.supplierName}</h3><p className="text-sm text-muted-foreground">{entry.reason}</p></div>
      <Pill tone={entry.status === "credited" ? "good" : entry.status === "rejected" ? "bad" : "info"}>{entry.status}</Pill></div>
      <Facts items={[["Expected credit", money(entry.qty * entry.unitValue)], ["Credited", entry.creditedAmount !== undefined ? money(entry.creditedAmount) : "Not yet"], ["Raised", new Date(entry.createdAt).toLocaleDateString()]]} />
      {buy && entry.status === "open" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markReturnShipped(ctx.userName, entry.id), "Marked as sent to the supplier.")}>Mark sent to supplier</Button>}
      {buy && ["open", "shipped"].includes(entry.status) && <div className="flex flex-wrap gap-2"><Input aria-label="Credit received" className="w-40" type="number" min="0" placeholder="Credit received" value={amount} onChange={(e) => setAmount(e.target.value)} /><Input aria-label="Supplier response" className="w-72" placeholder="Supplier's response or credit note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => settleSupplierCredit(ctx.userName, entry.id, "credited", num(amount), note), "Credit recorded.")}>Record credit</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => settleSupplierCredit(ctx.userName, entry.id, "rejected", 0, note), "Rejection recorded.")}>Supplier refused</Button></div>}</Panel>)}
    {!list.length && <EmptyState icon={ShoppingBag}>No supplier returns.</EmptyState>}</div>;
}

function Replenishment({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const buy = ctx.can("procure", "manage"); const ask = ctx.can("procure", "inventory", "manage");
  const [form, setForm] = useState({ product: "", quantity: "5", note: "" }); const [order, setOrder] = useState({ id: "", supplierId: "", cost: "", channel: "whatsapp" });
  const approved = data.suppliers.filter((entry) => entry.status === "approved"); const signals = demandSignals(data.sourcing).filter((entry) => !data.replenishments.some((request) => ["pending", "approved"].includes(request.status) && request.product.toLowerCase() === entry.product.toLowerCase()));
  return <div className="space-y-6">
    <SectionHeader title="Replenishment decisions" description="Low stock and repeated demand only suggest. A person decides, then orders. Nothing is bought automatically." />
    {signals.length > 0 && ask && <Panel><h3 className="font-semibold">Repeated unmet demand (last 30 days)</h3>{signals.map((entry) => <div key={entry.product} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{entry.product} · requested {entry.count} times</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestReplenishment(ctx.userName, { product: entry.product, quantity: 2, reason: "repeated_demand", note: "Requested " + entry.count + " times in 30 days" }), "Added to the decision queue.")}>Add to decisions</Button></div>)}</Panel>}
    {ask && <Panel><h3 className="font-semibold">Request replenishment</h3><div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Product" placeholder="Product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
      <Input aria-label="Quantity" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /><Input aria-label="Why" placeholder="Why" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <Button disabled={busy} onClick={() => void run(() => requestReplenishment(ctx.userName, { product: form.product, quantity: Number(form.quantity), reason: "manual", note: form.note }), "Request added.")}>Add request</Button></div></Panel>}
    <div className="space-y-4">{[...data.replenishments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((entry) => <Panel key={entry.id + entry.history.length}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><CodeTag code="PRO-13" /><span className="text-xs text-muted-foreground">{entry.number} · {entry.reason.replace("_", " ")}</span></div><h3 className="font-semibold">{entry.product} × {entry.quantity}</h3>{entry.note && <p className="text-sm text-muted-foreground">{entry.note}</p>}</div>
        <Pill tone={entry.status === "pending" ? "warn" : entry.status === "approved" ? "info" : entry.status === "ordered" ? "good" : "neutral"}>{entry.status}</Pill></div>
      {buy && entry.status === "pending" && <div className="flex flex-wrap gap-2"><ReasonButton label="Approve" variant="default" title="Approve replenishment" placeholder="Why is this worth stocking?" disabled={busy} onSubmit={(reason) => run(() => decideReplenishment(ctx.userName, entry.id, "approved", reason), "Approved.")} />
        <ReasonButton label="Reject" title="Reject replenishment" placeholder="Why not?" disabled={busy} onSubmit={(reason) => run(() => decideReplenishment(ctx.userName, entry.id, "rejected", reason), "Rejected.")} /></div>}
      {buy && entry.status === "approved" && (order.id === entry.id ? <div className="grid gap-4 sm:grid-cols-4"><Choice label="Supplier" value={order.supplierId} placeholder="Supplier" onChange={(v) => setOrder({ ...order, supplierId: v })} options={approved.map((s): [string, string] => [s.id, s.name])} />
        <Input aria-label="Unit cost" type="number" min="0" placeholder="Unit cost" value={order.cost} onChange={(e) => setOrder({ ...order, cost: e.target.value })} /><Choice label="Channel" value={order.channel} onChange={(v) => setOrder({ ...order, channel: v })} options={CHANNELS} />
        <Button disabled={busy} onClick={() => void run(() => orderFromReplenishment(ctx.userName, entry.id, approved.find((s) => s.id === order.supplierId), num(order.cost), order.channel as PoChannel), "Purchase order created.")}>Place order</Button></div>
        : <Button size="sm" onClick={() => setOrder({ ...order, id: entry.id })}>Order now</Button>)}</Panel>)}
      {!data.replenishments.length && <EmptyState icon={ShoppingBag}>No replenishment decisions waiting.</EmptyState>}</div>
  </div>;
}

export default function ProcurementBoard({ ctx }: { ctx: OpsContext }) {
  const [tab, setTab] = useState("orders");
  return <section className="space-y-6">
    <SectionHeader title="Procurement" description="Approved suppliers, purchase orders, receiving and supplier returns. Cost detail is visible only to Procurement, Finance and management." />
    <Tabbed value={tab} onChange={setTab} tabs={[["orders", "Purchase orders"], ["suppliers", "Suppliers and prices"], ["returns", "Supplier returns"], ["replenishment", "Replenishment"]]} />
    {tab === "orders" && <Orders ctx={ctx} />}{tab === "suppliers" && <Suppliers ctx={ctx} />}{tab === "returns" && <SupplierReturns ctx={ctx} />}{tab === "replenishment" && <Replenishment ctx={ctx} />}
  </section>;
}
