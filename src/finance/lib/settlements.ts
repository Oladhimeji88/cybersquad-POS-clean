// Speedef COD settlements. A settlement bundles delivered/collected COD sales
// for a billing period into ONE receivable (gross - courier fees = net). It is
// not a new sale: the sales were already recorded as revenue when they
// happened, and the courier's later remittance is a payment against this
// receivable.
//
// Persistence is local (same IndexedDB approach as src/pos/lib/store.ts) until
// the backend exists; each record carries an `odoo` sync block so the future
// sync routine — and the UI today — can see what has and hasn't reached Odoo.
// Every write goes through withSaleLock so settlements and the COD sales they
// stamp change together, and a sale can never land in two settlements.
import { generateId } from "@/frontdesk/lib/store";
import {
  appendAuditUnlocked, COD_COURIER, getSales, mutateSalesUnlocked, readFromStorage, withSaleLock, writeToStorage,
  type Sale,
} from "@/pos/lib/store";

const SETTLEMENTS_KEY = "finance_settlements";
export const SETTLEMENT_TERMS_DAYS = 30;
const money = (amount: number) => Math.round(amount * 100) / 100;

export type OdooSyncState = "not_synced" | "synced" | "failed";
export interface OdooSync { state: OdooSyncState; odooRef?: string; reconciled?: boolean; error?: string; attemptedAt?: string; }
export type ReceivableStatus = "outstanding" | "partially_paid" | "paid" | "overdue";

export interface SettlementLine {
  saleId: string; saleNumber: string; customer: string; amount: number; fee: number;
  codStatus: string; date: string;
}
export interface SettlementPayment {
  id: string; reference: string; amount: number; paidOn: string; notes?: string; recordedBy: string;
  recordedAt: string; odoo: OdooSync;
}
export interface Settlement {
  id: string; reference: string; courier: string;
  periodFrom: string; periodTo: string; periodLabel: string;
  lines: SettlementLine[]; gross: number; fees: number; net: number;
  payments: SettlementPayment[];
  issuedOn: string; dueOn: string; createdBy: string; createdAt: string;
  odoo: OdooSync;
}

