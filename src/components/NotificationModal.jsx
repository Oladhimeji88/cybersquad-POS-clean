import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Bell, AlertTriangle, Info, Mail, Key, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { useNotificationFeed } from '../hooks/useNotificationFeed';

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

const getNotificationIcon = (type) => {
  switch (type) {
    case 'alert':
      return { icon: AlertTriangle, color: 'text-error', bgColor: 'bg-error-50' };
    case 'password_reset':
      return { icon: Key, color: 'text-warning', bgColor: 'bg-warning-50' };
    case 'otp':
      return { icon: Mail, color: 'text-cyan-500', bgColor: 'bg-cyan-50' };
    default:
      return { icon: Info, color: 'text-purple-600', bgColor: 'bg-purple-50' };
  }
};

export function NotificationModal({ open, onOpenChange, onUnreadCountChange }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [unreadCount, setUnreadCount] = useState(0);

  const {
    notifications,
    loading,
    markingRead,
    pagination,
    markAsRead,
    markAllAsRead,
  } = useNotificationFeed({
    open,
    page,
    pageSize,
    onUnreadCountChange: (count) => {
      setUnreadCount(count);
      onUnreadCountChange?.(count);
    },
  });

  // Reset pagination when modal opens
  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-600" />
              <DialogTitle>Notifications</DialogTitle>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                disabled={markingRead}
              >
                {markingRead ? 'Marking...' : 'Mark all as read'}
              </Button>
            )}
          </div>
          <DialogDescription>
            Stay updated with the latest platform activities
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const { icon: Icon, color, bgColor } = getNotificationIcon(notification.type);

                return (
                  <div
                    key={notification.id}
                    className={`flex gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer ${
                      notification.is_read ? 'bg-background' : 'bg-purple-50/50 border-purple-200'
                    }`}
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-medium">{notification.subject}</h4>
                        {!notification.is_read && (
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-purple-600 mt-2" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(notification.sent_at || notification.created_at)}
                        </p>
                        <span className="text-xs text-muted-foreground">•</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {notification.type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

                    {!loading && notifications.length > 0 && (
          <>
            <Separator />
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
