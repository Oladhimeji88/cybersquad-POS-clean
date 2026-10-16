import { useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SalePaymentMode } from "@/pos/lib/store";
import {
  EXPENSE_LABELS, decideExpense, explainReconciliation, payExpense, pettyCashBalance, recordReconciliation, requestExpense, systemAmountFor, topUpPettyCash, type ExpenseKind,
} from "./finops";
import { Choice, CodeTag, EmptyState, Field, FormDialog, money, num, Panel, Pill, ReasonButton, SectionHeader, Stat, Step, Tabbed, Timeline, useRun, type OpsContext } from "./shared";

const METHODS: [string, string][] = [["cash", "Cash"], ["pos", "POS terminal"], ["bank_transfer", "Bank transfer"]];
const today = () => new Date().toISOString().slice(0, 10);

function Spending({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [creating, setCreating] = useState(false); const [reference, setReference] = useState(""); const [topUp, setTopUp] = useState({ amount: "", ref: "" });
  const [form, setForm] = useState({ kind: "expense", purpose: "", category: "", amount: "", supplier: "", evidence: "" }); const manager = ctx.can("manage"); const finance = ctx.can("finance", "manage");
  const balance = pettyCashBalance(data.expenses);
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-4"><Stat label="Petty cash balance" value={money(balance)} tone={balance < 5000 ? "warn" : "neutral"} /><Stat label="Awaiting approval" value={data.expenses.filter((e) => e.status === "requested").length} />
      <Stat label="Approved, unpaid" value={data.expenses.filter((e) => e.status === "approved").length} /><Stat label="Approval limit" value={money(data.policy.expenseApprovalLimit)} note="Fixed assets always need approval" /></div>
    <SectionHeader title="Spending" description="Every request carries its evidence. Above the limit, someone other than the requester approves it before it is paid." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />New request</Button>} />
    {finance && <Panel><h3 className="font-semibold">Top up petty cash</h3><div className="grid gap-4 sm:grid-cols-4"><Input aria-label="Amount" type="number" min="0" placeholder="Amount" value={topUp.amount} onChange={(e) => setTopUp({ ...topUp, amount: e.target.value })} /><Input aria-label="Reference" placeholder="Cash or bank reference" value={topUp.ref} onChange={(e) => setTopUp({ ...topUp, ref: e.target.value })} />
      <Button variant="outline" disabled={busy} onClick={() => void run(() => topUpPettyCash(ctx.userName, num(topUp.amount), topUp.ref), "Petty cash topped up.")}>Top up</Button></div></Panel>}
    <div className="space-y-4">{[...data.expenses].filter((e) => e.kind !== "petty_topup").reverse().map((entry) => <Panel key={entry.id + entry.history.length}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code={entry.kind === "fixed_asset" ? "FIN-18" : entry.kind === "internal_purchase" ? "PRO-20" : entry.kind === "petty_cash" ? "FIN-10" : "FIN-09"} /><span className="text-xs text-muted-foreground">{entry.number} · {EXPENSE_LABELS[entry.kind]} · {entry.requester}</span></div>
        <h3 className="font-semibold">{entry.purpose} · {money(entry.amount)}</h3><p className="text-sm text-muted-foreground">{entry.category}{entry.supplier ? " · " + entry.supplier : ""} · evidence: {entry.evidence}</p></div>
        <Pill tone={entry.status === "paid" ? "good" : entry.status === "rejected" ? "bad" : entry.status === "requested" ? "warn" : "info"}>{entry.status}</Pill></div>
      {entry.decision && <p className="text-sm text-muted-foreground">{entry.status === "rejected" ? "Rejected" : "Approved"} by {entry.decision.by}: {entry.decision.note}</p>}
      {entry.paid && <p className="text-sm text-muted-foreground">Paid {new Date(entry.paid.at).toLocaleDateString()} · {entry.paid.reference}{entry.assetRef ? " · recorded as asset " + entry.assetRef : ""}</p>}
      {entry.status === "requested" && manager && <div className="flex gap-2"><ReasonButton label="Approve" variant="default" title="Approve this request" placeholder="Reason" disabled={busy} onSubmit={(note) => run(() => decideExpense(ctx.userName, entry.id, "approved", note, manager), "Approved.")} />
        <ReasonButton label="Reject" title="Reject this request" placeholder="Reason" disabled={busy} onSubmit={(note) => run(() => decideExpense(ctx.userName, entry.id, "rejected", note, manager), "Rejected.")} /></div>}
      {entry.status === "approved" && finance && <div className="flex flex-wrap gap-2"><Input aria-label="Payment reference" className="w-64" placeholder="Payment reference" value={reference} onChange={(e) => setReference(e.target.value)} /><Button size="sm" disabled={busy} onClick={() => void run(() => payExpense(ctx.userName, entry.id, reference), "Payment recorded.")}>Record payment</Button></div>}
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History</summary><div className="pt-4"><Timeline events={entry.history} /></div></details></Panel>)}
      {!data.expenses.some((e) => e.kind !== "petty_topup") && <EmptyState icon={Landmark}>No spending requests yet.</EmptyState>}</div>
    <FormDialog open={creating} onOpenChange={setCreating} title="New spending request" description="Include the receipt, invoice or quote reference.">
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await run(() => requestExpense(ctx.userName, { kind: form.kind as Exclude<ExpenseKind, "petty_topup">, purpose: form.purpose, category: form.category, amount: num(form.amount), supplier: form.supplier, evidence: form.evidence }, data.policy), "Request submitted.");
        if (result) { setCreating(false); setForm({ ...form, purpose: "", amount: "", evidence: "", supplier: "" }); } }}>
        <Field label="Type"><Choice label="Type" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={Object.entries(EXPENSE_LABELS).filter(([key]) => key !== "petty_topup") as [string, string][]} /></Field>
        <Field label="Purpose"><Input required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><Input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field><Field label="Amount"><Input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Supplier (if any)"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field><Field label="Evidence"><Input required placeholder="Receipt or quote reference" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">Submit request</Button></div>
      </form></FormDialog>
  </div>;
}

