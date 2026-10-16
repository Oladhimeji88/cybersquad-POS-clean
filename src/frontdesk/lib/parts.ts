import type { AxiosInstance } from "axios";
import type { InventoryItem, Ticket, TicketPartRequest } from "./store";

// The backend rejects limit > 100, so larger catalogs have to be paged.
const PARTS_CATALOG_PAGE_SIZE = 100;

function mapCatalogItem(p: any): InventoryItem {
  return {
    id: String(p.id),
    name: p.name,
    sku: p.sku || undefined,
    category: p.category_id ? `Category ${p.category_id}` : "General",
    quantity: p.quantity_at_hand || 0,
    locked: 0,
    price: p.price || 0,
  };
}

// Fetches every page of the Odoo parts catalog. `result.count` is the total
// across all pages, not the size of the page returned.
export async function fetchPartsCatalog(api: AxiosInstance): Promise<InventoryItem[]> {
  const fetchPage = async (offset: number) => {
    const res = await api.get("/jobs/inventory/parts-catalog/", {
      params: { limit: PARTS_CATALOG_PAGE_SIZE, offset },
    });
    const result = res.data?.success ? res.data.result : null;
    return {
      items: Array.isArray(result?.items) ? result.items : [],
      count: Number(result?.count) || 0,
    };
  };

  const first = await fetchPage(0);
  const offsets: number[] = [];
  for (let offset = PARTS_CATALOG_PAGE_SIZE; offset < first.count; offset += PARTS_CATALOG_PAGE_SIZE) {
    offsets.push(offset);
  }
  const rest = await Promise.all(offsets.map(fetchPage));

  // Dedupe in case the catalog shifted between page requests.
  const byId = new Map<string, InventoryItem>();
  [first, ...rest].forEach((page) =>
    page.items.forEach((p: any) => {
      const item = mapCatalogItem(p);
      if (!byId.has(item.id)) byId.set(item.id, item);
    })
  );
  return [...byId.values()];
}

function normalizeInventoryIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function matchesInventoryItem(item: InventoryItem, identifier: string) {
  const normalized = normalizeInventoryIdentifier(identifier);
  return (
    normalizeInventoryIdentifier(item.id) === normalized ||
    normalizeInventoryIdentifier(item.name) === normalized ||
    (item.sku ? normalizeInventoryIdentifier(item.sku) === normalized : false)
  );
}

export function uniquePartIds(partIds: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  partIds.forEach((partId) => {
    const trimmed = partId.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
}

export function getTicketPartRequests(ticket: Ticket): TicketPartRequest[] {
  if (ticket.partRequests && ticket.partRequests.length > 0) {
    return ticket.partRequests;
  }

  if (!ticket.partRequired) {
    return [];
  }

  return [
    {
      partId: ticket.partRequired,
      ...(ticket.partAvailable !== undefined ? { available: ticket.partAvailable } : {}),
      ...(ticket.partRequestedAt ? { requestedAt: ticket.partRequestedAt } : {}),
      ...(ticket.partReleasedAt ? { releasedAt: ticket.partReleasedAt } : {}),
      ...(ticket.partReturnedDefectiveAt
        ? { returnedDefectiveAt: ticket.partReturnedDefectiveAt }
        : {}),
      ...(ticket.partReturnedDefectiveReason
        ? { returnedDefectiveReason: ticket.partReturnedDefectiveReason }
        : {}),
    },
  ];
}

export function getTicketPartIds(ticket: Ticket) {
  return getTicketPartRequests(ticket).map((request) => request.partId);
}

export function buildTicketPartFields(partRequests: TicketPartRequest[]) {
  const normalizedRequests = uniquePartIds(partRequests.map((request) => request.partId))
    .map((partId) => partRequests.find((request) => request.partId === partId))
    .filter((request): request is TicketPartRequest => request !== undefined);
  const firstRequest = normalizedRequests[0];
  const firstDefectiveRequest = normalizedRequests.find((request) => request.returnedDefectiveAt);
  const requestedAt = normalizedRequests.find((request) => request.requestedAt)?.requestedAt;
  const releasedAt = normalizedRequests.find((request) => request.releasedAt)?.releasedAt;
  const partAvailable =
    normalizedRequests.length > 0
      ? normalizedRequests.every((request) => request.available !== false)
      : undefined;

  return {
    partRequests: normalizedRequests.length > 0 ? normalizedRequests : undefined,
    partRequired: firstRequest?.partId,
    partAvailable,
    partRequestedAt: requestedAt,
    partReleasedAt: releasedAt,
    partReturnedDefectiveAt: firstDefectiveRequest?.returnedDefectiveAt,
    partReturnedDefectiveReason: firstDefectiveRequest?.returnedDefectiveReason,
  };
}

export function isAwaitingDefectiveReturnReceipt(request: TicketPartRequest) {
  return Boolean(request.returnedDefectiveAt && !request.defectiveReturnReceivedAt);
}

export function isAwaitingReplacementRelease(request: TicketPartRequest) {
  return Boolean(request.defectiveReturnReceivedAt && !request.replacementReleasedAt);
}

export function isAwaitingTechnicianPartConfirmation(request: TicketPartRequest) {
  return Boolean(
    (request.replacementReleasedAt && !request.replacementReceivedAt) ||
      (request.releasedAt && !request.receivedAt && !request.returnedDefectiveAt)
  );
}

export function isPartReadyForRepair(request: TicketPartRequest) {
  if (request.replacementReceivedAt) return true;
  if (request.releasedAt && request.receivedAt && !request.returnedDefectiveAt) return true;
  if (request.returnedDefectiveAt) return false;
  return false;
}

export function getLatestPartReleaseAt(request: TicketPartRequest) {
  if (request.replacementReleasedAt) {
    return request.replacementReleasedAt;
  }
  if (request.returnedDefectiveAt) {
    return undefined;
  }
  return request.releasedAt;
}

export function shouldConsumePartOnCompletion(request: TicketPartRequest) {
  return Boolean(
    request.replacementReceivedAt || (request.receivedAt && request.releasedAt && !request.returnedDefectiveAt)
  );
}

export function getInventoryPartName(partId: string, inventory: InventoryItem[], fallbackName?: string) {
  return inventory.find((item) => matchesInventoryItem(item, partId))?.name ?? fallbackName ?? partId;
}

export function getInventoryAvailableUnits(partId: string, inventory: InventoryItem[]) {
  const part = inventory.find((item) => matchesInventoryItem(item, partId));
  if (!part) return 0;
  return Math.max(0, part.quantity - part.locked);
}
