export type DeviceCategory = {
  id: number;
  name: string;
  label: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  active_jobs_count?: number;
  created_at?: string;
  updated_at?: string;
};

const DEVICE_CATEGORY_LABELS_STORAGE_KEY = "cybersquad_device_category_labels";

const DEFAULT_DEVICE_CATEGORY_LABELS: Record<string, string> = {
  phone: "Phone",
  laptop: "Laptop",
  tablet: "Tablet",
  smartwatch: "Smartwatch",
  projector: "Projector",
  printer: "Printer",
  other: "Other",
  wearable: "Wearable",
  gadget: "Gadget",
};

export const FALLBACK_DEVICE_CATEGORIES: DeviceCategory[] = [
  {
    id: 1,
    name: "phone",
    label: "Phone",
    description: "",
    is_active: true,
    is_default: false,
    sort_order: 0,
  },
  {
    id: 2,
    name: "laptop",
    label: "Laptop",
    description: "",
    is_active: true,
    is_default: false,
    sort_order: 1,
  },
  {
    id: 3,
    name: "tablet",
    label: "Tablet",
    description: "",
    is_active: true,
    is_default: false,
    sort_order: 2,
  },
  {
    id: 4,
    name: "other",
    label: "Other",
    description: "",
    is_active: true,
    is_default: true,
    sort_order: 99,
  },
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredCategoryLabels() {
  if (!canUseStorage()) {
    return { ...DEFAULT_DEVICE_CATEGORY_LABELS };
  }

  try {
    const raw = window.localStorage.getItem(DEVICE_CATEGORY_LABELS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEVICE_CATEGORY_LABELS };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_DEVICE_CATEGORY_LABELS };
    }

    return {
      ...DEFAULT_DEVICE_CATEGORY_LABELS,
      ...Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === "string" && typeof entry[1] === "string"
        )
      ),
    };
  } catch {
    return { ...DEFAULT_DEVICE_CATEGORY_LABELS };
  }
}

let cachedDeviceCategoryLabels = readStoredCategoryLabels();

function persistCategoryLabels() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      DEVICE_CATEGORY_LABELS_STORAGE_KEY,
      JSON.stringify(cachedDeviceCategoryLabels)
    );
  } catch {
    // Ignore storage write failures. The in-memory cache is enough for this session.
  }
}

export function normalizeDeviceCategoryName(value?: string | null, fallback = "other") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return normalized || fallback;
}

export function formatDeviceCategoryLabel(value?: string | null) {
  const normalized = normalizeDeviceCategoryName(value, "");
  if (!normalized) return "Other";

  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDeviceCategoryLabel(value?: string | null) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return DEFAULT_DEVICE_CATEGORY_LABELS.other;

  const normalized = normalizeDeviceCategoryName(rawValue);
  return (
    cachedDeviceCategoryLabels[normalized] ||
    cachedDeviceCategoryLabels[rawValue] ||
    formatDeviceCategoryLabel(rawValue)
  );
}

export function updateDeviceCategoryLabelCache(categories: Array<Pick<DeviceCategory, "name" | "label">>) {
  const nextLabels = { ...cachedDeviceCategoryLabels };

  categories.forEach((category) => {
    const name = normalizeDeviceCategoryName(category?.name, "");
    if (!name) return;
    nextLabels[name] = String(category?.label || "").trim() || formatDeviceCategoryLabel(name);
  });

  cachedDeviceCategoryLabels = nextLabels;
  persistCategoryLabels();
}

export function sortDeviceCategories(categories: DeviceCategory[]) {
  return [...categories].sort((left, right) => {
    const orderDelta = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
    if (orderDelta !== 0) return orderDelta;
    return getDeviceCategoryLabel(left?.name).localeCompare(getDeviceCategoryLabel(right?.name));
  });
}
