import { resolveAppRoleFromAuthPayload, resolveAppRolesFromAuthPayload, type AppRole } from "@/auth/roleUtils";
import { dbDelete, dbGet, dbSet, migrateFromLocalStorage } from "@/frontdesk/lib/db";
import {
  getDeviceCategoryLabel,
  normalizeDeviceCategoryName,
} from "@/lib/deviceCategories";

export type UserRole = AppRole;

export interface User {
  id: string;
  name: string;
  role: UserRole;
  // Every role the account holds; `role` is the main one. Absent on locally created accounts.
  roles?: UserRole[];
  email: string;
  storeLocation?: string;
}

export interface UserAccount extends User {
  password: string;
}

export type TicketStatus =
  | "intake"
  | "awaiting_diagnosis_payment"
  | "diagnosing"
  | "awaiting_repair_payment"
  | "awaiting_parts_release"
  | "ready_for_repair"
  | "repairing"
  | "quality_check"
  | "ready_for_handover"
  | "completed"
  | "cancelled"
  | "warranty_review"
  | "warranty_void"
  | "repeat_case_validation_pending"
  | "warranty_validation_pending"
  | "warranty_validated"
  | "quote_sent"
  | "quote_accepted"
  | "awaiting_payment"
  | "payment_confirmed"
  | "repair_in_progress"
  | "repaired"
  | "submitted_for_qc_review"
  | "qc_passed"
  | "ready_for_collection"
  | "delivered"
  | "closed"
  | "awaiting_reassignment"
  | "awaiting_assignment";

export type TicketIntakeType =
  | "post_warranty"
  | "repeat_return"
  | "warranty"
  | "onsite"
  | "corporate";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export type DeviceType = string;

export interface DeviceInfo {
  make: string;
  model: string;
  imei: string;
  images: string[];
  type?: DeviceType;
}

export interface SignedAgreement {
  id: string;
  acceptedAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  termsSnapshot: string;
  signatureDataUrl?: string;
  storeLocation?: string;
}

export interface TicketPartRequest {
  partId: string;
  partName?: string;
  available?: boolean;
  requestedAt?: string;
  releasedAt?: string;
  receivedAt?: string;
  returnedDefectiveAt?: string;
  returnedDefectiveReason?: string;
  defectiveReturnReceivedAt?: string;
  replacementReleasedAt?: string;
  replacementReceivedAt?: string;
}

export type PartSourcingStatus = "sourceable" | "not_sourceable";

export interface Ticket {
  id: string;
  jobId: string;
  customer: Customer;
  device: DeviceInfo;
  intakeType: TicketIntakeType;
  organizationName?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  sourceTicketId?: string;
  issueReported?: string;
  customerNote?: string;
  engineerUpdate?: string;
  status: TicketStatus;
  isWarranty: boolean;
  diagnosis?: string;
  quotation?: number;
  serviceSelections?: ServiceOptionKey[];
  diagnosisFee: number;
  diagnosisPaymentMode: PaymentMode;
  diagnosisPaymentReceivedAt?: string;
  repairPaymentMode: PaymentMode;
  repairPaymentReceivedAt?: string;
  partRequests?: TicketPartRequest[];
  partSourcingStatus?: PartSourcingStatus;
  partSourcingCheckedAt?: string;
  partRequired?: string;
  partAvailable?: boolean;
  partRequestedAt?: string;
  partReleasedAt?: string;
  partReturnedDefectiveAt?: string;
  partReturnedDefectiveReason?: string;
  cancellationReason?: string;
  agreement?: SignedAgreement;
  warrantyVoidReason?: string;
  qaNotes?: string;
  qaCheckedBy?: string;
  qaLastCheckedAt?: string;
  handedOverAt?: string;
  handedOverBy?: string;
  createdAt: string;
  updatedAt: string;
  assignedEngineer?: string;
  termsAccepted: boolean;
  isRepeatCase?: boolean;
  parentJobId?: string;
  sourceChannel?: string;
  jobGroupType?: "parent" | "child";
  jobRelationType?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  category: string;
  quantity: number;
  locked: number;
  price: number;
}

export type ServiceOptionKey =
  | "os_repair"
  | "data_recovery"
  | "software_install"
  | "device_setup"
  | "diagnostic_cleanup";

export type InvoiceType = "diagnosis_fee" | "repair_quote" | "repair_payment";
export type PaymentMode = "cash" | "pos" | "bank_transfer";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  ticketId: string;
  jobId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deviceLabel: string;
  type: InvoiceType;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  issuedAt: string;
  subtotal?: number;
  voucherCode?: string;
  voucherDiscount?: number;
}

export interface AppSettings {
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  diagnosisFee: number;
  termsAndConditions: string;
  paymentInstructions: string;
  receiptFooter: string;
}

export type OnlineBookingStatus = "new" | "in_progress" | "processed";
export type OnlineBookingChildStatus = "new" | "in_progress" | "processed" | "cancelled";
export type OnlineBookingPaymentStatus = "pending" | "partial" | "paid";
export type OnlineBookingDiagnosisStatus = "pending" | "partial" | "completed";

export interface OnlineBookingChild {
  id: string;
  childJobId: string;
  backendJobId?: string;
  backendDisplayId?: string;
  backendStatus?: string;
  technicianName?: string;
  createdAt?: string;
  updatedAt?: string;
  deviceType: DeviceType;
  deviceMake: string;
  deviceModel: string;
  serialNumber?: string;
  serviceQuoteAmount?: number;
  issueReported: string;
  images?: string[];
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  paymentMode?: PaymentMode;
  paymentStatus: OnlineBookingPaymentStatus;
  diagnosisStatus: OnlineBookingDiagnosisStatus;
  status: OnlineBookingChildStatus;
  processedAt?: string;
  intakeTicketId?: string;
}

export interface OnlineBooking {
  id: string;
  bookingId: string;
  customerId?: string;
  companyName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  backendStatus?: string;
  lifecycleStage?: string;
  createdAt?: string;
  updatedAt?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  paymentMode?: PaymentMode;
  bookedAt: string;
  status: OnlineBookingStatus;
  paymentStatus: OnlineBookingPaymentStatus;
  diagnosisStatus: OnlineBookingDiagnosisStatus;
  childJobs: OnlineBookingChild[];
  processedAt?: string;
}

const TICKETS_KEY = "repair_shop_tickets";
const INVENTORY_KEY = "repair_shop_inventory";
const AUTH_KEY = "repair_shop_auth";
const USERS_KEY = "repair_shop_users";
const USERS_VERSION_KEY = "repair_shop_users_version";
const INVOICES_KEY = "repair_shop_invoices";
const SETTINGS_KEY = "repair_shop_settings";
const ONLINE_BOOKINGS_KEY = "repair_shop_online_bookings";
const DB_KEYS = [TICKETS_KEY, INVENTORY_KEY, AUTH_KEY, USERS_KEY, USERS_VERSION_KEY, INVOICES_KEY, SETTINGS_KEY, ONLINE_BOOKINGS_KEY];
const USER_ROLES: UserRole[] = ["front_desk", "engineer", "qa", "admin", "inventory_manager", "sales", "procurement", "logistics", "finance", "cx", "marketing", "operations"];
const TICKET_STATUSES: TicketStatus[] = [
  "intake",
  "awaiting_diagnosis_payment",
  "diagnosing",
  "awaiting_repair_payment",
  "awaiting_parts_release",
  "ready_for_repair",
  "repairing",
  "quality_check",
  "ready_for_handover",
  "completed",
  "cancelled",
  "warranty_review",
  "warranty_void",
  "warranty_validation_pending",
  "warranty_validated",
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
  "awaiting_reassignment",
  "awaiting_assignment",
];
const INVOICE_TYPES: InvoiceType[] = ["diagnosis_fee", "repair_quote", "repair_payment"];
const PAYMENT_MODES: PaymentMode[] = ["cash", "pos", "bank_transfer"];
const PART_SOURCING_STATUSES: PartSourcingStatus[] = ["sourceable", "not_sourceable"];
const ONLINE_BOOKING_PAYMENT_STATUSES: OnlineBookingPaymentStatus[] = [
  "pending",
  "partial",
  "paid",
];
const ONLINE_BOOKING_DIAGNOSIS_STATUSES: OnlineBookingDiagnosisStatus[] = [
  "pending",
  "partial",
  "completed",
];
const TICKET_INTAKE_TYPES: TicketIntakeType[] = [
  "post_warranty",
  "repeat_return",
  "warranty",
  "onsite",
];

