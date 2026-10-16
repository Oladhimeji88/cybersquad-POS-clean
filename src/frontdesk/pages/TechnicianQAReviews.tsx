import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DEVICE_TYPE_LABELS, getAuth, getTickets, Ticket, User } from "@/frontdesk/lib/store";
import StatusBadge from "@/frontdesk/components/StatusBadge";

type QaFilter = "all" | "returned" | "accepted";

export default function TechnicianQAReviews() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QaFilter>("all");

  useEffect(() => {
    let mounted = true;

    void Promise.all([getAuth(), getTickets()])
      .then(([authUser, ticketData]) => {
        if (!mounted) return;
        setUser(authUser);
        setTickets(ticketData);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const qaReviewedTickets = useMemo(() => {
    return tickets
      .filter((ticket) => Boolean(ticket.qaLastCheckedAt))
      .sort((a, b) => new Date(b.qaLastCheckedAt ?? b.updatedAt).getTime() - new Date(a.qaLastCheckedAt ?? a.updatedAt).getTime());
  }, [tickets]);

  const returnedJobs = useMemo(
    () => qaReviewedTickets.filter((ticket) => ticket.status === "repairing"),
    [qaReviewedTickets]
  );

  const acceptedJobs = useMemo(
    () => qaReviewedTickets.filter((ticket) => ["ready_for_handover", "completed"].includes(ticket.status)),
    [qaReviewedTickets]
  );

  const filteredTickets = useMemo(() => {
    if (filter === "returned") return returnedJobs;
    if (filter === "accepted") return acceptedJobs;
    return qaReviewedTickets;
  }, [acceptedJobs, filter, qaReviewedTickets, returnedJobs]);

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading QA reviews...</div>;
  }

  if (!user || user.role !== "engineer") {
    return <div className="text-center py-20 text-muted-foreground">Technician access only.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">QA Reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See all tickets QA has responded to.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`glass-card p-4 text-left transition-colors ${
            filter === "all" ? "border-primary bg-primary/10" : ""
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">All QA Responses</p>
          <p className="text-2xl font-bold text-foreground mt-1">{qaReviewedTickets.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter("returned")}
          className={`glass-card p-4 text-left transition-colors ${
            filter === "returned" ? "border-primary bg-primary/10" : ""
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Returned</p>
          <p className="text-2xl font-bold text-foreground mt-1">{returnedJobs.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter("accepted")}
          className={`glass-card p-4 text-left transition-colors ${
            filter === "accepted" ? "border-primary bg-primary/10" : ""
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Accepted</p>
          <p className="text-2xl font-bold text-foreground mt-1">{acceptedJobs.length}</p>
        </button>
      </div>

      <div className="space-y-4">
        {filteredTickets.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">
            No QA-reviewed tickets in this filter.
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div key={ticket.id} className="glass-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                  <p className="text-sm text-foreground">
                    {ticket.customer.name} - {DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} {ticket.device.make} {ticket.device.model}
                  </p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <p className="text-xs text-muted-foreground">{ticket.qaNotes || "No QA note provided."}</p>
              <p className="text-xs text-muted-foreground">
                QA checked by {ticket.qaCheckedBy || "QA"} on {new Date(ticket.qaLastCheckedAt ?? ticket.updatedAt).toLocaleString()}
              </p>
              <Link to={`/ticket/${ticket.id}`} className="text-xs text-primary hover:underline">
                Open Ticket
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
