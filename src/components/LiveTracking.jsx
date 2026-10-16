import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { MapPin, Radio, Navigation } from "lucide-react";
import { Badge } from "./ui/badge";
import { useWS } from "../context/WebSocketContext";
import { useApi } from "../hooks/useApi";
import LiveTrackingMap from "./tracking/LiveTrackingMap";

// Statuses during which a technician streams location (the backend "live-track
// window"). We poll for jobs in these statuses and subscribe to each one.
const LIVE_TRACK_STATUSES = [
  "pickup_scheduled",
  "technician_en_route",
  "technician_arrived",
  "picked_up",
  "repair_in_progress",
  "ready_for_return",
  "en_route_for_delivery",
  "arrived_for_delivery",
  "return_in_transit",
].join(",");

const POLL_MS = 45000;

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
};

/**
 * Admin live-tracking dashboard. Plots each active technician from the shared
 * websocket's technician.location.update frames.
 *
 * INTERIM: the backend doesn't yet auto-join admin connections to the
 * platform-wide `admin` group, so we discover jobs in the live-track window and
 * subscribe to each job.<id> group instead. Once the `admin` group is wired,
 * the polling/subscription block below can be deleted and the listener alone
 * will receive every ping.
 */
export function LiveTracking() {
  const { isConnected, addEventListener, subscribeToJob, unsubscribeFromJob } =
    useWS();
  const { api } = useApi();
  // technician_id -> latest ping { lat, lng, recorded_at, heading_deg, job_id, ... }
  const [techById, setTechById] = useState({});
  // job ids we've subscribed to over the websocket.
  const subscribedRef = useRef(new Set());

  useEffect(() => {
    const unsub = addEventListener("technician.location.update", (data) => {
      const p = data?.payload;
      if (!p || p.technician_id == null) return;
      setTechById((prev) => ({
        ...prev,
        [p.technician_id]: {
          technician_id: p.technician_id,
          job_id: p.job_id,
          lat: Number(p.lat),
          lng: Number(p.lng),
          heading_deg: p.heading_deg,
          recorded_at: p.recorded_at,
          ping_id: p.ping_id,
        },
      }));
    });
    return unsub;
  }, [addEventListener]);

  // INTERIM admin-group workaround: poll for active (live-track) jobs and keep
  // the websocket subscribed to each job.<id> group. subscribeToJob sends WS
  // frames (no HTTP), so the only request here is the periodic job-list poll.
  const syncActiveJobs = useCallback(async () => {
    try {
      const res = await api.get(
        `/jobs/admin/bookings/?status=${LIVE_TRACK_STATUSES}&page_size=100`,
        { showLoader: false },
      );
      const jobs = Array.isArray(res?.data?.result) ? res.data.result : [];
      const activeIds = new Set(
        jobs.map((j) => j.id).filter((id) => id != null),
      );

      // Subscribe to newly-active jobs.
      activeIds.forEach((id) => {
        if (!subscribedRef.current.has(id)) {
          subscribeToJob(id);
          subscribedRef.current.add(id);
        }
      });
      // Forget jobs that left the live-track window.
      Array.from(subscribedRef.current).forEach((id) => {
        if (!activeIds.has(id)) {
          unsubscribeFromJob(id);
          subscribedRef.current.delete(id);
        }
      });
      // Drop technicians whose job is no longer being tracked.
      setTechById((prev) => {
        const next = {};
        Object.values(prev).forEach((t) => {
          if (t.job_id == null || activeIds.has(t.job_id)) {
            next[t.technician_id] = t;
          }
        });
        return next;
      });
    } catch (e) {
      console.error("LiveTracking: failed to load active jobs", e);
    }
  }, [api, subscribeToJob, unsubscribeFromJob]);

  // Poll only while connected — subscribeToJob needs an open socket.
  useEffect(() => {
    if (!isConnected) return undefined;
    syncActiveJobs();
    const timer = setInterval(syncActiveJobs, POLL_MS);
    return () => clearInterval(timer);
  }, [isConnected, syncActiveJobs]);

  const techs = useMemo(() => Object.values(techById), [techById]);

  const markers = useMemo(
    () =>
      techs.map((t) => ({
        id: t.technician_id,
        lat: t.lat,
        lng: t.lng,
        title: `Technician #${t.technician_id}`,
        subtitle: `${t.job_id ? `Job #${t.job_id} · ` : ""}${fmtTime(
          t.recorded_at,
        )}`,
      })),
    [techs],
  );

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MapPin className="h-6 w-6" /> Live Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time location of technicians currently on active jobs.
          </p>
        </div>
        <Badge
          variant={isConnected ? "default" : "secondary"}
          className="flex w-fit items-center gap-1"
        >
          <Radio className="h-4 w-4" />
          {isConnected ? "Live" : "Connecting…"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTrackingMap
            markers={markers}
            height={520}
            emptyText={
              isConnected
                ? "Waiting for technician location updates…"
                : "Connecting to the live feed…"
            }
          />
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Active technicians</h2>
            <Badge variant="secondary">{techs.length}</Badge>
          </div>

          {techs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No technicians are streaming their location right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {techs.map((t) => (
                <li
                  key={t.technician_id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">
                        Technician #{t.technician_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.job_id ? `Job #${t.job_id} · ` : ""}
                        {fmtTime(t.recorded_at)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveTracking;
