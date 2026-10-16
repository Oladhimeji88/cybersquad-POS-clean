// Single source of truth for currency formatting across the admin, POS and
// frontdesk surfaces. Before this, "format an amount as money" was
// reimplemented independently in ~8 places (PaymentFinance.jsx,
// PayoutDetailsModal.jsx, ProcessPayoutsModal.jsx, FinanceReportsTab.jsx,
// VoucherManagementTab.jsx, VoucherUsageModal.jsx, DashboardOverview.jsx,
// SalesDetailModal.jsx) — with two genuinely different behaviors for a
// missing amount: some rendered "₦0", others "-". Consolidated here so every
// surface treats "no data" and "actually zero" the same way (as "-").
const formatters = new Map();

function getFormatter(currency) {
  if (!formatters.has(currency)) {
    formatters.set(
      currency,
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      })
    );
  }
  return formatters.get(currency);
}

// Formats `amount` in `currency` (NGN by default). Returns "-" for
// null/undefined/empty-string/NaN amounts instead of silently showing a
// zero.
export function formatAmount(amount, currency = "NGN") {
  if (amount === null || amount === undefined || amount === "") return "-";
  const value = Number(amount);
  if (Number.isNaN(value)) return "-";
  try {
    return getFormatter(currency).format(value);
  } catch {
    // Unknown/invalid currency code — fall back to a plain prefix instead of throwing.
    return `${currency} ${value.toLocaleString()}`;
  }
}

// NGN-only convenience wrapper — the common case across the app.
export function formatCurrency(amount) {
  return formatAmount(amount, "NGN");
}
