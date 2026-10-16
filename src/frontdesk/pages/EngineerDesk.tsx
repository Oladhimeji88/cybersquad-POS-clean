import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  DEVICE_TYPE_LABELS,
  getAuth,
  getInventory,
  getTickets,
  InventoryItem,
  NO_PARTS_REQUIRED_REPAIR_FEE,
  PartSourcingStatus,
  saveTickets,
  SERVICE_OPTION_KEYS,
  SERVICE_OPTION_LABELS,
  SERVICE_OPTION_PRICE,
  type ServiceOptionKey,
  Ticket,
  User,
  mapBackendTicketToFrontend,
} from "@/frontdesk/lib/store";
import { useApi } from "@/hooks/useApi";
import {
  buildTicketPartFields,
  fetchPartsCatalog,
  getInventoryAvailableUnits,
  getInventoryPartName,
  getTicketPartIds,
  getTicketPartRequests,
  isAwaitingDefectiveReturnReceipt,
  isAwaitingReplacementRelease,
  isAwaitingTechnicianPartConfirmation,
  isPartReadyForRepair,
  uniquePartIds,
} from "@/frontdesk/lib/parts";
import { sendClientTicketUpdateEmail } from "@/frontdesk/lib/clientUpdateEmail";
import { buildAssessmentPayload, fetchDiagnosisServiceOptions } from "@/frontdesk/lib/diagnosis";
import SearchField from "@/frontdesk/components/SearchField";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import ImageLightbox from "@/frontdesk/components/ImageLightbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";

type SourcingDecision = "" | PartSourcingStatus;

function isWarrantyServiceTicket(ticket: Ticket) {
  return ticket.intakeType === "repeat_return" || ticket.intakeType === "warranty";
}

function isNoPartsRequiredDiagnosis(ticket: Ticket) {
  return (
    !isWarrantyServiceTicket(ticket) &&
    getTicketPartIds(ticket).length === 0 &&
    ((ticket.serviceSelections?.length ?? 0) > 0 || ticket.quotation === NO_PARTS_REQUIRED_REPAIR_FEE)
  );
}

