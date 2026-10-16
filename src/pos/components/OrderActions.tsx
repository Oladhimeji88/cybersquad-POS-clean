import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuth } from "@/frontdesk/lib/store";
import { userHasRole } from "@/auth/roleUtils";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { addOrderPayment, collectOrder, cancelUnpaidOrder, orderBalance, type Sale, type SalePaymentMode } from "../lib/store";

export default function OrderActions({ sale: initial, onChanged }: { sale: Sale; onChanged: () => void }) {
  const [sale, setSale] = useState(initial); const [amount, setAmount] = useState(""); const [mode, setMode] = useState<SalePaymentMode>("cash");
  const [verified, setVerified] = useState(false); const [busy, setBusy] = useState(false); const [actor, setActor] = useState("");
  const [allowed, setAllowed] = useState(false);
  useEffect(() => { setSale(initial); getAuth().then((user) => { setActor(user?.name ?? ""); setAllowed(userHasRole(user, "sales", "admin")); }); }, [initial]);
  if (sale.lifecycle !== "reserved") return null;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Order action failed."); } finally { setBusy(false); } };
  return <section className="rounded-lg border border-border p-4 space-y-4">
    <p className="font-medium">Awaiting collection ? Balance {formatCurrency(orderBalance(sale))}</p>
    <p className="text-sm">Expected collection: {sale.collectionDueAt ? new Date(sale.collectionDueAt).toLocaleString() : "Not set"}</p>
    {allowed && <>
      {orderBalance(sale) > 0 && <div className="flex flex-wrap gap-2"><Input className="w-36" type="number" step="0.01" min="0.01" max={orderBalance(sale)} aria-label="Order payment amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <select aria-label="Order payment method" className="border rounded p-2 bg-background" value={mode} onChange={(event) => setMode(event.target.value as SalePaymentMode)}><option value="cash">Cash</option><option value="pos">Card terminal</option><option value="bank_transfer">Bank transfer</option></select>
        <Button disabled={busy} onClick={() => void run(async () => { setSale(await addOrderPayment(sale.id, Number(amount), mode)); setAmount(""); })}>Record received payment</Button>
      </div>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />I verified the customer and the exact items / device identifiers being collected.</label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !verified || orderBalance(sale) !== 0} onClick={() => void run(async () => { setSale(await collectOrder(sale.id, actor, verified)); toast.success("Collection recorded."); })}>Confirm collection</Button>
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await cancelUnpaidOrder(sale.id); setSale({ ...sale, lifecycle: "cancelled" }); toast.success("Order cancelled."); })}>Cancel after deposit repayment</Button></div>
    </>}
  </section>;
}
