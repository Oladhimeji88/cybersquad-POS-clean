import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatCurrency } from "../../lib/currency";
import { filterRows, ledgerTotals } from "./ledger";
import { fmtDate, LoadingRow, OdooUnavailable, Pager, paginate, RangeSelect, ReceivableBadge, PrototypeBanner } from "./shared";

const STATUS_OPTIONS = [["all", "All statuses"], ["outstanding", "Outstanding"], ["partially_paid", "Partially Paid"], ["paid", "Paid"], ["overdue", "Overdue"]];
const PAGE_SIZE = 10;

// One table + filter bar used by both Receivables and Payables. `stats` is
// rendered by the caller (each has its own four cards); `rowAction` lets
// Receivables offer "Record payment" on Speedef settlements.
export function LedgerView({ rows, loading, unavailable, partyLabel, referenceLabel, unavailableWhat, renderStats, rowAction, extraFilter, emptyText }) {
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const scoped = extraFilter ? rows.filter(extraFilter) : rows;
  const filtered = useMemo(() => filterRows(scoped, { range, status, query }), [scoped, range, status, query]);
  const totals = useMemo(() => ledgerTotals(rows), [rows]);
  const { slice, pages, current } = paginate(filtered, page, PAGE_SIZE);
  const reset = (setter) => (value) => { setter(value); setPage(1); };

  return (
    <div className="space-y-4">
      <PrototypeBanner />
      {renderStats(totals, rows)}
      {unavailable && <OdooUnavailable what={unavailableWhat} />}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder={`Search by ${partyLabel.toLowerCase()} or reference...`} value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
            </div>
            <Select value={status} onValueChange={reset(setStatus)}>
              <SelectTrigger className="w-[160px]" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <RangeSelect value={range} onChange={reset(setRange)} />
          </div>
          {loading ? <LoadingRow /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{partyLabel}</TableHead><TableHead>{referenceLabel}</TableHead>
                    <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead>
                    <TableHead>Issue Date</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead>
                    {rowAction && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.length === 0 ? (
                    <TableRow><TableCell colSpan={rowAction ? 8 : 7} className="py-8 text-center text-muted-foreground">{emptyText}</TableCell></TableRow>
                  ) : slice.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.party}</TableCell>
                      <TableCell>{row.reference}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                      <TableCell>{fmtDate(row.issuedOn)}</TableCell>
                      <TableCell>{fmtDate(row.dueOn)}</TableCell>
                      <TableCell><ReceivableBadge status={row.status} /></TableCell>
                      {rowAction && <TableCell className="text-right">{rowAction(row)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={current} pages={pages} total={filtered.length} size={PAGE_SIZE} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