const LEGACY_TERMS_AND_CONDITIONS = [
  "1. Diagnosis Fee: A non-refundable diagnosis fee is required before any assessment begins.",
  "2. Repair Authorization: Repairs only start after customer approval of the quotation.",
  "3. Parts & Warranty: Replaced parts carry a 3-month warranty from repair completion date.",
  "4. Data Responsibility: The shop is not responsible for data loss during repairs.",
  "5. Uncollected Devices: Devices not collected within 90 days may be disposed of.",
  "6. Liability: Liability is limited to repair value; pre-existing conditions are excluded.",
].join("\n");

const COMPILED_TERMS_AND_CONDITIONS = [
  "CyberSquad Terms & Conditions",
  "Last Updated: February 2026",
  "",
  "CyberSquad Technologies Ltd. operates a digital marketplace platform that connects Customers requiring repair or maintenance services with verified independent Technicians (Merchants). By using the platform, you agree to these terms, the Privacy Policy, SLA (for technicians), and related policies.",
  "",
  "CyberSquad is a technology intermediary only. We do not employ technicians, provide repair services directly, or guarantee service outcomes. Each job contract is between the Customer and the assigned Technician.",
  "",
  "1. Eligibility and Account Registration",
  "- You must be at least 18 years old and legally authorized to contract/work in Nigeria.",
  "- All users: one account only; keep account details accurate and credentials secure.",
  "- Technicians: complete verification (valid ID, skills/certifications, bank details, service areas, and required documents).",
  "",
  "2. Platform Use and Service Process",
  "- Customers submit job requests with description, location, and supporting media where needed.",
  "- Technicians accept/decline promptly, perform work professionally, and upload before/after proof.",
  "- Platform supports matching, tracking, communication, payments, ratings, and dispute handling.",
  "",
  "3. Service Level Agreement (Technicians Only)",
  "- Respond to jobs within 10 minutes.",
  "- Arrive within 90 minutes (urban/Lagos) or 2 hours (suburban/rural), unless otherwise stated.",
  "- Use quality/genuine parts and maintain professional conduct.",
  "- Repeated SLA failures may reduce visibility, trigger review, suspension, or deactivation.",
  "",
  "4. Payments, Fees, and Payouts",
  "- All transactions must happen on-platform.",
  "- Customers: deposit confirms dispatch; balance is paid after completion.",
  "- Technicians: payouts are weekly for approved completed jobs, less platform fees.",
  "- CyberSquad may withhold/offset payouts for disputes, refunds, or policy violations.",
  "",
  "5. Cancellations, Refunds, and Rescheduling",
  "- Before dispatch: customer cancellation is free.",
  "- After dispatch: cancellation fees may apply.",
  "- Refunds are processed to the original payment method (typically within 5 to 7 business days).",
  "- Rescheduling depends on availability and may require a new deposit.",
  "",
  "6. Conduct, Ratings, and Feedback",
  "- Respectful conduct is required at all times; abuse, harassment, discrimination, or unsafe behavior is prohibited.",
  "- Ratings/reviews must be factual and relevant.",
  "- Customer ratings affect technician visibility and quality scoring.",
  "",
  "7. Disputes and Complaints",
  "- Customers should report issues within 48 hours.",
  "- Technicians should dispute ratings/payout concerns within 24 hours.",
  "- CyberSquad investigates and mediates disputes in good faith.",
  "",
  "8. Limitation of Liability and Disclaimers",
  "- Platform is provided 'as is' without warranties.",
  "- CyberSquad is not liable for technician acts/omissions or service outcomes.",
  "- Maximum liability is limited to the amount paid/received for the specific transaction, to the extent permitted by law.",
  "",
  "9. Indemnification",
  "- You agree to indemnify and hold CyberSquad harmless from claims, losses, and expenses arising from your breach, misuse, uploaded content, or job-related conduct.",
  "",
  "10. Data Privacy and Confidentiality",
  "- Data is handled under NDPA 2023 and CyberSquad Privacy Policy.",
  "- Technicians must treat customer data as confidential and use it only for job fulfillment.",
  "",
  "11. Termination and Deactivation",
  "- CyberSquad may suspend/terminate accounts for violations, fraud, safety concerns, or repeated SLA/performance failures.",
  "- Users may request account deletion, subject to unresolved obligations (payments/disputes/compliance).",
  "",
  "12. Changes to Terms",
  "- CyberSquad may update these terms and will notify users through app/email/in-app notices where required.",
  "- Continued use after the effective date means acceptance.",
  "",
  "13. General Provisions",
  "- Governing law: Federal Republic of Nigeria.",
  "- Dispute jurisdiction: Lagos courts, after good-faith resolution attempts.",
  "- Severability applies if any clause becomes invalid.",
  "- These terms, Privacy Policy, and SLA together form the full agreement.",
  "",
  "Acceptance",
  "By using the platform (Customers) or registering/accepting jobs (Technicians), you confirm that you have read, understood, and agreed to these Terms & Conditions.",
].join("\n");

const DEFAULT_USER_ACCOUNTS: UserAccount[] = [
  { id: "1", name: "Sarah Johnson", role: "front_desk", email: "sarah@repairshop.com", password: "demo123" },
  { id: "2", name: "Mike Chen", role: "engineer", email: "mike@repairshop.com", password: "demo123" },
  { id: "3", name: "Admin User", role: "admin", email: "admin@repairshop.com", password: "demo123" },
  { id: "4", name: "Ivy Stock", role: "inventory_manager", email: "inventory@repairshop.com", password: "demo123" },
  { id: "5", name: "Nina QA", role: "qa", email: "qa@repairshop.com", password: "demo123" },
];

export const DEMO_USERS: User[] = DEFAULT_USER_ACCOUNTS.map(({ password: _password, ...user }) => user);

const DEFAULT_INVENTORY: InventoryItem[] = [
  { id: "1", name: "iPhone 15 Screen", category: "Screens", quantity: 5, locked: 0, price: 120 },
  { id: "2", name: "Samsung S24 Battery", category: "Batteries", quantity: 8, locked: 0, price: 45 },
  { id: "3", name: "iPhone 14 Charging Port", category: "Ports", quantity: 12, locked: 0, price: 30 },
  { id: "4", name: "iPad Air 5 Screen", category: "Screens", quantity: 3, locked: 0, price: 180 },
  { id: "5", name: "Pixel 8 Back Glass", category: "Glass", quantity: 6, locked: 0, price: 55 },
  { id: "6", name: "Samsung S23 Screen", category: "Screens", quantity: 4, locked: 1, price: 140 },
  { id: "7", name: "Universal Earpiece Speaker", category: "Speakers", quantity: 20, locked: 0, price: 15 },
  { id: "8", name: "iPhone 13 Camera Module", category: "Cameras", quantity: 2, locked: 0, price: 95 },
];

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: "Cybersquad Device Services",
  businessPhone: "+234 800 000 0000",
  businessEmail: "support@cybersquad.com",
  businessAddress: "Lagos, Nigeria",
  diagnosisFee: 5000,
  termsAndConditions: COMPILED_TERMS_AND_CONDITIONS,
  paymentInstructions: "Please pay via bank transfer or card and share proof of payment.",
  receiptFooter: "Thank you for choosing Cybersquad.",
};

export const NO_PARTS_REQUIRED_REPAIR_FEE = 5000;
export const SERVICE_OPTION_PRICE = 5000;
export const SERVICE_OPTION_LABELS: Record<ServiceOptionKey, string> = {
  os_repair: "OS Repair",
  data_recovery: "Data Recovery",
  software_install: "Software Install",
  device_setup: "Device Setup",
  diagnostic_cleanup: "Diagnostic Cleanup",
};
export const SERVICE_OPTION_KEYS = Object.keys(SERVICE_OPTION_LABELS) as ServiceOptionKey[];
const SERVICE_PART_PREFIX = "SERVICE::";

