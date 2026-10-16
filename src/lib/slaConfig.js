export const ALL_SCOPE_VALUE = "";
export const ALL_SERVICE_TYPE_VALUE = "*";

export const SOURCE_CHANNEL_OPTIONS = [
  { value: ALL_SCOPE_VALUE, label: "All source channels" },
  { value: "walk_in", label: "Walk-in" },
  { value: "corporate", label: "Corporate" },
  { value: "self_service", label: "Self-service" },
];

export const WORKFLOW_TYPE_OPTIONS = [
  { value: ALL_SCOPE_VALUE, label: "All workflows" },
  { value: "warranty_repair", label: "Warranty Repair" },
  { value: "store_repair", label: "Store Repair" },
  { value: "corporate_repair", label: "Corporate Repair" },
  { value: "remote_repair", label: "Remote Repair" },
];

export const JOB_GROUP_TYPE_OPTIONS = [
  { value: ALL_SCOPE_VALUE, label: "All job groups" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
];

export const CHANNEL_OPTIONS = [
  { value: "push", label: "Push" },
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export const REMINDER_TARGET_OPTIONS = [
  { value: "technician", label: "Technician" },
  { value: "customer", label: "Customer" },
  { value: "admin", label: "Admin" },
];

export const REMINDER_TYPE_OPTIONS = [
  { value: "at_seconds_from_start", label: "After stage starts" },
  { value: "at_seconds_before_deadline", label: "Before deadline" },
  { value: "at_seconds_after_deadline", label: "After deadline" },
  { value: "percent_of_ttl", label: "Percent of SLA time" },
  { value: "after_reference_repeat", label: "Repeat after reference" },
];

export const REMINDER_KIND_OPTIONS = [
  { value: "", label: "Normal reminder" },
  { value: "admin_alert", label: "Admin alert" },
  { value: "deadline_check", label: "Deadline check" },
  { value: "auto_cancel", label: "Auto cancel" },
  { value: "repeat", label: "Repeat" },
];

export const DEADLINE_MODE_OPTIONS = [
  { value: "fixed_ttl", label: "Fixed duration" },
  { value: "service_based", label: "Service based" },
  { value: "eta_plus_buffer", label: "ETA plus buffer" },
];

export const EXTENSION_REASON_OPTIONS = [
  { value: "ADDITIONAL_TESTING_REQUIRED", label: "Additional testing required" },
  { value: "AWAITING_PARTS_TOOLS", label: "Awaiting parts/tools" },
  { value: "TRAFFIC_DELAY", label: "Traffic delay" },
  { value: "VEHICLE_ISSUE", label: "Vehicle issue" },
  { value: "PREVIOUS_JOB_DELAYED", label: "Previous job delayed" },
  { value: "CUSTOMER_LOCATION_HARD_TO_FIND", label: "Customer location hard to find" },
  { value: "PERSONAL_EMERGENCY", label: "Personal emergency" },
  { value: "OPERATIONAL_EMERGENCY", label: "Operational emergency" },
  { value: "MANAGEMENT_OVERRIDE", label: "Management override" },
  { value: "OTHER", label: "Other" },
];

export const SLA_STAGE_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "registered", label: "Registered" },
  { value: "awaiting_assignment", label: "Awaiting Assignment" },
  { value: "offers_sent", label: "Offers Sent" },
  { value: "awaiting_reassignment", label: "Awaiting Reassignment" },
  { value: "offer_confirmed", label: "Offer Confirmed" },
  { value: "awaiting_shipping_fee", label: "Awaiting Shipping Fee" },
  { value: "ready_to_schedule", label: "Ready To Schedule" },
  { value: "pickup_scheduled", label: "Pickup Scheduled" },
  { value: "technician_en_route", label: "Technician En Route" },
  { value: "technician_arrived", label: "Technician Arrived" },
  { value: "picked_up", label: "Picked Up" },
  { value: "awaiting_diagnosis_fee", label: "Awaiting Diagnosis Fee" },
  { value: "awaiting_diagnosis_payment", label: "Awaiting Diagnosis Payment" },
  { value: "diagnosing", label: "Diagnosing" },
  { value: "repeat_case_validation_pending", label: "Repeat Case Validation Pending" },
  { value: "warranty_validation_pending", label: "Warranty Validation Pending" },
  { value: "warranty_validated", label: "Warranty Validated" },
  { value: "warranty_review", label: "Warranty Review" },
  { value: "warranty_void", label: "Warranty Void" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "quote_accepted", label: "Quote Accepted" },
  { value: "quote_rejected", label: "Quote Rejected" },
  { value: "awaiting_service_fee", label: "Awaiting Service Fee" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "payment_confirmed", label: "Payment Confirmed" },
  { value: "service_fee_paid", label: "Service Fee Paid" },
  { value: "awaiting_repair_payment", label: "Awaiting Repair Payment" },
  { value: "awaiting_parts_release", label: "Awaiting Parts Release" },
  { value: "ready_for_repair", label: "Ready For Repair" },
  { value: "repairing", label: "Repairing" },
  { value: "repair_in_progress", label: "Repair In Progress" },
  { value: "repaired", label: "Repaired" },
  { value: "quality_check", label: "Quality Check" },
  { value: "submitted_for_qc_review", label: "Submitted For QC Review" },
  { value: "qc_passed", label: "QC Passed" },
  { value: "ready_for_handover", label: "Ready For Handover" },
  { value: "ready_for_collection", label: "Ready For Collection" },
  { value: "ready_for_return", label: "Ready For Return" },
  { value: "en_route_for_delivery", label: "En Route For Delivery" },
  { value: "arrived_for_delivery", label: "Arrived For Delivery" },
  { value: "return_in_transit", label: "Return In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export const DEFAULT_STAGE_RULES = {
  stages: {},
  defaults: {
    reminders: {
      deadline_check_5s: {
        kind: "deadline_check",
        type: "at_seconds_after_deadline",
        seconds: 5,
        sequence: 99,
      },
      admin_alert_at_deadline: {
        kind: "admin_alert",
        type: "at_seconds_after_deadline",
        seconds: 0,
        sequence: 90,
      },
    },
  },
  stage_order: [],
};

export function formatKeyLabel(value) {
  const key = String(value || "").trim();
  if (!key) return "All";
  if (key === ALL_SERVICE_TYPE_VALUE) return "All";

  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getOptionLabel(options, value, fallback = "All") {
  const match = options.find((option) => option.value === value);
  if (match) return match.label;
  if (value === ALL_SERVICE_TYPE_VALUE) return "All";
  return value ? formatKeyLabel(value) : fallback;
}

export function formatSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "Not set";
  if (value === 0) return "0s";
  if (value < 60) return `${value}s`;
  if (value % 86400 === 0) return `${value / 86400}d`;
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  if (value > 3600) return `${(value / 3600).toFixed(1)}h`;
  return `${Math.round(value / 60)}m`;
}

export function splitSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return { amount: value === 0 ? "0" : "", unit: "minutes" };
  }
  if (value % 86400 === 0) return { amount: String(value / 86400), unit: "days" };
  if (value % 3600 === 0) return { amount: String(value / 3600), unit: "hours" };
  if (value % 60 === 0) return { amount: String(value / 60), unit: "minutes" };
  return { amount: String(value), unit: "seconds" };
}

