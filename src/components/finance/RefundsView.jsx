import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Undo2, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { StatCard } from "../ui/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatCurrency } from "../../lib/currency";
import { decideRefund, getRefunds, isWithinRange, updateRefund } from "../../pos/lib/store";
import { currentActor, fmtDate, Pager, paginate, RangeSelect, toneBadge } from "./shared";

const PAGE_SIZE = 10;
const STATUS = [["all", "All statuses"], ["pending", "Pending"], ["paid", "Repaid"], ["cancelled", "Cancelled"]];

function refundBadge(refund) {
  if (refund.status === "paid") return toneBadge("green", "Repaid");
  if (refund.status === "cancelled") return toneBadge("red", "Cancelled");
  if (refund.approval?.status === "required") return toneBadge("amber", "Needs approval");
  return toneBadge("blue", "Awaiting repayment");
}

// Admin view of POS refunds: approve/reject the large ones, confirm repayment, or cancel.
// Uses the same store functions (and rules) as the till's refund panel.
export function RefundsView() {
  const [refunds, setRefunds] = useState([]);
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [note, setNote] = useState({});

  const load = useCallback(async () => setRefunds((await getRefunds()).filter((refund) => !refund.isDemo)), []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => refunds.filter((r) => (status === "all" || r.status === status) && isWithinRange(r.createdAt, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [refunds, status, range]);
  const { slice, pages, current } = paginate(rows, page, PAGE_SIZE);
  const sum = (list) => list.reduce((total, r) => total + r.total, 0);

  const run = async (fn, success) => {
    try { await fn(); toast.success(success); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); }
  };
  const repay = (refund) => {
    const reference = window.prompt("Repayment reference (transfer ID, receipt no.):");
    if (reference?.trim()) run(() => updateRefund(refund.id, "paid", reference), "Refund marked repaid.");
  };
  const cancel = (refund) => {
    const reason = window.prompt("Reason for cancelling this refund:");
    if (reason?.trim()) run(() => updateRefund(refund.id, "cancelled", reason), "Refund cancelled.");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Awaiting Approval" value={String(refunds.filter((r) => r.status === "pending" && r.approval?.status === "required").length)} icon={Clock} color="text-warning" bgColor="bg-warning/15" />
        <StatCard title="Awaiting Repayment" value={formatCurrency(sum(refunds.filter((r) => r.status === "pending" && r.approval?.status !== "required")))} icon={Undo2} />
        <StatCard title="Repaid" value={formatCurrency(sum(refunds.filter((r) => r.status === "paid")))} icon={CheckCircle2} color="text-success" bgColor="bg-success/10" />
        <StatCard title="Cancelled / Rejected" value={String(refunds.filter((r) => r.status === "cancelled").length)} icon={XCircle} color="text-error" bgColor="bg-error/10" />
      </div>
      <Card><CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[170px]" aria-label="Refund status"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <RangeSelect value={range} onChange={(v) => { setRange(v); setPage(1); }} />
        </div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sale</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Raised by</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {slice.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No refunds for these filters. Refunds are raised from the POS terminal.</TableCell></TableRow>
              : slice.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>{fmtDate(refund.createdAt)}</TableCell><TableCell className="font-medium">{refund.saleNumber}</TableCell>
                  <TableCell><Badge variant="outline">{refund.kind === "deposit" ? "Deposit" : "Return"}</Badge></TableCell>
                  <TableCell className="max-w-[220px] truncate" title={refund.reason}>{refund.reason}</TableCell><TableCell>{refund.actor}</TableCell>
                  <TableCell className="text-right">{formatCurrency(refund.total)}</TableCell><TableCell>{refundBadge(refund)}</TableCell>
                  <TableCell className="text-right">
                    {refund.status === "pending" && (
                      <div className="flex flex-wrap justify-end gap-1">
                        {refund.approval?.status === "required" ? (<>
                          <Input aria-label="Decision note" className="h-8 w-36" placeholder="Note (needed to reject)" value={note[refund.id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [refund.id]: e.target.value }))} />
                          <Button size="sm" onClick={() => run(() => decideRefund(refund.id, "approved", currentActor(), "admin", note[refund.id] ?? ""), "Refund approved.")}>Approve</Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => run(() => decideRefund(refund.id, "rejected", currentActor(), "admin", note[refund.id] ?? ""), "Refund rejected.")}>Reject</Button>
                        </>) : (<>
                          <Button size="sm" onClick={() => repay(refund)}>Mark repaid</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel(refund)}>Cancel</Button>
                        </>)}
                      </div>)}
                    {refund.status === "paid" && <span className="text-xs text-muted-foreground">Ref {refund.reference}</span>}
                    {refund.status === "cancelled" && <span className="text-xs text-muted-foreground">{refund.cancellationReason}</span>}
                  </TableCell>
                </TableRow>))}
          </TableBody>
        </Table></div>
        <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
      </CardContent></Card>
    </div>
  );
}
