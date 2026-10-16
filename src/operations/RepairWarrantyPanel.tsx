import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Ticket, User } from "@/frontdesk/lib/store";
import { userHasRole } from "@/auth/roleUtils";
import { getBusiness, getWarrantyRecords, recordRepairCoverage, warrantyStatus, type WarrantyRecord } from "./business";

export default function RepairWarrantyPanel({ ticket, user }: { ticket: Ticket; user: User | null }) {
  const [linked, setLinked] = useState<WarrantyRecord | undefined>(); const [issued, setIssued] = useState<WarrantyRecord | undefined>();
  const [months, setMonths] = useState(""); const [terms, setTerms] = useState("");
  const [completedAt, setCompletedAt] = useState(ticket.handedOverAt?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([getBusiness(), getWarrantyRecords()]).then(([state, records]) => {
    setLinked(state.warrantyLinks[ticket.id]); setIssued(records.find((record) => record.source === "repair" && record.sourceId === ticket.id));
  }).catch(() => toast.error("Could not load repair coverage.")); }, [ticket.id]);
  const canRecord = userHasRole(user, "admin", "qa") && ["completed", "delivered", "closed"].includes(ticket.status);
  return <section className="glass-card p-4 space-y-4">
    <h2 className="font-semibold">Warranty records</h2>
    {linked ? <div className="text-sm space-y-1"><p>Original {linked.source}: {linked.reference} · {linked.serial}</p>
      <p>{warrantyStatus(linked)} · {linked.coverage.startsAt.slice(0, 10)} to {linked.coverage.expiresAt.slice(0, 10)}</p><p>{linked.coverage.terms}</p>
    </div> : <p className="text-sm text-muted-foreground">No original sale or repair warranty linked. Eligibility must be verified against recorded terms.</p>}
    {issued && <div className="text-sm"><p>Warranty issued for this repair: {issued.coverage.startsAt.slice(0, 10)} to {issued.coverage.expiresAt.slice(0, 10)}</p><p>{issued.coverage.terms}</p></div>}
    {canRecord && !issued && <form className="space-y-2" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true);
      try { setIssued(await recordRepairCoverage(ticket, Number(months), terms, user!.name, new Date(completedAt).toISOString())); toast.success("Repair warranty recorded."); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Could not record coverage."); } finally { setBusy(false); }
    }}>
      <p className="text-sm">Record the approved warranty for this completed repair.</p>
      <label className="block text-sm">Actual completion / handover date<Input type="date" required value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} /></label>
      <label className="block text-sm">Approved duration (months)<Input type="number" required min={1} max={60} value={months} onChange={(event) => setMonths(event.target.value)} /></label>
      <label className="block text-sm">Covered work and conditions<Input required value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>Record repair warranty</Button>
    </form>}
  </section>;
}
