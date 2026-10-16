import { useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { getShifts, type CashShift } from "@/pos/lib/store";

interface ShiftHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showVariance?: boolean;
}

function VarianceCell({ shift }: { shift: CashShift }) {
  if (shift.variance === undefined) return <>-</>;
  return (
    <span
      className={
        shift.variance === 0
          ? "text-foreground"
          : shift.variance > 0
          ? "text-success"
          : "text-destructive"
      }
    >
      {formatCurrency(Math.abs(shift.variance))}
      {shift.variance > 0 ? " over" : shift.variance < 0 ? " short" : ""}
    </span>
  );
}

export function ShiftHistoryTable({ showVariance = false }: { showVariance?: boolean }) {
  const [shifts, setShifts] = useState<Awaited<ReturnType<typeof getShifts>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getShifts()
      .then((data) => {
        if (mounted) setShifts(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const sorted = useMemo(
    () => [...shifts].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()),
    [shifts]
  );
  const columnCount = showVariance ? 7 : 5;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cashier</TableHead>
          <TableHead>Opened</TableHead>
          <TableHead>Closed</TableHead>
          <TableHead>Opening Float</TableHead>
          <TableHead>Closing Float</TableHead>
          {showVariance && <TableHead>Expected Cash</TableHead>}
          {showVariance && <TableHead>Variance</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={columnCount} className="text-center py-8">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </TableCell>
          </TableRow>
        )}
        {!loading && sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={columnCount} className="text-center py-8 text-muted-foreground">
              No shifts recorded yet
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          sorted.map((shift) => (
            <TableRow key={shift.id}>
              <TableCell>{shift.cashierName}</TableCell>
              <TableCell className="text-sm">{new Date(shift.openedAt).toLocaleString()}</TableCell>
              <TableCell className="text-sm">
                {shift.closedAt ? (
                  new Date(shift.closedAt).toLocaleString()
                ) : (
                  <Badge variant="outline">Open</Badge>
                )}
              </TableCell>
              <TableCell>{formatCurrency(shift.openingFloat)}</TableCell>
              <TableCell>{shift.closingFloat !== undefined ? formatCurrency(shift.closingFloat) : "-"}</TableCell>
              {showVariance && <TableCell>{shift.expectedCash !== undefined ? formatCurrency(shift.expectedCash) : "-"}</TableCell>}
              {showVariance && <TableCell><VarianceCell shift={shift} /></TableCell>}
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

export default function ShiftHistoryDialog({ open, onOpenChange, showVariance = false }: ShiftHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh]" style={{ maxWidth: "56rem", maxHeight: "85vh" }}>
        <DialogHeader>
          <div className="flex items-center gap-4">
            <History className="w-5 h-5 text-muted-foreground" />
            <div>
              <DialogTitle>Shift History</DialogTitle>
              <DialogDescription>
                {showVariance
                  ? "Opening/closing float and cash reconciliation for this device."
                  : "Opening and closing float history for this device."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          {open && <ShiftHistoryTable showVariance={showVariance} />}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}