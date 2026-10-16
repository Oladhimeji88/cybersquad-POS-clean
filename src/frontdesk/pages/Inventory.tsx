import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuth, getInventory, getTickets, InventoryItem, mapBackendTicketToFrontend, saveInventory, saveTickets, STATUS_LABELS, Ticket, TicketStatus, User } from "@/frontdesk/lib/store";
import SearchField from "@/frontdesk/components/SearchField";
import {
  buildTicketPartFields,
  fetchPartsCatalog,
  getInventoryPartName,
  getTicketPartRequests,
  isPartReadyForRepair,
  isAwaitingTechnicianPartConfirmation,
} from "@/frontdesk/lib/parts";
import { useApi } from "@/hooks/useApi";
import { Package, RotateCcw, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function normalizeInventoryValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function findCatalogItem(items: InventoryItem[], ...candidates: Array<unknown>) {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeInventoryValue(candidate))
    .filter(Boolean);

  return items.find((item) => {
    const itemValues = [
      normalizeInventoryValue(item.id),
      normalizeInventoryValue(item.name),
      normalizeInventoryValue(item.sku),
    ];
    return normalizedCandidates.some((candidate) => itemValues.includes(candidate));
  });
}

function canReleaseBackendRequest(status?: TicketStatus, isWarranty?: boolean) {
  if (isWarranty) return true;
  return Boolean(
    status &&
      [
        "quote_accepted",
        "awaiting_payment",
        "payment_confirmed",
        "awaiting_parts_release",
        "ready_for_repair",
        "repairing",
        "repair_in_progress",
        "repaired",
        "submitted_for_qc_review",
        "qc_passed",
        "ready_for_collection",
        "ready_for_handover",
        "completed",
      ].includes(status)
  );
}

function sanitizeInventory(items: InventoryItem[]): InventoryItem[] {
  return items.map((item) => {
    const quantity = Math.max(0, Math.floor(Number.isFinite(item.quantity) ? item.quantity : 0));
    const locked = Math.max(0, Math.floor(Number.isFinite(item.locked) ? item.locked : 0));
    const price = Math.max(0, Number.isFinite(item.price) ? item.price : 0);

    return {
      ...item,
      name: item.name.trim() || "Unnamed Part",
      category: item.category.trim() || "Uncategorized",
      quantity,
      locked: Math.min(locked, quantity),
      price,
    };
  });
}