export function durationToSeconds(amount, unit) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (unit === "days") return Math.round(value * 86400);
  if (unit === "hours") return Math.round(value * 3600);
  if (unit === "minutes") return Math.round(value * 60);
  return Math.round(value);
}

export function ensureStageRules(stageRules) {
  const rules =
    stageRules && typeof stageRules === "object"
      ? structuredCloneSafe(stageRules)
      : structuredCloneSafe(DEFAULT_STAGE_RULES);

  return {
    ...structuredCloneSafe(DEFAULT_STAGE_RULES),
    ...rules,
    stages: rules.stages && typeof rules.stages === "object" ? rules.stages : {},
    defaults:
      rules.defaults && typeof rules.defaults === "object"
        ? rules.defaults
        : structuredCloneSafe(DEFAULT_STAGE_RULES.defaults),
    stage_order: Array.isArray(rules.stage_order) ? rules.stage_order : [],
  };
}

export function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function getStageLabel(stage) {
  return getOptionLabel(SLA_STAGE_OPTIONS, stage, formatKeyLabel(stage));
}

export function getScopeParts(config) {
  const parts = [];
  const serviceType = config?.service_type || ALL_SERVICE_TYPE_VALUE;
  const fields = [
    ["Device", serviceType === ALL_SERVICE_TYPE_VALUE ? "All" : formatKeyLabel(serviceType)],
    ["Source", getOptionLabel(SOURCE_CHANNEL_OPTIONS, config?.source_channel || ALL_SCOPE_VALUE)],
    ["Workflow", getOptionLabel(WORKFLOW_TYPE_OPTIONS, config?.workflow_type || ALL_SCOPE_VALUE)],
    ["Group", getOptionLabel(JOB_GROUP_TYPE_OPTIONS, config?.job_group_type || ALL_SCOPE_VALUE)],
    ["City", config?.customer_city || "All"],
    ["Region", config?.region || "All"],
    ["Coverage", config?.coverage_type || "All"],
  ];

  fields.forEach(([label, value]) => {
    if (value && value !== "All") parts.push(`${label}: ${value}`);
  });

  return parts.length ? parts : ["Default catch-all"];
}

