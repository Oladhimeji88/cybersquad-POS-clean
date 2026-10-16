import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Boxes, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import type { SaleCustomer } from "@/pos/lib/devices";
import CustomerPicker from "./CustomerPicker";
import { can } from "./access";
import { DEFAULT_POLICY, getPolicy, type OpsPolicy } from "./policy";
import {
  LOST_REASONS, activeOffer, addSupplierOption, closeSourcing, commitToOffer, createPurchase, createSourcing, directMargin, formatMinutes, getSourcing,
  receiveIntoStore, recordDelivery, recordRemittance, redactSupplierDetail, reportSupplierFailure, returnOffer, sourcingStatus, sourcingTiming, suggestedPrice,
  type PaymentTerms, type SourcingPath, type SourcingRequest,
} from "./sourcing";
import { Choice, CodeTag, EmptyState, errorMessage, Facts, Field, Pill, SectionHeader, Timeline, type Tone } from "./shared";

type Perms = { actor: string; procurement: boolean; inventory: boolean; finance: boolean };
const TIMING_TONE: Record<string, Tone> = { on_track: "good", approaching: "warn", breached: "bad", done: "neutral" };
const TIMING_LABEL: Record<string, string> = { on_track: "On track", approaching: "Nearing target", breached: "Past target", done: "Closed" };

