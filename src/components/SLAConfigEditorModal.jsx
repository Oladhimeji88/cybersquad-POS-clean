import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useDeviceCategories } from "../hooks/useDeviceCategories";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
  ALL_SERVICE_TYPE_VALUE,
  CHANNEL_OPTIONS,
  DEADLINE_MODE_OPTIONS,
  EXTENSION_REASON_OPTIONS,
  JOB_GROUP_TYPE_OPTIONS,
  REMINDER_KIND_OPTIONS,
  REMINDER_TARGET_OPTIONS,
  REMINDER_TYPE_OPTIONS,
  SLA_STAGE_OPTIONS,
  SOURCE_CHANNEL_OPTIONS,
  WORKFLOW_TYPE_OPTIONS,
  cleanConfigPayload,
  createBaseConfigPayload,
  durationToSeconds,
  ensureStageRules,
  formatSeconds,
  getOptionLabel,
  getScopeParts,
  getStageLabel,
  makeEmptyExtensionPolicy,
  makeEmptyReminder,
  makeEmptyStageRule,
  splitSeconds,
  structuredCloneSafe,
} from "../lib/slaConfig";

const ALL_SELECT_VALUE = "__all__";
const STEPS = [
  { id: "scope", label: "Scope" },
  { id: "stages", label: "Stage Rules" },
  { id: "review", label: "Review" },
];

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function toSelectValue(value) {
  return value || ALL_SELECT_VALUE;
}

function fromSelectValue(value) {
  return value === ALL_SELECT_VALUE ? "" : value;
}

function extractConfig(response) {
  return (
    response?.data?.result?.config ||
    response?.data?.result ||
    response?.data?.config ||
    null
  );
}

function parseSecondsList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);
}

function DurationInput({ label, seconds, onChange, hint }) {
  const split = splitSeconds(seconds);

  const update = (nextAmount, nextUnit = split.unit) => {
    onChange(durationToSeconds(nextAmount, nextUnit));
  };

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs text-slate-600">{label}</Label>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 120px" }}>
        <Input
          type="number"
          min="0"
          value={split.amount}
          onChange={(event) => update(event.target.value)}
        />
        <Select
          value={split.unit}
          onValueChange={(unit) => update(split.amount || 0, unit)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">Seconds</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] text-slate-400">
        {hint || `Saves as ${Number(seconds || 0).toLocaleString()} seconds`}
      </p>
    </div>
  );
}

