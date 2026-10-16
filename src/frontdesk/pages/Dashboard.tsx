import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  mapBackendTicketToFrontend,
  PAYMENT_MODE_LABELS,
  Ticket,
} from "@/frontdesk/lib/store";
import { useApi } from "@/hooks/useApi";
import SearchField from "@/frontdesk/components/SearchField";
import { getTicketPartRequests } from "@/frontdesk/lib/parts";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";

const RECENT_TICKETS_PAGE_SIZE = 10;
const NORMAL_TICKET_STATUSES =
  "repeat_case_validation_pending,warranty_validation_pending,warranty_validated,diagnosing,quote_sent,quote_accepted,awaiting_payment,payment_confirmed,repair_in_progress,repaired,submitted_for_qc_review,qc_passed,ready_for_collection,delivered,closed,cancelled";

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]); // Current page of recent tickets
  const [draftTickets, setDraftTickets] = useState<Ticket[]>([]); // Draft specific
  const [statsData, setStatsData] = useState<any>(null); // Dashboard stats
  const [user, setUser] = useState<any | null>(null);
  const [ticketSearch, setTicketSearch] = useState("");
  const [storeId, setStoreId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{
    count: number;
    pages: number;
    page: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const { api } = useApi();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const userStr = localStorage.getItem("user");
        let resolvedStoreId: number | undefined;
        if (userStr) {
          const authUser = JSON.parse(userStr);
          resolvedStoreId = authUser.assigned_stores?.[0]?.id;
          if (mounted) {
             setUser(authUser.user || authUser);
          }
        }

        if (!resolvedStoreId) return;
        if (mounted) setStoreId(resolvedStoreId);

        const statsReq = api.get(`/jobs/store/${resolvedStoreId}/dashboard/stats/?range=30d`).catch(() => null);
        const draftsReq = api
          .get(`/jobs/store/${resolvedStoreId}/jobs/?status=registered,awaiting_diagnosis_fee,awaiting_reassignment,awaiting_assignment&page_size=1000`)
          .catch(() => null);

        const [statsRes, draftsRes] = await Promise.all([statsReq, draftsReq]);

        if (!mounted) return;

        if (statsRes?.data?.success) {
          setStatsData(statsRes.data.result);
        }

        if (draftsRes?.data?.success) {
          const mappedDrafts = draftsRes.data.result.map(mapBackendTicketToFrontend);
          setDraftTickets(mappedDrafts);
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let mounted = true;

    const loadTickets = async () => {
      setLoadingTickets(true);
      try {
        const res = await api
          .get(
            `/jobs/store/${storeId}/jobs/?status=${NORMAL_TICKET_STATUSES}&page=${page}&page_size=${RECENT_TICKETS_PAGE_SIZE}`
          )
          .catch(() => null);

        if (!mounted) return;

        if (res?.data?.success) {
          const mapped = res.data.result.map(mapBackendTicketToFrontend);
          setTickets(mapped);
          const meta = res.data.pagination;
          if (meta) {
            setPagination({
              count: meta.count ?? mapped.length,
              pages: meta.pages ?? 1,
              page: meta.page ?? page,
              hasNext: Boolean(meta.next),
              hasPrev: Boolean(meta.previous),
            });
          }
        }
      } finally {
        if (mounted) setLoadingTickets(false);
      }
    };

    void loadTickets();

    return () => {
      mounted = false;
    };
  }, [storeId, page]);

  const buildTechnicianSummary = (ticket: Ticket) => {
    const parts: string[] = [];
    if (ticket.diagnosis) {
      const diagnosisSnippet =
        ticket.diagnosis.length > 56 ? `${ticket.diagnosis.slice(0, 56).trim()}...` : ticket.diagnosis;
      parts.push(`Diagnosis: ${diagnosisSnippet}`);
    }
    const requestedParts = getTicketPartRequests(ticket);
    if (requestedParts.length > 0) {
      parts.push(`${requestedParts.length} part${requestedParts.length === 1 ? "" : "s"} selected`);
    }
    if (typeof ticket.quotation === "number") {
      parts.push(`Quote: NGN ${ticket.quotation.toLocaleString()}`);
    }
    if (ticket.engineerUpdate) {
      const updateSnippet =
        ticket.engineerUpdate.length > 40
          ? `${ticket.engineerUpdate.slice(0, 40).trim()}...`
          : ticket.engineerUpdate;
      parts.push(`Update: ${updateSnippet}`);
    }

    return parts.length > 0 ? parts.join(" | ") : "No technician update yet";
  };

  const normalizePhoneDigits = (value: string) => value.replace(/\D/g, "");
  const formatTicketLocation = (ticket: Ticket) =>
    [ticket.city, ticket.state, ticket.country].filter(Boolean).join(", ");

  const recentDraftTickets = draftTickets.slice(0, 4);

  const stats = [
    {
      label: "Total Tickets",
      value: statsData ? (statsData.active_jobs + statsData.completed_count) : tickets.length,
      icon: ClipboardList,
      color: "text-info",
    },
    {
      label: "In Progress",
      value: statsData?.active_jobs ?? tickets.filter((t) =>
        ["diagnosing", "awaiting_parts_release", "ready_for_repair", "repairing", "quality_check", "ready_for_handover"].includes(t.status)
      ).length,
      icon: Clock,
      color: "text-primary",
    },
    {
      label: "Completed",
      value: statsData?.completed_count ?? tickets.filter((t) => t.status === "completed").length,
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Draft Tickets",
      value: draftTickets.length,
      icon: AlertTriangle,
      color: "text-warning",
    },
  ];
  const normalizedSearch = ticketSearch.trim().toLowerCase();
  const normalizedPhoneSearch = normalizePhoneDigits(ticketSearch);
  const isSearching = normalizedSearch.length > 0;
  const visibleTickets = isSearching
    ? tickets.filter((ticket) => {
        const jobId = ticket.jobId.toLowerCase();
        const email = ticket.customer.email.toLowerCase();
        const phone = ticket.customer.phone.toLowerCase();
        const phoneDigits = normalizePhoneDigits(ticket.customer.phone);

        return (
          jobId.includes(normalizedSearch) ||
          email.includes(normalizedSearch) ||
          phone.includes(normalizedSearch) ||
          (normalizedPhoneSearch.length > 0 && phoneDigits.includes(normalizedPhoneSearch))
        );
      })
    : tickets;
  const showPagination = !isSearching && pagination && pagination.count > RECENT_TICKETS_PAGE_SIZE;
  const pageStart = pagination ? (pagination.page - 1) * RECENT_TICKETS_PAGE_SIZE + 1 : 0;
  const pageEnd = pagination ? Math.min(pagination.page * RECENT_TICKETS_PAGE_SIZE, pagination.count) : 0;
  const canViewAllTickets = user?.role === "admin";
  const intakePath = canViewAllTickets ? "/new-ticket" : "/walk-in";
  const intakeLabel = canViewAllTickets ? "New Ticket" : "Walk In";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "morning" : "afternoon"},{" "}
          <span className="gradient-text">{user?.name?.split(" ")[0]}</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening in the shop today.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Draft Tickets</h3>
              <p className="text-sm text-muted-foreground">
                Intake tickets waiting for diagnosis payment confirmation.
              </p>
            </div>
            <Link
              to="/drafts"
              className="inline-flex items-center gap-1 px-4 h-8 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Open Drafts
            </Link>
          </div>
        </div>

        {draftTickets.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No draft tickets waiting for payment.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentDraftTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                  <p className="text-sm text-foreground">{ticket.customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.device.make} {ticket.device.model} | {PAYMENT_MODE_LABELS[ticket.diagnosisPaymentMode]}
                  </p>
                </div>
                <div className="flex items-center gap-4 sm:gap-4">
                  <StatusBadge status={ticket.status} />
                  <Link
                    to={`/ticket/${ticket.id}`}
                    className="text-sm text-primary hover:underline whitespace-nowrap"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Tickets */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold text-foreground">
              {isSearching ? "Search Results" : "Recent Tickets"}
            </h3>
            <div className="flex items-center gap-2">
              {canViewAllTickets && (
                <Link
                  to="/tickets"
                  className="inline-flex items-center gap-1 px-4 h-8 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Link>
              )}
              <Link
                to={intakePath}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {intakeLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <SearchField
            value={ticketSearch}
            onChange={(event: any) => setTicketSearch(event.target.value)}
            placeholder="Search by order number, phone number, or email"
            ariaLabel="Search by order number, phone number, or email"
            className="max-w-xl"
            inputClassName="bg-background/80"
          />
          {isSearching && (
            <p className="text-xs text-muted-foreground">
              {visibleTickets.length} {visibleTickets.length === 1 ? "result" : "results"} found.
            </p>
          )}
        </div>

        {visibleTickets.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              {isSearching ? "No matching tickets found." : "No tickets yet."}
            </p>
            {!isSearching && (
              <Link
                to={intakePath}
                className="text-primary text-sm hover:underline mt-2 inline-block"
              >
                Start intake
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-6 py-4">Job ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Technician Update</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <span className="font-mono text-sm font-semibold text-primary">
                          {ticket.jobId}
                        </span>
                        {ticket.jobGroupType === "parent" && (
                          <p className="text-xs text-muted-foreground">Corporate parent job</p>
                        )}
                        {ticket.jobGroupType === "child" && ticket.parentJobId && (
                          <p className="text-xs text-muted-foreground">Corporate child of #{ticket.parentJobId}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      <div className="space-y-1">
                        <p>{ticket.customer.name}</p>
                        {formatTicketLocation(ticket) && (
                          <p className="text-xs text-muted-foreground">{formatTicketLocation(ticket)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="space-y-1">
                        <p>{ticket.device.make} {ticket.device.model}</p>
                        {ticket.sourceChannel === "corporate" && (
                          <p className="text-xs text-muted-foreground">Corporate workflow</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground max-w-[320px]">
                      {buildTechnicianSummary(ticket)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/ticket/${ticket.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showPagination && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {pageStart}–{pageEnd} of {pagination!.count}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination!.hasPrev || loadingTickets}
                className="inline-flex items-center gap-1 px-4 h-8 rounded-md border border-border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="text-xs">
                Page {pagination!.page} of {pagination!.pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination!.hasNext || loadingTickets}
                className="inline-flex items-center gap-1 px-4 h-8 rounded-md border border-border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:text-foreground hover:bg-secondary transition-colors"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
