import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { DollarSign, Calendar } from 'lucide-react';

export function PayoutBreakdownModal({ open, onClose, payout }) {
  if (!payout) return null;

  const formatAmount = (amount, currency = 'NGN') => {
    if (!amount) return '₦0.00';
    const symbol = currency === 'NGN' ? '₦' : currency;
    return `${symbol}${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTechnicianLabel = (payout) => {
    const techId = payout?.earnings?.technician_id;
    return techId ? `Technician #${techId}` : 'Unknown';
  };

  const getCommissionRate = (payout) => {
    const rate = payout?.earnings?.breakdown?.commission_rate;
    if (!rate) return '0%';
    return `${(parseFloat(rate) * 100).toFixed(1)}%`;
  };

  const getStateStyle = (state) => {
    switch (state) {
      case 'PAID':
        return 'bg-green-500 text-white';
      case 'READY_FOR_APPROVAL':
        return 'bg-orange-500 text-white';
      case 'APPROVED':
      case 'PROCESSING':
        return 'bg-blue-500 text-white';
      case 'FAILED':
      case 'REJECTED':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const earnings = payout.earnings || {};
  const breakdown = earnings.breakdown || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Payout Breakdown</DialogTitle>
          <DialogDescription>
            Detailed earnings breakdown for payout #{payout.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Technician</p>
                <p className="font-medium">{getTechnicianLabel(payout)}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Job ID</p>
                <p className="font-medium">#{payout.job_id}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={`${getStateStyle(payout.state)} border-0 text-black `}>
                  {payout.state.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Earnings Breakdown */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-lg text-purple-600" >₦</p>
                <h4 className="font-semibold">Earnings Breakdown</h4>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Service Total</span>
                    <span className="font-medium">{formatAmount(breakdown.service_total, payout.currency)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Shipping Total</span>
                    <span className="font-medium">{formatAmount(breakdown.shipping_total, payout.currency)}</span>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center">
                    <span className="font-medium">Gross Amount</span>
                    <span className="font-semibold text-lg">{formatAmount(breakdown.gross_amount, payout.currency)}</span>
                  </div>
                </div>

                <Separator />

                <div className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-muted-foreground">Platform Commission</span>
                      <span className="text-xs text-muted-foreground ml-2">({getCommissionRate(payout)})</span>
                    </div>
                    <span className="font-medium text-red-600">-{formatAmount(breakdown.platform_commission, payout.currency)}</span>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg">
                    <span className="font-semibold text-green-900">Technician Net Amount</span>
                    <span className="font-bold text-xl text-green-700">{formatAmount(breakdown.technician_amount, payout.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger Entries */}
            {payout.ledger_entries && payout.ledger_entries.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-semibold">Ledger Entries</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entry Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payout.ledger_entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-sm">
                              {entry.entry_type.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmount(entry.amount, entry.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                entry.metadata?.side === 'credit' 
                                  ? 'bg-green-50 text-green-700 border-green-200' 
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }>
                                {entry.metadata?.side || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(entry.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            {/* Timestamps */}
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <h4 className="font-semibold">Timeline</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-4 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{formatDate(payout.created_at)}</span>
                </div>
                {payout.updated_at && payout.updated_at !== payout.created_at && (
                  <div className="flex justify-between p-4 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium">{formatDate(payout.updated_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Info */}
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm space-y-2">
              <p className="text-purple-900">
                <strong>Payment Method:</strong> Bank Transfer to technician's registered account
              </p>
              <p className="text-purple-900">
                <strong>Processing Time:</strong> Payouts are processed within 1-2 business days after approval
              </p>
              {payout.provider_operation_id && (
                <p className="text-purple-900">
                  <strong>Provider Reference:</strong> {payout.provider_operation_id}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}