function useRun(refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); await refresh(); toast.success(success); }
    catch (error) { toast.error(errorMessage(error, "Could not save.")); } finally { setBusy(false); }
  };
  return { busy, run };
}
function Step({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-4 rounded-md bg-secondary/40 p-4"><h4 className="text-sm font-semibold">{title}</h4>{children}</div>;
}

function Card({ request: source, perms, policy, refresh }: { request: SourcingRequest; perms: Perms; policy: OpsPolicy; refresh: () => void }) {
  const request = perms.procurement ? source : redactSupplierDetail(source);
  const { busy, run } = useRun(refresh);
  const status = sourcingStatus(request); const timing = sourcingTiming(request, policy); const offer = activeOffer(request); const margin = directMargin(source);
  const [opt, setOpt] = useState({ supplier: "", cost: "", availability: "full", qty: "1", eta: "30", note: "" });
  const [pick, setPick] = useState(""); const [price, setPrice] = useState("");
  const [terms, setTerms] = useState<PaymentTerms>("prepaid"); const [paid, setPaid] = useState("");
  const [path, setPath] = useState<SourcingPath>("store"); const [ref, setRef] = useState(""); const [serial, setSerial] = useState("");
  const [recipient, setRecipient] = useState(""); const [podRef, setPodRef] = useState(""); const [pack, setPack] = useState(false);
  const [note, setNote] = useState(""); const [reason, setReason] = useState("");
  const chosen = source.options.find((entry) => entry.id === pick);
  const needsPackaging = (request.path === "direct" && policy.directPackaging === "required");
  const stage = status.label;
  return <article className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><CodeTag code={request.path === "direct" ? "SAL-09" : "SAL-04"} /><span className="text-xs text-muted-foreground">{request.number}</span>
          {request.urgent && <Pill tone="warn">Urgent</Pill>}</div>
        <h3 className="font-semibold">{request.product} × {request.quantity}</h3>
        <p className="text-sm text-muted-foreground">{request.customer.name} · {request.customer.phone}{request.specification ? " · " + request.specification : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={request.closed ? "neutral" : "info"}>{status.label}</Pill>
        <Pill tone={TIMING_TONE[timing.state]}>{formatMinutes(timing.elapsedMinutes)} of {timing.target} min · {TIMING_LABEL[timing.state]}</Pill></div>
    </div>
    <Facts items={[["Owner", status.owner], ["Waiting on", status.waitingOn], ["Next action", status.next],
      ["Customer price and ETA", offer ? formatCurrency(offer.price) + " · " + offer.etaMinutes + " min (v" + offer.version + ")" : "Not quoted yet"]]} />
    {request.priceReview && <p className="rounded-md bg-warning/15 p-4 text-sm text-warning">{request.priceReview.note} The customer must re-confirm before the purchase continues.</p>}
    {request.failure && <p className="rounded-md bg-error/10 p-4 text-sm text-error">Supplier failed: {request.failure.note}</p>}
    {request.commitment && <p className="text-sm text-muted-foreground">Customer committed to offer v{request.commitment.offerVersion} · {request.commitment.terms.toUpperCase()}{request.commitment.amountPaid ? " · " + formatCurrency(request.commitment.amountPaid) + " received" : ""}</p>}
    {perms.procurement && margin !== undefined && <p className="text-sm text-muted-foreground">Cost {formatCurrency((request.purchase?.unitCost ?? 0) * request.quantity)} · Margin {formatCurrency(margin)}</p>}

    {!request.closed && <div className="space-y-4">
      {perms.procurement && !request.purchase && <Step title="Procurement: supplier comparison">
        {source.options.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-4">Supplier</th><th className="pr-4">Cost</th><th className="pr-4">Availability</th><th>ETA</th></tr></thead>
          <tbody>{source.options.map((entry) => <tr key={entry.id} className="border-t border-border"><td className="py-2 pr-4">{entry.supplier}</td><td className="pr-4 tabular-nums">{formatCurrency(entry.cost)}</td>
            <td className="pr-4">{entry.availability === "none" ? "Not available" : entry.availability + " · " + entry.availableQty}</td><td>{entry.etaMinutes} min</td></tr>)}</tbody></table></div>}
        <form className="grid gap-4 sm:grid-cols-6" onSubmit={(event) => { event.preventDefault();
          void run(() => addSupplierOption(perms.actor, request.id, { supplier: opt.supplier, cost: Number(opt.cost), availability: opt.availability as "full", availableQty: opt.availability === "none" ? 0 : Number(opt.qty), etaMinutes: Number(opt.eta) }), "Supplier option recorded.")
            .then(() => setOpt({ ...opt, supplier: "", cost: "" })); }}>
          <div className="sm:col-span-2"><Input aria-label="Supplier" required placeholder="Approved supplier" value={opt.supplier} onChange={(e) => setOpt({ ...opt, supplier: e.target.value })} /></div>
          <Input aria-label="Unit cost" required type="number" min="0" step="any" placeholder="Unit cost" value={opt.cost} onChange={(e) => setOpt({ ...opt, cost: e.target.value })} />
          <Choice label="Availability" value={opt.availability} onChange={(value) => setOpt({ ...opt, availability: value })} options={[["full", "Full"], ["partial", "Partial"], ["none", "None"]]} />
          <Input aria-label="Units available" type="number" min="1" placeholder="Units" disabled={opt.availability === "none"} value={opt.qty} onChange={(e) => setOpt({ ...opt, qty: e.target.value })} />
          <Input aria-label="ETA in minutes" required type="number" min="0" placeholder="ETA (min)" value={opt.eta} onChange={(e) => setOpt({ ...opt, eta: e.target.value })} />
          <div className="sm:col-span-6"><Button size="sm" variant="outline" disabled={busy} type="submit">Record supplier option</Button></div>
        </form>
        {source.options.some((entry) => entry.availability !== "none") && <form className="grid gap-4 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(() => returnOffer(perms.actor, request.id, pick, Number(price), policy), "Price and ETA returned to Sales."); }}>
          <div className="sm:col-span-2"><Choice label="Chosen supplier" value={pick} placeholder="Choose supplier" onChange={(value) => { setPick(value); const option = source.options.find((entry) => entry.id === value); if (option) setPrice(String(suggestedPrice(option.cost, policy.marginPercent))); }}
            options={source.options.filter((entry) => entry.availability !== "none").map((entry): [string, string] => [entry.id, entry.supplier + " · " + formatCurrency(entry.cost)])} /></div>
          <Input aria-label="Customer price" required type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Button disabled={busy || !pick} type="submit">Return price and ETA</Button>
          {chosen && <p className="text-xs text-muted-foreground sm:col-span-4">Suggested from {policy.marginPercent}% margin policy. Sales sees only the final price and ETA.</p>}
        </form>}
      </Step>}

      {offer && !request.commitment && !request.failure && <Step title="Sales: customer decision">
        <form className="grid gap-4 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(() => commitToOffer(perms.actor, request.id, terms, Number(paid || 0)), "Customer commitment recorded."); }}>
          <Choice label="Payment" value={terms} onChange={(value) => setTerms(value as PaymentTerms)} options={[["prepaid", "Paid in full"], ["deposit", "Deposit"], ["cod", "Cash on delivery"]]} />
          <Input aria-label="Amount received" type="number" min="0" step="any" disabled={terms === "cod"} placeholder="Amount received" value={paid} onChange={(e) => setPaid(e.target.value)} />
          <Button disabled={busy} type="submit">Customer confirmed</Button>
        </form>
      </Step>}

      {perms.procurement && request.commitment && !request.purchase && <Step title="Procurement: create purchase">
        <form className="grid gap-4 sm:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void run(() => createPurchase(perms.actor, request.id, path, "", ref, serial), "Purchase recorded."); }}>
          <Choice label="Fulfilment path" value={path} onChange={(value) => setPath(value as SourcingPath)} options={[["store", "Supplier to store"], ["direct", "Supplier direct to customer"]]} />
          <Input aria-label="Purchase reference" required placeholder="PO / supplier reference" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Input aria-label="Serial or IMEI" placeholder="Serial / IMEI if known" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <Button disabled={busy} type="submit">Create purchase</Button>
          <p className="text-xs text-muted-foreground sm:col-span-5">{path === "store" ? "The item only becomes store stock after Inventory receives it." : "Direct fulfilment never creates store stock."}</p>
        </form>
      </Step>}

      {perms.inventory && request.path === "store" && request.purchase && !request.receipt && <Step title="Inventory: physical receipt">
        <form className="grid gap-4 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(() => receiveIntoStore(perms.actor, request.id, serial, note, true), "Received into the shop."); }}>
          <Input aria-label="Serial or IMEI at receipt" placeholder={request.purchase.serial ? "Expected " + request.purchase.serial : "Serial / IMEI"} value={serial} onChange={(e) => setSerial(e.target.value)} />
          <div className="sm:col-span-2"><Input aria-label="Receipt note" placeholder="Condition / discrepancy note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button disabled={busy} type="submit">Confirm physical receipt</Button>
        </form>
      </Step>}

      {request.purchase && !request.delivery && (request.path === "direct" || request.receipt) && <Step title={request.path === "direct" ? "Direct delivery: proof of delivery" : "Handover to customer"}>
        <form className="grid gap-4 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(() => recordDelivery(perms.actor, request.id, recipient, podRef, pack, policy), "Delivery recorded."); }}>
          <Input aria-label="Received by" required placeholder="Received by" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <Input aria-label="Delivery reference" placeholder="Waybill / reference" value={podRef} onChange={(e) => setPodRef(e.target.value)} />
          {needsPackaging && <label className="flex items-center gap-2 text-sm"><Checkbox checked={pack} onCheckedChange={(value) => setPack(value === true)} />Required packaging applied</label>}
          <Button disabled={busy} type="submit">Record delivery</Button>
        </form>
      </Step>}

      {perms.finance && request.commitment?.terms === "cod" && request.delivery && !request.remittedAt && <Step title="Finance: COD receivable">
        <p className="text-sm text-muted-foreground">Delivered, but the cash balance is still outstanding until the courier remits it.</p>
        <Button size="sm" disabled={busy} onClick={() => void run(() => recordRemittance(perms.actor, request.id), "COD remittance recorded.")}>Record remittance</Button>
      </Step>}

      <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
        {stage === "Ready to close" && <Button size="sm" disabled={busy} onClick={() => void run(() => closeSourcing(perms.actor, request.id, "fulfilled", ""), "Request fulfilled.")}>Close as fulfilled</Button>}
        {perms.procurement && request.purchase && !request.delivery && !request.failure && <div className="flex gap-2"><Input aria-label="Supplier problem" className="w-64" placeholder="What went wrong with the supplier?" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => reportSupplierFailure(perms.actor, request.id, note), "Supplier failure escalated.")}>Report supplier failure</Button></div>}
        <div className="flex gap-2"><div className="w-56"><Choice label="Close reason" value={reason} placeholder="Reason to close" onChange={setReason} options={LOST_REASONS.map((entry): [string, string] => [entry, entry])} /></div>
          <Button size="sm" variant="outline" disabled={busy || !reason} onClick={() => void run(() => closeSourcing(perms.actor, request.id, "lost", reason), "Marked lost.")}>Mark lost</Button>
          <Button size="sm" variant="outline" disabled={busy || !reason} onClick={() => void run(() => closeSourcing(perms.actor, request.id, "cancelled", reason), "Request cancelled.")}>Cancel</Button></div>
      </div>
    </div>}
    <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">History ({request.history.length})</summary><div className="pt-4"><Timeline events={request.history} /></div></details>
  </article>;
}

