import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Loader2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { formatAmount } from "../lib/currency";

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getUsageEntries(data) {
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data)) return data;
  return [];
}

function getUsageCustomerLabel(entry) {
  return (
    entry?.customer_name ||
    entry?.customer_email ||
    entry?.customer?.name ||
    entry?.customer?.email ||
    "-"
  );
}

export function VoucherUsageModal({ open, onClose, voucherId, voucherCode }) {
  const { api } = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!open || !voucherId) return;

    let mounted = true;

    const loadUsageTrail = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/vouchers/admin/${voucherId}/usages/`, {
          showLoader: false,
        });

        if (!mounted) return;
        setEntries(getUsageEntries(response?.data));
      } catch (loadError) {
        console.error("Failed to load voucher usages:", loadError);
        if (!mounted) return;
        setError(
          loadError?.response?.data?.message ||
            loadError?.response?.data?.detail ||
            "Failed to load voucher usages."
        );
        setEntries([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadUsageTrail();

    return () => {
      mounted = false;
    };
  }, [api, open, voucherId]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Voucher Usage Trail</DialogTitle>
          <DialogDescription>
            Review how <span className="font-medium">{voucherCode || `voucher #${voucherId}`}</span>{" "}
            has been applied.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No usage has been recorded for this voucher yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Payment Type</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                    <TableHead>Used At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => (
                    <TableRow key={entry.id || `${entry.payment_id || "usage"}-${index}`}>
                      <TableCell>{getUsageCustomerLabel(entry)}</TableCell>
                      <TableCell>{entry.payment_type || entry.payment?.type || "-"}</TableCell>
                      <TableCell className="text-right">
                        {formatAmount(entry.original_amount, entry.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(entry.discount_amount, entry.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(entry.final_amount, entry.currency)}
                      </TableCell>
                      <TableCell>
                        {formatDate(
                          entry.used_at || entry.created_at || entry.applied_at || entry.timestamp
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
