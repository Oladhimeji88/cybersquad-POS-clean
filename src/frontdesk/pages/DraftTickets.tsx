import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DEVICE_TYPE_LABELS, mapBackendTicketToFrontend, PAYMENT_MODE_LABELS, Ticket } from "@/frontdesk/lib/store";
import { useApi } from "@/hooks/useApi";
import SearchField from "@/frontdesk/components/SearchField";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ClipboardList, PlusCircle, XCircle } from "lucide-react";

export default function DraftTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Ticket | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { api } = useApi();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const userStr = localStorage.getItem("user");
        let storeId;
        if (userStr) {
          const authUser = JSON.parse(userStr);
          storeId = authUser.assigned_stores?.[0]?.id;
        }

        if (!storeId) {
          if (mounted) setTickets([]);
          return;
        }

        const res = await api.get(
          `/jobs/store/${storeId}/jobs/?status=registered,awaiting_diagnosis_fee,awaiting_reassignment,awaiting_assignment`
        );
        if (mounted && res.data?.success) {
          const mapped = res.data.result.map(mapBackendTicketToFrontend);
          setTickets(mapped);
        } else if (mounted) {
          setTickets([]);
        }
      } catch (err) {
        if (mounted) setTickets([]);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const draftTickets = useMemo(
    () =>
      tickets
        .filter((ticket) =>
          [
            "awaiting_diagnosis_payment",
            "intake",
            "registered",
            "awaiting_reassignment",
            "awaiting_assignment",
          ].includes(ticket.status as any)
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [tickets]
  );

  const filteredDraftTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return draftTickets;

    return draftTickets.filter((ticket) => {
      const haystack = [
        ticket.jobId,
        ticket.customer.name,
        ticket.customer.phone,
        ticket.customer.email,
        ticket.issueReported ?? "",
        ticket.device.type ?? "",
        ticket.device.make,
        ticket.device.model,
        ticket.device.imei,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [draftTickets, search]);

  const transferDrafts = useMemo(
    () => draftTickets.filter((ticket) => ticket.diagnosisPaymentMode === "transfer").length,
    [draftTickets]
  );
  const posDrafts = useMemo(
    () => draftTickets.filter((ticket) => ticket.diagnosisPaymentMode === "pos").length,
    [draftTickets]
  );
  const cashDrafts = useMemo(
    () => draftTickets.filter((ticket) => ticket.diagnosisPaymentMode === "cash").length,
    [draftTickets]
  );

  const handleCancelDraft = async () => {
    if (!cancelTarget) return;

    setCancellingId(cancelTarget.id);

    try {
      await api.post(`/jobs/${cancelTarget.id}/status/update/`, {
        status: "cancelled",
        note: "Cancelled from draft tickets",
      });
      setTickets((prev) => prev.filter((t) => t.id !== cancelTarget.id));
      toast.success(`${cancelTarget.jobId} cancelled.`);
    } catch {
      toast.error("Unable to cancel this draft right now.");
    } finally {
      setCancellingId(null);
      setCancelTarget(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Draft Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            New intake tickets and those waiting for diagnosis payment.
          </p>
        </div>
        <Link
          to="/walk-in"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Intake
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Draft Tickets</p>
          <p className="text-2xl font-bold text-foreground mt-1">{draftTickets.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cash Drafts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{cashDrafts}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Transfer Drafts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{transferDrafts}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">POS Drafts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{posDrafts}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Next Step</p>
          <p className="text-sm text-muted-foreground mt-1">
            Open any draft to generate the invoice again or confirm payment.
          </p>
        </div>
      </div>

      <div className="glass-card p-4">
        <SearchField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search draft tickets by Job ID, customer, phone, email, device or IMEI"
        />
      </div>

      <div className="glass-card overflow-hidden">
        {filteredDraftTickets.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            {draftTickets.length === 0 ? (
              <>
                <p className="text-muted-foreground">No draft tickets right now.</p>
                <Link to="/walk-in" className="text-primary text-sm hover:underline mt-2 inline-block">
                  Start a new intake
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">No draft tickets match your search.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-6 py-4">Job ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Device</th>
                  <th className="px-6 py-4">Payment Mode</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Updated</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDraftTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      <p className="font-medium">{ticket.customer.name}</p>
                      <p className="text-xs text-muted-foreground">{ticket.customer.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <p>{DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]}</p>
                      <p>
                        {ticket.device.make} {ticket.device.model}
                      </p>
                      <p className="text-xs font-mono">{ticket.device.imei}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {PAYMENT_MODE_LABELS[ticket.diagnosisPaymentMode]}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(ticket.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <Link to={`/ticket/${ticket.id}`} className="text-sm text-muted-foreground hover:underline">
                          View
                        </Link>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setCancelTarget(ticket)}
                          disabled={cancellingId === ticket.id}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draftTickets.length > 0 && (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link to="/walk-in">Start Another Intake</Link>
          </Button>
        </div>
      )}

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Draft Ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `This will cancel ${cancelTarget.jobId} and remove it from draft tickets.`
                : "This will cancel the selected draft ticket."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(cancellingId)}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelDraft} disabled={Boolean(cancellingId)}>
              {cancellingId ? "Cancelling..." : "Cancel Ticket"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