export function summarizeScope(config) {
  return getScopeParts(config).join(" | ");
}

export function makeEmptyStageRule() {
  return {
    deadline_mode: {
      type: "fixed_ttl",
      ttl_seconds: 3600,
    },
    reminders: [],
    reassignment_eligible: false,
  };
}

export function makeEmptyReminder(nextSequence = 1) {
  return {
    type: "at_seconds_from_start",
    target: "technician",
    seconds: 300,
    channels: ["push", "in_app"],
    sequence: nextSequence,
  };
}

export function makeEmptyExtensionPolicy() {
  return {
    allowed: true,
    reasons: ["OTHER"],
    max_requests: 1,
    approval_mode: "auto",
    options_seconds: [300, 600, 900],
    other_requires_note: true,
    pause_reassignment_seconds: 300,
    max_total_extension_seconds: 900,
  };
}

export function createBaseConfigPayload(source = {}) {
  return {
    name: source.name || "",
    service_type: source.service_type || ALL_SERVICE_TYPE_VALUE,
    customer_city: source.customer_city || "",
    source_channel: source.source_channel || "",
    workflow_type: source.workflow_type || "",
    job_group_type: source.job_group_type || "",
    coverage_type: source.coverage_type || "",
    merchant_id: source.merchant_id ?? null,
    region: source.region || "",
    enabled_transitions: Array.isArray(source.enabled_transitions)
      ? source.enabled_transitions
      : [],
    default_ttl_seconds: Number(source.default_ttl_seconds || 3600),
    transition_ttl_seconds:
      source.transition_ttl_seconds && typeof source.transition_ttl_seconds === "object"
        ? source.transition_ttl_seconds
        : {},
    reminder_offsets: Array.isArray(source.reminder_offsets) ? source.reminder_offsets : [],
    escalation_targets: Array.isArray(source.escalation_targets)
      ? source.escalation_targets
      : [],
    escalation_actions:
      source.escalation_actions && typeof source.escalation_actions === "object"
        ? source.escalation_actions
        : {},
    template_name: source.template_name || "emails/sla_reminder.html",
    version: Number(source.version || 1),
    is_default: Boolean(source.is_default),
    is_active: Boolean(source.is_active),
    stage_rules: ensureStageRules(source.stage_rules),
    effective_from: source.effective_from || null,
    effective_to: source.effective_to || null,
    max_reassignments: Number(source.max_reassignments || 0),
    allowed_reassign_states: Array.isArray(source.allowed_reassign_states)
      ? source.allowed_reassign_states
      : [],
    allowed_extension_states: Array.isArray(source.allowed_extension_states)
      ? source.allowed_extension_states
      : [],
  };
}

export function cleanConfigPayload(payload) {
  const cleaned = createBaseConfigPayload(payload);
  cleaned.is_active = Boolean(payload?.is_active);
  cleaned.version = Number(payload?.version || 1);
  cleaned.default_ttl_seconds = Number(payload?.default_ttl_seconds || 0);
  cleaned.max_reassignments = Number(payload?.max_reassignments || 0);

  if (!cleaned.name.trim()) {
    cleaned.name = "Untitled SLA";
  }

  if (!cleaned.service_type) {
    cleaned.service_type = ALL_SERVICE_TYPE_VALUE;
  }

  return cleaned;
}
