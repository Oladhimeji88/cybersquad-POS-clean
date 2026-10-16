// Local stub persistence for POS sales. No backend sales/Odoo POS endpoints
// exist yet, so sales are recorded locally (same IndexedDB/localStorage
// approach the repairs module uses for Invoice — see src/frontdesk/lib/store.ts)
// until real backend-synced endpoints are available. Because this is
// per-browser storage, sales are only visible on the device they were made on.
import { dbGet, dbSet } from "@/frontdesk/lib/db";
import { generateId, PAYMENT_MODE_LABELS } from "@/frontdesk/lib/store";
import type { PosCartLine } from "./cart";
import { snapshotDeviceLines, validateDeviceLines, type SaleCustomer } from "./devices";

export type SaleChannel = "in_store" | "website";
export type SalePaymentMode = "cash" | "pos" | "bank_transfer";

// Cash on delivery is deliberately NOT a SalePaymentMode: it is not money
// received at the till, so it never enters `payments`, shift cash totals or
// refund-available maths (all of which sum `payments`). It is a POS-only
// concept — the repair desk shares SalePaymentMode/PAYMENT_MODE_LABELS from
// frontdesk/lib/store and must not grow a COD option.
export type CodStatus = "pending" | "delivered" | "collected" | "settled" | "cancelled";
export const COD_COURIER = "Speedef";
export interface SaleCod {
  courier: string;
  address: string;
  // Courier's charge, deducted from what it remits to us.
  fee: number;
  status: CodStatus;
  history: { status: CodStatus; at: string; by: string }[];
  settlementId?: string;
  settledAt?: string;
}

// One entry per payment method used on a sale. A single-method sale has
// exactly one entry; a split sale (e.g. part cash, part POS) has 2+, whose
// `amount`s add up to the sale total.
export interface SalePayment {
  recordedAt?: string;
  shiftId?: string;
  mode: SalePaymentMode;
  amount: number;
  cashTendered?: number;
  changeDue?: number;
}

export interface Sale {
  note?: string;
  lifecycle?: "reserved" | "completed" | "cancelled";
  orderCreatedAt?: string;
  collectionDueAt?: string;
  collectedBy?: string;
  collectionVerified?: boolean;
  id: string;
  saleNumber: string;
  cashierName: string;
  branch?: string;
  customer?: SaleCustomer;
  isDemo?: boolean;
  channel: SaleChannel;
  lines: PosCartLine[];
  subtotal: number;
  // Order-level discount already taken off `subtotal` to reach `total`.
  discount?: { amount: number; reason: string; approvedBy: string };
  total: number;
  payments: SalePayment[];
  // Mirrors payments[0] — kept so records saved before split payments
  // existed, and code that only cares about the primary method, keep working.
  paymentMode: SalePaymentMode | "cod";
  // Present on cash-on-delivery sales. Such a sale is a completed sale (it
  // counts as revenue when it happens) whose payment is still pending, so
  // `payments` is empty until/unless money is actually received.
  cod?: SaleCod;
  cashTendered?: number;
  changeDue?: number;
  createdAt: string;
  // Outbox flag for the eventual backend sales endpoint (see the module
  // comment above). Every sale is created unsynced; once a real endpoint
  // exists, a sync routine can find exactly the records it hasn't posted yet
  // via getUnsyncedSales() and flip them with markSalesSynced() on success —
  // so nothing recorded today has to be re-entered or gets silently skipped
  // when that wiring lands. Until then this is inert: nothing reads it.
  synced?: boolean;
}

export interface HeldSale {
  note?: string;
  customer?: SaleCustomer;
  id: string;
  label: string;
  lines: PosCartLine[];
  subtotal: number;
  heldAt: string;
}

export interface CashShift {
  id: string;
  cashierName: string;
  openingFloat: number;
  openedAt: string;
  closingFloat?: number;
  closedAt?: string;
  cashSalesTotal?: number;
  cashRefundsTotal?: number;
  expectedCash?: number;
  variance?: number;
}

const SALES_KEY = "pos_sales";
const HELD_SALES_KEY = "pos_held_sales";
const SHIFTS_KEY = "pos_shifts";

