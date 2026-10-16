import { TicketStatus, STATUS_LABELS, STATUS_COLORS } from "@/frontdesk/lib/store";

export default function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-semibold`}
    >
      <span className={`status-dot ${STATUS_COLORS[status]}`} />
      <span className="text-foreground">{STATUS_LABELS[status]}</span>
    </span>
  );
}