let initPromise: Promise<void> | null = null;

function cloneDefaultInventory() {
  return DEFAULT_INVENTORY.map((item) => ({ ...item }));
}

function cloneDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

function cloneDefaultUserAccounts() {
  return DEFAULT_USER_ACCOUNTS.map((account) => ({ ...account }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getAssignedStoresFromAuthPayload(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];

  const topLevelStores = readRecordArray(payload.assigned_stores);
  if (topLevelStores.length > 0) {
    return topLevelStores;
  }

  const user = isRecord(payload.user) ? payload.user : null;
  if (!user) return [];

  return readRecordArray(user.assigned_stores);
}

function formatAssignedStoreLocation(payload: unknown): string | undefined {
  const stores = getAssignedStoresFromAuthPayload(payload);
  if (stores.length === 0) return undefined;

  const primaryStore =
    stores.find((store) => readBoolean(store.is_primary) === true) ?? stores[0];

  const name = readString(primaryStore.name)?.trim();
  const city = readString(primaryStore.city)?.trim();
  const code = readString(primaryStore.code)?.trim();

  if (name && city) {
    if (name.toLowerCase().includes(city.toLowerCase())) {
      return name;
    }
    return `${name}, ${city}`;
  }

  return city || name || code || undefined;
}

function normalizeUser(value: unknown): User | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const name = readString(value.name);
  const email = readString(value.email);
  const role = readString(value.role);

  if (!id || !name || !email || !role || !USER_ROLES.includes(role as UserRole)) {
    return null;
  }

  const normalized: User = { id, name, email, role: role as UserRole };
  const storeLocation = readString(value.storeLocation)?.trim();
  if (storeLocation) {
    normalized.storeLocation = storeLocation;
  }

  return normalized;
}

function normalizeUserAccount(value: unknown): UserAccount | null {
  const normalizedUser = normalizeUser(value);
  if (!normalizedUser || !isRecord(value)) return null;

  const password = readString(value.password);
  if (!password) return null;

  return {
    ...normalizedUser,
    password,
  };
}

function normalizeCustomer(value: unknown): Customer {
  if (!isRecord(value)) {
    return { id: generateId(), name: "Unknown Customer", phone: "", email: "" };
  }

  return {
    id: readString(value.id) ?? generateId(),
    name: readString(value.name) ?? "Unknown Customer",
    phone: readString(value.phone) ?? "",
    email: readString(value.email) ?? "",
  };
}

function normalizeDevice(value: unknown): DeviceInfo {
  if (!isRecord(value)) {
    return {
      make: "Unknown",
      model: "Device",
      imei: "",
      images: [],
    };
  }

  const rawType = readString(value.type);
  const type = rawType ? normalizeDeviceCategoryName(rawType, "") || undefined : undefined;
  const images = Array.isArray(value.images)
    ? value.images.filter((image): image is string => typeof image === "string")
    : [];

  return {
    make: readString(value.make) ?? "Unknown",
    model: readString(value.model) ?? "Device",
    imei: readString(value.imei) ?? "",
    images,
    type,
  };
}

function normalizeAgreement(value: unknown): SignedAgreement | undefined {
  if (!isRecord(value)) return undefined;

  const id = readString(value.id);
  const acceptedAt = readString(value.acceptedAt);
  const customerName = readString(value.customerName);
  const customerPhone = readString(value.customerPhone);
  const customerEmail = readString(value.customerEmail);
  const termsSnapshot = readString(value.termsSnapshot);
  const signatureDataUrl = readString(value.signatureDataUrl);

  if (
    !id ||
    !acceptedAt ||
    !customerName ||
    !customerPhone ||
    !customerEmail ||
    !termsSnapshot
  ) {
    return undefined;
  }

  const normalized: SignedAgreement = {
    id,
    acceptedAt,
    customerName,
    customerPhone,
    customerEmail,
    termsSnapshot,
  };

  if (signatureDataUrl) {
    normalized.signatureDataUrl = signatureDataUrl;
  }

  const storeLocation = readString(value.storeLocation)?.trim();
  if (storeLocation) {
    normalized.storeLocation = storeLocation;
  }

  return normalized;
}

function normalizeTicketPartRequest(value: unknown): TicketPartRequest | null {
  if (!isRecord(value)) return null;

  const partId = readString(value.partId)?.trim();
  if (!partId) return null;

  const normalized: TicketPartRequest = { partId };
  const partName = readString(value.partName)?.trim();
  const available = readBoolean(value.available);
  const requestedAt = readString(value.requestedAt);
  const releasedAt = readString(value.releasedAt);
  const receivedAt = readString(value.receivedAt);
  const returnedDefectiveAt = readString(value.returnedDefectiveAt);
  const returnedDefectiveReason = readString(value.returnedDefectiveReason);
  const defectiveReturnReceivedAt = readString(value.defectiveReturnReceivedAt);
  const replacementReleasedAt = readString(value.replacementReleasedAt);
  const replacementReceivedAt = readString(value.replacementReceivedAt);

  if (partName) normalized.partName = partName;
  if (available !== undefined) normalized.available = available;
  if (requestedAt) normalized.requestedAt = requestedAt;
  if (releasedAt) normalized.releasedAt = releasedAt;
  if (receivedAt) normalized.receivedAt = receivedAt;
  if (returnedDefectiveAt) normalized.returnedDefectiveAt = returnedDefectiveAt;
  if (returnedDefectiveReason) normalized.returnedDefectiveReason = returnedDefectiveReason;
  if (defectiveReturnReceivedAt) normalized.defectiveReturnReceivedAt = defectiveReturnReceivedAt;
  if (replacementReleasedAt) normalized.replacementReleasedAt = replacementReleasedAt;
  if (replacementReceivedAt) normalized.replacementReceivedAt = replacementReceivedAt;

  return normalized;
}

function normalizeTicket(value: unknown): Ticket | null {
  if (!isRecord(value)) return null;

  const now = new Date().toISOString();
  const rawStatus = readString(value.status);
  const status =
    rawStatus && TICKET_STATUSES.includes(rawStatus as TicketStatus)
      ? (rawStatus as TicketStatus)
      : "intake";
  const rawDiagnosisPaymentMode = readString(value.diagnosisPaymentMode);
  const diagnosisPaymentMode =
    rawDiagnosisPaymentMode && PAYMENT_MODES.includes(rawDiagnosisPaymentMode as PaymentMode)
      ? (rawDiagnosisPaymentMode as PaymentMode)
      : "cash";
  const rawRepairPaymentMode = readString(value.repairPaymentMode);
  const repairPaymentMode =
    rawRepairPaymentMode && PAYMENT_MODES.includes(rawRepairPaymentMode as PaymentMode)
      ? (rawRepairPaymentMode as PaymentMode)
      : "cash";
  const rawIntakeType = readString(value.intakeType);
  const intakeType =
    rawIntakeType && TICKET_INTAKE_TYPES.includes(rawIntakeType as TicketIntakeType)
      ? (rawIntakeType as TicketIntakeType)
      : readBoolean(value.isWarranty)
      ? "repeat_return"
      : "post_warranty";
  const quotation = readNumber(value.quotation);
  const partAvailable = readBoolean(value.partAvailable);
  const normalizedDevice = normalizeDevice(value.device);
  const legacyDeviceImages = Array.isArray(value.deviceImages)
    ? value.deviceImages.filter((image): image is string => typeof image === "string" && image.trim().length > 0)
    : [];
  const device =
    normalizedDevice.images.length > 0 || legacyDeviceImages.length === 0
      ? normalizedDevice
      : {
          ...normalizedDevice,
          images: legacyDeviceImages,
        };

  let loadedDiagnosisFee = readNumber(value.diagnosisFee) ?? DEFAULT_SETTINGS.diagnosisFee;
  if (loadedDiagnosisFee === 25) {
    loadedDiagnosisFee = DEFAULT_SETTINGS.diagnosisFee;
  }

  const normalized: Ticket = {
    id: readString(value.id) ?? generateId(),
    jobId: readString(value.jobId) ?? generateJobId(),
    customer: normalizeCustomer(value.customer),
    device,
    intakeType,
    status,
    isWarranty: readBoolean(value.isWarranty) ?? false,
    diagnosisFee: loadedDiagnosisFee,
    diagnosisPaymentMode,
    repairPaymentMode,
    createdAt: readString(value.createdAt) ?? now,
    updatedAt: readString(value.updatedAt) ?? now,
    termsAccepted: readBoolean(value.termsAccepted) ?? false,
  };

  const issueReported = readString(value.issueReported);
  const customerNote = readString(value.customerNote);
  const engineerUpdate = readString(value.engineerUpdate);
  const diagnosis = readString(value.diagnosis);
  const diagnosisPaymentReceivedAt = readString(value.diagnosisPaymentReceivedAt);
  const partRequired = readString(value.partRequired);
  const partRequestedAt = readString(value.partRequestedAt);
  const partReleasedAt = readString(value.partReleasedAt);
  const partReturnedDefectiveAt = readString(value.partReturnedDefectiveAt);
  const partReturnedDefectiveReason = readString(value.partReturnedDefectiveReason);
  const warrantyVoidReason = readString(value.warrantyVoidReason);
  const assignedEngineer = readString(value.assignedEngineer);
  const repairPaymentReceivedAt = readString(value.repairPaymentReceivedAt);
  const organizationName = readString(value.organizationName);
  const address = readString(value.address);
  const city = readString(value.city);
  const state = readString(value.state);
  const country = readString(value.country);
  const sourceTicketId = readString(value.sourceTicketId);
  const qaNotes = readString(value.qaNotes);
  const qaCheckedBy = readString(value.qaCheckedBy);
  const qaLastCheckedAt = readString(value.qaLastCheckedAt);
  const handedOverAt = readString(value.handedOverAt);
  const handedOverBy = readString(value.handedOverBy);
  const rawPartSourcingStatus = readString(value.partSourcingStatus);
  const partSourcingStatus =
    rawPartSourcingStatus &&
    PART_SOURCING_STATUSES.includes(rawPartSourcingStatus as PartSourcingStatus)
      ? (rawPartSourcingStatus as PartSourcingStatus)
      : undefined;
  const partSourcingCheckedAt = readString(value.partSourcingCheckedAt);
  const cancellationReason = readString(value.cancellationReason);
  const agreement = normalizeAgreement(value.agreement);
  const serviceSelections = Array.isArray(value.serviceSelections)
    ? value.serviceSelections.filter(
        (entry): entry is ServiceOptionKey =>
          typeof entry === "string" && SERVICE_OPTION_KEYS.includes(entry as ServiceOptionKey)
      )
    : [];
  const normalizedPartRequests = Array.isArray(value.partRequests)
    ? value.partRequests
        .map((entry) => normalizeTicketPartRequest(entry))
        .filter((entry): entry is TicketPartRequest => entry !== null)
    : [];
  const partRequests =
    normalizedPartRequests.length > 0
      ? normalizedPartRequests
      : partRequired
      ? [
          {
            partId: partRequired,
            ...(partAvailable !== undefined ? { available: partAvailable } : {}),
            ...(partRequestedAt ? { requestedAt: partRequestedAt } : {}),
            ...(partReleasedAt ? { releasedAt: partReleasedAt } : {}),
            ...(partReturnedDefectiveAt ? { returnedDefectiveAt: partReturnedDefectiveAt } : {}),
            ...(partReturnedDefectiveReason
              ? { returnedDefectiveReason: partReturnedDefectiveReason }
              : {}),
          },
        ]
      : [];

  if (issueReported) normalized.issueReported = issueReported;
  if (customerNote) normalized.customerNote = customerNote;
  if (engineerUpdate) normalized.engineerUpdate = engineerUpdate;
  if (diagnosis) normalized.diagnosis = diagnosis;
  if (diagnosisPaymentReceivedAt) normalized.diagnosisPaymentReceivedAt = diagnosisPaymentReceivedAt;
  if (quotation !== undefined) normalized.quotation = quotation;
  if (serviceSelections.length > 0) normalized.serviceSelections = serviceSelections;
  if (partRequests.length > 0) normalized.partRequests = partRequests;
  if (partRequired) normalized.partRequired = partRequired;
  if (partRequestedAt) normalized.partRequestedAt = partRequestedAt;
  if (partReleasedAt) normalized.partReleasedAt = partReleasedAt;
  if (partReturnedDefectiveAt) normalized.partReturnedDefectiveAt = partReturnedDefectiveAt;
  if (partReturnedDefectiveReason) normalized.partReturnedDefectiveReason = partReturnedDefectiveReason;
  if (partAvailable !== undefined) normalized.partAvailable = partAvailable;
  if (agreement) normalized.agreement = agreement;
  if (warrantyVoidReason) normalized.warrantyVoidReason = warrantyVoidReason;
  if (assignedEngineer) normalized.assignedEngineer = assignedEngineer;
  if (repairPaymentReceivedAt) normalized.repairPaymentReceivedAt = repairPaymentReceivedAt;
  if (organizationName) normalized.organizationName = organizationName;
  if (address) normalized.address = address;
  if (city) normalized.city = city;
  if (state) normalized.state = state;
  if (country) normalized.country = country;
  if (sourceTicketId) normalized.sourceTicketId = sourceTicketId;
  if (qaNotes) normalized.qaNotes = qaNotes;
  if (qaCheckedBy) normalized.qaCheckedBy = qaCheckedBy;
  if (qaLastCheckedAt) normalized.qaLastCheckedAt = qaLastCheckedAt;
  if (handedOverAt) normalized.handedOverAt = handedOverAt;
  if (handedOverBy) normalized.handedOverBy = handedOverBy;
  if (partSourcingStatus) normalized.partSourcingStatus = partSourcingStatus;
  if (partSourcingCheckedAt) normalized.partSourcingCheckedAt = partSourcingCheckedAt;
  if (cancellationReason) normalized.cancellationReason = cancellationReason;

  return normalized;
}

function normalizeInventoryItem(value: unknown): InventoryItem | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const name = readString(value.name);
  const sku = readString(value.sku);
  const category = readString(value.category);

  if (!id || !name || !category) return null;

  const quantity = Math.max(0, Math.floor(readNumber(value.quantity) ?? 0));
  const locked = Math.max(0, Math.floor(readNumber(value.locked) ?? 0));
  const price = Math.max(0, readNumber(value.price) ?? 0);

  return {
    id,
    name,
    ...(sku ? { sku } : {}),
    category,
    quantity,
    locked: Math.min(locked, quantity),
    price,
  };
}

