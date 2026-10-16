import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_SETTINGS,
  DEVICE_TYPE_LABELS,
  createInvoice,
  getSettings,
  getOnlineBookings,
  type DeviceType,
  type OnlineBooking,
  type OnlineBookingChild,
  type PaymentMode,
  type Ticket,
  saveOnlineBookings,
} from "@/frontdesk/lib/store";
import { formatCurrency, printInvoice } from "@/frontdesk/lib/invoice";
import SearchField from "@/frontdesk/components/SearchField";
import { useDeviceCategories } from "@/hooks/useDeviceCategories";
import { normalizeNigerianPhone, getNigerianPhoneSearchVariants } from "@/utils/phoneNumber";
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
import {
  CreditCard,
  FileSignature,
  FileText,
  FolderPlus,
  FolderTree,
  Loader2,
  Plus,
} from "lucide-react";
import { useApi } from "@/hooks/useApi";
import imageCompression from "browser-image-compression";
import termsPdf from "@/frontdesk/assets/terms_and_conditions.pdf";
import { normalizeDeviceCategoryName } from "@/lib/deviceCategories";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const PHONE_NUMBER_LENGTH = 11;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BOOKING_STATUS_LABELS = {
  new: "New Bulk Order",
  in_progress: "In Progress",
  processed: "Completed",
} as const;

const CHILD_STATUS_LABELS = {
  new: "New",
  in_progress: "In Progress",
  processed: "Closed",
  cancelled: "Cancelled",
} as const;

const STATUS_STYLES = {
  new: "bg-warning/10 text-warning border-warning/20",
  in_progress: "bg-info/10 text-info border-info/20",
  processed: "bg-success/10 text-success border-success/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  partial: "bg-info/10 text-info border-info/20",
  paid: "bg-success/10 text-success border-success/20",
  completed: "bg-success/10 text-success border-success/20",
} as const;

const BULK_DIAGNOSIS_READY_BACKEND_STATUSES = new Set(["awaiting_diagnosis_fee"]);
const BULK_REPAIR_READY_BACKEND_STATUSES = new Set(["quote_accepted", "awaiting_payment"]);

function isOpenChildJob(childJob: OnlineBookingChild) {
  return childJob.status !== "processed" && childJob.status !== "cancelled";
}

function normalizeBackendStatus(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function readMoneyAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, PHONE_NUMBER_LENGTH);
}

function normalizeEmailAddress(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isValidPhoneNumber(value: string) {
  return new RegExp(`^\\d{${PHONE_NUMBER_LENGTH}}$`).test(value.trim());
}

function isValidImei(value: string) {
  return value.trim().length > 0;
}

function isValidEmailAddress(value: string) {
  return EMAIL_PATTERN.test(value.trim());
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

  if (addressOptions.length > 0) return addressOptions;

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

function getCustomerOrganizationName(customer: any) {
  const profile = customer?.profile ?? {};
  return (
    profile.company_name ||
    profile.organization_name ||
    profile.organisation_name ||
    customer?.company_name ||
    customer?.organization_name ||
    customer?.organisation_name ||
    ""
  );
}

async function dataUrlToFile(dataUrl: string, index: number) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `bulk-job-image-${index + 1}.${extension}`, { type: blob.type || "image/jpeg" });
}

function mapBackendStatusToPaymentStatus(status: string): OnlineBookingChild["paymentStatus"] {
  if ([
    "diagnosing",
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
  ].includes(status)) {
    return "paid";
  }
  if (status === "cancelled") {
    return "partial";
  }
  return "pending";
}

function mapBackendStatusToDiagnosisStatus(status: string): OnlineBookingChild["diagnosisStatus"] {
  if (["repaired", "submitted_for_qc_review", "qc_passed", "ready_for_collection", "delivered", "closed", "completed"].includes(status)) {
    return "completed";
  }
  if ([
    "diagnosing",
    "quote_sent",
    "quote_accepted",
    "awaiting_payment",
    "payment_confirmed",
    "repair_in_progress",
  ].includes(status)) {
    return "partial";
  }
  return "pending";
}

function mapBackendStatusToChildStatus(status: string): OnlineBookingChild["status"] {
  if (status === "cancelled") return "cancelled";
  if (["ready_for_collection", "delivered", "closed", "completed"].includes(status)) return "processed";
  if (["registered", "awaiting_assignment", "awaiting_reassignment"].includes(status)) return "new";
  return "in_progress";
}

function summarizeBookingStatus(childJobs: OnlineBookingChild[], backendStatus?: string): OnlineBooking["status"] {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) {
    return ["cancelled", "completed", "delivered", "closed"].includes(String(backendStatus || ""))
      ? "processed"
      : "new";
  }
  if (activeChildJobs.every((childJob) => childJob.status === "processed")) {
    return "processed";
  }
  if (activeChildJobs.some((childJob) => childJob.status === "in_progress" || childJob.status === "processed")) {
    return "in_progress";
  }
  return "new";
}

function summarizeBookingPaymentStatus(childJobs: OnlineBookingChild[]): OnlineBooking["paymentStatus"] {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) return "pending";
  if (activeChildJobs.every((childJob) => childJob.paymentStatus === "paid")) return "paid";
  if (activeChildJobs.some((childJob) => childJob.paymentStatus === "paid")) return "partial";
  return "pending";
}

function summarizeBookingDiagnosisStatus(childJobs: OnlineBookingChild[]): OnlineBooking["diagnosisStatus"] {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) return "pending";
  if (activeChildJobs.every((childJob) => childJob.diagnosisStatus === "completed")) return "completed";
  if (activeChildJobs.some((childJob) => childJob.diagnosisStatus !== "pending")) return "partial";
  return "pending";
}

