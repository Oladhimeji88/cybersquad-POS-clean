import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '../hooks/useApi';
import { formatAmount } from '../lib/currency';

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
        <Button variant="outline" size="icon" onClick={onPrev} disabled={!canPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{page}</span>{' '}
          <span className="text-muted-foreground">of</span>{' '}
          <span className="font-medium text-foreground">{pages || 1}</span>
        </div>

        <Button variant="outline" size="icon" onClick={onNext} disabled={!canNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-muted-foreground">Show</span>

        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
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

function safeNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function getPayoutStateStyle(state) {
  switch (state) {
    case 'PAID':
      return { backgroundColor: '#22c55e', color: 'white' };
    case 'READY_FOR_APPROVAL':
      return { backgroundColor: '#f97316', color: 'white' };
    case 'APPROVED':
    case 'PROCESSING':
      return { backgroundColor: '#3b82f6', color: 'white' };
    case 'FAILED':
    case 'REJECTED':
      return { backgroundColor: '#ef4444', color: 'white' };
    default:
      return { backgroundColor: '#6b7280', color: 'white' };
  }
}

function getTechnicianLabel(payout) {
  const techName = payout?.earnings?.technician_name;
  const techId = payout?.earnings?.technician_id;
  if (techName) return techName;
  if (techId) return `Technician #${techId}`;
  return '-';
}

async function tryPostThenPatch(api, url, body) {
  try {
    return await api.post(url, body);
  } catch (e1) {
    try {
      return await api.patch(url, body);
    } catch (e2) {
      throw e1;
    }
  }
}

export function ProcessPayoutsModal({ open, onClose, onProcessed }) {
  const { api } = useApi();

  const [rows, setRows] = useState([]);
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

  const [selectedMap, setSelectedMap] = useState({});
  const [actionLoading, setActionLoading] = useState(false);

  const fetchReadyPayouts = async () => {
    if (!open) return;

    setLoading(true);
    try {
      const res = await api.get('/payouts/', {
        params: {
          state: 'READY_FOR_APPROVAL',
          page,
          page_size: pageSize,
        },
      });

      const data = res?.data || {};
      const result = Array.isArray(data) ? data : Array.isArray(data?.result) ? data.result : [];
      const pag = Array.isArray(data) ? null : data?.pagination;

      setRows(result);
      setPagination(
        pag || {
          count: result.length,
          pages: 1,
          page,
          page_size: pageSize,
          next: null,
          previous: null,
        }
      );

      // default-select all rows on the current page (only if not already set)
      setSelectedMap((prev) => {
        const next = { ...prev };
        result.forEach((p) => {
          if (next[p.id] === undefined) next[p.id] = true;
        });
        return next;
      });
    } catch (e) {
      console.error('Failed to load READY_FOR_APPROVAL payouts:', e);
      toast.error('Failed to load payouts for approval');
      setRows([]);
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
    if (open) fetchReadyPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, pageSize]);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const pageSelectedIds = useMemo(() => {
    return rows.filter((p) => selectedMap[p.id]).map((p) => p.id);
  }, [rows, selectedMap]);

  const selectedCount = pageSelectedIds.length;

  const selectedTotal = useMemo(() => {
    return rows
      .filter((p) => selectedMap[p.id])
      .reduce((sum, p) => sum + safeNumber(p?.earnings?.technician_amount), 0);
  }, [rows, selectedMap]);

  const toggleRow = (id) => {
    setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAllOnPage = (checked) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      rows.forEach((p) => {
        next[p.id] = checked === true;
      });
      return next;
    });
  };

  const handleApproveSelected = async () => {
    if (selectedCount === 0) return;

    setActionLoading(true);
    try {
      for (const id of pageSelectedIds) {
        await tryPostThenPatch(api, `/payments/payouts/${id}/approve/`, {});
      }

      toast.success(`Approved ${selectedCount} payout${selectedCount > 1 ? 's' : ''}`);
      await fetchReadyPayouts();
      onProcessed?.();
    } catch (e) {
      console.error('Approve selected failed:', e);
      toast.error('Failed to approve selected payouts');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveAll = async () => {
    setActionLoading(true);
    try {
      await tryPostThenPatch(api, '/payouts/bulk_approve/', {});
      toast.success('Processed all payouts (READY_FOR_APPROVAL)');
      await fetchReadyPayouts();
      onProcessed?.();
      onClose?.();
    } catch (e) {
      console.error('Bulk approve failed:', e);
      toast.error('Failed to process all payouts');
    } finally {
      setActionLoading(false);
    }
  };

  const currencyForDisplay = rows?.[0]?.currency || 'NGN';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Process Payout Approvals</DialogTitle>
          <DialogDescription>
            Showing payouts in <code>READY_FOR_APPROVAL</code> state
          </DialogDescription>
        </DialogHeader>

        {/* EXACT same pattern as your working modal: everything inside ScrollArea */}
        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground font-medium">Ready For Approval</p>
                <p className="text-3xl font-bold mt-1">{pagination.count || 0}</p>
              </div>

              <div className="p-4 border rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground font-medium">Selected (this page)</p>
                <p className="text-3xl font-bold mt-1">{selectedCount}</p>
              </div>

              <div className="p-4 border rounded-lg bg-purple-50">
                <p className="text-xs text-purple-700 font-medium">Selected Total (this page)</p>
                <p className="text-3xl font-bold mt-1 text-purple-900">
                  {formatAmount(selectedTotal, currencyForDisplay)}
                </p>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payouts found in READY_FOR_APPROVAL
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={rows.length > 0 && rows.every((p) => selectedMap[p.id])}
                            onCheckedChange={(checked) => toggleSelectAllOnPage(checked)}
                          />
                        </TableHead>
                        <TableHead>Payout ID</TableHead>
                        <TableHead>Technician</TableHead>
                        <TableHead className="text-right">Net Amount</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {rows.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <Checkbox
                              checked={!!selectedMap[p.id]}
                              onCheckedChange={() => toggleRow(p.id)}
                            />
                          </TableCell>

                          <TableCell className="font-medium">#{p.id}</TableCell>
                          <TableCell>{getTechnicianLabel(p)}</TableCell>

                          <TableCell className="text-right font-medium">
                            {formatAmount(p?.earnings?.technician_amount, p.currency)}
                          </TableCell>

                          <TableCell className="font-medium">#{p.job_id}</TableCell>

                          <TableCell>
                            <Badge style={getPayoutStateStyle(p.state)} className="border-0">
                              {String(p.state || '-').replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(p.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <PaginationBar
                  page={pagination.page || page}
                  pages={pagination.pages || 1}
                  pageSize={pageSize}
                  canPrev={!!pagination.previous}
                  canNext={!!pagination.next}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
              </>
            )}

            {/* Actions (INSIDE scroll, like your working modal) */}
            <div className="pt-4 border-t flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={actionLoading}>
                Cancel
              </Button>

              <Button
                variant="secondary"
                onClick={handleApproveSelected}
                disabled={actionLoading || selectedCount === 0}
              >
                {actionLoading ? 'Processing...' : `Approve Selected (${selectedCount})`}
              </Button>

              <Button onClick={handleApproveAll} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : 'Process All Payouts'}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
