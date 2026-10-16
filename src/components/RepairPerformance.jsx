import { useEffect, useState } from "react";
import { Wrench, ShieldAlert, ArrowRight } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { RepairStatusCards } from "./RepairStatusCards";

export function RepairPerformance({ onViewSLA, onViewJobs }) {
  const { api } = useApi();

  // Breach rate is surfaced as a line of text next to the "View SLA
  // Management" link — the per-bucket SLA cards themselves were removed.
  const [slaStats, setSlaStats] = useState(null);

  useEffect(() => {
    let mounted = true;

    api
      .get("/sla/admin/dashboard/stats/", { params: { range: "today" } })
      .then((res) => {
        if (mounted) setSlaStats(res?.data?.result?.stats || null);
      })
      .catch(() => {
        if (mounted) setSlaStats(null);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            Repair Status
          </h2>
          <p className="text-sm text-muted-foreground">Click a stage to open Job Management.</p>
        </div>

        <RepairStatusCards onSelect={onViewJobs} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          {slaStats?.breach_rate !== undefined
            ? `${slaStats.breach_rate}% SLA breach rate today`
            : "Jobs at risk of missing SLA"}
        </p>
        {onViewSLA && (
          <button
            type="button"
            onClick={onViewSLA}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View SLA Management
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
