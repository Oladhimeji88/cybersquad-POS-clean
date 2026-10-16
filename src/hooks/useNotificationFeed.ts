import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApi } from "./useApi";

// Shared data/business logic for this app's two notification-feed UIs — the
// admin bell (src/components/NotificationModal.jsx, a full paginated dialog)
// and the frontdesk bell (src/frontdesk/components/NotificationDropdown.tsx,
// a compact popover). Both used to be hand-duplicated copies of the same
// fetch/mark-as-read/mark-all-as-read/unread-count calls against identical
// endpoints — a fix to one silently never reached the other. The two stay
// visually separate (their layouts are legitimately different: one has
// pagination controls, the other doesn't) but now share this one
// implementation of the actual behavior.
export interface NotificationPagination {
  count: number;
  pages: number;
  page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
}

interface UseNotificationFeedOptions {
  open: boolean;
  page?: number;
  pageSize?: number;
  onUnreadCountChange?: (count: number) => void;
}

export function useNotificationFeed({
  open,
  page = 1,
  pageSize = 20,
  onUnreadCountChange,
}: UseNotificationFeedOptions) {
  const { api } = useApi();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [pagination, setPagination] = useState<NotificationPagination>({
    count: 0,
    pages: 1,
    page,
    page_size: pageSize,
    next: null,
    previous: null,
  });

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/notifications/notifications/?page=${page}&page_size=${pageSize}`
      );
      const data = res?.data || {};
      setNotifications(Array.isArray(data.result) ? data.result : []);
      setPagination(
        data.pagination || { count: 0, pages: 1, page, page_size: pageSize, next: null, previous: null }
      );
    } catch (e) {
      console.error("Error fetching notifications:", e);
      toast.error("Failed to load notifications");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get("/notifications/notifications/unread_count/");
      const count = res?.data?.result?.unread_count ?? res?.data?.data?.unread_count ?? 0;
      onUnreadCountChange?.(count);
      return count;
    } catch (e) {
      console.error("Error fetching unread count:", e);
      return 0;
    }
  }, [api, onUnreadCountChange]);

  const markAsRead = useCallback(
    async (notificationId: number) => {
      try {
        await api.post(`/notifications/notifications/${notificationId}/mark_as_read/`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        );
        fetchUnreadCount();
      } catch (e) {
        console.error("Error marking notification as read:", e);
        toast.error("Failed to mark notification as read");
      }
    },
    [api, fetchUnreadCount]
  );

  const markAllAsRead = useCallback(async () => {
    setMarkingRead(true);
    try {
      await api.post("/notifications/notifications/mark_all_as_read/");
      toast.success("All notifications marked as read");
      await fetchNotifications();
      await fetchUnreadCount();
    } catch (e) {
      console.error("Error marking all as read:", e);
      toast.error("Failed to mark all notifications as read");
    } finally {
      setMarkingRead(false);
    }
  }, [api, fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
      fetchUnreadCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, pageSize]);

  return {
    notifications,
    loading,
    markingRead,
    pagination,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