function isWarrantyServiceTicket(ticket: Ticket) {
  return ticket.intakeType === "repeat_return" || ticket.intakeType === "warranty";
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [initialItems, setInitialItems] = useState<InventoryItem[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasingKey, setReleasingKey] = useState<string | null>(null);
  const [backendAllPartRequests, setBackendAllPartRequests] = useState<any[]>([]);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { api } = useApi();

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [inventory, authUser, ticketData] = await Promise.all([
          getInventory(),
          getAuth(),
          getTickets(),
        ]);
        if (!mounted) return;

        setUser(authUser);

        let backendInventory: InventoryItem[] = [];
        try {
          backendInventory = await fetchPartsCatalog(api);
        } catch (err) {
          console.error("Failed to fetch parts catalog:", err);
        }
        const finalInventory = backendInventory.length > 0 ? backendInventory : inventory;
        setItems(finalInventory);
        setInitialItems(finalInventory);

        let backendTickets: Ticket[] = [];
        try {
          const userStr = localStorage.getItem("user");
          let storeId;
          if (userStr) {
            const parsed = JSON.parse(userStr);
            storeId = parsed.assigned_stores?.[0]?.id ?? parsed.user?.assigned_stores?.[0]?.id;
          }

          let endpoint = '/jobs/admin/bookings/?status=payment_confirmed,quote_accepted,awaiting_parts_release,repairing,repair_in_progress,repaired,submitted_for_qc_review,quality_check,qc_passed,ready_for_handover,ready_for_collection,completed&page_size=200';
          if (storeId) {
            endpoint = `/jobs/store/${storeId}/jobs/?status=payment_confirmed,quote_accepted,awaiting_parts_release,repairing,repair_in_progress,repaired,submitted_for_qc_review,quality_check,qc_passed,ready_for_handover,ready_for_collection,completed&page_size=200`;
          }
          
          const res = await api.get(endpoint);
          const dataArray = res.data?.success ? (res.data.result?.data || res.data.result) : null;
          if (Array.isArray(dataArray)) {
            backendTickets = dataArray.map(mapBackendTicketToFrontend);
          }
        } catch (err: any) {
          console.error("Failed to fetch inventory jobs:", err);
          setDebugError("Bookings fetch failed: " + (err?.response?.data?.message || err.message));
        }

        if (backendTickets.length > 0) {
          try {
            const promises = backendTickets.map((t) =>
              api.get(`/jobs/${t.id}/admin/inventory/parts/`).catch((e) => {
                 return null;
              })
            );
            const results = await Promise.all(promises);
            const backendRequests = results.flatMap((r: any) =>
              r?.data?.success ? r.data.result || [] : []
            );
            setBackendAllPartRequests(backendRequests);
          } catch (err: any) {
             setDebugError("Part fetch failed: " + err.message);
          }
        } else if (!debugError) {
             setDebugError("No backend tickets found for part scanning.");
        }

        // Use backend-only when API returned data; fall back to local storage only if API failed
        const finalTickets = backendTickets.length > 0 ? backendTickets : ticketData;
        setTickets(finalTickets);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const canEdit = user?.role === "admin";
  const canReleaseParts = user?.role === "inventory_manager" || user?.role === "admin";
  const isTechnicianView = user?.role === "engineer";
  const hasChanges = JSON.stringify(items) !== JSON.stringify(initialItems);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.category.toLowerCase().includes(search.toLowerCase())
      ),
    [items, search]
  );

  const partNameById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item.name]));
  }, [items]);

  const inventoryById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const stockSummary = useMemo(() => {
    const totals = items.reduce(
      (acc, item) => {
        const available = Math.max(0, item.quantity - item.locked);
        acc.totalUnits += item.quantity;
        acc.availableUnits += available;
        acc.lockedUnits += item.locked;
        acc.stockValue += item.quantity * item.price;
        if (available <= 3) acc.lowStockParts += 1;
        if (available === 0) acc.outOfStockParts += 1;
        return acc;
      },
      {
        totalUnits: 0,
        availableUnits: 0,
        lockedUnits: 0,
        stockValue: 0,
        lowStockParts: 0,
        outOfStockParts: 0,
      }
    );

    return totals;
  }, [items]);

  const inventoryValueLabel = useMemo(() => {
    const fullValue = `₦${stockSummary.stockValue.toLocaleString("en-NG")}`;
    const compactValue = new Intl.NumberFormat("en-NG", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(stockSummary.stockValue);

    return {
      compact: `₦${compactValue}`,
      full: fullValue,
    };
  }, [stockSummary.stockValue]);

  const requestedParts = useMemo(() => {
    // Backend Logic
    if (backendAllPartRequests.length > 0 || tickets.some((t) => !isNaN(Number(t.id)))) {
      const pendingBackendRequests = backendAllPartRequests.filter(
        (req: any) => (req.status === "requested" || !req.approved_at) && !req.re_requested_from
      );

      return pendingBackendRequests.map((req: any) => {
        const ticket = tickets.find((t) => String(t.id) === String(req.job));
        const catalogItem = findCatalogItem(
          items,
          req.product_id,
          req.sku,
          req.part_name,
          req.name
        );
        const partName = req.part_name || req.name || catalogItem?.name || req.sku || `Part Request ${req.id}`;
        const resolvedSku = catalogItem
          ? String(catalogItem.sku ?? "").trim()
          : String(req.sku ?? "").trim();
        return {
          ticketId: String(req.job),
          jobId: ticket?.jobId || String(req.job),
          customerName: ticket?.customer?.name || "Unknown Customer",
          partId: String(req.product_id || req.sku || req.part_name || req.id),
          sku: resolvedSku,
          partName,
          originalRequestId: req.id, // Needed for approval
          requestedQty: Number(req.requested_qty || 1),
          availableUnits: catalogItem ? Math.max(0, catalogItem.quantity - catalogItem.locked) : 0,
          canRelease: canReleaseBackendRequest(ticket?.status, ticket ? isWarrantyServiceTicket(ticket) : false),
          hasCatalogMatch: Boolean(catalogItem),
          missingCatalogSku: Boolean(catalogItem) && !resolvedSku,
          requestedAt: req.created_at,
          releasedAt: req.approved_at || req.received_at,
          returnedDefectiveAt: req.returned_at,
          status: ticket?.status || "awaiting_parts_release",
          paymentReceivedAt: ticket?.repairPaymentReceivedAt,
          isWarranty: ticket ? isWarrantyServiceTicket(ticket) : false,
        };
      }).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }

    // Local Storage Fallback
    return tickets
      .flatMap((ticket) =>
        getTicketPartRequests(ticket)
          .map((request) => ({
            ticketId: ticket.id,
            jobId: ticket.jobId,
            customerName: ticket.customer.name,
            partId: request.partId,
            sku: request.partId,
            partName: partNameById.get(request.partId) ?? request.partName ?? request.partId,
            originalRequestId: null,
            requestedQty: 1,
            availableUnits: Math.max(
              0,
              (inventoryById.get(request.partId)?.quantity ?? 0) -
                (inventoryById.get(request.partId)?.locked ?? 0)
            ),
            canRelease: isWarrantyServiceTicket(ticket) || Boolean(ticket.repairPaymentReceivedAt),
            hasCatalogMatch: inventoryById.has(request.partId),
            requestedAt:
              request.requestedAt ??
              (ticket.status === "awaiting_repair_payment" ? ticket.updatedAt : undefined),
            releasedAt: request.releasedAt,
            returnedDefectiveAt: request.returnedDefectiveAt,
            status: ticket.status,
            paymentReceivedAt: ticket.repairPaymentReceivedAt,
            isWarranty: isWarrantyServiceTicket(ticket),
          }))
          .filter((entry) => Boolean(entry.requestedAt) && !entry.releasedAt && !entry.returnedDefectiveAt)
      )
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [backendAllPartRequests, inventoryById, partNameById, tickets, items]);

  const releasedParts = useMemo(() => {
    if (backendAllPartRequests.length > 0 || tickets.some((t) => !isNaN(Number(t.id)))) {
      return backendAllPartRequests
        .filter((req: any) => req.received_at)
        .map((req: any) => {
          const ticket = tickets.find((t) => String(t.id) === String(req.job));
          const catalogItem = findCatalogItem(items, req.product_id, req.sku, req.part_name, req.name);
          const partName = req.part_name || req.name || catalogItem?.name || req.sku || `Part Request ${req.id}`;
          return {
            ticketId: String(req.job),
            jobId: ticket?.jobId || String(req.job),
            partId: String(req.id),
            partName,
            engineerName: ticket?.assignedEngineer ?? "Unassigned",
            releasedAt: req.received_at,
          };
        })
        .sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
    }

    const releaseStatuses = new Set<TicketStatus>(["repairing", "quality_check", "ready_for_handover", "completed"]);
    return tickets
      .flatMap((ticket) =>
        getTicketPartRequests(ticket)
          .map((request) => {
            const releasedAt =
              getLatestPartReleaseAt(request) ??
              (releaseStatuses.has(ticket.status)
                ? ticket.repairPaymentReceivedAt ?? ticket.updatedAt
                : undefined);

            if (!releasedAt) return null;

            return {
              ticketId: ticket.id,
              jobId: ticket.jobId,
              partId: request.partId,
              partName: partNameById.get(request.partId) ?? request.partName ?? request.partId,
              engineerName: ticket.assignedEngineer ?? "Unassigned",
              releasedAt,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      )
      .sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
  }, [backendAllPartRequests, items, partNameById, tickets]);

  const allDefectiveReturns = useMemo(() => {
    if (backendAllPartRequests.length > 0 || tickets.some((t) => !isNaN(Number(t.id)))) {
      return backendAllPartRequests
        .filter((req: any) => req.returned_at)
        .map((req: any) => {
          const ticket = tickets.find((t) => String(t.id) === String(req.job));
          const catalogItem = findCatalogItem(items, req.product_id, req.sku, req.part_name, req.name);
          const partName = req.part_name || req.name || catalogItem?.name || req.sku || `Part Request ${req.id}`;
          const reRequest = backendAllPartRequests.find((r: any) => r.re_requested_from === req.id);
          const resolvedSku = catalogItem
            ? String(catalogItem.sku ?? "").trim()
            : String(req.sku ?? "").trim();
          return {
            ticketId: String(req.job),
            jobId: ticket?.jobId || String(req.job),
            partId: String(req.id),
            partName,
            engineerName: ticket?.assignedEngineer ?? "Unassigned",
            returnedAt: req.returned_at,
            reason: req.notes || "No reason provided.",
            defectiveReturnReceivedAt: req.returned_at, // backend auto-creates re_request on return
            replacementReleasedAt: reRequest?.approved_at ?? null,
            replacementReceivedAt: reRequest?.received_at ?? null,
            sku: resolvedSku,
            reRequestId: reRequest?.id ?? null,
          };
        })
        .sort((a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime());
    }

    return tickets
      .flatMap((ticket) =>
        getTicketPartRequests(ticket)
          .filter((request) => Boolean(request.returnedDefectiveAt))
          .map((request) => ({
            ticketId: ticket.id,
            jobId: ticket.jobId,
            partId: request.partId,
            partName: partNameById.get(request.partId) ?? request.partName ?? request.partId,
            engineerName: ticket.assignedEngineer ?? "Unassigned",
            returnedAt: request.returnedDefectiveAt as string,
            reason: request.returnedDefectiveReason ?? "No reason provided.",
            defectiveReturnReceivedAt: request.defectiveReturnReceivedAt,
            replacementReleasedAt: request.replacementReleasedAt,
            replacementReceivedAt: request.replacementReceivedAt,
            sku: request.partId,
            reRequestId: null,
          }))
      )
      .sort((a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime());
  }, [backendAllPartRequests, items, partNameById, tickets]);

  const defectiveReturns = useMemo(() => {
    return allDefectiveReturns.filter((entry) => !entry.replacementReleasedAt);
  }, [allDefectiveReturns]);

  const releasedToday = useMemo(() => {
    const today = new Date().toDateString();
    return releasedParts.filter((entry) => new Date(entry.releasedAt).toDateString() === today).length;
  }, [releasedParts]);

  const lowStockItems = useMemo(() => {
    return items
      .map((item) => ({
        ...item,
        available: Math.max(0, item.quantity - item.locked),
      }))
      .filter((item) => item.available <= 3)
      .sort((a, b) => a.available - b.available || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [items]);

  const recentActivities = useMemo(() => {
    const requested = requestedParts.map((entry) => ({
      type: "requested" as const,
      at: entry.requestedAt,
      ticketId: entry.ticketId,
      jobId: entry.jobId,
      partId: entry.partId,
      partName: entry.partName,
    }));
    const released = releasedParts.map((entry) => ({
      type: "released" as const,
      at: entry.releasedAt,
      ticketId: entry.ticketId,
      jobId: entry.jobId,
      partId: entry.partId,
      partName: entry.partName,
    }));
    const defective = allDefectiveReturns.map((entry) => ({
      type: "defective" as const,
      at: entry.returnedAt,
      ticketId: entry.ticketId,
      jobId: entry.jobId,
      partId: entry.partId,
      partName: entry.partName,
    }));

    return [...requested, ...released, ...defective]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);
  }, [allDefectiveReturns, releasedParts, requestedParts]);

  const updateItem = <K extends keyof InventoryItem>(itemId: string, key: K, value: InventoryItem[K]) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)));
  };

  const handleReset = () => {
    setItems(initialItems);
    toast.success("Inventory edits reset.");
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;

    setSaving(true);
    try {
      const sanitized = sanitizeInventory(items);
      await saveInventory(sanitized);
      setItems(sanitized);
      setInitialItems(sanitized);
      toast.success("Inventory updated.");
    } catch {
      toast.error("Could not save inventory.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDefectiveReturnReceived = async (ticketId: string, partId: string) => {
    if (!canReleaseParts || releasingKey) return;

    const isBackendJob = !isNaN(Number(ticketId));
    if (isBackendJob) {
      setReleasingKey(`${ticketId}:${partId}:defective`);
      try {
        await api.post(`/jobs/${ticketId}/admin/inventory/return/`, { part_id: partId });
        toast.success("Defective return confirmed via API.");
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to confirm defective return via API.");
      } finally {
        setReleasingKey(null);
      }
      return;
    }

    if (canEdit && hasChanges) {
      toast.error("Save or reset inventory edits before confirming defective returns.");
      return;
    }

    const key = `${ticketId}:${partId}:defective`;
    setReleasingKey(key);

    try {
      const [inventoryData, ticketData] = await Promise.all([getInventory(), getTickets()]);
      const ticketIndex = ticketData.findIndex((ticket) => ticket.id === ticketId);
      if (ticketIndex === -1) {
        toast.error("Ticket not found.");
        return;
      }

      const ticket = ticketData[ticketIndex];
      const partRequests = getTicketPartRequests(ticket);
      const targetRequest = partRequests.find((request) => request.partId === partId);
      if (!targetRequest?.returnedDefectiveAt) {
        toast.error("Defective return has not been logged for this part.");
        return;
      }
      if (targetRequest.defectiveReturnReceivedAt) {
        toast.error("Defective return has already been confirmed.");
        return;
      }

      const inventoryIndex = inventoryData.findIndex((item) => item.id === partId);
      if (inventoryIndex === -1) {
        toast.error("Inventory item not found.");
        return;
      }

      const inventoryItem = inventoryData[inventoryIndex];
      inventoryData[inventoryIndex] = {
        ...inventoryItem,
        locked: Math.max(0, inventoryItem.locked - 1),
        quantity: Math.max(0, inventoryItem.quantity - 1),
      };

      const now = new Date().toISOString();
      const nextPartRequests = partRequests.map((request) =>
        request.partId === partId
          ? {
              ...request,
              defectiveReturnReceivedAt: now,
              available:
                Math.max(
                  0,
                  inventoryData[inventoryIndex].quantity - inventoryData[inventoryIndex].locked
                ) > 0,
            }
          : request
      );

      ticketData[ticketIndex] = {
        ...ticket,
        ...buildTicketPartFields(nextPartRequests),
        status: "awaiting_parts_release",
        updatedAt: now,
      };

      await Promise.all([saveInventory(inventoryData), saveTickets(ticketData)]);
      setItems(inventoryData);
      setInitialItems(inventoryData);
      setTickets(ticketData);

      const partName = getInventoryPartName(partId, inventoryData);
      toast.success(`${partName} defective return confirmed. Release a new part to the technician next.`);
    } finally {
      setReleasingKey(null);
    }
  };

  const handleReleaseRequestedPart = async (
    ticketId: string,
    partId: string,
    originalRequestId?: number | null,
    options?: {
      sku?: string;
      partName?: string;
      qty?: number;
    }
  ) => {
    if (!canReleaseParts || releasingKey) return;

    const isBackendJob = !isNaN(Number(ticketId));
    if (isBackendJob) {
      setReleasingKey(`${ticketId}:${partId}`);
      try {
        const catalogItem = findCatalogItem(items, partId, options?.sku, options?.partName);
        const requestSku = catalogItem
          ? String(catalogItem.sku ?? "").trim()
          : String(options?.sku ?? "").trim();
        const requestName = options?.partName || catalogItem?.name || options?.sku || partId;
        const requestQty = Math.max(1, Number(options?.qty || 1));
        if (!requestSku) {
          toast.error(`Cannot release ${requestName}: this catalog item has no SKU in Odoo, so the inventory API cannot reserve or allocate it by SKU.`);
          return;
        }

        // 1. Approve request (if we have originalRequestId)
        if (originalRequestId) {
           await api.post(`/jobs/${ticketId}/admin/inventory/parts/approve/`, {
               approvals: [{ id: originalRequestId }],
               notes: "Approved and allocated"
           });
        }

        // 2. Reserve
        await api.post(`/jobs/${ticketId}/admin/inventory/reserve/`, {
            parts: [{ sku: requestSku, qty: requestQty, name: requestName }]
        });

        // 3. Allocate
        await api.post(`/jobs/${ticketId}/admin/inventory/allocate/`, {
            parts: [{ sku: requestSku, qty: requestQty, name: requestName }]
        });

        toast.success("Part allocated and approved via API.");
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to release part via API.");
      } finally {
        setReleasingKey(null);
      }
      return;
    }

    if (canEdit && hasChanges) {
      toast.error("Save or reset inventory edits before releasing parts.");
      return;
    }

    const key = `${ticketId}:${partId}`;
    setReleasingKey(key);

    try {
      const [inventoryData, ticketData] = await Promise.all([getInventory(), getTickets()]);
      const ticketIndex = ticketData.findIndex((ticket) => ticket.id === ticketId);
      if (ticketIndex === -1) {
        toast.error("Ticket not found.");
        return;
      }

      const ticket = ticketData[ticketIndex];
      if (!isWarrantyServiceTicket(ticket) && !ticket.repairPaymentReceivedAt) {
        toast.error("Repair payment must be confirmed before parts can be released.");
        return;
      }

      const partRequests = getTicketPartRequests(ticket);
      const targetRequest = partRequests.find((request) => request.partId === partId);
      if (!targetRequest) {
        toast.error("Part request not found.");
        return;
      }
      const isReplacementRelease = Boolean(targetRequest.returnedDefectiveAt);
      if (isReplacementRelease && !targetRequest.defectiveReturnReceivedAt) {
        toast.error("Confirm the defective part has been received before releasing a replacement.");
        return;
      }
      if (
        (!isReplacementRelease && targetRequest.releasedAt) ||
        (isReplacementRelease && targetRequest.replacementReleasedAt)
      ) {
        toast.error(
          isReplacementRelease
            ? "Replacement part has already been released."
            : "This part has already been released."
        );
        return;
      }

      const inventoryIndex = inventoryData.findIndex((item) => item.id === partId);
      if (inventoryIndex === -1) {
        toast.error("Inventory item not found.");
        return;
      }

      const inventoryItem = inventoryData[inventoryIndex];
      const availableUnits = Math.max(0, inventoryItem.quantity - inventoryItem.locked);
      if (availableUnits <= 0) {
        toast.error("This part is currently out of stock.");
        return;
      }

      inventoryData[inventoryIndex] = {
        ...inventoryItem,
        locked: inventoryItem.locked + 1,
      };

      const now = new Date().toISOString();
      const nextPartRequests = partRequests.map((request) =>
        request.partId === partId
          ? {
              ...request,
              available: true,
              ...(isReplacementRelease
                ? { replacementReleasedAt: now }
                : {
                    releasedAt: now,
                    receivedAt: undefined,
                  }),
            }
          : request
      );

      const allPartsReleased = nextPartRequests.every(
        (request) => isPartReadyForRepair(request) || isAwaitingTechnicianPartConfirmation(request)
      );

      ticketData[ticketIndex] = {
        ...ticket,
        ...buildTicketPartFields(nextPartRequests),
        status: allPartsReleased ? "ready_for_repair" : "awaiting_parts_release",
        updatedAt: now,
      };

      await Promise.all([saveInventory(inventoryData), saveTickets(ticketData)]);
      setItems(inventoryData);
      setInitialItems(inventoryData);
      setTickets(ticketData);

      const partName = getInventoryPartName(partId, inventoryData);
      toast.success(
        allPartsReleased
          ? isReplacementRelease
            ? `${partName} replacement released. Waiting for technician to confirm receipt.`
            : `${partName} released. Waiting for technician to confirm receipt.`
          : isReplacementRelease
          ? `${partName} replacement released. ${ticket.jobId} is still waiting on other parts.`
          : `${partName} released. ${ticket.jobId} is still waiting on other parts.`
      );
    } finally {
      setReleasingKey(null);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading inventory...</div>;
  }

  if (isTechnicianView) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Parts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and view available parts.
          </p>
        </div>

        <div className="glass-card p-4">
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search parts..."
          />
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-6 py-4">Part Name</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Available</th>
                  <th className="px-6 py-4 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => {
                  const available = Math.max(0, item.quantity - item.locked);
                  return (
                    <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{item.category}</td>
                      <td className="px-6 py-4 text-right text-sm text-foreground">{available}</td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-foreground">
                        ₦{item.price.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="px-6 py-6 text-sm text-muted-foreground">No parts match your search.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} parts in stock</p>
          {!canEdit && (
            <p className="text-xs text-muted-foreground mt-1">
              View-only mode. Only admin can edit inventory inputs.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search parts..."
            className="w-full sm:w-72"
          />
          {canEdit && (
            <>
              <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saving}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Requests</p>
          <p className="text-2xl font-bold text-foreground mt-1">{requestedParts.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Released Today</p>
          <p className="text-2xl font-bold text-foreground mt-1">{releasedToday}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Defective Returns</p>
          <p className="text-2xl font-bold text-foreground mt-1">{defectiveReturns.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Low Stock Parts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stockSummary.lowStockParts}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Available Units</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stockSummary.availableUnits}</p>
        </div>
        <div className="glass-card min-w-0 overflow-hidden p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Inventory Value</p>
          <p
            className="mt-1 max-w-full truncate text-xl font-bold leading-tight text-foreground sm:text-2xl"
            title={inventoryValueLabel.full}
          >
            {inventoryValueLabel.compact}
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Low Stock Alerts</h3>
            <span className="text-xs text-muted-foreground">{stockSummary.outOfStockParts} out of stock</span>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No low stock alerts.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {lowStockItems.map((item) => (
                <div key={`low-stock-${item.id}`} className="rounded-md border border-border bg-secondary/30 p-4">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {item.available}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent Parts Activity</h3>
            <span className="text-xs text-muted-foreground">{recentActivities.length} items</span>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity yet.</p>
          ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recentActivities.map((activity) => (
                <div key={`${activity.type}-${activity.ticketId}-${activity.partId}-${activity.at}`} className="rounded-md border border-border bg-secondary/30 p-4 space-y-1">
                  <p className="text-sm font-medium text-foreground">{activity.partName}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.type === "requested"
                      ? "Requested"
                      : activity.type === "released"
                      ? "Released"
                      : "Returned Defective"}{" "}
                    | Job: {activity.jobId}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(activity.at).toLocaleString()}</p>
                  <Link to={`/ticket/${activity.ticketId}`} className="text-xs text-primary hover:underline">
                    Open Ticket
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-6 py-4">Part Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4 text-right">Quantity</th>
                <th className="px-6 py-4 text-right">Available</th>
                <th className="px-6 py-4 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const available = item.quantity - item.locked;
                return (
                  <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                        {canEdit ? (
                          <Input
                            value={item.name}
                            onChange={(event) => updateItem(item.id, "name", event.target.value)}
                            className="h-10 bg-secondary border-border min-w-[220px]"
                          />
                        ) : (
                          <span className="font-medium text-foreground text-sm">{item.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {canEdit ? (
                        <Input
                          value={item.category}
                          onChange={(event) => updateItem(item.id, "category", event.target.value)}
                          className="h-10 bg-secondary border-border min-w-[140px]"
                        />
                      ) : (
                        item.category
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(item.id, "quantity", Math.max(0, Number(event.target.value) || 0))
                          }
                          className="h-10 bg-secondary border-border text-right min-w-[90px]"
                        />
                      ) : (
                        <span className="text-foreground">{item.quantity}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-semibold text-sm ${
                          available > 3 ? "text-success" : available > 0 ? "text-warning" : "text-destructive"
                        }`}
                      >
                        {available}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-foreground">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={0}
                          value={item.price}
                          onChange={(event) =>
                            updateItem(item.id, "price", Math.max(0, Number(event.target.value) || 0))
                          }
                          className="h-10 bg-secondary border-border text-right min-w-[120px]"
                        />
                      ) : (
                        `₦${item.price.toLocaleString()}`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Inventory Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track requested parts, defective returns, and parts released to engineers.
          </p>
          {debugError && (
              <div className="mt-2 p-4 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
                  Debug API Warning: {debugError}
              </div>
          )}
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Repair Parts Requested</h3>
              <span className="text-xs text-muted-foreground">{requestedParts.length}</span>
            </div>
            {requestedParts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending part requests.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {requestedParts.map((entry) => (
                  <div key={`${entry.ticketId}-${entry.partId}-requested`} className="rounded-md border border-border bg-secondary/30 p-4 space-y-1">
                    <p className="text-sm font-medium text-foreground">{entry.partName}</p>
                    <p className="text-xs text-muted-foreground">Job: {entry.jobId}</p>
                    <p className="text-xs text-muted-foreground">Customer: {entry.customerName}</p>
                    <p className="text-xs text-muted-foreground">Status: {STATUS_LABELS[entry.status]}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(entry.requestedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Payment: {entry.isWarranty ? "Not required for warranty" : entry.paymentReceivedAt ? "Confirmed" : "Waiting for front desk"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Available units: {entry.availableUnits}
                    </p>
                    {entry.availableUnits === 0 && !entry.hasCatalogMatch && (
                      <p className="text-xs text-warning">
                        Custom request from technician. Add this part to inventory before release.
                      </p>
                    )}
                    {entry.missingCatalogSku && (
                      <p className="text-xs text-warning">
                        This part exists in the catalog but has no SKU. Release is blocked until the Odoo item has a real SKU or the backend accepts another identifier.
                      </p>
                    )}
                    {!entry.canRelease && (
                      <p className="text-xs text-muted-foreground">
                        Waiting for the repair workflow to reach a releaseable payment-approved state.
                      </p>
                    )}
                    {canReleaseParts && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void handleReleaseRequestedPart(entry.ticketId, entry.partId, entry.originalRequestId, {
                            sku: entry.sku,
                            partName: entry.partName,
                            qty: entry.requestedQty,
                          })
                        }
                        disabled={
                          releasingKey === `${entry.ticketId}:${entry.partId}` ||
                          !entry.canRelease ||
                          entry.missingCatalogSku ||
                          entry.availableUnits <= 0
                        }
                      >
                        {releasingKey === `${entry.ticketId}:${entry.partId}` ? "Releasing..." : "Release To Technician"}
                      </Button>
                    )}
                    <Link to={`/ticket/${entry.ticketId}`} className="text-xs text-primary hover:underline">
                      Open Ticket
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Parts Released To Engineers</h3>
              <span className="text-xs text-muted-foreground">{releasedParts.length}</span>
            </div>
            {releasedParts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No released parts yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {releasedParts.map((entry) => (
                  <div key={`${entry.ticketId}-${entry.partId}-released`} className="rounded-md border border-border bg-secondary/30 p-4 space-y-1">
                    <p className="text-sm font-medium text-foreground">{entry.partName}</p>
                    <p className="text-xs text-muted-foreground">Job: {entry.jobId}</p>
                    <p className="text-xs text-muted-foreground">Engineer: {entry.engineerName}</p>
                    <p className="text-xs text-muted-foreground">
                      Released: {new Date(entry.releasedAt).toLocaleString()}
                    </p>
                    <Link to={`/ticket/${entry.ticketId}`} className="text-xs text-primary hover:underline">
                      Open Ticket
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Defective Part Returns</h3>
              <span className="text-xs text-muted-foreground">{defectiveReturns.length}</span>
            </div>
            {defectiveReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No defective returns logged.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {defectiveReturns.map((entry) => (
                  <div key={`${entry.ticketId}-${entry.partId}-defective`} className="rounded-md border border-destructive/30 bg-destructive/10 p-4 space-y-1">
                    <p className="text-sm font-medium text-foreground">{entry.partName}</p>
                    <p className="text-xs text-muted-foreground">Job: {entry.jobId}</p>
                    <p className="text-xs text-muted-foreground">Engineer: {entry.engineerName}</p>
                    <p className="text-xs text-muted-foreground">
                      Returned: {new Date(entry.returnedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Reason: {entry.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.defectiveReturnReceivedAt
                        ? `Inventory confirmed receipt ${new Date(entry.defectiveReturnReceivedAt).toLocaleString()}`
                        : "Waiting for inventory confirmation"}
                    </p>
                    {entry.replacementReleasedAt && (
                      <p className="text-xs text-muted-foreground">
                        Replacement released {new Date(entry.replacementReleasedAt).toLocaleString()}
                      </p>
                    )}
                    {entry.replacementReceivedAt && (
                      <p className="text-xs text-muted-foreground">
                        Technician confirmed receipt {new Date(entry.replacementReceivedAt).toLocaleString()}
                      </p>
                    )}
                    {canReleaseParts && !entry.defectiveReturnReceivedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleConfirmDefectiveReturnReceived(entry.ticketId, entry.partId)}
                        disabled={releasingKey === `${entry.ticketId}:${entry.partId}:defective`}
                      >
                        {releasingKey === `${entry.ticketId}:${entry.partId}:defective`
                          ? "Confirming..."
                          : "Confirm Defective Part Received"}
                      </Button>
                    )}
                    {canReleaseParts &&
                      entry.defectiveReturnReceivedAt &&
                      !entry.replacementReleasedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void handleReleaseRequestedPart(entry.ticketId, entry.partId, entry.reRequestId, {
                              sku: entry.sku,
                              partName: entry.partName,
                              qty: 1,
                            })
                          }
                          disabled={releasingKey === `${entry.ticketId}:${entry.partId}`}
                        >
                          {releasingKey === `${entry.ticketId}:${entry.partId}`
                            ? "Releasing..."
                            : "Release New Part"}
                        </Button>
                      )}
                    {entry.replacementReleasedAt && !entry.replacementReceivedAt && (
                      <p className="text-xs text-muted-foreground">
                        Waiting for technician to confirm the new part has been received.
                      </p>
                    )}
                    <Link to={`/ticket/${entry.ticketId}`} className="text-xs text-primary hover:underline">
                      Open Ticket
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