function mapBackendChildJob(childJob: any): OnlineBookingChild {
  const backendStatus = String(childJob.status || "registered");
  const paymentStatus = mapBackendStatusToPaymentStatus(backendStatus);
  const diagnosisStatus = mapBackendStatusToDiagnosisStatus(backendStatus);

  return {
    id: String(childJob.id),
    childJobId: childJob.display_id || childJob.external_id || String(childJob.id),
    backendJobId: childJob.id ? String(childJob.id) : undefined,
    backendDisplayId: childJob.display_id || childJob.external_id || undefined,
    backendStatus,
    technicianName: childJob.technician_name || childJob.technician?.name || childJob.assigned_technician?.name || undefined,
    createdAt: childJob.created_at || undefined,
    updatedAt: childJob.updated_at || undefined,
    deviceType: normalizeDeviceCategoryName(childJob.device_type, "other"),
    deviceMake: childJob.brand || "",
    deviceModel: childJob.model_name || "",
    serialNumber: childJob.serial_imei || undefined,
    serviceQuoteAmount: readMoneyAmount(childJob.service_quote_amount),
    issueReported: childJob.description || childJob.title || "",
    images: [],
    address: childJob.address || undefined,
    city: childJob.city || undefined,
    state: childJob.state || undefined,
    country: childJob.country || undefined,
    latitude: childJob.latitude || undefined,
    longitude: childJob.longitude || undefined,
    paymentStatus,
    diagnosisStatus,
    status: mapBackendStatusToChildStatus(backendStatus),
    intakeTicketId: childJob.id ? String(childJob.id) : undefined,
  };
}

function mapBackendBooking(parentJob: any, childJobs: any[]): OnlineBooking {
  const mappedChildJobs = childJobs
    .map(mapBackendChildJob)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const companyName =
    parentJob.company_name ||
    parentJob.organization_name ||
    parentJob.organisation_name ||
    parentJob.title ||
    parentJob.customer_name ||
    parentJob.customer?.name ||
    "Corporate Account";
  const customerName =
    parentJob.customer_name ||
    parentJob.customer?.name ||
    companyName;
  const customerPhone =
    parentJob.customer_phone ||
    parentJob.contact_phone_number ||
    parentJob.customer?.phone_number ||
    "";
  const customerEmail =
    parentJob.customer_email ||
    parentJob.email ||
    parentJob.customer?.email ||
    "";

  return {
    id: String(parentJob.id),
    bookingId: parentJob.display_id || parentJob.external_id || String(parentJob.id),
    customerId: parentJob.customer_id ? String(parentJob.customer_id) : parentJob.customer?.id ? String(parentJob.customer.id) : undefined,
    companyName,
    customerName,
    customerPhone,
    customerEmail,
    backendStatus: parentJob.status || undefined,
    lifecycleStage: parentJob.lifecycle_stage || undefined,
    createdAt: parentJob.created_at || undefined,
    updatedAt: parentJob.updated_at || undefined,
    address: parentJob.address || undefined,
    city: parentJob.city || undefined,
    state: parentJob.state || undefined,
    country: parentJob.country || undefined,
    latitude: parentJob.latitude || undefined,
    longitude: parentJob.longitude || undefined,
    paymentMode: undefined,
    bookedAt: parentJob.created_at || new Date().toISOString(),
    status: summarizeBookingStatus(mappedChildJobs, parentJob.status),
    paymentStatus: summarizeBookingPaymentStatus(mappedChildJobs),
    diagnosisStatus: summarizeBookingDiagnosisStatus(mappedChildJobs),
    childJobs: mappedChildJobs,
  };
}

