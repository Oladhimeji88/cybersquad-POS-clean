import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Loader2, X, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

const CURRENCY_OPTIONS = ["NGN", "USD", "GBP", "EUR"];

const DEFAULT_CONFIG = {
  // Commission & Payouts
  commission_percentage: "",
  payout_batch_days: "",
  payout_hold_period_days: "",
  automated_disbursement: false,
  auto_refund_on_auto_cancel: false,

  // Disputes
  dispute_response_window_hours: "",
  dispute_window_days: "",

  // Job Offers & Auto-Close
  auto_close_max_broadcasts: "",
  offer_ttl_minutes: "",
  reoffer_ttl_minutes: "",
  offer_response_reminder_minutes: "",
  auto_close_action: "escalate",
  auto_offer_jobs: false,
  auto_close_unaccepted_jobs: false,
  allow_occupied_technician_admin_offers: false,

  // Escalation
  escalation_assignment_sla_hours: "",
  escalation_auto_cancel_hours: "",
  auto_cancel_on_escalation_timeout: false,

  // Walk-in
  walkin_auto_assign_enabled: false,
  walkin_repair_payment_requires_quote_accept: false,
  walkin_diagnosis_fee_enabled: false,
  default_diagnosis_fee: "",
  default_diagnosis_fee_currency: "NGN",
  walkin_allow_installments: false,

  // Shipping
  default_shipping_fee: "",
  default_shipping_currency: "NGN",

  // Demurrage
  demurrage_fee_enabled: false,
  demurrage_grace_hours: "",
  default_demurrage_fee: "",
  default_demurrage_fee_currency: "NGN",

  // Repair Operating Hours
  repairs_operating_start: "",
  repairs_operating_end: "",
  repairs_timezone: "",
  repairs_same_day_only: false,
  repairs_rollover_after_close: false,

  // Customer Booking Window
  customer_booking_window_enabled: false,
  customer_booking_window_start: "",
  customer_booking_window_end: "",
  customer_booking_timezone: "",

  // Access Restrictions
  restrict_walkin_to_assigned_store: false,
  restrict_engineer_to_walkin_only: false,
  restrict_technician_to_self_service_only: false,
  require_engineer_walkin_ops_approval: false,

  // ETA
  eta_avg_speed_kmh_default: "",

  // Notifications & Integrations
  frontend_url: "",
  frontend_password_reset_path: "",
  use_frontend_password_reset: false,
  sme_email: "",
  technician_lead_welcome_form_url: "",
  newsletter_confirmation_link: "",
  ops_alert_emails: [],
  auto_admin_subscribe: false,
};

const asString = (v) => (v === null || v === undefined ? "" : String(v));
const asBool = (v) => Boolean(v);
const asArray = (v) => (Array.isArray(v) ? v : []);

// Backend returns "HH:MM:SS" but <input type="time"> uses "HH:MM"
const timeToInput = (v) => {
  if (!v) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.substring(0, 5);
  return v;
};

const inputToTime = (v) => {
  if (!v) return "";
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
};

