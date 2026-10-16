import { AppSettings, Invoice, PAYMENT_MODE_LABELS, Ticket } from "@/frontdesk/lib/store";
import cybersquadLightLogo from "@/frontdesk/assets/cybersquad black.png";
import { formatCurrency as formatCurrencyShared } from "@/lib/currency";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-exported from the shared formatter (src/lib/currency.js) so every
// existing `from "@/frontdesk/lib/invoice"` import keeps working unchanged.
export function formatCurrency(amount: number) {
  return formatCurrencyShared(amount);
}

export function printInvoice(
  invoice: Invoice,
  ticket: Ticket,
  settings?: Partial<AppSettings>
) {
  if (typeof window === "undefined") return;

  const businessName = settings?.businessName || "Cybersquad Device Services";
  const businessPhone = settings?.businessPhone || "";
  const businessEmail = settings?.businessEmail || "";
  const businessAddress = settings?.businessAddress || "";
  const paymentInstructions = settings?.paymentInstructions || "";
  const receiptFooter =
    settings?.receiptFooter || "Thank you for choosing Cybersquad. This invoice was generated electronically.";
  const logoUrl = cybersquadLightLogo;
  const paymentModeLabel = PAYMENT_MODE_LABELS[invoice.paymentMode] ?? invoice.paymentMode;

  const popup = window.open("", "_blank", "width=960,height=720");
  if (!popup) return;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(invoice.invoiceNumber)}</title>
    <style>
      :root {
        --text: #111827;
        --muted: #6b7280;
        --line: #e5e7eb;
        --accent: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: "Outfit", "Segoe UI", sans-serif;
        color: var(--text);
        background: #f8fafc;
      }
      .sheet {
        max-width: 820px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 28px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .brand-logo {
        height: 34px;
        width: auto;
        display: block;
        margin-bottom: 10px;
      }
      p {
        margin: 4px 0;
      }
      .muted {
        color: var(--muted);
      }
      .section {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }
      .amount {
        font-size: 28px;
        font-weight: 700;
        color: var(--accent);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      th, td {
        text-align: left;
        border-bottom: 1px solid var(--line);
        padding: 10px 0;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      td:last-child,
      th:last-child {
        text-align: right;
      }
      .footer {
        margin-top: 24px;
        color: var(--muted);
        font-size: 12px;
      }
      @media print {
        body { background: #fff; padding: 0; }
        .sheet { border: none; border-radius: 0; padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="row">
        <div>
          <img src="${escapeHtml(logoUrl)}" alt="Cybersquad logo" class="brand-logo" />
          <h1>Invoice</h1>
          <p class="muted">${escapeHtml(businessName)}</p>
          ${businessPhone ? `<p class="muted">${escapeHtml(businessPhone)}</p>` : ""}
          ${businessEmail ? `<p class="muted">${escapeHtml(businessEmail)}</p>` : ""}
          ${businessAddress ? `<p class="muted">${escapeHtml(businessAddress)}</p>` : ""}
        </div>
        <div style="text-align:right;">
          <p><strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
          <p class="muted">Issued ${escapeHtml(new Date(invoice.issuedAt).toLocaleString())}</p>
          <p class="muted">Job ${escapeHtml(ticket.jobId)}</p>
        </div>
      </div>

      <div class="section row">
        <div>
          <h2>Bill To</h2>
          <p>${escapeHtml(ticket.customer.name)}</p>
          <p class="muted">${escapeHtml(ticket.customer.phone)}</p>
          <p class="muted">${escapeHtml(ticket.customer.email)}</p>
        </div>
        <div style="text-align:right;">
          <h2>Device</h2>
          <p>${escapeHtml(ticket.device.make)} ${escapeHtml(ticket.device.model)}</p>
          <p class="muted">IMEI ${escapeHtml(ticket.device.imei)}</p>
        </div>
      </div>

      <div class="section">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Payment Mode</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(invoice.description)}</td>
              <td>${escapeHtml(invoice.type.replace("_", " "))}</td>
              <td>${escapeHtml(paymentModeLabel)}</td>
              <td>${escapeHtml(formatCurrency(invoice.subtotal ?? invoice.amount))}</td>
            </tr>
            ${
              invoice.voucherCode && (invoice.voucherDiscount ?? 0) > 0
                ? `<tr>
              <td>Voucher ${escapeHtml(invoice.voucherCode)}</td>
              <td>discount</td>
              <td>—</td>
              <td>−${escapeHtml(formatCurrency(invoice.voucherDiscount ?? 0))}</td>
            </tr>`
                : ""
            }
          </tbody>
        </table>
      </div>

      ${
        invoice.voucherCode && (invoice.voucherDiscount ?? 0) > 0
          ? `<div class="section row">
        <div>
          <p class="muted">Subtotal</p>
        </div>
        <div>${escapeHtml(formatCurrency(invoice.subtotal ?? invoice.amount + (invoice.voucherDiscount ?? 0)))}</div>
      </div>
      <div class="row" style="margin-top:8px;">
        <div>
          <p class="muted">Voucher ${escapeHtml(invoice.voucherCode)}</p>
        </div>
        <div>−${escapeHtml(formatCurrency(invoice.voucherDiscount ?? 0))}</div>
      </div>`
          : ""
      }
      <div class="section row">
        <div>
          <p class="muted">Total Due</p>
        </div>
        <div class="amount">${escapeHtml(formatCurrency(invoice.amount))}</div>
      </div>

      ${paymentInstructions ? `<p class="footer"><strong>Payment Instructions:</strong> ${escapeHtml(paymentInstructions)}</p>` : ""}
      <p class="footer">${escapeHtml(receiptFooter)}</p>
    </div>
    <script>window.onload = () => window.print();</script>
  </body>
</html>`;

  popup.document.write(html);
  popup.document.close();
}
