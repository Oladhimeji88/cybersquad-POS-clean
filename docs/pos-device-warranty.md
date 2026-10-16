# POS device and warranty frontend

Use **Try sample devices** in POS to select fictional received stock. The sample catalog is separate from Odoo products; sample transactions are labeled and excluded from revenue summaries, shift cash totals, and the sync outbox.

Inventory defines tracking, units and warranty policies before checkout. Sales selects recorded units; quantity follows selected units. Customer name and phone attach to the sale. Held sales retain these details. Checkout snapshots warranty terms and dates; fixed manufacturer dates do not restart. Sale history and receipts display device identifiers and coverage.

Current integration contract: PosProduct in src/pos/lib/devices.ts extends the existing catalog with tracking, units, warranty; units have stable IDs, product IDs, serial, optional IMEI/IMEI2, availability and optional warranty override. Do not infer coverage or serialized tracking from product names. The live parts-catalog adapter does not supply these fields yet.

Backend follow-up: supply real serialized inventory and policies; map customer to a shared customer ID; atomically reserve/consume units on hold/checkout; validate terms and availability server-side; expose sale-device links for refunds and repair warranty lookup. The existing repair warranty helper is unchanged: this change does not claim to replace its ticket-based eligibility calculation.

Local validation checks known completed and held sales. Browser storage is only a prototype source of availability, not shared stock across registers. No Odoo writes occur. Refund processing and shared customer creation are separate work.

Run focused logic checks with: node --test src/pos/lib/devices.test.mjs src/pos/lib/store.test.mjs (Node 24). Build with: npm run build.
