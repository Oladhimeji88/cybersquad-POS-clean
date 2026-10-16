import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SaleCustomer } from "@/pos/lib/devices";
import CustomerPicker from "./CustomerPicker";
import { acceptQuote, createQuote, declineQuote, decideQuoteDiscount, latestVersion, quoteExpired, reviseQuote, sendQuote, type Quote, type QuoteLine } from "./quotes";
import { Checkbox } from "@/components/ui/checkbox";
import { Choice, CodeTag, EmptyState, Facts, Field, FormDialog, money, Panel, Pill, ReasonButton, SectionHeader, Step, useRun, type OpsContext } from "./shared";

const parseLines = (text: string): QuoteLine[] => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [description, qty, price] = line.split(/[,;\t]/).map((part) => part.trim()); return { description, qty: Number(qty), unitPrice: Number((price ?? "").replace(/,/g, "")) }; });
const linesText = (lines: QuoteLine[]) => lines.map((line) => [line.description, line.qty, line.unitPrice].join(", ")).join("\n");

function QuoteCard({ quote, ctx }: { quote: Quote; ctx: OpsContext }) {
  const { busy, run } = useRun(ctx.reload); const { policy } = ctx.data; const version = latestVersion(quote); const expired = quoteExpired(quote); const manager = ctx.can("manage");
  const [revising, setRevising] = useState(false); const [text, setText] = useState(linesText(version.lines)); const [discount, setDiscount] = useState(String(version.discountPercent)); const [dReason, setDReason] = useState(version.discountReason ?? ""); const [why, setWhy] = useState("");
  const tone = quote.status === "accepted" ? "good" : quote.status === "declined" ? "neutral" : expired ? "bad" : "info";
  return <Panel>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code={quote.company ? "SAL-12" : "SAL-06"} /><span className="text-xs text-muted-foreground">{quote.number} · version {version.version} of {quote.versions.length}</span></div>
        <h3 className="font-semibold">{quote.company ?? quote.customerName}</h3><p className="text-sm text-muted-foreground">{quote.customerName} · {quote.customerPhone}{quote.creditDays ? " · " + quote.creditDays + " day credit" : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={tone}>{expired ? "Expired" : quote.status}</Pill>{quote.approval?.status === "required" && <Pill tone="warn">Discount needs approval</Pill>}</div></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{version.lines.map((line, index) => <tr key={index} className="border-t border-border first:border-0"><td className="py-2 pr-4">{line.description}</td><td className="pr-4 tabular-nums">{line.qty} × {money(line.unitPrice)}</td><td className="text-right tabular-nums">{money(line.qty * line.unitPrice)}</td></tr>)}</tbody></table></div>
    <Facts items={[["Total", money(version.total)], ["Discount", version.discountPercent + "%" + (version.discountReason ? " · " + version.discountReason : "")], ["Valid until", version.validUntil ? new Date(version.validUntil).toLocaleDateString() : "Not sent"], ["Invoice", quote.invoiceRef ? "Raised: " + quote.invoiceRef : quote.company ? "Raised on acceptance" : "Not needed"]]} />
    {quote.versions.length > 1 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Earlier versions</summary><ul className="space-y-1 pt-2">{quote.versions.slice(0, -1).map((v) => <li key={v.version}>v{v.version} · {money(v.total)} · {new Date(v.at).toLocaleDateString()}{v.sentAt ? " · was sent" : ""}</li>)}</ul></details>}
    {quote.status === "draft" && quote.approval?.status === "required" && manager && <div className="flex gap-2"><ReasonButton label="Approve discount" variant="default" title="Approve this discount" placeholder="Reason" disabled={busy} onSubmit={(reason) => run(() => decideQuoteDiscount(ctx.userName, quote.id, "approved", reason, manager), "Discount approved.")} />
      <ReasonButton label="Reject" title="Reject this discount" placeholder="Reason" disabled={busy} onSubmit={(reason) => run(() => decideQuoteDiscount(ctx.userName, quote.id, "rejected", reason, manager), "Discount rejected.")} /></div>}
    {["draft", "sent"].includes(quote.status) && <div className="flex flex-wrap gap-2">
      {quote.status === "draft" && <Button size="sm" disabled={busy} onClick={() => void run(() => sendQuote(ctx.userName, quote.id, policy), "Quote sent. This version is now locked.")}>Mark as sent</Button>}
      {quote.status === "sent" && !expired && <ReasonButton label="Customer accepted" variant="default" title="Record acceptance" placeholder="How did the customer accept? (PO number, message)" disabled={busy} onSubmit={(note) => run(() => acceptQuote(ctx.userName, quote.id, note), "Quote accepted.")} />}
      <ReasonButton label="Customer declined" title="Record decline" placeholder="Why did the customer decline?" disabled={busy} onSubmit={(reason) => run(() => declineQuote(ctx.userName, quote.id, reason), "Recorded as declined.")} />
      <Button size="sm" variant="ghost" onClick={() => setRevising(!revising)}>Change the quote</Button></div>}
    {revising && <Step title="New version"><p className="text-xs text-muted-foreground">A sent quote is never edited. This creates a new version and the old one stays on record.</p>
      <Textarea aria-label="Lines" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-3"><Input aria-label="Discount percent" type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /><Input aria-label="Discount reason" placeholder="Discount reason" value={dReason} onChange={(e) => setDReason(e.target.value)} /><Input aria-label="Why it changed" placeholder="Why the quote is changing" value={why} onChange={(e) => setWhy(e.target.value)} /></div>
      <Button size="sm" disabled={busy} onClick={() => void run(() => reviseQuote(ctx.userName, quote.id, parseLines(text), Number(discount || 0), dReason, why, policy), "New version created.").then(() => setRevising(false))}>Save new version</Button></Step>}
  </Panel>;
}

export default function QuotesBoard({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [view, setView] = useState("open"); const [creating, setCreating] = useState(false); const [customer, setCustomer] = useState<SaleCustomer>();
  const [form, setForm] = useState({ business: false, company: "", credit: "30", lines: "", discount: "0", reason: "" });
  const list = data.quotes.filter((quote) => view === "all" || (view === "open") === ["draft", "sent"].includes(quote.status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-6">
    <SectionHeader title="Quotes" description="Sent quotes are locked. A change is a new version, and only the latest unexpired version can be accepted." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New quote</Button>} />
    <div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["open", "Open (" + data.quotes.filter((q) => ["draft", "sent"].includes(q.status)).length + ")"], ["decided", "Decided"], ["all", "All"]]} /></div>
    <div className="space-y-4 motion-stagger">{list.map((quote) => <QuoteCard key={quote.id + quote.history.length} quote={quote} ctx={ctx} />)}</div>{!list.length && <EmptyState icon={FileText}>No quotes here.</EmptyState>}
    <FormDialog open={creating} onOpenChange={setCreating} title="New quote" description={"Discounts above " + data.policy.discountApprovalPercent + "% need a manager to approve before the quote is sent."}>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault();
        const result = await run(() => createQuote(ctx.userName, { customerName: customer?.name ?? "", customerPhone: customer?.phone ?? "", company: form.business ? form.company : undefined, creditDays: Number(form.credit), lines: parseLines(form.lines), discountPercent: Number(form.discount || 0), discountReason: form.reason }, data.policy), "Quote created.");
        if (result) { setCreating(false); setForm({ ...form, lines: "", discount: "0", reason: "" }); setCustomer(undefined); } }}>
        <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.business} onCheckedChange={(v) => setForm({ ...form, business: v === true })} />Business customer (invoice on credit terms)</label>
        {form.business && <div className="grid gap-4 sm:grid-cols-2"><Field label="Company"><Input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field><Field label="Credit terms (days)"><Input type="number" min="0" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} /></Field></div>}
        <Field label="Items" hint="One per line: description, quantity, unit price"><Textarea required rows={4} value={form.lines} onChange={(e) => setForm({ ...form, lines: e.target.value })} placeholder="10 laptops, 10, 400000" /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Discount (%)"><Input type="number" min="0" max="100" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field><Field label="Discount reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Create quote</Button></div>
      </form></FormDialog>
  </section>;
}