export default function Sourcing({ roles, userName }: { roles: string[]; userName: string }) {
  const [requests, setRequests] = useState<SourcingRequest[]>([]); const [policy, setPolicy] = useState<OpsPolicy>(DEFAULT_POLICY);
  const [view, setView] = useState("active"); const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<SaleCustomer>(); const [form, setForm] = useState({ product: "", specification: "", quantity: "1", urgent: false });
  const perms: Perms = { actor: userName, procurement: can(roles, "procure", "manage"), finance: can(roles, "finance", "manage"), inventory: can(roles, "inventory", "manage") };
  const load = async () => { try { const [all, current] = await Promise.all([getSourcing(), getPolicy()]); setRequests(all); setPolicy(current); } catch { toast.error("Could not load sourcing requests."); } };
  useEffect(() => { void load(); }, []);
  const visible = requests.filter((entry) => view === "all" || (view === "active") === !entry.closed).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className="space-y-6">
    <SectionHeader title="Sourcing" description="Items Cybervilla does not have in the shop. Supplier stock is never shown as store stock." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Source an item</Button>} />
    <div className="w-48"><Choice label="View" value={view} onChange={setView} options={[["active", "Active (" + requests.filter((entry) => !entry.closed).length + ")"], ["closed", "Closed"], ["all", "All"]]} /></div>
    <div className="space-y-4 motion-stagger">{visible.map((request) => <Card key={request.id + request.history.length} request={request} perms={perms} policy={policy} refresh={load} />)}</div>
    {!visible.length && <EmptyState icon={Boxes}>No sourcing requests here. Start one from a customer who wants an item that is not in the shop.</EmptyState>}
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent style={{ maxWidth: "36rem", maxHeight: "85vh", overflowY: "auto" }}>
      <DialogHeader><DialogTitle>Source an item</DialogTitle><DialogDescription>Procurement is assigned straight away and the {policy.sourcingTargetMinutes}-minute target clock starts.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true);
        try { await createSourcing(userName, { customer: customer as SaleCustomer, product: form.product, specification: form.specification, quantity: Number(form.quantity), urgent: form.urgent });
          setCreating(false); setForm({ product: "", specification: "", quantity: "1", urgent: false }); setCustomer(undefined); await load(); toast.success("Sourcing started."); }
        catch (error) { toast.error(errorMessage(error, "Could not start sourcing.")); } finally { setBusy(false); } }}>
        <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
        <Field label="Exact product"><Input required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></Field>
        <Field label="Specification (colour, storage, condition)"><Input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Quantity"><Input type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={form.urgent} onCheckedChange={(value) => setForm({ ...form, urgent: value === true })} />Customer needs it urgently</label></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit">{busy ? "Saving..." : "Start sourcing"}</Button></div>
      </form></DialogContent></Dialog>
  </section>;
}
