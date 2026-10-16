import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { toast } from 'sonner';

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

export function CustomerJobsModal({ open, onOpenChange, customer }) {
  const { api } = useApi();
  
  const [jobs, setJobs] = useState([]);
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

  const fetchJobs = async () => {
    if (!customer?.id) return;

    setLoading(true);
    try {
      const res = await api.get(
        `/jobs/admin/bookings/?customer_id=${customer.id}&page=${page}&page_size=${pageSize}`
      );

      const data = res?.data || {};
      setJobs(Array.isArray(data.result) ? data.result : []);
      setPagination(data.pagination || {});
    } catch (e) {
      console.error('Error fetching customer jobs:', e);
      toast.error('Failed to load job history');
      setJobs([]);
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
      fetchJobs();
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
      case 'delivered':
      case 'completed':
        return 'bg-success text-white';
      case 'cancelled':
        return 'bg-error text-white';
      case 'quote_sent':
      case 'awaiting_shipping_fee':
        return 'bg-amber-500 text-white';
      case 'picked_up':
      case 'in_progress':
        return 'bg-purple-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getLifecycleColor = (stage) => {
    switch (stage) {
      case 'completed':
        return 'bg-success text-white';
      case 'started':
        return 'bg-blue-600 text-white';
      case 'not_started':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount, currency = 'NGN') => {
    const symbol = currency === 'NGN' ? '₦' : currency;
    return `${symbol}${parseFloat(amount).toLocaleString()}`;
  };

  // Calculate stats
  const completedJobs = jobs.filter(job => job.is_completed).length;
  const completionRate = pagination.count > 0 
    ? Math.round((completedJobs / pagination.count) * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Job History - {customer.first_name} {customer.last_name}</DialogTitle>
          <DialogDescription>
            Complete history of all jobs posted by this customer
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-4">
            {/* Stats Section */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                <p className="text-xs text-muted-foreground font-medium">Total Jobs</p>
                <p className="text-3xl font-bold mt-1">{customer.stats?.total_jobs || 0}</p>
              </div>
              <div className="p-4 border rounded-lg bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                <p className="text-xs text-muted-foreground font-medium">Total Spent</p>
                <p className="text-3xl font-bold mt-1">
                  ₦{(customer.stats?.total_spent || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 border rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
                <p className="text-xs text-muted-foreground font-medium">Completion Rate</p>
                <p className="text-3xl font-bold mt-1">{completionRate}%</p>
              </div>
            </div>

            {/* Jobs Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No jobs found for this customer
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Technician</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Lifecycle</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">#{job.id}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{job.title}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {job.technician_name || 'Unassigned'}
                          </TableCell>
                          <TableCell className="capitalize">{job.service_type}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(job.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getLifecycleColor(job.lifecycle_stage)}>
                              {job.lifecycle_stage.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {job.service_quote_amount 
                              ? formatAmount(job.service_quote_amount, job.service_currency)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
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
                  onPrev={() => setPage(p => Math.max(1, p - 1))}
                  onNext={() => setPage(p => p + 1)}
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