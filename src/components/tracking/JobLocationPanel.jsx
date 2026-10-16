import { useCallback, useEffect, useState } from "react";
import { MapPin, History, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useApi } from "../../hooks/useApi";
import { useWS } from "../../context/WebSocketContext";
import LiveTrackingMap from "./LiveTrackingMap";

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

/**
 * Per-job tracking panel for the admin job detail view. Seeds from
 * GET /jobs/<id>/technician-location/latest/, follows technician.location.update
 * frames for this job over the shared socket, and can load the admin-only
 * breadcrumb history (GET .../history/) on demand.
 */
export default function JobLocationPanel({ jobId }) {
  const { api } = useApi();
  const { subscribeToJob, unsubscribeFromJob, addEventListener } = useWS();

  const [latest, setLatest] = useState(null); // { lat, lng, recorded_at, is_live, status, heading }
  const [history, setHistory] = useState(null); // [[lat,lng], ...] chronological, or null
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await api.get(`/jobs/${jobId}/technician-location/latest/`, {
        showLoader: false,
      });
      const d = res?.data;
      if (!d || d.lat == null) return; // 204 / empty
      setLatest({
        lat: Number(d.lat),
        lng: Number(d.lng),
        recorded_at: d.recorded_at,
        is_live: !!d.is_live,
        status: d.status,
      });
    } catch {
      // 204 / 403 / 404 — just render the empty state.
    }
  }, [api, jobId]);

  useEffect(() => {
    if (!jobId) return undefined;
    fetchLatest();
    subscribeToJob(jobId);

    const unsub = addEventListener("technician.location.update", (data) => {
      const p = data?.payload;
      if (!p || p.job_id !== jobId) return;
      setLatest((prev) => ({
        ...(prev || {}),
        lat: Number(p.lat),
        lng: Number(p.lng),
        heading: p.heading_deg,
        recorded_at: p.recorded_at,
        is_live: true,
      }));
    });

    return () => {
      unsub();
      unsubscribeFromJob(jobId);
    };
  }, [jobId, fetchLatest, subscribeToJob, unsubscribeFromJob, addEventListener]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get(
        `/jobs/${jobId}/technician-location/history/`,
        { params: { page_size: 100 }, showLoader: false },
      );
      const rows = res?.data?.result || [];
      // API returns newest-first; reverse to chronological for the polyline.
      const points = rows
        .map((r) => [Number(r.lat), Number(r.lng)])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .reverse();
      setHistory(points);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [api, jobId]);

  const markers = latest
    ? [
        {
          id: "tech",
          lat: latest.lat,
          lng: latest.lng,
          title: "Technician",
          subtitle: latest.is_live
            ? "Live"
            : `Last seen ${fmtTime(latest.recorded_at)}`,
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Technician location
          {latest && (
            <Badge variant={latest.is_live ? "default" : "secondary"}>
              {latest.is_live ? "Live" : "Frozen"}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loadingHistory}
          onClick={() => (history ? setHistory(null) : loadHistory())}
        >
          {loadingHistory ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <History className="mr-1 h-3.5 w-3.5" />
          )}
          {history ? "Hide route" : "Show route history"}
        </Button>
      </div>

      <LiveTrackingMap
        markers={markers}
        path={history || []}
        height={320}
        emptyText="No technician location recorded for this job yet."
      />

      {latest?.recorded_at && (
        <p className="text-xs text-muted-foreground">
          Last update: {fmtTime(latest.recorded_at)}
          {latest.status ? ` · status: ${latest.status}` : ""}
        </p>
      )}
    </div>
  );
}
