import { useEffect, useMemo, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Loader2, Pencil, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { VoucherFormModal } from "./VoucherFormModal";
import { VoucherUsageModal } from "./VoucherUsageModal";
import { formatAmount } from "../lib/currency";
import { humanizeLabel as formatLabel } from "../lib/text";

const PAYMENT_TYPE_OPTIONS = [
  "repair_fee",
  "diagnosis_fee",
  "shipping_fee",
  "service_fee",
  "corporate_parent_payment",
  "deposit",
  "balance",
];

function formatVoucherDiscount(voucher) {
  if (!voucher) return "-";
  if (voucher.voucher_type === "percentage") {
    return `${voucher.discount_percentage || "0.00"}%`;
  }
  if (voucher.voucher_type === "fixed_amount") {
    return formatAmount(voucher.discount_amount, voucher.currency);
  }
  if (voucher.voucher_type === "full_waiver") {
    return "Full Waiver";
  }
  return "-";
}

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

function formatValidity(voucher) {
  if (!voucher?.valid_from && !voucher?.valid_until) return "Open-ended";
  if (voucher?.valid_from && voucher?.valid_until) {
    return `${formatDate(voucher.valid_from)} → ${formatDate(voucher.valid_until)}`;
  }
  return voucher?.valid_from
    ? `From ${formatDate(voucher.valid_from)}`
    : `Until ${formatDate(voucher.valid_until)}`;
}

function formatList(values) {
  if (!Array.isArray(values) || values.length === 0) return "All";
  return values.map(formatLabel).join(", ");
}

function getUsageCount(voucher) {
  return Number(
    voucher?.times_used ??
      voucher?.usage_count ??
      voucher?.total_usages ??
      voucher?.current_uses ??
      0
  );
}

export function VoucherManagementTab() {
  const { api } = useApi();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    count: 0,
    pages: 1,
    page: 1,
    page_size: 20,
    next: null,
    previous: null,
  });
  const [search, setSearch] = useState("");

  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [voucherToEdit, setVoucherToEdit] = useState(null);
  const [usageTarget, setUsageTarget] = useState(null);

  const [previewForm, setPreviewForm] = useState({
    code: "",
    amount: "",
    payment_type: "repair_fee",
    job_id: "",
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);

  const fetchVouchers = async (targetPage = page) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get("/vouchers/admin/", {
        params: {
          page: targetPage,
          page_size: 20,
        },
        showLoader: false,
      });

      setVouchers(Array.isArray(response?.data?.result) ? response.data.result : []);
      setPagination(response?.data?.pagination || {});
    } catch (loadError) {
      console.error("Failed to load vouchers:", loadError);
      setError(loadError?.response?.data?.message || "Failed to load vouchers.");
      setVouchers([]);
      setPagination({
        count: 0,
        pages: 1,
        page: targetPage,
        page_size: 20,
        next: null,
        previous: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchVouchers(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filteredVouchers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vouchers;

    return vouchers.filter((voucher) =>
      [
        voucher.code,
        voucher.voucher_type,
        voucher.status,
        voucher.currency,
        ...(voucher.applicable_payment_types || []),
        ...(voucher.applicable_channels || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, vouchers]);

  const handleDeleteVoucher = async (voucher) => {
    if (!window.confirm(`Delete voucher ${voucher.code}?`)) {
      return;
    }

    try {
      await api.delete(`/vouchers/admin/${voucher.id}/`);
      toast.success("Voucher deleted.");
      await fetchVouchers(page);
    } catch (deleteError) {
      console.error("Failed to delete voucher:", deleteError);
      toast.error(
        deleteError?.response?.data?.message ||
          deleteError?.response?.data?.detail ||
          "Failed to delete voucher."
      );
    }
  };

  const handlePreview = async () => {
    if (!previewForm.code.trim()) {
      setPreviewError("Enter a voucher code.");
      setPreviewResult(null);
      return;
    }

    if (!previewForm.amount.trim()) {
      setPreviewError("Enter an amount to validate.");
      setPreviewResult(null);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);

    try {
      const response = await api.post(
        "/vouchers/validate/",
        {
          code: previewForm.code.trim().toUpperCase(),
          amount: previewForm.amount.trim(),
          payment_type: previewForm.payment_type,
          ...(previewForm.job_id.trim() ? { job_id: Number(previewForm.job_id) } : {}),
        },
        { showLoader: false }
      );

      setPreviewResult(response?.data?.result || null);
    } catch (validateError) {
      console.error("Voucher preview failed:", validateError);
      const message =
        validateError?.response?.data?.error?.fields?.voucher_code?.[0] ||
        validateError?.response?.data?.error?.message ||
        validateError?.response?.data?.message ||
        "Voucher validation failed.";
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Voucher Management</CardTitle>
                <CardDescription>
                  Create, edit, inspect, and remove discount vouchers.
                </CardDescription>
              </div>

              <Button
                onClick={() => {
                  setVoucherToEdit(null);
                  setShowVoucherForm(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Voucher
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vouchers by code, type, status, or scope..."
                className="pl-9"
              />
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center">
                        <div className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading vouchers...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-destructive">
                        {error}
                      </TableCell>
                    </TableRow>
                  ) : filteredVouchers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No vouchers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVouchers.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-medium">{voucher.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatValidity(voucher)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatLabel(voucher.voucher_type)}</TableCell>
                        <TableCell className="font-medium">
                          {formatVoucherDiscount(voucher)}
                        </TableCell>
                        <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                          <div>{formatList(voucher.applicable_payment_types)}</div>
                          <div>{formatList(voucher.applicable_channels)}</div>
                        </TableCell>
                        <TableCell>
                          {getUsageCount(voucher).toLocaleString()}
                          {voucher.max_total_uses ? ` / ${voucher.max_total_uses}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={voucher.status === "active" ? "default" : "outline"}>
                            {formatLabel(voucher.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setVoucherToEdit(voucher);
                                setShowVoucherForm(true);
                              }}
                              title="Edit voucher"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUsageTarget(voucher)}
                              title="View usage trail"
                            >
                              <TicketPercent className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteVoucher(voucher)}
                              title="Delete voucher"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>
                Page {pagination.page || page} of {pagination.pages || 1}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.previous}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.next}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voucher Preview</CardTitle>
            <CardDescription>
              Test the live discount calculation without changing any job or payment state.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Voucher Code</Label>
              <Input
                value={previewForm.code}
                onChange={(event) =>
                  setPreviewForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                }
                placeholder="WELCOME20"
              />
            </div>

            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                value={previewForm.amount}
                onChange={(event) =>
                  setPreviewForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                placeholder="69000.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Type</Label>
              <Select
                value={previewForm.payment_type}
                onValueChange={(value) =>
                  setPreviewForm((prev) => ({ ...prev, payment_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Job ID (Optional)</Label>
              <Input
                value={previewForm.job_id}
                onChange={(event) =>
                  setPreviewForm((prev) => ({ ...prev, job_id: event.target.value }))
                }
                placeholder="17"
              />
            </div>

            <Button className="w-full" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                "Preview Voucher"
              )}
            </Button>

            {previewError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                {previewError}
              </div>
            ) : null}

            {previewResult ? (
              <div className="space-y-4 rounded-lg border bg-secondary/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Voucher</span>
                  <span className="font-medium">{previewResult.voucher_code}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Original Amount</span>
                  <span className="font-medium">
                    {formatAmount(previewResult.original_amount, "NGN")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount Amount</span>
                  <span className="font-medium">
                    {formatAmount(previewResult.discount_amount, "NGN")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Final Amount</span>
                  <span className="font-medium">
                    {formatAmount(previewResult.final_amount, "NGN")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{formatLabel(previewResult.voucher_type)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Full Waiver</span>
                  <Badge variant={previewResult.is_full_waiver ? "default" : "outline"}>
                    {previewResult.is_full_waiver ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <VoucherFormModal
        open={showVoucherForm}
        voucher={voucherToEdit}
        onClose={() => {
          setShowVoucherForm(false);
          setVoucherToEdit(null);
        }}
        onSaved={() => {
          void fetchVouchers(page);
        }}
      />

      <VoucherUsageModal
        open={Boolean(usageTarget)}
        voucherId={usageTarget?.id}
        voucherCode={usageTarget?.code}
        onClose={() => setUsageTarget(null)}
      />
    </div>
  );
}
