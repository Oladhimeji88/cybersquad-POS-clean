import { useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertTriangle, Info, Key, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationFeed } from '@/hooks/useNotificationFeed';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'alert':
      return { icon: AlertTriangle, color: 'text-red-500', bgColor: 'bg-red-50' };
    case 'password_reset':
      return { icon: Key, color: 'text-amber-500', bgColor: 'bg-amber-50' };
    case 'otp':
      return { icon: Mail, color: 'text-cyan-500', bgColor: 'bg-cyan-50' };
    default:
      return { icon: Info, color: 'text-indigo-600', bgColor: 'bg-indigo-50' };
  }
};

export function NotificationDropdown({
  open,
  onOpenChange,
  onUnreadCountChange,
  unreadCount
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUnreadCountChange: (v: number) => void;
  unreadCount: number;
}) {
  const { notifications, loading, markingRead, markAsRead, markAllAsRead, fetchUnreadCount } =
    useNotificationFeed({ open, pageSize: 20, onUnreadCountChange });

  // Unlike the admin dialog, this dropdown's bell badge needs a count as soon
  // as the header mounts, not just after the user opens it.
  useEffect(() => {
    fetchUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="relative w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors mr-1">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0 shadow-lg" sideOffset={8}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 text-[10px] h-4">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground" onClick={markAllAsRead} disabled={markingRead}>
              {markingRead ? 'Marking...' : 'Mark all read'}
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-4 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y">
              {notifications.map((notification) => {
                const { icon: Icon, color, bgColor } = getNotificationIcon(notification.type);
                return (
                  <div
                    key={notification.id}
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                    className={`flex gap-4 p-4 transition-colors hover:bg-muted/50 cursor-pointer ${
                      notification.is_read ? 'bg-background' : 'bg-indigo-50/30'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full ${bgColor} flex items-center justify-center mt-0.5`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <h4 className={`text-sm tracking-tight ${notification.is_read ? 'font-medium' : 'font-semibold'}`}>
                          {notification.subject}
                        </h4>
                        {!notification.is_read && <div className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-2" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug tracking-tight mb-2">
                        {notification.message}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {formatDate(notification.sent_at || notification.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t text-center">
            <Button variant="ghost" size="sm" className="w-full text-xs text-indigo-600 hover:text-indigo-700 h-8" onClick={() => onOpenChange(false)}>
              Close
            </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