export async function readFromStorage<T>(key: string): Promise<T | null> {
  try {
    const value = await dbGet<T>(key);
    if (value != null) return value;
  } catch {
    // Fall back to localStorage if IndexedDB is unavailable.
  }

  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeToStorage<T>(key: string, value: T): Promise<void> {
  let persisted = false;
  try {
    await dbSet(key, value);
    persisted = true;
  } catch {
    // Continue with localStorage fallback if IndexedDB is unavailable.
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      persisted = true;
    } catch {
      // IndexedDB may still have saved the transaction.
    }
  }
  if (!persisted) throw new Error("Could not save this transaction. Check browser storage and try again.");
}

function generateSaleNumber(existingSales: Sale[]): string {
  const dayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sequence =
    existingSales.filter((sale) => sale.saleNumber.startsWith(`SALE-${dayStamp}-`)).length + 1;
  return `SALE-${dayStamp}-${String(sequence).padStart(3, "0")}`;
}

export async function getSales(): Promise<Sale[]> {
  const raw = await readFromStorage<Sale[]>(SALES_KEY);
  return Array.isArray(raw) ? raw : [];
}

let localWriteQueue: Promise<unknown> = Promise.resolve();
export function withSaleLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("cybersquad-pos-sale-write", operation);
  }
  const result = localWriteQueue.then(operation, operation);
  localWriteQueue = result.catch(() => undefined);
  return result;
}

export function createSale(input: Omit<Sale, "id" | "saleNumber" | "createdAt">): Promise<Sale> {
  return withSaleLock(() => createSaleUnlocked(input));
}

async function createSaleUnlocked(
  input: Omit<Sale, "id" | "saleNumber" | "createdAt">
): Promise<Sale> {
  const sales = await getSales();
  const held = await getHeldSales();
  validateCheckout(input);
  validateDeviceLines(input.lines, new Set([...sales.filter((sale) => sale.lifecycle !== "cancelled"), ...held].flatMap((record) =>
    record.lines.flatMap((line) => (line.devices ?? []).map((unit) => unit.id)))));
  if (input.lines.some((line) => line.tracking === "serial") &&
      (!input.customer?.name.trim() || !input.customer?.phone.trim())) {
    throw new Error("Add the customer's name and phone for this device sale.");
  }
  const createdAt = new Date().toISOString();
  const sale: Sale = {
    ...input,
    id: generateId(),
    saleNumber: generateSaleNumber(sales),
    createdAt,
    lines: input.lifecycle === "reserved" ? structuredClone(input.lines) : snapshotDeviceLines(input.lines, createdAt),
    lifecycle: input.lifecycle ?? "completed",
    orderCreatedAt: input.lifecycle === "reserved" ? createdAt : undefined,
    payments: await stampPayments(input.payments, createdAt),
    ...(input.cod ? { cod: { ...input.cod, courier: COD_COURIER, status: "pending" as CodStatus,
      history: [{ status: "pending" as CodStatus, at: createdAt, by: input.cashierName }] } } : {}),
    isDemo: input.lines.some((line) => line.isDemo),
    synced: false,
  };

  sales.push(sale);
  await writeToStorage(SALES_KEY, sales);
  if (sale.discount && sale.discount.amount > 0) {
    await appendAudit(sale.discount.approvedBy, "discount_applied", sale.saleNumber + " · " + sale.discount.amount.toFixed(2) + " · " + sale.discount.reason);
  }
  return sale;
}

// Sales recorded before a real backend endpoint exists are treated as
// unsynced by default (`synced` may be absent on older records — `!== true`
// covers both). Once such an endpoint exists, a sync routine posts exactly
// these, then calls markSalesSynced() with the ids that succeeded.
export async function getUnsyncedSales(): Promise<Sale[]> {
  const sales = await getSales();
  return sales.filter((sale) => !sale.isDemo && sale.synced !== true);
}

export async function markSalesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const sales = await getSales();
  const updated = sales.map((sale) => (idSet.has(sale.id) ? { ...sale, synced: true } : sale));
  await writeToStorage(SALES_KEY, updated);
}

// Sales recorded before split payments existed only carry the legacy
// paymentMode/cashTendered/changeDue fields — synthesize a single-entry
// payments array for those so callers can treat every sale uniformly.
export function getSalePayments(sale: Sale): SalePayment[] {
  if (Array.isArray(sale.payments)) return sale.payments;
  return [
    {
      mode: sale.paymentMode as SalePaymentMode,
      amount: sale.total,
      cashTendered: sale.cashTendered,
      changeDue: sale.changeDue,
    },
  ];
}