// Convert form value to number for payload; empty becomes null so backend keeps existing
const numOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const mapResponseToConfig = (data) => ({
  commission_percentage: asString(data.commission_percentage),
  payout_batch_days: asString(data.payout_batch_days),
  payout_hold_period_days: asString(data.payout_hold_period_days),
  automated_disbursement: asBool(data.automated_disbursement),
  auto_refund_on_auto_cancel: asBool(data.auto_refund_on_auto_cancel),

  dispute_response_window_hours: asString(data.dispute_response_window_hours),
  dispute_window_days: asString(data.dispute_window_days),

  auto_close_max_broadcasts: asString(data.auto_close_max_broadcasts),
  offer_ttl_minutes: asString(data.offer_ttl_minutes),
  reoffer_ttl_minutes: asString(data.reoffer_ttl_minutes),
  offer_response_reminder_minutes: asString(
    data.offer_response_reminder_minutes,
  ),
  auto_close_action: data.auto_close_action || "escalate",
  auto_offer_jobs: asBool(data.auto_offer_jobs),
  auto_close_unaccepted_jobs: asBool(data.auto_close_unaccepted_jobs),
  allow_occupied_technician_admin_offers: asBool(
    data.allow_occupied_technician_admin_offers,
  ),

  escalation_assignment_sla_hours: asString(
    data.escalation_assignment_sla_hours,
  ),
  escalation_auto_cancel_hours: asString(data.escalation_auto_cancel_hours),
  auto_cancel_on_escalation_timeout: asBool(
    data.auto_cancel_on_escalation_timeout,
  ),

  walkin_auto_assign_enabled: asBool(data.walkin_auto_assign_enabled),
  walkin_repair_payment_requires_quote_accept: asBool(
    data.walkin_repair_payment_requires_quote_accept,
  ),
  walkin_diagnosis_fee_enabled: asBool(data.walkin_diagnosis_fee_enabled),
  default_diagnosis_fee: asString(data.default_diagnosis_fee),
  default_diagnosis_fee_currency:
    data.default_diagnosis_fee_currency || "NGN",
  walkin_allow_installments: asBool(data.walkin_allow_installments),

  default_shipping_fee: asString(data.default_shipping_fee),
  default_shipping_currency: data.default_shipping_currency || "NGN",

  demurrage_fee_enabled: asBool(data.demurrage_fee_enabled),
  demurrage_grace_hours: asString(data.demurrage_grace_hours),
  default_demurrage_fee: asString(data.default_demurrage_fee),
  default_demurrage_fee_currency:
    data.default_demurrage_fee_currency || "NGN",

  repairs_operating_start: timeToInput(data.repairs_operating_start),
  repairs_operating_end: timeToInput(data.repairs_operating_end),
  repairs_timezone: asString(data.repairs_timezone),
  repairs_same_day_only: asBool(data.repairs_same_day_only),
  repairs_rollover_after_close: asBool(data.repairs_rollover_after_close),

  customer_booking_window_enabled: asBool(data.customer_booking_window_enabled),
  customer_booking_window_start: timeToInput(data.customer_booking_window_start),
  customer_booking_window_end: timeToInput(data.customer_booking_window_end),
  customer_booking_timezone: asString(data.customer_booking_timezone),

  restrict_walkin_to_assigned_store: asBool(
    data.restrict_walkin_to_assigned_store,
  ),
  restrict_engineer_to_walkin_only: asBool(
    data.restrict_engineer_to_walkin_only,
  ),
  restrict_technician_to_self_service_only: asBool(
    data.restrict_technician_to_self_service_only,
  ),
  require_engineer_walkin_ops_approval: asBool(
    data.require_engineer_walkin_ops_approval,
  ),

  eta_avg_speed_kmh_default: asString(data.eta_avg_speed_kmh_default),

  frontend_url: asString(data.frontend_url),
  frontend_password_reset_path: asString(data.frontend_password_reset_path),
  use_frontend_password_reset: asBool(data.use_frontend_password_reset),
  sme_email: asString(data.sme_email),
  technician_lead_welcome_form_url: asString(
    data.technician_lead_welcome_form_url,
  ),
  newsletter_confirmation_link: asString(data.newsletter_confirmation_link),
  ops_alert_emails: asArray(data.ops_alert_emails),
  auto_admin_subscribe: asBool(data.auto_admin_subscribe),
});

