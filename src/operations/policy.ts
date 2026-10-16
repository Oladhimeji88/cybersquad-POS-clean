import { appendAuditUnlocked, readFromStorage, withSaleLock, writeToStorage } from "@/pos/lib/store";

// Business rules the handoff marks as open or tunable. Kept as data so nothing is buried in workflow code.
export interface OpsPolicy {
  sourcingTargetMinutes: number;      // customer fulfilment ambition (~60 min), a target, not a promise
  supplierToStoreMinutes: number;     // supplier-to-store movement ambition (~40 min)
  marginPercent: number;              // applied to supplier cost to suggest a customer price
  offerValidHours: number;            // how long a customer offer stays valid
  repairAgedDays: number;             // a repair counts as aged after this many days without an update
  directPackaging: "undecided" | "required" | "not_required"; // open policy: supplier-direct packaging
  expenseApprovalLimit: number;       // spend above this needs an approver who is not the requester
  discountApprovalPercent: number;    // quote discounts above this percent need approval
  varianceApprovalValue: number;      // stock variances worth more than this need approval
  recoveryApprovalLimit: number;      // service-recovery gestures above this need approval
  lowStockThreshold: number;          // units at or below which a replenishment decision is suggested
  reservationHours: number;           // how long a stock reservation holds before it expires
  quoteValidDays: number;             // how long a sent quote stays valid
  supplierAckHours: number;           // a purchase order with no supplier acknowledgement after this long is flagged
  codAgedDays: number;                // delivered COD not remitted after this many days is an exception
  updateUrgentHours: number;          // customer-update standard by complaint severity
  updateHighHours: number;
  updateMediumHours: number;
  updateLowHours: number;
}

export const DEFAULT_POLICY: OpsPolicy = {
  sourcingTargetMinutes: 60, supplierToStoreMinutes: 40, marginPercent: 15, offerValidHours: 24,
  repairAgedDays: 3, directPackaging: "undecided", expenseApprovalLimit: 50000, discountApprovalPercent: 10, varianceApprovalValue: 20000,
  recoveryApprovalLimit: 20000, lowStockThreshold: 3, reservationHours: 24, quoteValidDays: 7, codAgedDays: 3, supplierAckHours: 4,
  updateUrgentHours: 2, updateHighHours: 8, updateMediumHours: 24, updateLowHours: 72,
};
const KEY = "ops_policy_v1";

export async function getPolicy(): Promise<OpsPolicy> {
  return { ...DEFAULT_POLICY, ...await readFromStorage<Partial<OpsPolicy>>(KEY) };
}

export function validatePolicy(policy: OpsPolicy) {
  const positive = [policy.sourcingTargetMinutes, policy.supplierToStoreMinutes, policy.offerValidHours, policy.repairAgedDays, policy.reservationHours,
    policy.quoteValidDays, policy.codAgedDays, policy.supplierAckHours, policy.updateUrgentHours, policy.updateHighHours, policy.updateMediumHours, policy.updateLowHours];
  const limits = [policy.expenseApprovalLimit, policy.varianceApprovalValue, policy.recoveryApprovalLimit, policy.lowStockThreshold, policy.discountApprovalPercent];
  if (limits.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Limits cannot be negative.");
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Targets and validity periods must be greater than zero.");
  if (!Number.isFinite(policy.marginPercent) || policy.marginPercent < 0 || policy.marginPercent > 500) throw new Error("Margin must be between 0 and 500 percent.");
  if (!["undecided", "required", "not_required"].includes(policy.directPackaging)) throw new Error("Choose a packaging rule.");
}

export function savePolicy(actor: string, next: OpsPolicy) {
  try { validatePolicy(next); } catch (error) { return Promise.reject(error); }
  return withSaleLock(async () => {
    const current = await getPolicy();
    const changes = (Object.keys(next) as (keyof OpsPolicy)[]).filter((key) => current[key] !== next[key])
      .map((key) => key + ": " + current[key] + " -> " + next[key]);
    if (!changes.length) return current;
    await writeToStorage(KEY, next);
    await appendAuditUnlocked(actor, "policy_changed", changes.join("; "));
    return next;
  });
}
