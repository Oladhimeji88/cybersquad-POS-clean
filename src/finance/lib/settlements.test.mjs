import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const bundled = await build({
  stdin: { contents: 'export * from "@/pos/lib/store"; export * from "@/finance/lib/settlements";', resolveDir: root, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "cod-test",
    setup(builder) {
      builder.onResolve({ filter: /^@\/(pos|finance)\// }, (args) => ({ path: path.join(root, "src", args.path.slice(2) + ".ts") }));
      builder.onResolve({ filter: /^@\/frontdesk\/lib\/(db|store)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
        contents: args.path.endsWith("/db")
          ? 'const records = new Map(); export async function dbGet(k) { await Promise.resolve(); return structuredClone(records.get(k)); } export async function dbSet(k, v) { await Promise.resolve(); records.set(k, structuredClone(v)); }'
          : 'let id = 0; export const generateId = () => String(++id); export const PAYMENT_MODE_LABELS = { cash: "Cash" };',
        loader: "js",
      }));
    },
  }],
});
const m = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));

const customer = { name: "Ada", phone: "0800" };
const codSale = (price, fee = 0, extra = {}) => ({ cashierName: "T", channel: "in_store", customer,
  lines: [{ productId: "p" + price, name: "Item", quantity: 1, unitPrice: price }], subtotal: price, total: price,
  payments: [], paymentMode: "cod", cod: { courier: "Speedef", address: "1 Lagos Rd", fee, status: "pending", history: [] }, ...extra });
const today = () => new Date().toISOString().slice(0, 10);

test("a COD sale is revenue now, but not cash, and starts Pending", async () => {
  const shift = await m.startShift("T", 50);
  const sale = await m.createSale(codSale(1000, 100));
  assert.equal(sale.cod.status, "pending");
  assert.deepEqual(sale.payments, []);
  assert.equal((await m.getSalesSummary("all")).totalRevenue, 1000);
  assert.equal((await m.endShift(shift.id, 50)).expectedCash, 50); // COD never touches the till
});

test("COD needs a customer, address and sane fee", async () => {
  await assert.rejects(m.createSale(codSale(500, 0, { customer: undefined })), /customer name, phone/i);
  const noAddress = codSale(500); noAddress.cod.address = " ";
  await assert.rejects(m.createSale(noAddress), /delivery address/i);
  await assert.rejects(m.createSale(codSale(500, 900)), /courier fee/i);
  await assert.rejects(m.createSale({ ...codSale(500), payments: [{ mode: "cash", amount: 500 }] }), /paid by the courier/i);
});

test("status transitions are guarded and cancelling removes revenue", async () => {
  const sale = await m.createSale(codSale(300));
  await assert.rejects(m.updateCodStatus(sale.id, "cancelled", "A").then(() => m.updateCodStatus(sale.id, "delivered", "A")), /cancelled/);
  const before = (await m.getSalesSummary("all")).totalRevenue;
  const other = await m.createSale(codSale(200));
  await m.updateCodStatus(other.id, "delivered", "A"); await m.updateCodStatus(other.id, "collected", "A");
  await assert.rejects(m.updateCodStatus(other.id, "cancelled", "A"), /cannot be marked/);
  assert.equal((await m.getSalesSummary("all")).totalRevenue, before + 200);
});

test("settlement bundles each order once, nets fees, and settles orders only when fully paid", async () => {
  const [a, b] = [await m.createSale(codSale(1000, 50)), await m.createSale(codSale(2000, 150))];
  for (const s of [a, b]) await m.updateCodStatus(s.id, "delivered", "A");
  const from = "2000-01-01", to = today();
  const billable = await m.getBillableCodSales(from, to);
  assert.ok([a.id, b.id].every((id) => billable.some((s) => s.id === id)));
  const settlement = await m.createSettlement({ from, to, saleIds: [a.id, b.id], actor: "Fin" });
  assert.match(settlement.reference, /^SET-SPD-\d{6}-\d{3}$/);
  assert.equal(settlement.gross, 3000); assert.equal(settlement.fees, 200); assert.equal(settlement.net, 2800);
  await assert.rejects(m.createSettlement({ from, to, saleIds: [a.id], actor: "Fin" }), /no longer eligible/);

  await m.recordSettlementPayment(settlement.id, { reference: "P1", amount: 1000, paidOn: today(), actor: "Fin" });
  let current = (await m.getSettlements()).find((s) => s.id === settlement.id);
  assert.equal(m.settlementStatus(current), "partially_paid");
  assert.equal((await m.getSales()).find((s) => s.id === a.id).cod.status, "delivered");
  await assert.rejects(m.recordSettlementPayment(settlement.id, { reference: "p1", amount: 100, paidOn: today(), actor: "Fin" }), /already recorded/);
  await assert.rejects(m.recordSettlementPayment(settlement.id, { reference: "P2", amount: 9999, paidOn: today(), actor: "Fin" }), /exceeds/);

  await m.recordSettlementPayment(settlement.id, { reference: "P2", amount: 1800, paidOn: today(), actor: "Fin" });
  current = (await m.getSettlements()).find((s) => s.id === settlement.id);
  assert.equal(m.settlementStatus(current), "paid");
  const sales = await m.getSales();
  assert.equal(sales.find((s) => s.id === a.id).cod.status, "settled");
  assert.equal(sales.find((s) => s.id === b.id).cod.status, "settled");
  assert.equal((await m.getSalesSummary("all")).totalRevenue >= 3000, true); // settlement never re-counts revenue
});

test("an unpaid settlement past its due date is overdue", () => {
  const s = { net: 100, payments: [], dueOn: new Date(Date.now() - 86400000).toISOString() };
  assert.equal(m.settlementStatus(s), "overdue");
});