const buildPayload = (c) => {
  const payload = {
    commission_percentage: c.commission_percentage,
    payout_batch_days: numOrNull(c.payout_batch_days),
    payout_hold_period_days: numOrNull(c.payout_hold_period_days),
    automated_disbursement: c.automated_disbursement,
    auto_refund_on_auto_cancel: c.auto_refund_on_auto_cancel,

    dispute_response_window_hours: numOrNull(c.dispute_response_window_hours),
    dispute_window_days: numOrNull(c.dispute_window_days),

    auto_close_max_broadcasts: numOrNull(c.auto_close_max_broadcasts),
    offer_ttl_minutes: numOrNull(c.offer_ttl_minutes),
    reoffer_ttl_minutes: numOrNull(c.reoffer_ttl_minutes),
    offer_response_reminder_minutes: numOrNull(
      c.offer_response_reminder_minutes,
    ),
    auto_close_action: c.auto_close_action,
    auto_offer_jobs: c.auto_offer_jobs,
    auto_close_unaccepted_jobs: c.auto_close_unaccepted_jobs,
    allow_occupied_technician_admin_offers:
      c.allow_occupied_technician_admin_offers,

    escalation_assignment_sla_hours: numOrNull(
      c.escalation_assignment_sla_hours,
    ),
    escalation_auto_cancel_hours: numOrNull(c.escalation_auto_cancel_hours),
    auto_cancel_on_escalation_timeout: c.auto_cancel_on_escalation_timeout,

    walkin_auto_assign_enabled: c.walkin_auto_assign_enabled,
    walkin_repair_payment_requires_quote_accept:
      c.walkin_repair_payment_requires_quote_accept,
    walkin_diagnosis_fee_enabled: c.walkin_diagnosis_fee_enabled,
    default_diagnosis_fee: c.default_diagnosis_fee,
    default_diagnosis_fee_currency: c.default_diagnosis_fee_currency,
    walkin_allow_installments: c.walkin_allow_installments,

    default_shipping_fee: c.default_shipping_fee,
    default_shipping_currency: c.default_shipping_currency,

    demurrage_fee_enabled: c.demurrage_fee_enabled,
    demurrage_grace_hours: numOrNull(c.demurrage_grace_hours),
    default_demurrage_fee: c.default_demurrage_fee,
    default_demurrage_fee_currency: c.default_demurrage_fee_currency,

    repairs_operating_start: inputToTime(c.repairs_operating_start),
    repairs_operating_end: inputToTime(c.repairs_operating_end),
    repairs_timezone: c.repairs_timezone,
    repairs_same_day_only: c.repairs_same_day_only,
    repairs_rollover_after_close: c.repairs_rollover_after_close,

    customer_booking_window_enabled: c.customer_booking_window_enabled,
    customer_booking_window_start: inputToTime(c.customer_booking_window_start),
    customer_booking_window_end: inputToTime(c.customer_booking_window_end),
    customer_booking_timezone: c.customer_booking_timezone,

    restrict_walkin_to_assigned_store: c.restrict_walkin_to_assigned_store,
    restrict_engineer_to_walkin_only: c.restrict_engineer_to_walkin_only,
    restrict_technician_to_self_service_only:
      c.restrict_technician_to_self_service_only,
    require_engineer_walkin_ops_approval: c.require_engineer_walkin_ops_approval,

    eta_avg_speed_kmh_default: numOrNull(c.eta_avg_speed_kmh_default),

    frontend_url: c.frontend_url,
    frontend_password_reset_path: c.frontend_password_reset_path,
    use_frontend_password_reset: c.use_frontend_password_reset,
    sme_email: c.sme_email,
    technician_lead_welcome_form_url: c.technician_lead_welcome_form_url,
    newsletter_confirmation_link: c.newsletter_confirmation_link,
    ops_alert_emails: c.ops_alert_emails,
    auto_admin_subscribe: c.auto_admin_subscribe,
  };

  // Strip nulls so we don't overwrite valid backend values with empties
  Object.keys(payload).forEach((k) => {
    if (payload[k] === null) delete payload[k];
  });

  return payload;
};

// Local UI helpers
const fieldColumn = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const sectionHeaderStyle = {
  fontSize: "15px",
  fontWeight: "600",
  color: "#0F172A",
  margin: 0,
};

const sectionDescStyle = {
  fontSize: "12px",
  color: "#64748B",
  margin: "4px 0 0 0",
};

const toggleRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
};

function Section({ title, description, children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        paddingTop: "8px",
      }}
    >
      <div
        style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "8px" }}
      >
        <h3 style={sectionHeaderStyle}>{title}</h3>
        {description && <p style={sectionDescStyle}>{description}</p>}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {children}
      </div>
    </div>
  );
}

function TextField({ label, hint, ...inputProps }) {
  return (
    <div style={fieldColumn}>
      <Label htmlFor={inputProps.id}>{label}</Label>
      {hint && <p style={{ ...sectionDescStyle, marginTop: 0 }}>{hint}</p>}
      <Input {...inputProps} />
    </div>
  );
}

