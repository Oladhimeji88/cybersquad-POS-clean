import { getSales, getRefunds, readFromStorage, writeToStorage, withSaleLock, type Sale } from "@/pos/lib/store";
import { activateWarranty, deviceIdentifiers, type SaleCustomer, type WarrantySnapshot } from "@/pos/lib/devices";
import { getTickets, type Ticket } from "@/frontdesk/lib/store";

export interface DirectoryCustomer extends SaleCustomer { id: string; email?: string; }
export interface EnquiryContact { at: string; by: string; channel: "call" | "whatsapp" | "sms" | "email" | "visit"; note: string; }
export interface Enquiry {
  id: string; customer: DirectoryCustomer; request: string; owner: string; followUpAt: string;
  contacts?: EnquiryContact[];
  status: "open" | "converted" | "lost"; outcome?: string; saleId?: string; createdAt: string; updatedAt: string;
}
export interface WarrantyRecord {
  id: string; source: "sale" | "repair"; sourceId: string; reference: string; product: string;
  serial: string; identifiers: string[]; customer: SaleCustomer; coverage: WarrantySnapshot; returned?: boolean;
  isDemo?: boolean; make?: string; model?: string;
}
export interface RepairCoverage extends WarrantyRecord { recordedBy: string; }
export interface BlockerContext { owner: string; nextAction: string; dueAt?: string; updatedAt: string; }
interface BusinessState {
  customers: DirectoryCustomer[]; enquiries: Enquiry[]; repairCoverage: RepairCoverage[];
  warrantyLinks: Record<string, WarrantyRecord>; blockers: Record<string, BlockerContext>;
}
const empty = (): BusinessState => ({ customers: [], enquiries: [], repairCoverage: [], warrantyLinks: {}, blockers: {} });
export async function getBusiness(): Promise<BusinessState> {
  return { ...empty(), ...await readFromStorage<BusinessState>("business_operations_v1") };
}
async function change<T>(mutate: (state: BusinessState) => T): Promise<T> {
  return withSaleLock(async () => { const state = await getBusiness(); const result = mutate(state);
    await writeToStorage("business_operations_v1", state); return result; });
}
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("0") ? "234" + digits.slice(1) : digits;
}
function customerKeys(customer?: Partial<SaleCustomer>) {
  if (!customer) return [];
  const phone = customer.phone ? normalizePhone(customer.phone) : "";
  const email = customer.email?.trim().toLowerCase() ?? "";
  return [phone, email, customer.id ?? ""].filter(Boolean);
}
export function sameCustomer(a?: SaleCustomer, b?: SaleCustomer) {
  const aKeys = new Set(customerKeys(a));
  return customerKeys(b).some((key) => aKeys.has(key));
}
export async function getCustomerDirectory(): Promise<DirectoryCustomer[]> {
  const [state, sales, tickets] = await Promise.all([getBusiness(), getSales(), getTickets()]);
  const byKey = new Map<string, DirectoryCustomer>();
  for (const customer of [...tickets.map((ticket) => ticket.customer),
    ...sales.filter((sale) => !sale.isDemo).flatMap((sale) => sale.customer ? [sale.customer] : []), ...state.customers]) {
    const keys = customerKeys(customer);
    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    const primaryKey = keys[0];
    if (!primaryKey) continue;
    const merged = { ...existing, ...customer, id: existing?.id ?? customer.id ?? "contact-" + primaryKey } as DirectoryCustomer;
    keys.forEach((key) => byKey.set(key, merged));
  }
  return [...new Map([...byKey.values()].map((customer) => [customer.id, customer])).values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveCustomer(input: SaleCustomer): Promise<DirectoryCustomer> {
  const name = input.name.trim(); const phone = normalizePhone(input.phone); const email = input.email?.trim().toLowerCase() ?? "";
  if (!name || phone.length < 10 || phone.length > 15 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Enter a name, valid phone number, and valid email if provided.");
  }
  return change((state) => {
    const duplicate = state.customers.find((entry) => normalizePhone(entry.phone) === phone);
    const customer = { id: duplicate?.id ?? input.id ?? crypto.randomUUID(), name, phone: input.phone.trim(), email };
    if (duplicate) {
      if (duplicate.name.toLowerCase() !== name.toLowerCase()) throw new Error("This phone already belongs to " + duplicate.name + ". Select the existing customer.");
      return duplicate;
    }
    state.customers.push(customer); return customer;
  });
}
export function saveEnquiry(input: Omit<Enquiry, "id" | "createdAt" | "updatedAt" | "status">) {
  if (!input.request.trim() || !input.owner.trim() || !Number.isFinite(Date.parse(input.followUpAt))) return Promise.reject(new Error("Enter a request, owner and follow-up date."));
  return change((state) => {
    const now = new Date().toISOString();
    const enquiry: Enquiry = { ...input, id: crypto.randomUUID(), status: "open", createdAt: now, updatedAt: now };
    state.enquiries.push(enquiry); return enquiry;
  });
}
export async function closeEnquiry(id: string, status: "converted" | "lost", outcome: string, saleId?: string) {
  if (!outcome.trim()) throw new Error("Enter the outcome or lost reason.");
  if (status === "converted") {
    const [sales, state] = await Promise.all([getSales(), getBusiness()]);
    const sale = sales.find((entry) => entry.id === saleId && !entry.isDemo && (!entry.lifecycle || entry.lifecycle === "completed"));
    const enquiry = state.enquiries.find((entry) => entry.id === id);
    if (!sale || !sameCustomer(sale.customer, enquiry?.customer)) throw new Error("Select a completed sale for this customer.");
  }
  return change((state) => {
    const enquiry = state.enquiries.find((entry) => entry.id === id);
    if (!enquiry || enquiry.status !== "open") throw new Error("Enquiry is already closed.");
    Object.assign(enquiry, { status, outcome, saleId, updatedAt: new Date().toISOString() });
  });
}
export function logEnquiryContact(id: string, by: string, channel: EnquiryContact["channel"], note: string) {
  if (!by.trim() || !note.trim()) return Promise.reject(new Error("Enter who made the contact and what was said."));
  return change((state) => {
    const enquiry = state.enquiries.find((entry) => entry.id === id);
    if (!enquiry || enquiry.status !== "open") throw new Error("Enquiry is not open.");
    const at = new Date().toISOString();
    enquiry.contacts = [...(enquiry.contacts ?? []), { at, by: by.trim(), channel, note: note.trim() }];
    enquiry.updatedAt = at;
  });
}
export function rescheduleEnquiry(id: string, followUpAt: string, owner: string) {
  if (!Number.isFinite(Date.parse(followUpAt)) || !owner.trim()) return Promise.reject(new Error("Enter a follow-up date and owner."));
  return change((state) => {
    const enquiry = state.enquiries.find((entry) => entry.id === id);
    if (!enquiry || enquiry.status !== "open") throw new Error("Enquiry is not open.");
    Object.assign(enquiry, { followUpAt, owner, updatedAt: new Date().toISOString() });
  });
}
export async function getWarrantyRecords(): Promise<WarrantyRecord[]> {
  const [sales, refunds, state] = await Promise.all([getSales(), getRefunds(), getBusiness()]);
  const records: WarrantyRecord[] = [...state.repairCoverage];
  for (const sale of sales.filter((sale) => !sale.lifecycle || sale.lifecycle === "completed")) {
    sale.lines.forEach((line) => line.devices?.forEach((unit) => {
      if (!unit.coverage) return;
      records.push({ id: "sale:" + sale.id + ":" + unit.id, source: "sale", sourceId: sale.id,
        reference: sale.saleNumber, product: line.name, serial: unit.serialNumber,
        identifiers: deviceIdentifiers(unit), customer: sale.customer ?? { name: "Walk-in", phone: "" },
        coverage: unit.coverage, isDemo: sale.isDemo,
        returned: refunds.some((refund) => refund.saleId === sale.id && refund.status !== "cancelled" &&
          refund.lines.some((entry) => entry.deviceIds.includes(unit.id))) });
    }));
  }
  return records;
}
export function warrantyStatus(record: WarrantyRecord, now = Date.now()) {
  if (record.returned) return "Returned";
  if (!record.coverage.durationMonths) return "No warranty";
  if (now < Date.parse(record.coverage.startsAt)) return "Not started";
  return now < Date.parse(record.coverage.expiresAt) ? "Within period · assess fault" : "Expired";
}
export function linkWarranty(ticketId: string, record: WarrantyRecord) {
  return change((state) => { state.warrantyLinks[ticketId] = structuredClone(record); });
}
export function recordRepairCoverage(ticket: Ticket, months: number, terms: string, actor: string, completedAt: string) {
  if (!["completed", "delivered", "closed"].includes(ticket.status) || !Number.isInteger(months) || months < 1 ||
      months > 60 || !terms.trim() || !actor.trim() || !Number.isFinite(Date.parse(completedAt)) ||
      Date.parse(completedAt) > Date.now()) return Promise.reject(new Error("A completed repair, its completion date, duration and covered scope are required."));
  return change((state) => {
    if (state.repairCoverage.some((record) => record.sourceId === ticket.id)) throw new Error("Warranty has already been recorded for this repair.");
    const record: RepairCoverage = { id: "repair:" + ticket.id, source: "repair", sourceId: ticket.id,
      reference: ticket.jobId, product: ticket.device.make + " " + ticket.device.model, serial: ticket.device.imei,
      identifiers: [ticket.device.imei], customer: ticket.customer, make: ticket.device.make, model: ticket.device.model,
      recordedBy: actor, coverage: activateWarranty({ type: "Repair warranty", provider: "Cybervilla", durationMonths: months,
        startsOn: "sale", terms }, completedAt)! };
    state.repairCoverage.push(record); return record;
  });
}
export function saveBlocker(id: string, owner: string, nextAction: string, dueAt: string) {
  if (!owner.trim() || !nextAction.trim() || (dueAt && !Number.isFinite(Date.parse(dueAt)))) return Promise.reject(new Error("Enter an owner, next action and valid due date."));
  return change((state) => { state.blockers[id] = { owner, nextAction, dueAt, updatedAt: new Date().toISOString() }; });
}
export const REPAIR_STAGES: Record<string, string[]> = {
  "Awaiting diagnosis": ["intake", "diagnosing", "awaiting_assignment", "awaiting_diagnosis_payment"],
  "Awaiting approval": ["quote_sent", "awaiting_repair_payment", "warranty_review", "warranty_validation_pending", "repeat_case_validation_pending"],
  "Awaiting payment": ["awaiting_payment", "quote_accepted"],
  "Awaiting parts": ["awaiting_parts_release", "ready_for_repair"],
  "Repair in progress": ["repairing", "repair_in_progress"],
  "QC pending": ["quality_check", "repaired", "submitted_for_qc_review"],
  "Ready for collection": ["ready_for_handover", "qc_passed", "ready_for_collection"],
};
export function repairStage(ticket: Ticket) {
  return Object.entries(REPAIR_STAGES).find(([, statuses]) => statuses.includes(ticket.status))?.[0] ?? ticket.status.replaceAll("_", " ");
}
export function periodBounds(period: string, now = new Date()): [number, number] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (period === "today") return [today.getTime(), now.getTime()];
  if (period === "week" || period === "previous_week") {
    const start = new Date(today); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = period === "previous_week" ? start.getTime() - 1 : now.getTime();
    if (period === "previous_week") start.setDate(start.getDate() - 7);
    return [start.getTime(), end];
  }
  const start = new Date(today); start.setDate(start.getDate() - Number(period) + 1);
  return [start.getTime(), now.getTime()];
}
