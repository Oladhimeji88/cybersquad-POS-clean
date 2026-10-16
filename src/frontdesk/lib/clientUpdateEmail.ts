import { STATUS_LABELS, Ticket } from "@/frontdesk/lib/store";

interface ClientUpdateEmailOptions {
  updateTitle: string;
  updatedBy?: string;
  details?: string[];
}

export function sendClientTicketUpdateEmail(
  ticket: Ticket,
  options: ClientUpdateEmailOptions
) {
  if (typeof window === "undefined") return false;
  if (!ticket.customer.email?.trim()) return false;

  const subject = `Ticket Update - ${ticket.jobId}`;
  const bodyLines = [
    `Hello ${ticket.customer.name},`,
    "",
    `There is an update on your repair ticket (${ticket.jobId}).`,
    `Update: ${options.updateTitle}`,
    `Current status: ${STATUS_LABELS[ticket.status]}`,
    `Device: ${ticket.device.make} ${ticket.device.model}`.trim(),
    ticket.issueReported ? `Reported issue: ${ticket.issueReported}` : "",
    options.updatedBy ? `Updated by: ${options.updatedBy}` : "",
    ...(options.details ?? []),
    "",
    "Thank you,",
    "Cybersquad Device Services",
  ].filter(Boolean);

  const body = bodyLines.join("\n");
  const mailtoUrl = `mailto:${encodeURIComponent(ticket.customer.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.location.href = mailtoUrl;
  return true;
}
