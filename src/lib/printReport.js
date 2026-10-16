import { humanizeLabel } from "./text";

// Single source of truth for the "export a table of rows as a printable PDF"
// flow. This exact template (styles, meta line, "Print / Save as PDF"
// button) was previously copy-pasted verbatim into JobManagement.jsx and
// DisputeManagement.jsx, and reimplemented a third time in UserManagement.jsx
// with a slightly different (buggy) title formula — `type.charAt(0)...`
// left underscores in multi-word type names instead of turning them into
// spaces (e.g. "job_type" rendered as "Job_type Report"). Payment & Finance's
// PDF export was a fourth, much rougher version that just dumped raw JSON
// into a <pre> tag instead of a formatted table. All four now share this.
export function exportRowsAsPdfReport(data, type) {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const title = `${humanizeLabel(type)} Report`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @media print {
          @page { margin: 1cm; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          color: #333;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }
        .meta {
          margin-bottom: 20px;
          color: #666;
          font-size: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
          font-size: 10px;
        }
        th {
          background-color: #4CAF50;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .no-print {
          margin-top: 20px;
        }
        @media print {
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">
        <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Records:</strong> ${data.length}</p>
      </div>
      <table>
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
            <tr>${headers.map((h) => `<td>${row[h] || "-"}</td>`).join("")}</tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="no-print" style="margin-top: 30px; padding: 15px; background: #f0f0f0; border-radius: 5px;">
        <p style="margin: 0;"><strong>Note:</strong> Use your browser's print function (Ctrl+P or Cmd+P) and select "Save as PDF" to download this report as a PDF file.</p>
        <button onclick="window.print()" style="margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Auto-trigger print dialog after a short delay
  setTimeout(() => {
    printWindow.print();
  }, 250);
}
