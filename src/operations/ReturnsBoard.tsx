import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PackageX, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SaleRecordDetailModal } from "@/components/SaleRecordDetailModal";
import { getSales, type Sale } from "@/pos/lib/store";
import {
  CONDITION_LABELS, DISPOSITION_LABELS, RETURN_TYPE_LABELS, classifyWarranty, closeReturn, createReturn, getReturns, receiveReturn, recordDisposition, returnStatus, returnableSales,
  type Disposition, type ReturnCase, type ReturnCondition, type ReturnType,
} from "./returns";
import { Choice, CodeTag, EmptyState, errorMessage, Facts, Field, Pill, SectionHeader, Timeline } from "./shared";

const entries = <T extends string>(labels: Record<T, string>) => Object.entries(labels) as [T, string][];

function Case({ item, sale, actor, admin, refresh, openSale }: { item: ReturnCase; sale?: Sale; actor: string; admin: boolean; refresh: () => void; openSale: () => void }) {
  const [busy, setBusy] = useState(false); const [condition, setCondition] = useState<ReturnCondition>("used"); const [serial, setSerial] = useState(""); const [evidence, setEvidence] = useState("");
  const [result, setResult] = useState("covered"); const [assessment, setAssessment] = useState(""); const [kind, setKind] = useState<Disposition>("quarantine"); const [note, setNote] = useState("");
  const status = returnStatus(item);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); await refresh(); toast.success(success); } catch (error) { toast.error(errorMessage(error, "Could not save.")); } finally { setBusy(false); }
  };
  const needsAssessment = item.type === "warranty" && Boolean(item.receipt) && !item.classification;
  return <article className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><CodeTag code={item.type === "warranty" ? "WAR-01" : "RET-01"} /><span className="text-xs text-muted-foreground">{item.number}</span></div>
        <h3 className="font-semibold">{item.item}</h3><p className="text-sm text-muted-foreground">{item.customerName} · {item.saleNumber}{item.serial ? " · " + item.serial : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone="neutral">{RETURN_TYPE_LABELS[item.type]}</Pill><Pill tone={item.closed ? "neutral" : "info"}>{status.label}</Pill></div>
    </div>
    <p className="text-sm">Customer's reason: {item.reason}</p>
    <Facts items={[["Owner", status.owner], ["Waiting on", status.waitingOn], ["Next action", status.next],
      ["Condition on receipt", item.receipt ? CONDITION_LABELS[item.receipt.condition] : "Not received"]]} />
    {item.classification && <p className="text-sm text-muted-foreground">Warranty assessed as {item.classification.result.replace("_", " ")} by {item.classification.by}: {item.classification.note}</p>}
    {item.disposition && <p className="text-sm text-muted-foreground">Outcome: {DISPOSITION_LABELS[item.disposition.kind]} · {item.disposition.note}</p>}
    {!item.closed && <div className="space-y-4">
      {!item.receipt && <div className="space-y-4 rounded-md bg-secondary/40 p-4"><h4 className="text-sm font-semibold">Inventory: receive into Returns Inspection</h4>
        <p className="text-xs text-muted-foreground">Returned items are held in inspection and are never sellable until a disposition is recorded.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Choice label="Condition" value={condition} onChange={(value) => setCondition(value as ReturnCondition)} options={entries(CONDITION_LABELS)} />
          <Input aria-label="Serial or IMEI received" placeholder="Serial / IMEI" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <Input aria-label="What was received" placeholder="What was received" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <Button disabled={busy} onClick={() => void run(() => receiveReturn(actor, item.id, condition, serial, evidence), "Item is now in Returns Inspection.")}>Receive item</Button></div></div>}
      {needsAssessment && <div className="space-y-4 rounded-md bg-secondary/40 p-4"><h4 className="text-sm font-semibold">Technical: warranty assessment</h4>
        {admin ? <div className="grid gap-4 sm:grid-cols-4"><Choice label="Assessment" value={result} onChange={setResult} options={[["covered", "Covered by warranty"], ["not_covered", "Not covered"]]} />
          <div className="sm:col-span-2"><Input aria-label="Assessment findings" placeholder="Findings behind the decision" value={assessment} onChange={(e) => setAssessment(e.target.value)} /></div>
          <Button disabled={busy} onClick={() => void run(() => classifyWarranty(actor, item.id, admin, result as "covered", assessment), "Warranty assessed.")}>Save assessment</Button></div>
          : <p className="text-sm text-muted-foreground">Waiting for a technical or management assessment. Do not promise a warranty outcome to the customer yet.</p>}</div>}
      {item.receipt && !item.disposition && !needsAssessment && <div className="space-y-4 rounded-md bg-secondary/40 p-4"><h4 className="text-sm font-semibold">Disposition</h4>
        <div className="grid gap-4 sm:grid-cols-4"><Choice label="Outcome" value={kind} onChange={(value) => setKind(value as Disposition)} options={entries(DISPOSITION_LABELS)} />
          <div className="sm:col-span-2"><Input aria-label="Evidence or reason" placeholder="Evidence or reason" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button disabled={busy} onClick={() => void run(() => recordDisposition(actor, item.id, kind, note), "Disposition recorded.")}>Record outcome</Button></div></div>}
      {item.disposition?.kind === "refund" && <div className="flex flex-wrap items-center gap-4 rounded-md bg-secondary/40 p-4"><p className="text-sm text-muted-foreground">Create and pay the refund from the sale record. This case closes once the money is paid.</p>
        <Button size="sm" variant="outline" disabled={!sale} onClick={openSale}>Open sale record</Button></div>}
      {item.disposition && <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={() => void run(() => closeReturn(actor, item.id, note), "Case closed.")}>Close case</Button></div>}
    </div>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History ({item.history.length})</summary><div className="pt-4"><Timeline events={item.history} /></div></details>
  </article>;
}

export default function Returns({ roles, userName }: { roles: string[]; userName: string }) {
  const [cases, setCases] = useState<ReturnCase[]>([]); const [sales, setSales] = useState<Sale[]>([]); const [view, setView] = useState("active");
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false); const [saleSel, setSaleSel] = useState<Sale | null>(null);
  const [form, setForm] = useState({ saleId: "", line: "", type: "return" as ReturnType, serial: "", reason: "" });
  const load = async () => { try { const [all, orders] = await Promise.all([getReturns(), getSales()]); setCases(all); setSales(orders); } catch { toast.error("Could not load returns."); } };
  useEffect(() => { void load(); }, []);
  const sale = sales.find((entry) => entry.id === form.saleId);
  const visible = cases.filter((entry) => view === "all" || (view === "active") === !entry.closed).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-6">
    <SectionHeader title="Returns and warranty" description="One record per case. Items are inspected before any restock, refund or supplier return." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Log return</Button>} />
    <div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["active", "Active (" + cases.filter((entry) => !entry.closed).length + ")"], ["closed", "Closed"], ["all", "All"]]} /></div>
    <div className="space-y-4 motion-stagger">{visible.map((item) => <Case key={item.id + item.history.length} item={item} sale={sales.find((entry) => entry.id === item.saleId)} actor={userName} admin={roles.includes("admin")} refresh={load} openSale={() => setSaleSel(sales.find((entry) => entry.id === item.saleId) ?? null)} />)}</div>
    {!visible.length && <EmptyState icon={PackageX}>No return cases here.</EmptyState>}
    <SaleRecordDetailModal sale={saleSel} open={Boolean(saleSel)} onOpenChange={(open: boolean) => { if (!open) { setSaleSel(null); void load(); } }} />
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent style={{ maxWidth: "36rem", maxHeight: "85vh", overflowY: "auto" }}>
      <DialogHeader><DialogTitle>Log a return</DialogTitle><DialogDescription>Link the original sale first. Do not promise a warranty outcome before assessment.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true);
        try { await createReturn(userName, sale, { type: form.type, item: form.line, serial: form.serial, reason: form.reason });
          setCreating(false); setForm({ saleId: "", line: "", type: "return", serial: "", reason: "" }); await load(); toast.success("Return logged."); }
        catch (error) { toast.error(errorMessage(error, "Could not log return.")); } finally { setBusy(false); } }}>
        <Field label="Original sale"><Choice label="Original sale" value={form.saleId} placeholder="Choose the original sale" onChange={(value) => setForm({ ...form, saleId: value, line: "" })}
          options={returnableSales(sales).slice(-100).reverse().map((entry): [string, string] => [entry.id, entry.saleNumber + " · " + (entry.customer?.name ?? "Walk-in") + " · " + new Date(entry.createdAt).toLocaleDateString()])} /></Field>
        {sale && <Field label="Item"><Choice label="Item" value={form.line} placeholder="Choose the item" onChange={(value) => setForm({ ...form, line: value })} options={sale.lines.map((line): [string, string] => [line.name, line.name])} /></Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Choice label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value as ReturnType })} options={entries(RETURN_TYPE_LABELS)} /></Field>
          <Field label="Serial or IMEI (if known)"><Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></Field></div>
        <Field label="Customer's reason"><Input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">{busy ? "Saving..." : "Log return"}</Button></div>
      </form></DialogContent></Dialog>
  </section>;
}
