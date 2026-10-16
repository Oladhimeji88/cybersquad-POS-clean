import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AppSettings,
  Customer,
  DEFAULT_SETTINGS,
  DeviceType,
  DEVICE_TYPE_LABELS,
  PAYMENT_MODE_LABELS,
  PaymentMode,
  SignedAgreement,
  TICKET_INTAKE_LABELS,
  Ticket,
  TicketIntakeType,
  createInvoice,
  generateId,
  generateJobId,
  getAuth,
  getLatestInvoiceByTicketAndType,
  getSettings,
  getOnlineBookings,
  getTickets,
  saveOnlineBookings,
  saveTickets,
} from "@/frontdesk/lib/store";
import type { User } from "@/frontdesk/lib/store";
import {
  findWarrantyMatches,
  normalizeDeviceIdentifier,
  type WarrantyLookupMatch,
} from "@/frontdesk/lib/warranty";
import { openJobCardDocument } from "@/frontdesk/lib/agreement";
import { useApi } from "@/hooks/useApi";
import { useDeviceCategories } from "@/hooks/useDeviceCategories";
import { normalizeNigerianPhone, getNigerianPhoneSearchVariants } from "@/utils/phoneNumber";
import termsPdf from "@/frontdesk/assets/terms_and_conditions.pdf";
import { formatCurrency, printInvoice } from "@/frontdesk/lib/invoice";
import { normalizeDeviceCategoryName } from "@/lib/deviceCategories";
import SearchField from "@/frontdesk/components/SearchField";
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
import { getWarrantyRecords, linkWarranty, type WarrantyRecord } from "@/operations/business";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  FileText,
  Loader2,
  Smartphone,
  User as UserIcon,
  X,
} from "lucide-react";
import imageCompression from "browser-image-compression";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const PHONE_NUMBER_LENGTH = 11;
const MAX_IMEI_DIGITS = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIAGNOSIS_BYPASS_PENDING_STATUSES = new Set([
  "new",
  "registered",
  "awaiting_assignment",
  "awaiting_reassignment",
  "unassigned",
]);

function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, PHONE_NUMBER_LENGTH);
}

function limitDigits(value: string, maxDigits: number) {
  let digitCount = 0;

  return Array.from(value)
    .filter((character) => {
      if (!/\d/.test(character)) return true;
      digitCount += 1;
      return digitCount <= maxDigits;
    })
    .join("");
}

function normalizeEmailAddress(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isValidPhoneNumber(value: string) {
  return new RegExp(`^\\d{${PHONE_NUMBER_LENGTH}}$`).test(value.trim());
}

function isValidEmailAddress(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

const FLOW_META: Record<
  TicketIntakeType,
  {
    title: string;
    description: string;
    summaryTitle: string;
    summaryDescription: string;
    submitLabel: string;
    submittingLabel: string;
    successMessage: string;
    summaryNote?: string;
  }
> = {
  post_warranty: {
    title: "Post Warranty Intake",
    description: "Create a standard repair ticket for devices outside active warranty coverage.",
    summaryTitle: "Diagnosis Fee Payment",
    summaryDescription: "Choose payment mode, generate the invoice, and confirm payment before diagnosis starts.",
    submitLabel: "Confirm & Generate Invoice",
    submittingLabel: "Generating...",
    successMessage: "created and pushed to Technician Desk for diagnosis.",
  },
  repeat_return: {
    title: "Repeat Return Intake",
    description: "Create a return ticket for customers still covered by the 3-month repair warranty.",
    summaryTitle: "Repeat Return Review",
    summaryDescription: "Review the details and create the repeat return ticket.",
    submitLabel: "Create Repeat Return Ticket",
    submittingLabel: "Creating...",
    successMessage: "created and sent for warranty review.",
    summaryNote: "This ticket will enter warranty review under the 3-month repeat-return cover.",
  },
  warranty: {
    title: "Amo Device Warranty",
    description: "Start with the serial number or IMEI, then continue the normal intake flow with manual warranty validation later.",
    summaryTitle: "Warranty Review",
    summaryDescription: "Review the details and create the Amo device warranty ticket.",
    submitLabel: "Create Warranty Ticket",
    submittingLabel: "Creating...",
    successMessage: "created and sent for warranty review.",
    summaryNote: "This ticket will enter warranty review under the 1-year Amo device coverage.",
  },
  onsite: {
    title: "Onsite Repair Intake",
    description: "Create an onsite repair request for an organisation that needs a technician visit.",
    summaryTitle: "Onsite Dispatch Review",
    summaryDescription: "Review the onsite request and create the dispatch ticket.",
    submitLabel: "Create Onsite Ticket",
    submittingLabel: "Creating...",
    successMessage: "created and pushed to Technician Desk as an onsite request.",
    summaryNote: "This ticket will be created as an onsite request and pushed directly to the technician desk.",
  },
  corporate: {
    title: "Corporate Bulk Jobs",
    description: "Create a bulk order for a corporate client, then add the individual device jobs under it.",
    summaryTitle: "Bulk Order Review",
    summaryDescription: "Review the bulk order details and create the bulk payment group.",
    submitLabel: "Create Bulk Order",
    submittingLabel: "Creating...",
    successMessage: "bulk order created. You can now start adding individual jobs.",
    summaryNote: "This creates the bulk payment group first. You can add the individual device jobs in the next phase.",
  },
};

const TICKET_TYPE_OPTIONS: TicketIntakeType[] = [
  "post_warranty",
  "repeat_return",
  "warranty",
  "onsite",
];

function normalizeIntakeType(searchParams: URLSearchParams): TicketIntakeType {
  const candidate = searchParams.get("intakeType");
  if (
    candidate === "post_warranty" ||
    candidate === "repeat_return" ||
    candidate === "warranty" ||
    candidate === "onsite" ||
    candidate === "corporate"
  ) {
    return candidate;
  }
  if (searchParams.get("warranty") === "1") {
    return "repeat_return";
  }
  return "post_warranty";
}

type CustomerAddressOption = {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude?: string;
  longitude?: string;
};

function getCustomerAddressOptions(customer: any): CustomerAddressOption[] {
  const profile = customer?.profile;
  const profileAddresses = Array.isArray(profile?.addresses) ? profile.addresses : [];

  const addressOptions = profileAddresses.map((entry: any) => ({
    id: String(entry.id),
    label: entry.label?.trim() || (entry.is_default ? "Default Address" : `Address ${entry.id}`),
    address: [entry.line1, entry.line2].filter(Boolean).join(", "),
    city: entry.city || "",
    state: entry.state || "",
    country: entry.country || "",
    latitude: entry.latitude || undefined,
    longitude: entry.longitude || undefined,
  }));

  if (addressOptions.length > 0) {
    return addressOptions;
  }

  if (profile?.address || profile?.city || profile?.state || profile?.country) {
    return [
      {
        id: "profile-default",
        label: "Profile Address",
        address: profile.address || "",
        city: profile.city || "",
        state: profile.state || "",
        country: profile.country || "",
        latitude: profile.latitude || undefined,
        longitude: profile.longitude || undefined,
      },
    ];
  }

  return [];
}

function getTermsStepIndex(type: TicketIntakeType) {
  if (type === "corporate") return 1;
  return type === "warranty" ? 3 : 2;
}

// Bump when the cached shape changes so stale payloads are dropped instead of
// half-restored into a newer form.
const FORM_CACHE_VERSION = 2;

type FormCache = {
  version: number;
  step: number;
  highestUnlockedStep: number;
  name: string;
  phone: string;
  email: string;
  organizationName: string;
  customerNote: string;
  addressLine: string;
  city: string;
  stateRegion: string;
  country: string;
  latitude: string;
  longitude: string;
  make: string;
  model: string;
  imei: string;
  deviceType: string;
  issueReported: string;
  searchQuery: string;
  foundCustomer: Customer | null;
  foundCustomerId: number | null;
  selectedCustomerProfile: any | null;
  selectedCustomerAddressId: string;
  validatedRepeatJob: any | null;
};

async function dataUrlToFile(dataUrl: string, index: number) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `bulk-job-image-${index + 1}.${extension}`, { type: blob.type || "image/jpeg" });
}

