import { useEffect, useState } from "react";
import DeviceDetails from "../pos/components/DeviceDetails";
import RefundPanel from "../pos/components/RefundPanel";
import OrderActions from "../pos/components/OrderActions";
import { getSales } from "../pos/lib/store";
import { Printer, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { formatCurrency } from "../frontdesk/lib/invoice";
import { PAYMENT_MODE_LABELS, getSettings } from "../frontdesk/lib/store";
import { getSalePayments } from "../pos/lib/store";
import { printSaleReceipt } from "../pos/lib/receipt";

export function SaleRecordDetailModal({ open, onOpenChange, sale: inputSale }) {
  const [sale, setSale] = useState(inputSale);
  useEffect(() => setSale(inputSale), [inputSale]);
  const refreshSale = () => getSales().then((sales) => setSale(sales.find((entry) => entry.id === inputSale?.id) ?? inputSale));
  const [settings, setSettings] = useState(undefined);

  useEffect(() => {
    if (!open) return;
    getSettings().then(setSettings);
  }, [open]);

  const payments = sale ? getSalePayments(sale) : [];
  const isSplit = payments.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]" style={{ maxWidth: "42rem", maxHeight: "85vh", overflowY: "auto" }}>
        {sale && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-4">
                <Receipt className="w-5 h-5 text-muted-foreground" />
                <div>
                  <DialogTitle>{sale.saleNumber}</DialogTitle>
                  <DialogDescription>
                    {new Date(sale.createdAt).toLocaleString()} · Cashier {sale.cashierName}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Badge variant="outline">{sale.channel === "website" ? "Website" : "In-Store"}</Badge>
              {sale.cod ? (
                <Badge variant="outline">COD - {sale.cod.status}</Badge>
              ) : isSplit ? (
                <Badge variant="outline">Split Payment</Badge>
              ) : (
                <Badge variant="outline">{PAYMENT_MODE_LABELS[payments[0]?.mode] ?? payments[0]?.mode}</Badge>
              )}
            </div>

            {sale.isDemo && <Badge variant="outline">Sample sale</Badge>}
            {sale.customer && <p className="text-sm">Customer: {sale.customer.name} · {sale.customer.phone}</p>}
            {sale.note && <p className="text-sm">Customer note: {sale.note}</p>}
            <p className="text-sm">Status: {sale.lifecycle ?? "completed"}</p>
            <OrderActions sale={sale} onChanged={refreshSale} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lines.map((line) => (
                  <TableRow key={line.productId}>
                    <TableCell>{line.name}<DeviceDetails line={line} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{line.sku ?? "—"}</TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell>{formatCurrency(line.unitPrice)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(line.unitPrice * line.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="space-y-1 border-t border-border pt-4">
              {sale.discount?.amount > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal {formatCurrency(sale.subtotal)} · Discount ({sale.discount.reason})</span>
                  <span>-{formatCurrency(sale.discount.amount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
              {isSplit ? (
                payments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode}</span>
                    <span>{formatCurrency(payment.amount)}</span>
                  </div>
                ))
              ) : (
                payments[0]?.mode === "cash" &&
                payments[0].cashTendered !== undefined && (
                  <>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Cash Tendered</span>
                      <span>{formatCurrency(payments[0].cashTendered)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Change Due</span>
                      <span>{formatCurrency(payments[0].changeDue ?? 0)}</span>
                    </div>
                  </>
                )
              )}
            </div>

            <RefundPanel key={sale.id} sale={sale} onChanged={refreshSale} />
            <DialogFooter>
              <Button variant="outline" onClick={() => printSaleReceipt(sale, settings)}>
                <Printer className="w-4 h-4 mr-2" />
                Print Receipt
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