function normalizeInvoice(value: unknown): Invoice | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const invoiceNumber = readString(value.invoiceNumber);
  const ticketId = readString(value.ticketId);
  const jobId = readString(value.jobId);
  const customerName = readString(value.customerName);
  const customerPhone = readString(value.customerPhone);
  const customerEmail = readString(value.customerEmail);
  const deviceLabel = readString(value.deviceLabel);
  const type = readString(value.type);
  const description = readString(value.description);
  const amount = readNumber(value.amount);
  const issuedAt = readString(value.issuedAt);

  if (
    !id ||
    !invoiceNumber ||
    !ticketId ||
    !jobId ||
    !customerName ||
    !customerPhone ||
    !customerEmail ||
    !deviceLabel ||
    !type ||
    !INVOICE_TYPES.includes(type as InvoiceType) ||
    !description ||
    amount === undefined ||
    !issuedAt
  ) {
    return null;
  }

  const rawPaymentMode = readString(value.paymentMode);
  const paymentMode =
    rawPaymentMode && PAYMENT_MODES.includes(rawPaymentMode as PaymentMode)
      ? (rawPaymentMode as PaymentMode)
      : "cash";

  const subtotal = readNumber(value.subtotal);
  const rawVoucherCode = readString(value.voucherCode);
  const voucherDiscount = readNumber(value.voucherDiscount);

  return {
    id,
    invoiceNumber,
    ticketId,
    jobId,
    customerName,
    customerPhone,
    customerEmail,
    deviceLabel,
    type: type as InvoiceType,
    description,
    amount,
    paymentMode,
    issuedAt,
    ...(subtotal !== undefined ? { subtotal } : {}),
    ...(rawVoucherCode ? { voucherCode: rawVoucherCode } : {}),
    ...(voucherDiscount !== undefined ? { voucherDiscount } : {}),
  };
}

