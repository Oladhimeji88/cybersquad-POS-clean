import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icons don't resolve through bundlers out of the box —
// wire them up explicitly so markers render.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Lagos fallback when there's nothing to show yet.
const DEFAULT_CENTER = [6.5244, 3.3792];

// Pans/zooms the map to contain every marker (and the path) whenever they change.
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], animate: true });
  }, [map, points]);
  return null;
}

/**
 * Presentational Leaflet map.
 *
 * markers: [{ id, lat, lng, title?, subtitle? }]
 * path:    optional [[lat, lng], ...] breadcrumb to draw as a polyline
 */
export default function LiveTrackingMap({
  markers = [],
  path = [],
  height = 400,
  emptyText = "No location to show yet.",
}) {
  const validMarkers = markers.filter(
    (m) => Number.isFinite(m?.lat) && Number.isFinite(m?.lng),
  );
  const pathPoints = (path || []).filter(
    (p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]),
  );
  const fitPoints = [
    ...validMarkers.map((m) => [m.lat, m.lng]),
    ...pathPoints,
  ];

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border"
      style={{ height }}
    >
      <MapContainer
        center={fitPoints[0] || DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {pathPoints.length > 1 && (
          <Polyline positions={pathPoints} pathOptions={{ color: "#5E01BA", weight: 4 }} />
        )}

        {validMarkers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]}>
            {(m.title || m.subtitle) && (
              <Popup>
                {m.title && <div style={{ fontWeight: 600 }}>{m.title}</div>}
                {m.subtitle && <div>{m.subtitle}</div>}
              </Popup>
            )}
          </Marker>
        ))}

        <FitBounds points={fitPoints} />
      </MapContainer>

      {fitPoints.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-background/60">
          <span className="text-sm text-muted-foreground">{emptyText}</span>
        </div>
      )}
    </div>
  );
}
