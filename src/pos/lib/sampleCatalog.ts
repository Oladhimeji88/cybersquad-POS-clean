import type { PosProduct } from "./devices";

// Explicit opt-in fixtures; never attach invented identifiers or terms to Odoo products.
export const SAMPLE_CATALOG: PosProduct[] = [
  {
    id: "sample-phone", name: "Sample iPhone 13 - 128GB", sku: "SAMPLE-IP13",
    category: "Sample devices", quantity: 3, locked: 0, price: 420000,
    tracking: "serial", isDemo: true,
    warranty: { type: "Shop warranty", provider: "Cybervilla", durationMonths: 12,
      startsOn: "sale", terms: "Sample policy: manufacturing faults only; accidental and liquid damage excluded." },
    units: [
      { id: "sample-phone-1", productId: "sample-phone", serialNumber: "DEMO-IP13-001",
        imei: "990000000000018", imei2: "990000000000026", status: "available" },
      { id: "sample-phone-2", productId: "sample-phone", serialNumber: "DEMO-IP13-002",
        imei: "990000000000034", status: "available" },
      { id: "sample-phone-3", productId: "sample-phone", serialNumber: "DEMO-IP13-003",
        imei: "990000000000042", status: "unavailable" },
    ],
  },
  {
    id: "sample-laptop", name: "Sample laptop - 16GB / 512GB", sku: "SAMPLE-LAPTOP",
    category: "Sample devices", quantity: 1, locked: 0, price: 650000,
    tracking: "serial", isDemo: true,
    warranty: { type: "Manufacturer warranty", provider: "Sample manufacturer", durationMonths: 12,
      startsOn: "fixed", startsAt: "2026-06-01T00:00:00.000Z", expiresAt: "2027-06-01T00:00:00.000Z",
      terms: "Sample existing manufacturer coverage. Purchase does not restart the warranty." },
    units: [{ id: "sample-laptop-1", productId: "sample-laptop", serialNumber: "DEMO-LAPTOP-001", status: "available" }],
  },
  {
    id: "sample-cable", name: "Sample USB-C cable", sku: "SAMPLE-CABLE",
    category: "Sample accessories", quantity: 20, locked: 0, price: 5000,
    tracking: "none", isDemo: true,
    warranty: { type: "No warranty", provider: "Cybervilla", durationMonths: 0,
      startsOn: "sale", terms: "Sample accessory without warranty coverage." },
  },
];
