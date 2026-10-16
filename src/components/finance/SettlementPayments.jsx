import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatCurrency } from "../../lib/currency";
import { getSettlements } from "../../finance/lib/settlements";
import { fmtDate, OdooBadge } from "./shared";

// Money received from Speedef against settlements, shown with the other payments.
export function SettlementPayments() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    getSettlements().then((all) => setRows(all.flatMap((s) => s.payments.map((p) => ({ ...p, settlement: s })))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn))));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Speedef settlement payments</CardTitle>
        <CardDescription>Remittances received against COD settlements, with their Odoo reconciliation state.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Settlement</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Recorded by</TableHead><TableHead>Odoo</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No settlement payments yet. Record one from Receivables or COD Billing.</TableCell></TableRow>
              : rows.map((p) => (
                <TableRow key={p.id}><TableCell>{fmtDate(p.paidOn)}</TableCell><TableCell>{p.reference}</TableCell><TableCell>{p.settlement.reference}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell><TableCell>{p.recordedBy}</TableCell><TableCell><OdooBadge odoo={p.odoo} /></TableCell></TableRow>))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
