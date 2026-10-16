import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Exercise actual POS storage logic with an asynchronous in-memory IndexedDB boundary.
const bundled = await build({
  entryPoints: ["src/pos/lib/store.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "pos-storage-test",
    setup(builder) {
      builder.onResolve({ filter: new RegExp("^@/frontdesk/lib/(db|store)$") }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
        contents: args.path.endsWith("/db")
          ? 'const records = new Map(); export async function dbGet(key) { await Promise.resolve(); return structuredClone(records.get(key)); } export async function dbSet(key, value) { if (globalThis.posTestStorageFailure) throw new Error("storage unavailable"); await Promise.resolve(); records.set(key, structuredClone(value)); }'
          : 'let id = 0; export const generateId = () => String(++id); export const PAYMENT_MODE_LABELS = { cash: "Cash" };',
        loader: "js",
      }));
    },
  }],
});
const store = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const policy = { type: "Shop", provider: "Shop", durationMonths: 12, startsOn: "sale", terms: "Original policy" };
const line = { productId: "sample", name: "Sample phone", quantity: 1, unitPrice: 100,
  tracking: "serial", isDemo: true, warranty: policy,
  devices: [{ id: "unit", productId: "sample", serialNumber: "DEMO-001", status: "available" }] };
const customer = { name: "Test Customer", phone: "08000000000" };
const saleInput = { cashierName: "Test", channel: "in_store", lines: [line], customer,
  subtotal: 100, total: 100, payments: [{ mode: "cash", amount: 100 }], paymentMode: "cash" };

test("held device reservations, concurrent checkout, snapshots and demo accounting", async () => {
  const shift = await store.startShift("Test", 20);
  const held = await store.holdSale({ label: "Customer order", lines: [line], subtotal: 100, customer });
  await assert.rejects(store.createSale(saleInput), /already sold or held/);
  await assert.rejects(store.holdSale({ label: "Duplicate", lines: [line], subtotal: 100 }), /already sold or held/);
  const resumed = await store.resumeHeldSale(held.id);
  assert.deepEqual(resumed.customer, customer);
  assert.equal(resumed.lines[0].devices[0].serialNumber, "DEMO-001");
  const results = await Promise.allSettled([store.createSale(saleInput), store.createSale(saleInput)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const sale = results.find((result) => result.status === "fulfilled").value;
  assert.equal(sale.lines[0].devices[0].coverage.terms, "Original policy");
  assert.equal(sale.isDemo, true);
  assert.equal((await store.getSalesSummary("all")).totalRevenue, 0);
  assert.equal((await store.getUnsyncedSales()).length, 0);
  assert.equal((await store.endShift(shift.id, 20)).expectedCash, 20);
});
test("failed persistence cannot produce a successful sale", async () => {
  globalThis.posTestStorageFailure = true;
  try {
    await assert.rejects(store.createSale({ ...saleInput, lines: [{ productId: "cable", name: "Cable", quantity: 1, unitPrice: 100 }] }), /Could not save/);
  } finally {
    globalThis.posTestStorageFailure = false;
  }
  assert.equal((await store.getSales()).length, 1);
});
test("order discount reduces the total and refunds are prorated and audited", async () => {
  const cable = { productId: "cable", name: "Cable", quantity: 2, unitPrice: 100 };
  const discounted = { cashierName: "Test", channel: "in_store", lines: [cable], subtotal: 200, total: 180,
    discount: { amount: 20, reason: "Loyal customer", approvedBy: "Admin" }, payments: [{ mode: "bank_transfer", amount: 180 }], paymentMode: "bank_transfer" };
  await assert.rejects(store.createSale({ ...discounted, total: 200 }), /does not match/);
  await assert.rejects(store.createSale({ ...discounted, discount: { amount: 20, reason: "", approvedBy: "Admin" } }), /discount/i);
  const sale = await store.createSale(discounted);
  assert.equal(sale.total, 180);
  assert.equal(store.refundLineValue(sale, 0, 1), 90);
  const refund = await store.createRefund({ saleId: sale.id, lines: [{ lineIndex: 0, quantity: 2, deviceIds: [] }], reason: "Faulty",
    condition: "faulty", mode: "bank_transfer", actor: "Admin", cashPaid: false });
  assert.equal(refund.total, 180);
  const log = await store.getAuditLog();
  assert.deepEqual(log.map((entry) => entry.action).slice(-2), ["discount_applied", "refund_recorded"]);
});
test("large refunds by non-admins wait for approval before any repayment", async () => {
  const laptop = { productId: "laptop", name: "Laptop", quantity: 1, unitPrice: 120000 };
  const sale = await store.createSale({ cashierName: "Test", channel: "in_store", lines: [laptop], subtotal: 120000, total: 120000,
    payments: [{ mode: "bank_transfer", amount: 120000 }], paymentMode: "bank_transfer" });
  const request = { saleId: sale.id, lines: [{ lineIndex: 0, quantity: 1, deviceIds: [] }], reason: "Changed mind", condition: "resellable",
    mode: "bank_transfer", actor: "Cashier", actorRole: "sales", cashPaid: false };
  const refund = await store.createRefund(request);
  assert.equal(refund.status, "pending");
  assert.equal(refund.approval.status, "required");
  await assert.rejects(store.updateRefund(refund.id, "paid", "REF-1"), /approval/);
  await assert.rejects(store.decideRefund(refund.id, "approved", "Cashier", "sales", ""), /admin/);
  await store.decideRefund(refund.id, "approved", "Boss", "admin", "OK");
  await store.updateRefund(refund.id, "paid", "REF-1");
  const saved = (await store.getRefunds()).find((entry) => entry.id === refund.id);
  assert.equal(saved.status, "paid");
  assert.equal(saved.approval.by, "Boss");
});
