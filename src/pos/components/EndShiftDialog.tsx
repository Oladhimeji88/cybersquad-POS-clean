import { useState } from "react";
import { Wallet, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { endShift, type CashShift } from "@/pos/lib/store";

interface EndShiftDialogProps {
  open: boolean;
  shift: CashShift | null;
  onOpenChange: (open: boolean) => void;
  onEnded: () => void;
  showVariance?: boolean;
}

export default function EndShiftDialog({ open, shift, onOpenChange, onEnded, showVariance = false }: EndShiftDialogProps) {
  const [closingFloat, setClosingFloat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CashShift | null>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setClosingFloat("");
      setResult(null);
      if (result) onEnded();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (!shift) return;
    const value = Number(closingFloat);
    if (!closingFloat || Number.isNaN(value) || value < 0) return;

    setSubmitting(true);
    try {
      const updated = await endShift(shift.id, value);
      setResult(updated);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm" style={{ maxWidth: "24rem" }}>
        {!result ? (
          <>
            <DialogHeader className="items-center text-center">
              <Wallet className="w-10 h-10 text-primary" />
              <DialogTitle>End Shift</DialogTitle>
              <DialogDescription>Count the cash in the drawer and enter the closing float.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="closing-float">Closing Float (counted cash)</Label>
              <Input
                id="closing-float"
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                value={closingFloat}
                onChange={(e) => setClosingFloat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button disabled={!closingFloat || submitting} onClick={handleSubmit}>
                {submitting ? "Calculating..." : "End Shift"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="items-center text-center">
              <CheckCircle2 className="w-10 h-10 text-success" />
              <DialogTitle>Shift Ended</DialogTitle>
              <DialogDescription>{showVariance ? "Reconciliation summary" : "Shift closure recorded for admin review"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Opening Float</span>
                <span className="text-foreground">{formatCurrency(result.openingFloat)}</span>
              </div>
              {showVariance && <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="text-foreground">{formatCurrency(result.cashSalesTotal ?? 0)}</span>
              </div>}
              {showVariance && <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expected Cash</span>
                <span className="text-foreground">{formatCurrency(result.expectedCash ?? 0)}</span>
              </div>}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Counted Cash</span>
                <span className="text-foreground">{formatCurrency(result.closingFloat ?? 0)}</span>
              </div>
              {showVariance ? <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-medium">
                <span>Variance</span>
                <span
                  className={`flex items-center gap-1 ${
                    (result.variance ?? 0) === 0
                      ? "text-foreground"
                      : (result.variance ?? 0) > 0
                      ? "text-success"
                      : "text-destructive"
                  }`}
                >
                  {(result.variance ?? 0) > 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (result.variance ?? 0) < 0 ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : null}
                  {formatCurrency(Math.abs(result.variance ?? 0))}
                  {(result.variance ?? 0) > 0 ? " over" : (result.variance ?? 0) < 0 ? " short" : ""}
                </span>
              </div> : <p className="rounded-md bg-secondary px-4 py-2 text-sm text-muted-foreground">
                Variance and reconciliation details are visible to admins only.
              </p>}
            </div>

            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}