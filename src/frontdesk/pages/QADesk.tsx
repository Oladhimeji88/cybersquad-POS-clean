import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEVICE_TYPE_LABELS,
  getAuth,
  getInventory,
  getTickets,
  saveTickets,
  Ticket,
  User,
  mapBackendTicketToFrontend,
} from "@/frontdesk/lib/store";
import { useApi } from "@/hooks/useApi";
import SearchField from "@/frontdesk/components/SearchField";
import { getTicketPartRequests, shouldConsumePartOnCompletion } from "@/frontdesk/lib/parts";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";

export default function QADesk() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [qaNotesDrafts, setQaNotesDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const { api } = useApi();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [authUser, ticketData] = await Promise.all([getAuth(), getTickets()]);
        if (!mounted) return;

        setUser(authUser);

        let backendTickets: Ticket[] = [];
        try {
          // the lead engineer doing QA checks their repair review queue
          const res = await api.get('/jobs/admin/bookings/?status=submitted_for_qc_review&page_size=1000');
          if (res.data?.success && Array.isArray(res.data.result)) {
            backendTickets = res.data.result.map(mapBackendTicketToFrontend);
          }
        } catch (err) {
          console.error("Failed to fetch QA bookings:", err);
        }

        try {
          const statsRes = await api.get('/jobs/lead-engineer/dashboard/stats/?range=30d');
          if (statsRes.data?.success) {
            setDashboardStats(statsRes.data.result);
          }
        } catch (err) {
          console.error("Failed to fetch Lead Engineer stats:", err);
        }

        // Use backend-only when API returned data; fall back to local storage only if API failed
        const finalTickets = backendTickets.length > 0 ? backendTickets : ticketData;

        setTickets(finalTickets);
        setQaNotesDrafts((prev) => {
          const next: Record<string, string> = {};
          finalTickets.forEach((ticket) => {
            next[ticket.id] = prev[ticket.id] ?? ticket.qaNotes ?? "";
          });
          return next;
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    const refreshInterval = window.setInterval(() => {
      void load();
    }, 5000);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "repair_shop_tickets" || event.key === "repair_shop_auth" || event.key === null) {
        void load();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const qaQueue = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets
      .filter((ticket) => ["quality_check", "submitted_for_qc_review", "repaired"].includes(ticket.status))
      .filter((ticket) => {
        if (!query) return true;
        return [
          ticket.jobId,
          ticket.customer.name,
          ticket.customer.phone,
          ticket.device.make,
          ticket.device.model,
          ticket.device.imei,
          ticket.issueReported ?? "",
          ticket.engineerUpdate ?? "",
          ticket.qaNotes ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [search, tickets]);

  const qaPassedRecently = useMemo(
    () =>
      tickets
        .filter((ticket) => ["ready_for_handover", "completed", "qc_passed", "ready_for_collection"].includes(ticket.status) && ticket.qaCheckedBy)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [tickets]
  );

  const persistQaDecision = async (
    ticketId: string,
    nextStatus: Ticket["status"],
    successMessage: string
  ) => {
    const note = (qaNotesDrafts[ticketId] ?? "").trim();
    const allTickets = await getTickets();
    const index = allTickets.findIndex((ticket) => ticket.id === ticketId);
    if (index === -1) return;

    allTickets[index] = {
      ...allTickets[index],
      status: nextStatus,
      qaNotes: note || allTickets[index].qaNotes,
      qaCheckedBy: user?.name ?? allTickets[index].qaCheckedBy,
      qaLastCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveTickets(allTickets);
    setTickets(allTickets);
    toast.success(successMessage);
  };

  const handleReturnToEngineer = async (ticket: Ticket) => {
    const note = (qaNotesDrafts[ticket.id] ?? "").trim();
    if (!note) {
      toast.error("Add QA notes before sending this device back to the technician.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/lead-engineer/reject-qc/`, { notes: note });
        toast.success(`${ticket.jobId} returned to technician for correction.`);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to reject QA via API.");
      }
      return;
    }

    await persistQaDecision(ticket.id, "repairing", `${ticket.jobId} returned to technician for correction.`);
  };

  const handleQaApprove = async (ticket: Ticket) => {
    const note = (qaNotesDrafts[ticket.id] ?? "").trim();
    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/lead-engineer/approve-qc/`, {
          ready_for_collection: true,
          ...(note ? { notes: note } : {}),
        });
        toast.success(`${ticket.jobId} passed QA and is ready for front desk handover.`);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to approve QA via API.");
      }
      return;
    }

    const ticketPartRequests = getTicketPartRequests(ticket);
    if (ticketPartRequests.length > 0) {
      const inventory = await getInventory();
      ticketPartRequests.forEach((request) => {
        if (!shouldConsumePartOnCompletion(request)) return;
        const itemIndex = inventory.findIndex((item) => item.id === request.partId);
        if (itemIndex === -1) return;
        inventory[itemIndex] = {
          ...inventory[itemIndex],
          locked: Math.max(0, inventory[itemIndex].locked - 1),
          quantity: Math.max(0, inventory[itemIndex].quantity - 1),
        };
      });
      await saveInventory(inventory);
    }

    await persistQaDecision(ticket.id, "ready_for_handover", `${ticket.jobId} passed QA and is ready for front desk handover.`);
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading QA workspace...</div>;
  }

  if (!user || (user.role !== "qa" && user.role !== "admin")) {
    return (
      <div className="glass-card p-8 max-w-xl mx-auto text-center space-y-2">
        <p className="text-lg font-semibold text-foreground">QA access only</p>
        <p className="text-sm text-muted-foreground">
          Sign in with a QA account to test repaired devices and decide whether they are ready for front desk.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QA Desk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Retest devices sent by technicians, approve repaired devices for front desk handover, or send them back for correction.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          In QA queue: <span className="text-foreground font-semibold">{qaQueue.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardStats ? (
          <>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{dashboardStats.jobs_managed ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Jobs Managed (30d)</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{dashboardStats.active_jobs ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Active Jobs</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">₦{(dashboardStats.total_revenue ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Revenue (30d)</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{dashboardStats.sla_breaches ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">SLA Breaches</p>
            </div>
          </>
        ) : (
          <>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{qaQueue.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Waiting For QA</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{tickets.filter((ticket) => ticket.status === "repairing").length}</p>
              <p className="text-xs text-muted-foreground mt-1">Back With Technician</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-2xl font-bold text-foreground">{qaPassedRecently.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Recently Approved</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-sm text-muted-foreground">
                Failed devices go back to <span className="text-foreground font-medium">Repairing</span> until the technician resubmits them to QA.
              </p>
            </div>
          </>
        )}
      </div>

      {dashboardStats?.technician_summary && dashboardStats.technician_summary.length > 0 && (
        <div className="glass-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Technician Performance (30d)</h2>
          <div className="space-y-4">
            {dashboardStats.technician_summary.map((tech: any) => (
              <div key={tech.technician_id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <span className="font-medium text-foreground">{tech.technician_name || `Tech #${tech.technician_id}`}</span>
                <div className="flex gap-4 text-muted-foreground text-xs">
                  <span>{tech.jobs_count} Jobs</span>
                  <span>{tech.active_jobs} Active</span>
                  <span className="flex items-center gap-1 text-warning">★ {tech.avg_rating?.toFixed(1) || "0.0"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-4">
        <SearchField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search QA jobs by ID, customer, issue, device or QA note..."
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">QA Queue</h2>
        <div className="space-y-4">
          {qaQueue.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <ClipboardCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No devices are waiting for QA right now.</p>
            </div>
          ) : (
            qaQueue.map((ticket) => (
              <div key={ticket.id} className="glass-card p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                    <p className="text-sm text-foreground">{ticket.customer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} - {ticket.device.make} {ticket.device.model}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{ticket.device.imei}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">Issue:</span> {ticket.issueReported || "Not captured"}
                    </p>
                    {ticket.assignedEngineer && (
                      <p className="text-sm text-muted-foreground">
                        <span className="text-foreground font-medium">Technician:</span> {ticket.assignedEngineer}
                      </p>
                    )}
                    {ticket.engineerUpdate && (
                      <p className="text-sm text-muted-foreground">
                        <span className="text-foreground font-medium">Technician Update:</span> {ticket.engineerUpdate}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    <StatusBadge status={ticket.status} />
                    <Link to={`/ticket/${ticket.id}`} className="text-sm text-primary hover:underline">
                      Open Full Ticket
                    </Link>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`qa-note-${ticket.id}`}>QA Notes</Label>
                  <Textarea
                    id={`qa-note-${ticket.id}`}
                    value={qaNotesDrafts[ticket.id] ?? ""}
                    onChange={(event) =>
                      setQaNotesDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))
                    }
                    placeholder="Document test result, faults found, or confirmation that the device is ready..."
                    rows={3}
                    className="bg-secondary border-border"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void handleReturnToEngineer(ticket)}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Return To Technician
                  </Button>
                  <Button onClick={() => void handleQaApprove(ticket)}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    QA Passed - Send To Front Desk
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Recently Approved</h2>
        <div className="space-y-4">
          {qaPassedRecently.length === 0 ? (
            <div className="glass-card p-6 text-sm text-muted-foreground">
              No recently approved QA tickets yet.
            </div>
          ) : (
            qaPassedRecently.map((ticket) => (
              <div key={ticket.id} className="glass-card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                    <p className="text-sm text-foreground">
                      {ticket.customer.name} - {ticket.device.make} {ticket.device.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Approved by {ticket.qaCheckedBy || "QA"} {ticket.qaLastCheckedAt ? `on ${new Date(ticket.qaLastCheckedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
