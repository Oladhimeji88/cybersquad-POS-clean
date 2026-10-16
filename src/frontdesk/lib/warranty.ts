import type { Ticket } from "./store";

export const DEVICE_WARRANTY_WINDOW_DAYS = 365;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface WarrantyLookupMatch {
  serialNumber: string;
  normalizedSerial: string;
  sourceTicket: Ticket;
  latestTicket: Ticket;
  matchedTickets: Ticket[];
  registeredAt: Date;
  expiresAt: Date;
  isEligible: boolean;
  daysRemaining: number;
  lastActivityAt: Date;
}

function parseTicketDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCreatedAt(ticket: Ticket) {
  return (
    parseTicketDate(ticket.createdAt) ??
    parseTicketDate(ticket.updatedAt) ??
    new Date()
  );
}

function getUpdatedAt(ticket: Ticket) {
  return (
    parseTicketDate(ticket.updatedAt) ??
    parseTicketDate(ticket.createdAt) ??
    new Date()
  );
}

export function normalizeDeviceIdentifier(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function buildWarrantyLookupMatch(matchedTickets: Ticket[]): WarrantyLookupMatch | null {
  if (matchedTickets.length === 0) return null;

  const sortedByCreatedAt = [...matchedTickets].sort(
    (a, b) => getCreatedAt(a).getTime() - getCreatedAt(b).getTime()
  );
  const sortedByUpdatedAt = [...matchedTickets].sort(
    (a, b) => getUpdatedAt(b).getTime() - getUpdatedAt(a).getTime()
  );

  const sourceTicket = sortedByCreatedAt[0];
  const latestTicket = sortedByUpdatedAt[0];
  const registeredAt = getCreatedAt(sourceTicket);
  const expiresAt = new Date(
    registeredAt.getTime() + DEVICE_WARRANTY_WINDOW_DAYS * DAY_IN_MS
  );
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / DAY_IN_MS);

  return {
    serialNumber: sourceTicket.device.imei.trim(),
    normalizedSerial: normalizeDeviceIdentifier(sourceTicket.device.imei),
    sourceTicket,
    latestTicket,
    matchedTickets: sortedByUpdatedAt,
    registeredAt,
    expiresAt,
    isEligible: daysRemaining >= 0,
    daysRemaining,
    lastActivityAt: getUpdatedAt(latestTicket),
  };
}

export function findWarrantyMatches(tickets: Ticket[], query: string) {
  const normalizedQuery = normalizeDeviceIdentifier(query);
  if (!normalizedQuery) return [];

  const groups = new Map<string, Ticket[]>();

  tickets.forEach((ticket) => {
    const normalizedSerial = normalizeDeviceIdentifier(ticket.device.imei);
    if (!normalizedSerial || !normalizedSerial.includes(normalizedQuery)) return;

    const existing = groups.get(normalizedSerial);
    if (existing) {
      existing.push(ticket);
      return;
    }

    groups.set(normalizedSerial, [ticket]);
  });

  return Array.from(groups.values())
    .map((group) => buildWarrantyLookupMatch(group))
    .filter((match): match is WarrantyLookupMatch => match !== null)
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}
