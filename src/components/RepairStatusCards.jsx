import { useEffect, useState } from "react";
import {
  Wrench,
  Inbox,
  PackageSearch,
  Loader2,
  ClipboardCheck,
  PackageCheck,
  CheckCircle2,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { StatCard } from "./ui/stat-card";
import {
  PENDING_STATUSES,
  AWAITING_PARTS_STATUSES,
  REPAIR_IN_PROGRESS_STATUSES,
  QC_PENDING_STATUSES,
  READY_FOR_COLLECTION_STATUSES,
  COMPLETED_FINAL_STATUSES,
} from "../lib/jobStatusGroups";

// `tab` is which Job Management tab this status bucket lives under, and
// `status` is the exact status filter to apply there. Both are built from
// src/lib/jobStatusGroups.js so this card set can never drift from what
// Job Management's own tabs count.
const REPAIR_STATUS_BUCKETS = [
  { key: "new", label: "New / Intake", icon: Inbox, color: "text-blue-500", bgColor: "bg-blue-50", status: PENDING_STATUSES.join(","), tab: "pending" },
  { key: "awaiting_parts", label: "Awaiting Parts", icon: PackageSearch, color: "text-warning", bgColor: "bg-warning/10", status: AWAITING_PARTS_STATUSES.join(","), tab: "active" },
  { key: "in_progress", label: "Repair In Progress", icon: Wrench, color: "text-cyan-500", bgColor: "bg-cyan-50", status: REPAIR_IN_PROGRESS_STATUSES.join(","), tab: "active" },
  { key: "qc_pending", label: "QC Pending", icon: ClipboardCheck, color: "text-purple-600", bgColor: "bg-purple-50", status: QC_PENDING_STATUSES.join(","), tab: "active" },
  { key: "ready", label: "Ready for Collection", icon: PackageCheck, color: "text-indigo-500", bgColor: "bg-indigo-50", status: READY_FOR_COLLECTION_STATUSES.join(","), tab: "completed" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-success", bgColor: "bg-success/10", status: COMPLETED_FINAL_STATUSES.join(","), tab: "completed" },
];

// Stable empty array — used as the default for `extraBuckets` below so pages
// that don't pass any (the Dashboard) get the same array reference on every
// render, instead of a new `[]` each time re-triggering the fetch effect.
const NO_EXTRA_BUCKETS = [];
const NO_EXCLUDED_KEYS = [];

// Rendered on both the Dashboard (inside RepairPerformance.jsx) and Job
// Management, so the same six cards, counts, and click targets show up
// wherever repair status is surfaced. `onSelect` receives { tab, status }.
//
// `excludeKeys` hides built-in cards a page already covers another way (pass a stable array).
//
// `extraBuckets` lets a page append its own cards (same shape) fetched and
// rendered the same way — e.g. Job Management adds "Active Jobs (All)" and
// "Cancelled" so its merged summary still surfaces everything the old
// per-tab total cards did, without keeping a second, separately-fetched card
// row around just for that. Pass a stable (e.g. useMemo'd) array — a fresh
// literal on every render will re-trigger the count fetch each time.
export function RepairStatusCards({ onSelect, extraBuckets = NO_EXTRA_BUCKETS, excludeKeys = NO_EXCLUDED_KEYS, gridClassName }) {
  const { api } = useApi();
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const buckets = [...REPAIR_STATUS_BUCKETS.filter((bucket) => !excludeKeys.includes(bucket.key)), ...extraBuckets];

  useEffect(() => {
    let mounted = true;

    const fetchCount = async (status) => {
      try {
        const res = await api.get("/jobs/admin/bookings/", { params: { status, page_size: 1 } });
        return res?.data?.pagination?.count ?? 0;
      } catch {
        return null;
      }
    };

    Promise.all(buckets.map((bucket) => fetchCount(bucket.status))).then((values) => {
      if (!mounted) return;
      const next = {};
      buckets.forEach((bucket, i) => {
        next[bucket.key] = values[i];
      });
      setCounts(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraBuckets, excludeKeys]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${gridClassName || "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}>
      {buckets.map((bucket) => (
        <StatCard
          key={bucket.key}
          title={bucket.label}
          value={counts[bucket.key] ?? "—"}
          icon={bucket.icon}
          color={bucket.color}
          bgColor={bucket.bgColor}
          onClick={
            onSelect ? () => onSelect({ tab: bucket.tab, status: bucket.status }) : undefined
          }
        />
      ))}
    </div>
  );
}
