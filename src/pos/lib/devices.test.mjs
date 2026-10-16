import test from "node:test";
import assert from "node:assert/strict";
import { activateWarranty, validateDeviceLines, snapshotDeviceLines, deviceDetailText } from "./devices.ts";
const policy = { type: "Shop warranty", provider: "Shop", durationMonths: 1, startsOn: "sale", terms: "Original terms" };
const unit = { id: "unit-1", productId: "phone", serialNumber: "SERIAL-1", imei: "IMEI-1", status: "available" };
const line = { productId: "phone", name: "Phone", quantity: 1, tracking: "serial", warranty: policy, devices: [unit] };
test("month-end activation clamps to last day and handles leap years", () => {
  assert.equal(activateWarranty(policy, "2026-01-31T10:00:00.000Z").expiresAt, "2026-02-28T10:00:00.000Z");
  assert.equal(activateWarranty(policy, "2028-01-31T10:00:00.000Z").expiresAt, "2028-02-29T10:00:00.000Z");
});
test("manufacturer coverage is preserved, including expired coverage", () => {
  const fixed = { ...policy, startsOn: "fixed", startsAt: "2024-01-01", expiresAt: "2025-01-01" };
  assert.equal(activateWarranty(fixed, "2026-09-29").expiresAt, "2025-01-01");
  assert.throws(() => activateWarranty({ ...fixed, expiresAt: undefined }, "2026-09-29"));
});
test("quantities require distinct available matching units", () => {
  assert.doesNotThrow(() => validateDeviceLines([line]));
  assert.throws(() => validateDeviceLines([{ ...line, quantity: 2 }]));
  assert.throws(() => validateDeviceLines([{ ...line, quantity: 2, devices: [unit, unit] }]));
  assert.throws(() => validateDeviceLines([line], new Set(["unit-1"])));
  assert.throws(() => validateDeviceLines([{ ...line, devices: [{ ...unit, productId: "other" }] }]));
  assert.throws(() => validateDeviceLines([{ ...line, devices: [{ ...unit, status: "unavailable" }] }]));
  assert.throws(() => validateDeviceLines([{ ...line, warranty: undefined }]));
});
test("snapshots retain terms and unit overrides without changing inventory", () => {
  const override = { ...policy, durationMonths: 6 };
  const source = { ...line, devices: [{ ...unit, warranty: override }] };
  const result = snapshotDeviceLines([source], "2026-09-29T00:00:00.000Z");
  assert.equal(result[0].devices[0].coverage.expiresAt, "2027-03-29T00:00:00.000Z");
  assert.equal(source.devices[0].coverage, undefined);
  override.terms = "Changed later";
  assert.equal(result[0].devices[0].coverage.terms, "Original terms");
});
test("accessories and historical lines work without invented warranty", () => {
  const accessory = { productId: "cable", name: "Cable", quantity: 2 };
  assert.doesNotThrow(() => validateDeviceLines([accessory]));
  assert.equal(snapshotDeviceLines([accessory], "2026-09-29")[0].coverage, undefined);
});
test("receipt and history details retain both IMEIs and original terms", () => {
  const result = snapshotDeviceLines([{ ...line, devices: [{ ...unit, imei2: "IMEI-2" }] }], "2026-09-29T00:00:00.000Z");
  const text = deviceDetailText(result[0]).join(" ");
  assert.match(text, /IMEI-1/); assert.match(text, /IMEI-2/);
  assert.match(text, /Original terms/); assert.match(text, /2026-10-29/);
});