function OptionSelect({ value, onChange, options, placeholder = "Select" }) {
  return (
    <Select value={toSelectValue(value)} onValueChange={(next) => onChange(fromSelectValue(next))}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || ALL_SELECT_VALUE} value={option.value || ALL_SELECT_VALUE}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleBadge({ checked, children, onCheckedChange }) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={`rounded-md border px-2 py-1 text-xs transition ${
        checked
          ? "border-purple-300 bg-purple-50 text-purple-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function MultiStageSelector({ label, value, onChange }) {
  const selected = Array.isArray(value) ? value : [];

  const toggle = (stage) => {
    onChange(
      selected.includes(stage)
        ? selected.filter((item) => item !== stage)
        : [...selected, stage],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-slate-400">{selected.length} selected</span>
      </div>
      <div
        className="grid gap-2 overflow-y-auto rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
        style={{
          maxHeight: "11rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {SLA_STAGE_OPTIONS.map((stage) => (
          <label
            key={stage.value}
            className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"
          >
            <Checkbox
              checked={selected.includes(stage.value)}
              onCheckedChange={() => toggle(stage.value)}
            />
            <span>{stage.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ReminderEditor({ reminder, index, onChange, onRemove }) {
  const isRef = Boolean(reminder?.$ref);
  const channels = Array.isArray(reminder?.channels) ? reminder.channels : [];

  const setField = (field, value) => {
    onChange({ ...reminder, [field]: value });
  };

  const toggleChannel = (channel) => {
    setField(
      "channels",
      channels.includes(channel)
        ? channels.filter((item) => item !== channel)
        : [...channels, channel],
    );
  };

  if (isRef) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Default reminder reference</p>
            <p className="font-mono text-xs text-slate-500">{reminder.$ref}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">Reminder {index + 1}</p>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs">Type</Label>
          <Select value={reminder.type || "at_seconds_from_start"} onValueChange={(value) => setField("type", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Kind</Label>
          <OptionSelect
            value={reminder.kind || ""}
            onChange={(value) => setField("kind", value)}
            options={REMINDER_KIND_OPTIONS}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Target</Label>
          <Select value={reminder.target || "technician"} onValueChange={(value) => setField("target", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_TARGET_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Sequence</Label>
          <Input
            type="number"
            min="1"
            value={reminder.sequence ?? reminder.sequence_start ?? index + 1}
            onChange={(event) => setField("sequence", Number(event.target.value || index + 1))}
          />
        </div>

        {reminder.type === "percent_of_ttl" ? (
          <div className="space-y-2">
            <Label className="text-xs">Percent of TTL</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={reminder.percent ?? 50}
              onChange={(event) => setField("percent", Number(event.target.value || 0))}
            />
          </div>
        ) : reminder.type === "after_reference_repeat" ? (
          <>
            <DurationInput
              label="Repeat every"
              seconds={reminder.every_seconds ?? 60}
              onChange={(seconds) => setField("every_seconds", seconds)}
            />
            <div className="space-y-2">
              <Label className="text-xs">Max repeats</Label>
              <Input
                type="number"
                min="1"
                value={reminder.max_repeats ?? 3}
                onChange={(event) => setField("max_repeats", Number(event.target.value || 1))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Reference</Label>
              <Input
                value={reminder.reference || "started_at"}
                onChange={(event) => setField("reference", event.target.value)}
              />
            </div>
          </>
        ) : (
          <DurationInput
            label="Offset"
            seconds={reminder.seconds ?? 300}
            onChange={(seconds) => setField("seconds", seconds)}
          />
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Channels</Label>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((channel) => (
            <ToggleBadge
              key={channel.value}
              checked={channels.includes(channel.value)}
              onCheckedChange={() => toggleChannel(channel.value)}
            >
              {channel.label}
            </ToggleBadge>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Note</Label>
        <Input
          value={reminder.note || ""}
          onChange={(event) => setField("note", event.target.value)}
          placeholder="Optional admin-facing note"
        />
      </div>
    </div>
  );
}

function ExtensionPolicyEditor({ title, value, onChange }) {
  const policy = value && typeof value === "object" ? value : { allowed: false };
  const reasons = Array.isArray(policy.reasons) ? policy.reasons : [];
  const optionSeconds = Array.isArray(policy.options_seconds)
    ? policy.options_seconds.join(", ")
    : "";

  const setField = (field, nextValue) => {
    onChange({
      ...makeEmptyExtensionPolicy(),
      ...policy,
      [field]: nextValue,
    });
  };

  const toggleReason = (reason) => {
    setField(
      "reasons",
      reasons.includes(reason)
        ? reasons.filter((item) => item !== reason)
        : [...reasons, reason],
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            Configure who can add time and under what limits.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={Boolean(policy.allowed)}
            onCheckedChange={(checked) => setField("allowed", Boolean(checked))}
          />
          Enabled
        </label>
      </div>

      {policy.allowed && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Max requests</Label>
              <Input
                type="number"
                min="1"
                value={policy.max_requests ?? 1}
                onChange={(event) => setField("max_requests", Number(event.target.value || 1))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Approval mode</Label>
              <Select value={policy.approval_mode || "auto"} onValueChange={(value) => setField("approval_mode", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DurationInput
              label="Max total extension"
              seconds={policy.max_total_extension_seconds ?? 900}
              onChange={(seconds) => setField("max_total_extension_seconds", seconds)}
            />
            <DurationInput
              label="Pause reassignment"
              seconds={policy.pause_reassignment_seconds ?? 0}
              onChange={(seconds) => setField("pause_reassignment_seconds", seconds)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Extension options in seconds</Label>
            <Input
              value={optionSeconds}
              onChange={(event) => setField("options_seconds", parseSecondsList(event.target.value))}
              placeholder="300, 600, 900"
            />
            <p className="text-[11px] text-slate-400">
              Current: {(policy.options_seconds || []).map(formatSeconds).join(", ") || "None"}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Reasons</Label>
            <div className="flex flex-wrap gap-2">
              {EXTENSION_REASON_OPTIONS.map((reason) => (
                <ToggleBadge
                  key={reason.value}
                  checked={reasons.includes(reason.value)}
                  onCheckedChange={() => toggleReason(reason.value)}
                >
                  {reason.label}
                </ToggleBadge>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={Boolean(policy.other_requires_note)}
              onCheckedChange={(checked) => setField("other_requires_note", Boolean(checked))}
            />
            Require a note when reason is Other
          </label>
        </div>
      )}
    </div>
  );
}

function sanitizeReminder(reminder, index) {
  if (reminder?.$ref) return { $ref: reminder.$ref };

  const clean = {
    type: reminder?.type || "at_seconds_from_start",
    target: reminder?.target || "technician",
    channels: Array.isArray(reminder?.channels) ? reminder.channels : [],
    sequence: Number(reminder?.sequence || reminder?.sequence_start || index + 1),
  };

  if (reminder?.kind) clean.kind = reminder.kind;
  if (reminder?.note) clean.note = reminder.note;

  if (clean.type === "percent_of_ttl") {
    clean.percent = Number(reminder?.percent || 0);
  } else if (clean.type === "after_reference_repeat") {
    clean.kind = reminder?.kind || "repeat";
    clean.reference = reminder?.reference || "started_at";
    clean.max_repeats = Number(reminder?.max_repeats || 1);
    clean.every_seconds = Number(reminder?.every_seconds || 0);
    clean.sequence_start = Number(reminder?.sequence_start || clean.sequence || 1);
    delete clean.sequence;
  } else {
    clean.seconds = Number(reminder?.seconds || 0);
  }

  return clean;
}

function sanitizeExtensionPolicy(policy) {
  if (!policy || !policy.allowed) return { allowed: false };

  return {
    allowed: true,
    reasons: Array.isArray(policy.reasons) ? policy.reasons : [],
    max_requests: Number(policy.max_requests || 1),
    approval_mode: policy.approval_mode || "auto",
    options_seconds: Array.isArray(policy.options_seconds)
      ? policy.options_seconds.map(Number).filter((value) => Number.isFinite(value))
      : [],
    other_requires_note: Boolean(policy.other_requires_note),
    pause_reassignment_seconds: Number(policy.pause_reassignment_seconds || 0),
    max_total_extension_seconds: Number(policy.max_total_extension_seconds || 0),
    ...(policy.role_overrides ? { role_overrides: policy.role_overrides } : {}),
  };
}

function sanitizeStageRules(stageRules) {
  const rules = ensureStageRules(stageRules);
  const nextStages = {};

  Object.entries(rules.stages || {}).forEach(([stage, rule]) => {
    const clean = {
      ...rule,
      reminders: Array.isArray(rule?.reminders)
        ? rule.reminders.map((reminder, index) => sanitizeReminder(reminder, index))
        : [],
      deadline_mode: rule?.deadline_mode || { type: "fixed_ttl", ttl_seconds: 0 },
    };

    if (rule?.extensions) {
      clean.extensions = sanitizeExtensionPolicy(rule.extensions);
    }
    if (rule?.admin_extensions) {
      clean.admin_extensions = sanitizeExtensionPolicy(rule.admin_extensions);
    }

    nextStages[stage] = clean;
  });

  return {
    ...rules,
    stages: nextStages,
    stage_order: rules.stage_order.filter((stage) => Boolean(nextStages[stage])),
  };
}

export function SLAConfigEditorModal({
  open,
  mode = "create",
  sourceConfig,
  onClose,
  onSaved,
}) {
  const { api } = useApi();
  const { selectableCategories } = useDeviceCategories({ onlyActive: true });
  const [step, setStep] = useState("scope");
  const [draft, setDraft] = useState(() => createBaseConfigPayload());
  const [selectedStage, setSelectedStage] = useState("");
  const [stageToAdd, setStageToAdd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    const base =
      mode === "create"
        ? createBaseConfigPayload({
            name: "",
            service_type: ALL_SERVICE_TYPE_VALUE,
            version: 1,
            is_active: false,
            max_reassignments: 3,
          })
        : createBaseConfigPayload(sourceConfig || {});

    if (mode === "clone") {
      base.version = Number(sourceConfig?.version || 1) + 1;
      base.is_active = false;
    }

    if (mode === "edit") {
      base.is_active = false;
    }

    const rules = ensureStageRules(base.stage_rules);
    const firstStage = rules.stage_order[0] || Object.keys(rules.stages)[0] || "";

    setDraft({ ...base, stage_rules: rules });
    setSelectedStage(firstStage);
    setStageToAdd("");
    setStep("scope");
  }, [open, mode, sourceConfig]);

  const stageRules = useMemo(() => ensureStageRules(draft.stage_rules), [draft.stage_rules]);
  const stageOrder = stageRules.stage_order.length
    ? stageRules.stage_order
    : Object.keys(stageRules.stages);
  const availableStages = SLA_STAGE_OPTIONS.filter(
    (stage) => !stageOrder.includes(stage.value),
  );
  const selectedRule = selectedStage
    ? stageRules.stages?.[selectedStage] || makeEmptyStageRule()
    : null;

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateStageRules = (updater) => {
    setDraft((current) => {
      const currentRules = ensureStageRules(current.stage_rules);
      const nextRules = updater(currentRules);
      return { ...current, stage_rules: ensureStageRules(nextRules) };
    });
  };

  const updateSelectedRule = (updater) => {
    if (!selectedStage) return;
    updateStageRules((rules) => {
      const currentRule = rules.stages[selectedStage] || makeEmptyStageRule();
      const nextRule = updater(structuredCloneSafe(currentRule));
      return {
        ...rules,
        stages: {
          ...rules.stages,
          [selectedStage]: nextRule,
        },
        stage_order: rules.stage_order.includes(selectedStage)
          ? rules.stage_order
          : [...rules.stage_order, selectedStage],
      };
    });
  };

  const addStage = () => {
    const stage = stageToAdd || availableStages[0]?.value;
    if (!stage) return;

    updateStageRules((rules) => ({
      ...rules,
      stages: {
        ...rules.stages,
        [stage]: makeEmptyStageRule(),
      },
      stage_order: [...rules.stage_order, stage],
    }));
    setSelectedStage(stage);
    setStageToAdd("");
  };

  const removeSelectedStage = () => {
    if (!selectedStage) return;
    const nextOrder = stageOrder.filter((stage) => stage !== selectedStage);

    updateStageRules((rules) => {
      const stages = { ...rules.stages };
      delete stages[selectedStage];
      return {
        ...rules,
        stages,
        stage_order: nextOrder,
      };
    });
    setSelectedStage(nextOrder[0] || "");
  };

  const moveSelectedStage = (direction) => {
    if (!selectedStage) return;
    updateStageRules((rules) => {
      const order = [...rules.stage_order];
      const index = order.indexOf(selectedStage);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return rules;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...rules, stage_order: order };
    });
  };

  const setDeadlineType = (type) => {
    updateSelectedRule((rule) => {
      const current = rule.deadline_mode || {};
      if (type === "fixed_ttl") {
        return {
          ...rule,
          deadline_mode: {
            type,
            ttl_seconds:
              current.ttl_seconds ?? current.default_ttl_seconds ?? draft.default_ttl_seconds ?? 3600,
          },
        };
      }
      if (type === "service_based") {
        return {
          ...rule,
          deadline_mode: {
            type,
            min_ttl_seconds: current.min_ttl_seconds ?? 900,
            default_ttl_seconds: current.default_ttl_seconds ?? 1800,
            max_ttl_seconds: current.max_ttl_seconds ?? 7200,
            use_service_sla_hours_if_available:
              current.use_service_sla_hours_if_available ?? false,
            use_assessment_estimated_hours_if_available:
              current.use_assessment_estimated_hours_if_available ?? true,
          },
        };
      }

      return {
        ...rule,
        deadline_mode: {
          type,
          buffer_seconds: current.buffer_seconds ?? 300,
          min_ttl_seconds: current.min_ttl_seconds ?? 600,
          max_ttl_seconds: current.max_ttl_seconds ?? 7200,
          fallback: current.fallback || {
            type: "distance_bands",
            distance_unit: "km",
            buffer_seconds: 300,
            bands: [],
          },
        },
      };
    });
  };

  const updateDeadlineField = (field, value) => {
    updateSelectedRule((rule) => ({
      ...rule,
      deadline_mode: {
        ...(rule.deadline_mode || { type: "fixed_ttl" }),
        [field]: value,
      },
    }));
  };

  const updateReminder = (index, reminder) => {
    updateSelectedRule((rule) => {
      const reminders = Array.isArray(rule.reminders) ? [...rule.reminders] : [];
      reminders[index] = reminder;
      return { ...rule, reminders };
    });
  };

  const removeReminder = (index) => {
    updateSelectedRule((rule) => ({
      ...rule,
      reminders: (rule.reminders || []).filter((_, reminderIndex) => reminderIndex !== index),
    }));
  };

  const addReminder = () => {
    updateSelectedRule((rule) => {
      const reminders = Array.isArray(rule.reminders) ? [...rule.reminders] : [];
      const nextSequence =
        reminders.reduce((max, reminder) => Math.max(max, Number(reminder.sequence || 0)), 0) + 1;
      return { ...rule, reminders: [...reminders, makeEmptyReminder(nextSequence)] };
    });
  };

  const addDefaultReminderRef = (ref) => {
    updateSelectedRule((rule) => ({
      ...rule,
      reminders: [...(rule.reminders || []), { $ref: ref }],
    }));
  };

  const updatePolicy = (field, value) => {
    updateSelectedRule((rule) => ({
      ...rule,
      [field]: value,
    }));
  };

  const makePayload = () => {
    const payload = cleanConfigPayload({
      ...draft,
      is_active: false,
      stage_rules: sanitizeStageRules(draft.stage_rules),
    });
    return payload;
  };

  const submit = async (activateAfterSave = false) => {
    if (!draft.name.trim()) {
      toast.error("Enter a policy name");
      setStep("scope");
      return;
    }

    if (stageOrder.length === 0) {
      toast.error("Add at least one stage rule");
      setStep("stages");
      return;
    }

    if (
      activateAfterSave &&
      !window.confirm(
        "Activate this SLA policy after saving? This can deactivate another active policy with the same matching scope.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = makePayload();
      let response;

      if (mode === "create") {
        response = await api.post("/sla/configs/", payload);
      } else if (mode === "clone") {
        response = await api.post(
          `/sla/configs/${sourceConfig.id}/clone_and_update/`,
          payload,
        );
      } else {
        response = await api.patch(`/sla/configs/${sourceConfig.id}/`, payload);
      }

      let savedConfig = extractConfig(response);

      if (activateAfterSave && savedConfig?.id) {
        const activateResponse = await api.post(`/sla/configs/${savedConfig.id}/activate/`);
        savedConfig = extractConfig(activateResponse) || savedConfig;
        toast.success(activateResponse?.data?.message || "SLA policy saved and activated");
      } else {
        toast.success(response?.data?.message || "SLA policy saved as inactive");
      }

      onSaved?.(savedConfig);
      onClose?.();
    } catch (error) {
      console.error("Failed to save SLA policy:", error);
      toast.error(getErrorMessage(error, "Failed to save SLA policy"));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "create"
      ? "Create SLA Policy"
      : mode === "clone"
        ? "Clone SLA Policy"
        : "Edit SLA Draft";
  const currentStepIndex = Math.max(
    0,
    STEPS.findIndex((item) => item.id === step),
  );
  const previousStep = STEPS[currentStepIndex - 1]?.id;
  const nextStep = STEPS[currentStepIndex + 1]?.id;

  const serviceTypeOptions = [
    { value: ALL_SERVICE_TYPE_VALUE, label: "All device types" },
    ...selectableCategories.map((category) => ({
      value: category.name,
      label: category.label,
    })),
  ];

  const deadlineMode = selectedRule?.deadline_mode || { type: "fixed_ttl", ttl_seconds: 0 };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent
        className="max-w-6xl overflow-hidden p-0"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          width: "calc(100vw - 48px)",
          maxWidth: "72rem",
          height: "calc(100vh - 48px)",
          maxHeight: "calc(100vh - 48px)",
        }}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {mode === "clone" && <GitBranch className="h-5 w-5 text-purple-600" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            Save creates or updates an inactive policy first. Activation is explicit.
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid min-h-0"
          style={{
            flex: "1 1 auto",
            gridTemplateColumns: "220px minmax(0, 1fr)",
          }}
        >
          <aside className="border-r bg-slate-50 p-4">
            <div className="space-y-2">
              {STEPS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStep(item.id)}
                  className={`flex w-full items-center gap-4 rounded-lg px-4 py-2 text-left text-sm transition ${
                    step === item.id
                      ? "bg-purple-600 text-white"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      step === item.id ? "bg-white/20" : "bg-white"
                    }`}
                  >
                    {index + 1}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-2 text-xs text-slate-500">
              <p className="font-medium text-slate-700">Scope preview</p>
              <div className="flex flex-wrap gap-2">
                {getScopeParts(draft).map((part) => (
                  <Badge key={part} variant="secondary" className="rounded-md font-normal">
                    {part}
                  </Badge>
                ))}
              </div>
            </div>
          </aside>

          <ScrollArea className="min-h-0" style={{ height: "100%" }}>
            <div className="space-y-6 p-6">
              {step === "scope" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Basics and scope</h3>
                    <p className="text-sm text-slate-500">
                      Define which jobs this policy can match. Use broad values only when the
                      policy should act as a fallback.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={draft.name}
                        onChange={(event) => setField("name", event.target.value)}
                        placeholder="Generic SLA"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Version</Label>
                      <Input
                        type="number"
                        min="1"
                        value={draft.version}
                        onChange={(event) => setField("version", Number(event.target.value || 1))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Device type</Label>
                      <Select
                        value={draft.service_type || ALL_SERVICE_TYPE_VALUE}
                        onValueChange={(value) => setField("service_type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-400">
                        All device types save as <span className="font-mono">*</span>.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Source channel</Label>
                      <OptionSelect
                        value={draft.source_channel}
                        onChange={(value) => setField("source_channel", value)}
                        options={SOURCE_CHANNEL_OPTIONS}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Workflow type</Label>
                      <OptionSelect
                        value={draft.workflow_type}
                        onChange={(value) => setField("workflow_type", value)}
                        options={WORKFLOW_TYPE_OPTIONS}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Job group type</Label>
                      <OptionSelect
                        value={draft.job_group_type}
                        onChange={(value) => setField("job_group_type", value)}
                        options={JOB_GROUP_TYPE_OPTIONS}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={draft.customer_city}
                        onChange={(event) => setField("customer_city", event.target.value)}
                        placeholder="All cities"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Input
                        value={draft.region}
                        onChange={(event) => setField("region", event.target.value)}
                        placeholder="All regions"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Coverage type</Label>
                      <Input
                        value={draft.coverage_type}
                        onChange={(event) => setField("coverage_type", event.target.value)}
                        placeholder="All coverage types"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email template</Label>
                      <Input
                        value={draft.template_name}
                        onChange={(event) => setField("template_name", event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DurationInput
                      label="Default SLA duration"
                      seconds={draft.default_ttl_seconds}
                      onChange={(seconds) => setField("default_ttl_seconds", seconds)}
                    />
                    <div className="space-y-2">
                      <Label>Max reassignments</Label>
                      <Input
                        type="number"
                        min="0"
                        value={draft.max_reassignments}
                        onChange={(event) =>
                          setField("max_reassignments", Number(event.target.value || 0))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <MultiStageSelector
                      label="Allowed reassignment states"
                      value={draft.allowed_reassign_states}
                      onChange={(value) => setField("allowed_reassign_states", value)}
                    />
                    <MultiStageSelector
                      label="Allowed extension states"
                      value={draft.allowed_extension_states}
                      onChange={(value) => setField("allowed_extension_states", value)}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={Boolean(draft.is_default)}
                      onCheckedChange={(checked) => setField("is_default", Boolean(checked))}
                    />
                    Treat this as the default policy for the selected scope
                  </label>
                </div>
              )}

              {step === "stages" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Stage rules</h3>
                    <p className="text-sm text-slate-500">
                      Pick statuses from the platform list, then configure deadline,
                      reminders, extensions, and reassignment behavior.
                    </p>
                  </div>

                  <div
                    className="grid gap-6"
                    style={{ gridTemplateColumns: "280px minmax(0, 1fr)" }}
                  >
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <Label className="text-xs">Add stage</Label>
                        <div className="mt-2 flex gap-2">
                          <Select
                            value={stageToAdd || availableStages[0]?.value || ""}
                            onValueChange={setStageToAdd}
                            disabled={availableStages.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                            <SelectContent
                              style={{
                                maxHeight: "min(420px, calc(100vh - 160px))",
                                overflowY: "auto",
                              }}
                            >
                              {availableStages.map((stage) => (
                                <SelectItem key={stage.value} value={stage.value}>
                                  {stage.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="icon"
                            onClick={addStage}
                            disabled={availableStages.length === 0}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {stageOrder.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                            No stage rules yet.
                          </div>
                        ) : (
                          stageOrder.map((stage) => (
                            <button
                              key={stage}
                              type="button"
                              onClick={() => setSelectedStage(stage)}
                              className={`w-full rounded-lg border p-4 text-left text-sm transition ${
                                selectedStage === stage
                                  ? "border-purple-300 bg-purple-50 text-purple-800"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <span className="block font-medium">{getStageLabel(stage)}</span>
                              <span className="font-mono text-xs text-slate-400">{stage}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    {selectedRule ? (
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {getStageLabel(selectedStage)}
                            </p>
                            <p className="font-mono text-xs text-slate-500">{selectedStage}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveSelectedStage("up")}
                            >
                              Move up
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveSelectedStage("down")}
                            >
                              Move down
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-600"
                              onClick={removeSelectedStage}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium">Deadline mode</p>
                              <p className="text-xs text-slate-500">
                                Controls how the stage deadline is calculated.
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={Boolean(selectedRule.final_stage)}
                                onCheckedChange={(checked) =>
                                  updatePolicy("final_stage", Boolean(checked))
                                }
                              />
                              Final stage
                            </label>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Mode</Label>
                              <Select
                                value={deadlineMode.type || "fixed_ttl"}
                                onValueChange={setDeadlineType}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DEADLINE_MODE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {deadlineMode.type === "fixed_ttl" && (
                              <DurationInput
                                label="Fixed duration"
                                seconds={deadlineMode.ttl_seconds ?? 0}
                                onChange={(seconds) => updateDeadlineField("ttl_seconds", seconds)}
                              />
                            )}

                            {deadlineMode.type === "service_based" && (
                              <div className="grid gap-4 md:grid-cols-3">
                                <DurationInput
                                  label="Minimum"
                                  seconds={deadlineMode.min_ttl_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("min_ttl_seconds", seconds)}
                                />
                                <DurationInput
                                  label="Default"
                                  seconds={deadlineMode.default_ttl_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("default_ttl_seconds", seconds)}
                                />
                                <DurationInput
                                  label="Maximum"
                                  seconds={deadlineMode.max_ttl_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("max_ttl_seconds", seconds)}
                                />
                                <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
                                  <Checkbox
                                    checked={Boolean(deadlineMode.use_service_sla_hours_if_available)}
                                    onCheckedChange={(checked) =>
                                      updateDeadlineField(
                                        "use_service_sla_hours_if_available",
                                        Boolean(checked),
                                      )
                                    }
                                  />
                                  Use service SLA hours when available
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
                                  <Checkbox
                                    checked={Boolean(
                                      deadlineMode.use_assessment_estimated_hours_if_available,
                                    )}
                                    onCheckedChange={(checked) =>
                                      updateDeadlineField(
                                        "use_assessment_estimated_hours_if_available",
                                        Boolean(checked),
                                      )
                                    }
                                  />
                                  Use assessment estimated hours when available
                                </label>
                              </div>
                            )}

                            {deadlineMode.type === "eta_plus_buffer" && (
                              <div className="grid gap-4 md:grid-cols-3">
                                <DurationInput
                                  label="Buffer"
                                  seconds={deadlineMode.buffer_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("buffer_seconds", seconds)}
                                />
                                <DurationInput
                                  label="Minimum"
                                  seconds={deadlineMode.min_ttl_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("min_ttl_seconds", seconds)}
                                />
                                <DurationInput
                                  label="Maximum"
                                  seconds={deadlineMode.max_ttl_seconds ?? 0}
                                  onChange={(seconds) => updateDeadlineField("max_ttl_seconds", seconds)}
                                />
                                <p className="text-xs text-slate-500 md:col-span-3">
                                  Existing fallback distance bands are preserved. Edit exact bands in
                                  advanced JSON later if needed.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium">Reminders</p>
                              <p className="text-xs text-slate-500">
                                Notifications and automated deadline checks for this stage.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={addReminder}>
                                <Plus className="mr-2 h-4 w-4" />
                                Reminder
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addDefaultReminderRef("defaults.reminders.deadline_check_5s")}
                              >
                                Deadline check
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {(selectedRule.reminders || []).length === 0 ? (
                              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                                No reminders configured.
                              </div>
                            ) : (
                              selectedRule.reminders.map((reminder, index) => (
                                <ReminderEditor
                                  key={`${selectedStage}-${index}`}
                                  reminder={reminder}
                                  index={index}
                                  onChange={(next) => updateReminder(index, next)}
                                  onRemove={() => removeReminder(index)}
                                />
                              ))
                            )}
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <ExtensionPolicyEditor
                            title="Technician extensions"
                            value={selectedRule.extensions}
                            onChange={(value) => updatePolicy("extensions", value)}
                          />
                          <ExtensionPolicyEditor
                            title="Admin extensions"
                            value={selectedRule.admin_extensions}
                            onChange={(value) => updatePolicy("admin_extensions", value)}
                          />
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                          <p className="mb-4 font-medium">Reassignment and escalation</p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={Boolean(selectedRule.reassignment_eligible)}
                                onCheckedChange={(checked) =>
                                  updatePolicy("reassignment_eligible", Boolean(checked))
                                }
                              />
                              Reassignment eligible
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={Boolean(selectedRule.reassign_on_overdue)}
                                onCheckedChange={(checked) =>
                                  updatePolicy("reassign_on_overdue", Boolean(checked))
                                }
                              />
                              Reassign when overdue
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                        Add or select a stage to edit rules.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === "review" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Review</h3>
                    <p className="text-sm text-slate-500">
                      Confirm the policy before saving. It will be saved inactive first.
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <p>
                        Activation may deactivate another active SLA policy with the same backend
                        matching scope. Use Save Draft if you are not ready to switch traffic.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4">
                      <p className="text-xs text-slate-400">Policy</p>
                      <p className="font-medium text-slate-900">{draft.name || "Untitled SLA"}</p>
                      <p className="text-sm text-slate-500">Version {draft.version}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4">
                      <p className="text-xs text-slate-400">Default TTL</p>
                      <p className="font-medium text-slate-900">
                        {formatSeconds(draft.default_ttl_seconds)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4 md:col-span-2">
                      <p className="mb-2 text-xs text-slate-400">Scope</p>
                      <div className="flex flex-wrap gap-2">
                        {getScopeParts(draft).map((part) => (
                          <Badge key={part} variant="secondary" className="rounded-md">
                            {part}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4">
                      <p className="text-xs text-slate-400">Device type</p>
                      <p className="font-medium text-slate-900">
                        {draft.service_type === ALL_SERVICE_TYPE_VALUE
                          ? "All device types (*)"
                          : getOptionLabel(serviceTypeOptions, draft.service_type)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4">
                      <p className="text-xs text-slate-400">Matching</p>
                      <p className="font-medium text-slate-900">
                        {getOptionLabel(SOURCE_CHANNEL_OPTIONS, draft.source_channel)} ·{" "}
                        {getOptionLabel(WORKFLOW_TYPE_OPTIONS, draft.workflow_type)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="font-medium text-slate-900">Stages</p>
                      <Badge variant="outline">{stageOrder.length} total</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stageOrder.map((stage) => (
                        <Badge key={stage} variant="secondary" className="rounded-md">
                          {getStageLabel(stage)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="mb-2 font-medium text-slate-900">Raw payload preview</p>
                    <Textarea
                      readOnly
                      value={JSON.stringify(makePayload(), null, 2)}
                      className="h-60 resize-none font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter
          className="border-t bg-white px-6 py-4"
          style={{ flexShrink: 0 }}
        >
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {previousStep && (
            <Button
              variant="outline"
              onClick={() => setStep(previousStep)}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          {nextStep && (
            <Button
              variant="outline"
              onClick={() => setStep(nextStep)}
              disabled={submitting}
            >
              {nextStep === "review" ? "Review & Save" : "Continue"}
            </Button>
          )}
          <Button variant="outline" onClick={() => submit(false)} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button onClick={() => submit(true)} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Save & Activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
