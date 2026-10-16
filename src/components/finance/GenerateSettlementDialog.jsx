import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatCurrency } from "../../lib/currency";
import { createSettlement, getBillableCodSales } from "../../finance/lib/settlements";
import { COD_COURIER } from "../../pos/lib/store";
import { CodBadge, currentActor, fmtDate } from "./shared";

const monthNow = () => new Date().toISOString().slice(0, 7);
function monthBounds(month) {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(year, mon, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// Pick a billing period -> review the eligible Speedef COD orders -> generate.
// Nothing is written until "Generate settlement"; the lock-protected create
// re-validates eligibility so two admins can't settle the same order.
export function GenerateSettlementDialog({ open, onOpenChange, onCreated }) {
  const [month, setMonth] = useState(monthNow());
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !month) return;
    let live = true;
    const { from, to } = monthBounds(month);
    getBillableCodSales(from, to).then((list) => { if (live) { setSales(list); setSelected(new Set(list.map((sale) => sale.id))); setError(""); } });
    return () => { live = false; };
  }, [open, month]);

  const chosen = useMemo(() => sales.filter((sale) => selected.has(sale.id)), [sales, selected]);
  const gross = chosen.reduce((sum, sale) => sum + sale.total, 0);
  const fees = chosen.reduce((sum, sale) => sum + sale.cod.fee, 0);
  const toggle = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const generate = async () => {
    setBusy(true); setError("");
    try {
      const { from, to } = monthBounds(month);
      const settlement = await createSettlement({ from, to, saleIds: [...selected], actor: currentActor() });
      toast.success(`Settlement ${settlement.reference} generated.`);
      onCreated?.(settlement); onOpenChange(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate the settlement."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate {COD_COURIER} settlement</DialogTitle>
          <DialogDescription>Choose a billing period and review the delivered or collected COD orders before generating.</DialogDescription>
        </DialogHeader>
        <div className="max-w-[200px] space-y-1.5"><Label htmlFor="bill-month">Billing period</Label><Input id="bill-month" type="month" value={month} max={monthNow()} onChange={(e) => setMonth(e.target.value)} /></div>
        <div className="max-h-[320px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"><Checkbox aria-label="Select all" checked={sales.length > 0 && selected.size === sales.length} onCheckedChange={(v) => setSelected(v ? new Set(sales.map((s) => s.id)) : new Set())} /></TableHead>
              <TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Fee</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sales.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No unsettled delivered or collected COD orders in this period.</TableCell></TableRow>
                : sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell><Checkbox aria-label={`Include ${sale.saleNumber}`} checked={selected.has(sale.id)} onCheckedChange={() => toggle(sale.id)} /></TableCell>
                    <TableCell className="font-medium">{sale.saleNumber}</TableCell><TableCell>{sale.customer?.name}</TableCell><TableCell>{fmtDate(sale.createdAt)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(sale.total)}</TableCell><TableCell className="text-right">{formatCurrency(sale.cod.fee)}</TableCell>
                    <TableCell><CodBadge status={sale.cod.status} /></TableCell>
                  </TableRow>))}
            </TableBody>
          </Table>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Gross COD value</p><p className="font-semibold">{formatCurrency(gross)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fees / deductions</p><p className="font-semibold">{formatCurrency(fees)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net amount payable</p><p className="font-semibold">{formatCurrency(gross - fees)}</p></div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || chosen.length === 0} onClick={generate}>{busy ? "Generating..." : `Generate settlement (${chosen.length})`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
