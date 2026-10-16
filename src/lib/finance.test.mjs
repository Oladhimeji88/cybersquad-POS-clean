import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const bundled = await build({ entryPoints: ["src/lib/finance.js"], bundle: true, write: false, format: "esm", platform: "node" });
const f = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const offline = { get: async () => { throw new Error("404"); }, post: async () => { throw new Error("404"); } };
const settlement = { reference: "SET-SPD-202610-001", courier: "Speedef", periodFrom: "2026-10-01", periodTo: "2026-10-31", gross: 1000, fees: 100, net: 900,
  dueOn: new Date(Date.now() + 864e5).toISOString(), lines: [] };

test("prototype Odoo serves demo data and falls back only when the backend has nothing", async () => {
  const rows = await f.fetchReceivables(offline);
  assert.equal(rows.find((r) => r.reference === "INV-00125").status, "overdue");
  f.setPrototypeEnabled(false);
  assert.equal(await f.fetchReceivables(offline), null);
  f.setPrototypeEnabled(true);
});

test("settlement sync is idempotent and payments reconcile and move balances", async () => {
  const first = await f.syncSettlementToOdoo(offline, settlement);
  const again = await f.syncSettlementToOdoo(offline, settlement);
  assert.deepEqual(first, again);
  const invoices = (await f.fetchReceivables(offline)).filter((r) => r.reference === settlement.reference);
  assert.equal(invoices.length, 1);
  const pay = await f.syncSettlementPaymentToOdoo(offline, settlement, { reference: "P1", amount: 400, paidOn: "2026-10-05" });
  assert.equal(pay.reconciled, true);
  await f.syncSettlementPaymentToOdoo(offline, settlement, { reference: "P1", amount: 400, paidOn: "2026-10-05" }); // retry: no double count
  const after = (await f.fetchReceivables(offline)).find((r) => r.reference === settlement.reference);
  assert.equal(after.balance, 500); assert.equal(after.status, "partially_paid");
});

test("a simulated outage fails the sync with a message, then recovers", async () => {
  f.setPrototypeOutage(true);
  const down = await f.syncSettlementToOdoo(offline, { ...settlement, reference: "SET-X" });
  assert.equal(down.ok, false); assert.match(down.error, /outage/);
  f.setPrototypeOutage(false);
  assert.equal((await f.syncSettlementToOdoo(offline, { ...settlement, reference: "SET-X" })).ok, true);
});

test("paying invoices and bills validates amounts, rejects duplicate references, and moves cash", async () => {
  const bill = (await f.fetchPayables(offline)).find((r) => r.reference === "BILL-00121");
  assert.equal((await f.recordLedgerPayment(offline, "payable", bill, { reference: "B1", amount: 999999, paidOn: "x" })).ok, false);
  assert.equal((await f.recordLedgerPayment(offline, "payable", bill, { reference: "B1", amount: bill.balance, paidOn: "x" })).ok, true);
  assert.equal((await f.recordLedgerPayment(offline, "payable", bill, { reference: "B1", amount: 1, paidOn: "x" })).ok, false);
  assert.equal((await f.fetchPayables(offline)).find((r) => r.reference === "BILL-00121").status, "paid");
  const overview = await f.fetchFinanceOverview(offline);
  assert.equal(overview.payable, (await f.fetchPayables(offline)).reduce((s, r) => s + r.balance, 0));
});
