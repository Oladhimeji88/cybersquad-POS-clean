import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Real module logic against in-memory storage, including the prototype finance ledger.
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
const bundled = await build({
  stdin: {
    contents: ["procurement", "logistics", "inventoryOps", "support", "quotes", "digital", "finops", "routines", "catalog", "reports", "data", "sourcing", "policy"].map((name) => 'export * as ' + name + ' from "./src/operations/' + name + '";').join("") +
      'export * as pos from "./src/pos/lib/store"; export * as finance from "./src/lib/finance";',
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
const m = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const policy = { ...m.policy.DEFAULT_POLICY };
const payables = async () => (await m.finance.fetchPayables({ get: async () => { throw new Error("offline"); } })) ?? [];
const receivables = async () => (await m.finance.fetchReceivables({ get: async () => { throw new Error("offline"); } })) ?? [];

test("suppliers must be approved, prices are append-only, and pasted lists report unreadable rows", async () => {
  const supplier = await m.procurement.addSupplier("Pat", { name: "Alpha Ltd", contact: "Ade", phone: "0801", paymentTermsDays: 7, capabilities: "phones" });
  assert.equal(supplier.status, "pending");
  await assert.rejects(m.procurement.addSupplier("Pat", { name: "alpha ltd", contact: "", phone: "0801", paymentTermsDays: 7, capabilities: "" }), /already exists/);
  await assert.rejects(m.procurement.addPrice("Pat", supplier, "iPhone 15", 900000, "2026-10-01"), /approved supplier/);
  await m.procurement.setSupplierStatus("Boss", supplier.id, "approved", "Checked references");
  const approved = (await m.procurement.supplierStore.all())[0];
  await m.procurement.addPrice("Pat", approved, "iPhone 15", 900000, "2026-10-01");
  await m.procurement.addPrice("Pat", approved, "iPhone 15", 880000, "2026-10-08");
  const prices = await m.procurement.priceStore.all();
  assert.equal(prices.length, 2);
  assert.equal(m.procurement.currentPrice(prices, approved.id, "iphone 15", Date.parse("2026-10-09")).unitCost, 880000);
  assert.equal(m.procurement.currentPrice(prices, approved.id, "iPhone 15", Date.parse("2026-10-02")).unitCost, 900000);
  const parsed = m.procurement.parsePriceList("Cable, 1,500\nCharger; 4000\nnonsense line");
  assert.deepEqual(parsed.rows.map((row) => row.cost), [1500, 4000]);
  assert.deepEqual(parsed.bad, ["nonsense line"]);
});

test("purchase orders: inactive suppliers blocked, partial receipt feeds the supplier bill, discrepancies stay open, price changes need review", async () => {
  const [supplier] = await m.procurement.supplierStore.all();
  const lines = [{ product: "Phone case", qty: 10, unitCost: 1000 }];
  await m.procurement.setSupplierStatus("Boss", supplier.id, "inactive", "Paused");
  await assert.rejects(m.procurement.createPO("Pat", (await m.procurement.supplierStore.all())[0], { kind: "manual" }, lines, "whatsapp"), /approved supplier/);
  await m.procurement.setSupplierStatus("Boss", supplier.id, "approved", "Resumed");
  const live = (await m.procurement.supplierStore.all())[0];
  const po = await m.procurement.createPO("Pat", live, { kind: "manual" }, lines, "whatsapp", "2026-10-20");
  assert.equal(m.procurement.poStatus(po), "Awaiting supplier");
  await m.procurement.acknowledgePO("Pat", po.id, "Confirmed on WhatsApp");
  await assert.rejects(m.procurement.receivePO("Ivy", po.id, [{ line: 0, qty: 11 }], ""), /more than was ordered/);
  assert.equal((await m.procurement.receivePO("Ivy", po.id, [{ line: 0, qty: 4 }], "first box")).complete, false);
  let current = (await m.procurement.poStore.all())[0];
  assert.equal(m.procurement.poStatus(current), "Partially received");
  assert.equal((await payables()).find((row) => row.reference === po.number).amount, 4000);
  await m.procurement.raiseDiscrepancy("Ivy", po.id, 0, "damage", 1, "One case cracked");
  current = (await m.procurement.poStore.all())[0];
  assert.equal(m.procurement.poStatus(current), "Discrepancy open");
  await assert.rejects(m.procurement.cancelPO("Pat", po.id, "no longer needed"), /already received/);
  await m.procurement.resolveDiscrepancy("Pat", po.id, current.discrepancies[0].id, "Supplier credited one unit");
  await m.procurement.recordSupplierChange("Pat", po.id, "Supplier raised price", [1200]);
  current = (await m.procurement.poStore.all())[0];
  assert.equal(m.procurement.poStatus(current), "Supplier price change");
  assert.equal(current.lines[0].unitCost, 1200);
  await m.procurement.reviewPriceChange("Pat", po.id, "Sales told, customer agreed");
  await m.procurement.receivePO("Ivy", po.id, [{ line: 0, qty: 6 }], "");
  current = (await m.procurement.poStore.all())[0];
  assert.equal(m.procurement.poStatus(current), "Complete");
  assert.equal((await payables()).find((row) => row.reference === po.number).amount, 4 * 1200 + 6 * 1200);
});

test("supplier returns can only cover received, unreturned goods and expected credit stays open until settled", async () => {
  const [po] = await m.procurement.poStore.all(); const existing = await m.procurement.supplierReturnStore.all();
  await assert.rejects(m.procurement.createSupplierReturn("Pat", po, existing, 0, 11, "bad", "return", ""), /only return goods that were received/);
  const back = await m.procurement.createSupplierReturn("Pat", po, existing, 0, 2, "Cracked", "return", "");
  assert.equal(back.status, "open");
  await assert.rejects(m.procurement.createSupplierReturn("Pat", po, await m.procurement.supplierReturnStore.all(), 0, 9, "x", "return", ""), /only return goods/);
  await m.procurement.markReturnShipped("Pat", back.id);
  await assert.rejects(m.procurement.settleSupplierCredit("Pat", back.id, "credited", 0, "x"), /credit or refund received/);
  await m.procurement.settleSupplierCredit("Pat", back.id, "credited", 2400, "Credit note CN-1");
  assert.equal((await m.procurement.supplierReturnStore.all())[0].status, "credited");
});

test("replenishment is a decision queue: low stock only suggests, approval is needed before ordering", async () => {
  const suggestions = m.procurement.lowStockSuggestions([{ product: "Cable", quantity: 1 }, { product: "Charger", quantity: 50 }], [], 3);
  assert.deepEqual(suggestions.map((entry) => entry.product), ["Cable"]);
  const request = await m.procurement.requestReplenishment("Ivy", { product: "Cable", quantity: 20, reason: "low_stock", note: "" });
  const [supplier] = await m.procurement.supplierStore.all();
  await assert.rejects(m.procurement.orderFromReplenishment("Pat", request.id, supplier, 500, "phone"), /approved replenishment/);
  await m.procurement.decideReplenishment("Pat", request.id, "approved", "Selling fast");
  const po = await m.procurement.orderFromReplenishment("Pat", request.id, supplier, 500, "phone");
  assert.equal(po.origin.kind, "replenishment");
  assert.equal((await m.procurement.replenishmentStore.all())[0].status, "ordered");
  assert.equal(m.procurement.lowStockSuggestions([{ product: "cable", quantity: 1 }], await m.procurement.replenishmentStore.all(), 3).length, 1);
});

const base = { type: "delivery", source: { kind: "manual", label: "Test" }, customerName: "Ada", contact: "0801", address: "1 Road", item: "Laptop", partner: "Speedaf", payment: { mode: "prepaid", orderValue: 0, prepaid: 0 } };
test("logistics: COD rules, pickup code security, custody, proof of delivery separate from settlement", async () => {
  await assert.rejects(m.logistics.createJob("Lee", { ...base, address: "" }), /customer, contact and address/);
  await assert.rejects(m.logistics.createJob("Lee", { ...base, payment: { mode: "cod", orderValue: 1000, prepaid: 200 } }), /Full COD has no prepayment/);
  await assert.rejects(m.logistics.createJob("Lee", { ...base, payment: { mode: "part_cod", orderValue: 1000, prepaid: 1000 } }), /Part payment/);
  const partCod = await m.logistics.createJob("Lee", { ...base, payment: { mode: "part_cod", orderValue: 1000, prepaid: 400 } });
  assert.equal(partCod.payment.codBalance, 600);
  const job = await m.logistics.createJob("Lee", { ...base, type: "supplier_to_store", customerName: undefined, contact: undefined, address: "", pickupCode: "4821", serial: "SN1" });
  assert.equal(job.payment.codBalance, 0);
  await assert.rejects(m.logistics.pickUp("Rider", job.id, "0000", ""), /does not match/);
  await assert.rejects(m.logistics.pickUp("Rider", job.id, "4821", "OTHER"), /Serial does not match/);
  await m.logistics.revealPickupCode("Lee", job.id);
  await m.logistics.pickUp("Rider", job.id, "4821", "");
  const picked = (await m.logistics.jobStore.all()).find((entry) => entry.id === job.id);
  assert.deepEqual(picked.codeAccess.map((entry) => entry.purpose), ["rejected", "viewed", "used"]);
  assert.equal(picked.custodian, "Speedaf");
  await assert.rejects(m.logistics.recordProofOfDelivery("Rider", job.id, "", "photo", 0), /who received it/);
  await m.logistics.recordProofOfDelivery("Rider", job.id, "Store keeper", "Signed slip", 0);
  const delivered = (await m.logistics.jobStore.all()).find((entry) => entry.id === job.id);
  assert.equal(delivered.status, "delivered");
  assert.equal(m.logistics.jobState(delivered).label, "Arrived at store");
  const cod = await m.logistics.createJob("Lee", { ...base, payment: { mode: "cod", orderValue: 5000, prepaid: 0 } });
  await m.logistics.assignJob("Lee", cod.id, "Speedaf");
  await m.logistics.pickUp("Rider", cod.id, "", ""); await m.logistics.markInTransit("Rider", cod.id);
  await m.logistics.recordProofOfDelivery("Rider", cod.id, "Ada", "Photo", 5000);
  let state = m.logistics.jobState((await m.logistics.jobStore.all()).find((entry) => entry.id === cod.id));
  assert.equal(state.label, "Delivered / Payment outstanding");
  await m.logistics.recordRemittance("Fin", cod.id, "SPD-1", 4500);
  state = m.logistics.jobState((await m.logistics.jobStore.all()).find((entry) => entry.id === cod.id));
  assert.equal(state.label, "Settlement short");
  await assert.rejects(m.logistics.recordRemittance("Fin", cod.id, "SPD-2", 5000), /already recorded/);
  await m.logistics.explainShortfall("Fin", cod.id, "Courier fee deducted");
  assert.equal(m.logistics.jobState((await m.logistics.jobStore.all()).find((entry) => entry.id === cod.id)).label, "Completed");
});

test("logistics: failed delivery keeps custody until the item is received back; partner bills are idempotent", async () => {
  const job = await m.logistics.createJob("Lee", { ...base, item: "Tablet", fee: { payer: "business", charged: 0, cost: 1500 } });
  await m.logistics.assignJob("Lee", job.id, "Speedaf"); await m.logistics.pickUp("Rider", job.id, "", "");
  await assert.rejects(m.logistics.receiveFailedReturn("Lee", job.id, "available"), /Only a failed delivery/);
  await m.logistics.recordFailure("Rider", job.id, "Customer unreachable", "return");
  let current = (await m.logistics.jobStore.all()).find((entry) => entry.id === job.id);
  assert.equal(current.custodian, "Speedaf");
  assert.equal(m.logistics.jobState(current).label, "Delivery failed");
  await m.logistics.receiveFailedReturn("Inv", job.id, "reserved");
  current = (await m.logistics.jobStore.all()).find((entry) => entry.id === job.id);
  assert.match(current.custodian, /Returns Inspection/);
  const retry = await m.logistics.createJob("Lee", { ...base, item: "Router", fee: { payer: "customer", charged: 1500, cost: 1200 } });
  await m.logistics.assignJob("Lee", retry.id, "Speedaf"); await m.logistics.pickUp("Rider", retry.id, "", ""); await m.logistics.recordFailure("Rider", retry.id, "Customer not available", "retry");
  await m.logistics.retryDelivery("Lee", retry.id, new Date(Date.now() + 3600000).toISOString());
  await m.logistics.recordProofOfDelivery("Rider", retry.id, "Ada", "Photo", 0);
  const charges = m.logistics.partnerCharges(await m.logistics.jobStore.all(), "Speedaf");
  assert.equal(charges.total, 1200);
  const bill = await m.logistics.postPartnerBill("Fin", "Speedaf", "2026-10");
  assert.equal(bill.count, 1);
  await assert.rejects(m.logistics.postPartnerBill("Fin", "Speedaf", "2026-10"), /No unbilled/);
  assert.equal((await payables()).find((row) => row.reference === bill.reference).amount, 1200);
});

test("stock counts never touch the ledger; variances need cause, approval above the limit and a second person", async () => {
  await assert.rejects(m.inventoryOps.startCount("Ivy", "", [{ product: "A", systemQty: 1, unitValue: 1 }]), /where the count/);
  const count = await m.inventoryOps.startCount("Ivy", "Shop floor", [{ product: "Phone", systemQty: 5, unitValue: 50000 }, { product: "Cable", systemQty: 10, unitValue: 100 }, { product: "Case", systemQty: 4, unitValue: 500 }]);
  await m.inventoryOps.recordCounted("Ivy", count.id, 0, 4); await m.inventoryOps.recordCounted("Ivy", count.id, 1, 10);
  await assert.rejects(m.inventoryOps.submitCount("Ivy", count.id), /left/);
  await m.inventoryOps.recordCounted("Ivy", count.id, 2, 3);
  const { variances } = await m.inventoryOps.submitCount("Ivy", count.id);
  assert.deepEqual(variances.map((entry) => entry.product).sort(), ["Case", "Phone"]);
  const phone = variances.find((entry) => entry.product === "Phone"); const small = variances.find((entry) => entry.product === "Case");
  await assert.rejects(m.inventoryOps.decideVariance("Ivy", phone.id, "approved", "ok", false), /Classify/);
  await m.inventoryOps.classifyVariance("Ivy", phone.id, "theft_loss", "Night shift", "CCTV checked", policy);
  await m.inventoryOps.classifyVariance("Ivy", small.id, "counting_error", "Ivy", "Recounted", policy);
  const statuses = Object.fromEntries((await m.inventoryOps.varianceStore.all()).map((entry) => [entry.product, entry.status]));
  assert.deepEqual(statuses, { Phone: "awaiting_approval", Case: "ready" });
  await assert.rejects(m.inventoryOps.decideVariance("Ivy", phone.id, "approved", "ok", false), /manager must decide/);
  await assert.rejects(m.inventoryOps.decideVariance("Ivy", phone.id, "approved", "ok", true), /cannot also approve/);
  await m.inventoryOps.decideVariance("Boss", phone.id, "approved", "Write off, report filed", true);
  await m.inventoryOps.decideVariance("Ivy", small.id, "approved", "Recount agreed", false);
  assert.equal((await m.inventoryOps.varianceStore.all()).find((entry) => entry.product === "Phone").decision.by, "Boss");
});

test("quarantine, reservations and serial trace stop accidental double-selling", async () => {
  await m.inventoryOps.quarantineUnit("Ivy", { product: "Phone", qty: 1, serial: "Q-1", reason: "faulty", source: "Return", nextAction: "Send to supplier" });
  await assert.rejects(m.inventoryOps.quarantineUnit("Ivy", { product: "Phone", qty: 1, serial: "Q-1", reason: "faulty", source: "", nextAction: "x" }), /already in quarantine/);
  const quarantine = await m.inventoryOps.quarantineStore.all();
  await assert.rejects(m.inventoryOps.reserveStock("Sam", { product: "Phone", qty: 1, serial: "Q-1", customerName: "Ada", reference: "" }, new Set(), quarantine, policy), /quarantine/);
  await assert.rejects(m.inventoryOps.reserveStock("Sam", { product: "Phone", qty: 1, serial: "SOLD-1", customerName: "Ada", reference: "" }, new Set(["SOLD-1"]), quarantine, policy), /already been sold/);
  const reservation = await m.inventoryOps.reserveStock("Sam", { product: "Phone", qty: 1, serial: "R-1", customerName: "Ada", reference: "WEB-1" }, new Set(), quarantine, policy);
  await assert.rejects(m.inventoryOps.reserveStock("Sam", { product: "Phone", qty: 1, serial: "R-1", customerName: "Bola", reference: "" }, new Set(), quarantine, policy), /already reserved/);
  assert.equal(m.inventoryOps.reservedQty(await m.inventoryOps.reservationStore.all(), "phone"), 1);
  assert.equal(m.inventoryOps.reservedQty(await m.inventoryOps.reservationStore.all(), "phone", Date.parse(reservation.expiresAt) + 1000), 0);
  await m.inventoryOps.closeReservation("Sam", reservation.id, "released", "customer left");
  await m.inventoryOps.reserveStock("Sam", { product: "Phone", qty: 1, serial: "R-1", customerName: "Bola", reference: "" }, new Set(), quarantine, policy);
  const hits = m.inventoryOps.traceSerial("q-1", { sales: [], reservations: await m.inventoryOps.reservationStore.all(), quarantine: await m.inventoryOps.quarantineStore.all(), returns: [], sourcing: [], jobs: [] });
  assert.deepEqual(hits.map((entry) => entry.where), ["Quarantine"]);
  const signals = m.inventoryOps.demandSignals([1, 2, 3].map(() => ({ product: "Pixel 9", createdAt: new Date().toISOString() })).concat([{ product: "Other", createdAt: new Date().toISOString() }]));
  assert.deepEqual(signals.map((entry) => [entry.product, entry.count]), [["Pixel 9", 3]]);
});

test("complaints: CX keeps the customer, silence becomes overdue, closure needs routing, an update and a real outcome", async () => {
  await assert.rejects(m.support.createComplaint("Cx", { customerName: "Ada", customerPhone: "0801", link: { kind: "sale", ref: "" }, issue: "Late", severity: "high" }, policy), /Link the sale/);
  const complaint = await m.support.createComplaint("Cx", { customerName: "Ada", customerPhone: "0801", link: { kind: "sale", ref: "SALE-1" }, issue: "Item arrived late", severity: "urgent" }, policy);
  assert.equal(Date.parse(complaint.nextUpdateDueAt) - Date.parse(complaint.createdAt), 2 * 3600000);
  assert.equal(m.support.complaintStatus(complaint).label, "Needs routing");
  await assert.rejects(m.support.resolveComplaint("Cx", complaint.id, "sorted"), /Route the complaint/);
  await m.support.routeComplaint("Cx", complaint.id, "Logistics", "Lee");
  let current = (await m.support.complaintStore.all())[0];
  assert.equal(current.cxOwner, "Cx");
  assert.equal(m.support.complaintStatus(current, Date.parse(current.nextUpdateDueAt) + 1000).label, "Customer update overdue");
  await assert.rejects(m.support.resolveComplaint("Cx", complaint.id, "sorted"), /log that update/);
  await m.support.logCustomerUpdate("Cx", complaint.id, "whatsapp", "Told Ada the outcome", policy);
  await m.support.requestRecovery("Cx", complaint.id, "Free delivery voucher", 50000, policy);
  await assert.rejects(m.support.resolveComplaint("Cx", complaint.id, "sorted"), /recovery approval/);
  await assert.rejects(m.support.decideRecovery("Cx", complaint.id, "approved", "ok", true), /own request/);
  await m.support.decideRecovery("Boss", complaint.id, "approved", "Justified", true);
  await m.support.resolveComplaint("Cx", complaint.id, "Item replaced and voucher issued");
  assert.equal(m.support.complaintStatus((await m.support.complaintStore.all())[0]).label, "Resolved");
});

test("quotes: sent versions are immutable, discounts need a second approver, expired quotes cannot be accepted, corporate acceptance raises a receivable once", async () => {
  const lines = [{ description: "10 laptops", qty: 10, unitPrice: 400000 }];
  await assert.rejects(m.quotes.createQuote("Sam", { customerName: "Ada", customerPhone: "0801", lines, discountPercent: 5, discountReason: "" }, policy), /reason for the discount/);
  const quote = await m.quotes.createQuote("Sam", { customerName: "Ada", customerPhone: "0801", company: "ABC Corp", creditDays: 30, lines, discountPercent: 15, discountReason: "Bulk" }, policy);
  assert.equal(quote.approval.status, "required");
  await assert.rejects(m.quotes.sendQuote("Sam", quote.id, policy), /must be approved/);
  await assert.rejects(m.quotes.decideQuoteDiscount("Sam", quote.id, "approved", "ok", true), /discount you gave/);
  await m.quotes.decideQuoteDiscount("Boss", quote.id, "approved", "Bulk order", true);
  await m.quotes.sendQuote("Sam", quote.id, policy);
  await m.quotes.reviseQuote("Sam", quote.id, [{ description: "10 laptops", qty: 10, unitPrice: 390000 }], 15, "Bulk", "Supplier price dropped", policy);
  let current = (await m.quotes.quoteStore.all())[0];
  assert.equal(current.versions.length, 2);
  assert.equal(current.versions[0].lines[0].unitPrice, 400000);
  assert.equal(current.status, "draft");
  await assert.rejects(m.quotes.acceptQuote("Sam", quote.id, ""), /Only a sent quote/);
  await m.quotes.decideQuoteDiscount("Boss", quote.id, "approved", "Still fine", true);
  await m.quotes.sendQuote("Sam", quote.id, policy);
  current = (await m.quotes.quoteStore.all())[0];
  assert.equal(m.quotes.quoteExpired(current, Date.parse(m.quotes.latestVersion(current).validUntil) + 1000), true);
  const accepted = await m.quotes.acceptQuote("Sam", quote.id, "PO received");
  assert.equal(accepted.invoiced, true);
  assert.equal((await receivables()).filter((row) => row.reference === quote.number).length, 1);
  assert.equal((await receivables()).find((row) => row.reference === quote.number).amount, 3315000);
});

test("digital orders: nothing moves before payment is verified, amendments keep history, cancellation stays a refund until paid, messages come from events", async () => {
  await assert.rejects(m.digital.createWebOrder("Sam", { channel: "website", customerName: "Ada", customerPhone: "0801", items: [] }), /Each item/);
  const order = await m.digital.createWebOrder("Sam", { channel: "instagram", customerName: "Ada", customerPhone: "0801", items: [{ product: "AirPods", qty: 2, unitPrice: 50000 }] });
  assert.equal(order.total, 100000); assert.equal(order.notices[0].event, "received");
  await assert.rejects(m.digital.allocateStock("Sam", order.id, ""), /not verified/);
  await assert.rejects(m.digital.sendOrderToSourcing("Sam", order.id), /not verified/);
  await m.digital.recordOnlinePayment("Fin", order.id, "failed", "");
  await assert.rejects(m.digital.recordOnlinePayment("Fin", order.id, "verified", ""), /reference/);
  await m.digital.recordOnlinePayment("Fin", order.id, "verified", "PAYSTACK-1");
  await m.digital.amendOrder("Sam", order.id, [{ product: "AirPods", qty: 1, unitPrice: 50000 }], "Customer wants one");
  let current = (await m.digital.webOrderStore.all())[0];
  assert.equal(current.total, 50000); assert.equal(current.amendments[0].beforeTotal, 100000);
  const request = await m.digital.sendOrderToSourcing("Sam", order.id);
  assert.match(request.specification, /WEB-0001/);
  assert.equal((await m.digital.webOrderStore.all())[0].fulfilment, "sourcing");
  await m.digital.cancelOrder("Sam", order.id, "Customer changed mind");
  current = (await m.digital.webOrderStore.all())[0];
  assert.equal(m.digital.orderStatus(current).label, "Cancelled, refund outstanding");
  await assert.rejects(m.digital.completeOrderRefund("Fin", order.id, ""), /payout reference/);
  await m.digital.completeOrderRefund("Fin", order.id, "TRF-9");
  assert.equal(m.digital.orderStatus((await m.digital.webOrderStore.all())[0]).label, "Cancelled");
  assert.ok((await m.digital.webOrderStore.all())[0].notices.some((notice) => notice.event === "refunded"));
  assert.match(m.digital.whatsappLink("08011112222", "Hi there"), /wa\.me\/2348011112222\?text=Hi%20there/);
  const lead = await m.digital.recordAbandoned("Sam", { customerName: "Bola", contact: "0802", product: "iPad", channel: "website", value: 300000, followUpHours: 2 });
  await assert.rejects(m.digital.closeAbandoned("Sam", lead.id, "converted", ""), /what happened/);
  await m.digital.closeAbandoned("Sam", lead.id, "no_response", "Called twice");
});

test("expenses need evidence, approval above the limit by someone else, petty cash cannot overspend, reconciliation differences stay queued", async () => {
  await assert.rejects(m.finops.requestExpense("Sam", { kind: "expense", purpose: "Fuel", category: "Transport", amount: 5000, supplier: "", evidence: "" }, policy), /evidence/);
  const small = await m.finops.requestExpense("Sam", { kind: "expense", purpose: "Fuel", category: "Transport", amount: 5000, supplier: "", evidence: "Receipt 22" }, policy);
  assert.equal(small.status, "approved");
  const big = await m.finops.requestExpense("Sam", { kind: "internal_purchase", purpose: "Shop fans", category: "Equipment", amount: 120000, supplier: "Fan Co", evidence: "Quote 7" }, policy);
  assert.equal(big.status, "requested");
  await assert.rejects(m.finops.payExpense("Fin", big.id, "TRF"), /Only an approved/);
  await assert.rejects(m.finops.decideExpense("Sam", big.id, "approved", "ok", true), /own request/);
  await assert.rejects(m.finops.decideExpense("Boss", big.id, "approved", "ok", false), /authorised approver/);
  await m.finops.decideExpense("Boss", big.id, "approved", "Needed", true); await m.finops.payExpense("Fin", big.id, "TRF-5");
  const asset = await m.finops.requestExpense("Sam", { kind: "fixed_asset", purpose: "Generator", category: "Asset", amount: 1000, supplier: "", evidence: "Invoice" }, policy);
  assert.equal(asset.approvalRequired, true);
  await m.finops.decideExpense("Boss", asset.id, "approved", "Approved", true); await m.finops.payExpense("Fin", asset.id, "TRF-6");
  assert.equal((await m.finops.expenseStore.all()).find((entry) => entry.id === asset.id).assetRef, "AST-0001");
  const petty = await m.finops.requestExpense("Sam", { kind: "petty_cash", purpose: "Tea", category: "Office", amount: 2000, supplier: "", evidence: "Receipt" }, policy);
  await assert.rejects(m.finops.payExpense("Fin", petty.id, "CASH"), /balance is too low/);
  await m.finops.topUpPettyCash("Fin", 10000, "CASH-IN"); await m.finops.payExpense("Fin", petty.id, "CASH");
  assert.equal(m.finops.pettyCashBalance(await m.finops.expenseStore.all()), 8000);
  await assert.rejects(m.finops.recordReconciliation("Fin", { date: "2026-10-12", method: "cash", systemAmount: 1000, actualAmount: 900, reason: "" }), /differ by/);
  const ok = await m.finops.recordReconciliation("Fin", { date: "2026-10-12", method: "pos", systemAmount: 500, actualAmount: 500, reason: "" });
  assert.equal(ok.status, "matched");
  const diff = await m.finops.recordReconciliation("Fin", { date: "2026-10-12", method: "cash", systemAmount: 1000, actualAmount: 900, reason: "Change given wrongly" });
  assert.equal(diff.status, "exception");
  const items = m.finops.financeWorkItems({ expenses: await m.finops.expenseStore.all(), reconciliations: await m.finops.reconciliationStore.all(), now: Date.now() });
  assert.ok(items.some((item) => item.code === "FIN-14" && item.exception));
  await m.finops.explainReconciliation("Fin", diff.id, "Found the till slip");
});

test("daily routines check real state, closing cannot hide work, adoption needs an observer and coaching, SOP changes need all three reviews", async () => {
  const date = "2026-10-12";
  await assert.rejects(m.routines.openDay("Ops", date, ["Cash float counted and shift opened"], 0), /every opening check/);
  await m.routines.openDay("Ops", date, [...m.routines.OPENING_CHECKS], 3);
  await assert.rejects(m.routines.openDay("Ops", date, [...m.routines.OPENING_CHECKS], 3), /already been opened/);
  const unowned = [{ id: "x", owner: "", nextAction: "", exception: false }];
  const checks = m.routines.closingChecks(unowned, { id: "shift-1" });
  assert.equal(checks.every((entry) => entry.ok), false);
  await assert.rejects(m.routines.closeDay("Ops", date, checks, ""), /Cannot close the day/);
  await m.routines.closeDay("Ops", date, m.routines.closingChecks([], null), "All handed over");
  const snapshot = { generatedAt: new Date().toISOString(), figures: { Sales: 3 }, exceptions: 2 };
  await m.routines.submitEod("Ops", date, snapshot, "Power cut at 3pm");
  await assert.rejects(m.routines.submitEod("Ops", date, snapshot, "again"), /already submitted/);
  const action = await m.routines.addAction("Boss", { meeting: "weekly", meetingDate: "2026-10-05", kind: "action", text: "Fix pickup SLA", owner: "Ops", dueDate: "2026-10-09" });
  assert.equal(m.routines.actionOverdue(action, Date.parse("2026-10-12T00:00:00")), true);
  assert.ok(m.routines.routinesWorkItems({ actions: await m.routines.actionStore.all(), sop: [], now: Date.parse("2026-10-12T00:00:00") }).some((item) => item.reason === "Manager action overdue"));
  await m.routines.completeAction("Ops", action.id, "Done");
  await assert.rejects(m.routines.assignTraining("Boss", "Ada", "NOPE-01"), /valid workflow code/);
  const training = await m.routines.assignTraining("Boss", "Ada", "SAL-04");
  await assert.rejects(m.routines.recordDemonstration("Boss", training.id, "Boss", "Ran a sourcing request"), /learned/);
  await m.routines.markLearned("Ada", training.id);
  await assert.rejects(m.routines.recordDemonstration("Ada", training.id, "Ada", "x"), /own demonstration/);
  await m.routines.recordDemonstration("Boss", training.id, "Boss", "Sourced and quoted a live request");
  await assert.rejects(m.routines.markSustained("Boss", training.id), /coaching evidence/);
  await m.routines.addCoaching("Boss", training.id, "Quote time down to 12 minutes");
  await m.routines.markSustained("Boss", training.id);
  assert.equal(m.routines.adoptionStage((await m.routines.adoptionStore.all())[0]), "Sustained");
  const version = await m.routines.proposeSopChange("Boss", "SAL-04", "Quote within 15 minutes", "2026-10-01");
  assert.equal(version.version, 1);
  assert.ok(m.routines.routinesWorkItems({ actions: [], sop: await m.routines.sopStore.all(), now: Date.parse("2026-10-12T00:00:00") }).some((item) => item.reason === "In effect but not aligned"));
  await m.routines.confirmReview("Boss", version.id, "sop"); await m.routines.confirmReview("Boss", version.id, "cybersquad");
  assert.equal(m.routines.sopAligned((await m.routines.sopStore.all())[0]), false);
  await m.routines.confirmReview("Boss", version.id, "academy");
  assert.equal(m.routines.sopAligned((await m.routines.sopStore.all())[0]), true);
  assert.equal((await m.routines.proposeSopChange("Boss", "SAL-04", "Second change", "2026-11-01")).version, 2);
});

test("the workflow catalog covers every handoff code once and reports honest coverage", () => {
  const codes = m.catalog.WORKFLOW_CATALOG.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ["SAL-16", "PRO-20", "INV-13", "DIG-12", "LOG-22", "REP-20", "CX-06", "WAR-04", "RET-05", "REF-03", "FIN-20", "OPS-16"]) assert.ok(codes.includes(code), code);
  assert.equal(codes.length, 16 + 20 + 13 + 12 + 22 + 20 + 6 + 4 + 5 + 3 + 20 + 16);
  const gaps = m.catalog.coverage().flatMap((entry) => entry.gaps.map((gap) => gap.code));
  assert.deepEqual(gaps.sort(), ["DIG-01", "FIN-19"]);
});

test("the combined work queue and reports are generated from the records, and lost sales always carry a reason", async () => {
  const data = await m.data.loadOpsData();
  const items = m.data.buildAllWorkItems(data, Date.now() + 5 * 86400000);
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.id && item.code && item.owner && item.waitingOn && item.nextAction && item.since));
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  const report = m.reports.buildReport(data, 0, Date.now() + 86400000);
  assert.deepEqual(report.map((section) => section.title), ["Sales", "Demand and sourcing", "Inventory", "Logistics", "Customer care, warranty and returns", "Finance"]);
  const lost = m.reports.lostSales(data, 0, Date.now() + 86400000);
  assert.ok(lost.every((entry) => entry.reason && entry.count > 0));
  const results = m.reports.expectedResults(data, 0, Date.now() + 86400000);
  assert.deepEqual(results.map((entry) => entry.family), ["Sourcing", "Returns and warranty", "Complaints", "Digital orders"]);
  const eod = m.reports.buildEod(data, new Date().toISOString().slice(0, 10), items);
  assert.equal(eod.figures["Open work items"], items.length);
});
