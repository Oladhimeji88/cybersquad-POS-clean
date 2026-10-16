import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { ScrollArea } from "./ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { toast } from "sonner";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function PaginationBar({
  page,
  pages,
  pageSize,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPageSizeChange,
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-4 border-t">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrev}
          disabled={!canPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{page}</span>{" "}
          <span className="text-muted-foreground">of</span>{" "}
          <span className="font-medium text-foreground">{pages || 1}</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={!canNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-muted-foreground">Show</span>

        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="w-[95px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">entries</span>
      </div>
    </div>
  );
}

export function CustomerPaymentsModal({ open, onOpenChange, customer }) {
  const { api } = useApi();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 10,
    next: null,
    previous: null,
  });

  const fetchPayments = async () => {
    if (!customer?.id) return;

    setLoading(true);
    try {
      const res = await api.get(
        `/payments/admin/?customer_id=${customer.id}&page=${page}&page_size=${pageSize}`,
      );

      const data = res?.data || {};
      setPayments(Array.isArray(data.result) ? data.result : []);
      setPagination(data.pagination || {});
    } catch (e) {
      console.error("Error fetching customer payments:", e);
      toast.error("Failed to load payment history");
      setPayments([]);
      setPagination({
        count: 0,
        pages: 1,
        page,
        page_size: pageSize,
        next: null,
        previous: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && customer?.id) {
      fetchPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id, page, pageSize]);

  // Reset pagination when modal opens
  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open]);

  if (!customer) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case "succeeded":
      case "completed":
        return "bg-success text-white";
      case "failed":
      case "refunded":
        return "bg-error text-white";
      case "initiated":
      case "pending":
        return "bg-warning text-white"; // Changed to orange-500 for better visibility
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "succeeded":
      case "completed":
        return <CheckCircle className="h-4 w-4 mr-1" />;
      case "failed":
      case "refunded":
        return <XCircle className="h-4 w-4 mr-1" />;
      case "initiated":
      case "pending":
        return <Clock className="h-4 w-4 mr-1" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatAmount = (amount, currency = "NGN") => {
    const symbol = currency === "NGN" ? "₦" : currency;
    return `${symbol}${parseFloat(amount).toLocaleString()}`;
  };

  const formatType = (type) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Calculate stats from current page data
  const totalPaid = customer?.stats?.total_spent ?? 0;

  const refundCount = payments.filter(
    (p) => p.status === "refunded" || p.status === "failed",
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            Payment History - {customer.first_name} {customer.last_name}
          </DialogTitle>
          <DialogDescription>
            Complete payment transaction history for this customer
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-4">
            {/* Stats Section */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                <p className="text-xs text-muted-foreground font-medium">
                  Total Paid
                </p>
                <p className="text-3xl font-bold mt-1">
                  ₦{totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                <p className="text-xs text-muted-foreground font-medium">
                  Transactions
                </p>
                <p className="text-3xl font-bold mt-1">
                  {pagination.count || 0}
                </p>
              </div>
              <div className="p-4 border rounded-lg bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900">
                <p className="text-xs text-muted-foreground font-medium">
                  Failed/Refunded
                </p>
                <p className="text-3xl font-bold mt-1">{refundCount}</p>
              </div>
            </div>

            {/* Payments Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payments found for this customer
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => {
                        console.log(payment.id, JSON.stringify(payment.status));
                        return (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              #{payment.id}
                            </TableCell>
                            <TableCell className="font-medium">
                              #{payment.job}
                            </TableCell>
                            <TableCell
                              className="max-w-[180px] truncate"
                              title={payment.job_title}
                            >
                              {payment.job_title}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {formatType(payment.type)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(payment.created_at)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {payment.provider}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmount(payment.amount, payment.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`${getStatusColor(payment.status)} inline-flex items-center`}
                              >
                                {getStatusIcon(payment.status)}
                                <span className="capitalize">
                                  {payment.status}
                                </span>
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="text-muted-foreground text-sm max-w-[150px] truncate"
                              title={payment.provider_ref || "-"}
                            >
                              {payment.provider_ref || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <PaginationBar
                  page={pagination.page || page}
                  pages={pagination.pages || 1}
                  pageSize={pageSize}
                  canPrev={!!pagination.previous}
                  canNext={!!pagination.next}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
