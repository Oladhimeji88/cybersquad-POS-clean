// Finance data that lives in Odoo (accounting source of truth). Same approach
// as websiteSales.js: these endpoints do not exist yet, so every reader fails
// soft (null) and the UI says "not available yet" instead of inventing numbers.
// Writers return { ok, ... } so the caller can record a failed sync against the
// record and surface it.
//
// Contract for the Django/Odoo backend (all under /api/v1):
//   GET  /finance/overview/?range=today|1d|3d|7d|30d|90d|all
//        -> { success, result: { receivable, payable, cash_balance, payments_received, pending_payouts, revenue } }
//   GET  /finance/receivables/?range=&q=
//        -> { success, result: [{ id, customer, reference, amount, balance, issue_date, due_date, status }] }
//        status: outstanding | partially_paid | paid | overdue (derived from Odoo account.move payment_state + due date)
//   GET  /finance/payables/?range=&q=   (vendor bills, same shape with `vendor`)
//   POST /finance/cod-settlements/      body: Settlement (below). IDEMPOTENT on `external_ref`:
//        re-posting an existing external_ref must return the existing Odoo record, never create a second invoice.
//        -> { success, result: { odoo_ref } }
//   POST /finance/cod-settlements/{external_ref}/payments/   body: { external_ref, reference, amount, paid_on, notes }
//        Idempotent on the payment's external_ref; reconciles against the settlement's invoice.
//        -> { success, result: { odoo_ref, reconciled: boolean } }
//   GET  /odoo/sync-queue/ and POST /odoo/sync-queue/{id}/retry/  (already in the work plan)

// ---- Prototype mode -------------------------------------------------------
// The Odoo finance endpoints are not deployed. While prototype mode is on
// (default; toggle from the banner on any finance screen), a read that gets no
// answer from the backend falls back to demo Odoo data, and a write is
// simulated as a successful, idempotent Odoo post. A real backend response
// always wins, so turning on the real endpoints needs no code change.
const PROTO_KEY = "finance_prototype_mode";
export function prototypeEnabled() {
  try { return localStorage.getItem(PROTO_KEY) !== "off"; } catch { return true; }
}
export function setPrototypeEnabled(on) {
  try { localStorage.setItem(PROTO_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
}
// The prototype "Odoo" is a small stateful ledger in localStorage (invoices,
// bills, payments), seeded once with demo records. Posting a settlement
// creates an invoice in it (once per external_ref), and payments reduce
// balances, so every screen stays consistent with every action.
const LEDGER_KEY = "finance_prototype_ledger";
const OUTAGE_KEY = "finance_prototype_outage";
const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();
export const prototypeOutage = () => { try { return localStorage.getItem(OUTAGE_KEY) === "on"; } catch { return false; } };
export function setPrototypeOutage(on) { try { localStorage.setItem(OUTAGE_KEY, on ? "on" : "off"); } catch { /* storage blocked */ } }

function seedLedger() {
  return {
    receivables: [
      { id: "r1", customer: "ABC Ltd", reference: "INV-00125", amount: 450000, paid: 0, issue_date: daysFromNow(-20), due_date: daysFromNow(-5) },
      { id: "r2", customer: "XYZ Ltd", reference: "INV-00126", amount: 200000, paid: 0, issue_date: daysFromNow(-12), due_date: daysFromNow(18) },
      { id: "r3", customer: "TechHub", reference: "INV-00127", amount: 150000, paid: 150000, issue_date: daysFromNow(-9), due_date: daysFromNow(10) },
      { id: "r4", customer: "Northwind Stores", reference: "INV-00128", amount: 320000, paid: 200000, issue_date: daysFromNow(-6), due_date: daysFromNow(24) },
    ],
    payables: [
      { id: "p1", vendor: "Vendor A", reference: "BILL-00120", amount: 250000, paid: 0, issue_date: daysFromNow(-14), due_date: daysFromNow(-1) },
      { id: "p2", vendor: "Vendor B", reference: "BILL-00121", amount: 150000, paid: 0, issue_date: daysFromNow(-10), due_date: daysFromNow(4) },
      { id: "p3", vendor: "Vendor C", reference: "BILL-00122", amount: 50000, paid: 50000, issue_date: daysFromNow(-8), due_date: daysFromNow(20) },
      { id: "p4", vendor: "Vendor D", reference: "BILL-00123", amount: 180000, paid: 90000, issue_date: daysFromNow(-5), due_date: daysFromNow(12) },
    ],
    payments: [],
    cashBalance: 6200000,
  };
}
function readLedger() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEDGER_KEY) || "null");
    if (raw?.receivables) return raw;
  } catch { /* fall through to a fresh seed */ }
  const fresh = seedLedger(); writeLedger(fresh); return fresh;
}
function writeLedger(ledger) { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); } catch { /* storage blocked */ } }
export function resetPrototypeLedger() { try { localStorage.removeItem(LEDGER_KEY); } catch { /* storage blocked */ } }

