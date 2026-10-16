import DeviceDetails from "./DeviceDetails";
import { CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { PAYMENT_MODE_LABELS, type AppSettings } from "@/frontdesk/lib/store";
import { printSaleReceipt } from "@/pos/lib/receipt";
import { getSalePayments, type Sale } from "@/pos/lib/store";

interface SaleCompleteDialogProps {
  sale: Sale | null;
  settings?: Partial<AppSettings>;
  onNewSale: () => void;
}

export default function SaleCompleteDialog({ sale, settings, onNewSale }: SaleCompleteDialogProps) {
  const payments = sale ? getSalePayments(sale) : [];
  const isSplit = payments.length > 1;

  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onNewSale()}>
      <DialogContent className="sm:max-w-sm" style={{ maxWidth: "24rem" }}>
        {sale && (
          <>
            <DialogHeader className="items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-success" />
              <DialogTitle>{sale.isDemo ? "Sample Sale Complete" : "Sale Complete"}</DialogTitle>
              <DialogDescription>{sale.saleNumber}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">{formatCurrency(sale.total)}</span>
              </div>
              {sale.cod && (
                <div className="rounded-md bg-warning/15 p-2 text-sm text-warning">
                  Cash on delivery - payment pending. {sale.cod.courier} will collect {formatCurrency(sale.total)} from the customer.
                </div>
              )}
              {isSplit ? (
                payments.map((payment, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{PAYMENT_MODE_LABELS[payment.mode]}</span>
                    <span className="text-foreground">{formatCurrency(payment.amount)}</span>
                  </div>
                ))
              ) : (
                payments[0]?.mode === "cash" &&
                payments[0].cashTendered !== undefined && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cash Tendered</span>
                      <span className="text-foreground">{formatCurrency(payments[0].cashTendered)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Change Due</span>
                      <span className="font-semibold text-success">
                        {formatCurrency(payments[0].changeDue ?? 0)}
                      </span>
                    </div>
                  </>
                )
              )}
            </div>

            <div className="space-y-4 max-h-[35vh] overflow-y-auto">
              {sale.customer && <p className="text-sm">{sale.customer.name} · {sale.customer.phone}</p>}
              {sale.lines.filter((line) => line.devices?.length).map((line) => <div key={line.productId}>
                <p className="text-sm font-medium">{line.name}</p><DeviceDetails line={line} />
              </div>)}
            </div>
            <DialogFooter className="sm:flex-col gap-2">
              <Button className="w-full" variant="outline" onClick={() => printSaleReceipt(sale, settings)}>
                <Printer className="w-4 h-4 mr-2" />
                Print Receipt
              </Button>
              <Button className="w-full" onClick={onNewSale}>
                New Sale
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