function deriveOnlineBookingChildStatus(
  rawStatus: string | undefined,
  paymentStatus: OnlineBookingPaymentStatus,
  diagnosisStatus: OnlineBookingDiagnosisStatus
): OnlineBookingChildStatus {
  if (rawStatus === "cancelled") return "cancelled";
  if (paymentStatus === "paid" && diagnosisStatus === "completed") return "processed";
  if (
    rawStatus === "in_progress" ||
    rawStatus === "processed" ||
    paymentStatus !== "pending" ||
    diagnosisStatus !== "pending"
  ) {
    return "in_progress";
  }
  return "new";
}

function summarizeOnlineBookingPaymentStatus(
  childJobs: OnlineBookingChild[]
): OnlineBookingPaymentStatus {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) return "pending";

  const paidCount = activeChildJobs.filter(
    (childJob) => childJob.paymentStatus === "paid"
  ).length;
  if (paidCount === 0) return "pending";
  if (paidCount === activeChildJobs.length) return "paid";
  return "partial";
}

function summarizeOnlineBookingDiagnosisStatus(
  childJobs: OnlineBookingChild[]
): OnlineBookingDiagnosisStatus {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) return "pending";

  const completedCount = activeChildJobs.filter(
    (childJob) => childJob.diagnosisStatus === "completed"
  ).length;
  if (completedCount === 0) return "pending";
  if (completedCount === activeChildJobs.length) return "completed";
  return "partial";
}

function summarizeOnlineBookingStatus(childJobs: OnlineBookingChild[]): OnlineBookingStatus {
  const activeChildJobs = childJobs.filter((childJob) => childJob.status !== "cancelled");
  if (activeChildJobs.length === 0) return "new";
  if (activeChildJobs.every((childJob) => childJob.status === "processed")) {
    return "processed";
  }
  if (
    activeChildJobs.some(
      (childJob) => childJob.status === "in_progress" || childJob.status === "processed"
    )
  ) {
    return "in_progress";
  }
  return "new";
}

function normalizeOnlineBookingChild(value: unknown): OnlineBookingChild | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const childJobId = readString(value.childJobId);
  const rawDeviceType = readString(value.deviceType);
  const deviceMake = readString(value.deviceMake);
  const deviceModel = readString(value.deviceModel);
  const issueReported = readString(value.issueReported);

  if (
    !id ||
    !childJobId ||
    !rawDeviceType ||
    !deviceMake ||
    !deviceModel ||
    !issueReported
  ) {
    return null;
  }

  const rawPaymentStatus = readString(value.paymentStatus);
  const paymentStatus =
    rawPaymentStatus &&
    ONLINE_BOOKING_PAYMENT_STATUSES.includes(
      rawPaymentStatus as OnlineBookingPaymentStatus
    )
      ? (rawPaymentStatus as OnlineBookingPaymentStatus)
      : "pending";

  const rawDiagnosisStatus = readString(value.diagnosisStatus);
  const diagnosisStatus =
    rawDiagnosisStatus &&
    ONLINE_BOOKING_DIAGNOSIS_STATUSES.includes(
      rawDiagnosisStatus as OnlineBookingDiagnosisStatus
    )
      ? (rawDiagnosisStatus as OnlineBookingDiagnosisStatus)
      : "pending";

  const rawStatus = readString(value.status);
  const paymentModeRaw = readString(value.paymentMode);
  const paymentMode =
    paymentModeRaw && PAYMENT_MODES.includes(paymentModeRaw as PaymentMode)
      ? (paymentModeRaw as PaymentMode)
      : undefined;

  return {
    id,
    childJobId,
    backendJobId: readString(value.backendJobId) || undefined,
    backendDisplayId: readString(value.backendDisplayId) || undefined,
    backendStatus: readString(value.backendStatus) || undefined,
    technicianName: readString(value.technicianName) || undefined,
    createdAt: readString(value.createdAt) || undefined,
    updatedAt: readString(value.updatedAt) || undefined,
    deviceType: normalizeDeviceCategoryName(rawDeviceType),
    deviceMake,
    deviceModel,
    serialNumber: readString(value.serialNumber) || undefined,
    serviceQuoteAmount: readNumber(value.serviceQuoteAmount) ?? undefined,
    issueReported,
    images: Array.isArray(value.images)
      ? value.images.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    address: readString(value.address) || undefined,
    city: readString(value.city) || undefined,
    state: readString(value.state) || undefined,
    country: readString(value.country) || undefined,
    latitude: readString(value.latitude) || undefined,
    longitude: readString(value.longitude) || undefined,
    paymentMode,
    paymentStatus,
    diagnosisStatus,
    status: deriveOnlineBookingChildStatus(rawStatus, paymentStatus, diagnosisStatus),
    processedAt: readString(value.processedAt),
    intakeTicketId: readString(value.intakeTicketId) || undefined,
  };
}

function normalizeLegacyOnlineBooking(value: Record<string, unknown>): OnlineBooking | null {
  const id = readString(value.id);
  const bookingId = readString(value.bookingId);
  const customerName = readString(value.customerName);
  const customerPhone = readString(value.customerPhone);
  const customerEmail = readString(value.customerEmail);
  const rawDeviceType = readString(value.deviceType);
  const deviceMake = readString(value.deviceMake);
  const deviceModel = readString(value.deviceModel);
  const issueReported = readString(value.issueReported);
  const bookedAt = readString(value.bookedAt);
  const rawStatus = readString(value.status);

  if (
    !id ||
    !bookingId ||
    !customerName ||
    (!customerPhone && !customerEmail) ||
    !rawDeviceType ||
    !deviceMake ||
    !deviceModel ||
    !issueReported ||
    !bookedAt ||
    !rawStatus
  ) {
    return null;
  }

  const paymentModeRaw = readString(value.paymentMode);
  const paymentMode =
    paymentModeRaw && PAYMENT_MODES.includes(paymentModeRaw as PaymentMode)
      ? (paymentModeRaw as PaymentMode)
      : undefined;

  const childStatus: OnlineBookingChildStatus =
    rawStatus === "processed" ? "in_progress" : "new";
  const childJob: OnlineBookingChild = {
    id: `${id}-child`,
    childJobId: `${bookingId}-01`,
    deviceType: normalizeDeviceCategoryName(rawDeviceType),
    deviceMake,
    deviceModel,
    serviceQuoteAmount: readNumber(value.serviceQuoteAmount) ?? undefined,
    issueReported,
    images: Array.isArray(value.images)
      ? value.images.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    address: readString(value.address) || undefined,
    city: readString(value.city) || undefined,
    state: readString(value.state) || undefined,
    country: readString(value.country) || undefined,
    latitude: readString(value.latitude) || undefined,
    longitude: readString(value.longitude) || undefined,
    paymentMode,
    paymentStatus: "pending",
    diagnosisStatus: "pending",
    status: childStatus,
    processedAt: readString(value.processedAt),
    backendDisplayId: readString(value.backendDisplayId) || undefined,
  };

  const childJobs = [childJob];

  return {
    id,
    bookingId,
    customerId: readString(value.customerId) || undefined,
    companyName: readString(value.companyName) ?? customerName,
    customerName,
    customerPhone,
    customerEmail,
    backendStatus: readString(value.backendStatus) || undefined,
    lifecycleStage: readString(value.lifecycleStage) || undefined,
    createdAt: readString(value.createdAt) || undefined,
    updatedAt: readString(value.updatedAt) || undefined,
    paymentMode,
    bookedAt,
    status: summarizeOnlineBookingStatus(childJobs),
    paymentStatus: summarizeOnlineBookingPaymentStatus(childJobs),
    diagnosisStatus: summarizeOnlineBookingDiagnosisStatus(childJobs),
    childJobs,
    processedAt:
      childStatus === "processed" ? childJob.processedAt ?? readString(value.processedAt) : undefined,
  };
}

