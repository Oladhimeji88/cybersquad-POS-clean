// Pushes a settlement, then its payments, to Odoo. Safe to call repeatedly
// (that is how "Retry" works): anything already marked synced is skipped, and
// the backend is idempotent on external_ref, so a retry after a timeout whose
// first attempt actually landed cannot create a second accounting entry.
// Payments are only sent after their settlement exists in Odoo.
import { logAudit } from "@/pos/lib/store";
import {
  getSettlements, setPaymentOdooState, setSettlementOdooState,
} from "./settlements";
import { syncSettlementPaymentToOdoo, syncSettlementToOdoo } from "../../lib/finance";

const nowIso = () => new Date().toISOString();
const failed = (error) => ({ state: "failed", error, attemptedAt: nowIso() });

export async function syncSettlementChain(api, settlementId, actor = "System") {
  let settlement = (await getSettlements()).find((item) => item.id === settlementId);
  if (!settlement) return { ok: false, error: "Settlement not found." };
  let firstError = null;

  if (settlement.odoo.state !== "synced") {
    const result = await syncSettlementToOdoo(api, settlement);
    settlement = await setSettlementOdooState(settlementId, result.ok
      ? { state: "synced", odooRef: result.odooRef, attemptedAt: nowIso() }
      : failed(result.error));
    if (!result.ok) {
      firstError = result.error;
      await logAudit(actor, "odoo_sync_failed", settlement.reference + " · " + result.error);
    }
  }
  if (settlement.odoo.state !== "synced") return { ok: false, error: firstError ?? settlement.odoo.error };

  for (const payment of settlement.payments.filter((item) => item.odoo.state !== "synced")) {
    const result = await syncSettlementPaymentToOdoo(api, settlement, payment);
    await setPaymentOdooState(settlementId, payment.id, result.ok
      ? { state: "synced", odooRef: result.odooRef, reconciled: result.reconciled, attemptedAt: nowIso() }
      : failed(result.error));
    if (!result.ok) {
      firstError ??= result.error;
      await logAudit(actor, "odoo_sync_failed", settlement.reference + " · payment " + payment.reference + " · " + result.error);
    }
  }
  return firstError ? { ok: false, error: firstError } : { ok: true };
}
