import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Runs the real sourcing / returns / policy / work-queue logic against an in-memory storage boundary.
const bundled = await build({
  stdin: {
    contents: 'export * from "./src/operations/sourcing"; export * as returns from "./src/operations/returns"; export * from "./src/operations/policy"; export * from "./src/operations/workItems"; export * as pos from "./src/pos/lib/store";',
    resolveDir: process.cwd(), loader: "ts",
  },
  alias: { "@": "./src" }, bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "ops-storage-test",
    setup(builder) {
      builder.onResolve({ filter: /^@\/frontdesk\/lib\/(db|store)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
        contents: args.path.endsWith("/db")
          ? 'const records = new Map(); export async function dbGet(key) { await Promise.resolve(); return structuredClone(records.get(key)); } export async function dbSet(key, value) { await Promise.resolve(); records.set(key, structuredClone(value)); }'
          : 'let id = 0; export const generateId = () => String(++id); export const PAYMENT_MODE_LABELS = { cash: "Cash" }; export const getTickets = async () => [];',
        loader: "js",
      }));
    },
  }],
});
const ops = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const customer = { id: "c1", name: "Ada", phone: "08011112222" };
const policy = { ...ops.DEFAULT_POLICY };
const stock = { supplier: "Alpha", cost: 1000, availability: "full", availableQty: 2, etaMinutes: 30 };

async function committed(terms = "prepaid", paid = 1150) {
  const request = await ops.createSourcing("Sam", { customer, product: "iPhone 15", specification: "128GB", quantity: 1, urgent: false });
  await ops.addSupplierOption("Pat", request.id, stock);
  const option = (await ops.getSourcing()).find((entry) => entry.id === request.id).options[0];
  await ops.returnOffer("Pat", request.id, option.id, 1150, policy);
  await ops.commitToOffer("Sam", request.id, terms, paid);
  return request.id;
}
const fetchOne = async (id) => (await ops.getSourcing()).find((entry) => entry.id === id);

test("sourcing keeps one owner, hides supplier cost from Sales and follows the status inference", async () => {
  const request = await ops.createSourcing("Sam", { customer, product: "iPad", specification: "", quantity: 1, urgent: true });
  assert.equal(ops.sourcingStatus(request).label, "Awaiting Procurement");
  await ops.addSupplierOption("Pat", request.id, stock);
  let current = await fetchOne(request.id);
  assert.ok(current.firstResponseAt);
  await assert.rejects(ops.returnOffer("Pat", request.id, current.options[0].id, 900, policy), /below supplier cost/);
  await ops.returnOffer("Pat", request.id, current.options[0].id, 1150, policy);
  current = await fetchOne(request.id);
  assert.equal(ops.sourcingStatus(current).label, "Awaiting Customer");
  const salesView = ops.redactSupplierDetail(current);
  assert.equal(salesView.options.length, 0);
  assert.ok(!salesView.history.some((event) => /Alpha|1000/.test(event.detail)));
  assert.equal(ops.activeOffer(salesView).price, 1150);
});

test("prepaid needs the full amount and a purchase needs a customer commitment", async () => {
  const request = await ops.createSourcing("Sam", { customer, product: "Watch", specification: "", quantity: 1, urgent: false });
  await ops.addSupplierOption("Pat", request.id, stock);
  const option = (await fetchOne(request.id)).options[0];
  await ops.returnOffer("Pat", request.id, option.id, 1150, policy);
  await assert.rejects(ops.createPurchase("Pat", request.id, "store", "", "PO-1", ""), /must commit/);
  await assert.rejects(ops.commitToOffer("Sam", request.id, "prepaid", 500), /full amount/);
  await ops.commitToOffer("Sam", request.id, "cod", 0);
  assert.equal((await fetchOne(request.id)).commitment.terms, "cod");
});

test("a supplier pickup is not store stock until Inventory receives it, and serials must match", async () => {
  const id = await committed();
  await ops.createPurchase("Pat", id, "store", "", "PO-2", "SN-1");
  assert.equal(ops.sourcingStatus(await fetchOne(id)).label, "In transit to store");
  await assert.rejects(ops.recordDelivery("Sam", id, "Ada", "", false, policy), /Inventory must receive/);
  await assert.rejects(ops.receiveIntoStore("Ivy", id, "SN-9", "", true), /does not match/);
  await ops.receiveIntoStore("Ivy", id, "SN-1", "", true);
  assert.equal(ops.sourcingStatus(await fetchOne(id)).label, "Received, awaiting handover");
});

test("changing the price after commitment forces re-confirmation and keeps the old offer", async () => {
  const id = await committed();
  const current = await fetchOne(id);
  await ops.returnOffer("Pat", id, current.options[0].id, 1300, policy);
  const changed = await fetchOne(id);
  assert.equal(changed.offers.length, 2);
  assert.equal(changed.offers[0].price, 1150);
  assert.ok(changed.priceReview);
  assert.equal(changed.commitment, undefined);
  await assert.rejects(ops.createPurchase("Pat", id, "store", "", "PO-3", ""), /must commit/);
  assert.equal(ops.sourcingStatus(changed).label, "Price change: review");
});