function normalizeOnlineBooking(value: unknown): OnlineBooking | null {
  if (!isRecord(value)) return null;

  const childJobsRaw = Array.isArray(value.childJobs) ? value.childJobs : null;
  if (!childJobsRaw) {
    return normalizeLegacyOnlineBooking(value);
  }

  const id = readString(value.id);
  const bookingId = readString(value.bookingId);
  const companyName = readString(value.companyName) ?? readString(value.customerName);
  const customerName = readString(value.customerName);
  const customerPhone = readString(value.customerPhone);
  const customerEmail = readString(value.customerEmail);
  const bookedAt = readString(value.bookedAt);

  const childJobs = childJobsRaw
    .map((entry) => normalizeOnlineBookingChild(entry))
    .filter((childJob): childJob is OnlineBookingChild => childJob !== null);

  if (
    !id ||
    !bookingId ||
    !companyName ||
    !customerName ||
    (!customerPhone && !customerEmail) ||
    !bookedAt
  ) {
    return null;
  }

  const paymentModeRaw = readString(value.paymentMode);
  const paymentMode =
    paymentModeRaw && PAYMENT_MODES.includes(paymentModeRaw as PaymentMode)
      ? (paymentModeRaw as PaymentMode)
      : undefined;

  const status = summarizeOnlineBookingStatus(childJobs);

  return {
    id,
    bookingId,
    customerId: readString(value.customerId) || undefined,
    companyName,
    customerName,
    customerPhone,
    customerEmail,
    backendStatus: readString(value.backendStatus) || undefined,
    lifecycleStage: readString(value.lifecycleStage) || undefined,
    createdAt: readString(value.createdAt) || undefined,
    updatedAt: readString(value.updatedAt) || undefined,
    address: readString(value.address) || undefined,
    city: readString(value.city) || undefined,
    state: readString(value.state) || undefined,
    country: readString(value.country) || undefined,
    latitude: readString(value.latitude) || undefined,
    longitude: readString(value.longitude) || undefined,
    paymentMode,
    bookedAt,
    status,
    paymentStatus: summarizeOnlineBookingPaymentStatus(childJobs),
    diagnosisStatus: summarizeOnlineBookingDiagnosisStatus(childJobs),
    childJobs,
    processedAt:
      status === "processed" ? readString(value.processedAt) ?? childJobs[0]?.processedAt : undefined,
  };
}

async function readLocalStorage<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readFromStorage<T>(key: string): Promise<T | null> {
  try {
    const value = await dbGet<T>(key);
    if (value != null) return value;
  } catch {
    // Fallback to localStorage if IndexedDB is unavailable.
  }

  return readLocalStorage<T>(key);
}

async function writeToStorage<T>(key: string, value: T): Promise<void> {
  try {
    await dbSet(key, value);
  } catch {
    // Continue with localStorage fallback if IndexedDB is unavailable.
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage write failures in restricted environments.
    }
  }
}

async function deleteFromStorage(key: string): Promise<void> {
  try {
    await dbDelete(key);
  } catch {
    // Continue with localStorage fallback if IndexedDB is unavailable.
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore localStorage delete failures in restricted environments.
    }
  }
}

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await migrateFromLocalStorage(DB_KEYS);
      } catch {
        // Continue with fallback storage path.
      }

      try {
        const users = await readFromStorage<unknown>(USERS_KEY);
        const usersVersion = readInteger(await readFromStorage<unknown>(USERS_VERSION_KEY)) ?? 1;
        if (!Array.isArray(users)) {
          await writeToStorage(USERS_KEY, cloneDefaultUserAccounts());
          await writeToStorage(USERS_VERSION_KEY, 2);
        } else if (usersVersion < 2) {
          const normalizedUsers = users
            .map((entry) => normalizeUserAccount(entry))
            .filter((user): user is UserAccount => user !== null);
          const hasQaAccount = normalizedUsers.some((user) => user.role === "qa");
          if (!hasQaAccount) {
            const defaultQa = DEFAULT_USER_ACCOUNTS.find((account) => account.role === "qa");
            if (defaultQa) {
              normalizedUsers.push({ ...defaultQa });
              await writeToStorage(USERS_KEY, normalizedUsers);
            }
          }
          await writeToStorage(USERS_VERSION_KEY, 2);
        }
      } catch {
        // Never block app rendering if initialization fails.
      }

      try {
        const inventory = await readFromStorage<InventoryItem[]>(INVENTORY_KEY);
        if (!inventory) {
          await writeToStorage(INVENTORY_KEY, cloneDefaultInventory());
        }
      } catch {
        // Never block app rendering if initialization fails.
      }

      try {
        const settings = await readFromStorage<AppSettings>(SETTINGS_KEY);
        if (!settings) {
          await writeToStorage(SETTINGS_KEY, cloneDefaultSettings());
        }
      } catch {
        // Never block app rendering if initialization fails.
      }

      try {
        const onlineBookings = await readFromStorage<unknown>(ONLINE_BOOKINGS_KEY);
        if (!Array.isArray(onlineBookings)) {
          await writeToStorage(ONLINE_BOOKINGS_KEY, []);
        }
      } catch {
        // Never block app rendering if initialization fails.
      }
    })();
  }

  await initPromise;
}

function generateInvoiceNumber(existingInvoices: Invoice[]): string {
  const dayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sequence =
    existingInvoices.filter((invoice) => invoice.invoiceNumber.startsWith(`INV-${dayStamp}-`)).length + 1;
  return `INV-${dayStamp}-${String(sequence).padStart(3, "0")}`;
}

export async function getTickets(): Promise<Ticket[]> {
  await ensureInitialized();
  const raw = await readFromStorage<unknown>(TICKETS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeTicket(entry))
    .filter((ticket): ticket is Ticket => ticket !== null);
}

export async function saveTickets(tickets: Ticket[]) {
  await ensureInitialized();
  await writeToStorage(TICKETS_KEY, tickets);
}

export async function getInventory(): Promise<InventoryItem[]> {
  await ensureInitialized();
  const rawInventory = await readFromStorage<unknown>(INVENTORY_KEY);
  if (Array.isArray(rawInventory)) {
    const normalizedInventory = rawInventory
      .map((entry) => normalizeInventoryItem(entry))
      .filter((item): item is InventoryItem => item !== null);
    if (normalizedInventory.length > 0) return normalizedInventory;
  }

  const fallback = cloneDefaultInventory();
  await writeToStorage(INVENTORY_KEY, fallback);
  return fallback;
}

export async function saveInventory(items: InventoryItem[]) {
  await ensureInitialized();
  await writeToStorage(INVENTORY_KEY, items);
}

export async function getAuth(): Promise<User | null> {
  try {
    const userStr = localStorage.getItem("user");
    if (!userStr) return null;
    const payload = JSON.parse(userStr);

    const mappedRole = resolveAppRoleFromAuthPayload(payload);
    if (!mappedRole) {
      return null;
    }

    const storeLocation = formatAssignedStoreLocation(payload);

    return {
      id: String(payload.user?.id || ""),
      name: payload.user?.username || payload.user?.email || "Unknown User",
      email: payload.user?.email || "",
      role: mappedRole,
      roles: resolveAppRolesFromAuthPayload(payload),
      ...(storeLocation ? { storeLocation } : {}),
    };
  } catch (err) {
    return null;
  }
}

export async function setAuth(user: User | null) {
  // Legacy indexedDB setAuth replaced by localStorage writes upon authentication.
}

export async function getUsers(): Promise<UserAccount[]> {
  await ensureInitialized();
  const raw = await readFromStorage<unknown>(USERS_KEY);
  if (!Array.isArray(raw)) {
    const defaults = cloneDefaultUserAccounts();
    await writeToStorage(USERS_KEY, defaults);
    return defaults;
  }

  return raw
    .map((entry) => normalizeUserAccount(entry))
    .filter((user): user is UserAccount => user !== null);
}

export async function saveUsers(users: UserAccount[]) {
  await ensureInitialized();
  await writeToStorage(USERS_KEY, users);
}

export async function createUserAccount(userAccount: Omit<UserAccount, "id">) {
  const users = await getUsers();
  const normalizedEmail = userAccount.email.trim().toLowerCase();
  const emailExists = users.some((user) => user.email.trim().toLowerCase() === normalizedEmail);
  if (emailExists) {
    throw new Error("An account with that email already exists.");
  }

  const nextUser: UserAccount = {
    ...userAccount,
    id: generateId(),
    email: normalizedEmail,
    name: userAccount.name.trim(),
    password: userAccount.password.trim(),
    storeLocation: userAccount.storeLocation?.trim() || undefined,
  };

  users.push(nextUser);
  await saveUsers(users);
  return nextUser;
}