function CurrencyAmountField({
  label,
  amountValue,
  currencyValue,
  onAmountChange,
  onCurrencyChange,
  hint,
  id,
}) {
  return (
    <div style={fieldColumn}>
      <Label htmlFor={id}>{label}</Label>
      {hint && <p style={{ ...sectionDescStyle, marginTop: 0 }}>{hint}</p>}
      <div style={{ display: "flex", gap: "8px" }}>
        <Input
          id={id}
          type="number"
          step="0.01"
          value={amountValue}
          onChange={(e) => onAmountChange(e.target.value)}
          style={{ flex: 1 }}
        />
        <Select value={currencyValue} onValueChange={onCurrencyChange}>
          <SelectTrigger style={{ width: "110px" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_OPTIONS.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ToggleField({ label, hint, checked, onChange, id }) {
  return (
    <div style={toggleRowStyle}>
      <div style={{ flex: 1 }}>
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p style={{ ...sectionDescStyle, marginTop: "4px" }}>{hint}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SystemSettings() {
  const { api } = useApi();

  const [activeTab, setActiveTab] = useState("platform");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [emailInput, setEmailInput] = useState("");

  const updateField = (key, value) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await api.get("/platform/config/");
        const data = res?.data?.result?.[0] || {};
        setConfig(mapResponseToConfig(data));
      } catch (error) {
        console.error("Error fetching config:", error);
        toast.error("Failed to load configuration");
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleAddEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (config.ops_alert_emails.includes(trimmed)) {
      toast.error("Email already added");
      return;
    }

    setConfig((prev) => ({
      ...prev,
      ops_alert_emails: [...prev.ops_alert_emails, trimmed],
    }));
    setEmailInput("");
  };

  const handleRemoveEmail = (email) => {
    setConfig((prev) => ({
      ...prev,
      ops_alert_emails: prev.ops_alert_emails.filter((e) => e !== email),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(config);
      const res = await api.patch("/platform/config/update_current/", payload);
      const updated = res?.data?.result || {};
      setConfig(mapResponseToConfig(updated));
      toast.success("Platform configuration updated successfully");
    } catch (error) {
      console.error("Error saving config:", error);
      toast.error("Failed to update configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>System Settings</h1>
        <p className="text-muted-foreground">Manage system configurations</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div
          className="hidden lg:block"
          style={{ width: "200px", flexShrink: 0 }}
        >
          <Card>
            <CardContent style={{ padding: "16px" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div
                  onClick={() => setActiveTab("platform")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    background:
                      activeTab === "platform" ? "#F8F4FF" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <SettingsIcon
                    style={{
                      width: "16px",
                      height: "16px",
                      color:
                        activeTab === "platform" ? "#7C3AED" : "#64748B",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: activeTab === "platform" ? "500" : "400",
                      color:
                        activeTab === "platform" ? "#7C3AED" : "#64748B",
                    }}
                  >
                    Platform Config Settings
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle>Platform Configuration Settings</CardTitle>
              <CardDescription>
                Manage platform-wide configuration and operational settings
              </CardDescription>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "48px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#64748B",
                    }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span style={{ fontSize: "14px" }}>
                      Loading configuration...
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "32px",
                  }}
                >
                  <Section
                    title="Commission & Payouts"
                    description="Platform commission and payout cadence"
                  >
                    <TextField
                      id="commission"
                      label="Commission Percentage (%)"
                      type="number"
                      step="0.01"
                      value={config.commission_percentage}
                      onChange={(e) =>
                        updateField("commission_percentage", e.target.value)
                      }
                    />
                    <TextField
                      id="payout_days"
                      label="Payout Batch Days"
                      type="number"
                      value={config.payout_batch_days}
                      onChange={(e) =>
                        updateField("payout_batch_days", e.target.value)
                      }
                    />
                    <TextField
                      id="payout_hold"
                      label="Payout Hold Period (Days)"
                      hint="How long funds are held before becoming eligible for payout"
                      type="number"
                      value={config.payout_hold_period_days}
                      onChange={(e) =>
                        updateField("payout_hold_period_days", e.target.value)
                      }
                    />
                    <ToggleField
                      id="automated_disbursement"
                      label="Automated Disbursement"
                      hint="Automatically disburse eligible payouts on each batch run"
                      checked={config.automated_disbursement}
                      onChange={(v) => updateField("automated_disbursement", v)}
                    />
                    <ToggleField
                      id="auto_refund_on_auto_cancel"
                      label="Auto Refund on Auto Cancel"
                      hint="Issue refunds automatically when jobs are auto-cancelled"
                      checked={config.auto_refund_on_auto_cancel}
                      onChange={(v) =>
                        updateField("auto_refund_on_auto_cancel", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Disputes"
                    description="Dispute response and overall window"
                  >
                    <TextField
                      id="dispute_hours"
                      label="Dispute Response Window (Hours)"
                      type="number"
                      value={config.dispute_response_window_hours}
                      onChange={(e) =>
                        updateField(
                          "dispute_response_window_hours",
                          e.target.value,
                        )
                      }
                    />
                    <TextField
                      id="dispute_days"
                      label="Dispute Window (Days)"
                      hint="Maximum days after a job is closed during which a dispute can be opened"
                      type="number"
                      value={config.dispute_window_days}
                      onChange={(e) =>
                        updateField("dispute_window_days", e.target.value)
                      }
                    />
                  </Section>

                  <Section
                    title="Job Offers & Auto-Close"
                    description="Controls for offering jobs to technicians and what happens when offers are not accepted"
                  >
                    <TextField
                      id="max_broadcasts"
                      label="Auto Close Max Broadcasts"
                      type="number"
                      value={config.auto_close_max_broadcasts}
                      onChange={(e) =>
                        updateField(
                          "auto_close_max_broadcasts",
                          e.target.value,
                        )
                      }
                    />
                    <TextField
                      id="offer_ttl"
                      label="Offer TTL (Minutes)"
                      type="number"
                      value={config.offer_ttl_minutes}
                      onChange={(e) =>
                        updateField("offer_ttl_minutes", e.target.value)
                      }
                    />
                    <TextField
                      id="reoffer_ttl"
                      label="Reoffer TTL (Minutes)"
                      type="number"
                      value={config.reoffer_ttl_minutes}
                      onChange={(e) =>
                        updateField("reoffer_ttl_minutes", e.target.value)
                      }
                    />
                    <TextField
                      id="reminder_minutes"
                      label="Offer Response Reminder (Minutes)"
                      type="number"
                      value={config.offer_response_reminder_minutes}
                      onChange={(e) =>
                        updateField(
                          "offer_response_reminder_minutes",
                          e.target.value,
                        )
                      }
                    />
                    <div style={fieldColumn}>
                      <Label htmlFor="auto_close_action">
                        Auto Close Action
                      </Label>
                      <Select
                        value={config.auto_close_action}
                        onValueChange={(v) =>
                          updateField("auto_close_action", v)
                        }
                      >
                        <SelectTrigger id="auto_close_action">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="escalate">Escalate</SelectItem>
                          <SelectItem value="reoffer">Reoffer</SelectItem>
                          <SelectItem value="cancel">Cancel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <ToggleField
                      id="auto_offer_jobs"
                      label="Auto Offer Jobs"
                      hint="Automatically broadcast jobs to eligible technicians"
                      checked={config.auto_offer_jobs}
                      onChange={(v) => updateField("auto_offer_jobs", v)}
                    />
                    <ToggleField
                      id="auto_close_unaccepted"
                      label="Auto Close Unaccepted Jobs"
                      hint="Apply the auto-close action when jobs reach the max broadcast count"
                      checked={config.auto_close_unaccepted_jobs}
                      onChange={(v) =>
                        updateField("auto_close_unaccepted_jobs", v)
                      }
                    />
                    <ToggleField
                      id="allow_occupied_admin_offers"
                      label="Allow Admin Offers to Occupied Technicians"
                      hint="Admins can manually offer jobs to technicians who already have an active job"
                      checked={config.allow_occupied_technician_admin_offers}
                      onChange={(v) =>
                        updateField(
                          "allow_occupied_technician_admin_offers",
                          v,
                        )
                      }
                    />
                  </Section>

                  <Section
                    title="Escalation"
                    description="SLAs and auto-cancel behaviour when assignment escalates"
                  >
                    <TextField
                      id="escalation_sla"
                      label="Escalation Assignment SLA (Hours)"
                      hint="Time ops has to assign an escalated job before further action"
                      type="number"
                      value={config.escalation_assignment_sla_hours}
                      onChange={(e) =>
                        updateField(
                          "escalation_assignment_sla_hours",
                          e.target.value,
                        )
                      }
                    />
                    <TextField
                      id="escalation_auto_cancel_hours"
                      label="Escalation Auto Cancel (Hours)"
                      hint="Hours after escalation before the job is auto-cancelled"
                      type="number"
                      value={config.escalation_auto_cancel_hours}
                      onChange={(e) =>
                        updateField(
                          "escalation_auto_cancel_hours",
                          e.target.value,
                        )
                      }
                    />
                    <ToggleField
                      id="auto_cancel_on_escalation_timeout"
                      label="Auto Cancel on Escalation Timeout"
                      hint="Automatically cancel jobs when the escalation timeout is reached"
                      checked={config.auto_cancel_on_escalation_timeout}
                      onChange={(v) =>
                        updateField("auto_cancel_on_escalation_timeout", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Walk-in Settings"
                    description="Behaviour for jobs created at physical store locations"
                  >
                    <ToggleField
                      id="walkin_auto_assign_enabled"
                      label="Walk-in Auto Assign"
                      hint="Automatically assign walk-in jobs to available engineers at the store"
                      checked={config.walkin_auto_assign_enabled}
                      onChange={(v) =>
                        updateField("walkin_auto_assign_enabled", v)
                      }
                    />
                    <ToggleField
                      id="walkin_repair_payment_requires_quote_accept"
                      label="Repair Payment Requires Quote Acceptance"
                      hint="Customer must accept the quote before repair payment can be collected"
                      checked={
                        config.walkin_repair_payment_requires_quote_accept
                      }
                      onChange={(v) =>
                        updateField(
                          "walkin_repair_payment_requires_quote_accept",
                          v,
                        )
                      }
                    />
                    <ToggleField
                      id="walkin_diagnosis_fee_enabled"
                      label="Charge Diagnosis Fee"
                      hint="Collect a diagnosis fee for walk-in jobs"
                      checked={config.walkin_diagnosis_fee_enabled}
                      onChange={(v) =>
                        updateField("walkin_diagnosis_fee_enabled", v)
                      }
                    />
                    <CurrencyAmountField
                      id="default_diagnosis_fee"
                      label="Default Diagnosis Fee"
                      amountValue={config.default_diagnosis_fee}
                      currencyValue={config.default_diagnosis_fee_currency}
                      onAmountChange={(v) =>
                        updateField("default_diagnosis_fee", v)
                      }
                      onCurrencyChange={(v) =>
                        updateField("default_diagnosis_fee_currency", v)
                      }
                    />
                    <ToggleField
                      id="walkin_allow_installments"
                      label="Allow Installments"
                      hint="Customers can pay for walk-in repairs in installments"
                      checked={config.walkin_allow_installments}
                      onChange={(v) =>
                        updateField("walkin_allow_installments", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Shipping"
                    description="Default shipping fee for jobs that require delivery"
                  >
                    <CurrencyAmountField
                      id="default_shipping_fee"
                      label="Default Shipping Fee"
                      amountValue={config.default_shipping_fee}
                      currencyValue={config.default_shipping_currency}
                      onAmountChange={(v) =>
                        updateField("default_shipping_fee", v)
                      }
                      onCurrencyChange={(v) =>
                        updateField("default_shipping_currency", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Demurrage"
                    description="Fees for devices left uncollected after a grace period"
                  >
                    <ToggleField
                      id="demurrage_fee_enabled"
                      label="Demurrage Fee Enabled"
                      checked={config.demurrage_fee_enabled}
                      onChange={(v) =>
                        updateField("demurrage_fee_enabled", v)
                      }
                    />
                    <TextField
                      id="demurrage_grace_hours"
                      label="Grace Period (Hours)"
                      hint="Hours after job completion before demurrage starts accruing"
                      type="number"
                      value={config.demurrage_grace_hours}
                      onChange={(e) =>
                        updateField("demurrage_grace_hours", e.target.value)
                      }
                    />
                    <CurrencyAmountField
                      id="default_demurrage_fee"
                      label="Default Demurrage Fee"
                      amountValue={config.default_demurrage_fee}
                      currencyValue={config.default_demurrage_fee_currency}
                      onAmountChange={(v) =>
                        updateField("default_demurrage_fee", v)
                      }
                      onCurrencyChange={(v) =>
                        updateField("default_demurrage_fee_currency", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Repair Operating Hours"
                    description="When repair work can be scheduled"
                  >
                    <TextField
                      id="repairs_operating_start"
                      label="Operating Hours Start"
                      type="time"
                      value={config.repairs_operating_start}
                      onChange={(e) =>
                        updateField("repairs_operating_start", e.target.value)
                      }
                    />
                    <TextField
                      id="repairs_operating_end"
                      label="Operating Hours End"
                      type="time"
                      value={config.repairs_operating_end}
                      onChange={(e) =>
                        updateField("repairs_operating_end", e.target.value)
                      }
                    />
                    <TextField
                      id="repairs_timezone"
                      label="Timezone"
                      hint="e.g. Africa/Lagos. Leave blank to use platform default"
                      type="text"
                      value={config.repairs_timezone}
                      onChange={(e) =>
                        updateField("repairs_timezone", e.target.value)
                      }
                      placeholder="Africa/Lagos"
                    />
                    <ToggleField
                      id="repairs_same_day"
                      label="Repairs Same Day Only"
                      hint="Restrict repair bookings to the current day"
                      checked={config.repairs_same_day_only}
                      onChange={(v) =>
                        updateField("repairs_same_day_only", v)
                      }
                    />
                    <ToggleField
                      id="repairs_rollover"
                      label="Rollover After Close"
                      hint="Roll late requests over to the next operating day instead of rejecting"
                      checked={config.repairs_rollover_after_close}
                      onChange={(v) =>
                        updateField("repairs_rollover_after_close", v)
                      }
                    />
                  </Section>

                  <Section
                    title="Customer Booking Window"
                    description="When customers are allowed to book jobs through the app"
                  >
                    <ToggleField
                      id="customer_booking_window_enabled"
                      label="Enforce Booking Window"
                      checked={config.customer_booking_window_enabled}
                      onChange={(v) =>
                        updateField("customer_booking_window_enabled", v)
                      }
                    />
                    <TextField
                      id="customer_booking_window_start"
                      label="Booking Window Start"
                      type="time"
                      value={config.customer_booking_window_start}
                      onChange={(e) =>
                        updateField(
                          "customer_booking_window_start",
                          e.target.value,
                        )
                      }
                    />
                    <TextField
                      id="customer_booking_window_end"
                      label="Booking Window End"
                      type="time"
                      value={config.customer_booking_window_end}
                      onChange={(e) =>
                        updateField(
                          "customer_booking_window_end",
                          e.target.value,
                        )
                      }
                    />
                    <TextField
                      id="customer_booking_timezone"
                      label="Timezone"
                      hint="e.g. Africa/Lagos. Leave blank to use platform default"
                      type="text"
                      value={config.customer_booking_timezone}
                      onChange={(e) =>
                        updateField(
                          "customer_booking_timezone",
                          e.target.value,
                        )
                      }
                      placeholder="Africa/Lagos"
                    />
                  </Section>

                  <Section
                    title="Access Restrictions"
                    description="Limit what walk-in engineers and technicians can do"
                  >
                    <ToggleField
                      id="restrict_walkin_to_assigned_store"
                      label="Restrict Walk-in Engineers to Assigned Store"
                      checked={config.restrict_walkin_to_assigned_store}
                      onChange={(v) =>
                        updateField("restrict_walkin_to_assigned_store", v)
                      }
                    />
                    <ToggleField
                      id="restrict_engineer_to_walkin_only"
                      label="Restrict Engineers to Walk-in Jobs Only"
                      checked={config.restrict_engineer_to_walkin_only}
                      onChange={(v) =>
                        updateField("restrict_engineer_to_walkin_only", v)
                      }
                    />
                    <ToggleField
                      id="restrict_technician_to_self_service_only"
                      label="Restrict Technicians to Self-Service Only"
                      checked={config.restrict_technician_to_self_service_only}
                      onChange={(v) =>
                        updateField(
                          "restrict_technician_to_self_service_only",
                          v,
                        )
                      }
                    />
                    <ToggleField
                      id="require_engineer_walkin_ops_approval"
                      label="Require Ops Approval for Walk-in Engineer Actions"
                      checked={config.require_engineer_walkin_ops_approval}
                      onChange={(v) =>
                        updateField(
                          "require_engineer_walkin_ops_approval",
                          v,
                        )
                      }
                    />
                  </Section>

                  <Section
                    title="ETA"
                    description="Defaults for ETA calculation"
                  >
                    <TextField
                      id="eta_speed"
                      label="ETA Average Speed (km/h)"
                      type="number"
                      value={config.eta_avg_speed_kmh_default}
                      onChange={(e) =>
                        updateField(
                          "eta_avg_speed_kmh_default",
                          e.target.value,
                        )
                      }
                    />
                  </Section>

                  <Section
                    title="Notifications & Integrations"
                    description="Frontend links, system emails, and ops alerts"
                  >
                    <TextField
                      id="frontend_url"
                      label="Frontend URL"
                      type="text"
                      value={config.frontend_url}
                      onChange={(e) =>
                        updateField("frontend_url", e.target.value)
                      }
                      placeholder="https://admin.cybersquadapp.com/"
                    />
                    <TextField
                      id="reset_path"
                      label="Frontend Password Reset Path"
                      type="text"
                      value={config.frontend_password_reset_path}
                      onChange={(e) =>
                        updateField(
                          "frontend_password_reset_path",
                          e.target.value,
                        )
                      }
                      placeholder="/auth/reset-password"
                    />
                    <ToggleField
                      id="use_frontend_password_reset"
                      label="Use Frontend Password Reset"
                      hint="Send users to the frontend reset page instead of the backend default"
                      checked={config.use_frontend_password_reset}
                      onChange={(v) =>
                        updateField("use_frontend_password_reset", v)
                      }
                    />
                    <TextField
                      id="sme_email"
                      label="SME Support Email"
                      type="email"
                      value={config.sme_email}
                      onChange={(e) =>
                        updateField("sme_email", e.target.value)
                      }
                      placeholder="support@example.com"
                    />
                    <TextField
                      id="technician_lead_welcome_form_url"
                      label="Technician Lead Welcome Form URL"
                      type="text"
                      value={config.technician_lead_welcome_form_url}
                      onChange={(e) =>
                        updateField(
                          "technician_lead_welcome_form_url",
                          e.target.value,
                        )
                      }
                      placeholder="https://forms.gle/..."
                    />
                    <TextField
                      id="newsletter_confirmation_link"
                      label="Newsletter Confirmation Link"
                      type="text"
                      value={config.newsletter_confirmation_link}
                      onChange={(e) =>
                        updateField(
                          "newsletter_confirmation_link",
                          e.target.value,
                        )
                      }
                    />
                    <ToggleField
                      id="auto_admin_subscribe"
                      label="Auto Subscribe New Admins"
                      hint="Newly created admins are subscribed to ops notifications by default"
                      checked={config.auto_admin_subscribe}
                      onChange={(v) =>
                        updateField("auto_admin_subscribe", v)
                      }
                    />

                    <div style={fieldColumn}>
                      <Label>Operations Alert Emails</Label>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#64748B",
                          marginBottom: "8px",
                        }}
                      >
                        Email addresses that will receive escalation messages
                      </p>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginBottom: "12px",
                        }}
                      >
                        <Input
                          placeholder="Enter email address"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddEmail();
                            }
                          }}
                        />
                        <Button type="button" onClick={handleAddEmail}>
                          Add
                        </Button>
                      </div>

                      {config.ops_alert_emails.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          {config.ops_alert_emails.map((email) => (
                            <div
                              key={email}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 12px",
                                background: "#F1F5F9",
                                borderRadius: "6px",
                                fontSize: "14px",
                              }}
                            >
                              <span>{email}</span>
                              <button
                                onClick={() => handleRemoveEmail(email)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  padding: "0",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <X
                                  style={{
                                    width: "14px",
                                    height: "14px",
                                    color: "#64748B",
                                  }}
                                />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      paddingTop: "16px",
                    }}
                  >
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        width: "122px",
                        height: "36px",
                        borderRadius: "7px",
                        padding: "6px 10px",
                        boxShadow: "0px 4px 19px 0px #B58BFF",
                        background: "#7C3AED",
                        color: "#FFFFFF",
                        border: "none",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.7 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
