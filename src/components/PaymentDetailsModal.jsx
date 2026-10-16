import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { CreditCard, Calendar, FileText, DollarSign, AlertCircle, Package } from 'lucide-react';

export function PaymentDetailsModal({ open, onClose, payment }) {
  if (!payment) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount, currency = 'NGN') => {
    if (!amount) return '-';
    const symbol = currency === 'NGN' ? '₦' : currency;
    return `${symbol}${parseFloat(amount).toLocaleString()}`;
  };

  const formatType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return { backgroundColor: '#22c55e', color: 'white' };
      case 'failed':
      case 'refunded':
        return { backgroundColor: '#ef4444', color: 'white' };
      case 'initiated':
      case 'pending':
        return { backgroundColor: '#f97316', color: 'white' };
      default:
        return { backgroundColor: '#6b7280', color: 'white' };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Payment Details</DialogTitle>
          <DialogDescription>Complete payment transaction information</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Payment ID</p>
                <p className="font-medium">#{payment.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  style={getStatusStyle(payment.status)}
                  className="inline-flex items-center border-0"
                >
                  {payment.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Payment Type</p>
                <Badge variant="outline">
                  {formatType(payment.type)}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Provider</p>
                <p className="font-medium capitalize">{payment.provider}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Job Reference</p>
                  <p className="font-medium">#{payment.job} - {payment.job_title}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <p className='w-5 h-5 text-muted-foreground flex justify-center'>₦</p>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-lg">
                    {formatAmount(payment.amount, payment.currency)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <CreditCard className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Provider Reference</p>
                  <p className="font-medium">{payment.provider_ref || '-'}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Transaction Date</p>
                  <p className="font-medium">{formatDate(payment.created_at)}</p>
                </div>
              </div>

              {payment.updated_at && payment.updated_at !== payment.created_at && (
                <div className="flex items-start gap-4">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Last Updated</p>
                    <p className="font-medium">{formatDate(payment.updated_at)}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">Customer Information</h4>
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{payment.customer_name}</p>
                <p className="text-sm text-muted-foreground">Customer ID: {payment.customer_id}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{formatType(payment.type)}</span>
                  <span className="font-medium">
                    {formatAmount(payment.amount, payment.currency)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total Payment</span>
                  <span>{formatAmount(payment.amount, payment.currency)}</span>
                </div>
              </div>
            </div>

            {/* Action Button inside ScrollArea */}
            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={() => onClose(false)}>
                Close
              </Button>
            </div>
          </div>
        </ScrollArea>

        <Separator />
      </DialogContent>
    </Dialog>
  );
}