export default function NewTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchParamString = searchParams.toString();
  const requestedIntakeType = normalizeIntakeType(searchParams);
  const draftTicketId = searchParams.get("draftId")?.trim() ?? "";
  const corporateParentJobId = searchParams.get("corporateParentJobId")?.trim() ?? "";
  const corporateChildJobId = searchParams.get("corporateChildJobId")?.trim() ?? "";
  const [draftTicket, setDraftTicket] = useState<Ticket | null>(null);
  const intakeType = draftTicket?.intakeType ?? requestedIntakeType;
  const flow = FLOW_META[intakeType];
  const isOnsite = intakeType === "onsite";
  const isWarrantyFlow = intakeType === "repeat_return" || intakeType === "warranty";
  const isCorporateParentFlow = intakeType === "corporate";
  const requiresDiagnosisPayment = !isWarrantyFlow && !isCorporateParentFlow;
  const isDispatchFlow = isOnsite || isCorporateParentFlow || Boolean(corporateParentJobId);
  
  const steps = isCorporateParentFlow
    ? [
        { label: "Corporate Account", icon: UserIcon },
        { label: "Create Order", icon: ClipboardCheck },
      ]
    : intakeType === "warranty"
    ? [
        { label: "Verify", icon: UserIcon },
        { label: "Customer", icon: UserIcon },
        { label: "Device", icon: Smartphone },
        { label: "Terms", icon: FileText },
        { label: "Review", icon: ClipboardCheck },
      ]
    : [
        { label: "Customer", icon: UserIcon },
        { label: isOnsite ? "System" : "Device", icon: Smartphone },
        { label: "Terms", icon: FileText },
        {
          label: requiresDiagnosisPayment ? "Payment" : isOnsite ? "Dispatch" : "Review",
          icon: requiresDiagnosisPayment ? CreditCard : ClipboardCheck,
        },
      ];

  const warrantyOffset = intakeType === "warranty" ? 1 : 0;
  const isCorp = isCorporateParentFlow;
  const customerDetailsStepIdx = intakeType === "warranty" ? 1 : 0;
  const deviceStepIdx = isCorp ? -1 : 1 + warrantyOffset;
  const termsStepIdx = getTermsStepIndex(intakeType);
  const reviewStepIdx = isCorp ? 2 : 3 + warrantyOffset;
  const maxStep = isCorp ? 2 : 3 + warrantyOffset;

  const customerTitle = isCorporateParentFlow
    ? "Corporate Client Details"
    : isOnsite
    ? "Organisation & Contact"
    : intakeType === "repeat_return"
    ? "Returning Customer Details"
    : intakeType === "warranty"
    ? "Warranty Verification"
    : "Customer Details";
  const customerDescription = isCorporateParentFlow
    ? "Enter the company information to create the bulk payment group for these jobs."
    : isOnsite
    ? "Capture the organisation and primary contact for the onsite request."
    : intakeType === "repeat_return"
    ? "Confirm the customer details and load the previous repair where available."
    : intakeType === "warranty"
    ? "Start with the serial number or IMEI. Manual validation can happen after ticket creation."
    : "Search for an existing customer or enter new repair intake details.";
  const deviceTitle = isOnsite
    ? "System Information"
    : intakeType === "warranty"
    ? "Verified Device & Fault"
    : "Device Information";
  const deviceDescription = isOnsite
    ? "Enter the system or equipment details for the onsite visit."
    : intakeType === "repeat_return"
    ? "Confirm the returning device details before sending the job for warranty review."
    : intakeType === "warranty"
    ? "Serial number or IMEI is prefilled from step one. Continue with the normal intake details."
    : "Enter the faulty device details.";
  const issueLabel = isOnsite ? "Issue / Work Requested" : "Reported Issue";
  const issuePlaceholder = isOnsite
    ? "Describe the repair request or systems affected..."
    : intakeType === "repeat_return"
    ? "Describe the issue customer reported on this return..."
    : "Describe the issue customer reported...";
  const serialLabel = isOnsite ? "Asset Tag / Serial / Location" : "Serial Number /IMEI";
  const serialPlaceholder = isOnsite
    ? "HQ 2nd Floor / Asset 044 / Serial 8989"
    : "352099001761481";

  const [step, setStep] = useState(0);
  const [highestUnlockedStep, setHighestUnlockedStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingJob, setIsSearchingJob] = useState(false);
  const [validatedRepeatJob, setValidatedRepeatJob] = useState<any | null>(null);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [returningTicketCount, setReturningTicketCount] = useState(0);
  const [sourceTicket, setSourceTicket] = useState<Ticket | null>(null);
  const [warrantyLookup, setWarrantyLookup] = useState<WarrantyLookupMatch | null>(null);
  const warrantyRecordId = searchParams.get("warrantyId")?.trim() ?? "";
  const [linkedWarranty, setLinkedWarranty] = useState<WarrantyRecord | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const { api } = useApi();
  const {
    selectableCategories: deviceCategoryOptions,
    defaultCategoryName,
  } = useDeviceCategories({ onlyActive: true, hideOther: true });
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultCategoryName as DeviceType);
  const [issueReported, setIssueReported] = useState("");
  const [deviceImages, setDeviceImages] = useState<string[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [diagnosisFee, setDiagnosisFee] = useState(DEFAULT_SETTINGS.diagnosisFee);
  const [diagnosisPaymentMode, setDiagnosisPaymentMode] = useState<PaymentMode>("pos");
  const [pendingDiagnosisTicket, setPendingDiagnosisTicket] = useState<
    Pick<Ticket, "id" | "jobId" | "diagnosisPaymentMode"> | null
  >(null);
  const [paymentAction, setPaymentAction] = useState<"invoice" | "confirm" | null>(null);
  const [hasGeneratedInvoice, setHasGeneratedInvoice] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherValidation, setVoucherValidation] = useState<{
    loading: boolean;
    error: string | null;
    discountAmount: number;
    finalAmount: number;
    isFullWaiver: boolean;
    validCode: string | null;
  } | null>(null);

  // API-powered state
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<any | null>(null);
  const [selectedCustomerAddressId, setSelectedCustomerAddressId] = useState("");
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [createdJobNumericId, setCreatedJobNumericId] = useState<number | null>(null);
  const [createdCorporateParentId, setCreatedCorporateParentId] = useState<number | null>(null);
  const [createdCorporateParentDisplayId, setCreatedCorporateParentDisplayId] = useState<string | null>(null);
  const [addedChildJobs, setAddedChildJobs] = useState<any[]>([]);
  const [isAddingChildJob, setIsAddingChildJob] = useState(false);
  const [foundCustomerId, setFoundCustomerId] = useState<number | null>(null);
  const [deviceFiles, setDeviceFiles] = useState<File[]>([]);
  const [providerRef, setProviderRef] = useState<string | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const customerAddressOptions = selectedCustomerProfile
    ? getCustomerAddressOptions({ profile: selectedCustomerProfile })
    : [];
  const phoneValue = phone.trim();
  const emailValue = email.trim();
  const hasValidPhoneNumber = isValidPhoneNumber(phoneValue);
  const hasValidEmailAddress = isValidEmailAddress(emailValue);
  const phoneHasError = phoneValue.length > 0 && !hasValidPhoneNumber;
  const emailHasError = emailValue.length > 0 && !hasValidEmailAddress;

  const applyPhoneValue = (value: string) => {
    setPhone(sanitizePhoneNumber(value));
  };

  const applyEmailValue = (value: string) => {
    setEmail(normalizeEmailAddress(value));
  };

  const applyDeviceIdentifierValue = (value: string) => {
    setImei(isOnsite ? value : limitDigits(value, MAX_IMEI_DIGITS));
  };

  const applySearchQueryValue = (value: string) => {
    setSearchQuery(intakeType === "warranty" ? limitDigits(value, MAX_IMEI_DIGITS) : value);
  };

  const validateCustomerContactDetails = (targetStep = customerDetailsStepIdx) => {
    if (foundCustomerId) return true;
    if (!phoneValue || !emailValue) {
      toast.error("Enter the customer's phone number and email before continuing.");
      setStep(targetStep);
      return false;
    }
    if (!hasValidPhoneNumber) {
      toast.error(`Phone number must be exactly ${PHONE_NUMBER_LENGTH} digits.`);
      setStep(targetStep);
      return false;
    }
    if (!hasValidEmailAddress) {
      toast.error("Enter a valid email address like name@example.com.");
      setStep(targetStep);
      return false;
    }
    return true;
  };

  const CACHE_KEY = `newTicketFormCache_${intakeType}`;

  // The save effect must not run until the restore effect below has hydrated this
  // exact key, otherwise mount-time empty state would overwrite the saved draft
  // before it is ever read back.
  const hydratedCacheKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (draftTicketId) return;
    if (hydratedCacheKeyRef.current !== CACHE_KEY) return;

    // Once the backend job exists it shows up in Draft Tickets, and that page is
    // the recovery path from here on. Keeping a form cache past this point would
    // let a reload replay the Terms step and create the same job twice.
    if (createdJobNumericId || createdCorporateParentId || pendingDiagnosisTicket) {
      sessionStorage.removeItem(CACHE_KEY);
      return;
    }

    const dump: FormCache = {
      version: FORM_CACHE_VERSION,
      step,
      highestUnlockedStep,
      name,
      phone,
      email,
      organizationName,
      customerNote,
      addressLine,
      city,
      stateRegion,
      country,
      latitude,
      longitude,
      make,
      model,
      imei,
      deviceType,
      issueReported,
      searchQuery,
      foundCustomer,
      foundCustomerId,
      selectedCustomerProfile,
      selectedCustomerAddressId,
      validatedRepeatJob,
    };

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(dump));
    } catch {
      // Quota or private-mode failures must never break the intake flow.
    }
  }, [
    CACHE_KEY,
    draftTicketId,
    createdJobNumericId,
    createdCorporateParentId,
    pendingDiagnosisTicket,
    step,
    highestUnlockedStep,
    name,
    phone,
    email,
    organizationName,
    customerNote,
    addressLine,
    city,
    stateRegion,
    country,
    latitude,
    longitude,
    make,
    model,
    imei,
    deviceType,
    issueReported,
    searchQuery,
    foundCustomer,
    foundCustomerId,
    selectedCustomerProfile,
    selectedCustomerAddressId,
    validatedRepeatJob,
  ]);

  useEffect(() => {
    if (draftTicketId) return;
    if (
      requestedIntakeType === "onsite" &&
      !(corporateParentJobId && corporateChildJobId)
    ) {
      navigate("/self-service", { replace: true });
    }
  }, [
    corporateChildJobId,
    corporateParentJobId,
    draftTicketId,
    navigate,
    requestedIntakeType,
  ]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getSettings(), getAuth()])
      .then(([appSettings, currentUser]) => {
        if (!mounted) return;
        setSettings(appSettings);
        setAuthUser(currentUser);
        setDiagnosisFee(appSettings.diagnosisFee);
      })
      .catch(() => {
        if (!mounted) return;
        setSettings(DEFAULT_SETTINGS);
        setAuthUser(null);
        setDiagnosisFee(DEFAULT_SETTINGS.diagnosisFee);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const prefillFromLookup = (
    ticketToPrefill: Ticket,
    options?: {
      linkedSourceTicket?: Ticket | null;
      matchedTicketCount?: number;
      warrantyMatch?: WarrantyLookupMatch | null;
      searchValue?: string;
    }
  ) => {
    setSourceTicket(options?.linkedSourceTicket ?? ticketToPrefill);
    setWarrantyLookup(options?.warrantyMatch ?? null);
    setFoundCustomer(ticketToPrefill.customer);
    setReturningTicketCount(options?.matchedTicketCount ?? 0);
    setName(ticketToPrefill.customer.name);
    applyPhoneValue(ticketToPrefill.customer.phone);
    applyEmailValue(ticketToPrefill.customer.email);
    setMake(ticketToPrefill.device.make);
    setModel(ticketToPrefill.device.model);
    setImei(ticketToPrefill.device.imei);
    setDeviceType(normalizeDeviceCategoryName(ticketToPrefill.device.type, defaultCategoryName));
    setSearchQuery(options?.searchValue ?? ticketToPrefill.jobId);
  };

  useEffect(() => {
    const resetIntakeFlow = () => {
      setDraftTicket(null);
      setStep(0);
      setHighestUnlockedStep(0);
      setSearchQuery("");
      setFoundCustomer(null);
      setReturningTicketCount(0);
      setSourceTicket(null);
      setWarrantyLookup(null);
      setName("");
      setPhone("");
      setEmail("");
      setOrganizationName("");
      setAddressLine("");
      setCity("");
      setStateRegion("");
      setCountry("Nigeria");
      setLatitude("");
      setLongitude("");
      setCustomerNote("");
      setMake("");
      setModel("");
      setImei("");
      setDeviceType(defaultCategoryName);
      setIssueReported("");
      setDeviceImages([]);
      setTermsAccepted(false);
      setDiagnosisPaymentMode("pos");
      setPendingDiagnosisTicket(null);
      setPaymentAction(null);
      setHasGeneratedInvoice(false);
      setVoucherCode("");
      setDiagnosisFee(settings.diagnosisFee);
      setCustomerSearchResults([]);
      setSelectedCustomerProfile(null);
      setSelectedCustomerAddressId("");
      setCreatedJobId(null);
      setCreatedJobNumericId(null);
      setFoundCustomerId(null);
      setDeviceFiles([]);
      setProviderRef(null);
    };

    let mounted = true;
    const sourceTicketId = searchParams.get("sourceTicketId")?.trim() ?? "";
    const fromJobId = searchParams.get("fromJobId")?.trim() ?? "";
    const customerName = searchParams.get("customerName")?.trim() ?? "";
    const customerPhone = searchParams.get("customerPhone")?.trim() ?? "";
    const customerEmail = searchParams.get("customerEmail")?.trim() ?? "";
    const seededOrganizationName = searchParams.get("organizationName")?.trim() ?? "";
    const seededAddressLine = searchParams.get("address")?.trim() ?? "";
    const seededCity = searchParams.get("city")?.trim() ?? "";
    const seededState = searchParams.get("state")?.trim() ?? "";
    const seededCountry = searchParams.get("country")?.trim() ?? "";
    const seededLatitude = searchParams.get("latitude")?.trim() ?? "";
    const seededLongitude = searchParams.get("longitude")?.trim() ?? "";
    const seededCustomerNote = searchParams.get("customerNote")?.trim() ?? "";
    const seededDeviceMake = searchParams.get("deviceMake")?.trim() ?? "";
    const seededDeviceModel = searchParams.get("deviceModel")?.trim() ?? "";
    const seededDeviceImei = searchParams.get("imei")?.trim() ?? "";
    const seededIssueReported = searchParams.get("issueReported")?.trim() ?? "";
    const seededDeviceType = searchParams.get("deviceType")?.trim() ?? "";
    const shouldSkipToTerms = searchParams.get("prefillsReady") === "1";

    resetIntakeFlow();

    const restoreKey = `newTicketFormCache_${requestedIntakeType}`;

    if (!draftTicketId && !sourceTicketId && !fromJobId) {
      try {
        const cached = sessionStorage.getItem(restoreKey);
        const parsed: FormCache | null = cached ? JSON.parse(cached) : null;

        if (parsed && parsed.version === FORM_CACHE_VERSION) {
          if (parsed.name) setName(parsed.name);
          if (parsed.phone) setPhone(parsed.phone);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.organizationName) setOrganizationName(parsed.organizationName);
          if (parsed.customerNote) setCustomerNote(parsed.customerNote);
          if (parsed.addressLine) setAddressLine(parsed.addressLine);
          if (parsed.city) setCity(parsed.city);
          if (parsed.stateRegion) setStateRegion(parsed.stateRegion);
          if (parsed.country) setCountry(parsed.country);
          if (parsed.latitude) setLatitude(parsed.latitude);
          if (parsed.longitude) setLongitude(parsed.longitude);
          if (parsed.make) setMake(parsed.make);
          if (parsed.model) setModel(parsed.model);
          if (parsed.imei) setImei(parsed.imei);
          if (parsed.deviceType) {
            setDeviceType(normalizeDeviceCategoryName(parsed.deviceType, defaultCategoryName));
          }
          if (parsed.issueReported) setIssueReported(parsed.issueReported);
          if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);

          // Restoring the resolved customer keeps a second submit from silently
          // creating a duplicate profile for someone we already matched.
          if (parsed.foundCustomer) setFoundCustomer(parsed.foundCustomer);
          if (parsed.foundCustomerId) setFoundCustomerId(parsed.foundCustomerId);
          if (parsed.selectedCustomerProfile) setSelectedCustomerProfile(parsed.selectedCustomerProfile);
          if (parsed.selectedCustomerAddressId) setSelectedCustomerAddressId(parsed.selectedCustomerAddressId);
          if (parsed.validatedRepeatJob) setValidatedRepeatJob(parsed.validatedRepeatJob);

          // Terms acceptance, device photos and any created-job state are
          // deliberately not cached, so never land past the Terms step.
          const restorableCeiling = getTermsStepIndex(requestedIntakeType);
          const cachedStep = Number.isInteger(parsed.step) ? parsed.step : 0;
          const restoredStep = Math.max(0, Math.min(cachedStep, restorableCeiling));
          setStep(restoredStep);
          setHighestUnlockedStep(
            Math.max(
              restoredStep,
              Math.min(
                Number.isInteger(parsed.highestUnlockedStep) ? parsed.highestUnlockedStep : 0,
                restorableCeiling
              )
            )
          );
        } else if (parsed) {
          sessionStorage.removeItem(restoreKey);
        }
      } catch {
        sessionStorage.removeItem(restoreKey);
      }
    }

    // Only now is it safe for the save effect to start writing this key.
    hydratedCacheKeyRef.current = restoreKey;

    void Promise.all([getTickets(), getOnlineBookings()])
      .then(([tickets, onlineBookings]) => {
        if (!mounted) return;

        if (draftTicketId) {
          const foundDraft =
            tickets.find(
              (ticket) =>
                ticket.id === draftTicketId && ticket.status === "awaiting_diagnosis_payment"
            ) ?? null;

          if (!foundDraft) {
            toast.error("Draft ticket could not be opened for editing.");
            navigate("/drafts", { replace: true });
            return;
          }

          const matchedTickets = tickets.filter(
            (ticket) =>
              ticket.customer.phone.trim().toLowerCase() === foundDraft.customer.phone.trim().toLowerCase() ||
              ticket.customer.email.trim().toLowerCase() === foundDraft.customer.email.trim().toLowerCase()
          );
          const linkedSourceTicket = foundDraft.sourceTicketId
            ? tickets.find((ticket) => ticket.id === foundDraft.sourceTicketId) ?? null
            : null;

          setDraftTicket(foundDraft);
          setSourceTicket(linkedSourceTicket);
          setFoundCustomer(foundDraft.customer);
          setReturningTicketCount(matchedTickets.length);
          setName(foundDraft.customer.name);
          applyPhoneValue(foundDraft.customer.phone);
          applyEmailValue(foundDraft.customer.email);
          setOrganizationName(foundDraft.organizationName ?? "");
          setAddressLine((foundDraft as any).address ?? "");
          setCity((foundDraft as any).city ?? "");
          setStateRegion((foundDraft as any).state ?? "");
          setCountry((foundDraft as any).country ?? "Nigeria");
          setLatitude((foundDraft as any).latitude ?? "");
          setLongitude((foundDraft as any).longitude ?? "");
          setCustomerNote(foundDraft.customerNote ?? "");
          setMake(foundDraft.device.make);
          setModel(foundDraft.device.model);
          setImei(foundDraft.device.imei);
          setDeviceType(normalizeDeviceCategoryName(foundDraft.device.type, defaultCategoryName));
          setIssueReported(foundDraft.issueReported ?? "");
          setDeviceImages(foundDraft.device.images ?? []);
          setTermsAccepted(foundDraft.termsAccepted);
          setDiagnosisFee(foundDraft.diagnosisFee);
          setDiagnosisPaymentMode(foundDraft.diagnosisPaymentMode);
          setPendingDiagnosisTicket({
            id: foundDraft.id,
            jobId: foundDraft.jobId,
            diagnosisPaymentMode: foundDraft.diagnosisPaymentMode,
          });
          setSearchQuery(foundDraft.jobId);
          setStep(3);
          setHighestUnlockedStep(3);
          return;
        }

        if (customerName) setName(customerName);
        if (customerPhone) applyPhoneValue(customerPhone);
        if (customerEmail) applyEmailValue(customerEmail);
        if (seededOrganizationName) setOrganizationName(seededOrganizationName);
        if (seededAddressLine) setAddressLine(seededAddressLine);
        if (seededCity) setCity(seededCity);
        if (seededState) setStateRegion(seededState);
        if (seededCountry) setCountry(seededCountry);
        if (seededLatitude) setLatitude(seededLatitude);
        if (seededLongitude) setLongitude(seededLongitude);
        if (seededCustomerNote) setCustomerNote(seededCustomerNote);
        if (seededDeviceMake) setMake(seededDeviceMake);
        if (seededDeviceModel) setModel(seededDeviceModel);
        if (seededDeviceImei) setImei(seededDeviceImei);
        if (seededIssueReported) setIssueReported(seededIssueReported);
        if (seededDeviceType) {
          setDeviceType(normalizeDeviceCategoryName(seededDeviceType, defaultCategoryName));
        }

        if (corporateParentJobId && corporateChildJobId) {
          const matchingBooking = onlineBookings.find((booking) => booking.id === corporateParentJobId);
          const matchingChild = matchingBooking?.childJobs.find((childJob) => childJob.childJobId === corporateChildJobId);
          if (matchingBooking) {
            if (matchingBooking.customerId) {
              setFoundCustomerId(Number(matchingBooking.customerId));
            }
            setOrganizationName(matchingBooking.companyName || seededOrganizationName);
            setName(matchingBooking.customerName || customerName);
            applyPhoneValue(matchingBooking.customerPhone || customerPhone);
            applyEmailValue(matchingBooking.customerEmail || customerEmail);
            setAddressLine(matchingChild?.address || matchingBooking.address || seededAddressLine);
            setCity(matchingChild?.city || matchingBooking.city || seededCity);
            setStateRegion(matchingChild?.state || matchingBooking.state || seededState);
            setCountry(matchingChild?.country || matchingBooking.country || seededCountry || "Nigeria");
            setLatitude(matchingChild?.latitude || matchingBooking.latitude || seededLatitude);
            setLongitude(matchingChild?.longitude || matchingBooking.longitude || seededLongitude);
            setMake(matchingChild?.deviceMake || seededDeviceMake);
            setModel(matchingChild?.deviceModel || seededDeviceModel);
            setImei(matchingChild?.serialNumber || seededDeviceImei);
            setIssueReported(matchingChild?.issueReported || seededIssueReported);
            setDeviceType(
              normalizeDeviceCategoryName(
                String(matchingChild?.deviceType || seededDeviceType),
                defaultCategoryName
              )
            );
            if (Array.isArray(matchingChild?.images) && matchingChild.images.length > 0) {
              setDeviceImages(matchingChild.images);
              void Promise.all(matchingChild.images.map((image, index) => dataUrlToFile(image, index)))
                .then((files) => {
                  if (!mounted) return;
                  setDeviceFiles(files);
                })
                .catch(() => {
                  console.error("Failed to rebuild uploaded child images for job creation");
                });
            }
            if (matchingChild?.backendJobId && matchingChild?.backendDisplayId) {
              setCreatedJobNumericId(Number(matchingChild.backendJobId));
              setCreatedJobId(matchingChild.backendDisplayId);
              setPendingDiagnosisTicket({
                id: String(matchingChild.backendJobId),
                jobId: matchingChild.backendDisplayId,
                diagnosisPaymentMode,
              });
            }
          }
        }

        const seededSearch = fromJobId || customerPhone || customerEmail;
        if (seededSearch) setSearchQuery(seededSearch);

        if (shouldSkipToTerms) {
          setStep(termsStepIdx);
          setHighestUnlockedStep(termsStepIdx);
        }

        if (!sourceTicketId) {
          setSourceTicket(null);
          return;
        }

        const found = tickets.find((ticket) => ticket.id === sourceTicketId) ?? null;
        setSourceTicket(found);
        if (!found) return;
        if (requestedIntakeType === "warranty") {
          const exactWarrantyMatch =
            findWarrantyMatches(tickets, found.device.imei).find(
              (match) =>
                normalizeDeviceIdentifier(match.serialNumber) ===
                normalizeDeviceIdentifier(found.device.imei)
            ) ?? null;
          const referenceTicket = exactWarrantyMatch?.latestTicket ?? found;
          prefillFromLookup(referenceTicket, {
            linkedSourceTicket: exactWarrantyMatch?.sourceTicket ?? found,
            matchedTicketCount: exactWarrantyMatch?.matchedTickets.length ?? 1,
            warrantyMatch: exactWarrantyMatch,
            searchValue: referenceTicket.device.imei,
          });
          return;
        }
        const matchedTickets = tickets.filter(
          (ticket) =>
            ticket.customer.phone.trim().toLowerCase() === found.customer.phone.trim().toLowerCase() ||
            ticket.customer.email.trim().toLowerCase() === found.customer.email.trim().toLowerCase()
        );
        prefillFromLookup(found, {
          linkedSourceTicket: found,
          matchedTicketCount: matchedTickets.length,
        });
      })
      .catch(() => {
        if (!mounted) return;
        if (draftTicketId) {
          toast.error("Draft ticket could not be loaded.");
          navigate("/drafts", { replace: true });
          return;
        }
        setSourceTicket(null);
      });

    return () => {
      mounted = false;
    };
  }, [draftTicketId, navigate, searchParamString]);

  useEffect(() => {
    if (!warrantyRecordId) { setLinkedWarranty(null); return; }
    let mounted = true;
    getWarrantyRecords().then((records) => {
      const record = records.find((entry) => entry.id === warrantyRecordId);
      if (!mounted) return;
      if (!record || record.returned) { toast.error("That warranty record is not available for intake."); return; }
      setLinkedWarranty(record);
      setName(record.customer.name);
      setPhone(record.customer.phone);
      if (record.customer.email) setEmail(record.customer.email);
      if (record.make) setMake(record.make);
      if (record.model) setModel(record.model);
      if (record.serial) setImei(record.serial);
    }).catch(() => toast.error("Could not load the original warranty record."));
    return () => { mounted = false; };
  }, [warrantyRecordId]);

  useEffect(() => {
    if (corporateParentJobId && step === 0) {
      setStep(1);
      setHighestUnlockedStep(1);
    }
  }, [corporateParentJobId, step]);

  const buildSignedAgreement = (): SignedAgreement | null => {
    if (!termsAccepted) {
      toast.error("Terms must be accepted before agreement generation.");
      return null;
    }
    if (!validateCustomerContactDetails()) {
      return null;
    }
    return {
      id: `AGR-${generateId().toUpperCase()}`,
      acceptedAt: new Date().toISOString(),
      customerName: name.trim(),
      customerPhone: phoneValue,
      customerEmail: emailValue,
      termsSnapshot: settings.termsAndConditions,
      storeLocation: authUser?.storeLocation,
    };
  };

  const handleGenerateJobCardDocument = () => {
    const agreement = buildSignedAgreement();
    if (!agreement) return;
    const jobCardInput = {
      agreementId: agreement.id,
      acceptedAt: agreement.acceptedAt,
      customerName: agreement.customerName,
      customerPhone: agreement.customerPhone,
      customerEmail: agreement.customerEmail,
      organizationName: organizationName.trim(),
      deviceLabel: `${DEVICE_TYPE_LABELS[deviceType]} - ${make} ${model}`.trim(),
      deviceIdentifier: `${serialLabel}: ${imei}`,
      issueReported: issueReported.trim(),
      deviceTypeLabel: DEVICE_TYPE_LABELS[deviceType],
      deviceMake: make.trim(),
      deviceModel: model.trim(),
      frontDeskAgent: authUser?.name,
      termsText: agreement.termsSnapshot,
      businessName: settings.businessName,
      jobId: createdJobId ?? pendingDiagnosisTicket?.jobId,
      storeLocation: agreement.storeLocation,
    };
    openJobCardDocument(jobCardInput);
    toast.success("Customer job card opened. Use Save as PDF in the print dialog to download it.");
  };

  const buildTicketRecord = (
    signedAgreement: SignedAgreement,
    options?: {
      existingTicket?: Ticket;
      status?: Ticket["status"];
      diagnosisPaymentReceivedAt?: string;
    }
  ): Ticket => {
    const existingTicket = options?.existingTicket;
    const now = new Date().toISOString();
    const customer: Customer = {
      id: foundCustomer?.id || existingTicket?.customer.id || generateId(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };

    return {
      id: existingTicket?.id ?? generateId(),
      jobId: existingTicket?.jobId ?? generateJobId(),
      customer,
      device: {
        make: make.trim(),
        model: model.trim(),
        imei: imei.trim(),
        images: deviceImages,
        type: deviceType,
      },
      intakeType,
      organizationName: organizationName.trim() || undefined,
      sourceTicketId: sourceTicket?.id ?? existingTicket?.sourceTicketId,
      issueReported: issueReported.trim(),
      customerNote: customerNote.trim() || undefined,
      status:
        options?.status ??
        (isWarrantyFlow ? "warranty_review" : requiresDiagnosisPayment ? "awaiting_diagnosis_payment" : "diagnosing"),
      isWarranty: isWarrantyFlow,
      diagnosisFee,
      diagnosisPaymentMode: diagnosisPaymentMode ?? existingTicket?.diagnosisPaymentMode ?? "cash",
      ...(options?.diagnosisPaymentReceivedAt
        ? { diagnosisPaymentReceivedAt: options.diagnosisPaymentReceivedAt }
        : {}),
      repairPaymentMode: existingTicket?.repairPaymentMode ?? "cash",
      agreement: signedAgreement,
      createdAt: existingTicket?.createdAt ?? now,
      updatedAt: now,
      termsAccepted,
    };
  };

  // ── API: Create job via /jobs/admin/walk-in/ ──────────────────────────────
  const handleCreateJob = async (): Promise<{ numericId: number; displayId: string; status?: string } | null> => {
    if (createdJobNumericId && createdJobId) {
      return { numericId: createdJobNumericId, displayId: createdJobId };
    }

    const userStr = localStorage.getItem("user");
    let storeId: number | undefined;
    let receivedById: number | undefined;
    if (userStr) {
      const parsed = JSON.parse(userStr);
      storeId = parsed.assigned_stores?.[0]?.id ?? parsed.user?.assigned_stores?.[0]?.id;
      receivedById = parsed.id ?? parsed.user?.id;
    }

    if (!storeId) {
      toast.error("Store ID not found. Please log out and log in again.");
      return null;
    }
    if (!validateCustomerContactDetails()) {
      return null;
    }

    // Silently create customer if none found
    let customerId = foundCustomerId;
    if (!customerId && corporateParentJobId) {
      try {
        const onlineBookings = await getOnlineBookings();
        const matchingBooking = onlineBookings.find((booking) => booking.id === corporateParentJobId);
        if (matchingBooking?.customerId) {
          customerId = Number(matchingBooking.customerId);
          setFoundCustomerId(customerId);
        }
      } catch (error) {
        console.error("Failed to load bulk order customer id", error);
      }
    }
    if (!customerId) {
      if (intakeType !== "warranty" && (!name.trim() || (!foundCustomerId && (!phone.trim() || !email.trim())))) {
        toast.error("Complete the customer details to create a new profile.");
        setStep(0);
        return null;
      }
      const trimmedPhone = phone.trim();
      let contactPhoneForCreate = "0000000000";
      if (trimmedPhone) {
        const normalizedPhone = normalizeNigerianPhone(trimmedPhone);
        if (!normalizedPhone) {
          toast.error("Please enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678");
          setStep(0);
          return null;
        }
        contactPhoneForCreate = normalizedPhone;
      }
      try {
        const createRes = await api.post("/users/profile/customers/front-desk-create/", {
          full_name: name.trim() || "Warranty Customer",
          contact_email: email.trim() || `warranty_walkin_${Date.now()}@intake.local`,
          contact_phone_number: contactPhoneForCreate,
          intake_notes: "",
        });
        customerId = createRes.data?.result?.id ?? createRes.data?.id;
        if (!customerId) throw new Error("Customer ID missing from response");
        setFoundCustomerId(customerId);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "Failed to create customer. Check name/contact details.");
        return null;
      }
    }

    const uploadFiles =
      deviceFiles.length > 0
        ? deviceFiles
        : deviceImages.length > 0
        ? await Promise.all(deviceImages.map((image, index) => dataUrlToFile(image, index)))
        : [];

    const formData = new FormData();
    formData.append("service_id", "31");
    formData.append("customer_id", String(customerId));
    formData.append("title", `${make.trim()} ${model.trim()} – ${issueReported.trim()}`.slice(0, 120));
    formData.append("description", issueReported.trim());
    formData.append("brand", make.trim());
    formData.append("model_name", model.trim());
    formData.append("device_type", deviceType);
    formData.append("serial_imei", imei.trim());
    formData.append("store_id", String(storeId));
    formData.append("requires_inventory_validation", "true");
    formData.append("is_warranty_claim", String(intakeType === "warranty"));
    formData.append("is_repeat_case", String(intakeType === "repeat_return"));
    uploadFiles.forEach((file, idx) => {
      formData.append(`media[${idx}][kind]`, "damage");
      formData.append(`media[${idx}][caption]`, `Device image ${idx + 1}`);
      formData.append(`media[${idx}][file]`, file);
    });

    if (corporateParentJobId) {
      formData.append("parent_job_id", corporateParentJobId);
    }
    if (addressLine.trim()) {
      formData.append("address", addressLine.trim());
    }
    if (city.trim()) {
      formData.append("city", city.trim());
    }
    if (stateRegion.trim()) {
      formData.append("state", stateRegion.trim());
    }
    if (country.trim()) {
      formData.append("country", country.trim());
    }
    if (latitude.trim()) {
      formData.append("latitude", latitude.trim());
    }
    if (longitude.trim()) {
      formData.append("longitude", longitude.trim());
    }

    // Safety check: Backend Nginx configuration restricts payloads to 1MB total.
    const totalPayloadSize = uploadFiles.reduce((acc, file) => acc + file.size, 0);
    if (totalPayloadSize > 0.95 * 1024 * 1024) {
      throw new Error(`Total size of selected images (${(totalPayloadSize / 1024 / 1024).toFixed(2)} MB) is too large for the backend limit (1 MB). Please remove some images.`);
    }

    const endpoint = (intakeType === "onsite" || corporateParentJobId) ? "/jobs/admin/child/" : "/jobs/admin/walk-in/";
    const res = await api.post(endpoint, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!res.data?.success) throw new Error(res.data?.message || "Job creation failed");

    const job = res.data.result;
    if (linkedWarranty) {
      try { await linkWarranty(String(job.id), linkedWarranty); }
      catch { toast.error("Ticket created, but the original warranty could not be linked."); }
    }
    let latestStatus = typeof job.status === "string" ? job.status : undefined;
    if (intakeType === "post_warranty" || intakeType === "onsite" || Boolean(corporateParentJobId)) {
      latestStatus = (await autoAssignTechnician(job.id)) ?? latestStatus;
    }
    setCreatedJobId(job.display_id);
    setCreatedJobNumericId(job.id);
    setPendingDiagnosisTicket({
      id: String(job.id),
      jobId: job.display_id,
      diagnosisPaymentMode: diagnosisPaymentMode ?? "cash",
    });

    if (corporateParentJobId && corporateChildJobId) {
      try {
        const bookings = await getOnlineBookings();
        const nextBookings = bookings.map((booking) =>
          booking.id !== corporateParentJobId
            ? booking
            : {
                ...booking,
                childJobs: booking.childJobs.map((childJob) =>
                  childJob.childJobId !== corporateChildJobId
                    ? childJob
                    : {
                        ...childJob,
                        intakeTicketId: String(job.id),
                        backendJobId: String(job.id),
                        backendDisplayId: String(job.display_id),
                        address: addressLine.trim() || childJob.address,
                        city: city.trim() || childJob.city,
                        state: stateRegion.trim() || childJob.state,
                        country: country.trim() || childJob.country,
                        latitude: latitude.trim() || childJob.latitude,
                        longitude: longitude.trim() || childJob.longitude,
                      }
                ),
              }
        );
        await saveOnlineBookings(nextBookings);
      } catch (error) {
        console.error("Failed to sync bulk job metadata", error);
      }
    }
    return { numericId: job.id, displayId: job.display_id, status: latestStatus };
  };

  // ── Auto-assign technician in background after job creation ─────────────
  const autoAssignTechnician = async (jobNumericId: number): Promise<string | undefined> => {
    try {
      const res = await api.post(`/jobs/${jobNumericId}/admin/assign-manual/`, {});
      const nextStatus = res.data?.result?.status;
      return typeof nextStatus === "string" ? nextStatus : undefined;
    } catch {
      // Silently fail — technician can be assigned later from ticket detail
      console.warn(`Auto-assign failed for job ${jobNumericId}`);
      return undefined;
    }
  };

  // ── Generate Invoice ───────────────────────────────────────────────────────
  const handleGenerateDiagnosisInvoice = async () => {
    if (!requiresDiagnosisPayment || isSubmitting) return;
    if (!diagnosisPaymentMode) {
      toast.error("Select payment mode before generating the invoice.");
      return;
    }

    setIsSubmitting(true);
    setPaymentAction("invoice");
    try {
      const job = await handleCreateJob();
      if (!job) return;

      const modePrefix = diagnosisPaymentMode === "pos" ? "POS" : diagnosisPaymentMode === "bank_transfer" ? "TRF" : "CASH";
      const ref =
        providerRef && pendingDiagnosisTicket?.diagnosisPaymentMode === diagnosisPaymentMode
          ? providerRef
          : `${modePrefix}-${job.displayId}-${Date.now()}`;
      setProviderRef(ref);

      const finalDiagnosisFee = voucherValidation?.validCode ? voucherValidation.finalAmount : diagnosisFee;

      const invoice = await createInvoice({
        ticketId: String(job.numericId),
        jobId: job.displayId,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        deviceLabel: `${make} ${model}`.trim(),
        type: "diagnosis_fee",
        description: "Diagnosis fee payment",
        amount: finalDiagnosisFee,
        paymentMode: diagnosisPaymentMode ?? "cash",
      });

      // Build a minimal local ticket shape for printInvoice
      const localTicket = {
        jobId: job.displayId,
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
        device: { make: make.trim(), model: model.trim(), imei: imei.trim(), images: [], type: deviceType },
        diagnosisFee: finalDiagnosisFee,
        diagnosisPaymentMode,
      } as any;

      printInvoice(invoice, localTicket, settings);
      setHasGeneratedInvoice(true);
      toast.success(`Invoice generated for ${job.displayId}.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to generate invoice.");
    } finally {
      setIsSubmitting(false);
      setPaymentAction(null);
    }
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) {
      toast.error("Enter a voucher code.");
      return;
    }

    setVoucherValidation({
      loading: true,
      error: null,
      discountAmount: 0,
      finalAmount: diagnosisFee,
      isFullWaiver: false,
      validCode: null,
    });

    try {
      const response = await api.post(
        "/vouchers/validate/",
        {
          code: voucherCode.trim().toUpperCase(),
          amount: String(diagnosisFee),
          payment_type: "diagnosis_fee",
        },
        { showLoader: false }
      );

      const result = response?.data?.result;
      if (result) {
        setVoucherValidation({
          loading: false,
          error: null,
          discountAmount: result.discount_amount,
          finalAmount: result.final_amount,
          isFullWaiver: result.is_full_waiver,
          validCode: result.voucher_code,
        });
        toast.success(`Voucher applied! Discount: NGN ${result.discount_amount.toLocaleString()}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.fields?.voucher_code?.[0] ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Voucher validation failed.";
      setVoucherValidation({
        loading: false,
        error: message,
        discountAmount: 0,
        finalAmount: diagnosisFee,
        isFullWaiver: false,
        validCode: null,
      });
      toast.error(message);
    }
  };

  // ── Confirm Payment ────────────────────────────────────────────────────────
  const handleConfirmDiagnosisPayment = async () => {
    if (!requiresDiagnosisPayment || isSubmitting) return;
    if (!pendingDiagnosisTicket) {
      toast.error("Generate the invoice before confirming payment.");
      return;
    }
    if (!diagnosisPaymentMode) {
      toast.error("Select a payment mode.");
      return;
    }

    const userStr = localStorage.getItem("user");
    let receivedById: number | undefined;
    if (userStr) {
      const parsed = JSON.parse(userStr);
      receivedById = parsed.id ?? parsed.user?.id;
    }

    const providerMap: Record<string, { provider: string; payment_method: string }> = {
      cash: { provider: "manual_entry_cash", payment_method: "cash" },
      pos: { provider: "manual_entry_card", payment_method: "card_pos" },
      bank_transfer: { provider: "manual_entry_bank_transfer", payment_method: "bank_transfer" },
    };
    const paymentConfig = providerMap[diagnosisPaymentMode] ?? providerMap.cash;
    const ref = providerRef ?? `${paymentConfig.provider.toUpperCase()}-${Date.now()}`;

    setIsSubmitting(true);
    setPaymentAction("confirm");
    try {
      const jobNumericId = createdJobNumericId;
      if (!jobNumericId) {
        toast.error("Job not found. Generate the invoice first.");
        return;
      }

      await api.post("/payments/admin/", {
        job: jobNumericId,
        type: "diagnosis_fee",
        currency: "NGN",
        status: "SUCCEEDED",
        provider: paymentConfig.provider,
        payment_channel: corporateParentJobId ? "corporate" : "walk_in",
        payment_method: paymentConfig.payment_method,
        received_by: receivedById,
        is_manual_entry: true,
        provider_ref: ref,
        ...(voucherCode.trim() ? { voucher_code: voucherCode.trim() } : {}),
      });
      if (corporateParentJobId && corporateChildJobId) {
        try {
          const bookings = await getOnlineBookings();
          const nextBookings = bookings.map((booking) =>
            booking.id !== corporateParentJobId
              ? booking
              : {
                  ...booking,
                  childJobs: booking.childJobs.map((childJob) =>
                    childJob.childJobId !== corporateChildJobId
                      ? childJob
                      : {
                          ...childJob,
                          paymentStatus: "paid",
                          intakeTicketId: childJob.intakeTicketId ?? String(jobNumericId),
                          backendJobId: childJob.backendJobId ?? String(jobNumericId),
                          backendDisplayId:
                            childJob.backendDisplayId ?? createdJobId ?? pendingDiagnosisTicket?.jobId,
                        }
                  ),
                }
          );
          await saveOnlineBookings(nextBookings);
        } catch (error) {
          console.error("Failed to sync bulk child payment state", error);
        }
      }

      sessionStorage.removeItem(CACHE_KEY);
      toast.success(`Payment confirmed for ${pendingDiagnosisTicket.jobId}. Ticket pushed to diagnosis!`);
      navigate(corporateParentJobId ? "/self-service" : "/dashboard");
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Payment failed. Check details and retry.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
      setPaymentAction(null);
    }
  };

  // ── Step 2 → 3: Create job then proceed to payment ─────────────────────────
  const handleProceedToPayment = async () => {
    if (!termsAccepted || isCreatingJob) return;
    setIsCreatingJob(true);
    try {
      const job = await handleCreateJob();
      if (!job) return;

      let currentStatus = String(job.status || "").trim();
      if (!currentStatus || DIAGNOSIS_BYPASS_PENDING_STATUSES.has(currentStatus)) {
        for (let i = 0; i < 4; i++) {
          await new Promise((res) => setTimeout(res, 1000));
          try {
            const freshJob = await api.get(`/jobs/${job.numericId}/`);
            currentStatus = String(freshJob.data?.result?.status || "").trim();
            if (currentStatus === "diagnosing" || currentStatus === "awaiting_diagnosis_fee") {
              break;
            }
          } catch (e) {}
        }
      }

      if (currentStatus === "diagnosing") {
        sessionStorage.removeItem(CACHE_KEY);
        toast.success(`Ticket ${job.displayId} created and bypassed diagnosis fee.`);
        navigate(`/ticket/${String(job.numericId)}`);
        return;
      }

      toast.success(`Ticket ${job.displayId} created. Now collect payment.`);
      const nextStep = reviewStepIdx;
      setStep(nextStep);
      setHighestUnlockedStep((current) => Math.max(current, nextStep));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create ticket.");
    } finally {
      setIsCreatingJob(false);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const processImages = async (files: File[]) => {
    if (files.length === 0) return;
    const validFiles: File[] = [];
    let invalidTypeCount = 0;
    let invalidSizeCount = 0;

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        invalidTypeCount += 1;
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        invalidSizeCount += 1;
        continue;
      }
      validFiles.push(file);
    }

    if (invalidTypeCount > 0) {
      toast.error(
        `${invalidTypeCount} file${invalidTypeCount === 1 ? "" : "s"} skipped. Only PNG and JPG are allowed.`
      );
    }
    if (invalidSizeCount > 0) {
      toast.error(
        `${invalidSizeCount} file${invalidSizeCount === 1 ? "" : "s"} skipped. Max size is 5MB each.`
      );
    }
    if (validFiles.length === 0) return;

    try {
      // Compress images before storing them
      const options = {
        maxSizeMB: 0.1, // 100KB max per image
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };

      const compressedFiles = await Promise.all(
        validFiles.map((file) => imageCompression(file, options))
      );

      const dataUrls = await Promise.all(compressedFiles.map(readFileAsDataUrl));
      setDeviceImages((prev) => [...prev, ...dataUrls]);
      setDeviceFiles((prev) => [...prev, ...compressedFiles]);
      toast.success(`${dataUrls.length} image${dataUrls.length === 1 ? "" : "s"} added.`);
    } catch {
      toast.error("Some images could not be processed or compressed.");
    }
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    void processImages(Array.from(files));
    event.target.value = "";
  };

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingImages(false);
    void processImages(Array.from(event.dataTransfer.files));
  };

  const normalizeDisplayId = (value: unknown) => String(value || "").trim().toUpperCase();

  // ── Customer search via real API ───────────────────────────────────────────
  const searchExistingJob = async () => {
    const rawSearch = searchQuery.trim();
    const normalizedSearch = normalizeDisplayId(rawSearch);
    if (!rawSearch) {
      toast.error("Enter the full Display ID exactly as shown (e.g., JOB-RFE7L-BTULY).");
      return;
    }

    if (!normalizedSearch.startsWith("JOB-")) {
      toast.error("Incorrect ID. Check and try again.");
      return;
    }

    setIsSearchingJob(true);
    try {
      const bookingsRes = await api.get("/jobs/admin/bookings/", {
        params: {
          display_id: normalizedSearch,
          page_size: 100,
        },
      });
      const bookings = Array.isArray(bookingsRes.data?.result) ? bookingsRes.data.result : [];
      const exactMatch = bookings.find(
        (job: any) => normalizeDisplayId(job.display_id) === normalizedSearch
      );

      if (!exactMatch?.id) {
        if (bookings.length > 0) {
          toast.error("Enter the full Display ID exactly as shown on the original job.");
        } else {
          toast.error("Job not found. Check the Display ID and try again.");
        }
        setValidatedRepeatJob(null);
        return;
      }

      const res = await api.get(`/jobs/${exactMatch.id}/`);
      if (res.data?.success && res.data?.result) {
        verifyRepeatReturnJob(res.data.result);
      } else {
        throw new Error("Job not found");
      }
    } catch {
      toast.error("Job not found. Check the Display ID and try again.");
      setValidatedRepeatJob(null);
    } finally {
      setIsSearchingJob(false);
    }
  };

  const verifyRepeatReturnJob = (job: any) => {
    // Check 1: Must be delivered (skip for now if you want, but strict rule says delivered)
    // Actually the prompt says "is within the last 3 months ... and status was delivered"
    // We'll allow "delivered" and maybe "closed" as finished states.
    if (job.status !== "delivered" && job.status !== "closed") {
      toast.error(`Job is still in progress (${job.status}). Cannot create a repeat return.`);
      return;
    }

    // Check 2: Created at < 3 months ago (roughly 90 days)
    const createdAt = new Date(job.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      toast.error("This job is older than 3 months. The warranty has expired. Please create a standard Walk-In ticket.");
      setValidatedRepeatJob(null);
      return;
    }

    // All clear! Inject the customer and device details
    toast.success("Job validated! Warranty active. Pre-filling customer and device details.");
    setValidatedRepeatJob(job);
    
    // Set matching Customer Info
    const c = job.customer;
    if (c) {
      setName(c.name || "");
      applyPhoneValue(c.phone_number || "");
      applyEmailValue(c.email || "");
      setFoundCustomerId(c.id);
      setFoundCustomer({ id: String(c.id), name: c.name || "", phone: c.phone_number || "", email: c.email || "" });
    }

    // Set matching Device Info
    setMake(job.brand || "");
    setModel(job.model_name || "");
    setImei(job.serial_imei || "");
    setDeviceType(normalizeDeviceCategoryName(job.device_type, defaultCategoryName));
    setIssueReported(job.description || "");
  };

  const searchWarrantySerial = async () => {
    const rawSearch = searchQuery.trim();
    if (!rawSearch) {
      toast.error("Enter the device serial number or IMEI.");
      return;
    }

    applyDeviceIdentifierValue(rawSearch);
    setWarrantyLookup(null);
    toast.info("Could not validate from Odoo. Manual validation will be needed after ticket creation.");
  };

  const searchExistingCustomer = async () => {
    const rawSearch = searchQuery.trim();
    if (!rawSearch) {
      toast.error(
        intakeType === "warranty"
          ? "Enter the device serial number or IMEI."
          : "Enter job ID, phone, or email."
      );
      return;
    }

    setIsSearchingCustomer(true);
    setCustomerSearchResults([]);
    setFoundCustomer(null);
    setFoundCustomerId(null);
    setSelectedCustomerProfile(null);
    setSelectedCustomerAddressId("");

    try {
      const phoneVariants: string[] = getNigerianPhoneSearchVariants(rawSearch);
      const promises = [
        ...phoneVariants.map((phone) =>
          api.get("/users/profile/customers/", { params: { phone_number: phone } }).catch(() => null)
        ),
        api.get("/users/profile/customers/", { params: { email: rawSearch } }).catch(() => null),
        api.get("/users/profile/customers/", { params: { job_id: rawSearch } }).catch(() => null),
      ];

      const responses = await Promise.all(promises);
      const allResults: any[] = [];
      
      responses.forEach((res) => {
        if (res?.data?.result && Array.isArray(res.data.result)) {
          allResults.push(...res.data.result);
        }
      });

      // Deduplicate by customer id
      const uniqueResults = Array.from(new Map(allResults.map((item) => [item.id, item])).values());
      const results: any[] = uniqueResults;

      if (results.length === 0) {
        toast.info("No customer found. Fill in details below to create a new walk-in customer.");
        return;
      }

      if (results.length === 1) {
        selectCustomerFromResult(results[0]);
        return;
      }

      setCustomerSearchResults(results);
      toast.info(`${results.length} customers found. Select one below.`);
    } catch {
      toast.error("Customer search failed. Enter details manually.");
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const selectCustomerFromResult = (customer: any) => {
    const fullName =
      customer.profile?.full_name ||
      `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
    const phone = customer.phone_number ?? "";
    const email = customer.email ?? "";
    const profile = customer.profile ?? null;
    const addressOptions = getCustomerAddressOptions(customer);
    const defaultAddress =
      addressOptions.find((entry) => entry.label === "Default Address") ?? addressOptions[0] ?? null;
    setFoundCustomer({ id: String(customer.id), name: fullName, phone, email });
    setFoundCustomerId(customer.id);
    setName(fullName);
    if ((isOnsite || isCorporateParentFlow) && !organizationName.trim()) {
      setOrganizationName(fullName);
    }
    applyPhoneValue(phone);
    applyEmailValue(email);
    setSelectedCustomerProfile(profile);
    setSelectedCustomerAddressId(defaultAddress?.id ?? "");
    if (defaultAddress) {
      setAddressLine(defaultAddress.address);
      setCity(defaultAddress.city);
      setStateRegion(defaultAddress.state);
      setCountry(defaultAddress.country || "Nigeria");
      setLatitude(defaultAddress.latitude ?? "");
      setLongitude(defaultAddress.longitude ?? "");
    }
    setReturningTicketCount(customer.stats?.total_jobs ?? 0);
    setCustomerSearchResults([]);
    toast.success(
      `Customer loaded – ${customer.stats?.total_jobs ?? 0} previous job${
        customer.stats?.total_jobs === 1 ? "" : "s"
      }.`
    );
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (isCorporateParentFlow) {
      await executeCorporateParentSubmission();
      return;
    }

    if (requiresDiagnosisPayment) {
      toast.error("Generate the invoice and confirm payment before continuing.");
      return;
    }
    if (intakeType === "warranty" && !imei.trim()) {
      toast.error("Enter the serial number or IMEI before creating this warranty ticket.");
      setStep(0);
      return;
    }

    const signedAgreement = buildSignedAgreement();
    if (!signedAgreement) {
      setStep(termsStepIdx);
      return;
    }

    void executeJobSubmission(signedAgreement);
  };

  const executeCorporateParentSubmission = async () => {
    if (!validateCustomerContactDetails(0)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post("/jobs/admin/parent/", {
        customer_id: foundCustomerId || undefined,
        service_id: 31,
        title: `${(organizationName.trim() || name.trim())} Bulk Order`.slice(0, 120),
        description: `Bulk order for ${organizationName.trim() || name.trim()}`,
        company_name: organizationName.trim(),
        customer_name: name.trim(),
        email: emailValue,
        contact_phone_number: phoneValue,
        address: addressLine.trim(),
        city: city.trim(),
        state: stateRegion.trim(),
        country: country.trim(),
        latitude: latitude.trim() || undefined,
        longitude: longitude.trim() || undefined,
      });
      if (res.data?.success && res.data?.result?.id) {
        toast.success(flow.successMessage);
        setCreatedCorporateParentId(res.data.result.id);
        setCreatedCorporateParentDisplayId(res.data.result.display_id);
      } else {
        throw new Error("Failed to create bulk order");
      }
    } catch (err: any) {
       toast.error(err?.response?.data?.message || err?.message || "Failed to create bulk order.");
    } finally {
       setIsSubmitting(false);
    }
  };

  const handleAddChildJob = async () => {
    if (!make.trim() || !model.trim() || !issueReported.trim()) {
      toast.error("Enter device type, make, model, and issue reported.");
      return;
    }
    setIsAddingChildJob(true);
    
    try {
      const userStr = localStorage.getItem("user");
      let storeId: number | undefined;
      if (userStr) {
        const parsed = JSON.parse(userStr);
        storeId = parsed.assigned_stores?.[0]?.id ?? parsed.user?.assigned_stores?.[0]?.id;
      }

      const uploadFiles =
        deviceFiles.length > 0
          ? deviceFiles
          : deviceImages.length > 0
          ? await Promise.all(deviceImages.map((image, index) => dataUrlToFile(image, index)))
          : [];

      const formData = new FormData();
      formData.append("service_id", "31");
      formData.append("parent_job_id", String(createdCorporateParentId));
      formData.append("title", `${make.trim()} ${model.trim()} – ${issueReported.trim()}`.slice(0, 120));
      formData.append("description", issueReported.trim());
      formData.append("brand", make.trim());
      formData.append("model_name", model.trim());
      formData.append("device_type", deviceType);
      if (imei.trim()) formData.append("serial_imei", imei.trim());
      if (storeId) formData.append("store_id", String(storeId));
      formData.append("requires_inventory_validation", "true");
      formData.append("payment_channel", "corporate");
      
      if (addressLine.trim()) formData.append("address", addressLine.trim());
      if (city.trim()) formData.append("city", city.trim());
      if (stateRegion.trim()) formData.append("state", stateRegion.trim());
      if (country.trim()) formData.append("country", country.trim());

      uploadFiles.forEach((file, idx) => {
        formData.append(`media[${idx}][kind]`, "damage");
        formData.append(`media[${idx}][caption]`, `Device image ${idx + 1}`);
        formData.append(`media[${idx}][file]`, file);
      });

      const res = await api.post("/jobs/admin/child/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!res.data?.success) throw new Error(res.data?.message || "Job creation failed");
      const job = res.data.result;

      try {
        await api.post(`/jobs/${job.id}/admin/assign-manual/`, {});
      } catch (e) {
        console.warn("Auto-assignment failed for child job", e);
      }

      toast.success(`Child job ${job.display_id} added and assigned successfully.`);
      
      setAddedChildJobs((prev) => [...prev, {
        id: job.id,
        displayId: job.display_id,
        make: make.trim(),
        model: model.trim(),
        imei: imei.trim(),
        issue: issueReported.trim(),
      }]);
      
      setMake("");
      setModel("");
      setImei("");
      setIssueReported("");
      setDeviceImages([]);
      setDeviceFiles([]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to add child job.");
    } finally {
      setIsAddingChildJob(false);
    }
  };

  const executeJobSubmission = async (signedAgreement: SignedAgreement) => {
    setIsSubmitting(true);
    try {
      // Create the job via the backend API
      const job = await handleCreateJob();
      if (!job) return;

      if (intakeType === "repeat_return") {
        try {
          await api.post(`/jobs/${job.numericId}/admin/warranty/validate/`, {
            validation_source: "system",
            notes: "Initial system validation check on intake",
            persist: true,
          });
          await api.post(`/jobs/${job.numericId}/admin/assign-manual/`, {});
        } catch (error) {
          console.error("Automatic repeat case validation failed", error);
        }
      }

      sessionStorage.removeItem(CACHE_KEY);
      toast.success(`Ticket ${job.displayId} ${flow.successMessage}`);
      navigate(`/ticket/${String(job.numericId)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const historyLookupValue =
    foundCustomer?.phone || foundCustomer?.email || sourceTicket?.customer.phone || "";
  const isWarrantySerialMismatch = false;
  const isExistingCustomer = Boolean(foundCustomer);
  const stepZeroIncomplete =
    intakeType === "repeat_return"
      ? !validatedRepeatJob
      : intakeType === "warranty"
      ? !imei.trim()
      : !name.trim() || (!foundCustomerId && (!phoneValue || !emailValue || !hasValidPhoneNumber || !hasValidEmailAddress));
  const warrantyCustomerIncomplete =
    !name.trim() || (!foundCustomerId && (!phoneValue || !emailValue || !hasValidPhoneNumber || !hasValidEmailAddress));
  const stepOneIncomplete =
    !isCorporateParentFlow &&
    (!make.trim() ||
      !model.trim() ||
      !imei.trim() ||
      !issueReported.trim() ||
      (intakeType === "warranty" && isWarrantySerialMismatch));

  const handleIntakeTypeChange = (value: string) => {
    if (draftTicket) return;
    if (value === "onsite") {
      navigate("/self-service");
      return;
    }
    if (
      value === "post_warranty" ||
      value === "repeat_return" ||
      value === "warranty"
    ) {
      navigate(`/new-ticket?intakeType=${value}`);
    }
  };

  if (isCorp && createdCorporateParentId) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Bulk Intake Step 2</p>
          <h1 className="text-2xl font-bold text-foreground mt-1">
            Add Individual Devices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk Order {createdCorporateParentDisplayId} created successfully. Add devices to this order below.
          </p>
        </div>

        {addedChildJobs.length > 0 && (
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Added Devices ({addedChildJobs.length})</h3>
            <div className="space-y-4">
              {addedChildJobs.map((cj) => (
                <div key={cj.id} className="p-4 rounded-lg border border-success/20 bg-success/10 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">{cj.make} {cj.model}</p>
                    <p className="text-xs text-muted-foreground">IMEI: {cj.imei || "N/A"} | {cj.issue}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-success">{cj.displayId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-card p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Device Type</Label>
              <Select value={deviceType} onValueChange={(val: DeviceType) => setDeviceType(val)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {deviceCategoryOptions.map((type) => (
                    <SelectItem key={type.name} value={type.name}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Brand / Make <span className="text-red-500">*</span></Label>
              <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Apple" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Model <span className="text-red-500">*</span></Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. iPhone 13 Pro" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>IMEI / Serial</Label>
              <Input value={imei} onChange={(e) => applyDeviceIdentifierValue(e.target.value)} placeholder="Enter 15-digit IMEI" className="bg-secondary border-border" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reported Issue <span className="text-red-500">*</span></Label>
            <Textarea value={issueReported} onChange={(e) => setIssueReported(e.target.value)} placeholder="Describe the issue..." className="min-h-[100px] resize-none bg-secondary border-border" />
          </div>

          <div className="space-y-4">
            <Label>Device Images</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                isDraggingImages ? "border-primary bg-primary/10" : "border-border bg-secondary/50 hover:bg-secondary"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDraggingImages(false); }}
              onDrop={handleImageDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} className="hidden" accept={ALLOWED_IMAGE_TYPES.join(",")} multiple onChange={handleImageInputChange} />
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-4">
                <Smartphone className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-foreground text-center">Click or drag images here</p>
            </div>
            {deviceImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {deviceImages.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-border group">
                    <img src={src} alt="Device" className="w-full h-full object-cover" />
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDeviceImages(prev => prev.filter((_, idx) => idx !== i)); setDeviceFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border flex justify-between">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Finish Bulk Intake
            </Button>
            <Button type="button" onClick={handleAddChildJob} disabled={isAddingChildJob || !make.trim() || !model.trim() || !issueReported.trim()}>
              {isAddingChildJob ? "Adding..." : "Add Child Job"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{TICKET_INTAKE_LABELS[intakeType]}</p>
        <h1 className="text-2xl font-bold text-foreground mt-1">
          {draftTicket ? `Edit Draft ${draftTicket.jobId}` : flow.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {draftTicket
            ? "Update any step of this saved intake, including customer details, device details, images, terms, and payment mode before payment is confirmed."
            : flow.description}
        </p>
      </div>

      {!draftTicket && (
        <div className="glass-card p-4 space-y-2">
          <Label>Ticket Type</Label>
          <Select value={intakeType} onValueChange={handleIntakeTypeChange}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder="Select ticket type" />
            </SelectTrigger>
            <SelectContent>
              {TICKET_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {TICKET_INTAKE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select the ticket type here before filling customer and device details.
          </p>
        </div>
      )}

      {draftTicket && (
        <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
          This draft opens in full edit mode. You can jump back to any step, change the inputs, replace images,
          update customer contact details, re-accept the terms, and then regenerate the invoice or confirm payment.
        </div>
      )}

      <div className="flex items-center gap-2">
        {steps.map((stepItem, index) => {
          if (corporateParentJobId && index === 0) return null;
          return (
            <div key={stepItem.label} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (index <= highestUnlockedStep) setStep(index);
                }}
                disabled={index > highestUnlockedStep}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                  index === step
                    ? "bg-primary text-primary-foreground"
                    : index <= highestUnlockedStep
                    ? "bg-success/20 text-success hover:bg-success/25 cursor-pointer"
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                }`}
              >
                <stepItem.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{stepItem.label}</span>
              </button>
              {index < steps.length - 1 && (
                <div className={`h-px flex-1 ${index < step ? "bg-success" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6 sm:p-8">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">{customerTitle}</h3>
              <p className="text-sm text-muted-foreground">{customerDescription}</p>
            </div>

            <div className="flex gap-2">
              <SearchField
                value={searchQuery}
                onChange={(event) => applySearchQueryValue(event.target.value)}
                onKeyDown={(event: React.KeyboardEvent) => { 
                  if (event.key === "Enter") {
                    if (intakeType === "repeat_return") void searchExistingJob();
                    else if (intakeType === "warranty") void searchWarrantySerial();
                    else void searchExistingCustomer();
                  }
                }}
                placeholder={
                  intakeType === "warranty"
                    ? "Enter serial number or IMEI..."
                    : intakeType === "repeat_return"
                    ? "Enter previous Display ID (e.g., JOB-RFE7L-BTULY)..."
                    : "Search by phone or email..."
                }
                className="flex-1"
              />
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => {
                  if (intakeType === "repeat_return") void searchExistingJob();
                  else if (intakeType === "warranty") void searchWarrantySerial();
                  else void searchExistingCustomer();
                }} 
                disabled={isSearchingCustomer || isSearchingJob}
              >
                {isSearchingCustomer || isSearchingJob ? "Searching..." : "Search"}
              </Button>
            </div>

            {/* Multiple customer results picker */}
            {intakeType !== "repeat_return" && intakeType !== "warranty" && customerSearchResults.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Select a customer:</p>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {customerSearchResults.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full flex items-start gap-4 p-4 bg-secondary/50 hover:bg-secondary text-left transition-colors"
                      onClick={() => selectCustomerFromResult(c)}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {(c.profile?.full_name || c.first_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.profile?.full_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.email || c.phone_number || "No contact"} &nbsp;·&nbsp; {c.stats?.total_jobs ?? 0} job{c.stats?.total_jobs === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}



            {sourceTicket && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-sm space-y-1">
                <p className="text-foreground">
                  Linked source job: <span className="font-mono text-primary">{sourceTicket.jobId}</span>
                </p>
                <p className="text-muted-foreground">
                  {sourceTicket.customer.name} | {sourceTicket.device.make} {sourceTicket.device.model}
                </p>
                <Link to={`/ticket/${sourceTicket.id}`} className="inline-block text-primary hover:underline">
                  View original job
                </Link>
              </div>
            )}

            {!isOnsite && organizationName.trim() && (
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                Corporate account: <span className="font-medium">{organizationName}</span>
              </div>
            )}

            {intakeType !== "repeat_return" && intakeType !== "warranty" && foundCustomer && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-sm">
                <p className="text-success">
                  Existing customer found - {returningTicketCount} previous ticket{returningTicketCount === 1 ? "" : "s"}.
                </p>
              </div>
            )}

            {intakeType === "repeat_return" ? (
              <div className="space-y-4">
                {intakeType === "repeat_return" && (
                  validatedRepeatJob ? (
                    <div className="rounded-lg border border-border bg-secondary/40 p-4">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        Customer & Device auto-filled from {validatedRepeatJob.display_id || `Job #${validatedRepeatJob.id}`}
                        <span className="flex h-2 w-2 rounded-full bg-success ml-2 animate-pulse mx-auto shadow-sm"></span>
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm border-t border-border/50 pt-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Original Ticket</p>
                          <p className="text-foreground tracking-wide font-mono mt-0.5">{validatedRepeatJob.display_id}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Original Issue</p>
                          <p className="text-foreground mt-0.5">{validatedRepeatJob.title}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Customer</p>
                          <p className="text-foreground mt-0.5">{validatedRepeatJob.customer?.name} ({validatedRepeatJob.customer?.phone_number || validatedRepeatJob.customer?.email})</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Device Verified</p>
                          <p className="text-foreground mt-0.5">{validatedRepeatJob.brand} {validatedRepeatJob.model_name} (IMEI: {validatedRepeatJob.serial_imei})</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                      Enter the original Display ID in the search bar above to automatically load their profile and device logic.
                    </div>
                  )
                )}
              </div>
            ) : intakeType === "warranty" ? (
                <div className="grid gap-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Validate Warranty</h4>
                      <p className="text-xs text-muted-foreground">Type the device serial or IMEI above and click Search to validate warranty in Odoo.</p>
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                      Enter the device serial number or IMEI in the search bar above to validate.
                      <br/>
                      <span className="text-xs mt-2 block opacity-80">Once validated, click Continue to enter customer details.</span>
                    </div>
                    {imei.trim() && (
                      <div className="rounded-lg border border-success/20 bg-success/10 p-4 text-sm text-success">
                        IMEI/Serial captured: <span className="font-mono font-medium">{imei.trim()}</span>
                      </div>
                    )}
                  </div>
                </div>
            ) : (
                <div className="grid gap-4">
                  {(isOnsite || isCorporateParentFlow) && (
                    <div className="space-y-2">
                      <Label>{isCorporateParentFlow ? "Company Name" : "Organisation Name"}</Label>
                      <Input
                        value={organizationName}
                        onChange={(event) => setOrganizationName(event.target.value)}
                        placeholder="Amo Support Hub"
                        className="bg-secondary border-border"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{isOnsite || isCorporateParentFlow ? "Contact Person" : "Full Name"}</Label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={isOnsite || isCorporateParentFlow ? "Grace Okafor" : "Oyinye Daniels"}
                      className="bg-secondary border-border"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{isOnsite || isCorporateParentFlow ? "Contact Phone" : "Phone Number"}</Label>
                      <Input
                        value={phone}
                        onChange={(event) => applyPhoneValue(event.target.value)}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={PHONE_NUMBER_LENGTH}
                        pattern={`\\d{${PHONE_NUMBER_LENGTH}}`}
                        placeholder="08012345678"
                        className="bg-secondary border-border"
                      />
                      {phoneHasError && (
                        <p className="text-xs text-destructive">
                          Phone number must be exactly {PHONE_NUMBER_LENGTH} digits.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>{isOnsite || isCorporateParentFlow ? "Contact Email" : "Email"}</Label>
                      <Input
                        value={email}
                        onChange={(event) => applyEmailValue(event.target.value)}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="contact@email.com"
                        className="bg-secondary border-border"
                      />
                      {emailHasError && (
                        <p className="text-xs text-destructive">
                          Enter a valid email address like name@example.com.
                        </p>
                      )}
                    </div>
                  </div>
                  {isDispatchFlow && customerAddressOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label>Saved Address</Label>
                      <Select
                        value={selectedCustomerAddressId || undefined}
                        onValueChange={(value) => {
                          setSelectedCustomerAddressId(value);
                          const selectedAddress = customerAddressOptions.find((entry) => entry.id === value);
                          if (!selectedAddress) return;
                          setAddressLine(selectedAddress.address);
                          setCity(selectedAddress.city);
                          setStateRegion(selectedAddress.state);
                          setCountry(selectedAddress.country || "Nigeria");
                          setLatitude(selectedAddress.latitude ?? "");
                          setLongitude(selectedAddress.longitude ?? "");
                        }}
                      >
                        <SelectTrigger className="bg-secondary border-border">
                          <SelectValue placeholder="Choose a saved address" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerAddressOptions.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.label} - {[entry.address, entry.city, entry.state].filter(Boolean).join(", ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        The default customer address is selected automatically when available.
                      </p>
                    </div>
                  )}
                  {isDispatchFlow && (
                    <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Service Location</h4>
                        <p className="text-xs text-muted-foreground">
                          Capture the dispatch address for the technician visit.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Textarea
                          value={addressLine}
                          onChange={(event) => setAddressLine(event.target.value)}
                          placeholder="5, Gbangbala Street, Ikate Elegushi"
                          className="bg-secondary border-border"
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input
                            value={city}
                            onChange={(event) => setCity(event.target.value)}
                            placeholder="Lagos-Island"
                            className="bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>State</Label>
                          <Input
                            value={stateRegion}
                            onChange={(event) => setStateRegion(event.target.value)}
                            placeholder="Lagos"
                            className="bg-secondary border-border"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Country</Label>
                          <Input
                            value={country}
                            onChange={(event) => setCountry(event.target.value)}
                            placeholder="Nigeria"
                            className="bg-secondary border-border"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            )}
          </div>
        )}

        {step === 1 && intakeType === "warranty" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Customer Details</h3>
              <p className="text-sm text-muted-foreground">Search for an existing customer or enter the customer details below.</p>
            </div>
            <div className="flex gap-2">
              <SearchField
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event: React.KeyboardEvent) => {
                  if (event.key === "Enter") void searchExistingCustomer();
                }}
                placeholder="Search by phone or email..."
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={() => void searchExistingCustomer()} disabled={isSearchingCustomer}>
                {isSearchingCustomer ? "Searching..." : "Search"}
              </Button>
            </div>
            {customerSearchResults.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Select a customer:</p>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {customerSearchResults.map((c: any) => (
                    <button key={c.id} type="button" className="w-full flex items-start gap-4 p-4 bg-secondary/50 hover:bg-secondary text-left transition-colors" onClick={() => selectCustomerFromResult(c)}>
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {(c.profile?.full_name || c.first_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.profile?.full_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email || c.phone_number || "No contact"} &nbsp;·&nbsp; {c.stats?.total_jobs ?? 0} job{c.stats?.total_jobs === 1 ? "" : "s"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {foundCustomer && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-sm">
                <p className="text-success">Existing customer found — {returningTicketCount} previous ticket{returningTicketCount === 1 ? "" : "s"}.</p>
              </div>
            )}
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Oyinye Daniels" className="bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(event) => applyPhoneValue(event.target.value)}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={PHONE_NUMBER_LENGTH}
                    pattern={`\\d{${PHONE_NUMBER_LENGTH}}`}
                    placeholder="08012345678"
                    className="bg-secondary border-border"
                  />
                  {phoneHasError && (
                    <p className="text-xs text-destructive">
                      Phone number must be exactly {PHONE_NUMBER_LENGTH} digits.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={email}
                    onChange={(event) => applyEmailValue(event.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="contact@email.com"
                    className="bg-secondary border-border"
                  />
                  {emailHasError && (
                    <p className="text-xs text-destructive">
                      Enter a valid email address like name@example.com.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === deviceStepIdx && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">{deviceTitle}</h3>
              <p className="text-sm text-muted-foreground">{deviceDescription}</p>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>{isOnsite ? "System Type" : "Device Type"}</Label>
                <Select
                  value={deviceType}
                  onValueChange={(value) => setDeviceType(value as DeviceType)}
                  disabled={intakeType === "repeat_return" && Boolean(validatedRepeatJob)}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select device type" />
                  </SelectTrigger>
                  <SelectContent>
                    {deviceCategoryOptions.map((value) => (
                      <SelectItem key={value.name} value={value.name}>
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isOnsite ? "System Brand" : "Brand"}</Label>
                  <Input
                    value={make}
                    onChange={(event) => setMake(event.target.value)}
                    placeholder={isOnsite ? "HP" : "Apple"}
                    className="bg-secondary border-border"
                    readOnly={intakeType === "repeat_return" && Boolean(validatedRepeatJob)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isOnsite ? "System Model" : "Model"}</Label>
                  <Input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={isOnsite ? "EliteBook 840" : "iPhone 15 Pro"}
                    className="bg-secondary border-border"
                    readOnly={intakeType === "repeat_return" && Boolean(validatedRepeatJob)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{serialLabel}</Label>
                <Input
                  value={imei}
                  onChange={(event) => applyDeviceIdentifierValue(event.target.value)}
                  placeholder={serialPlaceholder}
                  className="bg-secondary border-border font-mono"
                  readOnly={intakeType === "repeat_return" && Boolean(validatedRepeatJob)}
                />
                {intakeType === "repeat_return" && validatedRepeatJob && (
                  <p className="text-xs text-muted-foreground">
                    Device details are locked to the original delivered job. Update only the newly reported issue.
                  </p>
                )}
                {intakeType === "warranty" && (
                  <p className="text-xs text-muted-foreground">
                    Manual validation is needed later. You can still edit this serial number now.
                  </p>
                )}
                {intakeType === "warranty" && isWarrantySerialMismatch && (
                  <p className="text-xs text-destructive">
                    This serial number does not match the verified warranty record. Search the correct serial number again before continuing.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{issueLabel}</Label>
                <Textarea
                  value={issueReported}
                  onChange={(event) => setIssueReported(event.target.value)}
                  placeholder={issuePlaceholder}
                  className="bg-secondary border-border"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>{isOnsite ? "System Images" : "Device Images"}</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleImageInputChange}
                />
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDraggingImages
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingImages(true);
                  }}
                  onDragLeave={() => setIsDraggingImages(false)}
                  onDrop={handleImageDrop}
                >
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Drag & drop or click to upload images</p>
                  <p className="text-xs mt-1">PNG, JPG up to 5MB each</p>
                </div>
                {deviceImages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {deviceImages.length} image{deviceImages.length === 1 ? "" : "s"} selected
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                      {deviceImages.map((image, index) => (
                        <div
                          key={`${index}-${image.slice(0, 20)}`}
                          className="relative aspect-square rounded-md overflow-hidden border border-border bg-secondary"
                        >
                          <img src={image} alt={`Device upload ${index + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              setDeviceImages((prev) => prev.filter((_, idx) => idx !== index));
                              setDeviceFiles((prev) => prev.filter((_, idx) => idx !== index));
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/90 text-foreground flex items-center justify-center hover:bg-background"
                            aria-label={`Remove image ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === termsStepIdx && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Terms &amp; Conditions</h3>
              <p className="text-sm text-muted-foreground">
                {isOnsite
                  ? "Confirm the service terms were explained to the organisation contact before proceeding."
                  : "Print the agreement form, have the customer review and sign, then tick the box below."}
              </p>
            </div>

            {/* PDF agreement printout */}
            <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/40 p-4">
              <FileSignature className="w-6 h-6 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Printable Service Agreement</p>
                <p className="text-xs text-muted-foreground">
                  Open the PDF, print it, and have the customer sign before proceeding.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(termsPdf as string, "_blank")}
              >
                <FileText className="w-4 h-4 mr-2" />
                Open PDF
              </Button>
            </div>

            <div className="flex items-start gap-4">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
              />
              <Label htmlFor="terms" className="text-sm leading-relaxed">
                {isOnsite
                  ? "I have explained the terms &amp; conditions to the organisation contact, and they agreed to proceed."
                  : "I have printed the agreement, explained the terms to the customer, and they have signed and agreed to proceed."}
              </Label>
            </div>
          </div>
        )}

        {step === reviewStepIdx && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">{flow.summaryTitle}</h3>
              <p className="text-sm text-muted-foreground">{flow.summaryDescription}</p>
            </div>
            <div className="glass-card p-6 space-y-4">
              {organizationName.trim() && (
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground">Organisation</span>
                  <span className="text-foreground font-medium text-right">{organizationName}</span>
                </div>
              )}
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">{isOnsite ? "Contact" : "Customer"}</span>
                <span className="text-foreground font-medium text-right">{name}</span>
              </div>
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">{isOnsite ? "System" : "Device"}</span>
                <span className="text-foreground font-medium text-right">
                  {DEVICE_TYPE_LABELS[deviceType]} - {make} {model}
                </span>
              </div>
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">{issueLabel}</span>
                <span className="text-foreground font-medium text-right max-w-[60%]">{issueReported}</span>
              </div>
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">{serialLabel}</span>
                <span className="text-foreground font-mono text-right">{imei}</span>
              </div>
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">Agreement</span>
                <span className="text-foreground font-medium">{termsAccepted ? "Accepted" : "Pending"}</span>
              </div>
              {sourceTicket && (
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground">Source Job</span>
                  <span className="text-foreground font-mono text-right">{sourceTicket.jobId}</span>
                </div>
              )}
              {customerNote.trim() && (
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground">Note</span>
                  <span className="text-foreground font-medium text-right max-w-[60%]">{customerNote}</span>
                </div>
              )}
              <div className="flex justify-between text-sm gap-4">
                <span className="text-muted-foreground">Images</span>
                <span className="text-foreground font-medium">{deviceImages.length}</span>
              </div>
              {flow.summaryNote && (
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                  {flow.summaryNote}
                </div>
              )}
              {requiresDiagnosisPayment && (
                <>
                  <div className="space-y-2">
                    <Label>Payment Mode</Label>
                    <Select value={diagnosisPaymentMode ?? undefined} onValueChange={(value) => setDiagnosisPaymentMode(value as PaymentMode)}>
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
                      {hasGeneratedInvoice
                        ? "If you change payment mode now, generate the invoice again before confirming payment."
                        : "Verify payment mode before invoice generation."}
                    </p>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-foreground font-semibold">Diagnosis Fee</span>
                    <div className="text-right">
                      {voucherValidation?.validCode && voucherValidation.discountAmount > 0 ? (
                        <>
                          <span className="text-sm line-through text-muted-foreground mr-2">{formatCurrency(diagnosisFee)}</span>
                          <span className="text-2xl font-bold gradient-text">{formatCurrency(voucherValidation.finalAmount)}</span>
                        </>
                      ) : (
                        <span className="text-2xl font-bold gradient-text">{formatCurrency(diagnosisFee)}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Voucher Code (Optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={voucherCode}
                        onChange={(e) => {
                          setVoucherCode(e.target.value.toUpperCase());
                          if (voucherValidation?.validCode && e.target.value.toUpperCase() !== voucherValidation.validCode) {
                            setVoucherValidation(null);
                          }
                        }}
                        placeholder="e.g. SAVE20"
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleApplyVoucher}
                        disabled={!voucherCode.trim() || voucherValidation?.loading || voucherCode === voucherValidation?.validCode}
                      >
                        {voucherValidation?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                    {voucherValidation?.error && (
                      <p className="text-xs text-destructive">{voucherValidation.error}</p>
                    )}
                    {voucherValidation?.validCode && (
                      <p className="text-xs text-success">Voucher applied successfully.</p>
                    )}
                  </div>
                  {pendingDiagnosisTicket && (
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                      Invoice ready for <span className="font-mono text-primary">{pendingDiagnosisTicket.jobId}</span>.
                      Confirm payment after the customer pays to push the ticket to diagnosis.
                    </div>
                  )}
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/40 p-4">
                    <FileSignature className="w-6 h-6 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Customer Job Card</p>
                      <p className="text-xs text-muted-foreground">
                        Open the standalone customer job card filled from the current customer and device details.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateJobCardDocument}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Open Job Card
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button
            variant="ghost"
            onClick={() => {
              if (step === 0) {
                navigate("/walk-in");
                return;
              }
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step < maxStep ? (
            step === termsStepIdx ? (
              <Button
                onClick={() => {
                  if (requiresDiagnosisPayment) {
                    void handleProceedToPayment();
                    return;
                  }
                  const nextStep = reviewStepIdx;
                  setStep(nextStep);
                  setHighestUnlockedStep((current) => Math.max(current, nextStep));
                }}
                disabled={!termsAccepted || (requiresDiagnosisPayment && isCreatingJob)}
              >
                {requiresDiagnosisPayment && isCreatingJob ? "Creating Ticket..." : "Continue"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const nextStep = Math.min(maxStep, step + 1);
                  if (intakeType === "warranty" && step === 0) setSearchQuery("");
                  setStep(nextStep);
                  setHighestUnlockedStep((current) => Math.max(current, nextStep));
                }}
                disabled={
                  (step === 0 && stepZeroIncomplete) ||
                  (step === 1 && intakeType === "warranty" && warrantyCustomerIncomplete) ||
                  (step === deviceStepIdx && stepOneIncomplete)
                }
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )
          ) : requiresDiagnosisPayment ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateDiagnosisInvoice}
                disabled={isSubmitting || !diagnosisPaymentMode}
              >
                <FileText className="w-4 h-4 mr-2" />
                {paymentAction === "invoice"
                  ? "Generating Invoice..."
                  : hasGeneratedInvoice
                  ? "Regenerate Invoice"
                  : "Generate Invoice"}
              </Button>
                <Button
                  onClick={handleConfirmDiagnosisPayment}
                  disabled={isSubmitting || !pendingDiagnosisTicket || !hasGeneratedInvoice}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentAction === "confirm"
                    ? "Confirming Payment..."
                    : diagnosisPaymentMode === "bank_transfer"
                    ? "Confirm Transfer"
                    : diagnosisPaymentMode === "pos"
                    ? "Confirm POS Payment"
                    : "Confirm Payment"}
                </Button>
            </div>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              <ClipboardCheck className="w-4 h-4 mr-2" />
              {isSubmitting ? flow.submittingLabel : flow.submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