export default function EngineerDesk() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ticketSearch, setTicketSearch] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [diagnosisDrafts, setDiagnosisDrafts] = useState<Record<string, string>>({});
  const [noPartsRequiredDrafts, setNoPartsRequiredDrafts] = useState<Record<string, boolean>>({});
  const [selectedServiceDrafts, setSelectedServiceDrafts] = useState<Record<string, ServiceOptionKey[]>>({});
  const [selectedPartDrafts, setSelectedPartDrafts] = useState<Record<string, string[]>>({});
  const [customPartDrafts, setCustomPartDrafts] = useState<Record<string, string>>({});
  const [sourcingDecisionDrafts, setSourcingDecisionDrafts] = useState<Record<string, SourcingDecision>>({});
  const [warrantyVoidReasonDrafts, setWarrantyVoidReasonDrafts] = useState<Record<string, string>>({});
  const [updateDrafts, setUpdateDrafts] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Backend jobs bill a no-parts diagnosis to a catalog service, not the local service items.
  const [backendServiceOptions, setBackendServiceOptions] = useState<any[]>([]);
  const [catalogServiceDrafts, setCatalogServiceDrafts] = useState<Record<string, string>>({});

  const { api } = useApi();

  // Engineer desk on web is scoped to in-store workflows (walk_in + corporate,
  // which also covers warranty/repeat-case since those ride on source_channel=walk_in).
  // self_service jobs follow a different state machine (offers, SLA, free-form
  // diagnosis, no parts/QA) and are handled in the mobile technician app.
  const fetchBackendTickets = async (): Promise<Ticket[]> => {
    const [activeJobsRes, completedJobsRes] = await Promise.all([
      api.get('/jobs/technician/bookings/?page_size=1000&source_channel=walk_in,corporate'),
      api.get('/jobs/technician/bookings/?status=delivered,closed&page_size=1000&source_channel=walk_in,corporate'),
    ]);
    let active = [];
    let done = [];
    if (activeJobsRes?.data?.success && Array.isArray(activeJobsRes.data.result)) {
      active = activeJobsRes.data.result;
    }
    if (completedJobsRes?.data?.success && Array.isArray(completedJobsRes.data.result)) {
      done = completedJobsRes.data.result;
    }
    const combinedMap = new Map();
    [...active, ...done].forEach(j => combinedMap.set(j.id, j));
    return Array.from(combinedMap.values()).map(mapBackendTicketToFrontend);
  };

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [authUser, ticketData, inventoryData] = await Promise.all([
          getAuth(),
          getTickets(),
          getInventory(),
        ]);
        if (!mounted) return;

        setUser(authUser);

        // Fetch inventory from Odoo parts catalog API
        let backendInventory: InventoryItem[] = [];
        try {
          backendInventory = await fetchPartsCatalog(api);
        } catch (err) {
          console.error("Failed to fetch parts catalog:", err);
        }
        setInventory(backendInventory.length > 0 ? backendInventory : inventoryData);

        try {
          const serviceOptions = await fetchDiagnosisServiceOptions(api);
          if (serviceOptions) setBackendServiceOptions(serviceOptions);
        } catch (err) {
          console.error("Failed to fetch service catalog:", err);
        }

        let backendTickets: Ticket[] = [];
        try {
          backendTickets = await fetchBackendTickets();
        } catch (err) {
          console.error("Failed to fetch technician bookings:", err);
        }

        // Use backend-only when API returned data; fall back to local storage only if API failed
        const finalTickets = backendTickets.length > 0 ? backendTickets : ticketData;

        setTickets(finalTickets);

        const initialDiagnosisDrafts: Record<string, string> = {};
        const initialNoPartsRequiredDrafts: Record<string, boolean> = {};
        const initialSelectedServiceDrafts: Record<string, ServiceOptionKey[]> = {};
        const initialSelectedPartDrafts: Record<string, string[]> = {};
        const initialSourcingDecisionDrafts: Record<string, SourcingDecision> = {};
        const initialWarrantyVoidReasonDrafts: Record<string, string> = {};
        const initialCustomPartDrafts: Record<string, string> = {};
        const initialDrafts: Record<string, string> = {};
        finalTickets.forEach((ticket) => {
          initialDiagnosisDrafts[ticket.id] = ticket.diagnosis ?? "";
          initialNoPartsRequiredDrafts[ticket.id] = isNoPartsRequiredDiagnosis(ticket);
          initialSelectedServiceDrafts[ticket.id] = ticket.serviceSelections ?? [];
          initialSelectedPartDrafts[ticket.id] = getTicketPartIds(ticket);
          initialSourcingDecisionDrafts[ticket.id] = ticket.partSourcingStatus ?? "";
          initialWarrantyVoidReasonDrafts[ticket.id] = ticket.warrantyVoidReason ?? "";
          initialCustomPartDrafts[ticket.id] = "";
          initialDrafts[ticket.id] = ticket.engineerUpdate ?? "";
        });
        setDiagnosisDrafts(initialDiagnosisDrafts);
        setNoPartsRequiredDrafts(initialNoPartsRequiredDrafts);
        setSelectedServiceDrafts(initialSelectedServiceDrafts);
        setSelectedPartDrafts(initialSelectedPartDrafts);
        setCustomPartDrafts(initialCustomPartDrafts);
        setSourcingDecisionDrafts(initialSourcingDecisionDrafts);
        setWarrantyVoidReasonDrafts(initialWarrantyVoidReasonDrafts);
        setUpdateDrafts(initialDrafts);
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

  const availableTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    if (!query) {
      return tickets;
    }

    return tickets.filter((ticket) =>
      [
        ticket.jobId,
        ticket.customer.name,
        ticket.customer.phone,
        ticket.device.make,
        ticket.device.model,
        ticket.device.imei,
        ticket.issueReported ?? "",
        ticket.engineerUpdate ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [ticketSearch, tickets]);

  const myCompletedJobs = useMemo(() => {
    return tickets.filter((ticket) =>
      ["delivered", "closed"].includes(ticket.status)
    );
  }, [tickets]);

  const diagnosingCount = useMemo(
    () =>
      availableTickets.filter((ticket) =>
        ["warranty_review", "warranty_validation_pending", "warranty_validated", "diagnosing"].includes(ticket.status)
      ).length,
    [availableTickets]
  );

  const repairingCount = useMemo(
    () => availableTickets.filter((ticket) => ["repairing", "repair_in_progress", "repaired"].includes(ticket.status)).length,
    [availableTickets]
  );

  const readyToStartCount = useMemo(
    () => availableTickets.filter((ticket) => ticket.status === "ready_for_repair").length,
    [availableTickets]
  );

  const filteredInventory = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    if (!query) return inventory;

    return inventory.filter((item) =>
      [item.name, item.category].join(" ").toLowerCase().includes(query)
    );
  }, [inventory, inventorySearch]);

  useEffect(() => {
    if (location.pathname === "/engineer/qa-reviews") {
      document.getElementById("qa-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (location.pathname === "/engineer/done-jobs") {
      document.getElementById("done-jobs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.pathname]);

  const inventoryById = useMemo(
    () => new Map(inventory.map((item) => [item.id, item])),
    [inventory]
  );

  const getRepairCostFromSelectedParts = (partIds: string[], noPartsRequired = false) =>
    noPartsRequired
      ? NO_PARTS_REQUIRED_REPAIR_FEE
      : uniquePartIds(partIds).reduce((sum, partId) => {
      const item = inventoryById.get(partId);
      return sum + (item?.price ?? 0);
    }, 0);

  const getRepairCostFromSelectedServices = (serviceKeys: ServiceOptionKey[]) =>
    serviceKeys.length * SERVICE_OPTION_PRICE;

  const persistTicketUpdate = async (
    ticketId: string,
    updates: Partial<Ticket>,
    successMessage: string,
    options?: {
      clientUpdateTitle?: string;
      clientUpdateDetails?: string[];
    }
  ) => {
    const allTickets = await getTickets();
    const index = allTickets.findIndex((ticket) => ticket.id === ticketId);
    if (index === -1) return;

    allTickets[index] = {
      ...allTickets[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const updatedTicket = allTickets[index];

    await saveTickets(allTickets);
    setTickets(allTickets);

    sendClientTicketUpdateEmail(updatedTicket, {
      updateTitle: options?.clientUpdateTitle ?? successMessage,
      updatedBy: user?.name,
      details:
        options?.clientUpdateDetails ??
        [
          updatedTicket.diagnosis ? `Diagnosis: ${updatedTicket.diagnosis}` : "",
          typeof updatedTicket.quotation === "number"
            ? `Estimated repair cost: NGN ${updatedTicket.quotation.toLocaleString()}`
            : "",
          updatedTicket.engineerUpdate ? `Technician note: ${updatedTicket.engineerUpdate}` : "",
        ],
    });

    toast.success(successMessage);
  };

  const toggleSelectedPartDraft = (ticketId: string, partId: string, checked: boolean) => {
    if (checked) {
      setNoPartsRequiredDrafts((prev) => ({
        ...prev,
        [ticketId]: false,
      }));
      setSelectedServiceDrafts((prev) => ({
        ...prev,
        [ticketId]: [],
      }));
    }

    setSelectedPartDrafts((prev) => {
      const current = prev[ticketId] ?? [];
      return {
        ...prev,
        [ticketId]: checked
          ? uniquePartIds([...current, partId])
          : current.filter((entry) => entry !== partId),
      };
    });
  };

  const setNoPartsRequiredDraft = (ticketId: string, checked: boolean) => {
    setNoPartsRequiredDrafts((prev) => ({
      ...prev,
      [ticketId]: checked,
    }));

    if (checked) {
      setSelectedPartDrafts((prev) => ({
        ...prev,
        [ticketId]: [],
      }));
      setSelectedServiceDrafts((prev) => ({
        ...prev,
        [ticketId]: prev[ticketId] ?? [],
      }));
      setSourcingDecisionDrafts((prev) => ({
        ...prev,
        [ticketId]: "",
      }));
    } else {
      setSelectedServiceDrafts((prev) => ({
        ...prev,
        [ticketId]: [],
      }));
    }
  };

  const toggleSelectedServiceDraft = (ticketId: string, serviceKey: ServiceOptionKey, checked: boolean) => {
    if (checked) {
      setNoPartsRequiredDrafts((prev) => ({
        ...prev,
        [ticketId]: true,
      }));
      setSelectedPartDrafts((prev) => ({
        ...prev,
        [ticketId]: [],
      }));
      setSourcingDecisionDrafts((prev) => ({
        ...prev,
        [ticketId]: "",
      }));
    }

    setSelectedServiceDrafts((prev) => {
      const current = prev[ticketId] ?? [];
      return {
        ...prev,
        [ticketId]: checked
          ? Array.from(new Set([...current, serviceKey]))
          : current.filter((entry) => entry !== serviceKey),
      };
    });
  };

  const handleSubmitDiagnosis = async (ticket: Ticket) => {
    const diagnosis = (diagnosisDrafts[ticket.id] ?? "").trim();
    const isWarrantyTicket = isWarrantyServiceTicket(ticket);
    const noPartsRequired = Boolean(noPartsRequiredDrafts[ticket.id]);
    const engineerUpdate = (updateDrafts[ticket.id] ?? "").trim();
    const selectedServices = selectedServiceDrafts[ticket.id] ?? [];
    const selectedPartIds = uniquePartIds(selectedPartDrafts[ticket.id] ?? []);
    const repairCost = noPartsRequired
      ? getRepairCostFromSelectedServices(selectedServices)
      : getRepairCostFromSelectedParts(selectedPartIds, noPartsRequired);
    const existingPartRequests = getTicketPartRequests(ticket);

    if (!diagnosis) {
      toast.error("Enter diagnosis details before submitting.");
      return;
    }
    if (!isWarrantyTicket && selectedPartIds.length === 0 && !noPartsRequired) {
      toast.error("Select required parts or mark this repair as no parts required.");
      return;
    }

    // Backend jobs: the assessment carries the parts, which inventory is asked
    // for only after payment, so there is nothing to request first.
    if (!isNaN(Number(ticket.id))) {
      const serviceId = catalogServiceDrafts[ticket.id] ?? "";
      if (noPartsRequired && !serviceId) {
        toast.error("Select a service when no parts are required.");
        return;
      }
      try {
        await api.post(
          `/jobs/${ticket.id}/assessment/`,
          buildAssessmentPayload({ diagnosis, noPartsRequired, serviceId, partIds: selectedPartIds, inventory })
        );
      } catch (err: any) {
        console.error("Assessment error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to submit assessment via API.");
        return;
      }
      toast.success(isWarrantyTicket ? `${ticket.jobId} warranty diagnosis saved.` : `${ticket.jobId} assessment submitted.`);
      try {
        setTickets(await fetchBackendTickets());
      } catch (err) {
        console.error("Failed to refresh technician bookings:", err);
      }
      return;
    }

    if (!isWarrantyTicket && noPartsRequired && selectedServices.length === 0) {
      toast.error("Select at least one service item when no parts are required.");
      return;
    }
    const missingRequestedParts = selectedPartIds.filter(
      (partId) => !existingPartRequests.some((request) => request.partId === partId && request.requestedAt)
    );
    if (missingRequestedParts.length > 0) {
      toast.error("Request every selected part from inventory manager before submitting diagnosis.");
      return;
    }

    const nextPartRequests = selectedPartIds.map((partId) => {
      const existingRequest = existingPartRequests.find((request) => request.partId === partId);
      return (
        existingRequest ?? {
          partId,
          available: getInventoryAvailableUnits(partId, inventory) > 0,
        }
      );
    });
    const requestedPartNames = nextPartRequests.map((request) =>
      getInventoryPartName(request.partId, inventory, request.partName)
    );
    const unavailablePartNames = nextPartRequests
      .filter((request) => request.available === false)
      .map((request) => getInventoryPartName(request.partId, inventory, request.partName));
    const sourcingDecision = sourcingDecisionDrafts[ticket.id] ?? "";
    if (!isWarrantyTicket && unavailablePartNames.length > 0 && sourcingDecision !== "sourceable") {
      toast.error("Confirm with inventory manager whether the unavailable parts can be sourced within a few days.");
      return;
    }
    const sourcingCheckedAt =
      unavailablePartNames.length > 0 && !isWarrantyTicket ? new Date().toISOString() : undefined;
    const nextStatus =
      isWarrantyTicket
        ? nextPartRequests.length > 0
          ? "awaiting_parts_release"
          : "ready_for_repair"
        : "awaiting_repair_payment";

    await persistTicketUpdate(
      ticket.id,
      {
        status: nextStatus,
        diagnosis,
        quotation: isWarrantyTicket ? undefined : repairCost,
        serviceSelections: !isWarrantyTicket && noPartsRequired ? selectedServices : undefined,
        ...buildTicketPartFields(nextPartRequests),
        partSourcingStatus:
          unavailablePartNames.length > 0 && !isWarrantyTicket ? "sourceable" : undefined,
        partSourcingCheckedAt: sourcingCheckedAt,
        cancellationReason: undefined,
        engineerUpdate: engineerUpdate || ticket.engineerUpdate,
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      isWarrantyTicket
        ? unavailablePartNames.length > 0
          ? `${ticket.jobId} warranty diagnosis saved. Customer update prepared for part sourcing.`
          : nextStatus === "awaiting_parts_release"
          ? `${ticket.jobId} warranty diagnosis saved. Waiting for inventory to release parts.`
          : `${ticket.jobId} warranty diagnosis saved. Repair can start when you are ready.`
        : `${ticket.jobId} quotation emailed to customer and sent to front desk.`,
      {
        clientUpdateTitle: isWarrantyTicket
          ? unavailablePartNames.length > 0
            ? "Warranty part sourcing update"
            : "Warranty repair update"
          : "Repair quotation ready",
        clientUpdateDetails: [
          `Diagnosis: ${diagnosis}`,
          !isWarrantyTicket ? `Estimated repair cost: NGN ${repairCost.toLocaleString()}` : "",
          noPartsRequired && selectedServices.length > 0
            ? `Service items: ${selectedServices.map((service) => SERVICE_OPTION_LABELS[service]).join(", ")}`
            : "",
          requestedPartNames.length > 0 ? `Required parts: ${requestedPartNames.join(", ")}` : "",
          unavailablePartNames.length > 0
            ? isWarrantyTicket
              ? `Required warranty part${unavailablePartNames.length === 1 ? "" : "s"}: ${unavailablePartNames.join(", ")}`
              : `Parts pending stock: ${unavailablePartNames.join(", ")}`
            : "",
          isWarrantyTicket
            ? unavailablePartNames.length > 0
              ? "The required part will be ready in 5 business days."
              : nextStatus === "awaiting_parts_release"
              ? "Inventory manager will release the required warranty part(s) without customer payment."
              : "No customer payment is required for this warranty repair."
            : "Front desk will confirm payment after it is received.",
          engineerUpdate ? `Technician note: ${engineerUpdate}` : "",
        ].filter(Boolean),
      }
    );
  };

  const handleWarrantyValid = async (ticket: Ticket) => {
    await persistTicketUpdate(
      ticket.id,
      {
        status: "diagnosing",
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      `${ticket.jobId} approved for warranty repair.`,
      {
        clientUpdateTitle: "Warranty approved for repair",
        clientUpdateDetails: ["No customer payment is required for this warranty repair."],
      }
    );
  };

  const handleWarrantyVoid = async (ticket: Ticket) => {
    const reason = (warrantyVoidReasonDrafts[ticket.id] ?? "").trim();
    if (!reason) {
      toast.error("Add a reason before voiding this warranty.");
      return;
    }

    await persistTicketUpdate(
      ticket.id,
      {
        status: "warranty_void",
        warrantyVoidReason: reason,
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      `${ticket.jobId} warranty voided.`,
      {
        clientUpdateTitle: "Warranty voided",
        clientUpdateDetails: [reason, "A new repair ticket must be created if the customer wants a paid repair."],
      }
    );
  };

  const handleRequestPartFromInventoryManager = async (ticket: Ticket) => {
    const selectedPartIds = uniquePartIds(selectedPartDrafts[ticket.id] ?? []);
    if (selectedPartIds.length === 0) {
      toast.error("Select at least one part before sending request.");
      return;
    }

    // For backend jobs, use the inventory parts API
    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        const partNames = selectedPartIds.map((partId) => inventoryById.get(partId)?.name ?? partId);
        await api.post(`/jobs/${ticket.id}/admin/inventory/parts/`, {
          notes: `Parts requested: ${partNames.join(", ")}`,
        });
        toast.success(`${ticket.jobId} part request sent via API.`);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to request parts via API.");
      }
      return;
    }

    const allTickets = await getTickets();
    const index = allTickets.findIndex((entry) => entry.id === ticket.id);
    if (index === -1) return;

    const existingPartRequests = getTicketPartRequests(allTickets[index]);
    const newPartIds = selectedPartIds.filter(
      (partId) => !existingPartRequests.some((request) => request.partId === partId && request.requestedAt)
    );
    if (newPartIds.length === 0) {
      toast.error("Selected parts have already been requested.");
      return;
    }

    const now = new Date().toISOString();
    const nextPartRequests = selectedPartIds.map((partId) => {
      const existingRequest = existingPartRequests.find((request) => request.partId === partId);
      const available = getInventoryAvailableUnits(partId, inventory) > 0;

      if (existingRequest?.requestedAt) {
        return {
          ...existingRequest,
          available,
        };
      }

      return {
        ...existingRequest,
        partId,
        available,
        requestedAt: now,
      };
    });

    allTickets[index] = {
      ...allTickets[index],
      ...buildTicketPartFields(nextPartRequests),
      partSourcingStatus: undefined,
      partSourcingCheckedAt: undefined,
      cancellationReason: undefined,
      updatedAt: now,
      assignedEngineer: user?.name ?? allTickets[index].assignedEngineer,
    };

    await saveTickets(allTickets);
    setTickets(allTickets);
    setSelectedPartDrafts((prev) => ({
      ...prev,
      [ticket.id]: nextPartRequests.map((request) => request.partId),
    }));
    setSourcingDecisionDrafts((prev) => ({
      ...prev,
      [ticket.id]: "",
    }));
    toast.success(
      `${ticket.jobId} ${newPartIds.length} part request${newPartIds.length === 1 ? "" : "s"} sent to inventory manager.`
    );
  };

  const handleRequestCustomPartFromInventoryManager = async (ticket: Ticket) => {
    const customPartName = (customPartDrafts[ticket.id] ?? "").trim();
    if (!customPartName) {
      toast.error("Enter the missing part name before sending request.");
      return;
    }

    const allTickets = await getTickets();
    const index = allTickets.findIndex((entry) => entry.id === ticket.id);
    if (index === -1) return;

    const existingPartRequests = getTicketPartRequests(allTickets[index]);
    const alreadyRequested = existingPartRequests.some(
      (request) =>
        Boolean(request.requestedAt) &&
        (request.partName ?? getInventoryPartName(request.partId, inventory, request.partName))
          .trim()
          .toLowerCase() === customPartName.toLowerCase()
    );
    if (alreadyRequested) {
      toast.error("This part has already been requested for this job.");
      return;
    }

    const now = new Date().toISOString();
    const customPartId = `custom_${ticket.id}_${now}`;
    const nextPartRequests = [
      ...existingPartRequests,
      {
        partId: customPartId,
        partName: customPartName,
        available: false,
        requestedAt: now,
      },
    ];

    allTickets[index] = {
      ...allTickets[index],
      ...buildTicketPartFields(nextPartRequests),
      partSourcingStatus: undefined,
      partSourcingCheckedAt: undefined,
      cancellationReason: undefined,
      updatedAt: now,
      assignedEngineer: user?.name ?? allTickets[index].assignedEngineer,
    };

    await saveTickets(allTickets);
    setTickets(allTickets);
    setSelectedPartDrafts((prev) => ({
      ...prev,
      [ticket.id]: uniquePartIds([...(prev[ticket.id] ?? []), customPartId]),
    }));
    setNoPartsRequiredDrafts((prev) => ({
      ...prev,
      [ticket.id]: false,
    }));
    setCustomPartDrafts((prev) => ({
      ...prev,
      [ticket.id]: "",
    }));
    setSourcingDecisionDrafts((prev) => ({
      ...prev,
      [ticket.id]: "",
    }));
    toast.success(`${ticket.jobId} custom part request sent to inventory manager.`);
  };

  const handleCancelJob = async (ticket: Ticket) => {
    const reason = "Cancelled by technician (parts missing or cannot be sourced)";

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        // The backend rejects a cancel without a non-blank note.
        await api.post(`/jobs/${ticket.id}/status/update/`, {
          status: "cancelled",
          note: reason,
        });
        toast.success(`${ticket.jobId} cancelled successfully.`);
        setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: "cancelled" } : t)));
      } catch (err: any) {
        console.error("Cancel error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to cancel ticket via API.");
      }
      return;
    }

    const checkedAt = new Date().toISOString();

    await persistTicketUpdate(
      ticket.id,
      {
        status: "cancelled",
        partSourcingStatus: "not_sourceable",
        partSourcingCheckedAt: checkedAt,
        cancellationReason: reason,
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      `${ticket.jobId} cancelled.`,
      {
        clientUpdateTitle: "Repair cancelled",
        clientUpdateDetails: [reason],
      }
    );
  };

  const handleConfirmPartReceived = async (ticket: Ticket) => {
    const partRequests = getTicketPartRequests(ticket);
    const pendingPartReceipts = partRequests.filter((request) =>
      isAwaitingTechnicianPartConfirmation(request)
    );

    if (pendingPartReceipts.length === 0) {
      toast.error("No released parts are waiting for technician confirmation.");
      return;
    }

    const now = new Date().toISOString();
    const nextPartRequests = partRequests.map((request) =>
      request.replacementReleasedAt && !request.replacementReceivedAt
        ? {
            ...request,
            replacementReceivedAt: now,
          }
        : request.releasedAt && !request.receivedAt && !request.returnedDefectiveAt
        ? {
            ...request,
            receivedAt: now,
          }
        : request
    );
    const receivedPartNames = pendingPartReceipts.map((request) =>
      getInventoryPartName(request.partId, inventory, request.partName)
    );

    await persistTicketUpdate(
      ticket.id,
      {
        status: "ready_for_repair",
        ...buildTicketPartFields(nextPartRequests),
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      `${ticket.jobId} part receipt confirmed.`,
      {
        clientUpdateTitle: "Parts received by technician",
        clientUpdateDetails: [
          receivedPartNames.length > 0 ? `Received parts: ${receivedPartNames.join(", ")}` : "",
          "Technician confirmed the released parts were received and repair can begin when ready.",
        ].filter(Boolean),
      }
    );
  };

  const handleStartRepair = async (ticket: Ticket) => {
    const partRequests = getTicketPartRequests(ticket);
    const unresolvedParts = partRequests.filter((request) => !isPartReadyForRepair(request));

    if (unresolvedParts.length > 0) {
      toast.error("Technician must confirm every released part has been received before repair can start.");
      return;
    }

    const releasedPartNames = partRequests
      .filter((request) => isPartReadyForRepair(request))
      .map((request) => getInventoryPartName(request.partId, inventory, request.partName));

    await persistTicketUpdate(
      ticket.id,
      {
        status: "repairing",
        assignedEngineer: user?.name ?? ticket.assignedEngineer,
      },
      `${ticket.jobId} repair started.`,
      {
        clientUpdateTitle: "Repair started",
        clientUpdateDetails: [
          ticket.diagnosis ? `Diagnosis: ${ticket.diagnosis}` : "",
          releasedPartNames.length > 0 ? `Released parts: ${releasedPartNames.join(", ")}` : "",
          "Technician has started the repair work.",
        ].filter(Boolean),
      }
    );
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading technician workspace...</div>;
  }

  if (!user || user.role !== "engineer") {
    return (
      <div className="glass-card p-8 max-w-xl mx-auto text-center space-y-2">
        <p className="text-lg font-semibold text-foreground">Technician access only</p>
        <p className="text-sm text-muted-foreground">
          Sign in with a technician account to use this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Good Afternoon, {user.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Handle warranty reviews, diagnose new jobs, update repair progress, and finish jobs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-foreground">{availableTickets.length}</p>
          <p className="text-xs text-muted-foreground mt-1">All Tickets</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-foreground">{diagnosingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Awaiting Tech Review</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-foreground">{repairingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">In Repair</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-foreground">{readyToStartCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Ready To Start</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
        <section className="space-y-4">
          <div className="glass-card p-4">
            <SearchField
              value={ticketSearch}
              onChange={(event) => setTicketSearch(event.target.value)}
              placeholder="Search jobs by ID, customer, issue, device..."
            />
          </div>

          <h2 className="text-sm font-semibold text-foreground">All Tickets</h2>
          <div className="space-y-4">
            {availableTickets.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No tickets found.</p>
              </div>
            ) : (
              availableTickets.map((ticket) => (
                <div key={ticket.id} className="glass-card p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                      <p className="text-sm text-foreground">{ticket.customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} - {ticket.device.make} {ticket.device.model}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{ticket.device.imei}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="text-foreground font-medium">Issue:</span>{" "}
                        {ticket.issueReported || "Not captured"}
                      </p>
                      {ticket.customerNote && (
                        <p className="text-sm text-muted-foreground">
                          <span className="text-foreground font-medium">Customer Note:</span>{" "}
                          {ticket.customerNote}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2">
                      <StatusBadge status={ticket.status} />
                      <Link to={`/ticket/${ticket.id}`} className="text-sm text-primary hover:underline">
                        Open Full Ticket
                      </Link>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Updated {new Date(ticket.updatedAt).toLocaleString()}</span>
                    {ticket.device.images.length > 0 && (
                      <span>
                        {ticket.device.images.length} intake image
                        {ticket.device.images.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {ticket.device.images.length > 0 && (
                    <details className="rounded-lg border border-border bg-secondary/20 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">
                        Intake Images ({ticket.device.images.length})
                      </summary>
                      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {ticket.device.images.map((image, index) => (
                          <button
                            type="button"
                            key={`${ticket.id}-image-${index}`}
                            onClick={() => setPreviewImage(image)}
                            className="block aspect-square rounded-md overflow-hidden border border-border bg-secondary/40 hover:opacity-90 transition-opacity"
                          >
                            <img
                              src={image}
                              alt={`Intake image ${index + 1} for ${ticket.jobId}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    </details>
                  )}

                  {ticket.status === "warranty_review" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Confirm whether this device still qualifies for warranty repair. If the warranty is void,
                        front desk will need to create a new paid repair ticket.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`warranty-void-${ticket.id}`}>Void Reason</Label>
                        <Input
                          id={`warranty-void-${ticket.id}`}
                          value={warrantyVoidReasonDrafts[ticket.id] ?? ""}
                          onChange={(event) =>
                            setWarrantyVoidReasonDrafts((prev) => ({
                              ...prev,
                              [ticket.id]: event.target.value,
                            }))
                          }
                          placeholder="e.g. Water damage, broken seal, impact damage"
                          className="bg-secondary border-border"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="destructive" onClick={() => void handleWarrantyVoid(ticket)}>
                          Void Warranty
                        </Button>
                        <Button onClick={() => void handleWarrantyValid(ticket)}>
                          Confirm Warranty Valid
                        </Button>
                      </div>
                    </div>
                  )}

                  {ticket.status === "diagnosing" && (
                    <details className="rounded-lg border border-border bg-secondary/20 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">
                        {isWarrantyServiceTicket(ticket)
                          ? "Open Warranty Diagnosis Workspace"
                          : "Open Diagnosis Workspace"}
                      </summary>
                      <div className="mt-4 border-t border-border/60 pt-4 space-y-4">
                      {(() => {
                        const isWarrantyTicket = isWarrantyServiceTicket(ticket);
                        const noPartsRequired = Boolean(noPartsRequiredDrafts[ticket.id]);
                        const selectedPartIds = uniquePartIds(selectedPartDrafts[ticket.id] ?? []);
                        const partRequests = getTicketPartRequests(ticket);
                        const requestedPartIds = partRequests
                          .filter((request) => request.requestedAt)
                          .map((request) => request.partId);
                        const unavailableSelectedParts = partRequests
                          .filter(
                            (request) =>
                              selectedPartIds.includes(request.partId) && request.available === false
                          )
                          .map((request) => getInventoryPartName(request.partId, inventory, request.partName));
                        const pendingSelectionCount = selectedPartIds.filter(
                          (partId) => !requestedPartIds.includes(partId)
                        ).length;
                        const repairCost = getRepairCostFromSelectedParts(
                          selectedPartIds,
                          noPartsRequired
                        );
                        const isBackendJob = !isNaN(Number(ticket.id));
                        const selectedCatalogServiceId = catalogServiceDrafts[ticket.id] ?? "";
                        const selectedCatalogService = backendServiceOptions.find(
                          (service: any) => String(service.id) === selectedCatalogServiceId
                        );
                        const noPartsRepairCost = isBackendJob
                          ? Number(selectedCatalogService?.base_price ?? 0)
                          : getRepairCostFromSelectedServices(selectedServiceDrafts[ticket.id] ?? []);

                        return (
                          <>
                      <div className="space-y-2">
                        <Label htmlFor={`diagnosis-${ticket.id}`}>
                          {isWarrantyTicket ? "Warranty Diagnosis" : "Diagnosis"}
                        </Label>
                        <Textarea
                          id={`diagnosis-${ticket.id}`}
                          value={diagnosisDrafts[ticket.id] ?? ""}
                          onChange={(event) =>
                            setDiagnosisDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))
                          }
                          placeholder="Write diagnosis details for front desk..."
                          rows={3}
                          className="bg-secondary border-border"
                        />
                      </div>
                      {!isWarrantyTicket && (
                        <label className="flex items-start gap-4 rounded-lg border border-border bg-background/60 px-4 py-4">
                          <Checkbox
                            checked={noPartsRequired}
                            onCheckedChange={(checked) =>
                              setNoPartsRequiredDraft(ticket.id, checked === true)
                            }
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">No parts required</p>
                            <p className="text-xs text-muted-foreground">
                              {isBackendJob
                                ? "Select the service that should replace the default Walk-in service for this diagnosis."
                                : `Select one or more non-parts service items below. Each selected item adds NGN ${SERVICE_OPTION_PRICE.toLocaleString()} to the quotation.`}
                            </p>
                          </div>
                        </label>
                      )}
                      {noPartsRequired && !isWarrantyTicket && isBackendJob && (
                        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                          <p className="text-xs text-muted-foreground">
                            Choose the non-parts service to bill for this diagnosis. The selected service base price becomes the quotation.
                          </p>
                          <div className="space-y-2">
                            <Label>Service</Label>
                            <Select
                              value={selectedCatalogServiceId}
                              onValueChange={(value) =>
                                setCatalogServiceDrafts((prev) => ({ ...prev, [ticket.id]: value }))
                              }
                            >
                              <SelectTrigger className="bg-secondary border-border">
                                <SelectValue placeholder="Select service" />
                              </SelectTrigger>
                              <SelectContent>
                                {backendServiceOptions.map((service: any) => (
                                  <SelectItem key={service.id} value={String(service.id)}>
                                    {service.name} - NGN {Number(service.base_price || 0).toLocaleString()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      {noPartsRequired && !isWarrantyTicket && !isBackendJob && (
                        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                          <p className="text-xs text-muted-foreground">
                            Choose every service included in this repair. The quotation is the sum of all selected service items.
                          </p>
                          <div className="space-y-2">
                            {SERVICE_OPTION_KEYS.map((serviceKey) => {
                              const checked = (selectedServiceDrafts[ticket.id] ?? []).includes(serviceKey);
                              return (
                                <label
                                  key={`${ticket.id}-${serviceKey}`}
                                  className="flex items-start gap-4 rounded-md border border-border bg-background/60 px-4 py-2"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(checkedState) =>
                                      toggleSelectedServiceDraft(ticket.id, serviceKey, checkedState === true)
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{SERVICE_OPTION_LABELS[serviceKey]}</p>
                                    <p className="text-xs text-muted-foreground">
                                      NGN {SERVICE_OPTION_PRICE.toLocaleString()}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Parts Required (Optional)</Label>
                        <div
                          className={
                            noPartsRequired ? "hidden" : "rounded-lg border border-border bg-secondary/30 p-4 space-y-4"
                          }
                        >
                          <p className="text-xs text-muted-foreground">
                            Select every required part. The repair cost is calculated automatically from selected parts.
                          </p>
                          <SearchField
                            value={inventorySearch}
                            onChange={(event) => setInventorySearch(event.target.value)}
                            placeholder="Search parts by name or category..."
                            inputClassName="h-12"
                          />
                          <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                            {filteredInventory.map((item) => {
                              const availableUnits = Math.max(0, item.quantity - item.locked);
                              const isChecked = selectedPartIds.includes(item.id);
                              const existingRequest = partRequests.find((request) => request.partId === item.id);
                              const alreadyRequested = Boolean(existingRequest?.requestedAt);

                              return (
                                <label
                                  key={`${ticket.id}-${item.id}`}
                                  className="flex items-start gap-4 rounded-md border border-border bg-background/60 px-4 py-2"
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    disabled={alreadyRequested}
                                    onCheckedChange={(checked) =>
                                      toggleSelectedPartDraft(ticket.id, item.id, checked === true)
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.category} | NGN {item.price.toLocaleString()} | {availableUnits} available
                                    </p>
                                    {alreadyRequested && existingRequest?.requestedAt && (
                                      <p className="text-xs text-primary">
                                        Requested {new Date(existingRequest.requestedAt).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                            {filteredInventory.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No inventory items match the current search. Use the add-to-inventory request below.
                              </p>
                            )}
                          </div>
                        </div>
                        {/* Request custom part temporarily disabled per user request
                        <div
                          className={
                            noPartsRequired ? "hidden" : "rounded-lg border border-border bg-secondary/30 p-4 space-y-2"
                          }
                        >
                          <Label htmlFor={`custom-part-${ticket.id}`}>Part Missing From Inventory / Odoo?</Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id={`custom-part-${ticket.id}`}
                              value={customPartDrafts[ticket.id] ?? ""}
                              onChange={(event) =>
                                setCustomPartDrafts((prev) => ({
                                  ...prev,
                                  [ticket.id]: event.target.value,
                                }))
                              }
                              placeholder="Enter missing part name so inventory can add it"
                              className="bg-secondary border-border"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleRequestCustomPartFromInventoryManager(ticket)}
                            >
                              Request Inventory Add
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Inventory can add the part or confirm that the job should be cancelled if it cannot be sourced.
                          </p>
                        </div>
                        */}
                        {noPartsRequired && !isWarrantyTicket && (
                          <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-xs text-foreground">
                            No hardware parts will be requested.{" "}
                            {isBackendJob ? "Selected service costs" : "Selected service items total"}{" "}
                            NGN {noPartsRepairCost.toLocaleString()}.
                          </div>
                        )}
                        {!noPartsRequired && selectedPartIds.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              {selectedPartIds.length} part{selectedPartIds.length === 1 ? "" : "s"} selected.
                            </p>
                            {!isWarrantyTicket && (
                              <p className="text-xs text-muted-foreground">
                                Auto repair cost:{" "}
                                <span className="text-foreground font-medium">
                                  NGN {repairCost.toLocaleString()}
                                </span>
                              </p>
                            )}
                            {isBackendJob ? (
                              <p className="text-xs text-muted-foreground">
                                Selected parts go on the quotation. Request them from inventory after payment is confirmed.
                              </p>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  onClick={() => void handleRequestPartFromInventoryManager(ticket)}
                                  disabled={pendingSelectionCount === 0}
                                >
                                  Request Selected Part{selectedPartIds.length === 1 ? "" : "s"} From Inventory Manager
                                </Button>
                                {pendingSelectionCount === 0 && requestedPartIds.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    All selected parts have already been requested.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {!noPartsRequired && unavailableSelectedParts.length > 0 && (
                          isWarrantyTicket ? (
                            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
                              <p className="text-xs text-warning">
                                Requested part{unavailableSelectedParts.length === 1 ? "" : "s"} currently unavailable:
                                {" "}
                                {unavailableSelectedParts.join(", ")}.
                              </p>
                              <p className="text-xs text-muted-foreground">
                                This is a warranty repair, so the job stays open. When you submit diagnosis, the
                                customer update email will say the required part will be ready in 5 business days.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
                              <p className="text-xs text-warning">
                                Requested part{unavailableSelectedParts.length === 1 ? "" : "s"} currently unavailable:
                                {" "}
                                {unavailableSelectedParts.join(", ")}.
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Confirm with the inventory manager whether the unavailable part
                                {unavailableSelectedParts.length === 1 ? "" : "s"} can be sourced within a few days.
                                Only then should you send the quotation.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant={
                                    (sourcingDecisionDrafts[ticket.id] ?? "") === "sourceable"
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    setSourcingDecisionDrafts((prev) => ({
                                      ...prev,
                                      [ticket.id]: "sourceable",
                                    }))
                                  }
                                >
                                  Can Be Sourced
                                </Button>
                                <Button
                                  type="button"
                                  variant={
                                    (sourcingDecisionDrafts[ticket.id] ?? "") === "not_sourceable"
                                      ? "destructive"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    setSourcingDecisionDrafts((prev) => ({
                                      ...prev,
                                      [ticket.id]: "not_sourceable",
                                    }))
                                  }
                                >
                                  Cannot Be Sourced
                                </Button>
                              </div>
                              {(sourcingDecisionDrafts[ticket.id] ?? "") === "sourceable" && (
                                <p className="text-xs text-muted-foreground">
                                  Quotation can be sent. Front desk will confirm payment once it is received.
                                </p>
                              )}
                              {(sourcingDecisionDrafts[ticket.id] ?? "") === "not_sourceable" && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => void handleCancelJob(ticket)}
                                  >
                                    Cancel Job
                                  </Button>
                                  <p className="text-xs text-muted-foreground">
                                    Cancel this job instead of sending a quotation when the required parts cannot be
                                    sourced quickly.
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                      {!isWarrantyTicket && (
                        <p className="text-xs text-muted-foreground">
                          {noPartsRequired
                            ? isBackendJob
                              ? "No hardware parts will be requested. The quotation comes from the selected service base price."
                              : "No hardware parts will be requested. The quotation is the sum of the selected service items."
                            : "Engineers cannot type repair cost manually. Cost is auto-generated from selected required parts."}
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Button
                          onClick={() => void handleSubmitDiagnosis(ticket)}
                          disabled={
                            (!isWarrantyTicket &&
                              !noPartsRequired &&
                              selectedPartIds.length === 0) ||
                            (!isWarrantyTicket &&
                              noPartsRequired &&
                              (isBackendJob
                                ? !selectedCatalogServiceId
                                : (selectedServiceDrafts[ticket.id] ?? []).length === 0)) ||
                            (!isWarrantyTicket &&
                              unavailableSelectedParts.length > 0 &&
                              (sourcingDecisionDrafts[ticket.id] ?? "") !== "sourceable")
                          }
                        >
                          {isWarrantyTicket ? "Submit Warranty Diagnosis" : "Submit Diagnosis & Email Quotation"}
                        </Button>
                        {/* The backend rejects a technician cancel during diagnosis
                            unless the job is a warranty job, which has its own
                            cancel-with-reason flow on the full ticket. */}
                        {!isBackendJob && (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleCancelJob(ticket)}
                          >
                            Cancel Job (Parts missing)
                          </Button>
                        )}
                      </div>
                      {isBackendJob && isWarrantyTicket && (
                        <p className="text-xs text-muted-foreground">
                          To cancel this warranty booking instead, use{" "}
                          <Link to={`/ticket/${ticket.id}`} className="text-primary hover:underline">
                            Open Full Ticket
                          </Link>
                          .
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {isWarrantyTicket
                          ? "Submitting this warranty diagnosis updates the customer and moves the job straight into parts release or repair. No customer payment is required."
                          : "Submitting diagnosis opens the customer email draft with the quotation details and sends the job to front desk for payment confirmation."}
                      </p>
                          </>
                        );
                      })()}
                      </div>
                    </details>
                  )}

                  {["repairing", "repair_in_progress", "repaired"].includes(ticket.status) && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Open ticket details to continue repair updates or submit this job for QA.
                      </p>
                      <Link
                        to={`/ticket/${ticket.id}`}
                        className="inline-flex text-sm font-medium text-primary hover:underline"
                      >
                        Open Ticket Details
                      </Link>
                    </div>
                  )}

                  {ticket.status === "awaiting_parts_release" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Waiting for the <span className="text-foreground font-medium">inventory manager</span> to complete the next parts handoff for this repair.
                      </p>
                      {getTicketPartRequests(ticket).some((request) => isAwaitingDefectiveReturnReceipt(request)) && (
                        <p className="text-xs text-muted-foreground">
                          Inventory manager must confirm the defective part has been received before releasing a new part.
                        </p>
                      )}
                      {getTicketPartRequests(ticket).some((request) => isAwaitingReplacementRelease(request)) && (
                        <p className="text-xs text-muted-foreground">
                          Defective part has been confirmed. Waiting for inventory manager to release the replacement.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Once all required parts are released, this job will move to <span className="text-foreground font-medium">Ready For Repair</span> for technician receipt confirmation.
                      </p>
                    </div>
                  )}

                  {ticket.status === "ready_for_repair" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {getTicketPartRequests(ticket).some((request) => isAwaitingTechnicianPartConfirmation(request))
                          ? "Required part release is complete. Confirm receipt before starting or resuming repair."
                          : "All required parts have been received. Start repair when work begins."}
                      </p>
                      {getTicketPartRequests(ticket).some((request) => isAwaitingTechnicianPartConfirmation(request)) ? (
                        <Button onClick={() => void handleConfirmPartReceived(ticket)}>
                          Confirm Part Received
                        </Button>
                      ) : (
                        <Button onClick={() => void handleStartRepair(ticket)}>
                          Start Repair
                        </Button>
                      )}
                    </div>
                  )}

                </div>
              ))
            )}
          </div>



          <h2 id="done-jobs" className="text-sm font-semibold text-foreground pt-2">Jobs Completed By You</h2>
          <div className="space-y-4">
            {myCompletedJobs.length === 0 ? (
              <div className="glass-card p-6 text-sm text-muted-foreground">
                No completed jobs assigned to you yet.
              </div>
            ) : (
              myCompletedJobs.map((ticket) => (
                <div key={ticket.id} className="glass-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                      <p className="text-sm text-foreground">
                        {ticket.customer.name} - {ticket.device.make} {ticket.device.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.status === "completed" ? "Handed over" : "Approved for handover"}{" "}
                        {new Date(ticket.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h2 className="font-semibold text-foreground">Inventory Search</h2>
            <SearchField
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search parts or category..."
            />
          </div>

          <div className="glass-card p-4 max-h-[580px] overflow-y-auto space-y-2">
            {filteredInventory.map((item) => {
              const available = item.quantity - item.locked;
              return (
                <div key={item.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                    <span>Price: NGN {item.price.toLocaleString()}</span>
                    <span>Available: {available}</span>
                  </div>
                </div>
              );
            })}
            {filteredInventory.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No inventory items match your search.
              </p>
            )}
          </div>
        </section>
      </div>
      <ImageLightbox imageUrl={previewImage} onClose={() => setPreviewImage(null)} alt="Ticket intake image" />
    </div>
  );
}
