// src/hooks/useWebSocket.js
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://backend.staging.cybersquadapp.com").replace(/\/$/, "");
const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws/notifications/";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribedJobsRef = useRef(new Set());
  const shouldReconnectRef = useRef(true);

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const eventListenersRef = useRef(new Map());

  // Play notification sound using Web Audio API (no file needed)
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();

      // First tone
      const oscillator1 = audioContext.createOscillator();
      const gainNode1 = audioContext.createGain();
      oscillator1.connect(gainNode1);
      gainNode1.connect(audioContext.destination);
      oscillator1.frequency.value = 800;
      oscillator1.type = "sine";
      gainNode1.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode1.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2,
      );
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.2);

      // Second tone (slightly higher)
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.frequency.value = 1000;
      oscillator2.type = "sine";
      gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.15);
      gainNode2.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.4,
      );
      oscillator2.start(audioContext.currentTime + 0.15);
      oscillator2.stop(audioContext.currentTime + 0.4);
    } catch (error) {
      console.error("Error playing notification sound:", error);
    }
  }, []);

  const getAuthToken = useCallback(() => {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        return user?.access || null;
      }
    } catch (error) {
      console.error("Error getting auth token:", error);
    }
    return null;
  }, []);

  const connect = useCallback(() => {
    const token = getAuthToken();

    if (!token) {
      console.log("No access token, skipping WebSocket connection");
      return;
    }

    shouldReconnectRef.current = true;

    // Prevent duplicate sockets
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      console.log("WebSocket already connected/connecting");
      return;
    }

    // Clear any pending reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      // WebSocket with token in URL query params (since web doesn't support headers in WebSocket constructor)
      const wsUrlWithToken = `${WS_URL}?token=${token}`;
      const ws = new WebSocket(wsUrlWithToken);

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Send authentication message
        ws.send(
          JSON.stringify({
            type: "authenticate",
            token: token,
          }),
        );

        // Re-subscribe to jobs after reconnection
        subscribedJobsRef.current.forEach((jobId) => {
          ws.send(
            JSON.stringify({
              action: "subscribe_job",
              job_id: jobId,
            }),
          );
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 WebSocket message:", data);

          setLastMessage(data);

          // Handle notification events
          if (
            data.event === "notification.created" ||
            data.event === "notification.sent"
          ) {
            // Play sound
            playNotificationSound();

            // Show toast with notification message
            const message =
              data.payload?.message ||
              data.message ||
              "New notification received";
            const subject = data.payload?.subject || "";

            toast.info(subject || message, {
              description: subject ? message : undefined,
              duration: 5000,
            });

            // Increment unread count
            setUnreadCount((prev) => prev + 1);
          }

          const eventType = data.event;

          // Trigger event listeners for specific event type
          if (eventType && eventListenersRef.current.has(eventType)) {
            eventListenersRef.current.get(eventType).forEach((callback) => {
              callback(data);
            });
          }

          // Trigger wildcard listeners
          if (eventListenersRef.current.has("*")) {
            eventListenersRef.current.get("*").forEach((callback) => {
              callback(data);
            });
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", {
          error,
          readyState: ws?.readyState,
          url: WS_URL,
        });
      };

      ws.onclose = (e) => {
        console.log("🔌 WebSocket disconnected", {
          code: e?.code,
          reason: e?.reason,
          wasClean: e?.wasClean,
        });

        setIsConnected(false);
        wsRef.current = null;

        // Don't reconnect if intentionally disconnected
        if (!shouldReconnectRef.current) {
          console.log("Reconnect skipped (intentional disconnect)");
          return;
        }

        // Attempt reconnection
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `Reconnecting... attempt ${reconnectAttemptsRef.current}`,
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          console.log("Max reconnect attempts reached. Stopping reconnect.");
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
    }
  }, [getAuthToken, playNotificationSound]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    subscribedJobsRef.current.clear();
  }, []);

  const subscribeToJob = useCallback((jobId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot subscribe to job: WebSocket not connected");
      return;
    }

    subscribedJobsRef.current.add(jobId);

    wsRef.current.send(
      JSON.stringify({
        action: "subscribe_job",
        job_id: jobId,
      }),
    );

    console.log(`📌 Subscribed to job ${jobId}`);
  }, []);

  const unsubscribeFromJob = useCallback((jobId) => {
    subscribedJobsRef.current.delete(jobId);
  }, []);

  const addEventListener = useCallback((eventType, callback) => {
    if (!eventListenersRef.current.has(eventType)) {
      eventListenersRef.current.set(eventType, new Set());
    }

    eventListenersRef.current.get(eventType).add(callback);

    // Return cleanup function
    return () => {
      const listeners = eventListenersRef.current.get(eventType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          eventListenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  const updateUnreadCount = useCallback((count) => {
    setUnreadCount(count);
  }, []);

  // Auto-connect when component mounts and token is available
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, getAuthToken]);

  return {
    isConnected,
    lastMessage,
    unreadCount,
    subscribeToJob,
    unsubscribeFromJob,
    addEventListener,
    reconnect: connect,
    updateUnreadCount,
  };
}
