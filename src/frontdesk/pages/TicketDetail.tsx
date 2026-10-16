import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getTickets,
  saveTickets,
  Ticket,
  getAuth,
  getInventory,
  saveInventory,
  TicketStatus,
  User,
  InventoryItem,
  createInvoice,
  AppSettings,
  DEVICE_TYPE_LABELS,
  getSettings,
  DEFAULT_SETTINGS,
  getLatestInvoiceByTicketAndType,
  InvoiceType,
  NO_PARTS_REQUIRED_REPAIR_FEE,
  PartSourcingStatus,
  PAYMENT_MODE_LABELS,
  PaymentMode,
  SERVICE_OPTION_KEYS,
  SERVICE_OPTION_LABELS,
  SERVICE_OPTION_PRICE,
  type ServiceOptionKey,
  TICKET_INTAKE_LABELS,
} from "@/frontdesk/lib/store";
import { mapBackendJobStatusToTicketStatus, mapBackendTicketToFrontend } from "@/frontdesk/lib/store";
import RepairWarrantyPanel from "@/operations/RepairWarrantyPanel";
import { useApi } from "@/hooks/useApi";
import { useWS } from "@/context/WebSocketContext";
import { getNigerianPhoneSearchVariants } from "@/utils/phoneNumber";
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
  shouldConsumePartOnCompletion,
  uniquePartIds,
} from "@/frontdesk/lib/parts";
import { buildAssessmentPayload, fetchDiagnosisServiceOptions } from "@/frontdesk/lib/diagnosis";
import { formatCurrency, printInvoice } from "@/frontdesk/lib/invoice";
import { openAgreementDocument, openJobCardDocument, sendAgreementEmail } from "@/frontdesk/lib/agreement";
import { sendClientTicketUpdateEmail } from "@/frontdesk/lib/clientUpdateEmail";
import SearchField from "@/frontdesk/components/SearchField";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import ImageLightbox from "@/frontdesk/components/ImageLightbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  User as UserIcon,
  Smartphone,
  FileText,
  Wrench,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  FileSignature,
  Mail,
  ReceiptText,
  Loader2,
  Pencil,
} from "lucide-react";
import { EditCustomerModal, type EditableCustomer } from "@/components/EditCustomerModal";

type SourcingDecision = "" | PartSourcingStatus;

function normalizeInventoryValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function findCatalogItem(inventory: InventoryItem[], ...candidates: Array<unknown>) {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeInventoryValue(candidate))
    .filter(Boolean);

  return inventory.find((item) => {
    const itemValues = [
      normalizeInventoryValue(item.id),
      normalizeInventoryValue(item.name),
      normalizeInventoryValue(item.sku),
    ];
    return normalizedCandidates.some((candidate) => itemValues.includes(candidate));
  });
}

function isWarrantyServiceTicket(ticket: Ticket) {
  return ticket.intakeType === "repeat_return" || ticket.intakeType === "warranty";
}

const BULK_DIAGNOSIS_READY_BACKEND_STATUSES = new Set(["awaiting_diagnosis_fee"]);
const BULK_REPAIR_READY_BACKEND_STATUSES = new Set(["quote_accepted", "awaiting_payment"]);
const BULK_REPAIR_VISIBLE_BACKEND_STATUSES = new Set([
  "quote_sent",
  "quote_accepted",
  "awaiting_payment",
  "payment_confirmed",
  "repair_in_progress",
  "repaired",
  "submitted_for_qc_review",
  "qc_passed",
  "ready_for_collection",
  "delivered",
  "closed",
  "completed",
]);

function normalizeBackendStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function readMoneyAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function moneyAmountsMatch(left: unknown, right: unknown) {
  return Math.abs(readMoneyAmount(left) - readMoneyAmount(right)) < 0.01;
}

function buildRepairQuoteInvoiceKey(ticketId: string, paymentMode: PaymentMode, amount: number) {
  return `${ticketId}::${paymentMode}::${amount.toFixed(2)}`;
}

