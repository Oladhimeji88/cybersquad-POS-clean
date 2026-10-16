import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEVICE_TYPE_LABELS, getAuth, Ticket, User, mapBackendTicketToFrontend } from "@/frontdesk/lib/store";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import { useApi } from "@/hooks/useApi";

export default function TechnicianDoneJobs() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const { api } = useApi();

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const authUser = await getAuth();
        if (!mounted) return;
        setUser(authUser);

        if (authUser?.role === "engineer") {
          // Done-jobs view mirrors the engineer desk scope: walk_in + corporate only
          // (warranty/repeat-case are included via source_channel=walk_in). self_service
          // completed jobs belong to the mobile app's bookings screen.
          const res = await api.get('/jobs/technician/bookings/?status=delivered,closed&page_size=1000&source_channel=walk_in,corporate');
          if (mounted && res.data?.success && Array.isArray(res.data.result)) {
            setTickets(res.data.result.map(mapBackendTicketToFrontend));
          }
        }
      } catch (err) {
        console.error("Failed to load done jobs:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneJobs = tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading done jobs...</div>;
  }

  if (!user || user.role !== "engineer") {
    return <div className="text-center py-20 text-muted-foreground">Technician access only.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Done Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          List of all jobs that are fully completed.
        </p>
      </div>

      <div className="glass-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Completed Jobs</p>
        <p className="text-2xl font-bold text-foreground mt-1">{doneJobs.length}</p>
      </div>

      <div className="space-y-4">
        {doneJobs.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">
            No completed jobs yet.
          </div>
        ) : (
          doneJobs.map((ticket) => (
            <div key={ticket.id} className="glass-card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                  <p className="text-sm text-foreground">
                    {ticket.customer.name} - {DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]}{" "}
                    {ticket.device.make} {ticket.device.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Completed {new Date(ticket.updatedAt).toLocaleString()}
                  </p>
                  <Link to={`/ticket/${ticket.id}`} className="text-xs text-primary hover:underline">
                    Open Ticket
                  </Link>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