test("direct fulfilment never needs store receipt, honours the packaging policy and COD stays open until remitted", async () => {
  const id = await committed("cod", 0);
  await ops.createPurchase("Pat", id, "direct", "", "PO-4", "");
  await assert.rejects(ops.recordDelivery("Sam", id, "Ada", "", false, { ...policy, directPackaging: "required" }), /packaging/);
  await ops.recordDelivery("Sam", id, "Ada", "WB-1", true, { ...policy, directPackaging: "required" });
  let current = await fetchOne(id);
  assert.equal(current.receipt, undefined);
  assert.equal(ops.sourcingStatus(current).label, "Delivered / Payment outstanding");
  assert.equal(ops.directMargin(current), 150);
  await assert.rejects(ops.closeSourcing("Sam", id, "fulfilled", ""), /COD is still outstanding/);
  await ops.recordRemittance("Fin", id);
  await ops.closeSourcing("Sam", id, "fulfilled", "");
  current = await fetchOne(id);
  assert.equal(current.closed.outcome, "fulfilled");
  await assert.rejects(ops.closeSourcing("Sam", id, "lost", "No response"), /already closed/);
});

test("timing flags a request as it nears and passes the target", async () => {
  const request = await ops.createSourcing("Sam", { customer, product: "Timer", specification: "", quantity: 1, urgent: false });
  const start = Date.parse(request.createdAt);
  assert.equal(ops.sourcingTiming(request, policy, start + 10 * 60000).state, "on_track");
  assert.equal(ops.sourcingTiming(request, policy, start + 50 * 60000).state, "approaching");
  assert.equal(ops.sourcingTiming(request, policy, start + 61 * 60000).state, "breached");
});

test("the work queue shows owner, wait and next action for sourcing and flags breaches", async () => {
  const all = await ops.getSourcing();
  const items = ops.buildWorkItems({ sales: [], refunds: [], tickets: [], enquiries: [], sourcing: all, returns: [], policy, now: Date.now() + 2 * 3600000 });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.owner && item.waitingOn && item.nextAction));
  assert.ok(items.some((item) => item.exception && /target/.test(item.reason ?? "")));
});

test("returns enter inspection first, warranty needs an assessment, refunds close only once paid", async () => {
  const shift = await ops.pos.startShift("Cash", 0);
  const line = { productId: "p", name: "Phone", quantity: 1, unitPrice: 100, tracking: "serial", warranty: { type: "Shop", provider: "S", durationMonths: 12, startsOn: "sale", terms: "t" },
    devices: [{ id: "u1", productId: "p", serialNumber: "SER-1", status: "available" }] };
  const sale = await ops.pos.createSale({ cashierName: "Cash", channel: "in_store", lines: [line], customer, subtotal: 100, total: 100, payments: [{ mode: "cash", amount: 100 }], paymentMode: "cash" });
  await assert.rejects(ops.returns.createReturn("Cece", undefined, { type: "return", item: "Phone", serial: "", reason: "x" }), /Link the original sale/);
  await assert.rejects(ops.returns.createReturn("Cece", sale, { type: "return", item: "Phone", serial: "WRONG", reason: "x" }), /not on the original sale/);

  const plain = await ops.returns.createReturn("Cece", sale, { type: "return", item: "Phone", serial: "SER-1", reason: "Changed mind" });
  await assert.rejects(ops.returns.recordDisposition("Cece", plain.id, "restock", "ok"), /received into inspection/);
  await ops.returns.receiveReturn("Ivy", plain.id, "faulty", "SER-1", "Boxed, screen cracked");
  await assert.rejects(ops.returns.recordDisposition("Ivy", plain.id, "restock", "ok"), /cannot be restocked/);
  await ops.returns.recordDisposition("Ivy", plain.id, "refund", "Faulty on arrival");
  await assert.rejects(ops.returns.closeReturn("Cece", plain.id, ""), /refund has not been paid/);
  const refund = await ops.pos.createRefund({ saleId: sale.id, lines: [{ lineIndex: 0, quantity: 1, deviceIds: ["u1"] }], reason: "Faulty", condition: "faulty", mode: "cash", actor: "Cece", actorRole: "admin", cashPaid: true });
  assert.equal(refund.status, "paid");
  await ops.returns.closeReturn("Cece", plain.id, "Refunded");
  assert.ok((await ops.returns.getReturns()).find((entry) => entry.id === plain.id).closed);

  const claim = await ops.returns.createReturn("Cece", sale, { type: "warranty", item: "Phone", serial: "", reason: "Won't boot" });
  await ops.returns.receiveReturn("Ivy", claim.id, "used", "", "Received with charger");
  await assert.rejects(ops.returns.recordDisposition("Ivy", claim.id, "repair", "send"), /Classify the warranty claim/);
  await assert.rejects(ops.returns.classifyWarranty("Cece", claim.id, false, "covered", "looks fine"), /technical or management/);
  await ops.returns.classifyWarranty("Boss", claim.id, true, "covered", "Board fault, within terms");
  await ops.returns.recordDisposition("Ivy", claim.id, "repair", "Rework under warranty");
  assert.equal(ops.returns.returnStatus((await ops.returns.getReturns()).find((entry) => entry.id === claim.id)).label, "Ready to close");
  assert.ok(shift);
});

test("policy changes are validated and recorded in the audit trail", async () => {
  await assert.rejects(ops.savePolicy("Boss", { ...policy, sourcingTargetMinutes: 0 }), /greater than zero/);
  const saved = await ops.savePolicy("Boss", { ...policy, directPackaging: "required", marginPercent: 20 });
  assert.equal((await ops.getPolicy()).directPackaging, "required");
  assert.equal(saved.marginPercent, 20);
  const log = await ops.pos.getAuditLog();
  assert.ok(log.some((entry) => entry.action === "policy_changed" && /directPackaging/.test(entry.detail)));
  assert.ok(log.some((entry) => entry.action === "sourcing_offer_returned"));
});