function Reconcile({ ctx }: { ctx: OpsContext }) {
  const { data } = ctx; const { busy, run } = useRun(ctx.reload); const [form, setForm] = useState({ date: today(), method: "cash", actual: "", reason: "" }); const [resolution, setResolution] = useState("");
  const system = systemAmountFor(data.sales, data.refunds, form.date, form.method as SalePaymentMode); const variance = form.actual === "" ? null : Math.round((Number(form.actual) - system) * 100) / 100;
  return <div className="space-y-6"><SectionHeader title="Cash and bank reconciliation" description="Compare what the system says was taken with what was actually counted or banked. Any difference stays in the queue with an owner until it is explained." />
    {ctx.can("finance", "manage") && <Panel><div className="grid gap-4 sm:grid-cols-4"><Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field><Field label="Method"><Choice label="Method" value={form.method} onChange={(v) => setForm({ ...form, method: v })} options={METHODS} /></Field>
      <Field label="System says" hint="From recorded payments, net of refunds"><Input readOnly value={money(system)} /></Field><Field label="Counted or banked"><Input type="number" min="0" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} /></Field></div>
      {variance !== null && variance !== 0 && <><p className="text-sm text-warning">Difference of {money(variance)}. Record what you think caused it.</p><Input aria-label="Suspected reason" placeholder="Suspected reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></>}
      <Button disabled={busy || variance === null} onClick={() => void run(() => recordReconciliation(ctx.userName, { date: form.date, method: form.method as SalePaymentMode, systemAmount: system, actualAmount: Number(form.actual), reason: form.reason }), variance === 0 ? "Matched." : "Difference sent to the exceptions queue.")}>{variance === 0 ? "Record match" : "Record reconciliation"}</Button></Panel>}
    <div className="space-y-4">{[...data.reconciliations].reverse().map((entry) => <Panel key={entry.id + entry.history.length}><div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><div className="flex items-center gap-2"><CodeTag code={entry.status === "matched" ? "FIN-13" : "FIN-14"} /><span className="text-xs text-muted-foreground">{entry.number} · {entry.owner}</span></div>
      <h3 className="font-semibold">{entry.method.replace("_", " ")} · {entry.date}</h3><p className="text-sm text-muted-foreground">System {money(entry.systemAmount)} · actual {money(entry.actualAmount)} · difference {money(entry.variance)}</p>{entry.reason && <p className="text-sm text-muted-foreground">Suspected: {entry.reason}</p>}{entry.resolution && <p className="text-sm text-muted-foreground">Explained: {entry.resolution}</p>}</div>
      <Pill tone={entry.status === "exception" ? "bad" : "good"}>{entry.status}</Pill></div>
      {entry.status === "exception" && ctx.can("finance", "manage") && <Step title="Explain the difference"><div className="flex flex-wrap gap-2"><Input aria-label="Explanation" className="w-96" placeholder="What explains it" value={resolution} onChange={(e) => setResolution(e.target.value)} /><Button size="sm" disabled={busy} onClick={() => void run(() => explainReconciliation(ctx.userName, entry.id, resolution), "Difference explained.")}>Mark explained</Button></div></Step>}</Panel>)}
      {!data.reconciliations.length && <EmptyState icon={Landmark}>No reconciliations recorded yet.</EmptyState>}</div></div>;
}

export default function FinanceBoard({ ctx }: { ctx: OpsContext }) {
  const [tab, setTab] = useState("spending");
  return <section className="space-y-6"><Tabbed value={tab} onChange={setTab} tabs={[["spending", "Spending and petty cash"], ["reconcile", "Reconciliation"]]} />
    {tab === "spending" ? <Spending ctx={ctx} /> : <Reconcile ctx={ctx} />}<p className="text-xs text-muted-foreground">Receivables, payables and COD settlements are in the Finance area of the admin dashboard. Purchase orders, corporate quotes and partner charges post to them automatically.</p></section>;
}
