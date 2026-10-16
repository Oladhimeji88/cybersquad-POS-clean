// Single source of truth for turning snake_case/enum-style values into
// display labels (e.g. "awaiting_parts_release" -> "Awaiting Parts Release").
// Previously reimplemented verbatim in several files with one inconsistency:
// some returned "-" for a missing value, one returned "". Standardized on
// "-" to match the same "no data" convention used by formatAmount
// (src/lib/currency.js).
export function humanizeLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