export default function SelfService() {
  const [bookings, setBookings] = useState<OnlineBooking[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [settlingPaymentKey, setSettlingPaymentKey] = useState<string | null>(null);
  const [diagnosisFee, setDiagnosisFee] = useState(DEFAULT_SETTINGS.diagnosisFee);
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  const [voucherCodes, setVoucherCodes] = useState<Record<string, string>>({});
  const [voucherValidations, setVoucherValidations] = useState<Record<string, {
    loading: boolean;
    error: string | null;
    discountAmount: number;
    finalAmount: number;
    isFullWaiver: boolean;
    validCode: string | null;
    paymentType: "diagnosis_fee" | "repair_fee";
  }>>({});
  const { api } = useApi();
  const {
    selectableCategories: deviceCategoryOptions,
    defaultCategoryName,
  } = useDeviceCategories({ onlyActive: true, hideOther: true });

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [foundCustomerId, setFoundCustomerId] = useState<number | null>(null);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<any | null>(null);
  const [selectedCustomerAddressId, setSelectedCustomerAddressId] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [selectedParentId, setSelectedParentId] = useState("");
  const [childDeviceType, setChildDeviceType] = useState<DeviceType>(defaultCategoryName as DeviceType);
  const [childDeviceMake, setChildDeviceMake] = useState("");
  const [childDeviceModel, setChildDeviceModel] = useState("");
  const [childSerialNumber, setChildSerialNumber] = useState("");
  const [childIssueReported, setChildIssueReported] = useState("");
  const [childImages, setChildImages] = useState<string[]>([]);
  const [parentTermsAccepted, setParentTermsAccepted] = useState(false);
  const childImageInputRef = useRef<HTMLInputElement | null>(null);
  const childJobFormRef = useRef<HTMLDivElement | null>(null);
  const childDeviceMakeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;

    void syncBookingsFromBackend({ showErrors: false })
      .then((data) => {
        if (!mounted) return;
        setBookings(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void getSettings()
      .then((settings) => {
        if (mounted) {
          setDiagnosisFee(settings.diagnosisFee);
          setAppSettings(settings);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const selectedParent = bookings.find((booking) => booking.id === selectedParentId) ?? null;
  const customerAddressOptions = selectedCustomerProfile
    ? getCustomerAddressOptions({ profile: selectedCustomerProfile })
    : [];
  const hasExistingCustomer = Boolean(foundCustomerId);
  const contactPhoneValue = contactPhone.trim();
  const contactEmailValue = contactEmail.trim();
  const hasValidContactPhone = isValidPhoneNumber(contactPhoneValue);
  const hasValidContactEmail = isValidEmailAddress(contactEmailValue);
  const contactPhoneHasError = contactPhoneValue.length > 0 && !hasValidContactPhone;
  const contactEmailHasError = contactEmailValue.length > 0 && !hasValidContactEmail;
  const childImeiValue = childSerialNumber.trim();
  const hasValidChildImei = isValidImei(childImeiValue);
  const childImeiHasError = childImeiValue.length > 0 && !hasValidChildImei;

  const applyContactPhoneValue = (value: string) => {
    setContactPhone(sanitizePhoneNumber(value));
  };

  const applyContactEmailValue = (value: string) => {
    setContactEmail(normalizeEmailAddress(value));
  };

  const handleSelectParentForChild = (parentId: string) => {
    setSelectedParentId(parentId);
    window.requestAnimationFrame(() => {
      childJobFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        childDeviceMakeInputRef.current?.focus();
      }, 200);
    });
  };

  const syncBookingsFromBackend = async (options?: { showErrors?: boolean }) => {
    const showErrors = options?.showErrors ?? true;

    try {
      const [parentsRes, childrenRes] = await Promise.all([
        api.get("/jobs/admin/bookings/", {
          params: { job_group_type: "parent", page_size: 1000 },
        }),
        api.get("/jobs/admin/bookings/", {
          params: { job_group_type: "child", page_size: 1000 },
        }),
      ]);

      const parents = Array.isArray(parentsRes.data?.result) ? parentsRes.data.result : [];
      const children = Array.isArray(childrenRes.data?.result) ? childrenRes.data.result : [];
      const childrenByParent = new Map<string, any[]>();

      children.forEach((childJob: any) => {
        const parentKey = childJob.parent_job ? String(childJob.parent_job) : "";
        if (!parentKey) return;
        const existing = childrenByParent.get(parentKey) ?? [];
        existing.push(childJob);
        childrenByParent.set(parentKey, existing);
      });

      const mappedBookings = parents
        .map((parentJob: any) => mapBackendBooking(parentJob, childrenByParent.get(String(parentJob.id)) ?? []))
        .sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());

      setBookings(mappedBookings);
      await saveOnlineBookings(mappedBookings).catch(() => undefined);
      return mappedBookings;
    } catch {
      const cachedBookings = await getOnlineBookings().catch(() => []);
      setBookings(cachedBookings);
      if (showErrors) {
        toast.error("Failed to load parent and child jobs from the backend. Showing the last saved data instead.");
      }
      return cachedBookings;
    }
  };

  const resolveCustomerId = async () => {
    if (foundCustomerId) return foundCustomerId;

    const resolvedCompanyName = companyName.trim();
    const resolvedContactName = contactName.trim();
    if (!resolvedCompanyName) {
      toast.error("Add the company or organisation name before creating the parent job.");
      return null;
    }

    let contactPhoneForCreate = "00000000000";
    if (contactPhoneValue) {
      const normalizedContactPhone = normalizeNigerianPhone(contactPhoneValue);
      if (!normalizedContactPhone) {
        toast.error("Please enter a valid Nigerian phone number, e.g. 08012345678 or +2348012345678");
        return null;
      }
      contactPhoneForCreate = normalizedContactPhone;
    }

    try {
      const res = await api.post("/users/profile/customers/front-desk-create/", {
        full_name: resolvedCompanyName,
        contact_email: contactEmailValue || `corporate_${Date.now()}@intake.local`,
        contact_phone_number: contactPhoneForCreate,
        password: "WalkInTemp123!",
        intake_notes: [
          "Corporate bulk job customer",
          resolvedContactName ? `Primary contact: ${resolvedContactName}` : "",
          [addressLine.trim(), city.trim(), stateRegion.trim(), country.trim()]
            .filter(Boolean)
            .join(", "),
        ]
          .filter(Boolean)
          .join(" | "),
      });
      const customerId = res.data?.result?.id ?? res.data?.id ?? null;
      if (!customerId) {
        throw new Error("Customer ID missing from response");
      }
      setFoundCustomerId(Number(customerId));
      return Number(customerId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create the corporate customer profile.");
      return null;
    }
  };

  const validateParentContactDetails = () => {
    if (!companyName.trim()) {
      toast.error("Enter the company or organisation name before creating the parent job.");
      return false;
    }
    if (!contactName.trim()) {
      toast.error("Enter the primary contact name before creating the parent job.");
      return false;
    }
    if (contactPhoneValue && !hasValidContactPhone) {
      toast.error(`Contact phone must be exactly ${PHONE_NUMBER_LENGTH} digits.`);
      return false;
    }
    if (contactEmailValue && !hasValidContactEmail) {
      toast.error("Enter a valid contact email address like name@example.com.");
      return false;
    }
    if (!hasExistingCustomer && !contactPhoneValue && !contactEmailValue) {
      toast.error("Enter a contact phone number or email before creating the parent job.");
      return false;
    }
    return true;
  };

  const pendingParentCount = useMemo(
    () => bookings.filter((booking) => booking.status !== "processed").length,
    [bookings]
  );

  const openChildCount = useMemo(
    () =>
      bookings.reduce(
        (count, booking) =>
          count + booking.childJobs.filter((childJob) => isOpenChildJob(childJob)).length,
        0
      ),
    [bookings]
  );

  const getActiveChildJobs = (booking: OnlineBooking) =>
    booking.childJobs.filter((childJob) => normalizeBackendStatus(childJob.backendStatus) !== "cancelled");

  const canSettleBulkDiagnosisPayment = (booking: OnlineBooking) => {
    const activeChildJobs = getActiveChildJobs(booking);
    return (
      activeChildJobs.length > 0 &&
      activeChildJobs.every((childJob) => BULK_DIAGNOSIS_READY_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.backendStatus)))
    );
  };

  const canSettleBulkRepairPayment = (booking: OnlineBooking) => {
    const activeChildJobs = getActiveChildJobs(booking);
    return (
      activeChildJobs.length > 0 &&
      activeChildJobs.every(
        (childJob) =>
          BULK_REPAIR_READY_BACKEND_STATUSES.has(normalizeBackendStatus(childJob.backendStatus)) &&
          readMoneyAmount(childJob.serviceQuoteAmount) > 0
      )
    );
  };

  const getBulkDiagnosisTotalAmount = (booking: OnlineBooking) =>
    getActiveChildJobs(booking).length * diagnosisFee;

  const getBulkRepairTotalAmount = (booking: OnlineBooking) =>
    getActiveChildJobs(booking).reduce(
      (sum, childJob) => sum + readMoneyAmount(childJob.serviceQuoteAmount),
      0
    );

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bookings;

    return bookings.filter((booking) =>
      [
        booking.bookingId,
        booking.companyName,
        booking.customerName,
        booking.customerPhone,
        booking.customerEmail,
        ...booking.childJobs.flatMap((childJob) => [
          childJob.childJobId,
          childJob.deviceMake,
          childJob.deviceModel,
          childJob.serialNumber ?? "",
          childJob.issueReported,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [bookings, search]);

  const resetParentForm = () => {
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setFoundCustomerId(null);
    setSelectedCustomerProfile(null);
    setSelectedCustomerAddressId("");
    setCompanyName("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setAddressLine("");
    setCity("");
    setStateRegion("");
    setCountry("Nigeria");
    setLatitude("");
    setLongitude("");
    setParentTermsAccepted(false);
  };

  const resetChildForm = () => {
    setChildDeviceType(defaultCategoryName);
    setChildDeviceMake("");
    setChildDeviceModel("");
    setChildSerialNumber("");
    setChildIssueReported("");
    setChildImages([]);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const processChildImages = async (files: File[]) => {
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
      toast.error(`${invalidTypeCount} file${invalidTypeCount === 1 ? "" : "s"} skipped. Only PNG and JPG are allowed.`);
    }
    if (invalidSizeCount > 0) {
      toast.error(`${invalidSizeCount} file${invalidSizeCount === 1 ? "" : "s"} skipped. Max size is 5MB each.`);
    }
    if (validFiles.length === 0) return;

    try {
      const compressedFiles = await Promise.all(
        validFiles.map((file) =>
          imageCompression(file, {
            maxSizeMB: 0.1,
            maxWidthOrHeight: 800,
            useWebWorker: true,
          })
        )
      );
      const dataUrls = await Promise.all(compressedFiles.map(readFileAsDataUrl));
      setChildImages((prev) => [...prev, ...dataUrls]);
      toast.success(`${dataUrls.length} image${dataUrls.length === 1 ? "" : "s"} added.`);
    } catch {
      toast.error("Some images could not be processed.");
    }
  };

  const handleChildImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    void processChildImages(Array.from(files));
    event.target.value = "";
  };

  const selectCustomerFromResult = (customer: any) => {
    const fullName =
      customer.profile?.full_name ||
      `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
    const organizationName = String(getCustomerOrganizationName(customer) || "").trim();
    const phone = customer.phone_number ?? "";
    const email = customer.email ?? "";
    const addressOptions = getCustomerAddressOptions(customer);
    const defaultAddress =
      addressOptions.find((entry) => entry.label === "Default Address") ?? addressOptions[0] ?? null;

    setFoundCustomerId(customer.id);
    setSelectedCustomerProfile(customer.profile ?? null);
    setSelectedCustomerAddressId(defaultAddress?.id ?? "");
    setCompanyName(organizationName || fullName);
    setContactName("");
    applyContactPhoneValue(phone);
    applyContactEmailValue(email);
    if (defaultAddress) {
      setAddressLine(defaultAddress.address);
      setCity(defaultAddress.city);
      setStateRegion(defaultAddress.state);
      setCountry(defaultAddress.country || "Nigeria");
      setLatitude(defaultAddress.latitude ?? "");
      setLongitude(defaultAddress.longitude ?? "");
    }
    setCustomerSearchResults([]);
    toast.success(
      `Customer loaded – ${customer.stats?.total_jobs ?? 0} previous job${
        customer.stats?.total_jobs === 1 ? "" : "s"
      }.`
    );
  };

  const searchExistingCustomer = async () => {
    const rawSearch = customerSearchQuery.trim();
    if (!rawSearch) {
      toast.error("Enter phone, email, or job ID to search for an existing customer.");
      return;
    }

    setIsSearchingCustomer(true);
    setCustomerSearchResults([]);
    setFoundCustomerId(null);
    setSelectedCustomerProfile(null);
    setSelectedCustomerAddressId("");

    try {
      const phoneVariants: string[] = getNigerianPhoneSearchVariants(rawSearch);
      const lookups = [
        ...phoneVariants.map((phone) =>
          api.get("/users/profile/customers/", { params: { phone_number: phone } }).catch(() => null)
        ),
        api.get("/users/profile/customers/", { params: { email: rawSearch } }).catch(() => null),
        api.get("/users/profile/customers/", { params: { job_id: rawSearch } }).catch(() => null),
      ];
      const responses = await Promise.all(lookups);

      const allResults: any[] = [];
      responses.forEach((res) => {
        if (res?.data?.result && Array.isArray(res.data.result)) {
          allResults.push(...res.data.result);
        }
      });

      const results = Array.from(new Map(allResults.map((item) => [item.id, item])).values());
      if (results.length === 0) {
        toast.info("No customer found. Fill in the parent job details below and one will be created automatically.");
        return;
      }

      if (results.length === 1) {
        selectCustomerFromResult(results[0]);
        return;
      }

      setCustomerSearchResults(results);
      toast.info(`${results.length} customers found. Select one below.`);
    } catch {
      toast.error("Customer search failed. Enter the details manually.");
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const handleCreateParentJob = async () => {
    const resolvedCompanyName = companyName.trim();
    const resolvedContactName = contactName.trim();
    const hasContactMethod = Boolean(contactPhoneValue || contactEmailValue);

    if (!validateParentContactDetails()) {
      return;
    }

    if (
      !resolvedCompanyName ||
      !resolvedContactName ||
      (!hasExistingCustomer && !hasContactMethod) ||
      !addressLine.trim() ||
      !city.trim() ||
      !stateRegion.trim() ||
      !country.trim()
    ) {
      toast.error("Enter company, contact, and service location details before creating the parent job.");
      return;
    }

    if (!parentTermsAccepted) {
      toast.error("Accept the terms and conditions before creating the parent job.");
      return;
    }

    const customerId = await resolveCustomerId();
    if (!customerId) {
      return;
    }

    try {
      const res = await api.post("/jobs/admin/parent/", {
        customer_id: customerId,
        service_id: 31,
        title: `${resolvedCompanyName} Bulk Order`.slice(0, 120),
        description: `Parent job for ${resolvedCompanyName}`,
        address: addressLine.trim(),
        city: city.trim(),
        state: stateRegion.trim(),
        country: country.trim(),
        latitude: latitude.trim() || undefined,
        longitude: longitude.trim() || undefined,
      });

      if (res.data?.success && res.data?.result?.id) {
        await syncBookingsFromBackend();
        setSelectedParentId(String(res.data.result.id));
        resetParentForm();
        resetChildForm();
        toast.success(`Parent job ${res.data.result.display_id || res.data.result.id} created.`);
        return;
      }
      throw new Error("Parent job creation response did not include a job id.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create parent job via API.");
    }
  };

  const handleAddChildJob = async () => {
    if (!selectedParent) {
      toast.error("Create or select a parent job first.");
      return;
    }

    if (!childDeviceMake.trim() || !childDeviceModel.trim() || !childIssueReported.trim() || !childImeiValue) {
      toast.error("Enter device make, model, IMEI, and issue before adding the child job.");
      return;
    }

    if (!hasValidChildImei) {
      toast.error("Enter the IMEI / Serial number for this device.");
      return;
    }

    const userStr = localStorage.getItem("user");
    let storeId: number | undefined;
    if (userStr) {
      const parsed = JSON.parse(userStr);
      storeId = parsed.assigned_stores?.[0]?.id ?? parsed.user?.assigned_stores?.[0]?.id;
    }

    if (!storeId) {
      toast.error("Store ID not found. Please log out and log in again.");
      return;
    }

    try {
      const uploadFiles =
        childImages.length > 0
          ? await Promise.all(childImages.map((image, index) => dataUrlToFile(image, index)))
          : [];

      const formData = new FormData();
      formData.append("service_id", "31");
      formData.append("parent_job_id", selectedParent.id);
      formData.append("title", `${childDeviceMake.trim()} ${childDeviceModel.trim()} - ${childIssueReported.trim()}`.slice(0, 120));
      formData.append("description", childIssueReported.trim());
      formData.append("brand", childDeviceMake.trim());
      formData.append("model_name", childDeviceModel.trim());
      formData.append("device_type", childDeviceType);
      formData.append("store_id", String(storeId));
      formData.append("serial_imei", childImeiValue);
      if (selectedParent.address) formData.append("address", selectedParent.address);
      if (selectedParent.city) formData.append("city", selectedParent.city);
      if (selectedParent.state) formData.append("state", selectedParent.state);
      if (selectedParent.country) formData.append("country", selectedParent.country);
      if (selectedParent.latitude) formData.append("latitude", selectedParent.latitude);
      if (selectedParent.longitude) formData.append("longitude", selectedParent.longitude);

      uploadFiles.forEach((file, idx) => {
        formData.append(`media[${idx}][kind]`, "damage");
        formData.append(`media[${idx}][caption]`, `Device image ${idx + 1}`);
        formData.append(`media[${idx}][file]`, file);
      });

      const res = await api.post("/jobs/admin/child/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!res.data?.success || !res.data?.result?.id) {
        throw new Error(res.data?.message || "Failed to create child job.");
      }

      try {
        await api.post(`/jobs/${res.data.result.id}/admin/assign-manual/`, {});
      } catch (error) {
        console.warn("Auto-assignment failed for child job", error);
      }

      await syncBookingsFromBackend();
      setSelectedParentId(selectedParent.id);
      resetChildForm();
      toast.success(`Child job ${res.data.result.display_id || res.data.result.id} created.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Could not add the child job.");
    }
  };

  const handleSettleBulkParentPayment = async (
    booking: OnlineBooking,
    paymentType: "diagnosis_fee" | "repair_fee"
  ) => {
    const isDiagnosisPayment = paymentType === "diagnosis_fee";
    const activeChildJobs = getActiveChildJobs(booking);
    const actionKey = `${booking.id}:${paymentType}`;

    if (activeChildJobs.length === 0) {
      toast.error("Create the individual jobs first before settling the bulk payment.");
      return;
    }

    if (isDiagnosisPayment && !canSettleBulkDiagnosisPayment(booking)) {
      toast.error("Every active child job must be awaiting diagnosis fee before bulk diagnosis payment.");
      return;
    }

    if (!isDiagnosisPayment && !canSettleBulkRepairPayment(booking)) {
      toast.error("Every active child job must be quote accepted or awaiting payment with a quotation before bulk repair payment.");
      return;
    }

    let amount = isDiagnosisPayment
      ? getBulkDiagnosisTotalAmount(booking)
      : getBulkRepairTotalAmount(booking);

    const validation = voucherValidations[booking.id];
    const voucherApplied = Boolean(validation?.validCode && validation.paymentType === paymentType);
    if (voucherApplied) {
      amount = validation!.finalAmount;
    }

    if (amount < 0 || (amount === 0 && !voucherApplied)) {
      toast.error("Bulk payment amount must be greater than zero.");
      return;
    }

    const providerMap: Record<PaymentMode, { payment_method: string }> = {
      cash: { payment_method: "cash" },
      pos: { payment_method: "card_pos" },
      bank_transfer: { payment_method: "bank_transfer" },
    };
    const paymentMode = booking.paymentMode ?? "bank_transfer";
    const paymentConfig = providerMap[paymentMode];
    setSettlingPaymentKey(actionKey);

    try {
      await api.post(`/jobs/${booking.id}/admin/create-and-settle-parent-payment/`, {
        payment: {
          type: paymentType,
          amount: amount.toFixed(2),
          currency: "NGN",
          status: "succeeded",
          provider: "manual",
          payment_channel: "corporate",
          payment_method: paymentConfig.payment_method,
          provider_ref: `${isDiagnosisPayment ? "BULK-DIAG" : "BULK-REPAIR"}-${booking.bookingId}-${Date.now()}`,
          is_manual_entry: true,
          ...(voucherCodes[booking.id]?.trim() ? { voucher_code: voucherCodes[booking.id].trim() } : {}),
        },
        note: `${isDiagnosisPayment ? "Bulk diagnosis" : "Bulk repair"} payment settled from ${booking.bookingId}`,
      });

      try {
        const baseAmount = isDiagnosisPayment
          ? getBulkDiagnosisTotalAmount(booking)
          : getBulkRepairTotalAmount(booking);
        const childCountLabel = `${activeChildJobs.length} Child Job${activeChildJobs.length === 1 ? "" : "s"}`;
        const invoice = await createInvoice({
          ticketId: booking.id,
          jobId: booking.bookingId,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          customerEmail: booking.customerEmail,
          deviceLabel: childCountLabel,
          type: isDiagnosisPayment ? "diagnosis_fee" : "repair_payment",
          description: `${isDiagnosisPayment ? "Bulk diagnosis fee" : "Bulk repair payment"} for ${childCountLabel}`,
          amount,
          paymentMode,
          ...(voucherApplied
            ? {
                subtotal: baseAmount,
                voucherCode: validation!.validCode!,
                voucherDiscount: validation!.discountAmount,
              }
            : {}),
        });
        const printableTicket = {
          jobId: booking.bookingId,
          customer: {
            name: booking.customerName,
            phone: booking.customerPhone,
            email: booking.customerEmail,
          },
          device: { make: childCountLabel, model: "", imei: "" },
        } as unknown as Ticket;
        printInvoice(invoice, printableTicket, appSettings);
      } catch (invoiceErr) {
        console.error("Failed to generate corporate invoice receipt:", invoiceErr);
      }

      setVoucherCodes((prev) => {
        const next = { ...prev };
        delete next[booking.id];
        return next;
      });
      setVoucherValidations((prev) => {
        const next = { ...prev };
        delete next[booking.id];
        return next;
      });

      await syncBookingsFromBackend({ showErrors: false });
      toast.success(
        `${booking.bookingId} ${isDiagnosisPayment ? "diagnosis" : "repair"} payment settled for ${
          activeChildJobs.length
        } individual job${activeChildJobs.length === 1 ? "" : "s"}.`
      );
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          `Failed to settle bulk ${isDiagnosisPayment ? "diagnosis" : "repair"} payment.`
      );
    } finally {
      setSettlingPaymentKey(null);
    }
  };

  const handleApplyVoucher = async (booking: Booking, paymentType: "diagnosis_fee" | "repair_fee", baseAmount: number) => {
    const code = voucherCodes[booking.id];
    if (!code?.trim()) {
      toast.error("Enter a voucher code.");
      return;
    }

    setVoucherValidations(prev => ({
      ...prev,
      [booking.id]: {
        loading: true,
        error: null,
        discountAmount: 0,
        finalAmount: baseAmount,
        isFullWaiver: false,
        validCode: null,
      }
    }));

    try {
      const response = await api.post(
        "/vouchers/validate/",
        {
          code: code.trim().toUpperCase(),
          amount: String(baseAmount),
          payment_type: paymentType,
          job_id: booking.backendJobId ?? Number(booking.id),
        },
        { showLoader: false }
      );

      const result = response?.data?.result;
      if (result) {
        const discountAmount = Number(result.discount_amount) || 0;
        const finalAmount = Number(result.final_amount) || 0;
        setVoucherValidations(prev => ({
          ...prev,
          [booking.id]: {
            loading: false,
            error: null,
            discountAmount,
            finalAmount,
            isFullWaiver: Boolean(result.is_full_waiver),
            validCode: result.voucher_code,
            paymentType,
          }
        }));
        toast.success(`Voucher applied! Discount: NGN ${discountAmount.toLocaleString()}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.fields?.voucher_code?.[0] ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Voucher validation failed.";
      
      setVoucherValidations(prev => ({
        ...prev,
        [booking.id]: {
          loading: false,
          error: message,
          discountAmount: 0,
          finalAmount: baseAmount,
          isFullWaiver: false,
          validCode: null,
          paymentType,
        }
      }));
      toast.error(message);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground">Loading parent and child jobs...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Corporate / Bulk Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the parent job first, then create the individual child jobs directly under it.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 px-4 py-4 text-sm text-muted-foreground">
          Parent jobs waiting: <span className="font-semibold text-foreground">{pendingParentCount}</span>
        </div>
      </div>

      <div className="glass-card space-y-6 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Create Parent Job</h2>
          <p className="text-sm text-muted-foreground">
            Create the corporate parent job first, then add each device as a real child ticket.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Search Existing Customer</h3>
            <p className="text-xs text-muted-foreground">
              Search by phone, email, or job ID. If found, we will prefill the organisation and saved address. Enter the current primary contact before creating the parent job.
            </p>
          </div>
          <div className="flex gap-2">
            <SearchField
              value={customerSearchQuery}
              onChange={(event) => setCustomerSearchQuery(event.target.value)}
              placeholder="Search by phone, email, or job ID..."
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={() => void searchExistingCustomer()} disabled={isSearchingCustomer}>
              {isSearchingCustomer ? "Searching..." : "Search"}
            </Button>
          </div>
          {customerSearchResults.length > 1 && (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {customerSearchResults.map((customer: any) => (
                <button
                  key={customer.id}
                  type="button"
                  className="w-full p-4 bg-secondary/50 hover:bg-secondary text-left transition-colors"
                  onClick={() => selectCustomerFromResult(customer)}
                >
                  <p className="text-sm font-medium text-foreground">
                    {customer.profile?.full_name || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {customer.email || customer.phone_number || "No contact"} · {customer.stats?.total_jobs ?? 0} jobs
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Company / Organisation</Label>
            <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Opay" className="bg-secondary border-border" />
            <p className="text-xs text-muted-foreground">
              This is saved as the customer name and reused when you search later.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Primary Contact</Label>
            <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Ada Obi" className="bg-secondary border-border" />
            <p className="text-xs text-muted-foreground">
              This is kept in the intake notes for the organisation and used for this parent-job record.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input
              value={contactPhone}
              onChange={(event) => applyContactPhoneValue(event.target.value)}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={PHONE_NUMBER_LENGTH}
              pattern={`\\d{${PHONE_NUMBER_LENGTH}}`}
              placeholder="08012345678"
              className="bg-secondary border-border"
            />
            {contactPhoneHasError && (
              <p className="text-xs text-destructive">
                Contact phone must be exactly {PHONE_NUMBER_LENGTH} digits.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input
              value={contactEmail}
              onChange={(event) => applyContactEmailValue(event.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="ops@company.com"
              className="bg-secondary border-border"
            />
            {contactEmailHasError && (
              <p className="text-xs text-destructive">
                Enter a valid contact email address like name@example.com.
              </p>
            )}
          </div>
        </div>

        {customerAddressOptions.length > 0 && (
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

        <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Service Location</h3>
            <p className="text-xs text-muted-foreground">
              This address will be copied into every child job created under this parent.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              value={addressLine}
              onChange={(event) => setAddressLine(event.target.value)}
              placeholder="1 Eru-Ifa Street, Lekki Peninsula II"
              className="bg-secondary border-border"
              rows={3}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Eti Osa" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={stateRegion} onChange={(event) => setStateRegion(event.target.value)} placeholder="Lagos" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Nigeria" className="bg-secondary border-border" />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Terms &amp; Conditions</h3>
            <p className="text-xs text-muted-foreground">
              Print the agreement, review it with the organisation contact, then confirm acceptance before creating the parent job.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/40 p-4">
            <FileSignature className="w-6 h-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Printable Service Agreement</p>
              <p className="text-xs text-muted-foreground">
                Open the PDF, print it, and have the organisation contact review and sign before proceeding.
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
              id="bulk-parent-terms"
              checked={parentTermsAccepted}
              onCheckedChange={(checked) => setParentTermsAccepted(checked as boolean)}
            />
            <Label htmlFor="bulk-parent-terms" className="text-sm leading-relaxed">
              I have printed the agreement, explained the terms and conditions to the organisation contact, and they have agreed to proceed.
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleCreateParentJob()}
            disabled={contactPhoneHasError || contactEmailHasError || !parentTermsAccepted}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            Create Parent Job
          </Button>
          <Button type="button" variant="ghost" onClick={resetParentForm}>Clear Bulk Form</Button>
        </div>

        <div ref={childJobFormRef} className="border-t border-border pt-6 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Add Child Jobs</h2>
            <p className="text-sm text-muted-foreground">
              Each device becomes its own child ticket immediately. There is no extra intake step after this.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Select Parent Job</Label>
            <Select value={selectedParentId || undefined} onValueChange={setSelectedParentId}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Choose the parent job first" />
              </SelectTrigger>
              <SelectContent>
                {bookings.map((booking) => (
                  <SelectItem key={booking.id} value={booking.id}>
                    {booking.bookingId} - {booking.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedParent && (
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
              Adding individual jobs under <span className="font-mono text-primary">{selectedParent.bookingId}</span> for <span className="font-medium">{selectedParent.companyName}</span>. The parent-job address will be copied into every child job automatically.
            </div>
          )}

          <div className="space-y-2">
            <div className="space-y-2">
              <Label>Device Type</Label>
              <Select value={childDeviceType} onValueChange={(value) => setChildDeviceType(value as DeviceType)}>
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
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Device Make</Label>
              <Input
                ref={childDeviceMakeInputRef}
                value={childDeviceMake}
                onChange={(event) => setChildDeviceMake(event.target.value)}
                placeholder="Apple"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Device Model</Label>
              <Input value={childDeviceModel} onChange={(event) => setChildDeviceModel(event.target.value)} placeholder="iPhone 15 Pro" className="bg-secondary border-border" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>IMEI / SERIAL Number </Label>
            <Input
              value={childSerialNumber}
              onChange={(event) => setChildSerialNumber(event.target.value)}
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="352099001761481"
              className="bg-secondary border-border"
            />
            {childImeiHasError && (
              <p className="text-xs text-destructive">
                IMEI / Serial number is required.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Issue Reported</Label>
            <Textarea value={childIssueReported} onChange={(event) => setChildIssueReported(event.target.value)} placeholder="Describe what is wrong with this device..." className="bg-secondary border-border" rows={4} />
          </div>

          <div className="space-y-2">
            <Label>Device Images</Label>
            <input
              ref={childImageInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleChildImageInputChange}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => childImageInputRef.current?.click()}>
                Add Images
              </Button>
              {childImages.length > 0 && (
                <p className="text-xs text-muted-foreground self-center">
                  {childImages.length} image{childImages.length === 1 ? "" : "s"} added
                </p>
              )}
            </div>
            {childImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {childImages.map((image, index) => (
                  <img
                    key={`${index}-${image.slice(0, 20)}`}
                    src={image}
                    alt={`Child job upload ${index + 1}`}
                    className="aspect-square rounded-md border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleAddChildJob()}
              disabled={!selectedParent || !hasValidChildImei}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Child Job
            </Button>
            <Button type="button" variant="ghost" onClick={resetChildForm}>Clear Job Form</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Parent Jobs</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{bookings.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Open Child Jobs</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{openChildCount}</p>
        </div>
      </div>

      <div className="glass-card p-4 space-y-4">
        <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parent job, company, contact, child ticket, or device..." />
        <p className="text-xs text-muted-foreground">
          Each individual device is created directly as its own child ticket. Open the ticket below whenever you need the full job workflow.
        </p>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="glass-card space-y-2 p-8 text-center">
          <p className="text-lg font-semibold text-foreground">
            {bookings.length === 0 ? "No parent jobs yet" : "No matching parent jobs"}
          </p>
          <p className="text-sm text-muted-foreground">
            {bookings.length === 0
              ? "Create the parent job above, then add the individual child jobs under it."
              : "Try another search term."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            return (
              <div key={booking.id} className="glass-card space-y-4 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-semibold text-primary">{booking.bookingId}</p>
                    <h2 className="text-lg font-semibold text-foreground">{booking.companyName}</h2>
                    <p className="text-sm text-muted-foreground">
                      {booking.customerName} | {booking.customerPhone} | {booking.customerEmail}
                    </p>
                    {booking.address && (
                      <p className="text-xs text-muted-foreground">
                        Service location: {[booking.address, booking.city, booking.state, booking.country].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {booking.childJobs.length} child job{booking.childJobs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-4 py-1 text-xs font-semibold ${STATUS_STYLES[booking.status]}`}>
                      {booking.backendStatus ? booking.backendStatus.replace(/_/g, " ") : BOOKING_STATUS_LABELS[booking.status]}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/40 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <Label className="text-muted-foreground">Voucher Code (Optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        className="max-w-[200px]"
                        value={voucherCodes[booking.id] || ""}
                        onChange={(e) => {
                          setVoucherCodes(prev => ({ ...prev, [booking.id]: e.target.value.toUpperCase() }));
                          if (voucherValidations[booking.id]?.validCode && e.target.value.toUpperCase() !== voucherValidations[booking.id]?.validCode) {
                            setVoucherValidations(prev => {
                              const next = { ...prev };
                              delete next[booking.id];
                              return next;
                            });
                          }
                        }}
                        placeholder="e.g. SAVE20"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          !voucherCodes[booking.id]?.trim() || 
                          voucherValidations[booking.id]?.loading || 
                          voucherCodes[booking.id] === voucherValidations[booking.id]?.validCode ||
                          (!canSettleBulkDiagnosisPayment(booking) && !canSettleBulkRepairPayment(booking))
                        }
                        onClick={() => {
                           const paymentType = canSettleBulkDiagnosisPayment(booking) ? "diagnosis_fee" : "repair_fee";
                           const baseAmount = paymentType === "diagnosis_fee" ? getBulkDiagnosisTotalAmount(booking) : getBulkRepairTotalAmount(booking);
                           void handleApplyVoucher(booking, paymentType, baseAmount);
                        }}
                      >
                        {voucherValidations[booking.id]?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                    {voucherValidations[booking.id]?.error && (
                      <p className="text-xs text-destructive">{voucherValidations[booking.id].error}</p>
                    )}
                    {voucherValidations[booking.id]?.validCode && (
                      <p className="text-xs text-success">
                        Voucher applied! New Total: {formatCurrency(voucherValidations[booking.id].finalAmount)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => handleSelectParentForChild(booking.id)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Child Job
                    </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSettleBulkParentPayment(booking, "diagnosis_fee")}
                    disabled={
                      !canSettleBulkDiagnosisPayment(booking) ||
                      settlingPaymentKey === `${booking.id}:diagnosis_fee`
                    }
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {settlingPaymentKey === `${booking.id}:diagnosis_fee`
                      ? "Settling..."
                      : `Confirm Bulk Diagnosis Payment (${formatCurrency(
                          voucherValidations[booking.id]?.validCode && voucherValidations[booking.id]?.paymentType === "diagnosis_fee"
                            ? voucherValidations[booking.id].finalAmount
                            : getBulkDiagnosisTotalAmount(booking)
                        )})`}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleSettleBulkParentPayment(booking, "repair_fee")}
                    disabled={
                      !canSettleBulkRepairPayment(booking) ||
                      settlingPaymentKey === `${booking.id}:repair_fee`
                    }
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {settlingPaymentKey === `${booking.id}:repair_fee`
                      ? "Settling..."
                      : `Confirm Bulk Repair Payment (${formatCurrency(
                          voucherValidations[booking.id]?.validCode && voucherValidations[booking.id]?.paymentType === "repair_fee"
                            ? voucherValidations[booking.id].finalAmount
                            : getBulkRepairTotalAmount(booking)
                        )})`}
                  </Button>
                  </div>
                </div>

                <details className="overflow-hidden rounded-lg border border-border bg-background/30">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-4 text-sm font-medium text-foreground">
                    <FolderTree className="h-4 w-4 text-primary" />
                    Individual Jobs ({booking.childJobs.length})
                  </summary>
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    {booking.childJobs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                        No child jobs yet. Create the parent job first, then add devices under it.
                      </div>
                    ) : (
                      booking.childJobs.map((childJob) => (
                        <div key={childJob.id} className="space-y-4 rounded-lg border border-border bg-secondary/40 p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="font-mono text-sm font-semibold text-primary">{childJob.childJobId}</p>
                              <p className="text-sm text-foreground">
                                {DEVICE_TYPE_LABELS[childJob.deviceType]} - {childJob.deviceMake} {childJob.deviceModel}
                              </p>
                              {childJob.serialNumber && (
                                <p className="text-xs font-mono text-muted-foreground">{childJob.serialNumber}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full border px-4 py-1 text-xs font-semibold ${STATUS_STYLES[childJob.status]}`}>
                                {(childJob.backendStatus || CHILD_STATUS_LABELS[childJob.status]).replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1 rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                            <p><span className="font-medium text-foreground">Issue:</span> {childJob.issueReported}</p>
                            {childJob.backendDisplayId && (
                              <p>
                                <span className="font-medium text-foreground">Ticket:</span> {childJob.backendDisplayId}
                              </p>
                            )}
                            {childJob.address && (
                              <p>
                                <span className="font-medium text-foreground">Location:</span>{" "}
                                {[childJob.address, childJob.city, childJob.state, childJob.country].filter(Boolean).join(", ")}
                              </p>
                            )}
                            {childJob.technicianName && (
                              <p>
                                <span className="font-medium text-foreground">Technician:</span> {childJob.technicianName}
                              </p>
                            )}
                            {childJob.updatedAt && (
                              <p>
                                <span className="font-medium text-foreground">Updated:</span>{" "}
                                {new Date(childJob.updatedAt).toLocaleString()}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {childJob.backendJobId && (
                              <Button asChild type="button" variant="outline">
                                <Link to={`/ticket/${childJob.backendJobId}`}>Open Ticket</Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
