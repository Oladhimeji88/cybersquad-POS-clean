import cybersquadLightLogoUrl from "@/frontdesk/assets/cybersquad black.png";

export interface AgreementDocumentInput {
  agreementId: string;
  acceptedAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress?: string;
  organizationName?: string;
  deviceLabel: string;
  deviceIdentifier: string;
  issueReported: string;
  deviceTypeLabel?: string;
  deviceMake?: string;
  deviceModel?: string;
  frontDeskAgent?: string;
  termsText: string;
  signatureDataUrl?: string;
  businessName?: string;
  jobId?: string;
  storeLocation?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function termsToHtmlList(termsText: string) {
  return termsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
}

const JOB_CARD_TERMS = [
  "To protect your Product, repairs will only be relinquished upon presentation of this job card / receipt.",
  "When handing over your product for repair, please remove your battery, charger and all accessories. Sims service Center will not be liable for any loss of battery, charger or any other accessory unless duly signed in at the time of handing the product for repair. Customized accessories will not be replaced / refunded as influenced by the repair requirements e.g. screen protector.",
  "Sims service Center will not be held liable for any loss incurred as a result of forced entry, theft, force majeure at any of the service center premises.",
  "Any repairs not collected within 90 days of repair completion after notification to the customer, will be sold to defray expenses.",
  "For all repairs not covered by manufacturer warranty terms and conditions, an assessment/quotation rejection fee will be charged. Sims service Center will be deemed authorized to automatically undertake any repairs should the cost be less than the assessment / quotation amount.",
  "Once the quotation is accepted, the Sims will be deemed to be authorized to replace parts and materials as may be necessary, provided the costs do not exceed the value of the quotation provided.",
  "This service order sheet / job card does NOT AUTHORIZE ANY EXCHANGE FOR YOUR DEVICE.",
  "Repairs to liquid or corrosion damaged products will not be repaired under manufacturer warranty terms and conditions as specified within the owner's manual warranty terms and conditions.",
  "All non-warranty repairs are on a C.O.D Cash on delivery basis. Sims service Center will not relinquish any product that has been repaired until full payment in respect of such repairs has been received in full. Payment can be made either by cash or by a valid bank card payment.",
  "All repairs undertaken, save for those in respect of corrosion, physical and/or liquid damage are guaranteed against faulty parts and workmanship for a maximum period of 10 days from date of the product receipt by customer.",
  "Upon signature of this document and / or any document to which this document is attached shall signify your acceptance of the terms hereof.",
];

function buildJobCardField(label: string, value?: string) {
  return `<div class="job-card-field">
    <span class="job-card-label">${escapeHtml(label)}</span>
    <span class="job-card-value">${escapeHtml(value?.trim() || "Not provided")}</span>
  </div>`;
}

export function buildAgreementHtml(input: AgreementDocumentInput) {
  const termsHtml = termsToHtmlList(input.termsText);
  const title = `Service Agreement ${input.jobId ? `- ${input.jobId}` : ""}`;
  const businessName = input.businessName || "Cybersquad Device Services";
  const acceptedAtText = new Date(input.acceptedAt).toLocaleString();
  const customerAcceptanceSection = input.signatureDataUrl
    ? `<div class="section">
        <h2>Customer Acceptance And Signature</h2>
        <div class="signature-box">
          <img class="signature-image" src="${input.signatureDataUrl}" alt="Customer signature" />
          <div class="signature-meta">
            Signed by ${escapeHtml(input.customerName)} on ${escapeHtml(acceptedAtText)}
          </div>
        </div>
      </div>`
    : `<div class="section">
        <h2>Customer Acceptance</h2>
        <p class="muted">
          Terms accepted by ${escapeHtml(input.customerName)} on ${escapeHtml(acceptedAtText)}.
        </p>
      </div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
        max-width: 860px;
        margin: 0 auto;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 28px;
      }
      .header-brand {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .brand-logo {
        width: auto;
        height: 24px;
        object-fit: contain;
      }
      h1 { margin: 0 0 6px; font-size: 26px; }
      h2 { margin: 0; font-size: 17px; }
      .muted { color: var(--muted); }
      .row { display: flex; justify-content: space-between; gap: 20px; }
      .section {
        margin-top: 20px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .terms {
        margin: 10px 0 0;
        padding-left: 18px;
      }
      .terms li { margin: 6px 0; }
      .signature-box {
        margin-top: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }
      .signature-image {
        width: 100%;
        max-width: 360px;
        height: 130px;
        object-fit: contain;
        border-bottom: 1px solid var(--line);
      }
      .signature-meta {
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .bottom-line-wrap {
        margin-top: 26px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 6px;
      }
      .signature-lines {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .bottom-line {
        width: 120px;
        height: 1px;
        background: #9ca3af;
      }
      .signature-caption {
        margin: 0;
        font-size: 11px;
        color: var(--muted);
      }
      @media print {
        body { background: #fff; padding: 0; }
        .sheet { border: none; border-radius: 0; padding: 0; }
      }
      @media (max-width: 700px) {
        .row { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="row">
        <div>
          <div class="header-brand">
            <img class="brand-logo" src="${cybersquadLightLogoUrl}" alt="Cybersquad logo" />
            <div>
              <h1>Service Agreement</h1>
              <p class="muted">${escapeHtml(businessName)}</p>
              ${input.storeLocation ? `<p class="muted">Store: ${escapeHtml(input.storeLocation)}</p>` : ""}
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          ${input.jobId ? `<p><strong>Job ${escapeHtml(input.jobId)}</strong></p>` : ""}
          <p class="muted">Agreement ID ${escapeHtml(input.agreementId)}</p>
          <p class="muted">Accepted ${escapeHtml(acceptedAtText)}</p>
        </div>
      </div>

      <div class="section row">
        <div>
          <h2>Customer</h2>
          <p>${escapeHtml(input.customerName)}</p>
          <p class="muted">${escapeHtml(input.customerPhone)}</p>
          <p class="muted">${escapeHtml(input.customerEmail)}</p>
        </div>
        <div style="text-align:right;">
          <h2>Device</h2>
          <p>${escapeHtml(input.deviceLabel)}</p>
          <p class="muted">${escapeHtml(input.deviceIdentifier)}</p>
        </div>
      </div>

      <div class="section">
        <h2>Reported Issue</h2>
        <p>${escapeHtml(input.issueReported || "Not provided")}</p>
      </div>

      <div class="section">
        <h2>List Of Agreements</h2>
        <ol class="terms">${termsHtml}</ol>
      </div>

      ${customerAcceptanceSection}
      <div class="signature-lines">
        <div class="bottom-line-wrap">
          <div class="bottom-line"></div>
          <p class="signature-caption">customer signature</p>
        </div>
        <div class="bottom-line-wrap">
          <div class="bottom-line"></div>
          <p class="signature-caption">front desk agent</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildJobCardHtml(input: AgreementDocumentInput) {
  const title = `Customer Job Card ${input.jobId ? `- ${input.jobId}` : ""}`;
  const businessName = input.businessName || "Cybersquad Device Services";
  const receivedDateText = new Date(input.acceptedAt).toLocaleDateString();
  const termsHtml = JOB_CARD_TERMS.map((term) => `<li>${escapeHtml(term)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --text: #111827;
        --muted: #6b7280;
        --line: #d1d5db;
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
        max-width: 920px;
        margin: 0 auto;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 28px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }
      .header-brand {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .brand-logo {
        width: auto;
        height: 24px;
        object-fit: contain;
      }
      h1 { margin: 0 0 6px; font-size: 28px; }
      h2 { margin: 0 0 12px; font-size: 16px; }
      .muted { color: var(--muted); }
      .job-card-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 22px;
      }
      .job-card-field {
        min-height: 72px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px 12px;
        background: #fff;
      }
      .job-card-field.span-2 { grid-column: span 2; }
      .job-card-label {
        display: block;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .job-card-value {
        display: block;
        font-size: 14px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .signature-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 28px;
        margin-top: 30px;
      }
      .section {
        margin-top: 24px;
      }
      .terms {
        margin: 12px 0 0;
        padding-left: 18px;
      }
      .terms li {
        margin: 6px 0;
        line-height: 1.45;
      }
      .signature-block {
        padding-top: 24px;
      }
      .signature-line {
        height: 1px;
        background: #9ca3af;
        margin-bottom: 8px;
      }
      .signature-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media print {
        body { background: #fff; padding: 0; }
        .sheet { border: none; border-radius: 0; padding: 0; }
      }
      @media (max-width: 700px) {
        .header { flex-direction: column; }
        .job-card-grid { grid-template-columns: 1fr; }
        .job-card-field.span-2 { grid-column: auto; }
        .signature-row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="header-brand">
          <img class="brand-logo" src="${cybersquadLightLogoUrl}" alt="Cybersquad logo" />
          <div>
            <h1>Customer Job Card</h1>
            <p class="muted">${escapeHtml(businessName)}</p>
            ${input.storeLocation ? `<p class="muted">Store: ${escapeHtml(input.storeLocation)}</p>` : ""}
          </div>
        </div>
        <div style="text-align:right;">
          ${input.jobId ? `<p><strong>Job ${escapeHtml(input.jobId)}</strong></p>` : ""}
          <p class="muted">Agreement ID ${escapeHtml(input.agreementId)}</p>
          <p class="muted">Date Received ${escapeHtml(receivedDateText)}</p>
        </div>
      </div>

      <div class="job-card-grid">
        ${buildJobCardField("Job ID", input.jobId)}
        ${buildJobCardField("Store Location", input.storeLocation || businessName)}
        ${buildJobCardField("Customer Name", input.customerName)}
        ${buildJobCardField("Phone Number", input.customerPhone)}
        ${buildJobCardField("Email Address", input.customerEmail)}
        ${buildJobCardField("Organization", input.organizationName)}
        ${buildJobCardField("Device Type", input.deviceTypeLabel)}
        ${buildJobCardField("Brand / Make", input.deviceMake)}
        ${buildJobCardField("Model", input.deviceModel)}
        ${buildJobCardField("Serial / IMEI", input.deviceIdentifier)}
        <div class="job-card-field span-2">
          <span class="job-card-label">Reported Fault</span>
          <span class="job-card-value">${escapeHtml(input.issueReported || "Not provided")}</span>
        </div>
        ${buildJobCardField("Received By", input.frontDeskAgent)}
        ${buildJobCardField("Agreement ID", input.agreementId)}
      </div>

      <div class="section">
        <h2>Terms & Conditions</h2>
        <ol class="terms">${termsHtml}</ol>
      </div>

      <div class="signature-row">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-label">Customer Signature</div>
        </div>
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-label">Front Desk Agent</div>
        </div>
      </div>
    </div>
    <script>window.onload = () => window.print();</script>
  </body>
</html>`;
}

export function openAgreementDocument(input: AgreementDocumentInput) {
  if (typeof window === "undefined") return;
  const popup = window.open("", "_blank", "width=980,height=760");
  if (!popup) return;
  popup.document.write(buildAgreementHtml(input));
  popup.document.close();
}

export function openJobCardDocument(input: AgreementDocumentInput) {
  if (typeof window === "undefined") return;
  const popup = window.open("", "_blank", "width=980,height=760");
  if (!popup) return;
  popup.document.write(buildJobCardHtml(input));
  popup.document.close();
}

export function downloadAgreementDocument(input: AgreementDocumentInput) {
  if (typeof window === "undefined") return "";
  const html = buildAgreementHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const fileName = `agreement-${input.jobId ?? input.agreementId}.html`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

export function sendAgreementEmail(input: AgreementDocumentInput) {
  if (typeof window === "undefined" || !input.customerEmail) return;

  const downloadedFile = downloadAgreementDocument(input);
  const subject = `Service Agreement${input.jobId ? ` - ${input.jobId}` : ""}`;
  const body = [
    `Hello ${input.customerName},`,
    "",
    "Please find your service agreement attached.",
    `Agreement ID: ${input.agreementId}`,
    input.jobId ? `Job ID: ${input.jobId}` : "",
    "",
    `If attachment is missing, please attach this downloaded file: ${downloadedFile}`,
    "",
    "Thank you.",
  ]
    .filter(Boolean)
    .join("\n");

  const mailtoUrl = `mailto:${encodeURIComponent(input.customerEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.location.href = mailtoUrl;
}