export async function deleteUserAccount(userId: string) {
  const users = await getUsers();
  const userToDelete = users.find((user) => user.id === userId);
  if (!userToDelete) return;
  if (userToDelete.role === "admin") {
    throw new Error("Admin accounts cannot be deleted.");
  }

  await saveUsers(users.filter((user) => user.id !== userId));

  const currentAuth = await getAuth();
  if (currentAuth?.id === userId) {
    await setAuth(null);
  }
}

export async function getInvoices(): Promise<Invoice[]> {
  await ensureInitialized();
  const raw = await readFromStorage<unknown>(INVOICES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeInvoice(entry))
    .filter((invoice): invoice is Invoice => invoice !== null);
}

export async function saveInvoices(invoices: Invoice[]) {
  await ensureInitialized();
  await writeToStorage(INVOICES_KEY, invoices);
}

export async function getOnlineBookings(): Promise<OnlineBooking[]> {
  await ensureInitialized();
  const raw = await readFromStorage<unknown>(ONLINE_BOOKINGS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeOnlineBooking(entry))
    .filter((booking): booking is OnlineBooking => booking !== null)
    .sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());
}

export async function saveOnlineBookings(bookings: OnlineBooking[]) {
  await ensureInitialized();
  await writeToStorage(ONLINE_BOOKINGS_KEY, bookings);
}

export async function getInvoicesByTicketId(ticketId: string): Promise<Invoice[]> {
  const invoices = await getInvoices();
  return invoices.filter((invoice) => invoice.ticketId === ticketId);
}

export async function getSettings(): Promise<AppSettings> {
  await ensureInitialized();
  const settings = await readFromStorage<AppSettings>(SETTINGS_KEY);
  if (!settings) {
    const defaults = cloneDefaultSettings();
    await writeToStorage(SETTINGS_KEY, defaults);
    return defaults;
  }

  const merged = {
    ...cloneDefaultSettings(),
    ...settings,
  };

  let requiresSave = false;

  // Migrate older default terms to the latest compiled terms without overriding custom edits.
  if (
    !merged.termsAndConditions ||
    merged.termsAndConditions.trim() === LEGACY_TERMS_AND_CONDITIONS.trim()
  ) {
    merged.termsAndConditions = COMPILED_TERMS_AND_CONDITIONS;
    requiresSave = true;
  }

  // Migrate older diagnosis fee default (25) to the new default (5000)
  if (merged.diagnosisFee === 25) {
    merged.diagnosisFee = 5000;
    requiresSave = true;
  }

  if (requiresSave) {
    await writeToStorage(SETTINGS_KEY, merged);
  }

  return merged;
}

export async function saveSettings(settings: AppSettings) {
  await ensureInitialized();
  await writeToStorage(SETTINGS_KEY, settings);
}

export async function getLatestInvoiceByTicketAndType(
  ticketId: string,
  type: InvoiceType
): Promise<Invoice | null> {
  const invoices = await getInvoicesByTicketId(ticketId);
  const filtered = invoices
    .filter((invoice) => invoice.type === type)
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  return filtered[0] ?? null;
}

export async function createInvoice(
  invoiceData: Omit<Invoice, "id" | "invoiceNumber" | "issuedAt">
): Promise<Invoice> {
  const invoices = await getInvoices();
  const invoice: Invoice = {
    ...invoiceData,
    id: generateId(),
    invoiceNumber: generateInvoiceNumber(invoices),
    issuedAt: new Date().toISOString(),
  };

  invoices.push(invoice);
  await saveInvoices(invoices);
  return invoice;
}

export function generateJobId(): string {
  const prefix = "JOB";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${num}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  intake: "Intake",
  awaiting_diagnosis_payment: "Awaiting Diagnosis Payment",
  diagnosing: "Diagnosing",
  awaiting_repair_payment: "Awaiting Repair Payment",
  awaiting_parts_release: "Awaiting Parts Release",
  ready_for_repair: "Ready For Repair",
  repairing: "Repairing",
  quality_check: "Quality Check",
  ready_for_handover: "Ready For Handover",
  completed: "Completed",
  cancelled: "Cancelled",
  warranty_review: "Warranty Review",
  warranty_void: "Warranty Void",
  repeat_case_validation_pending: "Repeat Case Validation Pending",
  warranty_validation_pending: "Warranty Validation Pending",
  warranty_validated: "Warranty Validated",
  quote_sent: "Quote Sent",
  quote_accepted: "Quote Accepted",
  awaiting_payment: "Awaiting Payment",
  payment_confirmed: "Payment Confirmed",
  repair_in_progress: "Repair In Progress",
  repaired: "Repaired",
  submitted_for_qc_review: "Submitted For QC Review",
  qc_passed: "QC Passed",
  ready_for_collection: "Ready For Collection",
  delivered: "Delivered",
  closed: "Closed",
  awaiting_reassignment: "Awaiting Reassignment",
  awaiting_assignment: "Awaiting Assignment",
};

export const TICKET_INTAKE_LABELS: Record<TicketIntakeType, string> = {
  post_warranty: "Post Warranty",
  repeat_return: "Repeat Returns",
  warranty: "Warranty",
  onsite: "Onsite",
  corporate: "Corporate",
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  intake: "bg-info",
  awaiting_diagnosis_payment: "bg-warning",
  diagnosing: "bg-info",
  awaiting_repair_payment: "bg-warning",
  awaiting_parts_release: "bg-warning",
  ready_for_repair: "bg-info",
  repairing: "bg-primary",
  quality_check: "bg-info",
  ready_for_handover: "bg-info",
  completed: "bg-success",
  cancelled: "bg-destructive",
  warranty_review: "bg-warning",
  warranty_void: "bg-destructive",
  repeat_case_validation_pending: "bg-warning",
  warranty_validation_pending: "bg-warning",
  warranty_validated: "bg-success",
  quote_sent: "bg-info",
  quote_accepted: "bg-info",
  awaiting_payment: "bg-warning",
  payment_confirmed: "bg-success",
  repair_in_progress: "bg-primary",
  repaired: "bg-info",
  submitted_for_qc_review: "bg-warning",
  qc_passed: "bg-success",
  ready_for_collection: "bg-info",
  delivered: "bg-success",
  closed: "bg-success",
  awaiting_reassignment: "bg-warning",
  awaiting_assignment: "bg-warning",
};

export const STATUS_PROGRESS: Record<TicketStatus, number> = {
  intake: 5,
  awaiting_diagnosis_payment: 15,
  diagnosing: 40,
  awaiting_repair_payment: 55,
  awaiting_parts_release: 62,
  ready_for_repair: 70,
  repairing: 75,
  quality_check: 90,
  ready_for_handover: 95,
  completed: 100,
  cancelled: 100,
  warranty_review: 20,
  warranty_void: 100,
  repeat_case_validation_pending: 10,
  warranty_validation_pending: 10,
  warranty_validated: 25,
  quote_sent: 50,
  quote_accepted: 55,
  awaiting_payment: 55,
  payment_confirmed: 60,
  repair_in_progress: 75,
  repaired: 85,
  submitted_for_qc_review: 88,
  qc_passed: 92,
  ready_for_collection: 95,
  delivered: 100,
  closed: 100,
  awaiting_reassignment: 8,
  awaiting_assignment: 8,
};

export const DEVICE_TYPE_LABELS: Record<string, string> = new Proxy(
  {
    phone: "Phone",
    laptop: "Laptop",
    tablet: "Tablet",
    wearable: "Wearable",
    gadget: "Gadget",
    other: "Other",
  },
  {
    get(target, property) {
      if (typeof property !== "string") {
        return Reflect.get(target, property);
      }

      return target[property] || getDeviceCategoryLabel(property);
    },
  }
);

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  pos: "POS",
  bank_transfer: "Bank Transfer",
};