function getDashboardPathForRole(role?: User["role"] | null) {
  switch (role) {
    case "engineer":
      return "/engineer";
    case "qa":
      return "/qa";
    case "inventory_manager":
      return "/inventory";
    case "admin":
      return "/admin";
    case "front_desk":
    default:
      return "/dashboard";
  }
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [backendPartRequests, setBackendPartRequests] = useState<any[]>([]);
  const [backendServiceOptions, setBackendServiceOptions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [noPartsRequired, setNoPartsRequired] = useState(false);
  const [selectedServices, setSelectedServices] = useState<ServiceOptionKey[]>([]);
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState("");
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [customPartName, setCustomPartName] = useState("");
  const [partSourcingStatus, setPartSourcingStatus] = useState<SourcingDecision>("");
  const [warrantyVoidDiagnosisReason, setWarrantyVoidDiagnosisReason] = useState("");
  const [warrantyVoidReason, setWarrantyVoidReason] = useState("");
  const [isCancellingWarranty, setIsCancellingWarranty] = useState(false);
  const [defectivePartId, setDefectivePartId] = useState("");
  const [defectiveReturnReason, setDefectiveReturnReason] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [diagnosisPaymentMode, setDiagnosisPaymentMode] = useState<PaymentMode>("cash");
  const [diagnosisVoucherCode, setDiagnosisVoucherCode] = useState("");
  const [hasGeneratedDiagnosisInvoice, setHasGeneratedDiagnosisInvoice] = useState(false);
  const [repairPaymentMode, setRepairPaymentMode] = useState<PaymentMode>("cash");
  const [repairVoucherCode, setRepairVoucherCode] = useState("");
  const [diagnosisVoucherValidation, setDiagnosisVoucherValidation] = useState<{
    loading: boolean;
    error: string | null;
    discountAmount: number;
    finalAmount: number;
    isFullWaiver: boolean;
    validCode: string | null;
  } | null>(null);
  const [repairVoucherValidation, setRepairVoucherValidation] = useState<{
    loading: boolean;
    error: string | null;
    discountAmount: number;
    finalAmount: number;
    isFullWaiver: boolean;
    validCode: string | null;
  } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [releasingKey, setReleasingKey] = useState<string | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(true);
  const lastTicketRef = useRef<Ticket | null>(null);
  const inventoryCatalogLoadedRef = useRef(false);
  const serviceCatalogLoadedRef = useRef(false);
  const technicianOptionsLoadedRef = useRef(false);
  const [parentChildJobs, setParentChildJobs] = useState<any[]>([]);
  const [loadingParentChildJobs, setLoadingParentChildJobs] = useState(false);
  const [parentChildJobsLoadedOnce, setParentChildJobsLoadedOnce] = useState(false);
  const [availableTechnicians, setAvailableTechnicians] = useState<any[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const completionMediaInputRef = useRef<HTMLInputElement | null>(null);
  const [completionMediaFiles, setCompletionMediaFiles] = useState<File[]>([]);
  const [completionMediaPreviews, setCompletionMediaPreviews] = useState<string[]>([]);
  const [hasRepairQuoteInvoice, setHasRepairQuoteInvoice] = useState(false);
  const [repairQuoteInvoiceKey, setRepairQuoteInvoiceKey] = useState<string | null>(null);
  const [repairQuoteInvoiceNumber, setRepairQuoteInvoiceNumber] = useState<string | null>(null);
  const [loadingRepairQuoteInvoice, setLoadingRepairQuoteInvoice] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState<EditableCustomer | null>(null);
  const [loadingCustomerForEdit, setLoadingCustomerForEdit] = useState(false);
  const { api } = useApi();
  const { isConnected, subscribeToJob, unsubscribeFromJob, addEventListener } = useWS();

  const getSelectedServicesRepairCost = (services: ServiceOptionKey[]) =>
    services.length * SERVICE_OPTION_PRICE;

  const updateCurrentTicket = (updater: (current: Ticket) => Ticket) => {
    setTicket((current) => {
      if (!current) return current;
      const nextTicket = updater(current);
      lastTicketRef.current = nextTicket;
      return nextTicket;
    });
  };

  useEffect(() => {
    let mounted = true;

    const loadParentChildJobs = async (parentJobId: string) => {
      if (!mounted) return;
      setLoadingParentChildJobs(true);
      try {
        const childRes = await api.get("/jobs/admin/bookings/", {
          params: { job_group_type: "child", page_size: 1000 },
        });
        const childJobs = Array.isArray(childRes.data?.result) ? childRes.data.result : [];
        if (!mounted) return;
        setParentChildJobs(
          childJobs.filter(
            (childJob: any) =>
              String(childJob.parent_job ?? childJob.parent_job_id ?? "") === String(parentJobId)
          )
        );
        setParentChildJobsLoadedOnce(true);
      } catch (err) {
        console.error("Failed to fetch child jobs for parent ticket:", err);
        if (mounted) {
          setParentChildJobs([]);
          setParentChildJobsLoadedOnce(true);
        }
      } finally {
        if (mounted) {
          setLoadingParentChildJobs(false);
        }
      }
    };

    const loadLookupDataIfNeeded = async (
      role: User["role"] | null | undefined,
      currentTicket: Ticket,
      fallbackInventory: InventoryItem[]
    ) => {
      if (!mounted) return;

      setInventory((current) => (current.length > 0 ? current : fallbackInventory));

      const shouldLoadInventoryCatalog =
        role === "engineer" || role === "admin" || role === "inventory_manager";
      const shouldLoadServiceCatalog = role === "engineer" || role === "admin";
      const shouldLoadTechnicians =
        (role === "front_desk" || role === "admin") &&
        !["delivered", "closed", "cancelled"].includes(currentTicket.status) &&
        !Number.isNaN(Number(currentTicket.id));

      if (shouldLoadInventoryCatalog && !inventoryCatalogLoadedRef.current) {
        try {
          const backendInventory = await fetchPartsCatalog(api);
          if (mounted && backendInventory.length > 0) {
            setInventory(backendInventory);
            inventoryCatalogLoadedRef.current = true;
          }
        } catch (err) {
          console.error("Failed to fetch parts catalog:", err);
        }
      }

      if (shouldLoadServiceCatalog && !serviceCatalogLoadedRef.current) {
        try {
          const serviceOptions = await fetchDiagnosisServiceOptions(api);
          if (mounted && serviceOptions) {
            setBackendServiceOptions(serviceOptions);
            serviceCatalogLoadedRef.current = true;
          }
        } catch (err) {
          console.error("Failed to fetch service catalog:", err);
        }
      }

      if (shouldLoadTechnicians && !technicianOptionsLoadedRef.current) {
        try {
          const techRes = await api.get("/users/profile/technicians/?page=1&page_size=50");
          if (mounted && Array.isArray(techRes.data?.result)) {
            setAvailableTechnicians(techRes.data.result);
            technicianOptionsLoadedRef.current = true;
          }
        } catch (err) {
          console.error("Failed to fetch technicians:", err);
        }
      }
    };

    const load = async () => {
      try {
        if (mounted && !lastTicketRef.current) setLoadingTicket(true);

        const [authUser, inventoryData, appSettings] = await Promise.all([
          getAuth(),
          getInventory(),
          getSettings(),
        ]);

        if (!mounted) return;

        setUser(authUser);
        setSettings(appSettings);
        setInventory((current) => (current.length > 0 ? current : inventoryData));

        const routeTicketId = Number(id);
        const hasNumericTicketId = Boolean(id) && !Number.isNaN(routeTicketId);
        let backendJobResult: any = null;
        let resolvedTicket: Ticket | null = null;

        if (hasNumericTicketId) {
          try {
            const res = await api.get(`/jobs/${id}/`);
            if (res.data?.success && res.data.result) {
              backendJobResult = res.data.result;
              const apiTicket = mapBackendTicketToFrontend(res.data.result);
              apiTicket.diagnosisFee = appSettings.diagnosisFee;
              resolvedTicket = apiTicket;
            }
          } catch (err) {
            console.error("Failed to fetch job details from backend:", err);
          }
        }

        if (!resolvedTicket) {
          const tickets = await getTickets();
          resolvedTicket = tickets.find((entry) => entry.id === id) ?? null;
        }

        if (!mounted) return;

        if (!resolvedTicket) {
          lastTicketRef.current = null;
          setTicket(null);
          setBackendPartRequests([]);
          setParentChildJobs([]);
          setLoadingParentChildJobs(false);
          setParentChildJobsLoadedOnce(false);
          return;
        }

        const previous = lastTicketRef.current;
        const previousUpdatedAt = previous ? Date.parse(previous.updatedAt) : NaN;
        const resolvedUpdatedAt = Date.parse(resolvedTicket.updatedAt);
        const isStaleResolvedTicket =
          previous != null &&
          !Number.isNaN(previousUpdatedAt) &&
          !Number.isNaN(resolvedUpdatedAt) &&
          resolvedUpdatedAt < previousUpdatedAt;
        const displayTicket = isStaleResolvedTicket && previous ? previous : resolvedTicket;
        const isFirstLoad = !previous;
        const statusChanged = previous && previous.status !== displayTicket.status;
        const dataChanged =
          !previous ||
          previous.updatedAt !== displayTicket.updatedAt ||
          previous.status !== displayTicket.status;

        lastTicketRef.current = displayTicket;
        setTicket((current) => (dataChanged || !current ? displayTicket : current));

        if (isFirstLoad || statusChanged) {
          const shouldRefreshDrafts =
            !previous || authUser?.role !== "engineer" || displayTicket.status !== "diagnosing";
          if (shouldRefreshDrafts) {
            setDiagnosis(displayTicket.diagnosis || "");
            setNoPartsRequired(
              !isWarrantyServiceTicket(displayTicket) &&
                getTicketPartIds(displayTicket).length === 0 &&
                ((displayTicket.serviceSelections?.length ?? 0) > 0 ||
                  displayTicket.quotation === NO_PARTS_REQUIRED_REPAIR_FEE)
            );
            setSelectedServices(displayTicket.serviceSelections ?? []);
            const backendServiceId = backendJobResult?.service?.id;
            const hasNonDefaultService = Boolean(
              backendServiceId && String(backendServiceId) !== "31"
            );
            setSelectedCatalogServiceId(hasNonDefaultService ? String(backendServiceId) : "");
            const seededPartIds = getTicketPartIds(displayTicket).filter((partId) =>
              inventoryData.some((item) => item.id === partId)
            );
            setSelectedPartIds(seededPartIds);
            setCustomPartName("");
            setPartSourcingStatus(displayTicket.partSourcingStatus ?? "");
            setDiagnosisPaymentMode(displayTicket.diagnosisPaymentMode);
            setRepairPaymentMode(displayTicket.repairPaymentMode);
            setDefectiveReturnReason(displayTicket.partReturnedDefectiveReason || "");
            setQaNotes(displayTicket.qaNotes || "");
          }
        }

        void loadLookupDataIfNeeded(authUser?.role, displayTicket, inventoryData);

        if (!Number.isNaN(Number(displayTicket.id))) {
          if (
            displayTicket.jobGroupType === "parent" &&
            displayTicket.sourceChannel === "corporate"
          ) {
            void loadParentChildJobs(displayTicket.id);
          } else {
            setParentChildJobs([]);
            setLoadingParentChildJobs(false);
            setParentChildJobsLoadedOnce(false);
          }

          try {
            const reqRes = await api.get(`/jobs/${displayTicket.id}/admin/inventory/parts/`);
            if (mounted && reqRes.data?.success && Array.isArray(reqRes.data.result)) {
              setBackendPartRequests(reqRes.data.result);
            } else if (mounted) {
              setBackendPartRequests([]);
            }
          } catch (err) {
            console.error("Failed to fetch backend part requests:", err);
            if (mounted) {
              setBackendPartRequests([]);
            }
          }
        } else if (mounted) {
          setBackendPartRequests([]);
          setParentChildJobs([]);
          setLoadingParentChildJobs(false);
          setParentChildJobsLoadedOnce(false);
        }
      } finally {
        if (mounted) {
          setLoadingTicket(false);
        }
      }
    };

    void load();

    const refreshInterval = window.setInterval(() => {
      void load();
    }, 60000);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "repair_shop_tickets" || event.key === null) {
        void load();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [id, refreshTrigger]);

  useEffect(() => {
    if (!ticket) {
      setDefectivePartId("");
      return;
    }

    const returnablePartIds = getTicketPartRequests(ticket)
      .filter((request) => (request.receivedAt || request.replacementReceivedAt) && !request.returnedDefectiveAt)
      .map((request) => request.partId);

    setDefectivePartId((current) =>
      returnablePartIds.includes(current) ? current : returnablePartIds[0] ?? ""
    );
  }, [ticket]);

  const primaryRealtimeJobId = !Number.isNaN(Number(id))
    ? Number(id)
    : ticket && !Number.isNaN(Number(ticket.id))
    ? Number(ticket.id)
    : NaN;
  const realtimeTrackedJobIdsKey = !Number.isNaN(primaryRealtimeJobId)
    ? Array.from(
        new Set([
          primaryRealtimeJobId,
          ...((ticket?.jobGroupType === "parent" && ticket.sourceChannel === "corporate"
            ? parentChildJobs
            : []
          )
            .map((childJob) => Number(childJob.id))
            .filter((jobId) => !Number.isNaN(jobId))),
        ].filter((jobId) => !Number.isNaN(jobId)))
      ).join(",")
    : "";

  useEffect(() => {
    const jobIds = realtimeTrackedJobIdsKey
      ? realtimeTrackedJobIdsKey
          .split(",")
          .map((jobId) => Number(jobId))
          .filter((jobId) => !Number.isNaN(jobId))
      : [];
    if (!isConnected || jobIds.length === 0) return;

    jobIds.forEach((jobId) => {
      subscribeToJob(jobId);
    });

    const handleRealtimeRefresh = (event: any) => {
      const payload = event?.payload ?? {};
      const eventJobId = Number(payload.job_id);
      if (Number.isNaN(eventJobId) || !jobIds.includes(eventJobId)) {
        return;
      }

      const nextBackendStatus = String(payload.new_status ?? payload.job_status ?? "").trim();
      const eventTimestamp = String(event?.timestamp ?? new Date().toISOString());

      if (ticket && Number(ticket.id) === eventJobId && nextBackendStatus) {
        updateCurrentTicket((current) => ({
          ...current,
          status: mapBackendJobStatusToTicketStatus(nextBackendStatus),
        }));
      }

      if (ticket?.jobGroupType === "parent" && ticket.sourceChannel === "corporate" && nextBackendStatus) {
        setParentChildJobs((current) =>
          current.map((childJob) =>
            Number(childJob.id) === eventJobId
              ? {
                  ...childJob,
                  status: nextBackendStatus,
                  updated_at: eventTimestamp,
                }
              : childJob
          )
        );
      }

      if ((event?.event === "job.qc_reject" || event?.event === "job.qc_approve") && typeof payload.notes === "string") {
        setQaNotes(payload.notes);
      }

      setRefreshTrigger((prev) => prev + 1);
    };

    const removeStatusListener = addEventListener("job.status", handleRealtimeRefresh);
    const removeQcRejectListener = addEventListener("job.qc_reject", handleRealtimeRefresh);
    const removeQcApproveListener = addEventListener("job.qc_approve", handleRealtimeRefresh);

    return () => {
      removeStatusListener?.();
      removeQcRejectListener?.();
      removeQcApproveListener?.();
      jobIds.forEach((jobId) => {
        unsubscribeFromJob(jobId);
      });
    };
  }, [
    addEventListener,
    id,
    isConnected,
    realtimeTrackedJobIdsKey,
    subscribeToJob,
    ticket,
    unsubscribeFromJob,
  ]);

  const trackedRepairInvoiceIsCorporateParent =
    ticket != null &&
    !Number.isNaN(Number(ticket.id)) &&
    ticket.jobGroupType === "parent" &&
    ticket.sourceChannel === "corporate";
  const trackedRepairInvoiceActiveChildJobs = trackedRepairInvoiceIsCorporateParent
    ? parentChildJobs.filter((childJob) => normalizeBackendStatus(childJob.status) !== "cancelled")
    : [];
  const trackedRepairInvoiceVisibleChildJobs = trackedRepairInvoiceActiveChildJobs.filter((childJob) =>
    BULK_REPAIR_VISIBLE_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.status))
  );
  const trackedRepairInvoiceBaseAmount = trackedRepairInvoiceIsCorporateParent
    ? trackedRepairInvoiceActiveChildJobs.reduce(
        (sum, childJob) => sum + readMoneyAmount(childJob.service_quote_amount),
        0
      )
    : readMoneyAmount(ticket?.quotation);
  const trackedRepairInvoiceAmount = repairVoucherValidation?.validCode
    ? repairVoucherValidation.finalAmount
    : trackedRepairInvoiceBaseAmount;
  const trackedRepairInvoiceKey =
    ticket && trackedRepairInvoiceBaseAmount > 0
      ? buildRepairQuoteInvoiceKey(ticket.id, repairPaymentMode, trackedRepairInvoiceAmount)
      : null;
  const trackedRepairPaymentSectionVisible = Boolean(
    ticket &&
      ((ticket.status === "awaiting_repair_payment" ||
        ticket.status === "awaiting_payment" ||
        (ticket.status === "quote_accepted" && !isWarrantyServiceTicket(ticket))) ||
        (trackedRepairInvoiceIsCorporateParent && trackedRepairInvoiceVisibleChildJobs.length > 0))
  );

  useEffect(() => {
    let active = true;

    const resetRepairQuoteInvoiceState = () => {
      if (!active) return;
      setHasRepairQuoteInvoice(false);
      setRepairQuoteInvoiceKey(null);
      setRepairQuoteInvoiceNumber(null);
      setLoadingRepairQuoteInvoice(false);
    };

    const loadRepairQuoteInvoice = async () => {
      if (
        !ticket ||
        isWarrantyServiceTicket(ticket) ||
        !trackedRepairPaymentSectionVisible ||
        trackedRepairInvoiceBaseAmount <= 0
      ) {
        resetRepairQuoteInvoiceState();
        return;
      }

      setLoadingRepairQuoteInvoice(true);
      try {
        const existing = await getLatestInvoiceByTicketAndType(ticket.id, "repair_quote");
        if (!active) return;

        const isCurrent =
          Boolean(existing) &&
          existing?.paymentMode === repairPaymentMode &&
          moneyAmountsMatch(existing?.amount, trackedRepairInvoiceAmount);

        setHasRepairQuoteInvoice(Boolean(existing) || Boolean(repairQuoteInvoiceKey));
        if (isCurrent && trackedRepairInvoiceKey) {
          setRepairQuoteInvoiceKey(trackedRepairInvoiceKey);
          setRepairQuoteInvoiceNumber(existing?.invoiceNumber ?? null);
        } else if (repairQuoteInvoiceKey !== trackedRepairInvoiceKey) {
          setRepairQuoteInvoiceKey(null);
          setRepairQuoteInvoiceNumber(null);
        }
      } catch (error) {
        console.error("Failed to load repair quote invoice state:", error);
        if (!repairQuoteInvoiceKey) {
          resetRepairQuoteInvoiceState();
        } else if (active) {
          setHasRepairQuoteInvoice(true);
        }
      } finally {
        if (active) {
          setLoadingRepairQuoteInvoice(false);
        }
      }
    };

    void loadRepairQuoteInvoice();

    return () => {
      active = false;
    };
  }, [
    parentChildJobs,
    repairQuoteInvoiceKey,
    repairPaymentMode,
    ticket,
    trackedRepairInvoiceAmount,
    trackedRepairInvoiceBaseAmount,
    trackedRepairInvoiceKey,
    trackedRepairPaymentSectionVisible,
  ]);

  const updateTicketStatus = async (
    newStatus: TicketStatus,
    updates: Partial<Ticket> = {},
    options?: {
      toastMessage?: string;
      clientUpdateTitle?: string;
      clientUpdateDetails?: string[];
    }
  ) => {
    const tickets = await getTickets();
    const idx = tickets.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    tickets[idx] = {
      ...tickets[idx],
      ...updates,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    await saveTickets(tickets);
    setTicket(tickets[idx]);

    sendClientTicketUpdateEmail(tickets[idx], {
      updateTitle: options?.clientUpdateTitle ?? `Ticket moved to ${newStatus.replace(/_/g, " ")}`,
      updatedBy: user?.name,
      details:
        options?.clientUpdateDetails ??
        [
          tickets[idx].diagnosis ? `Diagnosis: ${tickets[idx].diagnosis}` : "",
          typeof tickets[idx].quotation === "number"
            ? `Estimated repair cost: NGN ${tickets[idx].quotation.toLocaleString()}`
            : "",
          tickets[idx].engineerUpdate ? `Technician note: ${tickets[idx].engineerUpdate}` : "",
        ],
    });

    toast.success(options?.toastMessage ?? `Ticket updated to: ${newStatus.replace(/_/g, " ")}`);
    return tickets[idx];
  };

  const submitBackendAssessment = async (method: "post" | "patch", jobId: string) => {
    const payload = buildAssessmentPayload({
      diagnosis,
      noPartsRequired,
      serviceId: selectedCatalogServiceId,
      partIds: selectedPartIds,
      inventory,
    });
    await api[method](`/jobs/${jobId}/assessment/`, payload);
  };

  const handleSubmitDiagnosis = async () => {
    if (user?.role === "front_desk") {
      toast.error("Diagnosis actions are technician-only.");
      return;
    }
    if (!ticket) return;
    const isWarrantyTicket = isWarrantyServiceTicket(ticket);
    const selectedParts = uniquePartIds(selectedPartIds);
    const repairCost = noPartsRequired
      ? getSelectedServicesRepairCost(selectedServices)
      : selectedParts.reduce((sum, partId) => {
      const item = inventory.find((entry) => entry.id === partId);
      return sum + (item?.price ?? 0);
    }, 0);
    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob && noPartsRequired && !selectedCatalogServiceId) {
      toast.error("Select a service when no parts are required.");
      return;
    }
    if (!isBackendJob && noPartsRequired && selectedServices.length === 0) {
      toast.error("Select at least one service item when no parts are required.");
      return;
    }

    if (isBackendJob) {
      try {
        await submitBackendAssessment("post", String(ticket.id));
        toast.success(isWarrantyTicket ? `${ticket.jobId} warranty diagnosis saved.` : `${ticket.jobId} assessment submitted.`);
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        console.error("Assessment error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to submit assessment via API.");
      }
      return;
    }

    const existingPartRequests = getTicketPartRequests(ticket);
    if (!isWarrantyTicket && selectedParts.length === 0 && !noPartsRequired) {
      toast.error("Select required parts or mark this repair as no parts required.");
      return;
    }
    if (noPartsRequired && selectedServices.length === 0) {
      toast.error("Select at least one service item when no parts are required.");
      return;
    }
    const missingRequestedParts = selectedParts.filter(
      (partId) => !existingPartRequests.some((request) => request.partId === partId && request.requestedAt)
    );
    if (missingRequestedParts.length > 0) {
      toast.error("Request every selected part from inventory manager before submitting diagnosis.");
      return;
    }

    const nextPartRequests = selectedParts.map((partId) => {
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
    if (!isWarrantyTicket && unavailablePartNames.length > 0 && partSourcingStatus !== "sourceable") {
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

    await updateTicketStatus(nextStatus, {
      diagnosis,
      quotation: isWarrantyTicket ? undefined : repairCost,
      serviceSelections: noPartsRequired ? selectedServices : undefined,
      ...buildTicketPartFields(nextPartRequests),
      partSourcingStatus:
        unavailablePartNames.length > 0 && !isWarrantyTicket ? "sourceable" : undefined,
      partSourcingCheckedAt: sourcingCheckedAt,
      cancellationReason: undefined,
      assignedEngineer: user?.name,
    }, {
      toastMessage: isWarrantyTicket
        ? unavailablePartNames.length > 0
          ? `${ticket.jobId} warranty diagnosis saved. Customer update prepared for part sourcing.`
          : nextStatus === "awaiting_parts_release"
          ? `${ticket.jobId} warranty diagnosis saved. Waiting for inventory to release parts.`
          : `${ticket.jobId} warranty diagnosis saved. Repair can start when you are ready.`
        : `${ticket.jobId} quotation emailed to customer and sent to front desk.`,
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
      ].filter(Boolean),
    });
  };

  const handleReassignTechnician = async () => {
    if (!ticket?.id) return;
    const technicianId = Number(selectedTechnician);
    if (!Number.isFinite(technicianId)) {
      toast.error("Please select a technician");
      return;
    }

    setReassigning(true);
    try {
      if (isBackendJob) {
        await api.post(`/jobs/${ticket.id}/admin/assign-manual/`, {
          technician_id: technicianId,
          force: true,
        });
        toast.success("Technician assigned successfully");
        setRefreshTrigger((p: number) => p + 1);
        setSelectedTechnician("");
      } else {
        toast.error("Offline jobs cannot be assigned a technician via API yet.");
      }
    } catch (e: any) {
      console.error("Error assigning technician:", e);
      toast.error(e?.response?.data?.message || "Failed to assign technician");
    } finally {
      setReassigning(false);
    }
  };

  const handleUpdateAssessment = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can update assessments.");
      return;
    }
    const isBackendJob = !isNaN(Number(ticket.id));
    if (!isBackendJob) {
      toast.error("Assessment update is only available for backend jobs.");
      return;
    }

    const selectedParts = uniquePartIds(selectedPartIds);

    try {
      await submitBackendAssessment("patch", String(ticket.id));
      toast.success(`${ticket.jobId} assessment updated.`);
      setRefreshTrigger((p: number) => p + 1);
    } catch (err: any) {
      console.error("Assessment update error:", err?.response?.data || err);
      toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to update assessment.");
    }
  };

  const handleRequestPartFromInventoryManager = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can request parts.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      if (ticketParts.length === 0) {
        toast.error("No parts required to request.");
        return;
      }
      try {
        const partNames = ticketParts.map((p) => p.name).join(", ");
        await api.post(`/jobs/${ticket.id}/admin/inventory/parts/`, {
          notes: `Part request: ${partNames}`,
        });
        toast.success(
          `${ticketParts.length} part request${ticketParts.length === 1 ? "" : "s"} sent to inventory manager.`
        );
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        console.error("Part request error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to request parts via API.");
      }
      return;
    }

    // Frontend-only jobs: use local storage flow
    const tickets = await getTickets();
    const idx = tickets.findIndex((entry: Ticket) => entry.id === id);
    if (idx === -1) return;

    const existingPartRequests = getTicketPartRequests(tickets[idx]);
    const newPartIds = selectedParts.filter(
      (partId: string) => !existingPartRequests.some((request: any) => request.partId === partId && request.requestedAt)
    );
    if (newPartIds.length === 0) {
      toast.error("Selected parts have already been requested.");
      return;
    }

    const now = new Date().toISOString();
    const nextPartRequests = selectedParts.map((partId: string) => {
      const existingRequest = existingPartRequests.find((request: any) => request.partId === partId);
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

    tickets[idx] = {
      ...tickets[idx],
      ...buildTicketPartFields(nextPartRequests),
      partSourcingStatus: undefined,
      partSourcingCheckedAt: undefined,
      cancellationReason: undefined,
      updatedAt: now,
      assignedEngineer: user?.name ?? tickets[idx].assignedEngineer,
    };

    await saveTickets(tickets);
    setTicket(tickets[idx]);
    setSelectedPartIds(nextPartRequests.map((request: any) => request.partId));
    setNoPartsRequired(false);
    setPartSourcingStatus("");
    toast.success(
      `${newPartIds.length} part request${newPartIds.length === 1 ? "" : "s"} sent to inventory manager.`
    );
  };

  const handleRequestCustomPartFromInventoryManager = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can request parts.");
      return;
    }

    const name = customPartName.trim();
    if (!name) {
      toast.error("Enter the missing part name before sending request.");
      return;
    }

    // Backend jobs: use the API directly, skip local storage
    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/admin/inventory/parts/`, {
          notes: `Custom part request: ${name}`,
        });
        toast.success("Custom part request sent to inventory manager.");
        setCustomPartName("");
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        console.error("Custom part request error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to request custom part via API.");
      }
      return;
    }

    // Frontend-only jobs: use local storage flow
    const tickets = await getTickets();
    const idx = tickets.findIndex((entry: Ticket) => entry.id === id);
    if (idx === -1) return;

    const existingPartRequests = getTicketPartRequests(tickets[idx]);
    const alreadyRequested = existingPartRequests.some(
      (request: any) =>
        Boolean(request.requestedAt) &&
        (request.partName ?? getInventoryPartName(request.partId, inventory, request.partName))
          .trim()
          .toLowerCase() === name.toLowerCase()
    );
    if (alreadyRequested) {
      toast.error("This part has already been requested for this job.");
      return;
    }

    const now = new Date().toISOString();
    const customPartId = `custom_${tickets[idx].id}_${now}`;
    const nextPartRequests = [
      ...existingPartRequests,
      {
        partId: customPartId,
        partName: name,
        available: false,
        requestedAt: now,
      },
    ];

    tickets[idx] = {
      ...tickets[idx],
      ...buildTicketPartFields(nextPartRequests),
      partSourcingStatus: undefined,
      partSourcingCheckedAt: undefined,
      cancellationReason: undefined,
      updatedAt: now,
      assignedEngineer: user?.name ?? tickets[idx].assignedEngineer,
    };

    await saveTickets(tickets);
    setTicket(tickets[idx]);
    setSelectedPartIds((current: string[]) => uniquePartIds([...current, customPartId]));
    setNoPartsRequired(false);
    setCustomPartName("");
    setPartSourcingStatus("");
    toast.success("Custom part request sent to inventory manager.");
  };

  const handleCancelJob = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin" && user?.role !== "front_desk") {
      toast.error("You don't have permission to cancel jobs.");
      return;
    }

    // This action only surfaces once the engineer marks the required parts
    // "cannot be sourced", so name those parts in the reason.
    const blockingParts = getTicketPartRequests(ticket).filter(
      (request: any) => selectedPartIds.includes(request.partId) && request.available === false
    );
    const blockingPartsReason =
      blockingParts.length > 0
        ? `Required part${blockingParts.length === 1 ? "" : "s"} cannot be sourced within a few days: ${blockingParts
            .map((request: any) => getInventoryPartName(request.partId, inventory, request.partName))
            .join(", ")}.`
        : "";

    // Backend jobs: use API directly, skip local storage checks
    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      // The backend rejects a cancel without a non-blank note.
      const apiReason = blockingPartsReason || "Required parts could not be sourced in time.";
      try {
        await api.post(`/jobs/${ticket.id}/status/update/`, {
          status: "cancelled",
          note: apiReason.slice(0, 500),
        });
        toast.success(`${ticket.jobId} cancelled successfully.`);
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        console.error("Cancel error:", err?.response?.data || err);
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to cancel ticket via API.");
      }
      return;
    }

    // Frontend-only jobs: local storage flow with engineer restriction
    let reason = "Cancelled by user";
    if (user?.role === "engineer") {
      if (!blockingPartsReason) {
        toast.error("Only jobs with unavailable required parts can be cancelled from here by technicians.");
        return;
      }
      reason = blockingPartsReason;
    }

    const checkedAt = new Date().toISOString();
    await updateTicketStatus("cancelled", {
      partSourcingStatus: "not_sourceable",
      partSourcingCheckedAt: checkedAt,
      cancellationReason: reason,
      assignedEngineer: user?.name ?? ticket.assignedEngineer,
    }, {
      toastMessage: `${ticket.jobId} cancelled.`,
      clientUpdateTitle: "Repair cancelled",
      clientUpdateDetails: [reason],
    });
  };

  const handleAcceptQuote = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can accept quotes from this screen.");
      return;
    }
    try {
      const response = await api.post(`/jobs/${ticket.id}/admin/quote/`, { approve: true });
      const nextStatus = response?.data?.result?.status;
      if (nextStatus) {
        updateCurrentTicket((current) => ({
          ...current,
          status: mapBackendJobStatusToTicketStatus(nextStatus),
          updatedAt: new Date().toISOString(),
        }));
      }
      toast.success("Quote accepted successfully.");
      setRefreshTrigger((p: number) => p + 1);
    } catch (err: any) {
      console.error("Accept quote error:", err?.response?.data || err);
      toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to accept quote via API.");
    }
  };

  const handleGenerateRepairInvoice = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can generate repair invoices.");
      return;
    }
    if (isWarrantyServiceTicket(ticket)) {
      toast.error("Warranty tickets do not generate customer payment invoices.");
      return;
    }

    if (isCorporateParentTicket) {
      if (isInitialParentChildLoad) {
        toast.error("Still loading the child jobs attached to this parent job.");
        return;
      }

      if (!canSettleBulkRepairPayment) {
        toast.error(
          activeParentChildJobs.length === 0
            ? "Add the child jobs first before generating the parent repair invoice."
            : "Every active child job must be quote accepted or awaiting payment with a quotation before bulk repair invoice generation."
        );
        return;
      }
    }

    const baseAmount = isCorporateParentTicket ? bulkRepairAmount : readMoneyAmount(ticket.quotation);
    if (baseAmount <= 0) {
      toast.error("Repair quotation is not ready yet.");
      return;
    }

    const voucherApplied = Boolean(repairVoucherValidation?.validCode);
    const amount = voucherApplied ? repairVoucherValidation!.finalAmount : baseAmount;
    const voucherFields = voucherApplied
      ? {
          subtotal: baseAmount,
          voucherCode: repairVoucherValidation!.validCode!,
          voucherDiscount: repairVoucherValidation!.discountAmount,
        }
      : {};

    const existing = await getLatestInvoiceByTicketAndType(ticket.id, "repair_quote");
    const canReuseExisting =
      existing?.paymentMode === repairPaymentMode &&
      moneyAmountsMatch(existing?.amount, amount) &&
      (existing?.voucherCode ?? null) === (voucherApplied ? repairVoucherValidation!.validCode : null);
    const invoice =
      (canReuseExisting ? existing : null) ??
      (await createInvoice({
        ticketId: ticket.id,
        jobId: ticket.jobId,
        customerName: ticket.customer.name,
        customerPhone: ticket.customer.phone,
        customerEmail: ticket.customer.email,
        deviceLabel: isCorporateParentTicket
          ? `${activeParentChildJobs.length} Child Job${
              activeParentChildJobs.length === 1 ? "" : "s"
            }`
          : `${ticket.device.make} ${ticket.device.model}`.trim(),
        type: "repair_quote",
        description: isCorporateParentTicket
          ? `Bulk repair payment request for ${bulkChildJobLabel}`
          : "Repair quotation payment request",
        amount,
        paymentMode: repairPaymentMode,
        ...voucherFields,
      }));

    printInvoice(invoice, ticket, settings);
    setHasRepairQuoteInvoice(true);
    setRepairQuoteInvoiceKey(buildRepairQuoteInvoiceKey(ticket.id, repairPaymentMode, amount));
    setRepairQuoteInvoiceNumber(invoice.invoiceNumber);
    setLoadingRepairQuoteInvoice(false);
    toast.success("Invoice generated.");
  };

  const handleApplyRepairVoucher = async () => {
    if (!repairVoucherCode.trim()) {
      toast.error("Enter a voucher code.");
      return;
    }
    const baseAmount = isCorporateParentTicket ? bulkRepairAmount : readMoneyAmount(ticket?.quotation);

    setRepairVoucherValidation({
      loading: true,
      error: null,
      discountAmount: 0,
      finalAmount: baseAmount,
      isFullWaiver: false,
      validCode: null,
    });

    try {
      const response = await api.post(
        "/vouchers/validate/",
        {
          code: repairVoucherCode.trim().toUpperCase(),
          amount: String(baseAmount),
          payment_type: "repair_fee",
          job_id: Number(ticket?.id),
        },
        { showLoader: false }
      );

      const result = response?.data?.result;
      if (result) {
        const discountAmount = Number(result.discount_amount) || 0;
        const finalAmount = Number(result.final_amount) || 0;
        setRepairVoucherValidation({
          loading: false,
          error: null,
          discountAmount,
          finalAmount,
          isFullWaiver: Boolean(result.is_full_waiver),
          validCode: result.voucher_code,
        });
        toast.success(`Voucher applied! Discount: NGN ${discountAmount.toLocaleString()}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.fields?.voucher_code?.[0] ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Voucher validation failed.";
      setRepairVoucherValidation({
        loading: false,
        error: message,
        discountAmount: 0,
        finalAmount: baseAmount,
        isFullWaiver: false,
        validCode: null,
      });
      toast.error(message);
    }
  };

  const handleConfirmRepairPayment = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can confirm repair payment and generate invoices.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        // 1. Confirm payment
        const userStr = localStorage.getItem("user");
        let receivedById: number | undefined;
        if (userStr) {
          const parsed = JSON.parse(userStr);
          receivedById = parsed.id ?? parsed.user?.id;
        }

        const providerMap: Record<string, { provider: string; payment_method: string; bulkProvider: string }> = {
          cash: { provider: "manual_entry_cash", payment_method: "cash", bulkProvider: "manual" },
          pos: { provider: "manual_entry_card", payment_method: "card_pos", bulkProvider: "manual" },
          bank_transfer: { provider: "manual_entry_bank_transfer", payment_method: "bank_transfer", bulkProvider: "manual" },
        };
        const paymentConfig = providerMap[repairPaymentMode] ?? providerMap.cash;
        const baseRepairInvoiceAmount = isCorporateParentTicket
          ? bulkRepairAmount
          : readMoneyAmount(ticket.quotation);
        const expectedRepairInvoiceAmount = repairVoucherValidation?.validCode
          ? repairVoucherValidation.finalAmount
          : baseRepairInvoiceAmount;
        const expectedRepairInvoiceKey =
          baseRepairInvoiceAmount > 0
            ? buildRepairQuoteInvoiceKey(ticket.id, repairPaymentMode, expectedRepairInvoiceAmount)
            : null;
        const currentRepairInvoice = await getLatestInvoiceByTicketAndType(ticket.id, "repair_quote");
        const hasCurrentRepairInvoice =
          Boolean(expectedRepairInvoiceKey && repairQuoteInvoiceKey === expectedRepairInvoiceKey) ||
          (Boolean(currentRepairInvoice) &&
            currentRepairInvoice?.paymentMode === repairPaymentMode &&
            moneyAmountsMatch(currentRepairInvoice?.amount, expectedRepairInvoiceAmount));

        const repairFullWaiver = Boolean(repairVoucherValidation?.isFullWaiver && repairVoucherValidation?.validCode);
        if (expectedRepairInvoiceAmount > 0 && !hasCurrentRepairInvoice && !repairFullWaiver) {
          toast.error("Generate the repair invoice before confirming payment.");
          return;
        }

        if (isCorporateParentTicket) {
          if (isInitialParentChildLoad) {
            toast.error("Still loading the child jobs attached to this parent job.");
            return;
          }

          if (!canSettleBulkRepairPayment) {
            toast.error(
              activeParentChildJobs.length === 0
                ? "Add the child jobs first before collecting the parent repair payment."
                : "Every active child job must be quote accepted or awaiting payment with a quotation before bulk repair payment."
            );
            return;
          }

          await api.post(`/jobs/${ticket.id}/admin/create-and-settle-parent-payment/`, {
            payment: {
              type: "repair_fee",
              amount: bulkRepairAmount.toFixed(2),
              currency: "NGN",
              status: "succeeded",
              provider: paymentConfig.bulkProvider,
              payment_channel: "corporate",
              payment_method: paymentConfig.payment_method,
              provider_ref: `BULK-REPAIR-${ticket.jobId}-${Date.now()}`,
              is_manual_entry: true,
              ...(repairVoucherCode.trim() ? { voucher_code: repairVoucherCode.trim() } : {}),
            },
            note: `Bulk repair payment settled from ${ticket.jobId}`,
          });

          if (bulkRepairAmount > 0) {
            const voucherApplied = Boolean(repairVoucherValidation?.validCode);
            const settledAmount = voucherApplied
              ? repairVoucherValidation!.finalAmount
              : bulkRepairAmount;
            const invoice = await createInvoice({
              ticketId: ticket.id,
              jobId: ticket.jobId,
              customerName: ticket.customer.name,
              customerPhone: ticket.customer.phone,
              customerEmail: ticket.customer.email,
              deviceLabel: `${activeParentChildJobs.length} Child Job${
                activeParentChildJobs.length === 1 ? "" : "s"
              }`,
              type: "repair_payment",
              description: `Bulk repair payment for ${activeParentChildJobs.length} child job${
                activeParentChildJobs.length === 1 ? "" : "s"
              }`,
              amount: settledAmount,
              paymentMode: repairPaymentMode,
              ...(voucherApplied
                ? {
                    subtotal: bulkRepairAmount,
                    voucherCode: repairVoucherValidation!.validCode!,
                    voucherDiscount: repairVoucherValidation!.discountAmount,
                  }
                : {}),
            });
            printInvoice(invoice, ticket, settings);
          }

          toast.success(`Payment confirmed for ${ticket.jobId}.`);
          setRefreshTrigger((p) => p + 1);
          return;
        }

        await api.post("/payments/admin/", {
          job: Number(ticket.id),
          type: "repair_fee",
          currency: "NGN",
          status: "SUCCEEDED",
          provider: paymentConfig.provider,
          payment_channel: ticket.sourceChannel === "corporate" ? "corporate" : "walk_in",
          payment_method: paymentConfig.payment_method,
          received_by: receivedById,
          is_manual_entry: true,
          provider_ref: `${paymentConfig.provider.toUpperCase()}-${Date.now()}`,
          ...(repairVoucherCode.trim() ? { voucher_code: repairVoucherCode.trim() } : {}),
        });

        if (ticket.quotation && ticket.quotation > 0) {
          const voucherApplied = Boolean(repairVoucherValidation?.validCode);
          const settledAmount = voucherApplied
            ? repairVoucherValidation!.finalAmount
            : ticket.quotation;
          const invoice = await createInvoice({
            ticketId: ticket.id,
            jobId: ticket.jobId,
            customerName: ticket.customer.name,
            customerPhone: ticket.customer.phone,
            customerEmail: ticket.customer.email,
            deviceLabel: `${ticket.device.make} ${ticket.device.model}`.trim(),
            type: "repair_payment",
            description: "Repair payment",
            amount: settledAmount,
            paymentMode: repairPaymentMode,
            ...(voucherApplied
              ? {
                  subtotal: ticket.quotation,
                  voucherCode: repairVoucherValidation!.validCode!,
                  voucherDiscount: repairVoucherValidation!.discountAmount,
                }
              : {}),
          });
          printInvoice(invoice, ticket, settings);
        }

        toast.success(`Payment confirmed for ${ticket.jobId}.`);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        const errMessage = err?.response?.data?.error?.message || err?.response?.data?.message || "Failed to confirm payment.";
        toast.error(errMessage);
      }
      return;
    }

    const partRequests = getTicketPartRequests(ticket);
    const availabilityByPartId = new Map<string, boolean>();
    if (partRequests.length > 0) {
      const inv = await getInventory();
      partRequests.forEach((request) => {
        if (request.returnedDefectiveAt) return;
        const partIdx = inv.findIndex((item) => item.id === request.partId);
        if (partIdx === -1) return;
        const availableUnits = Math.max(0, inv[partIdx].quantity - inv[partIdx].locked);
        availabilityByPartId.set(request.partId, availableUnits > 0);
      });
    }
    const paymentReceivedAt = new Date().toISOString();
    const nextPartRequests = partRequests.map((request) =>
      request.returnedDefectiveAt
        ? request
        : {
            ...request,
            ...(availabilityByPartId.has(request.partId)
              ? { available: availabilityByPartId.get(request.partId) }
              : {}),
          }
    );

    const nextStatus = nextPartRequests.length > 0 ? "awaiting_parts_release" : "ready_for_repair";
    const updatedTicket = await updateTicketStatus(nextStatus, {
      repairPaymentMode,
      repairPaymentReceivedAt: paymentReceivedAt,
      ...buildTicketPartFields(nextPartRequests),
    }, {
      toastMessage:
        nextStatus === "awaiting_parts_release"
          ? `${ticket.jobId} payment confirmed. Waiting for inventory manager to release parts.`
          : `${ticket.jobId} payment confirmed. Ticket is ready for technician to start repair.`,
      clientUpdateTitle:
        nextStatus === "awaiting_parts_release"
          ? "Repair payment confirmed"
          : "Repair payment confirmed - ready for repair",
    });

    if (updatedTicket?.quotation && updatedTicket.quotation > 0) {
      const invoice = await createInvoice({
        ticketId: updatedTicket.id,
        jobId: updatedTicket.jobId,
        customerName: updatedTicket.customer.name,
        customerPhone: updatedTicket.customer.phone,
        customerEmail: updatedTicket.customer.email,
        deviceLabel: `${updatedTicket.device.make} ${updatedTicket.device.model}`.trim(),
        type: "repair_payment",
        description: "Repair payment",
        amount: updatedTicket.quotation,
        paymentMode: repairPaymentMode,
      });
      printInvoice(invoice, updatedTicket, settings);
    }
  };

  const handleConfirmPartReceived = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can confirm part receipt.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        const receipts = backendPartRequests
          .filter((req: any) => Boolean(req.approved_at) && !req.received_at)
          .map((req: any) => ({ id: Number(req.id) }));
        if (receipts.length === 0) {
          toast.error("No approved backend part requests are waiting for receipt confirmation.");
          return;
        }
        await api.post(`/jobs/${ticket.id}/technician/inventory/parts/receive/`, {
          receipts,
          notes: "Received parts confirmation",
        });
        toast.success(`${ticket.jobId} part receipt confirmed.`);
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message ||
            err?.response?.data?.error?.message ||
            "Failed to confirm part receipt via API."
        );
      }
      return;
    }

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

    await updateTicketStatus("ready_for_repair", {
      ...buildTicketPartFields(nextPartRequests),
      assignedEngineer: user?.name ?? ticket.assignedEngineer,
    }, {
      toastMessage: `${ticket.jobId} part receipt confirmed.`,
      clientUpdateTitle: "Parts received by technician",
    });
  };

  const handleStartRepair = async () => {
    if (!ticket) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can start repair.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/repair/start/`);
        toast.success(`${ticket.jobId} repair started.`);
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to start repair via API.");
      }
      return;
    }

    const partRequests = getTicketPartRequests(ticket);
    const unresolvedParts = partRequests.filter((request) => !isPartReadyForRepair(request));

    if (unresolvedParts.length > 0) {
      toast.error("Technician must confirm every released part has been received before repair can start.");
      return;
    }

    await updateTicketStatus("repairing", {
      assignedEngineer: user?.name ?? ticket.assignedEngineer,
    }, {
      toastMessage: `${ticket.jobId} repair started.`,
      clientUpdateTitle: "Repair started",
    });
  };

  const handleLogDefectivePartReturn = async () => {
    if (!ticket) return;

    const partRequests = getTicketPartRequests(ticket);
    const returnablePartRequests = partRequests.filter(
      (request) => (request.receivedAt || request.replacementReceivedAt) && !request.returnedDefectiveAt
    );

    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can log defective part returns.");
      return;
    }

    const reason = defectiveReturnReason.trim();
    if (!reason) {
      toast.error("Add a reason for the defective return.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      if (backendReturnableInventoryRequests.length === 0) {
        toast.error("No received part is linked to this ticket.");
        return;
      }

      const targetPartId = defectivePartId || String(backendReturnableInventoryRequests[0]?.id ?? "");
      if (!targetPartId) {
        toast.error("Select the part to return.");
        return;
      }

      const matchingBackendRequest = backendPartRequests.find((request: any) => {
        if (String(request.id) === targetPartId) {
          return true;
        }
        const catalogItem = findCatalogItem(
          inventory,
          targetPartId,
          request.product_id,
          request.sku,
          request.part_name,
          request.name
        );
        return (
          normalizeInventoryValue(request.product_id) === normalizeInventoryValue(targetPartId) ||
          normalizeInventoryValue(request.sku) === normalizeInventoryValue(targetPartId) ||
          normalizeInventoryValue(request.part_name) === normalizeInventoryValue(targetPartId) ||
          normalizeInventoryValue(request.name) === normalizeInventoryValue(targetPartId) ||
          Boolean(catalogItem)
        );
      });

      if (!matchingBackendRequest?.id) {
        toast.error("Could not match this part to a backend inventory request.");
        return;
      }

      try {
        await api.post(`/jobs/${ticket.id}/technician/inventory/parts/return/`, {
          part_request_id: Number(matchingBackendRequest.id),
          qty: 1,
          reason,
          re_request_qty: 1,
        });
        setDefectiveReturnReason("");
        toast.success("Defective part logged. Waiting for inventory manager confirmation.");
        setRefreshTrigger((p: number) => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to return defective part via API.");
      }
      return;
    }

    if (returnablePartRequests.length === 0) {
      toast.error("No received part is linked to this ticket.");
      return;
    }

    const targetPartId = defectivePartId || returnablePartRequests[0]?.partId;
    if (!targetPartId) {
      toast.error("Select the part to return.");
      return;
    }

    const now = new Date().toISOString();
    const nextPartRequests = partRequests.map((request) =>
      request.partId === targetPartId
        ? {
            ...request,
            available: false,
            returnedDefectiveAt: now,
            returnedDefectiveReason: reason,
            defectiveReturnReceivedAt: undefined,
            replacementReleasedAt: undefined,
            replacementReceivedAt: undefined,
          }
        : request
    );
    setDefectiveReturnReason("");
    const returnedPartName = getInventoryPartName(targetPartId, inventory);

    await updateTicketStatus("awaiting_parts_release", {
      ...buildTicketPartFields(nextPartRequests),
    }, {
      toastMessage: "Defective part logged. Waiting for inventory manager confirmation.",
      clientUpdateTitle: "Defective part reported",
      clientUpdateDetails: [
        `Part: ${returnedPartName}`,
        `Reason: ${reason}`,
        "Inventory manager will confirm receipt and release a replacement part.",
      ],
    });
  };

  const handleCompleteRepair = async () => {
    const isBackendJob = !isNaN(Number(ticket?.id));
    if (isBackendJob) {
      if (completionMediaFiles.length === 0) {
        toast.error("Attach at least one after-repair image before completing repair.");
        return;
      }
      try {
        const formData = new FormData();
        formData.append("submit_for_qc", "true");
        completionMediaFiles.forEach((file, index) => {
          formData.append(`media[${index}][kind]`, "repair");
          formData.append(`media[${index}][caption]`, index === 0 ? "after-repair" : `after-repair-${index + 1}`);
          formData.append(`media[${index}][file]`, file);
        });
        await api.post(`/jobs/${ticket!.id}/repair/complete/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success(`${ticket!.jobId} repair completed and submitted for QC.`);
        setCompletionMediaFiles([]);
        setCompletionMediaPreviews([]);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to complete repair via API.");
      }
      return;
    }
    await updateTicketStatus("quality_check");
  };

  const handleQAPass = async () => {
    if (user?.role !== "qa" && user?.role !== "admin") {
      toast.error("Only QA or admin can complete QA review.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket?.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket!.id}/lead-engineer/approve-qc/`, {
          ready_for_collection: true,
          notes: qaNotes.trim() || "Device repaired successfully. All tests passed.",
        });
        toast.success(`${ticket!.jobId} passed QA and is ready for handover.`);
        setRefreshTrigger((p) => p + 1);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to approve QA via API."
        );
      }
      return;
    }

    const ticketPartRequests = ticket ? getTicketPartRequests(ticket) : [];
    if (ticketPartRequests.length > 0) {
      const inv = await getInventory();
      ticketPartRequests.forEach((request) => {
        if (!shouldConsumePartOnCompletion(request)) return;
        const partIdx = inv.findIndex((item) => item.id === request.partId);
        if (partIdx === -1) return;
        inv[partIdx] = {
          ...inv[partIdx],
          locked: Math.max(0, inv[partIdx].locked - 1),
          quantity: Math.max(0, inv[partIdx].quantity - 1),
        };
      });
      await saveInventory(inv);
      setInventory(inv);
    }

    await updateTicketStatus("ready_for_handover", {
      qaNotes: qaNotes.trim() || ticket?.qaNotes,
      qaCheckedBy: user?.name,
      qaLastCheckedAt: new Date().toISOString(),
      handedOverAt: undefined,
      handedOverBy: undefined,
    }, {
      toastMessage: `${ticket.jobId} passed QA and is ready for front desk handover.`,
      clientUpdateTitle: "QA passed - ready for handover",
    });
  };

  const handleQAFail = async () => {
    if (user?.role !== "qa" && user?.role !== "admin") {
      toast.error("Only QA or admin can send devices back to technician.");
      return;
    }

    const note = qaNotes.trim();
    if (!note) {
      toast.error("Add QA notes before sending this device back to technician.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket?.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket!.id}/lead-engineer/reject-qc/`, {
          notes: note,
        });
        toast.success(`${ticket!.jobId} sent back to technician.`);
        setRefreshTrigger((p) => p + 1);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.response?.data?.error?.message || "Failed to reject QA via API."
        );
      }
      return;
    }

    await updateTicketStatus("repairing", {
      qaNotes: note,
      qaCheckedBy: user?.name,
      qaLastCheckedAt: new Date().toISOString(),
    });
  };

  const handleWarrantyVoid = async () => {
    if (!ticket) return;
    const canVoid =
      user?.role === "engineer" ||
      user?.role === "admin" ||
      user?.role === "front_desk";
    if (!canVoid) {
      toast.error("You don't have permission to invalidate this warranty claim.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        const validationResponse = await api.post(`/jobs/${ticket.id}/admin/warranty/validate/`, {
          validation_source: "manual",
          manufacturer_warranty_valid: false,
          notes: warrantyVoidReason || "Warranty invalidated by front desk",
          persist: true,
        });
        const revertedJob =
          validationResponse?.data?.result?.job ??
          validationResponse?.data?.result ??
          null;
        const revertedStatus = String(revertedJob?.status || "").trim().toLowerCase();
        if (revertedStatus === "registered") {
          try {
            await api.post(`/jobs/${ticket.id}/admin/assign-manual/`, {});
          } catch (assignErr) {
            console.warn("Auto-assignment after warranty invalidation failed", assignErr);
          }
        }
        toast.success(`${ticket.jobId} warranty invalidated. Job reverted to normal repair flow.`);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          "Failed to invalidate warranty via API."
        );
      }
      return;
    }

    await updateTicketStatus("warranty_void", { warrantyVoidReason }, {
      toastMessage: `${ticket.jobId} warranty voided.`,
      clientUpdateTitle: "Warranty voided",
      clientUpdateDetails: [
        warrantyVoidReason,
        "A new repair ticket must be created if the customer wants a paid repair.",
      ],
    });
  };

  const handleCancelWarrantyBooking = async () => {
    if (!ticket || !warrantyVoidDiagnosisReason.trim()) return;
    if (user?.role !== "engineer" && user?.role !== "admin") {
      toast.error("Only technicians or admin can cancel this booking.");
      return;
    }
    setIsCancellingWarranty(true);
    const reason = warrantyVoidDiagnosisReason.trim();
    try {
      await api.post(`/jobs/${ticket.id}/assessment/`, {
        preliminary_diagnosis: reason,
      });
      // The same diagnosis doubles as the cancellation reason — the backend
      // requires a non-blank note on every cancel.
      await api.post(`/jobs/${ticket.id}/status/update/`, {
        status: "cancelled",
        note: `Warranty voided after diagnosis: ${reason}`.slice(0, 500),
      });
      toast.success(`${ticket.jobId} booking cancelled.`);
      setRefreshTrigger((p: number) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to cancel booking.");
    } finally {
      setIsCancellingWarranty(false);
    }
  };

  const handleWarrantyValid = async () => {
    if (!ticket) return;
    const canValidateWarranty =
      user?.role === "engineer" ||
      user?.role === "admin" ||
      user?.role === "front_desk";
    if (!canValidateWarranty) {
      toast.error("You don't have permission to validate warranty claims.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        const response = await api.post(`/jobs/${ticket.id}/admin/warranty/validate/`, {
          validation_source: ticket.intakeType === "repeat_return" ? "system" : "manual",
          ...(ticket.intakeType === "warranty" ? { manufacturer_warranty_valid: true } : {}),
          notes: ticket.intakeType === "repeat_return" ? "Repeat case validated via system" : "Approved by technician review",
          persist: true,
        });

        const validationResult =
          response?.data?.result?.validation ??
          response?.data?.result?.job?.validation ??
          null;
        const validated = validationResult?.is_valid;
        const nextJob = response?.data?.result?.job ?? response?.data?.result ?? null;
        const nextStatus = nextJob?.status;

        if (ticket.intakeType === "repeat_return" && validated === true) {
          try {
            await api.post(`/jobs/${ticket.id}/admin/assign-manual/`, {});
          } catch (assignErr) {
            console.error("Failed to auto-assign technician after repeat case validation", assignErr);
          }
          toast.success(`${ticket.jobId} repeat return validated. Repair can continue under warranty.`);
        } else if (ticket.intakeType === "repeat_return" && validated === false) {
          toast.success(
            nextStatus === "awaiting_diagnosis_fee"
              ? `${ticket.jobId} is not covered by repeat warranty. Continue with the normal paid repair flow or cancel the booking.`
              : `${ticket.jobId} repeat warranty check failed.`
          );
        } else {
          try {
            await api.post(`/jobs/${ticket.id}/admin/assign-manual/`, {});
          } catch (assignErr) {
            console.error("Failed to auto-assign technician after warranty validation", assignErr);
          }
          toast.success(`${ticket.jobId} warranty validated.`);
        }
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to validate warranty via API.");
      }
      return;
    }

    await updateTicketStatus("diagnosing", {}, {
      toastMessage: `${ticket.jobId} approved for warranty repair.`,
      clientUpdateTitle: "Warranty approved for repair",
      clientUpdateDetails: ["No customer payment is required for this warranty repair."],
    });
  };

  const handleRepeatCaseCancel = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can cancel this booking.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/status/update/`, {
          status: "cancelled",
          note: "Cancelled during repeat case validation",
        });
        toast.success(`${ticket.jobId} cancelled.`);
        setRefreshTrigger((p) => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to cancel booking via API.");
      }
      return;
    }

    await updateTicketStatus("cancelled", {
      cancellationReason: "Cancelled during repeat case validation",
    }, {
      toastMessage: `${ticket.jobId} cancelled.`,
      clientUpdateTitle: "Repair cancelled",
    });
  };

  const handleConfirmCustomerHandover = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can confirm customer handover.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        await api.post(`/jobs/${ticket.id}/status/update/`, { status: "delivered" });
        toast.success(`${ticket.jobId} handed back to the customer.`);
        setRefreshTrigger(p => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to mark as delivered via API.");
      }
      return;
    }

    await updateTicketStatus("completed", {
      handedOverAt: new Date().toISOString(),
      handedOverBy: user?.name ?? ticket.handedOverBy,
    }, {
      toastMessage: `${ticket.jobId} handed back to the customer.`,
      clientUpdateTitle: "Device handed back to customer",
    });
  };

  const handleApplyDiagnosisVoucher = async () => {
    if (!diagnosisVoucherCode.trim()) {
      toast.error("Enter a voucher code.");
      return;
    }
    const baseAmount = isCorporateParentTicket ? bulkDiagnosisAmount : Number(ticket?.diagnosisFee || 0);

    setDiagnosisVoucherValidation({
      loading: true,
      error: null,
      discountAmount: 0,
      finalAmount: baseAmount,
      isFullWaiver: false,
      validCode: null,
    });

    try {
      const response = await api.post(
        "/vouchers/validate/",
        {
          code: diagnosisVoucherCode.trim().toUpperCase(),
          amount: String(baseAmount),
          payment_type: "diagnosis_fee",
          job_id: Number(ticket?.id),
        },
        { showLoader: false }
      );

      const result = response?.data?.result;
      if (result) {
        const discountAmount = Number(result.discount_amount) || 0;
        const finalAmount = Number(result.final_amount) || 0;
        setDiagnosisVoucherValidation({
          loading: false,
          error: null,
          discountAmount,
          finalAmount,
          isFullWaiver: Boolean(result.is_full_waiver),
          validCode: result.voucher_code,
        });
        toast.success(`Voucher applied! Discount: NGN ${discountAmount.toLocaleString()}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.fields?.voucher_code?.[0] ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Voucher validation failed.";
      setDiagnosisVoucherValidation({
        loading: false,
        error: message,
        discountAmount: 0,
        finalAmount: baseAmount,
        isFullWaiver: false,
        validCode: null,
      });
      toast.error(message);
    }
  };

  const handleConfirmDiagnosisFee = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can confirm diagnosis payment.");
      return;
    }

    const isBackendJob = !isNaN(Number(ticket.id));
    if (isBackendJob) {
      try {
        const providerMap: Record<string, { provider: string; payment_method: string; bulkProvider: string }> = {
          cash: { provider: "manual_entry_cash", payment_method: "cash", bulkProvider: "manual" },
          pos: { provider: "manual_entry_card", payment_method: "card_pos", bulkProvider: "manual" },
          bank_transfer: { provider: "manual_entry_bank_transfer", payment_method: "bank_transfer", bulkProvider: "manual" },
        };
        const paymentConfig = providerMap[diagnosisPaymentMode] ?? providerMap.cash;
        if (isCorporateParentTicket) {
          if (isInitialParentChildLoad) {
            toast.error("Still loading the child jobs attached to this parent job.");
            return;
          }

          if (!canSettleBulkDiagnosisPayment) {
            toast.error(
              activeParentChildJobs.length === 0
                ? "Add the child jobs first before collecting the parent diagnosis payment."
                : "Every active child job must be awaiting diagnosis fee before bulk diagnosis payment."
            );
            return;
          }

          await api.post(`/jobs/${ticket.id}/admin/create-and-settle-parent-payment/`, {
            payment: {
              type: "diagnosis_fee",
              amount: bulkDiagnosisAmount.toFixed(2),
              currency: "NGN",
              status: "succeeded",
              provider: paymentConfig.bulkProvider,
              payment_channel: "corporate",
              payment_method: paymentConfig.payment_method,
              provider_ref: `BULK-DIAG-${ticket.jobId}-${Date.now()}`,
              is_manual_entry: true,
              ...(diagnosisVoucherCode.trim() ? { voucher_code: diagnosisVoucherCode.trim() } : {}),
            },
            note: `Bulk diagnosis payment settled from ${ticket.jobId}`,
          });

          toast.success(
            `Diagnosis payment confirmed for ${ticket.jobId}. ${activeParentChildJobs.length} child job${
              activeParentChildJobs.length === 1 ? "" : "s"
            } pushed to diagnosis!`
          );
          setRefreshTrigger((p) => p + 1);
          return;
        }

        await api.post("/payments/admin/", {
          job: Number(ticket.id),
          type: "diagnosis_fee",
          currency: "NGN",
          status: "SUCCEEDED",
          provider: paymentConfig.provider,
          payment_channel: ticket.sourceChannel === "corporate" ? "corporate" : "walk_in",
          payment_method: paymentConfig.payment_method,
          is_manual_entry: true,
          provider_ref: `${paymentConfig.provider.toUpperCase()}-${Date.now()}`,
          ...(diagnosisVoucherCode.trim() ? { voucher_code: diagnosisVoucherCode.trim() } : {}),
        });

        toast.success(`Diagnosis payment confirmed for ${ticket.jobId}. Ticket pushed to diagnosis!`);
        setRefreshTrigger((p) => p + 1);
      } catch (err: any) {
        toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || "Failed to confirm payment via API.");
      }
      return;
    }

    await updateTicketStatus("diagnosing", {
      diagnosisPaymentMode,
      diagnosisPaymentReceivedAt: new Date().toISOString(),
    });
  };

  const handleGenerateInvoiceAnytime = async () => {
    if (!ticket) return;
    if (user?.role !== "front_desk" && user?.role !== "admin") {
      toast.error("Only front desk or admin can generate invoices.");
      return;
    }
    if (isWarrantyServiceTicket(ticket)) {
      toast.error("Warranty tickets do not generate customer payment invoices.");
      return;
    }

    let invoiceType: InvoiceType;
    let amount: number;
    let description: string;
    let paymentMode: PaymentMode;

    if (ticket.quotation && ticket.quotation > 0 && ticket.diagnosis) {
      invoiceType = "repair_quote";
      amount = ticket.quotation;
      description = "Repair quotation payment request";
      paymentMode = (ticket.status === "awaiting_repair_payment" || ticket.status === "awaiting_payment" || ticket.status === "quote_accepted") ? repairPaymentMode : ticket.repairPaymentMode;
    } else if (isCorporateParentTicket && showBulkRepairPaymentSection && bulkRepairAmount > 0) {
      if (isInitialParentChildLoad) {
        toast.error("Still loading the child jobs attached to this parent job.");
        return;
      }
      if (!canSettleBulkRepairPayment) {
        toast.error(
          activeParentChildJobs.length === 0
            ? "Add the child jobs first before generating the parent repair invoice."
            : "Every active child job must be quote accepted or awaiting payment with a quotation before generating the parent repair invoice."
        );
        return;
      }
      invoiceType = "repair_quote";
      amount = bulkRepairAmount;
      description = `Bulk repair payment request for ${bulkChildJobLabel}`;
      paymentMode = repairPaymentMode;
    } else {
      if (isCorporateParentTicket) {
        if (isInitialParentChildLoad) {
          toast.error("Still loading the child jobs attached to this parent job.");
          return;
        }
        if (!canSettleBulkDiagnosisPayment) {
          toast.error(
            activeParentChildJobs.length === 0
              ? "Add the child jobs first before generating the parent diagnosis invoice."
              : "Every active child job must be awaiting diagnosis fee before generating the parent diagnosis invoice."
          );
          return;
        }
      }
      invoiceType = "diagnosis_fee";
      amount = isCorporateParentTicket ? bulkDiagnosisAmount : ticket.diagnosisFee;
      description = isCorporateParentTicket
        ? `Bulk diagnosis fee payment for ${bulkChildJobLabel}`
        : "Diagnosis fee payment";
      paymentMode = ticket.status === "awaiting_diagnosis_payment" ? diagnosisPaymentMode : ticket.diagnosisPaymentMode;
    }

    const subtotal = amount;
    let voucherFields: { subtotal?: number; voucherCode?: string; voucherDiscount?: number } = {};
    if (invoiceType === "repair_quote" && repairVoucherValidation?.validCode) {
      amount = repairVoucherValidation.finalAmount;
      voucherFields = {
        subtotal,
        voucherCode: repairVoucherValidation.validCode,
        voucherDiscount: repairVoucherValidation.discountAmount,
      };
    } else if (invoiceType === "diagnosis_fee" && diagnosisVoucherValidation?.validCode) {
      amount = diagnosisVoucherValidation.finalAmount;
      voucherFields = {
        subtotal,
        voucherCode: diagnosisVoucherValidation.validCode,
        voucherDiscount: diagnosisVoucherValidation.discountAmount,
      };
    }

    const existing = await getLatestInvoiceByTicketAndType(ticket.id, invoiceType);
    const canReuseExisting =
      existing?.paymentMode === paymentMode &&
      Number(existing?.amount ?? 0) === Number(amount) &&
      (existing?.voucherCode ?? null) === (voucherFields.voucherCode ?? null);
    const invoice =
      (canReuseExisting ? existing : null) ??
      (await createInvoice({
        ticketId: ticket.id,
        jobId: ticket.jobId,
        customerName: ticket.customer.name,
        customerPhone: ticket.customer.phone,
        customerEmail: ticket.customer.email,
        deviceLabel: isCorporateParentTicket
          ? `${activeParentChildJobs.length} Child Job${
              activeParentChildJobs.length === 1 ? "" : "s"
            }`
          : `${ticket.device.make} ${ticket.device.model}`.trim(),
        type: invoiceType,
        description,
        amount,
        paymentMode,
        ...voucherFields,
      }));

    printInvoice(invoice, ticket, settings);
    if (invoiceType === "repair_quote") {
      setHasRepairQuoteInvoice(true);
      setRepairQuoteInvoiceKey(buildRepairQuoteInvoiceKey(ticket.id, paymentMode, amount));
      setRepairQuoteInvoiceNumber(invoice.invoiceNumber);
      setLoadingRepairQuoteInvoice(false);
    } else if (invoiceType === "diagnosis_fee") {
      setHasGeneratedDiagnosisInvoice(true);
    }
    toast.success("Invoice generated.");
  };

  const handleReleaseRequestedPart = async (
    partRecordId: string,
    partId: string,
    sku: string,
    requestedQty = 1,
    partName?: string
  ) => {
    if (!ticket) return;
    setReleasingKey(partRecordId);

    try {
      const jobId = ticket.id;
      const catalogItem = findCatalogItem(inventory, partId, sku, partName);
      const payloadSku = catalogItem
        ? String(catalogItem.sku ?? "").trim()
        : String(sku ?? "").trim();
      const payloadName = partName || catalogItem?.name || sku || partId;
      const qty = Math.max(1, Number(requestedQty || 1));
      if (!payloadSku) {
        toast.error(`Cannot release ${payloadName}: this catalog item has no SKU in Odoo, so the inventory API cannot reserve or allocate it by SKU.`);
        return;
      }
      
      const actionPayload = { parts: [{ sku: payloadSku, qty, name: payloadName }] };
      const approveRes = await api.post(`/jobs/${jobId}/admin/inventory/parts/approve/`, {
        approvals: [{ id: Number(partRecordId) }],
        notes: "Approved from ticket detail view"
      });
      if (!approveRes.data?.success) throw new Error(approveRes.data?.message || "Approve failed");

      const reserveRes = await api.post(`/jobs/${jobId}/admin/inventory/reserve/`, actionPayload);
      if (!reserveRes.data?.success) throw new Error(reserveRes.data?.message || "Reserve failed");
      const allocateRes = await api.post(`/jobs/${jobId}/admin/inventory/allocate/`, actionPayload);
      if (!allocateRes.data?.success) throw new Error(allocateRes.data?.message || "Allocate failed");

      toast.success("Part released successfully");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      toast.error(err.message || "Failed to release part.");
    } finally {
      setReleasingKey(null);
    }
  };

  const handleOpenAgreement = () => {
    if (user?.role === "engineer") {
      toast.error("Technicians cannot view signed agreements.");
      return;
    }

    if (!ticket?.agreement) {
      toast.error("No signed agreement found for this ticket.");
      return;
    }

    openAgreementDocument({
      agreementId: ticket.agreement.id,
      acceptedAt: ticket.agreement.acceptedAt,
      customerName: ticket.agreement.customerName,
      customerPhone: ticket.agreement.customerPhone,
      customerEmail: ticket.agreement.customerEmail,
      organizationName: ticket.organizationName,
      deviceLabel: `${DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} - ${ticket.device.make} ${ticket.device.model}`.trim(),
      deviceIdentifier: ticket.device.imei,
      issueReported: ticket.issueReported ?? "",
      deviceTypeLabel: DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"],
      deviceMake: ticket.device.make,
      deviceModel: ticket.device.model,
      termsText: ticket.agreement.termsSnapshot,
      signatureDataUrl: ticket.agreement.signatureDataUrl,
      businessName: settings.businessName,
      storeLocation: ticket.agreement.storeLocation,
      jobId: ticket.jobId,
    });
  };

  const handleSendAgreement = () => {
    if (user?.role === "engineer") {
      toast.error("Technicians cannot view signed agreements.");
      return;
    }

    if (!ticket?.agreement) {
      toast.error("No signed agreement found for this ticket.");
      return;
    }

    if (!ticket.customer.email) {
      toast.error("Customer email is not available.");
      return;
    }

    sendAgreementEmail({
      agreementId: ticket.agreement.id,
      acceptedAt: ticket.agreement.acceptedAt,
      customerName: ticket.agreement.customerName,
      customerPhone: ticket.agreement.customerPhone,
      customerEmail: ticket.agreement.customerEmail,
      organizationName: ticket.organizationName,
      deviceLabel: `${DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} - ${ticket.device.make} ${ticket.device.model}`.trim(),
      deviceIdentifier: ticket.device.imei,
      issueReported: ticket.issueReported ?? "",
      deviceTypeLabel: DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"],
      deviceMake: ticket.device.make,
      deviceModel: ticket.device.model,
      termsText: ticket.agreement.termsSnapshot,
      signatureDataUrl: ticket.agreement.signatureDataUrl,
      businessName: settings.businessName,
      storeLocation: ticket.agreement.storeLocation,
      jobId: ticket.jobId,
    });
    toast.success("Email draft opened. Attach the downloaded agreement file.");
  };

  const handleOpenJobCard = () => {
    if (user?.role === "engineer") {
      toast.error("Technicians cannot view customer job cards.");
      return;
    }

    openJobCardDocument({
      agreementId: ticket.agreement?.id ?? `JOB-CARD-${ticket.jobId}`,
      acceptedAt: ticket.agreement?.acceptedAt ?? ticket.createdAt,
      customerName: ticket.agreement?.customerName ?? ticket.customer.name,
      customerPhone: ticket.agreement?.customerPhone ?? ticket.customer.phone,
      customerEmail: ticket.agreement?.customerEmail ?? ticket.customer.email,
      organizationName: ticket.organizationName,
      deviceLabel: `${DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]} - ${ticket.device.make} ${ticket.device.model}`.trim(),
      deviceIdentifier: ticket.device.imei,
      issueReported: ticket.issueReported ?? "",
      deviceTypeLabel: DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"],
      deviceMake: ticket.device.make,
      deviceModel: ticket.device.model,
      frontDeskAgent: user?.name,
      termsText: ticket.agreement?.termsSnapshot ?? settings.termsAndConditions,
      businessName: settings.businessName,
      storeLocation: ticket.agreement?.storeLocation ?? user?.storeLocation,
      jobId: ticket.jobId,
    });
  };

  if (loadingTicket) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Loading ticket details...</p>
      </div>
    );
  }

  if (!ticket) {
    return <div className="text-center py-20 text-muted-foreground">Ticket not found.</div>;
  }

  const handleCompletionMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setCompletionMediaFiles(files);
    setCompletionMediaPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const ticketPartRequests = getTicketPartRequests(ticket);
  const filteredInventory = inventory.filter((item) => {
    const query = inventorySearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.category].join(" ").toLowerCase().includes(query);
  });
  const isBackendJob = !isNaN(Number(ticket.id));
  const isCorporateParentTicket =
    isBackendJob && ticket.jobGroupType === "parent" && ticket.sourceChannel === "corporate";
  const activeParentChildJobs = isCorporateParentTicket
    ? parentChildJobs.filter((childJob) => normalizeBackendStatus(childJob.status) !== "cancelled")
    : [];
  const bulkDiagnosisReadyChildJobs = activeParentChildJobs.filter((childJob) =>
    BULK_DIAGNOSIS_READY_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.status))
  );
  const bulkRepairReadyChildJobs = activeParentChildJobs.filter((childJob) =>
    BULK_REPAIR_READY_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.status))
  );
  const bulkRepairVisibleChildJobs = activeParentChildJobs.filter((childJob) =>
    BULK_REPAIR_VISIBLE_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.status))
  );
  const bulkDiagnosisAmount = activeParentChildJobs.length * settings.diagnosisFee;
  const bulkRepairAmount = activeParentChildJobs.reduce(
    (sum, childJob) => sum + readMoneyAmount(childJob.service_quote_amount),
    0
  );
  const canSettleBulkDiagnosisPayment =
    isCorporateParentTicket &&
    activeParentChildJobs.length > 0 &&
    bulkDiagnosisReadyChildJobs.length === activeParentChildJobs.length;
  const canSettleBulkRepairPayment =
    isCorporateParentTicket &&
    activeParentChildJobs.length > 0 &&
    bulkRepairReadyChildJobs.length === activeParentChildJobs.length &&
    activeParentChildJobs.every((childJob) => readMoneyAmount(childJob.service_quote_amount) > 0);
  const showBulkRepairPaymentSection =
    isCorporateParentTicket && bulkRepairVisibleChildJobs.length > 0;
  const repairQuoteInvoiceIsCurrent =
    Boolean(trackedRepairInvoiceKey) && repairQuoteInvoiceKey === trackedRepairInvoiceKey;
  const showRepairPaymentSection =
    ticket.status === "awaiting_repair_payment" ||
    ticket.status === "awaiting_payment" ||
    (ticket.status === "quote_accepted" && !isWarrantyServiceTicket(ticket)) ||
    (isCorporateParentTicket && showBulkRepairPaymentSection);
  const isInitialParentChildLoad =
    isCorporateParentTicket && loadingParentChildJobs && !parentChildJobsLoadedOnce;
  const bulkChildJobLabel = `${activeParentChildJobs.length} child job${
    activeParentChildJobs.length === 1 ? "" : "s"
  }`;
  const selectedCatalogService = backendServiceOptions.find(
    (service: any) => String(service.id) === selectedCatalogServiceId
  );
  const selectedPartsRepairCost = noPartsRequired
    ? isBackendJob
      ? Number(selectedCatalogService?.base_price ?? 0)
      : getSelectedServicesRepairCost(selectedServices)
    : uniquePartIds(selectedPartIds).reduce((sum, partId) => {
        const item = inventory.find((entry) => entry.id === partId);
        return sum + (item?.price ?? 0);
      }, 0);
  const selectedServiceLabels = (ticket.serviceSelections ?? []).map((service) => SERVICE_OPTION_LABELS[service]);
  const ticketParts = ticketPartRequests.map((request) => ({
    ...request,
    name: getInventoryPartName(request.partId, inventory, request.partName),
    availableUnits: getInventoryAvailableUnits(request.partId, inventory),
  }));
  const backendInventoryRequests = backendPartRequests.map((request: any) => {
    const catalogItem = findCatalogItem(
      inventory,
      request.product_id,
      request.sku,
      request.part_name,
      request.name
    );
    const resolvedSku = catalogItem
      ? String(catalogItem.sku ?? "").trim()
      : String(request.sku ?? "").trim();
    return {
      ...request,
      displayName:
        request.part_name || request.name || catalogItem?.name || request.sku || `Part Request ${request.id}`,
      availableUnits: catalogItem ? Math.max(0, catalogItem.quantity - catalogItem.locked) : 0,
      resolvedSku,
      missingCatalogSku: Boolean(catalogItem) && !resolvedSku,
    };
  });
  const hasBackendInventoryRequests = isBackendJob && backendInventoryRequests.length > 0;
  const pendingBackendInventoryRequests = backendInventoryRequests.filter(
    (request: any) => request.status === "requested" || !request.approved_at
  );
  const backendAwaitingTechnicianReceiptRequests = backendInventoryRequests.filter(
    (request: any) => Boolean(request.approved_at) && !request.received_at && !request.returned_at
  );
  const backendReceivedInventoryRequests = backendInventoryRequests.filter(
    (request: any) => Boolean(request.received_at) && !request.returned_at
  );
  const backendReturnableInventoryRequests = backendReceivedInventoryRequests.filter(
    (request: any) => Number(request.received_qty || 0) > Number(request.returned_qty || 0)
  );
  const requestedPartIds = ticketPartRequests
    .filter((request) => request.requestedAt)
    .map((request) => request.partId);
  const unavailableTicketParts = ticketParts.filter((request) => request.available === false);
  const selectedUnavailableTicketParts = ticketParts.filter(
    (request) => selectedPartIds.includes(request.partId) && request.available === false
  );
  const unreleasedTicketParts = ticketParts.filter(
    (request) => !isPartReadyForRepair(request) && !isAwaitingTechnicianPartConfirmation(request)
  );
  const pendingSelectedPartCount = uniquePartIds(selectedPartIds).filter(
    (partId) => !requestedPartIds.includes(partId)
  ).length;
  const returnableTicketParts = ticketParts.filter(
    (request) => (request.receivedAt || request.replacementReceivedAt) && !request.returnedDefectiveAt
  );
  const defectiveReturnedParts = ticketParts.filter((request) => request.returnedDefectiveAt);
  const awaitingDefectiveReturnReceiptParts = ticketParts.filter((request) =>
    isAwaitingDefectiveReturnReceipt(request)
  );
  const awaitingReplacementReleaseParts = ticketParts.filter((request) =>
    isAwaitingReplacementRelease(request)
  );
  const awaitingTechnicianConfirmationParts = ticketParts.filter((request) =>
    isAwaitingTechnicianPartConfirmation(request)
  );
  const isWarrantyTicket = isWarrantyServiceTicket(ticket);
  const canEditDiagnosisActions = user?.role === "engineer" || user?.role === "admin";
  const canReviewWarranty = user?.role === "engineer" || user?.role === "admin";
  const canViewSignedAgreement = user?.role === "front_desk" || user?.role === "admin";
  const canGenerateInvoice = (user?.role === "front_desk" || user?.role === "admin") && !isWarrantyTicket;
  const canManagePayments = user?.role === "front_desk";
  const canConfirmHandover = user?.role === "front_desk" || user?.role === "admin";
  const canReleaseParts = user?.role === "inventory_manager" || user?.role === "admin";
  const canStartRepair = user?.role === "engineer" || user?.role === "admin";
  const canLogDefectivePartReturn = user?.role === "engineer" || user?.role === "admin";
  const canRunQA = user?.role === "qa" || user?.role === "admin";
  const isPreDiagnosisPaymentStatus = [
    "awaiting_diagnosis_payment",
    "intake",
    "awaiting_reassignment",
    "awaiting_assignment",
  ].includes(ticket.status);

  let effectiveStatus = ticket.status;

  if (isBackendJob) {
    const isRepairOrLaterStatus = [
      "repairing",
      "repair_in_progress",
      "repaired",
      "quality_check",
      "submitted_for_qc_review",
      "ready_for_handover",
      "qc_passed",
      "ready_for_collection",
      "completed",
      "delivered",
      "closed",
      "cancelled",
    ].includes(effectiveStatus);

    if (!isRepairOrLaterStatus) {
      const isPostDiagnosisStatus = [
        "payment_confirmed",
        "quote_accepted",
        "awaiting_parts_release",
        "ready_for_repair",
      ].includes(effectiveStatus);

      if (isPostDiagnosisStatus) {
        if (backendAwaitingTechnicianReceiptRequests.length > 0 || backendReceivedInventoryRequests.length > 0) {
          effectiveStatus = "ready_for_repair";
        } else if (hasBackendInventoryRequests) {
          effectiveStatus = "awaiting_parts_release";
        } else if (ticketParts.length > 0) {
          effectiveStatus = "ready_to_request_parts";
        } else {
          effectiveStatus = "ready_for_repair";
        }
      }
    }
  }
  const isRepairingStage = ["repairing", "repair_in_progress"].includes(ticket.status);
  const isQualityCheckStage = ["quality_check", "submitted_for_qc_review", "repaired"].includes(ticket.status);
  const isReadyForHandoverStage = ["ready_for_handover", "qc_passed", "ready_for_collection"].includes(ticket.status);
  const isCompletedStage = ["completed", "delivered", "closed"].includes(ticket.status);
  const intakeLabel = TICKET_INTAKE_LABELS[ticket.intakeType];
  const customerCardTitle =
    ticket.intakeType === "onsite" || ticket.intakeType === "corporate"
      ? "Organisation / Contact"
      : "Customer";
  const deviceCardTitle = ticket.intakeType === "onsite" ? "System" : "Device";
  const issueTitle = ticket.intakeType === "onsite" ? "Issue / Work Requested" : "Reported Issue";
  const imageTitle = ticket.intakeType === "onsite" ? "System Images" : "Device Images";
  const identifierLabel =
    ticket.intakeType === "onsite"
      ? "Asset / Location"
      : ticket.intakeType === "corporate"
      ? "IMEI / SERIAL"
      : "IMEI / SERIAL";
  const serviceLocation = [ticket.address, ticket.city, ticket.state, ticket.country].filter(Boolean).join(", ");
  const intakeNotice =
    ticket.intakeType === "repeat_return"
      ? "This is a repeat return under the 3-month repair warranty."
      : ticket.intakeType === "warranty"
      ? "This is an Amo device warranty ticket under the 1-year coverage."
      : ticket.intakeType === "onsite"
      ? "This is an onsite repair request for an organisation."
      : ticket.intakeType === "corporate"
      ? ticket.jobGroupType === "parent"
        ? "This is a corporate parent job used to group multiple child tickets."
        : "This is a corporate child job created under a parent bulk job."
      : ticket.isWarranty
      ? "This is a warranty ticket."
      : "";

  const canEditCustomer = user?.role === "front_desk" || user?.role === "admin";

  const handleOpenEditCustomer = async () => {
    if (!ticket?.customer) return;
    if (loadingCustomerForEdit) return;
    setLoadingCustomerForEdit(true);
    try {
      const lookups: Promise<any>[] = [];
      if (ticket.customer.phone) {
        const phoneVariants: string[] = getNigerianPhoneSearchVariants(ticket.customer.phone);
        phoneVariants.forEach((phone) => {
          lookups.push(
            api.get("/users/profile/customers/", { params: { phone_number: phone } }).catch(() => null)
          );
        });
      }
      if (ticket.customer.email) {
        lookups.push(
          api.get("/users/profile/customers/", { params: { email: ticket.customer.email } }).catch(() => null)
        );
      }
      const responses = await Promise.all(lookups);
      const all: any[] = [];
      responses.forEach((res) => {
        const arr = res?.data?.result;
        if (Array.isArray(arr)) all.push(...arr);
      });
      const matched =
        all.find((c) => String(c?.id) === String(ticket.customer.id)) ?? all[0] ?? null;
      if (!matched || !matched?.profile?.id) {
        toast.error("Could not load full customer profile.");
        return;
      }
      setEditCustomerData(matched);
      setEditCustomerOpen(true);
    } catch {
      toast.error("Failed to load customer profile.");
    } finally {
      setLoadingCustomerForEdit(false);
    }
  };

  const handleCustomerUpdated = (updated: EditableCustomer | null) => {
    if (!updated) return;
    setEditCustomerData(updated);
    const updatedName =
      `${updated.first_name ?? ""} ${updated.last_name ?? ""}`.trim() ||
      updated.profile?.full_name ||
      ticket?.customer.name ||
      "";
    updateCurrentTicket((current) => ({
      ...current,
      customer: {
        ...current.customer,
        name: updatedName,
        phone: updated.phone_number ?? current.customer.phone,
        email: updated.email ?? current.customer.email,
      },
    }));
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <Button variant="ghost" onClick={() => navigate(getDashboardPathForRole(user?.role))}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>

      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <p className="font-mono text-xl font-bold text-primary">{ticket.jobId}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Created {new Date(ticket.createdAt).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Intake: <span className="text-foreground font-medium">{intakeLabel}</span>
          </p>
          {ticket.jobGroupType === "parent" && (
            <div className="mt-2 inline-flex items-center rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
              Bulk Parent Job
            </div>
          )}
          {ticket.jobGroupType === "child" && ticket.parentJobId && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                Individual Child Job
              </span>
              <button
                className="text-xs font-medium text-primary hover:underline cursor-pointer bg-transparent border-0 p-0"
                onClick={() => navigate(`/ticket/${ticket.parentJobId}`)}
              >
                View Bulk Parent Job
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <StatusBadge status={ticket.status} />
          {canViewSignedAgreement && (
            <Button variant="outline" size="sm" onClick={handleOpenJobCard}>
              <FileText className="w-4 h-4 mr-2" />
              View Job Card
            </Button>
          )}
          {canGenerateInvoice && (
            <Button variant="outline" size="sm" onClick={handleGenerateInvoiceAnytime}>
              <ReceiptText className="w-4 h-4 mr-2" />
              Generate Invoice
            </Button>
          )}
        </div>
      </div>

      <RepairWarrantyPanel ticket={ticket} user={user} />

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" />
              {customerCardTitle}
            </div>
            {canEditCustomer && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={handleOpenEditCustomer}
                disabled={loadingCustomerForEdit}
              >
                {loadingCustomerForEdit ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="space-y-1 text-sm">
            {ticket.organizationName && (
              <p className="text-foreground font-medium">{ticket.organizationName}</p>
            )}
            <p className="text-foreground">{ticket.customer.name}</p>
            <p className="text-muted-foreground">{ticket.customer.phone}</p>
            <p className="text-muted-foreground">{ticket.customer.email}</p>
          </div>
        </div>
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Smartphone className="w-4 h-4 text-primary" />
            {deviceCardTitle}
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{DEVICE_TYPE_LABELS[ticket.device.type ?? "gadget"]}</p>
            <p className="text-foreground">
              {ticket.device.make} {ticket.device.model}
            </p>
            <p className="text-muted-foreground font-mono">
              {identifierLabel}: {ticket.device.imei}
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-2">
        <p className="text-sm font-semibold text-foreground">{issueTitle}</p>
        <p className="text-sm text-muted-foreground">{ticket.issueReported || "Not captured during intake."}</p>
      </div>

      {serviceLocation && (
        <div className="glass-card p-6 space-y-2">
          <p className="text-sm font-semibold text-foreground">Service Location</p>
          <p className="text-sm text-muted-foreground">{serviceLocation}</p>
        </div>
      )}

      {ticket.sourceTicketId && (
        <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Source Job</p>
            <p className="text-sm text-muted-foreground">
              This ticket is linked to an earlier job for history and warranty tracking.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate(`/ticket/${ticket.sourceTicketId}`)}>
            View Source Job
          </Button>
        </div>
      )}

      {ticket.device.images.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <p className="text-sm font-semibold text-foreground">{imageTitle} ({ticket.device.images.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {ticket.device.images.map((image, index) => (
              <button
                type="button"
                key={`${ticket.id}-device-image-${index}`}
                onClick={() => setPreviewImage(image)}
                className="block aspect-square rounded-md overflow-hidden border border-border bg-secondary/40 hover:opacity-90 transition-opacity"
              >
                <img
                  src={image}
                  alt={`Device intake image ${index + 1} for ${ticket.jobId}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <ImageLightbox imageUrl={previewImage} onClose={() => setPreviewImage(null)} alt="Ticket attachment" />

      {ticket.customerNote && (
        <div className="glass-card p-6 space-y-2">
          <p className="text-sm font-semibold text-foreground">Customer Note</p>
          <p className="text-sm text-muted-foreground">{ticket.customerNote}</p>
        </div>
      )}

      {ticket.agreement && canViewSignedAgreement && (
        <div className="glass-card p-6 space-y-4">
          <p className="text-sm font-semibold text-foreground">Signed Agreement</p>
          <p className="text-sm text-muted-foreground">
            Signed {new Date(ticket.agreement.acceptedAt).toLocaleString()}
            {ticket.agreement.storeLocation ? ` at ${ticket.agreement.storeLocation}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleOpenAgreement}>
              <FileSignature className="w-4 h-4 mr-2" />
              View Agreement
            </Button>
            <Button type="button" variant="outline" onClick={handleSendAgreement}>
              <Mail className="w-4 h-4 mr-2" />
              Send Agreement
            </Button>
          </div>
        </div>
      )}

      {(ticket.diagnosis || typeof ticket.quotation === "number" || ticketPartRequests.length > 0 || ticket.engineerUpdate) && (
        <div className="glass-card p-6 space-y-2">
          <p className="text-sm font-semibold text-foreground">Technician Diagnosis</p>
          {ticket.assignedEngineer && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Technician:</span> {ticket.assignedEngineer}
            </p>
          )}
          {ticket.diagnosis && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Diagnosis:</span> {ticket.diagnosis}
            </p>
          )}
          {typeof ticket.quotation === "number" && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Estimated Repair Cost:</span>{" "}
              {formatCurrency(ticket.quotation)}
            </p>
          )}
          {selectedServiceLabels.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Service Items:</span>{" "}
              {selectedServiceLabels.join(", ")}
            </div>
          )}
          {ticketParts.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Parts Required:</span>{" "}
              {ticketParts.map((request) => request.name).join(", ")}
            </div>
          )}
          {ticket.engineerUpdate && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Technician Update:</span>{" "}
              {ticket.engineerUpdate}
            </p>
          )}
          {ticket.qaNotes && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">QA Notes:</span>{" "}
              {ticket.qaNotes}
            </p>
          )}
          {ticket.qaCheckedBy && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Last QA Review:</span>{" "}
              {ticket.qaCheckedBy}
              {ticket.qaLastCheckedAt ? ` on ${new Date(ticket.qaLastCheckedAt).toLocaleString()}` : ""}
            </p>
          )}
        </div>
      )}

      {(user?.role === "front_desk" || user?.role === "admin") && !["delivered", "closed", "cancelled"].includes(ticket.status) && isBackendJob && (
        <div className="glass-card p-6 space-y-4">
          <p className="text-sm font-semibold text-foreground">Technician Assignment</p>
          {ticket.assignedEngineer ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Current Technician: <span className="text-foreground font-medium">{ticket.assignedEngineer}</span>
              </p>
              <div className="space-y-2">
                <Label>Reassign Technician</Label>
                <div className="flex gap-2">
                  <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                    <SelectTrigger className="bg-secondary border-border flex-1">
                      <SelectValue placeholder="Select available technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTechnicians.map((tech: any) => (
                        <SelectItem key={tech.id} value={String(tech.profile?.id ?? tech.id)}>
                          {tech.profile?.full_name || tech.first_name || `Technician #${tech.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleReassignTechnician} 
                    disabled={!selectedTechnician || reassigning}
                  >
                    {reassigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Reassign
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No technician is currently assigned to this ticket.
              </p>
              <div className="space-y-2">
                <Label>Assign Technician</Label>
                <div className="flex gap-2">
                  <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                    <SelectTrigger className="bg-secondary border-border flex-1">
                      <SelectValue placeholder="Select available technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTechnicians.map((tech: any) => (
                        <SelectItem key={tech.id} value={String(tech.profile?.id ?? tech.id)}>
                          {tech.profile?.full_name || tech.first_name || `Technician #${tech.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleReassignTechnician} 
                    disabled={!selectedTechnician || reassigning}
                  >
                    {reassigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Assign
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {intakeNotice && (
        <div className="glass-card p-4 border-warning/30 flex items-center gap-4">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <p className="text-sm text-foreground">{intakeNotice}</p>
        </div>
      )}

      <div className="glass-card p-6 space-y-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Actions
        </h3>

        {isPreDiagnosisPaymentStatus && canManagePayments && (
          <div className="space-y-4">
            {ticket.intakeType === "repeat_return" && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Repeat warranty was not approved
                </p>
                <p className="text-sm text-muted-foreground">
                  This ticket has fallen back to the normal paid repair flow. You can continue with diagnosis fee
                  payment or cancel the booking.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button type="button" variant="outline" onClick={handleRepeatCaseCancel}>
                    Cancel Booking
                  </Button>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {isCorporateParentTicket ? (
                <>
                  Bulk diagnosis fee: <strong className="text-foreground">{formatCurrency(bulkDiagnosisAmount)}</strong>.
                  {isInitialParentChildLoad
                    ? " Loading child jobs..."
                    : canSettleBulkDiagnosisPayment
                    ? ` This covers ${bulkChildJobLabel} linked to this parent job.`
                    : activeParentChildJobs.length > 0
                    ? " Every active child job must be awaiting diagnosis fee before bulk payment can be confirmed."
                    : " Add child jobs to this parent job before collecting diagnosis payment."}
                </>
              ) : (
                <>
                  Diagnosis fee: <strong className="text-foreground">{formatCurrency(ticket.diagnosisFee)}</strong>.
                  Confirm payment to proceed.
                </>
              )}
            </p>
            {isCorporateParentTicket && parentChildJobsLoadedOnce && (
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                <p className="font-medium text-foreground">Bulk payment summary</p>
                <p className="text-muted-foreground">
                  Active child jobs: <strong className="text-foreground">{activeParentChildJobs.length}</strong>
                </p>
                <p className="text-muted-foreground">
                  Ready for bulk diagnosis payment:{" "}
                  <strong className="text-foreground">{bulkDiagnosisReadyChildJobs.length}</strong>
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isCorporateParentTicket ? (
                "After confirmation, the linked child jobs will be pushed into diagnosis using one bulk parent payment."
              ) : (
                <>
                  After confirmation, this ticket will move to <strong className="text-foreground">Diagnosing</strong> and appear in the Technician Desk queue.
                </>
              )}
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Voucher Code (Optional)</Label>
                {diagnosisVoucherValidation?.validCode && diagnosisVoucherValidation.discountAmount > 0 && (
                  <div className="text-right flex items-center gap-2">
                    {diagnosisVoucherValidation.isFullWaiver && (
                      <span className="text-xs font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-success/15 text-success">
                        Full Waiver
                      </span>
                    )}
                    <span className="text-xs line-through text-muted-foreground">
                      {formatCurrency(isCorporateParentTicket ? bulkDiagnosisAmount : ticket.diagnosisFee)}
                    </span>
                    <span className="text-sm font-bold gradient-text">
                      New Total: {formatCurrency(diagnosisVoucherValidation.finalAmount)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={diagnosisVoucherCode}
                  onChange={(e) => {
                    setDiagnosisVoucherCode(e.target.value.toUpperCase());
                    if (diagnosisVoucherValidation?.validCode && e.target.value.toUpperCase() !== diagnosisVoucherValidation.validCode) {
                      setDiagnosisVoucherValidation(null);
                    }
                  }}
                  placeholder="e.g. SAVE20"
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handleApplyDiagnosisVoucher}
                  disabled={!diagnosisVoucherCode.trim() || diagnosisVoucherValidation?.loading || diagnosisVoucherCode === diagnosisVoucherValidation?.validCode}
                >
                  {diagnosisVoucherValidation?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {diagnosisVoucherValidation?.error && (
                <p className="text-xs text-destructive">{diagnosisVoucherValidation.error}</p>
              )}
              {diagnosisVoucherValidation?.validCode && (
                <p className="text-xs text-success">Voucher applied successfully.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={diagnosisPaymentMode} onValueChange={(value) => {
                setDiagnosisPaymentMode(value as PaymentMode);
                setHasGeneratedDiagnosisInvoice(false);
              }}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {diagnosisPaymentMode === "bank_transfer"
                  ? "Use this after bank transfer is received."
                  : diagnosisPaymentMode === "pos"
                  ? "Use this after the POS terminal payment succeeds."
                  : "Use this after cash payment is received."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canGenerateInvoice && !diagnosisVoucherValidation?.isFullWaiver && (
                <Button variant="outline" onClick={handleGenerateInvoiceAnytime}>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Invoice
                </Button>
              )}
              <Button
                onClick={handleConfirmDiagnosisFee}
                disabled={
                  (isCorporateParentTicket &&
                  (isInitialParentChildLoad || !canSettleBulkDiagnosisPayment)) ||
                  (canGenerateInvoice && !hasGeneratedDiagnosisInvoice && !diagnosisVoucherValidation?.isFullWaiver)
                }
              >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {diagnosisVoucherValidation?.isFullWaiver
                ? isCorporateParentTicket
                  ? `Settle with Voucher & Push ${bulkChildJobLabel} to Diagnosis`
                  : "Settle with Voucher & Push to Diagnosis"
                : isCorporateParentTicket
                ? diagnosisPaymentMode === "bank_transfer"
                  ? `Confirm Transfer Received & Push ${bulkChildJobLabel} to Diagnosis`
                  : diagnosisPaymentMode === "pos"
                  ? `Confirm POS Payment & Push ${bulkChildJobLabel} to Diagnosis`
                  : `Confirm Cash Payment & Push ${bulkChildJobLabel} to Diagnosis`
                : diagnosisPaymentMode === "bank_transfer"
                ? "Confirm Transfer Received & Push to Diagnosis"
                : diagnosisPaymentMode === "pos"
                ? "Confirm POS Payment & Push to Diagnosis"
                : "Confirm Cash Payment & Push to Diagnosis"}
            </Button>
            </div>
          </div>
        )}

        {isPreDiagnosisPaymentStatus && !canManagePayments && (
          <div className="space-y-4">
            {ticket.intakeType === "repeat_return" && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <p className="text-sm text-muted-foreground">
                  This repeat return has fallen back to the normal paid repair flow after warranty validation.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Diagnosis payment and invoice handling are managed by the <span className="text-foreground font-medium">front desk or admin</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              Technicians cannot generate invoices or confirm diagnosis payment from this screen.
            </p>
          </div>
        )}

        {isCorporateParentTicket &&
          ["diagnosing", "quote_sent", "quote_accepted", "awaiting_payment", "payment_confirmed"].includes(ticket.status) && (
          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
            <p className="text-sm font-medium text-foreground">This is a bulk parent job.</p>
            <p className="text-sm text-muted-foreground">
              Submit diagnosis, quotation updates, and repair work on the <span className="text-foreground font-medium">individual child jobs</span>, not on this parent record.
            </p>
            <p className="text-sm text-muted-foreground">
              Use the Technician Desk or the bulk jobs page to open each individual child job and continue work there.
            </p>
          </div>
        )}

        {ticket.status === "diagnosing" && canEditDiagnosisActions && !isCorporateParentTicket && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isWarrantyTicket ? "Warranty Diagnosis Notes" : "Diagnosis Notes"}</Label>
              <Textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="Describe the issue found..."
                className="bg-secondary border-border"
              />
            </div>
            <label className="flex items-start gap-4 rounded-lg border border-border bg-background/60 px-4 py-4">
              <Checkbox
                checked={noPartsRequired}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setNoPartsRequired(enabled);
                  if (enabled) {
                    setSelectedPartIds([]);
                    setPartSourcingStatus("");
                  } else {
                    setSelectedServices([]);
                  }
                }}
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
            {noPartsRequired && (
              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                {isBackendJob ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Choose the non-parts service to bill for this diagnosis. The selected service base price becomes the quotation.
                    </p>
                    <div className="space-y-2">
                      <Label>Service</Label>
                      <Select value={selectedCatalogServiceId} onValueChange={setSelectedCatalogServiceId}>
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
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Choose every service included in this repair. The quotation is the sum of all selected service items.
                    </p>
                    <div className="space-y-2">
                      {SERVICE_OPTION_KEYS.map((serviceKey) => {
                        const checked = selectedServices.includes(serviceKey);
                        return (
                          <label
                            key={serviceKey}
                            className="flex items-start gap-4 rounded-md border border-border bg-background/60 px-4 py-2"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(checkedState) => {
                                if (checkedState === true) {
                                  setNoPartsRequired(true);
                                  setSelectedPartIds([]);
                                  setPartSourcingStatus("");
                                  setSelectedServices((current) => Array.from(new Set([...current, serviceKey])));
                                  return;
                                }
                                setSelectedServices((current) => current.filter((entry) => entry !== serviceKey));
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{SERVICE_OPTION_LABELS[serviceKey]}</p>
                              <p className="text-xs text-muted-foreground">NGN {SERVICE_OPTION_PRICE.toLocaleString()}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Parts Required</Label>
              <div
                className={
                  noPartsRequired ? "hidden" : "rounded-lg border border-border bg-secondary/30 p-4 space-y-4"
                }
              >
                <p className="text-xs text-muted-foreground">
                  Select every required part. Repair cost is calculated automatically from selected parts.
                </p>
                <SearchField
                  value={inventorySearch}
                  onChange={(event) => setInventorySearch(event.target.value)}
                  placeholder="Search parts by name or category..."
                  inputClassName="h-12"
                />
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {filteredInventory.map((item) => {
                    const isChecked = selectedPartIds.includes(item.id);
                    const existingRequest = ticketPartRequests.find((request) => request.partId === item.id);
                    const alreadyRequested = Boolean(existingRequest?.requestedAt);
                    const availableUnits = Math.max(0, item.quantity - item.locked);

                    return (
                      <label
                        key={item.id}
                        className="flex items-start gap-4 rounded-md border border-border bg-background/60 px-4 py-2"
                      >
                        <Checkbox
                          checked={isChecked}
                          disabled={alreadyRequested}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setNoPartsRequired(false);
                              setSelectedServices([]);
                            }
                            setSelectedPartIds((current) =>
                              checked === true
                                ? uniquePartIds([...current, item.id])
                                : current.filter((partId) => partId !== item.id)
                            );
                          }}
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
              </div>
            {noPartsRequired && !isWarrantyTicket && (
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-xs text-foreground">
                No hardware parts will be requested. Selected service items total NGN {selectedPartsRepairCost.toLocaleString()}.
              </div>
            )}
            {!noPartsRequired && selectedUnavailableTicketParts.length > 0 && (
              isWarrantyTicket ? (
                <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
                  <p className="text-xs text-warning">
                    Requested part{selectedUnavailableTicketParts.length === 1 ? "" : "s"} currently unavailable:
                    {" "}
                    {selectedUnavailableTicketParts.map((request) => request.name).join(", ")}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This is a warranty repair, so the job stays open. When you submit diagnosis, the customer update
                    email will say the required part will be ready in 5 business days.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
                  <p className="text-xs text-warning">
                    Requested part{selectedUnavailableTicketParts.length === 1 ? "" : "s"} currently unavailable:
                    {" "}
                    {selectedUnavailableTicketParts.map((request) => request.name).join(", ")}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confirm with the inventory manager whether the unavailable part
                    {selectedUnavailableTicketParts.length === 1 ? "" : "s"} can be sourced within a few days. Only
                    then should you send the quotation.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={partSourcingStatus === "sourceable" ? "default" : "outline"}
                      onClick={() => setPartSourcingStatus("sourceable")}
                    >
                      Can Be Sourced
                    </Button>
                    <Button
                      type="button"
                      variant={partSourcingStatus === "not_sourceable" ? "destructive" : "outline"}
                      onClick={() => setPartSourcingStatus("not_sourceable")}
                    >
                      Cannot Be Sourced
                    </Button>
                  </div>
                  {partSourcingStatus === "sourceable" && (
                    <p className="text-xs text-muted-foreground">
                      Quotation can be sent. Front desk will confirm payment once it is received.
                    </p>
                  )}
                  {partSourcingStatus === "not_sourceable" && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="destructive" onClick={handleCancelJob}>
                        Cancel Job
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Cancel this job instead of sending a quotation when the required parts cannot be sourced quickly.
                      </p>
                    </div>
                  )}
                </div>
              )
            )}
            {!isWarrantyTicket && (
              <p className="text-xs text-muted-foreground">
                {noPartsRequired
                  ? isBackendJob
                    ? "No hardware parts will be requested. The quotation comes from the selected service base price."
                    : "No hardware parts will be requested. The quotation is the sum of the selected service items."
                  : "Engineers cannot type repair cost manually. Cost is auto-generated from selected required parts."}
              </p>
            )}
            <Button
              onClick={handleSubmitDiagnosis}
              disabled={
                !diagnosis ||
                (!isWarrantyTicket && !noPartsRequired && selectedPartIds.length === 0) ||
                (!isWarrantyTicket &&
                  noPartsRequired &&
                  (isBackendJob ? !selectedCatalogServiceId : selectedServices.length === 0)) ||
                (!isWarrantyTicket &&
                  selectedUnavailableTicketParts.length > 0 &&
                  partSourcingStatus !== "sourceable")
              }
            >
              <FileText className="w-4 h-4 mr-2" />
              {isWarrantyTicket ? "Submit Warranty Diagnosis" : "Submit Diagnosis & Email Quotation"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {isWarrantyTicket
                ? "Submitting this warranty diagnosis updates the customer and moves the job straight into parts release or repair. No customer payment is required."
                : "Submitting diagnosis opens the customer email draft with the quotation details and sends the job to front desk for payment confirmation."}
            </p>

            {isWarrantyTicket && (
              <div className="border-t border-border pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Reason for Cancellation</Label>
                  <Textarea
                    value={warrantyVoidDiagnosisReason}
                    onChange={(e) => setWarrantyVoidDiagnosisReason(e.target.value)}
                    placeholder="Describe why this warranty repair should be cancelled..."
                    className="bg-secondary border-border"
                  />
                </div>
                <Button
                  variant="destructive"
                  disabled={!warrantyVoidDiagnosisReason.trim() || isCancellingWarranty}
                  onClick={handleCancelWarrantyBooking}
                >
                  {isCancellingWarranty && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Cancel Booking
                </Button>
              </div>
            )}

          </div>
        )}

        {ticket.status === "diagnosing" && !canEditDiagnosisActions && (
          <div className="space-y-4">
            {isCorporateParentTicket ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This bulk parent job groups the <span className="text-foreground font-medium">individual child jobs</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Diagnosis and repair updates happen on the individual child jobs, not on this parent record.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This ticket is currently in the <span className="text-foreground font-medium">Technician Desk diagnosis queue</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Diagnosis actions are managed by the technician. Front desk cannot edit diagnosis notes, parts, or quotation.
                </p>
                {!isWarrantyTicket && (
                  <p className="text-sm text-muted-foreground">
                    Once technician submits diagnosis and quotation, proceed to payment, select customer payment choice, and generate invoice.
                  </p>
                )}
                {isWarrantyTicket && (
                  <p className="text-sm text-muted-foreground">
                    This is a warranty repair, so no customer payment or invoice is required.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {["quote_sent", "quote_accepted", "awaiting_payment"].includes(ticket.status) &&
          canEditDiagnosisActions &&
          !isNaN(Number(ticket.id)) &&
          !isCorporateParentTicket && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Update Assessment
            </h4>
            <p className="text-xs text-muted-foreground">
              You can revise the diagnosis and parts for this job.
            </p>
            <div className="space-y-2">
              <Label>Diagnosis Notes</Label>
              <Textarea
                value={diagnosis}
                onChange={(e: any) => setDiagnosis(e.target.value)}
                placeholder="Update the diagnosis..."
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Parts Required</Label>
              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                <SearchField
                  value={inventorySearch}
                  onChange={(event: any) => setInventorySearch(event.target.value)}
                  placeholder="Search parts by name or category..."
                  inputClassName="h-12"
                />
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {filteredInventory.map((item: InventoryItem) => {
                    const isChecked = selectedPartIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-start gap-4 rounded-md border border-border bg-background/60 px-4 py-2"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked: any) => {
                            setSelectedPartIds((current: string[]) =>
                              checked === true
                                ? uniquePartIds([...current, item.id])
                                : current.filter((partId: string) => partId !== item.id)
                            );
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.category} | NGN {item.price.toLocaleString()}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <Button
              onClick={handleUpdateAssessment}
              disabled={!diagnosis}
              variant="outline"
            >
              <FileText className="w-4 h-4 mr-2" />
              Update Assessment
            </Button>
          </div>
        )}
        {ticket.status === "quote_sent" && !isNaN(Number(ticket.id)) && canManagePayments && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-4 text-sm">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Customer Quote Acceptance
              </h4>
              <p className="text-muted-foreground">
                The quotation has been sent to the customer. Once the customer agrees to the repair cost, accept the quote to proceed to payment.
              </p>
              <div className="pt-2">
                <Button onClick={handleAcceptQuote}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Accept Quote on Behalf of Customer
                </Button>
              </div>
            </div>
          </div>
        )}
        {showRepairPaymentSection && canManagePayments && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2 text-sm">
              {isCorporateParentTicket ? (
                <>
                  <p>
                    <strong className="text-foreground">Child jobs:</strong>{" "}
                    <span className="text-muted-foreground">{activeParentChildJobs.length}</span>
                  </p>
                  <p>
                    <strong className="text-foreground">Ready for bulk repair payment:</strong>{" "}
                    <span className="text-muted-foreground">{bulkRepairReadyChildJobs.length}</span>
                  </p>
                </>
              ) : (
                <p>
                  <strong className="text-foreground">Diagnosis:</strong>{" "}
                  <span className="text-muted-foreground">{ticket.diagnosis}</span>
                </p>
              )}
              {!isCorporateParentTicket && ticketParts.length > 0 && (
                <div className="space-y-1">
                  <strong className="text-foreground">Parts:</strong>
                  <div className="space-y-1">
                    {ticketParts.map((request) => (
                      <p key={request.partId} className="text-muted-foreground">
                        {request.name}
                        {request.available === false && (
                          <span className="text-destructive ml-2">(Currently unavailable)</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p>
                <strong className="text-foreground">{isCorporateParentTicket ? "Total Quotation:" : "Quotation:"}</strong>{" "}
                <span className="text-xl font-bold gradient-text">
                  {formatCurrency(isCorporateParentTicket ? bulkRepairAmount : ticket.quotation ?? 0)}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Voucher Code (Optional)</Label>
                {repairVoucherValidation?.validCode && repairVoucherValidation.discountAmount > 0 && (
                  <div className="text-right flex items-center gap-2">
                    {repairVoucherValidation.isFullWaiver && (
                      <span className="text-xs font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-success/15 text-success">
                        Full Waiver
                      </span>
                    )}
                    <span className="text-xs line-through text-muted-foreground">
                      {formatCurrency(isCorporateParentTicket ? bulkRepairAmount : ticket.quotation ?? 0)}
                    </span>
                    <span className="text-sm font-bold gradient-text">
                      New Total: {formatCurrency(repairVoucherValidation.finalAmount)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={repairVoucherCode}
                  onChange={(e) => {
                    setRepairVoucherCode(e.target.value.toUpperCase());
                    if (repairVoucherValidation?.validCode && e.target.value.toUpperCase() !== repairVoucherValidation.validCode) {
                      setRepairVoucherValidation(null);
                    }
                  }}
                  placeholder="e.g. SAVE20"
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handleApplyRepairVoucher}
                  disabled={!repairVoucherCode.trim() || repairVoucherValidation?.loading || repairVoucherCode === repairVoucherValidation?.validCode}
                >
                  {repairVoucherValidation?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {repairVoucherValidation?.error && (
                <p className="text-xs text-destructive">{repairVoucherValidation.error}</p>
              )}
              {repairVoucherValidation?.validCode && (
                <p className="text-xs text-success">Voucher applied successfully.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={repairPaymentMode} onValueChange={(value) => setRepairPaymentMode(value as PaymentMode)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {repairPaymentMode === "bank_transfer"
                  ? "Confirm payment only after transfer hits the account."
                  : repairPaymentMode === "pos"
                  ? "Confirm payment only after the POS terminal approves the charge."
                  : "Confirm payment once cash is collected at the desk."}
              </p>
              <p className="text-xs text-muted-foreground">
                {loadingRepairQuoteInvoice && !repairQuoteInvoiceIsCurrent
                  ? "Checking invoice status..."
                  : repairQuoteInvoiceIsCurrent
                  ? `Invoice ready for ${ticket.jobId}. Confirm payment after the customer pays${
                      isCorporateParentTicket ? ` to clear ${bulkChildJobLabel}.` : "."
                    }`
                  : hasRepairQuoteInvoice
                  ? "If you change the payment mode or quotation, regenerate the invoice before confirming payment."
                  : "Verify payment mode before invoice generation."}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCorporateParentTicket
                  ? "Bulk repair payment requires every active child job to be quote accepted or awaiting payment."
                  : `After payment is confirmed, inventory manager will release the required part${
                      ticketParts.length === 1 ? "" : "s"
                    } before the technician confirms receipt and starts repair.`}
              </p>
              {isCorporateParentTicket && !canSettleBulkRepairPayment && activeParentChildJobs.length > 0 && (
                <p className="text-xs text-warning">
                  Every active child job must be quote accepted or awaiting payment, and each child must have a quotation, before bulk repair payment can be confirmed.
                </p>
              )}
              {!isCorporateParentTicket && unavailableTicketParts.length > 0 && (
                <>
                  <p className="text-xs text-warning">
                    One or more requested parts are currently unavailable. You can still confirm customer payment here
                    after payment is received while part sourcing continues.
                  </p>
                  {ticket.partSourcingStatus === "sourceable" && (
                    <p className="text-xs text-muted-foreground">
                      Technician confirmed the pending part
                      {unavailableTicketParts.length === 1 ? "" : "s"} can be sourced within a few days.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {!repairVoucherValidation?.isFullWaiver && (
                <Button
                  variant="outline"
                  onClick={handleGenerateRepairInvoice}
                  disabled={
                    (loadingRepairQuoteInvoice && !repairQuoteInvoiceIsCurrent) ||
                    (isCorporateParentTicket && (isInitialParentChildLoad || !canSettleBulkRepairPayment)) ||
                    (!isCorporateParentTicket && readMoneyAmount(ticket.quotation) <= 0)
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {hasRepairQuoteInvoice ? "Regenerate Invoice" : "Generate Invoice"}
                </Button>
              )}
              <Button
                onClick={handleConfirmRepairPayment}
                disabled={
                  (loadingRepairQuoteInvoice && !repairQuoteInvoiceIsCurrent) ||
                  (!repairQuoteInvoiceIsCurrent && !repairVoucherValidation?.isFullWaiver) ||
                  (isCorporateParentTicket && (isInitialParentChildLoad || !canSettleBulkRepairPayment))
                }
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {repairVoucherValidation?.isFullWaiver
                  ? isCorporateParentTicket
                    ? `Settle with Voucher & Clear ${bulkChildJobLabel}`
                    : ticketParts.length > 0
                    ? "Settle with Voucher & Move To Parts Release"
                    : "Settle with Voucher & Ready For Repair"
                  : isCorporateParentTicket
                  ? repairPaymentMode === "bank_transfer"
                    ? `Confirm Transfer Received & Clear ${bulkChildJobLabel}`
                    : repairPaymentMode === "pos"
                    ? `Confirm POS Payment & Clear ${bulkChildJobLabel}`
                    : `Confirm Cash Payment & Clear ${bulkChildJobLabel}`
                  : repairPaymentMode === "bank_transfer"
                  ? ticketParts.length > 0
                    ? "Confirm Transfer Received & Move To Parts Release"
                    : "Confirm Transfer Received & Ready For Repair"
                  : repairPaymentMode === "pos"
                  ? ticketParts.length > 0
                    ? "Confirm POS Payment & Move To Parts Release"
                    : "Confirm POS Payment & Ready For Repair"
                  : ticketParts.length > 0
                  ? "Confirm Cash Payment & Move To Parts Release"
                  : "Confirm Cash Payment & Ready For Repair"}
              </Button>
            </div>
          </div>
        )}

        {showRepairPaymentSection && !canManagePayments && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Repair payment and invoice handling are managed by the <span className="text-foreground font-medium">front desk or admin</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              Technicians cannot generate invoices or confirm repair payment from this screen.
            </p>
          </div>
        )}

        {effectiveStatus === "ready_to_request_parts" && ticketParts.length > 0 && !hasBackendInventoryRequests && (
          user?.role === "engineer" || user?.role === "admin" ? (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                Request Parts for Repair
              </h4>
              <div className="bg-secondary/40 rounded-lg p-4 space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Payment has been confirmed (or quote accepted). You must now explicitly request the required parts from the inventory manager so they can be released to you.
                </p>
                <div className="space-y-2">
                  <Button onClick={handleRequestPartFromInventoryManager} disabled={hasBackendInventoryRequests}>
                    Request Quoted Part{ticketParts.length === 1 ? "" : "s"} From Inventory
                  </Button>
                </div>
              </div>
              
              {/* Request custom part temporarily disabled per user request
              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                <Label htmlFor="custom-part-name">Need an additional unquoted part?</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="custom-part-name"
                    value={customPartName}
                    onChange={(event) => setCustomPartName(event.target.value)}
                    placeholder="Enter custom part name..."
                    className="bg-secondary border-border"
                  />
                  <Button type="button" variant="outline" onClick={handleRequestCustomPartFromInventoryManager} disabled={hasBackendInventoryRequests}>
                    Request Custom Part
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this if you discovered another missing part during teardown that wasn't in the original quote.
                </p>
              </div>
              */}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Payment confirmed. Waiting for the <span className="text-foreground font-medium">technician</span> to formally request the quoted parts from inventory so the handoff can begin.
              </p>
            </div>
          )
        )}

        {effectiveStatus === "ready_to_request_parts" && hasBackendInventoryRequests && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Parts have already been requested from inventory for this job.
            </p>
            <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
              {backendInventoryRequests.map((request: any) => (
                <p key={request.id} className="text-muted-foreground">
                  {request.displayName}:{" "}
                  <span className="text-foreground font-medium capitalize">
                    {request.status || "requested"}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    Qty {request.requested_qty || 1}
                  </span>
                </p>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Waiting for the <span className="text-foreground font-medium">inventory manager</span> to process the request.
            </p>
          </div>
        )}

        {effectiveStatus === "awaiting_parts_release" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Waiting for the <span className="text-foreground font-medium">inventory manager</span> to complete the next parts handoff for this repair.
            </p>
            {isBackendJob && backendInventoryRequests.length > 0 ? (
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                {backendInventoryRequests.map((request: any) => (
                  <p key={request.id} className="text-muted-foreground">
                    {request.displayName}:{" "}
                    <span className="text-foreground font-medium">
                      {request.returned_at
                        ? "Returned"
                        : request.received_at
                        ? `Received ${new Date(request.received_at).toLocaleString()}`
                        : request.approved_at
                        ? `Released ${new Date(request.approved_at).toLocaleString()} - waiting for technician confirmation`
                        : request.status === "requested"
                        ? "Pending release"
                        : request.status || "Pending release"}
                    </span>
                  </p>
                ))}
              </div>
            ) : ticketParts.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                {ticketParts.map((request) => (
                  <p key={request.partId} className="text-muted-foreground">
                    {request.name}:{" "}
                    <span className="text-foreground font-medium">
                      {isAwaitingDefectiveReturnReceipt(request)
                        ? "Defective part logged - waiting for inventory confirmation"
                        : isAwaitingReplacementRelease(request)
                        ? "Defective part received - waiting for replacement release"
                        : isAwaitingTechnicianPartConfirmation(request)
                        ? request.replacementReleasedAt
                          ? `Replacement released ${new Date(request.replacementReleasedAt).toLocaleString()} - waiting for technician confirmation`
                          : `Released ${new Date(request.releasedAt!).toLocaleString()} - waiting for technician confirmation`
                        : request.available === false
                        ? "Pending release - out of stock"
                        : "Pending release"}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {awaitingDefectiveReturnReceiptParts.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Inventory manager must first confirm receipt of the defective part before a new part can be released.
              </p>
            )}
            {awaitingReplacementReleaseParts.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Defective part has been confirmed. Inventory manager can now release the replacement part.
              </p>
            )}
            {canReleaseParts ? (
              <div className="space-y-4 pt-2">
                <p className="text-sm font-medium text-foreground">
                  Pending Authorizations
                </p>
                {backendPartRequests.length > 0 ? (
                  <div className="space-y-4">
                    {pendingBackendInventoryRequests.map((req: any) => (
                      <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-secondary/30 rounded-lg border border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">{req.displayName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Quantity: {req.requested_qty || 1}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Available units: {req.availableUnits}</p>
                          {req.missingCatalogSku && (
                            <p className="text-xs text-warning mt-0.5">
                              This catalog item has no SKU in Odoo, so release is blocked.
                            </p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() =>
                            void handleReleaseRequestedPart(
                              String(req.id),
                              req.product_id || req.sku || req.displayName,
                              req.resolvedSku,
                              req.requested_qty || 1,
                              req.displayName
                            )
                          }
                          disabled={releasingKey === String(req.id) || req.availableUnits <= 0 || req.missingCatalogSku}
                        >
                          {releasingKey === String(req.id) ? "Releasing..." : "Release To Technician"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                   <p className="text-sm text-muted-foreground">Searching backend requests...</p>
                )}
                <div className="pt-2 text-sm text-muted-foreground border-t border-border/50">
                  <p className="mb-2">Confirmation and release actions can also be managed from the inventory workspace.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/inventory")}>
                    Open Inventory Manager
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2 border-t border-border/50">
                <p className="text-sm font-medium text-foreground mt-2">
                  Parts Requested
                </p>
                {backendPartRequests.length > 0 ? (
                  <div className="space-y-4">
                    {pendingBackendInventoryRequests.map((req: any) => (
                      <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-secondary/30 rounded-lg border border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">{req.displayName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Quantity: {req.requested_qty || 1}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 capitalize">
                          {req.status || "requested"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Searching backend requests...</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Inventory manager will release the requested part
                  {ticketParts.length === 1 ? "" : "s"} before technician can confirm receipt and begin repairs.
                </p>
              </div>
            )}
          </div>
        )}

        {effectiveStatus === "ready_for_repair" && canStartRepair && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {(isBackendJob ? backendAwaitingTechnicianReceiptRequests.length > 0 : awaitingTechnicianConfirmationParts.length > 0)
                ? "Required part release is complete. Technician should confirm receipt before starting or resuming repair."
                : "All required parts have been received. Technician can now start the repair."}
            </p>
            {isBackendJob && backendInventoryRequests.length > 0 ? (
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                {backendInventoryRequests.map((request: any) => (
                  <p key={request.id} className="text-muted-foreground">
                    {request.displayName}:{" "}
                    <span className="text-foreground font-medium">
                      {request.received_at
                        ? `Received ${new Date(request.received_at).toLocaleString()}`
                        : request.approved_at
                        ? `Released ${new Date(request.approved_at).toLocaleString()} - waiting for technician confirmation`
                        : request.status || "Pending release"}
                    </span>
                  </p>
                ))}
              </div>
            ) : ticketParts.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2 text-sm">
                {ticketParts.map((request) => (
                  <p key={request.partId} className="text-muted-foreground">
                    {request.name}:{" "}
                    <span className="text-foreground font-medium">
                      {isAwaitingTechnicianPartConfirmation(request)
                        ? request.replacementReleasedAt
                          ? `Replacement released ${new Date(request.replacementReleasedAt).toLocaleString()} - waiting for technician confirmation`
                          : `Released ${new Date(request.releasedAt!).toLocaleString()} - waiting for technician confirmation`
                        : request.replacementReceivedAt
                        ? `Replacement received ${new Date(request.replacementReceivedAt).toLocaleString()}`
                        : request.receivedAt
                        ? `Received ${new Date(request.receivedAt).toLocaleString()}`
                        : request.releasedAt
                        ? `Released ${new Date(request.releasedAt).toLocaleString()}`
                        : "Not released"}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {(isBackendJob ? backendAwaitingTechnicianReceiptRequests.length > 0 : awaitingTechnicianConfirmationParts.length > 0) ? (
              <Button onClick={handleConfirmPartReceived} disabled={!isBackendJob && unreleasedTicketParts.length > 0}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm Part Received
              </Button>
            ) : (
              <Button onClick={handleStartRepair} disabled={!isBackendJob && unreleasedTicketParts.length > 0}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Start Repair
              </Button>
            )}
            {((isBackendJob && backendReturnableInventoryRequests.length > 0) ||
              (!isBackendJob && returnableTicketParts.length > 0)) &&
              canLogDefectivePartReturn && (
                <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
                  <Label>Return Received Part</Label>
                  <Select value={defectivePartId} onValueChange={setDefectivePartId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select received part" />
                    </SelectTrigger>
                    <SelectContent>
                      {isBackendJob
                        ? backendReturnableInventoryRequests.map((request: any) => (
                            <SelectItem key={request.id} value={String(request.id)}>
                              {request.displayName}
                            </SelectItem>
                          ))
                        : returnableTicketParts.map((request) => (
                            <SelectItem key={request.partId} value={request.partId}>
                              {request.name}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  <Label>Return Reason</Label>
                  <Input
                    value={defectiveReturnReason}
                    onChange={(event) => setDefectiveReturnReason(event.target.value)}
                    placeholder="Describe why the part is being returned"
                    className="bg-secondary border-border"
                  />
                  <Button variant="outline" onClick={handleLogDefectivePartReturn}>
                    Return Received Part
                  </Button>
                </div>
              )}
          </div>
        )}

        {effectiveStatus === "ready_for_repair" && !canStartRepair && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {(isBackendJob ? backendAwaitingTechnicianReceiptRequests.length > 0 : awaitingTechnicianConfirmationParts.length > 0)
                ? <>Required parts have been released and this job is now waiting for the <span className="text-foreground font-medium">technician</span> to confirm receipt.</>
                : <>Required parts have been received and this job is now waiting for the <span className="text-foreground font-medium">technician</span> to start repair.</>}
            </p>
          </div>
        )}

        {isRepairingStage && canStartRepair && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Technician is working on the device. Mark as complete when done and send it to QA.
            </p>
            {defectiveReturnedParts.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-4">
                <p className="text-sm font-medium text-destructive">Defective Return Logged</p>
                {defectiveReturnedParts.map((request) => (
                  <div key={request.partId} className="space-y-1 text-sm">
                    <p className="text-foreground">{request.name}</p>
                    {request.returnedDefectiveAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(request.returnedDefectiveAt).toLocaleString()}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {request.returnedDefectiveReason || "No reason provided."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAwaitingDefectiveReturnReceipt(request)
                        ? "Waiting for inventory manager to confirm defective part receipt."
                        : isAwaitingReplacementRelease(request)
                        ? "Inventory confirmed the defective part. Waiting for replacement release."
                        : isAwaitingTechnicianPartConfirmation(request)
                        ? "Replacement released. Waiting for technician confirmation."
                        : request.replacementReceivedAt
                        ? `Replacement received ${new Date(request.replacementReceivedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {((isBackendJob && backendReturnableInventoryRequests.length > 0) ||
              (!isBackendJob && returnableTicketParts.length > 0)) &&
              canLogDefectivePartReturn && (
              <div className="space-y-2">
                <Label>Return Received Part</Label>
                <Select value={defectivePartId} onValueChange={setDefectivePartId}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select received part" />
                  </SelectTrigger>
                  <SelectContent>
                    {isBackendJob
                      ? backendReturnableInventoryRequests.map((request: any) => (
                          <SelectItem key={request.id} value={String(request.id)}>
                            {request.displayName}
                          </SelectItem>
                        ))
                      : returnableTicketParts.map((request) => (
                          <SelectItem key={request.partId} value={request.partId}>
                            {request.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <Label>Return Reason</Label>
                <Input
                  value={defectiveReturnReason}
                  onChange={(event) => setDefectiveReturnReason(event.target.value)}
                  placeholder="Describe why the part is being returned"
                  className="bg-secondary border-border"
                />
                <Button variant="outline" onClick={handleLogDefectivePartReturn}>
                  Return Received Part
                </Button>
              </div>
            )}
            {isBackendJob && (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
                <input
                  ref={completionMediaInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleCompletionMediaChange}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">After-Repair Images</p>
                    <p className="text-xs text-muted-foreground">
                      Add at least one repair completion image before sending this job to QA.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => completionMediaInputRef.current?.click()}>
                    Add Repair Images
                  </Button>
                </div>
                {completionMediaPreviews.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {completionMediaPreviews.map((image, index) => (
                      <button
                        type="button"
                        key={`completion-media-${index}`}
                        onClick={() => setPreviewImage(image)}
                        className="block aspect-square rounded-md overflow-hidden border border-border bg-background/60"
                      >
                        <img src={image} alt={`Repair completion upload ${index + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button onClick={handleCompleteRepair}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Submit for Quality Check
            </Button>
          </div>
        )}

        {isRepairingStage && !canStartRepair && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Technician is currently working on this device.
            </p>
            <p className="text-sm text-muted-foreground">
              Repair completion and QA submission are managed by the <span className="text-foreground font-medium">technician or admin</span>.
            </p>
          </div>
        )}

        {ticket.status === "cancelled" && (
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                Job cancelled{ticket.cancellationReason ? `: ${ticket.cancellationReason}` : ""}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This repair was cancelled before quotation or repair progression could continue.
            </p>
          </div>
        )}

        {isQualityCheckStage && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Device is ready for quality assessment. QA can approve it for front desk or send it back to technician for correction.
            </p>
            <div className="space-y-2">
              <Label>QA Notes</Label>
              <Textarea
                value={qaNotes}
                onChange={(event) => setQaNotes(event.target.value)}
                placeholder="Document test results, issues found, or approval note..."
                className="bg-secondary border-border"
                rows={3}
                disabled={!canRunQA}
              />
            </div>
            {canRunQA ? (
              <div className="flex flex-wrap gap-4">
                <Button variant="outline" onClick={handleQAFail}>
                  Send Back To Technician
                </Button>
                <Button onClick={handleQAPass}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  QA Passed - Send To Front Desk
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                QA review is managed by the QA team. Front desk and technicians cannot approve or reject this stage.
              </p>
            )}
          </div>
        )}

        {ticket.status === "warranty_review" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Technician must confirm whether this device is still valid for warranty repair or if the warranty is void.
            </p>
            {canReviewWarranty ? (
              <>
                <div className="space-y-2">
                  <Label>Void Reason (if applicable)</Label>
                  <Input
                    value={warrantyVoidReason}
                    onChange={(e) => setWarrantyVoidReason(e.target.value)}
                    placeholder="e.g., Water damage detected"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="flex gap-4">
                  <Button variant="destructive" onClick={handleWarrantyVoid} disabled={!warrantyVoidReason}>
                    Warranty Void
                  </Button>
                  <Button onClick={handleWarrantyValid}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Warranty Valid - Proceed to Diagnosis
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This ticket is waiting for a technician to complete the warranty review.
              </p>
            )}
          </div>
        )}

        {(ticket.status === "repeat_case_validation_pending" || ticket.status === "warranty_validation_pending") && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This {ticket.intakeType === "warranty" ? "warranty claim" : "repeat return"} is waiting for front desk validation before the repair flow continues.
            </p>
            {canConfirmHandover ? (
              <div className="space-y-4">
                {ticket.intakeType === "warranty" && (
                  <div className="space-y-2">
                    <Label>Validation / Invalidation Notes (Required if invalidating)</Label>
                    <Input
                      value={warrantyVoidReason}
                      onChange={(e) => setWarrantyVoidReason(e.target.value)}
                      placeholder="e.g., Device has physical damage"
                      className="bg-secondary border-border w-full"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-4">
                  {ticket.intakeType === "warranty" ? (
                    <Button variant="destructive" onClick={handleWarrantyVoid} disabled={!warrantyVoidReason.trim()}>
                      Invalidate Warranty
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={handleRepeatCaseCancel}>
                      Cancel Booking
                    </Button>
                  )}
                  <Button onClick={handleWarrantyValid}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Validate Warranty
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Front desk will validate the {ticket.intakeType === "warranty" ? "warranty" : "repeat case"} or cancel the booking.
              </p>
            )}
          </div>
        )}

        {ticket.status === "warranty_void" && (
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                Warranty voided: {ticket.warrantyVoidReason}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Inform customer. If they want repair, create a new ticket.
            </p>
            {canManagePayments && (
              <Button
                variant="outline"
                onClick={() => navigate(`/new-ticket?intakeType=post_warranty&sourceTicketId=${encodeURIComponent(ticket.id)}`)}
              >
                Create New Repair Ticket
              </Button>
            )}
          </div>
        )}

        {isReadyForHandoverStage && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Device passed QA and is waiting for front desk to hand it back to the customer.
            </p>
            {canConfirmHandover ? (
              <Button onClick={handleConfirmCustomerHandover}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Hand Over To Customer
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Front desk will confirm when this device has been handed back to the customer.
              </p>
            )}
          </div>
        )}

        {isCompletedStage && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 mx-auto text-success mb-4" />
            <p className="text-lg font-semibold text-foreground">Ticket Complete</p>
            <p className="text-sm text-muted-foreground mt-1">
              Device was handed back to the customer
              {ticket.handedOverAt ? ` on ${new Date(ticket.handedOverAt).toLocaleString()}` : "."}
              {ticket.handedOverBy ? ` by ${ticket.handedOverBy}.` : ""}
            </p>
          </div>
        )}
      </div>

      <EditCustomerModal
        open={editCustomerOpen}
        onOpenChange={setEditCustomerOpen}
        customer={editCustomerData}
        onUpdated={handleCustomerUpdated}
      />
    </div>
  );
}
