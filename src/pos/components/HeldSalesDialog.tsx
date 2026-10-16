import { useEffect, useState } from "react";
import { PauseCircle, Loader2, Trash2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { discardHeldSale, getHeldSales, type HeldSale } from "@/pos/lib/store";

interface HeldSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: (heldSaleId: string) => void;
  refreshKey: number;
}

export default function HeldSalesDialog({ open, onOpenChange, onResume, refreshKey }: HeldSalesDialogProps) {
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    getHeldSales()
      .then((data) => {
        if (mounted) setHeld(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, refreshKey]);

  const handleDiscard = async (id: string) => {
    await discardHeldSale(id);
    setHeld((prev) => prev.filter((sale) => sale.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh]" style={{ maxWidth: "28rem", maxHeight: "80vh" }}>
        <DialogHeader>
          <div className="flex items-center gap-4">
            <PauseCircle className="w-5 h-5 text-muted-foreground" />
            <div>
              <DialogTitle>Held Sales</DialogTitle>
              <DialogDescription>Resume a parked sale or discard it.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(80vh-120px)] pr-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : held.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No held sales.</p>
          ) : (
            <div className="space-y-2">
              {held.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{sale.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.lines.reduce((sum, l) => sum + l.quantity, 0)} item(s) ·{" "}
                      {formatCurrency(sale.subtotal)} · {new Date(sale.heldAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" onClick={() => onResume(sale.id)}>
                      <PlayCircle className="h-4 w-4 mr-1" />
                      Resume
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={`Discard held sale ${sale.label}`}
                      onClick={() => handleDiscard(sale.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
