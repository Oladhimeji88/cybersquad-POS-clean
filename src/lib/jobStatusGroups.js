// Single source of truth for how repair-job statuses group into Job
// Management's tabs (src/components/JobManagement.jsx) and the Dashboard's
// Repair Status cards (src/components/RepairPerformance.jsx). Both used to
// keep their own hand-typed copy of these lists, which drifted apart every
// time one page changed without the other — this file is the fix: both
// pages import from here, so a status can only ever exist in one place.

export const PENDING_STATUSES = [
  "pending",
  "offers_sent",
  "offer_confirmed",
  "registered",
  "awaiting_diagnosis_fee",
  "awaiting_assignment",
  "awaiting_reassignment",
];

export const AWAITING_PARTS_STATUSES = ["awaiting_parts_release"];
export const REPAIR_IN_PROGRESS_STATUSES = ["ready_for_repair", "repairing", "repair_in_progress"];
export const QC_PENDING_STATUSES = ["submitted_for_qc_review", "quality_check"];

// The rest of the Active tab's pipeline — diagnosis, quoting, payment,
// warranty/repeat-case checks — that isn't broken out into its own Dashboard
// card. Still part of ACTIVE_STATUSES below, so Job Management's Active tab
// keeps showing all of it; the Dashboard just doesn't give it a dedicated tile.
export const OTHER_ACTIVE_STATUSES = [
  "awaiting_shipping_fee",
  "ready_to_schedule",
  "pickup_scheduled",
  "picked_up",
  "diagnosing",
  "quote_sent",
  "quote_accepted",
  "awaiting_service_fee",
  "service_fee_paid",
  "repaired",
  "awaiting_payment",
  "payment_confirmed",
  "repeat_case_validation_pending",
  "warranty_validation_pending",
  "warranty_validated",
  "qc_passed",
];

export const ACTIVE_STATUSES = [
  ...AWAITING_PARTS_STATUSES,
  ...REPAIR_IN_PROGRESS_STATUSES,
  ...QC_PENDING_STATUSES,
  ...OTHER_ACTIVE_STATUSES,
];

export const READY_FOR_COLLECTION_STATUSES = ["ready_for_collection", "ready_for_handover"];
export const COMPLETED_FINAL_STATUSES = ["delivered", "closed"];
export const COMPLETED_STATUSES = [...READY_FOR_COLLECTION_STATUSES, ...COMPLETED_FINAL_STATUSES];

export const CANCELLED_STATUSES = ["cancelled", "quote_rejected"];
