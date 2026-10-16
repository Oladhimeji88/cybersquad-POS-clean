// Sellable products are drawn from the same Odoo product catalog the repairs
// module already uses for parts (see src/frontdesk/lib/parts.ts) — Odoo has
// no separate catalog for retail sales, so we reuse the existing fetch here
// rather than duplicating pagination/dedup logic.
export { fetchPartsCatalog as fetchPosCatalog } from "@/frontdesk/lib/parts";
