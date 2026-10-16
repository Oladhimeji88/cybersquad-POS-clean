import { AppSettings, PAYMENT_MODE_LABELS } from "@/frontdesk/lib/store";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import cybersquadLightLogo from "@/frontdesk/assets/cybersquad black.png";
import { getSalePayments, type Sale, type Refund } from "./store";
import { deviceDetailText } from "./devices";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printSaleReceipt(sale: Sale, settings?: Partial<AppSettings>, title?: string) {
  if (typeof window === "undefined") return;

  const businessName = settings?.businessName || "Cybersquad Device Services";
  const businessPhone = settings?.businessPhone || "";
  const businessEmail = settings?.businessEmail || "";
  const businessAddress = settings?.businessAddress || "";
  const receiptFooter =
    settings?.receiptFooter || "Thank you for choosing Cybersquad. This receipt was generated electronically.";
  const logoUrl = cybersquadLightLogo;
  const payments = getSalePayments(sale);
  const isSplit = payments.length > 1;
  const paymentModeLabel = sale.cod
    ? "Cash on Delivery - payment pending"
    : payments
        .map((payment) => PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode)
        .join(" + ");

  const popup = window.open("", "_blank", "width=960,height=720");
  if (!popup) return;

  const lineRows = sale.lines
    .map(
      (line) => `<tr>
              <td>${escapeHtml(line.name)}${line.sku ? ` <span class="muted">(${escapeHtml(line.sku)})</span>` : ""}${deviceDetailText(line).map((text) => `<div class="muted" style="font-size:12px">${escapeHtml(text)}</div>`).join("")}</td>
              <td>${line.quantity}</td>
              <td>${escapeHtml(formatCurrency(line.unitPrice))}</td>
              <td>${escapeHtml(formatCurrency(line.unitPrice * line.quantity))}</td>
            </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(sale.saleNumber)}</title>
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
          <h1>${escapeHtml(title ?? (sale.lifecycle === "reserved" ? "Order / Deposit Record" : sale.isDemo ? "Sample Sales Receipt" : "Sales Receipt"))}</h1>
          <p class="muted">${escapeHtml(businessName)}</p>
          ${businessPhone ? `<p class="muted">${escapeHtml(businessPhone)}</p>` : ""}
          ${businessEmail ? `<p class="muted">${escapeHtml(businessEmail)}</p>` : ""}
          ${businessAddress ? `<p class="muted">${escapeHtml(businessAddress)}</p>` : ""}
        </div>
        <div style="text-align:right;">
          <p><strong>${escapeHtml(sale.saleNumber)}</strong></p>
          <p class="muted">Issued ${escapeHtml(new Date(sale.createdAt).toLocaleString())}</p>
          ${sale.customer ? `<p>Customer: ${escapeHtml(sale.customer.name)} ? ${escapeHtml(sale.customer.phone)}</p>` : ""}
          <p class="muted">Cashier ${escapeHtml(sale.cashierName)}</p>
          <p class="muted">Payment: ${escapeHtml(paymentModeLabel)}</p>
        </div>
      </div>

      ${sale.note ? "<p>Note: " + escapeHtml(sale.note) + "</p>" : ""}
      <div class="section">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows}
          </tbody>
        </table>
      </div>

      ${sale.discount && sale.discount.amount > 0 ? `<div class="section row">
        <div><p class="muted">Subtotal ${escapeHtml(formatCurrency(sale.subtotal))} · Discount (${escapeHtml(sale.discount.reason)})</p></div>
        <div>-${escapeHtml(formatCurrency(sale.discount.amount))}</div>
      </div>` : ""}
      <div class="section row">
        <div>
          <p class="muted">Total</p>
        </div>
        <div class="amount">${escapeHtml(formatCurrency(sale.total))}</div>
      </div>

      ${
        isSplit
          ? payments
              .map(
                (payment) => `<div class="row" style="margin-top:4px;">
        <div><p class="muted">${escapeHtml(PAYMENT_MODE_LABELS[payment.mode] ?? payment.mode)}</p></div>
        <div>${escapeHtml(formatCurrency(payment.amount))}</div>
      </div>`
              )
              .join("")
          : payments[0]?.mode === "cash" && payments[0].cashTendered !== undefined
          ? `<div class="row" style="margin-top:8px;">
        <div><p class="muted">Cash Tendered</p></div>
        <div>${escapeHtml(formatCurrency(payments[0].cashTendered))}</div>
      </div>
      <div class="row" style="margin-top:4px;">
        <div><p class="muted">Change Due</p></div>
        <div>${escapeHtml(formatCurrency(payments[0].changeDue ?? 0))}</div>
      </div>`
          : ""
      }

      <p class="footer">${escapeHtml(receiptFooter)}</p>
    </div>
    <script>window.onload = () => window.print();</script>
  </body>
</html>`;

  popup.document.write(html);
  popup.document.close();
}


export function printRefundReceipt(refund: Refund, original: Sale) {
  const lines = refund.kind === "deposit" ? [{ productId: "deposit", name: "Deposit repayment", quantity: -1, unitPrice: refund.total }] :
    refund.lines.map((entry) => ({ ...original.lines[entry.lineIndex], quantity: -entry.quantity,
      devices: original.lines[entry.lineIndex].devices?.filter((unit) => entry.deviceIds.includes(unit.id)) }));
  printSaleReceipt({ ...original, lines, saleNumber: "REF-" + refund.id + " / " + original.saleNumber,
    createdAt: refund.paidAt ?? refund.createdAt, total: -refund.total, subtotal: -refund.total,
    payments: [{ mode: refund.mode, amount: -refund.total }], paymentMode: refund.mode,
    note: "Status: " + refund.status + ". Reason: " + refund.reason + ". Reference: " + (refund.reference ?? "Cash / pending"),
  }, undefined, (refund.isDemo ? "Sample " : "") + (refund.status === "paid" ? "Refund Receipt" : "Refund Record · " + refund.status));
}