const BACKEND_STATUS_MAP: Record<string, TicketStatus> = {
  registered: "intake",
  awaiting_diagnosis_fee: "awaiting_diagnosis_payment",
  diagnosing: "diagnosing",
  repeat_case_validation_pending: "repeat_case_validation_pending",
  warranty_validation_pending: "warranty_validation_pending",
  warranty_validated: "warranty_validated",
  quote_sent: "quote_sent",
  quote_accepted: "quote_accepted",
  awaiting_payment: "awaiting_payment",
  payment_confirmed: "payment_confirmed",
  repair_in_progress: "repair_in_progress",
  repaired: "repaired",
  submitted_for_qc_review: "submitted_for_qc_review",
  qc_passed: "qc_passed",
  ready_for_collection: "ready_for_collection",
  delivered: "delivered",
  closed: "closed",
  cancelled: "cancelled",
  awaiting_reassignment: "awaiting_reassignment",
  awaiting_assignment: "awaiting_assignment",
  awaiting_repair_payment: "awaiting_repair_payment",
  awaiting_parts_release: "awaiting_parts_release",
  ready_for_repair: "ready_for_repair",
  repairing: "repairing",
  quality_check: "quality_check",
  ready_for_handover: "ready_for_handover",
  completed: "completed",
  warranty_review: "warranty_review",
  warranty_void: "warranty_void",
};

export function mapBackendJobStatusToTicketStatus(status?: string | null): TicketStatus {
  const normalizedStatus = String(status ?? "").trim();
  return BACKEND_STATUS_MAP[normalizedStatus] ?? (normalizedStatus as TicketStatus) ?? "intake";
}

const BACKEND_MEDIA_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://backend.staging.cybersquadapp.com";

function resolveBackendMediaUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BACKEND_MEDIA_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Maps a raw backend API job object to the frontend Ticket model.
 * Handles all known backend statuses and normalises nested objects.
 */
export function mapBackendTicketToFrontend(backendJob: any): Ticket {
  // ── Status mapping ────────────────────────────────────────────────────────
  const mappedStatus = mapBackendJobStatusToTicketStatus(backendJob.status);

  // ── Customer — API returns nested object or flat fields ────────────────
  const customerObj = backendJob.customer ?? {};
  const customerName =
    customerObj.name || customerObj.full_name || backendJob.customer_name || "Unknown Customer";
  const customerPhone = customerObj.phone_number || backendJob.customer_phone || "";
  const customerEmail = customerObj.email || backendJob.customer_email || "";

  // ── Device images from media array ────────────────────────────────────
  const images: string[] = (backendJob.media ?? [])
    .filter((m: any) => ["image", "damage", "intake"].includes(String(m.kind ?? "").toLowerCase()) && (m.file_url || m.file))
    .map((m: any) => resolveBackendMediaUrl((m.file_url || m.file) as string));

  // ── Technician ────────────────────────────────────────────────────────
  const techObj = backendJob.technician ?? backendJob.assigned_technician ?? {};
  const techName =
    techObj.name || techObj.full_name || backendJob.technician_name || undefined;

  // ── Intake type ───────────────────────────────────────────────────────
  let intakeType: TicketIntakeType = "post_warranty";
  if (
    backendJob.is_repeat_case ||
    backendJob.job_relation_type === "repeat_case" ||
    backendJob.status === "repeat_case_validation_pending"
  ) {
    intakeType = "repeat_return";
  } else if (
    backendJob.is_warranty_claim ||
    [
      "warranty_validation_pending",
      "warranty_validated",
      "warranty_review",
      "warranty_void",
    ].includes(String(backendJob.status || "").trim())
  ) {
    intakeType = "warranty";
  } else if (
    backendJob.source_channel === "corporate" ||
    backendJob.workflow_type === "corporate_repair" ||
    backendJob.job_group_type === "parent" ||
    backendJob.job_group_type === "child"
  ) {
    intakeType = "corporate";
  } else if (backendJob.source_channel === "onsite") {
    intakeType = "onsite";
  }

  // ── Assessment / diagnosis ────────────────────────────────────────────
  const assessment = backendJob.assessment ?? backendJob.latest_assessment ?? {};
  const diagnosis =
    assessment.preliminary_diagnosis || assessment.diagnosis || backendJob.customer_feedback || "";
  let quotation = backendJob.service_quote_amount
    ? Number(backendJob.service_quote_amount)
    : assessment.estimated_cost
    ? Number(assessment.estimated_cost)
    : undefined;

  let partRequests: TicketPartRequest[] | undefined;
  let serviceSelections: ServiceOptionKey[] | undefined;
  if (assessment.parts_required && Array.isArray(assessment.parts_required)) {
    const detectedServices = assessment.parts_required
      .map((part: any) => String(part.part || "").trim())
      .filter((partName: string) => partName.startsWith(SERVICE_PART_PREFIX))
      .map((partName: string) => partName.slice(SERVICE_PART_PREFIX.length).trim())
      .map((label: string) =>
        SERVICE_OPTION_KEYS.find((key) => SERVICE_OPTION_LABELS[key].toLowerCase() === label.toLowerCase())
      )
      .filter((entry): entry is ServiceOptionKey => Boolean(entry));
    if (detectedServices.length > 0) {
      serviceSelections = detectedServices;
    }

    partRequests = assessment.parts_required
      .filter((part: any) => !String(part.part || "").trim().startsWith(SERVICE_PART_PREFIX))
      .map((part: any, index: number) => {
        return {
          partId: part.part_id ? String(part.part_id) : `backend-part-${index}`,
          partName: part.part || "Unknown Part",
          available: true,
        };
      });

    if (!quotation || quotation === 0) {
      quotation = assessment.parts_required.reduce((sum: number, part: any) => {
        const lineTotal = Number(part.estimated_cost || (Number(part.price || 0) * Number(part.qty || 1)));
        return sum + lineTotal;
      }, 0);
    }
  }

  const rawDeviceType = String(backendJob.device_type || "").trim();
  const normalizedDeviceType = normalizeDeviceCategoryName(rawDeviceType, "other");
  const parentJobValue = backendJob.parent_job ?? backendJob.parent_job_id;
  const organizationName =
    backendJob.company_name ||
    backendJob.organization_name ||
    backendJob.organisation_name ||
    (backendJob.source_channel === "corporate" && backendJob.job_group_type === "parent"
      ? backendJob.title
      : undefined);

  return {
    id: backendJob.id ? String(backendJob.id) : generateId(),
    jobId: backendJob.display_id || backendJob.external_id || generateJobId(),
    customer: {
      id: String(customerObj.id || backendJob.customer_id || ""),
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
    },
    device: {
      make: backendJob.brand || "Unknown",
      model: backendJob.model_name || "Device",
      imei: backendJob.serial_imei || "",
      images,
      type: normalizedDeviceType,
    },
    intakeType,
    organizationName,
    address: backendJob.address || undefined,
    city: backendJob.city || undefined,
    state: backendJob.state || undefined,
    country: backendJob.country || undefined,
    issueReported: backendJob.description || backendJob.title || "",
    diagnosis,
    status: mappedStatus,
    isWarranty: Boolean(backendJob.is_warranty_claim),
    isRepeatCase: Boolean(backendJob.is_repeat_case),
    parentJobId: parentJobValue ? String(parentJobValue) : undefined,
    diagnosisFee: DEFAULT_SETTINGS.diagnosisFee,
    diagnosisPaymentMode: "pos",
    repairPaymentMode: "pos",
    createdAt: backendJob.created_at || new Date().toISOString(),
    updatedAt: backendJob.updated_at || new Date().toISOString(),
    termsAccepted: true,
    assignedEngineer: techName,
    quotation,
    serviceSelections,
    partRequests,
    customerNote: backendJob.customer_note || backendJob.additional_notes || undefined,
    engineerUpdate: assessment.engineer_notes || undefined,
    qaNotes: backendJob.qc_notes || undefined,
    qaCheckedBy: backendJob.qc_checked_by || undefined,
    sourceChannel: backendJob.source_channel || undefined,
    jobGroupType: backendJob.job_group_type || undefined,
    jobRelationType: backendJob.job_relation_type || undefined,
    // Only the list serializers expose this; the /jobs/<id>/ detail payload
    // does not, so it stays undefined for tickets loaded from there.
    cancellationReason: backendJob.cancellation_reason || undefined,
  };
}