export async function getSettlements(): Promise<Settlement[]> {
  const raw = await readFromStorage<Settlement[]>(SETTLEMENTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

export const settlementPaid = (settlement: Settlement) =>
  money(settlement.payments.reduce((sum, payment) => sum + payment.amount, 0));
export const settlementBalance = (settlement: Settlement) => money(settlement.net - settlementPaid(settlement));
export function settlementStatus(settlement: Settlement, now = Date.now()): ReceivableStatus {
  const balance = settlementBalance(settlement);
  if (balance <= 0) return "paid";
  if (new Date(settlement.dueOn).getTime() < now) return "overdue";
  return settlementPaid(settlement) > 0 ? "partially_paid" : "outstanding";
}

// COD sales a settlement may still pick up: courier has delivered/collected,
// the sale is real (not a sample), and it is not already in a settlement.
export function isBillableCod(sale: Sale) {
  return !!sale.cod && !sale.isDemo && sale.lifecycle !== "cancelled" && !sale.cod.settlementId &&
    sale.cod.courier === COD_COURIER && (sale.cod.status === "delivered" || sale.cod.status === "collected");
}
function codDate(sale: Sale) {
  return [...sale.cod!.history].reverse().find((entry) => entry.status === "delivered" || entry.status === "collected")?.at ?? sale.createdAt;
}
export async function getBillableCodSales(from: string, to: string): Promise<Sale[]> {
  const start = new Date(from + "T00:00:00").getTime(), end = new Date(to + "T23:59:59.999").getTime();
  return (await getSales()).filter(isBillableCod).filter((sale) => {
    const at = new Date(codDate(sale)).getTime(); return at >= start && at <= end;
  });
}

function nextReference(existing: Settlement[], month: string) {
  const prefix = "SET-SPD-" + month.replace("-", "") + "-";
  return prefix + String(existing.filter((item) => item.reference.startsWith(prefix)).length + 1).padStart(3, "0");
}

export function createSettlement(input: { from: string; to: string; saleIds: string[]; actor: string }): Promise<Settlement> {
  return withSaleLock(async () => {
    const [sales, existing] = [await getSales(), await getSettlements()];
    if (!input.saleIds.length) throw new Error("Select at least one COD transaction.");
    const chosen = input.saleIds.map((id) => sales.find((sale) => sale.id === id));
    // Re-check under the lock: another tab/user may have settled these meanwhile.
    if (chosen.some((sale) => !sale || !isBillableCod(sale))) throw new Error("Some transactions are no longer eligible. Refresh and review again.");
    const lines: SettlementLine[] = (chosen as Sale[]).map((sale) => ({
      saleId: sale.id, saleNumber: sale.saleNumber, customer: sale.customer?.name ?? "Customer",
      amount: sale.total, fee: sale.cod!.fee, codStatus: sale.cod!.status, date: codDate(sale),
    }));
    const gross = money(lines.reduce((sum, line) => sum + line.amount, 0));
    const fees = money(lines.reduce((sum, line) => sum + line.fee, 0));
    const now = new Date();
    const month = input.to.slice(0, 7);
    const settlement: Settlement = {
      id: generateId(), reference: nextReference(existing, month), courier: COD_COURIER,
      periodFrom: input.from, periodTo: input.to,
      periodLabel: new Date(input.to + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase(),
      lines, gross, fees, net: money(gross - fees), payments: [],
      issuedOn: now.toISOString(), dueOn: new Date(now.getTime() + SETTLEMENT_TERMS_DAYS * 86400000).toISOString(),
      createdBy: input.actor, createdAt: now.toISOString(), odoo: { state: "not_synced" },
    };
    await mutateSalesUnlocked((all) => all.forEach((sale) => {
      if (input.saleIds.includes(sale.id)) { sale.cod!.settlementId = settlement.id; sale.synced = false; }
    }));
    await writeToStorage(SETTLEMENTS_KEY, [...existing, settlement]);
    await appendAuditUnlocked(input.actor, "settlement_created", settlement.reference + " · " + lines.length + " orders · net " + settlement.net.toFixed(2));
    return settlement;
  });
}

function mutateSettlement(id: string, mutator: (settlement: Settlement, all: Settlement[]) => Promise<void> | void) {
  return withSaleLock(async () => {
    const all = await getSettlements(); const settlement = all.find((item) => item.id === id);
    if (!settlement) throw new Error("Settlement not found.");
    await mutator(settlement, all); await writeToStorage(SETTLEMENTS_KEY, all); return settlement;
  });
}

// Records the courier's remittance. Moves the settlement through
// outstanding -> partially paid -> paid, and once fully paid marks every
// included COD sale "settled". Reference must be unique per settlement so a
// double-submit can't create a duplicate accounting entry.
export function recordSettlementPayment(id: string, input: { reference: string; amount: number; paidOn: string; notes?: string; actor: string }) {
  return mutateSettlement(id, async (settlement) => {
    const reference = input.reference.trim(), amount = money(input.amount);
    if (!reference) throw new Error("Enter a payment reference.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a payment amount.");
    if (amount > settlementBalance(settlement)) throw new Error("Payment exceeds the outstanding balance.");
    if (settlement.payments.some((payment) => payment.reference.toLowerCase() === reference.toLowerCase())) {
      throw new Error("A payment with this reference is already recorded.");
    }
    settlement.payments.push({ id: generateId(), reference, amount, paidOn: input.paidOn, notes: input.notes?.trim() || undefined,
      recordedBy: input.actor, recordedAt: new Date().toISOString(), odoo: { state: "not_synced" } });
    await appendAuditUnlocked(input.actor, "settlement_payment", settlement.reference + " · " + reference + " · " + amount.toFixed(2));
    if (settlementBalance(settlement) <= 0) {
      const settledAt = new Date().toISOString(); const ids = new Set(settlement.lines.map((line) => line.saleId));
      await mutateSalesUnlocked((sales) => sales.forEach((sale) => {
        if (ids.has(sale.id) && sale.cod && sale.cod.status !== "settled") {
          sale.cod.status = "settled"; sale.cod.settledAt = settledAt;
          sale.cod.history.push({ status: "settled", at: settledAt, by: input.actor }); sale.synced = false;
        }
      }));
    }
  });
}

export function setSettlementOdooState(id: string, odoo: OdooSync) {
  return mutateSettlement(id, (settlement) => { settlement.odoo = odoo; });
}
export function setPaymentOdooState(id: string, paymentId: string, odoo: OdooSync) {
  return mutateSettlement(id, (settlement) => {
    const payment = settlement.payments.find((item) => item.id === paymentId);
    if (payment) payment.odoo = odoo;
  });
}
