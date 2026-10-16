import { useState } from "react";
import { MessageCircle, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNEL_LABELS, allocateStock, amendOrder, cancelOrder, closeAbandoned, completeOrderRefund, createWebOrder, itemsTotal, markDispatched, markFulfilled, markNoticeSent, orderStatus, recordAbandoned, recordOnlinePayment,
  sendOrderToSourcing, whatsappLink, type Channel, type WebItem, type WebOrder,
} from "./digital";
import { Choice, CodeTag, EmptyState, Facts, Field, FormDialog, money, Panel, Pill, ReasonButton, SectionHeader, Step, Tabbed, Timeline, useRun, type OpsContext } from "./shared";

const CHANNELS = Object.entries(CHANNEL_LABELS) as [string, string][];
const parseItems = (text: string): WebItem[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [product, qty, price] = line.split(/[,;\t]/).map((part) => part.trim()); return { product, qty: Number(qty), unitPrice: Number((price ?? "").replace(/,/g, "")) }; });

function OrderCard({ order, ctx }: { order: WebOrder; ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const status = orderStatus(order); const money_ = ctx.can("finance", "manage"); const sell = ctx.can("sell", "manage", "support");
  const [ref, setRef] = useState(""); const [alloc, setAlloc] = useState(""); const [amend, setAmend] = useState(false); const [text, setText] = useState(order.items.map((i) => [i.product, i.qty, i.unitPrice].join(", ")).join("\n"));
  const finished = order.fulfilment === "fulfilled" || (order.cancellation && order.cancellation.refund !== "pending");
  const tone = order.payment === "failed" ? "bad" : finished ? "neutral" : order.payment === "pending" ? "warn" : "info";
  return <Panel>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code="DIG-02" /><span className="text-xs text-muted-foreground">{order.number} · {CHANNEL_LABELS[order.channel]}</span></div><h3 className="font-semibold">{order.customerName} · {money(order.total)}</h3>
        <p className="text-sm text-muted-foreground">{order.items.map((i) => i.product + " × " + i.qty).join(", ")}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={tone}>{status.label}</Pill><Pill tone={order.payment === "verified" ? "good" : order.payment === "failed" ? "bad" : "warn"}>Payment {order.payment}</Pill></div></div>
    <Facts items={[["Owner", status.owner], ["Waiting on", status.waitingOn], ["Next action", status.next], ["Payment reference", order.paymentRef ?? "None"]]} />
    {order.cancellation && <p className="text-sm text-muted-foreground">Cancelled: {order.cancellation.reason}. Refund {order.cancellation.refund === "pending" ? "of " + money(order.cancellation.refundAmount) + " is still outstanding" : order.cancellation.refund === "paid" ? "paid (" + order.cancellation.refundRef + ")" : "not needed (nothing was paid)"}.</p>}
    {!finished && <div className="space-y-4">
      {money_ && order.payment !== "verified" && order.fulfilment !== "cancelled" && <Step title="Finance: verify payment"><div className="flex flex-wrap gap-2"><Input aria-label="Payment reference" className="w-72" placeholder="Reference you checked (gateway or bank)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => recordOnlinePayment(ctx.userName, order.id, "verified", ref), "Payment verified.")}>Payment confirmed</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => recordOnlinePayment(ctx.userName, order.id, "failed", ref), "Marked as failed.")}>Payment failed</Button></div></Step>}
      {sell && order.payment === "verified" && order.fulfilment === "new" && <Step title="Stock decision"><div className="flex flex-wrap gap-2"><Input aria-label="Reservation reference" className="w-64" placeholder="Reservation number (optional)" value={alloc} onChange={(e) => setAlloc(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={() => void run(() => allocateStock(ctx.userName, order.id, alloc), "Stock allocated.")}>Stock is available: allocate</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => sendOrderToSourcing(ctx.userName, order.id), "Sent to sourcing. Procurement owns it now.")}>No physical stock: source it</Button></div></Step>}
      {sell && ["allocated", "sourcing"].includes(order.fulfilment) && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markDispatched(ctx.userName, order.id), "Marked as on its way.")}>Dispatched</Button><Button size="sm" disabled={busy} onClick={() => void run(() => markFulfilled(ctx.userName, order.id), "Order fulfilled.")}>Handed over</Button></div>}
      {order.fulfilment === "dispatched" && sell && <Button size="sm" disabled={busy} onClick={() => void run(() => markFulfilled(ctx.userName, order.id), "Order fulfilled.")}>Delivered: mark fulfilled</Button>}
      {sell && !["dispatched", "fulfilled", "cancelled"].includes(order.fulfilment) && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setAmend(!amend)}>Amend order</Button>
        <ReasonButton label="Cancel order" variant="ghost" title="Cancel this order" placeholder="Why is it cancelled?" disabled={busy} onSubmit={(reason) => run(() => cancelOrder(ctx.userName, order.id, reason), "Order cancelled.")} /></div>}
      {amend && <Step title="Amend items"><p className="text-xs text-muted-foreground">The original items and total stay on the record.</p><Textarea aria-label="Items" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-sm">New total {money(itemsTotal(parseItems(text).filter((i) => i.qty > 0 && i.unitPrice > 0)))}</p>
        <ReasonButton label="Save amendment" variant="default" title="Amend this order" placeholder="Why is the order changing?" disabled={busy} onSubmit={(reason) => run(() => amendOrder(ctx.userName, order.id, parseItems(text), reason), "Order amended.").then(() => setAmend(false))} /></Step>}
    </div>}
    {order.cancellation?.refund === "pending" && money_ && <ReasonButton label="Refund paid" variant="default" title="Record the refund payout" placeholder="Payout reference" disabled={busy} onSubmit={(reference) => run(() => completeOrderRefund(ctx.userName, order.id, reference), "Refund recorded as paid.")} />}
    {order.notices.length > 0 && <div className="space-y-2"><h4 className="text-sm font-semibold">Customer messages</h4>{order.notices.map((notice, index) => <div key={index} className="flex flex-col gap-2 rounded-md bg-secondary/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span><span className="text-xs text-muted-foreground">{new Date(notice.at).toLocaleString()} · {notice.event.replace("_", " ")}</span><span className="block">{notice.text}</span></span>
      {notice.sentAt ? <Pill tone="good">Sent by {notice.sentBy}</Pill> : <span className="flex gap-2"><a className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary" href={whatsappLink(order.customerPhone, notice.text)} target="_blank" rel="noreferrer">Open in WhatsApp</a>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markNoticeSent(ctx.userName, order.id, index), "Marked as sent.")}>Mark sent</Button></span>}</div>)}</div>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History and amendments ({order.history.length})</summary><div className="space-y-4 pt-4">{order.amendments.map((a, index) => <p key={index}>{new Date(a.at).toLocaleString()} · {a.by}: {money(a.beforeTotal)} → {money(a.afterTotal)} · {a.reason}</p>)}<Timeline events={order.history} /></div></details>
  </Panel>;
}

export default function DigitalBoard({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [tab, setTab] = useState("orders"); const [creating, setCreating] = useState(false); const [view, setView] = useState("open");
  const [form, setForm] = useState({ channel: "website", name: "", phone: "", email: "", items: "" }); const [lead, setLead] = useState({ name: "", contact: "", product: "", channel: "website", value: "", hours: "24" });
  const orders = data.webOrders.filter((order) => { const finished = order.fulfilment === "fulfilled" || (order.cancellation && order.cancellation.refund !== "pending"); return view === "all" || (view === "open") === !finished; }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const sell = ctx.can("sell", "lead", "manage", "support");
  return <section className="space-y-6">
    <SectionHeader title="Digital orders" description="Website, Instagram, WhatsApp and phone orders use the same order record as the shop. Nothing is fulfilled until payment is verified." action={sell ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New order</Button> : undefined} />
    <Tabbed value={tab} onChange={setTab} tabs={[["orders", "Orders"], ["leads", "Abandoned interest"]]} />
    {tab === "orders" && <><div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["open", "Open"], ["done", "Finished"], ["all", "All"]]} /></div>
      <div className="space-y-4 motion-stagger">{orders.map((order) => <OrderCard key={order.id + order.history.length} order={order} ctx={ctx} />)}</div>{!orders.length && <EmptyState icon={ShoppingCart}>No orders here.</EmptyState>}</>}
    {tab === "leads" && <div className="space-y-4">
      {sell && <Panel><h3 className="font-semibold">Record interest that did not become an order</h3><div className="grid gap-4 sm:grid-cols-3"><Input aria-label="Name" placeholder="Name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} /><Input aria-label="Phone or handle" placeholder="Phone or handle" value={lead.contact} onChange={(e) => setLead({ ...lead, contact: e.target.value })} />
        <Input aria-label="What they wanted" placeholder="What they wanted" value={lead.product} onChange={(e) => setLead({ ...lead, product: e.target.value })} /><Choice label="Channel" value={lead.channel} onChange={(v) => setLead({ ...lead, channel: v })} options={CHANNELS} />
        <Input aria-label="Value" type="number" min="0" placeholder="Value" value={lead.value} onChange={(e) => setLead({ ...lead, value: e.target.value })} /><Input aria-label="Follow up in hours" type="number" min="1" value={lead.hours} onChange={(e) => setLead({ ...lead, hours: e.target.value })} /></div>
        <Button disabled={busy} onClick={() => void run(() => recordAbandoned(ctx.userName, { customerName: lead.name, contact: lead.contact, product: lead.product, channel: lead.channel as Channel, value: Number(lead.value || 0), followUpHours: Number(lead.hours) }), "Saved for follow-up.")}>Save for follow-up</Button></Panel>}
      {[...data.abandoned].sort((a, b) => Date.parse(a.followUpDueAt) - Date.parse(b.followUpDueAt)).map((entry) => <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code="DIG-06" /><span className="text-xs text-muted-foreground">{entry.number} · {CHANNEL_LABELS[entry.channel]}</span></div>
        <h3 className="font-semibold">{entry.customerName} · {entry.product}</h3><p className="text-sm text-muted-foreground">{entry.contact} · {money(entry.value)} · follow up {new Date(entry.followUpDueAt).toLocaleString()}</p></div>
        {entry.outcome ? <Pill tone={entry.outcome.result === "converted" ? "good" : "neutral"}>{entry.outcome.result.replace("_", " ")}</Pill> : <Pill tone={Date.parse(entry.followUpDueAt) <= Date.now() ? "bad" : "info"}>{Date.parse(entry.followUpDueAt) <= Date.now() ? "Follow-up due" : "Scheduled"}</Pill>}</div>
        {!entry.outcome && <div className="flex flex-wrap gap-2">{([["converted", "Became an order"], ["not_interested", "Not interested"], ["no_response", "No response"]] as const).map(([result, label]) => <ReasonButton key={result} label={label} title={label} placeholder="What happened?" disabled={busy} onSubmit={(note) => run(() => closeAbandoned(ctx.userName, entry.id, result, note), "Follow-up closed.")} />)}
          <a className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary" href={whatsappLink(entry.contact, "Hi " + entry.customerName + ", you were looking at " + entry.product + ". Can we help you finish?")} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a></div>}</Panel>)}
      {!data.abandoned.length && <EmptyState icon={MessageCircle}>No abandoned interest recorded.</EmptyState>}</div>}
    <FormDialog open={creating} onOpenChange={setCreating} title="New digital order" description="Record an order that came in through a digital channel. It starts unpaid.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await run(() => createWebOrder(ctx.userName, { channel: form.channel as Channel, customerName: form.name, customerPhone: form.phone, customerEmail: form.email, items: parseItems(form.items) }), "Order recorded.");
        if (result) { setCreating(false); setForm({ ...form, name: "", phone: "", email: "", items: "" }); } }}>
        <Field label="Channel"><Choice label="Channel" value={form.channel} onChange={(v) => setForm({ ...form, channel: v })} options={CHANNELS} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Customer"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Phone"><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></div>
        <Field label="Email (optional)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Items" hint="One per line: product, quantity, unit price"><Textarea required rows={4} value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} placeholder="AirPods Pro, 1, 120000" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Save order</Button></div>
      </form></FormDialog>
  </section>;
}