const statusOf = (row) => {
  const balance = row.amount - row.paid;
  if (balance <= 0) return "paid";
  if (new Date(row.due_date).getTime() < Date.now()) return "overdue";
  return row.paid > 0 ? "partially_paid" : "outstanding";
};
const publish = (rows) => rows.map((row) => ({ ...row, balance: Math.max(0, row.amount - row.paid), status: statusOf(row) }));
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

function demoOverview() {
  const ledger = readLedger();
  const open = (rows) => rows.reduce((total, row) => total + Math.max(0, row.amount - row.paid), 0);
  return { receivable: open(ledger.receivables), payable: open(ledger.payables), cash_balance: ledger.cashBalance,
    payments_received: sum(ledger.receivables, "paid") };
}
const proto = (data) => (prototypeEnabled() ? data() : null);

const unwrap = (res) => (res?.data?.success ? res.data.result : null);
const failMessage = (error) =>
  error?.response?.data?.message || error?.response?.data?.detail || error?.message || "Odoo sync failed.";

async function read(api, url, params, demo) {
  try {
    const result = unwrap(await api.get(url, { params, showLoader: false }));
    if (result) return result;
  } catch {
    /* endpoint not deployed / unreachable */
  }
  return proto(demo);
}

export const fetchFinanceOverview = (api, range = "30d") => read(api, "/finance/overview/", { range }, demoOverview);
export const fetchReceivables = (api, params = {}) => read(api, "/finance/receivables/", params, () => publish(readLedger().receivables));
export const fetchPayables = (api, params = {}) => read(api, "/finance/payables/", params, () => publish(readLedger().payables));

async function write(api, url, body, simulate) {
  try {
    const result = unwrap(await api.post(url, body, { showLoader: false }));
    if (result) return { ok: true, odooRef: result.odoo_ref, reconciled: result.reconciled };
    if (!prototypeEnabled()) return { ok: false, error: "Odoo did not confirm the record." };
  } catch (error) {
    if (!prototypeEnabled()) return { ok: false, error: failMessage(error) };
  }
  if (prototypeOutage()) return { ok: false, error: "Odoo is unreachable (simulated outage)." };
  return simulate();
}

// Simulated Odoo, idempotent on external_ref: a repeat returns the same record.
function simulateSettlement(body) {
  const ledger = readLedger();
  let invoice = ledger.receivables.find((row) => row.external_ref === body.external_ref);
  if (!invoice) {
    invoice = { id: "s-" + body.external_ref, external_ref: body.external_ref, customer: body.courier, reference: body.external_ref,
      amount: body.net, paid: 0, issue_date: new Date().toISOString(), due_date: body.due_on };
    ledger.receivables.push(invoice); writeLedger(ledger);
  }
  return { ok: true, odooRef: "PROTO/" + body.external_ref };
}
function simulateSettlementPayment(settlementRef, body) {
  const ledger = readLedger();
  const invoice = ledger.receivables.find((row) => row.external_ref === settlementRef);
  if (!invoice) return { ok: false, error: "Settlement invoice not found in Odoo." };
  if (!ledger.payments.some((p) => p.external_ref === body.external_ref)) {
    ledger.payments.push({ external_ref: body.external_ref, kind: "settlement", amount: body.amount });
    invoice.paid = Math.min(invoice.amount, invoice.paid + body.amount);
    ledger.cashBalance += body.amount; writeLedger(ledger);
  }
  return { ok: true, odooRef: "PROTO/" + body.external_ref, reconciled: true };
}