export function getSaleCashAmount(sale: Sale): number {
  return getSalePayments(sale)
    .filter((payment) => payment.mode === "cash")
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getSalePaymentLabel(sale: Sale): string {
  if (sale.cod) return "Cash on Delivery";
  const payments = getSalePayments(sale);
  return payments.map((payment) => PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode).join(" + ");
}

// ===== Held sales (park a cart, resume it later) =====

export async function getHeldSales(): Promise<HeldSale[]> {
  const raw = await readFromStorage<HeldSale[]>(HELD_SALES_KEY);
  return Array.isArray(raw) ? raw : [];
}

export function holdSale(input: Omit<HeldSale, "id" | "heldAt">): Promise<HeldSale> {
  return withSaleLock(() => holdSaleUnlocked(input));
}

async function holdSaleUnlocked(input: {
  customer?: SaleCustomer;
  note?: string;
  label: string;
  lines: PosCartLine[];
  subtotal: number;
}): Promise<HeldSale> {
  const held = await getHeldSales();
  const sales = await getSales();
  validateDeviceLines(input.lines, new Set([...sales.filter((sale) => sale.lifecycle !== "cancelled"), ...held].flatMap((record) =>
    record.lines.flatMap((line) => (line.devices ?? []).map((unit) => unit.id)))));
  const sale: HeldSale = {
    ...input,
    id: generateId(),
    heldAt: new Date().toISOString(),
  };
  held.push(sale);
  await writeToStorage(HELD_SALES_KEY, held);
  return sale;
}

export function resumeHeldSale(id: string): Promise<HeldSale | null> {
  return withSaleLock(() => resumeHeldSaleUnlocked(id));
}
async function resumeHeldSaleUnlocked(id: string): Promise<HeldSale | null> {
  const held = await getHeldSales();
  const sale = held.find((s) => s.id === id) ?? null;
  if (sale) {
    await writeToStorage(
      HELD_SALES_KEY,
      held.filter((s) => s.id !== id)
    );
  }
  return sale;
}

export function discardHeldSale(id: string): Promise<void> {
  return withSaleLock(() => discardHeldSaleUnlocked(id));
}
async function discardHeldSaleUnlocked(id: string): Promise<void> {
  const held = await getHeldSales();
  await writeToStorage(
    HELD_SALES_KEY,
    held.filter((s) => s.id !== id)
  );
}

// ===== Cash shifts (opening/closing float reconciliation) =====

export async function getShifts(): Promise<CashShift[]> {
  const raw = await readFromStorage<CashShift[]>(SHIFTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

// A register is single-till per device: only one open (unclosed) shift at a time.
export async function getActiveShift(): Promise<CashShift | null> {
  const shifts = await getShifts();
  return shifts.find((shift) => !shift.closedAt) ?? null;
}

export async function startShift(cashierName: string, openingFloat: number): Promise<CashShift> {
  const shifts = await getShifts();
  const shift: CashShift = {
    id: generateId(),
    cashierName,
    openingFloat,
    openedAt: new Date().toISOString(),
  };
  shifts.push(shift);
  await writeToStorage(SHIFTS_KEY, shifts);
  return shift;
}

export async function endShift(shiftId: string, closingFloat: number): Promise<CashShift> {
  const shifts = await getShifts();
  const index = shifts.findIndex((shift) => shift.id === shiftId);
  if (index === -1) throw new Error("Shift not found.");

  const shift = shifts[index];
  const sales = await getSales();
  const closedAt = new Date().toISOString();
  const cashSalesTotal = sales.filter((sale) => !sale.isDemo).reduce((sum, sale) => sum +
    getSalePayments(sale).filter((payment) => payment.mode === "cash" &&
      (payment.shiftId ? payment.shiftId === shift.id :
        (payment.recordedAt ?? sale.createdAt) >= shift.openedAt && (payment.recordedAt ?? sale.createdAt) <= closedAt))
      .reduce((value, payment) => value + payment.amount, 0), 0);
  const cashRefundsTotal = (await getRefunds()).filter((refund) => !refund.isDemo && refund.status === "paid" &&
    refund.mode === "cash" && refund.shiftId === shift.id).reduce((sum, refund) => sum + refund.total, 0);
  const expectedCash = shift.openingFloat + cashSalesTotal - cashRefundsTotal;

  const updatedShift: CashShift = {
    ...shift,
    closingFloat,
    closedAt,
    cashSalesTotal,
    cashRefundsTotal,
    expectedCash,
    variance: closingFloat - expectedCash,
  };

  shifts[index] = updatedShift;
  await writeToStorage(SHIFTS_KEY, shifts);
  return updatedShift;
}

// "today" is a calendar-day cutoff (matches POS/cashier framing); the rest
// mirror the range values already used by /jobs/admin/dashboard/stats/?range=
// so repair and sales revenue can be combined for the same period.
export type SalesSummaryRange = "today" | "1d" | "3d" | "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<SalesSummaryRange, "today" | "all">, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// Exported so the Sales Records page (src/components/SalesRecords.jsx) can
// filter by the same broad range set as the dashboard, instead of keeping a
// second, narrower copy of this logic.
export function isWithinRange(createdAt: string, range: SalesSummaryRange) {
  if (range === "all") return true;

  const created = new Date(createdAt).getTime();
  if (range === "today") {
    return created >= new Date().setHours(0, 0, 0, 0);
  }

  const days = RANGE_DAYS[range];
  return created >= Date.now() - days * 24 * 60 * 60 * 1000;
}

// Read-only summary for the admin dashboard (src/components/DashboardOverview.jsx).
// getSales() itself (below) backs the full-record src/components/SalesRecords.jsx
// page. These are the only exports the admin side should import from this
// module — the cart/checkout write path stays POS-only.
export async function getSalesSummary(range: SalesSummaryRange = "today") {
  const sales = await getSales();
  const inRange = sales.filter((sale) => !sale.isDemo && (!sale.lifecycle || sale.lifecycle === "completed") && isWithinRange(sale.createdAt, range));

  const totalSalesCount = inRange.length;
  const grossRevenue = inRange.reduce((sum, sale) => sum + sale.total, 0);
  const refundTotal = (await getRefunds()).filter((refund) => !refund.isDemo && refund.status === "paid" &&
    isWithinRange(refund.paidAt ?? refund.createdAt, range)).reduce((sum, refund) => sum + refund.total, 0);
  const totalRevenue = grossRevenue - refundTotal;

  const itemTotals = new Map<string, { name: string; qty: number; revenue: number }>();
  inRange.forEach((sale) => {
    sale.lines.forEach((line) => {
      const existing = itemTotals.get(line.productId);
      const revenue = line.unitPrice * line.quantity;
      if (existing) {
        existing.qty += line.quantity;
        existing.revenue += revenue;
      } else {
        itemTotals.set(line.productId, { name: line.name, qty: line.quantity, revenue });
      }
    });
  });

  const topSellingItems = [...itemTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // "website" channel has no data source yet — always 0 until an online
  // storefront exists; surfaced explicitly rather than fabricated.
  const channelBreakdown = {
    in_store: inRange.filter((sale) => sale.channel === "in_store").length,
    website: inRange.filter((sale) => sale.channel === "website").length,
  };

  return { totalSalesCount, totalRevenue, grossRevenue, refundTotal, topSellingItems, channelBreakdown };
}

// Local workflow records. Backend integration must enforce the same rules atomically.
const money = (amount: number) => Math.round(amount * 100) / 100;
function validateCheckout(input: Omit<Sale, "id" | "saleNumber" | "createdAt">) {
  if (!input.lines.length) throw new Error("Add items before checkout.");
  const itemsTotal = money(input.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const discount = money(input.discount?.amount ?? 0);
  if (discount < 0 || discount > itemsTotal || (discount > 0 && (!input.discount?.reason.trim() || !input.discount?.approvedBy.trim()))) {
    throw new Error("Enter a valid discount amount and reason.");
  }
  const total = money(itemsTotal - discount);
  if (input.lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0) ||
      money(input.total) !== total || money(input.subtotal) !== itemsTotal) throw new Error("Sale total does not match its items.");
  if (input.lines.some((line) => Boolean(line.isDemo) !== Boolean(input.lines[0].isDemo))) throw new Error("Keep sample and real products in separate sales.");
  if (input.payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0)) throw new Error("Enter positive payment amounts.");
  const paid = money(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
  if (input.lifecycle === "reserved") {
    if (!input.customer?.name.trim() || !input.customer?.phone.trim() || !input.collectionDueAt ||
        !Number.isFinite(Date.parse(input.collectionDueAt))) throw new Error("Customer and expected collection date are required.");
    if (paid > total) throw new Error("Deposit cannot exceed the order total.");
  } else if (input.cod) {
    if (paid !== 0) throw new Error("A cash-on-delivery sale is paid by the courier, not at the till.");
    if (!input.customer?.name.trim() || !input.customer?.phone.trim() || !input.cod.address?.trim()) {
      throw new Error("Customer name, phone and delivery address are required for cash on delivery.");
    }
    if (!Number.isFinite(input.cod.fee) || input.cod.fee < 0 || input.cod.fee > total) throw new Error("Enter a valid courier fee.");
  } else if (paid !== total) throw new Error("Payments must equal the sale total.");
}
async function stampPayments(payments: SalePayment[], recordedAt: string) {
  const shift = await getActiveShift();
  return payments.map((payment) => ({ ...payment, recordedAt, shiftId: shift?.id }));
}
export function orderBalance(sale: Sale) {
  return money(sale.total - getSalePayments(sale).reduce((sum, payment) => sum + payment.amount, 0));
}
export function addOrderPayment(saleId: string, amount: number, mode: SalePaymentMode): Promise<Sale> {
  return withSaleLock(async () => {
    const sales = await getSales(); const sale = sales.find((entry) => entry.id === saleId);
    if (!sale || sale.lifecycle !== "reserved") throw new Error("This order is not awaiting collection.");
    if (!(await getActiveShift())) throw new Error("Start a shift before recording payment.");
    if (!Number.isFinite(amount) || amount <= 0 || money(amount) > orderBalance(sale)) throw new Error("Payment exceeds the remaining balance.");
    sale.payments.push(...await stampPayments([{ mode, amount: money(amount) }], new Date().toISOString()));
    await writeToStorage(SALES_KEY, sales); return sale;
  });
}
export function collectOrder(saleId: string, actor: string, verified: boolean): Promise<Sale> {
  return withSaleLock(async () => {
    const sales = await getSales(); const sale = sales.find((entry) => entry.id === saleId);
    if (!sale || sale.lifecycle !== "reserved" || orderBalance(sale) !== 0 || !verified) {
      throw new Error("Verify the customer and device, and settle the full balance before collection.");
    }
    const now = new Date().toISOString();
    sale.lines = snapshotDeviceLines(sale.lines, now); sale.lifecycle = "completed";
    sale.createdAt = now; sale.collectedBy = actor; sale.collectionVerified = true;
    await writeToStorage(SALES_KEY, sales); return sale;
  });
}
export function cancelUnpaidOrder(saleId: string): Promise<void> {
  return withSaleLock(async () => {
    const sales = await getSales(); const sale = sales.find((entry) => entry.id === saleId);
    if (!sale || sale.lifecycle !== "reserved") throw new Error("Order is not open.");
    const refunded = (await getRefunds()).filter((refund) => refund.saleId === saleId && refund.status === "paid")
      .reduce((sum, refund) => sum + refund.total, 0);
    const paid = getSalePayments(sale).reduce((sum, payment) => sum + payment.amount, 0);
    if (money(paid - refunded) !== 0) throw new Error("Repay the deposit before cancelling this order.");
    sale.lifecycle = "cancelled"; await writeToStorage(SALES_KEY, sales);
  });
}
// Courier-side lifecycle of a COD sale. "settled" is reached only through
// recordSettlementPayment (src/finance/lib/settlements.ts) once the courier's
// remittance has been received in full — never set directly here.
const COD_TRANSITIONS: Record<CodStatus, CodStatus[]> = {
  pending: ["delivered", "collected", "cancelled"],
  delivered: ["collected", "cancelled"],
  collected: [],
  settled: [],
  cancelled: [],
};
export function updateCodStatus(saleId: string, status: "delivered" | "collected" | "cancelled", actor: string): Promise<Sale> {
  return withSaleLock(async () => {
    const sales = await getSales(); const sale = sales.find((entry) => entry.id === saleId);
    if (!sale?.cod) throw new Error("This is not a cash-on-delivery sale.");
    if (!COD_TRANSITIONS[sale.cod.status].includes(status)) throw new Error("A " + sale.cod.status + " COD order cannot be marked " + status + ".");
    sale.cod.status = status; sale.cod.history.push({ status, at: new Date().toISOString(), by: actor });
    // A cancelled COD sale is no longer revenue and frees its serialised units.
    if (status === "cancelled") sale.lifecycle = "cancelled";
    sale.synced = false;
    await appendAudit(actor, "cod_" + status, sale.saleNumber);
    await writeToStorage(SALES_KEY, sales); return sale;
  });
}
// Used by the settlement module, inside withSaleLock.
export async function mutateSalesUnlocked(mutator: (sales: Sale[]) => void): Promise<void> {
  const sales = await getSales(); mutator(sales); await writeToStorage(SALES_KEY, sales);
}
export { appendAudit as appendAuditUnlocked };
export interface AuditEntry { id: string; at: string; actor: string; action: string; detail: string; }
export async function getAuditLog(): Promise<AuditEntry[]> { return (await readFromStorage<AuditEntry[]>("pos_audit_log")) ?? []; }
// Call from inside withSaleLock so writes to the log are serialised with the change they describe.
async function appendAudit(actor: string, action: string, detail: string) {
  const log = await getAuditLog();
  log.push({ id: generateId(), at: new Date().toISOString(), actor, action, detail });
  await writeToStorage("pos_audit_log", log);
}
export function logAudit(actor: string, action: string, detail: string) {
  return withSaleLock(() => appendAudit(actor, action, detail));
}
// Order-level discounts are shared across lines, so a returned line is worth its share of what was actually paid.
export function refundLineValue(sale: Sale, lineIndex: number, quantity: number) {
  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
  return money(sale.lines[lineIndex].unitPrice * quantity * ratio);
}
export interface RefundLine { lineIndex: number; quantity: number; deviceIds: string[]; }
export interface Refund {
  id: string; saleId: string; saleNumber: string; lines: RefundLine[]; total: number;
  reason: string; condition: "resellable" | "faulty" | "not_returned";
  mode: SalePaymentMode; status: "pending" | "paid" | "cancelled"; actor: string;
  createdAt: string; paidAt?: string; shiftId?: string; reference?: string; isDemo?: boolean;
  kind: "return" | "deposit"; cancellationReason?: string;
  // Present only when the refund was above REFUND_APPROVAL_LIMIT and raised by a non-admin.
  approval?: { status: "required" | "approved" | "rejected"; by?: string; at?: string; note?: string };
}
export const REFUND_APPROVAL_LIMIT = 50000;
export async function getRefunds(): Promise<Refund[]> { return (await readFromStorage<Refund[]>("pos_refunds")) ?? []; }
export function refundableQuantity(sale: Sale, index: number, refunds: Refund[]) {
  return sale.lines[index].quantity - refunds.filter((refund) => refund.saleId === sale.id && refund.status !== "cancelled")
    .flatMap((refund) => refund.lines).filter((line) => line.lineIndex === index)
    .reduce((sum, line) => sum + line.quantity, 0);
}
export function createRefund(input: {
  saleId: string; lines: RefundLine[]; reason: string; condition: Refund["condition"];
  mode: SalePaymentMode; actor: string; actorRole?: string; cashPaid: boolean; depositAmount?: number;
}): Promise<Refund> {
  return withSaleLock(async () => {
    const sale = (await getSales()).find((entry) => entry.id === input.saleId);
    if (!sale || sale.lifecycle === "cancelled" || !input.reason.trim() || !input.actor.trim()) throw new Error("Choose a sale and enter the refund reason.");
    const refunds = await getRefunds(); let total = 0; const seen = new Set<number>();
    const kind = sale.lifecycle === "reserved" ? "deposit" : "return";
    if (kind === "deposit") {
      total = money(input.depositAmount ?? 0);
      if (input.lines.length) throw new Error("Deposit refunds must not return stock.");
    } else {
      if (!input.lines.length) throw new Error("Select items to return.");
      for (const line of input.lines) {
        const original = sale.lines[line.lineIndex];
        if (!original || seen.has(line.lineIndex) || !Number.isInteger(line.quantity) || line.quantity <= 0 ||
            line.quantity > refundableQuantity(sale, line.lineIndex, refunds)) throw new Error("Invalid or already refunded quantity.");
        seen.add(line.lineIndex);
        if (original.tracking === "serial") {
          const used = new Set(refunds.filter((refund) => refund.saleId === sale.id && refund.status !== "cancelled").flatMap((refund) => refund.lines.flatMap((entry) => entry.deviceIds)));
          if (line.deviceIds.length !== line.quantity || new Set(line.deviceIds).size !== line.quantity ||
              line.deviceIds.some((id) => used.has(id) || !original.devices?.some((unit) => unit.id === id))) throw new Error("Select the exact devices from the original sale.");
        }
        total += refundLineValue(sale, line.lineIndex, line.quantity);
      }
    }
    total = money(total);
    const alreadyAllocated = refunds.filter((refund) => refund.saleId === sale.id && refund.status !== "cancelled").reduce((sum, refund) => sum + refund.total, 0);
    const paid = getSalePayments(sale).reduce((sum, payment) => sum + payment.amount, 0);
    // Prorating a discount across lines can leave a rounding gap of a few kobo on the last return.
    const remaining = money(paid - alreadyAllocated);
    if (total > remaining && total - remaining <= 0.05) total = remaining;
    if (!Number.isFinite(total) || total <= 0 || money(total + alreadyAllocated) > money(paid)) throw new Error("Refund exceeds the amount paid.");
    const needsApproval = input.actorRole !== "admin" && total > REFUND_APPROVAL_LIMIT;
    const shift = await getActiveShift();
    const paidNow = input.mode === "cash" && !needsApproval;
    if (paidNow && (!shift || !input.cashPaid)) throw new Error("Open a shift and confirm cash was handed to the customer.");
    const now = new Date().toISOString();
    const refund: Refund = { id: generateId(), saleId: sale.id, saleNumber: sale.saleNumber, lines: input.lines,
      total, reason: input.reason.trim(), condition: input.condition, mode: input.mode, actor: input.actor,
      status: paidNow ? "paid" : "pending", createdAt: now,
      paidAt: paidNow ? now : undefined, shiftId: paidNow ? shift?.id : undefined,
      isDemo: sale.isDemo, kind, ...(needsApproval ? { approval: { status: "required" as const } } : {}) };
    await writeToStorage("pos_refunds", [...refunds, refund]);
    await appendAudit(input.actor, "refund_recorded", sale.saleNumber + " · " + refund.kind + " · " + total.toFixed(2) + " · " + (needsApproval ? "awaiting approval" : refund.status) + " · " + refund.reason);
    return refund;
  });
}
export function updateRefund(id: string, action: "paid" | "cancelled", reference: string): Promise<void> {
  return withSaleLock(async () => {
    const refunds = await getRefunds(); const refund = refunds.find((entry) => entry.id === id);
    if (!refund || refund.status !== "pending" || !reference.trim()) throw new Error("Enter the repayment reference or cancellation reason.");
    if (action === "paid" && refund.approval?.status === "required") throw new Error("This refund needs admin approval before repayment.");
    if (action === "paid" && refund.mode === "cash") {
      const shift = await getActiveShift();
      if (!shift) throw new Error("Open a shift before handing over cash.");
      refund.shiftId = shift.id;
    }
    refund.status = action;
    if (action === "paid") { refund.reference = reference.trim(); refund.paidAt = new Date().toISOString(); }
    else refund.cancellationReason = reference.trim();
    await writeToStorage("pos_refunds", refunds);
    await appendAudit(refund.actor, "refund_" + action, refund.saleNumber + " · " + refund.total.toFixed(2) + " · " + reference.trim());
  });
}

export function decideRefund(id: string, decision: "approved" | "rejected", actor: string, actorRole: string | undefined, note: string): Promise<void> {
  return withSaleLock(async () => {
    if (actorRole !== "admin") throw new Error("Only an admin can approve or reject this refund.");
    const refunds = await getRefunds(); const refund = refunds.find((entry) => entry.id === id);
    if (!refund || refund.status !== "pending" || refund.approval?.status !== "required") throw new Error("This refund is not awaiting approval.");
    if (decision === "rejected" && !note.trim()) throw new Error("Enter the reason for rejecting this refund.");
    const at = new Date().toISOString();
    refund.approval = { status: decision, by: actor, at, note: note.trim() };
    if (decision === "rejected") { refund.status = "cancelled"; refund.cancellationReason = "Rejected: " + note.trim(); }
    await writeToStorage("pos_refunds", refunds);
    await appendAudit(actor, "refund_" + decision, refund.saleNumber + " · " + refund.total.toFixed(2) + (note.trim() ? " · " + note.trim() : ""));
  });
}