export const syncSettlementToOdoo = (api, settlement) => {
  const body = {
    external_ref: settlement.reference,
    courier: settlement.courier,
    period_from: settlement.periodFrom,
    period_to: settlement.periodTo,
    gross: settlement.gross,
    fees: settlement.fees,
    net: settlement.net,
    due_on: settlement.dueOn,
    orders: settlement.lines.map((line) => ({ sale_ref: line.saleNumber, amount: line.amount, fee: line.fee })),
  };
  return write(api, "/finance/cod-settlements/", body, () => simulateSettlement(body));
};

export const syncSettlementPaymentToOdoo = (api, settlement, payment) => {
  const body = {
    external_ref: `${settlement.reference}:${payment.reference}`,
    reference: payment.reference,
    amount: payment.amount,
    paid_on: payment.paidOn,
    notes: payment.notes ?? "",
  };
  return write(api, `/finance/cod-settlements/${encodeURIComponent(settlement.reference)}/payments/`, body,
    () => simulateSettlementPayment(settlement.reference, body));
};

// Payment against an Odoo-side invoice (receivable) or vendor bill (payable) — US6 for non-settlement items.
export function recordLedgerPayment(api, kind, row, { reference, amount, paidOn, notes }) {
  const collection = kind === "payable" ? "payables" : "receivables";
  const id = String(row.id).replace(/^odoo:/, "");
  const body = { external_ref: `${row.reference}:${reference}`, reference, amount, paid_on: paidOn, notes: notes ?? "" };
  return write(api, `/finance/${collection}/${encodeURIComponent(id)}/payments/`, body, () => {
    const ledger = readLedger();
    const item = ledger[collection].find((entry) => entry.id === id);
    if (!item) return { ok: false, error: "Record not found in Odoo." };
    if (ledger.payments.some((p) => p.external_ref === body.external_ref)) return { ok: false, error: "A payment with this reference already exists." };
    if (amount <= 0 || amount > item.amount - item.paid) return { ok: false, error: "Payment exceeds the outstanding balance." };
    item.paid += amount;
    ledger.payments.push({ external_ref: body.external_ref, kind, amount });
    ledger.cashBalance += kind === "payable" ? -amount : amount; writeLedger(ledger);
    return { ok: true, odooRef: "PROTO/" + body.external_ref, reconciled: true };
  });
}

// Operational events (a received purchase order, an accepted corporate quote, a logistics bill) create their own
// ledger rows so Finance never re-enters them. Idempotent on `reference`: re-posting updates the amount, never duplicates.
// Prototype ledger only; with the real Odoo endpoints on, these become POSTs to the same contract.
function postLedgerRow(collection, party, { reference, amount, dueInDays = 14 }) {
  if (!prototypeEnabled() || !reference || !(amount > 0)) return { ok: false };
  const ledger = readLedger(); const existing = ledger[collection].find((row) => row.reference === reference);
  if (existing) {
    if (amount < existing.paid) return { ok: false, error: "Amount is below what is already paid." };
    existing.amount = amount;
  } else {
    ledger[collection].push({ id: collection[0] + "-" + reference, [party.key]: party.name, reference, amount, paid: 0, issue_date: daysFromNow(0), due_date: daysFromNow(dueInDays) });
  }
  writeLedger(ledger);
  return { ok: true, created: !existing };
}
export const postPayable = (vendor, row) => postLedgerRow("payables", { key: "vendor", name: vendor }, row);
export const postReceivable = (customer, row) => postLedgerRow("receivables", { key: "customer", name: customer }, row);
