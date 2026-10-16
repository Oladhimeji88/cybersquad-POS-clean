// The SOP workflow library, code-stable, with where each workflow is carried out in CyberSquad.
// `where` is an Operations tab, a separate desk, or "" when the workflow is not built yet. This is what lets the
// product owner trace each handoff code to a screen, and lets SOP changes stay aligned with the product.
export type Area = "Sales" | "Procurement" | "Inventory" | "Digital" | "Logistics" | "Repairs" | "Customer care" | "Finance" | "Operations";
export type Where = "overview" | "enquiries" | "orders" | "quotes" | "digital" | "sourcing" | "procurement" | "logistics" | "inventory" | "returns" | "support" | "finance" | "reports" | "routines" | "library" | "audit" | "pos" | "repairs" | "finance-admin" | "";
export interface WorkflowCode { code: string; name: string; area: Area; owner: string; where: Where; }

const rows: [Area, string, string][] = [
  ["Sales", "SAL-01", "Customer Enquiry / Sales Opportunity|Sales / Front Desk|enquiries"], ["Sales", "SAL-02", "Walk-In|Sales / Front Desk|pos"], ["Sales", "SAL-03", "In-Stock Sale|Sales / Front Desk|pos"],
  ["Sales", "SAL-04", "Unavailable / Rapid Sourcing|Sales + Procurement|sourcing"], ["Sales", "SAL-05", "Order / Booking / Reservation|Sales|orders"], ["Sales", "SAL-06", "Quote|Sales|quotes"],
  ["Sales", "SAL-07", "Payment|Sales + Finance|pos"], ["Sales", "SAL-08", "Supplier-to-Store Rapid Fulfilment|Sales + Procurement + Logistics + Inventory|sourcing"],
  ["Sales", "SAL-09", "Direct Supplier-to-Customer|Sales + Procurement + Logistics|sourcing"], ["Sales", "SAL-10", "Website Order|Sales / CX|digital"], ["Sales", "SAL-11", "WhatsApp / Instagram / Phone|Sales / CX|digital"],
  ["Sales", "SAL-12", "Business / Corporate|Corporate Sales|quotes"], ["Sales", "SAL-13", "Delivery / Collection|Sales + Logistics|logistics"], ["Sales", "SAL-14", "Lost Sales|Sales|reports"],
  ["Sales", "SAL-15", "Cancel / Refund|Sales + CX + Finance|digital"], ["Sales", "SAL-16", "Follow-Up / After-sales|Sales / CX|enquiries"],
  ["Procurement", "PRO-01", "Supplier Onboarding|Procurement|procurement"], ["Procurement", "PRO-02", "Weekly Supplier Price List|Procurement|procurement"], ["Procurement", "PRO-03", "Customer-Backed Sourcing|Procurement|sourcing"],
  ["Procurement", "PRO-04", "Supplier Comparison|Procurement|sourcing"], ["Procurement", "PRO-05", "Customer Price from Supplier Cost|Procurement / Commercial|sourcing"], ["Procurement", "PRO-06", "Purchase Order|Procurement|procurement"],
  ["Procurement", "PRO-07", "PO via WhatsApp|Procurement|procurement"], ["Procurement", "PRO-08", "Pickup Code|Procurement + Logistics|logistics"], ["Procurement", "PRO-09", "Serialized Item at Pickup|Procurement + Logistics|logistics"],
  ["Procurement", "PRO-10", "Supplier-to-Store|Procurement + Logistics|sourcing"], ["Procurement", "PRO-11", "Direct Supplier-to-Customer|Procurement + Logistics|sourcing"], ["Procurement", "PRO-12", "Direct-sale Packaging|Procurement / Operations|audit"],
  ["Procurement", "PRO-13", "Stock Replenishment|Procurement + Inventory|procurement"], ["Procurement", "PRO-14", "Repair Parts|Procurement|repairs"], ["Procurement", "PRO-15", "Partial Supplier Availability|Procurement|procurement"],
  ["Procurement", "PRO-16", "Price Change After Confirmation|Procurement + Sales|sourcing"], ["Procurement", "PRO-17", "Supplier Failure After Customer Payment|Procurement + Sales + Finance|sourcing"],
  ["Procurement", "PRO-18", "Delivery Discrepancy|Procurement + Inventory|procurement"], ["Procurement", "PRO-19", "Supplier Return|Procurement + Inventory + Finance|procurement"], ["Procurement", "PRO-20", "Internal Purchase|Procurement / Operations|finance"],
  ["Inventory", "INV-01", "Product Receiving|Inventory|procurement"], ["Inventory", "INV-02", "Serial / IMEI Capture|Inventory|inventory"], ["Inventory", "INV-03", "Available Stock|Inventory|pos"], ["Inventory", "INV-04", "Stock Reservation|Inventory + Sales|inventory"],
  ["Inventory", "INV-05", "Customer-Backed Supplier Receipt|Inventory|sourcing"], ["Inventory", "INV-06", "Direct Supplier-to-Customer Inventory Event|Inventory/System|sourcing"], ["Inventory", "INV-07", "Stock Movement & Custody|Inventory|logistics"],
  ["Inventory", "INV-08", "Physical Stock Count|Inventory|inventory"], ["Inventory", "INV-09", "Inventory Variance|Inventory + Operations|inventory"], ["Inventory", "INV-10", "Damage / Quarantine|Inventory|inventory"],
  ["Inventory", "INV-11", "Customer Return Receipt|Inventory + CX|returns"], ["Inventory", "INV-12", "Failed Delivery Return|Inventory + Logistics|logistics"], ["Inventory", "INV-13", "Low Stock & Replenishment|Inventory + Procurement|inventory"],
  ["Digital", "DIG-01", "Website Product Availability|Digital / Inventory|"], ["Digital", "DIG-02", "Website Order Creation|Digital / Sales|digital"], ["Digital", "DIG-03", "Website Order - Stock Available|Sales / Fulfilment|digital"],
  ["Digital", "DIG-04", "Website Order - No Physical Stock|Sales + Procurement|digital"], ["Digital", "DIG-05", "Pending / Failed Online Payment|Digital + Finance|digital"], ["Digital", "DIG-06", "Abandoned Digital Interest|Sales / Marketing|digital"],
  ["Digital", "DIG-07", "Instagram to Sale|Sales / CX|digital"], ["Digital", "DIG-08", "WhatsApp to Sale|Sales / CX|digital"], ["Digital", "DIG-09", "Digital Follow-Up Queue|Sales / CX|digital"],
  ["Digital", "DIG-10", "Order Amendment|Sales / Digital|digital"], ["Digital", "DIG-11", "Online Cancellation / Refund|CX + Finance|digital"], ["Digital", "DIG-12", "Digital Customer Notifications|Digital / CX|digital"],
  ["Logistics", "LOG-01", "Delivery / Pickup Request|Sales / Procurement / CX|logistics"], ["Logistics", "LOG-02", "Supplier Pickup|Logistics|logistics"], ["Logistics", "LOG-03", "Pickup Code Control|Logistics|logistics"],
  ["Logistics", "LOG-04", "Custody Tracking|Logistics|logistics"], ["Logistics", "LOG-05", "Supplier to Store|Logistics|logistics"], ["Logistics", "LOG-06", "Cybervilla to Customer|Logistics|logistics"],
  ["Logistics", "LOG-07", "Supplier Direct to Customer|Logistics|logistics"], ["Logistics", "LOG-08", "Delivery Tracking|Logistics|logistics"], ["Logistics", "LOG-09", "Customer Delivery Notification|Sales / CX|digital"],
  ["Logistics", "LOG-10", "Proof of Delivery|Logistics|logistics"], ["Logistics", "LOG-11", "Failed Delivery|Logistics + Sales/CX|logistics"], ["Logistics", "LOG-12", "Full COD|Logistics + Finance|logistics"],
  ["Logistics", "LOG-13", "Part Payment + COD|Sales + Logistics + Finance|logistics"], ["Logistics", "LOG-14", "Prepaid Delivery|Logistics|logistics"], ["Logistics", "LOG-15", "Delivery Fee Treatment|Finance / Commercial|logistics"],
  ["Logistics", "LOG-16", "COD Receivable|Finance|logistics"], ["Logistics", "LOG-17", "Speedaf Settlement|Finance|finance-admin"], ["Logistics", "LOG-18", "Speedaf Reconciliation|Finance|finance-admin"],
  ["Logistics", "LOG-19", "Customer Return Pickup|CX + Logistics|logistics"], ["Logistics", "LOG-20", "Supplier Return Logistics|Procurement + Logistics|logistics"], ["Logistics", "LOG-21", "Logistics Exception Escalation|Logistics + Operations|overview"],
  ["Logistics", "LOG-22", "Logistics Performance Review|Operations / Management|reports"],
  ...Array.from({ length: 20 }, (_, index): [Area, string, string] => ["Repairs", "REP-" + String(index + 1).padStart(2, "0"), ["Repair Enquiry / Booking", "Repair Pickup", "Device Intake", "Repair Custody", "Technician Assignment", "Diagnosis", "Diagnosis to Quote", "Customer Repair Approval", "Change in Repair Scope", "Repair Parts Check",
    "Repair-Part Sourcing", "Repair Execution", "Repair Blocker", "Quality Control", "Customer Updates During Repair", "Ready for Collection", "Repair Payment", "Repair Collection", "Repair Delivery", "Uncollected Device"][index] + "|Repairs desk|repairs"]),
  ["Customer care", "CX-01", "Customer Complaint Intake|Customer Experience|support"], ["Customer care", "CX-02", "Complaint Routing|Customer Experience|support"], ["Customer care", "CX-03", "Complaint Priority|Customer Experience / Operations|support"],
  ["Customer care", "CX-04", "Customer Update Standard|Customer Experience|support"], ["Customer care", "CX-05", "Complaint Resolution / Closure|Customer Experience|support"], ["Customer care", "CX-06", "Service Recovery|CX / Management|support"],
  ["Customer care", "WAR-01", "Product Warranty Request|CX / Technical|returns"], ["Customer care", "WAR-02", "Repair Warranty / Repeat Repair|CX + Repairs|repairs"], ["Customer care", "WAR-03", "Warranty Rework|Repairs|repairs"], ["Customer care", "WAR-04", "Supplier Warranty|CX + Procurement|procurement"],
  ["Customer care", "RET-01", "Return Request|CX|returns"], ["Customer care", "RET-02", "Physical Return Receipt|Inventory + CX|returns"], ["Customer care", "RET-03", "Return Disposition|Inventory + CX / Management|returns"],
  ["Customer care", "RET-04", "Wrong Item / Variant|CX + Inventory / Logistics|returns"], ["Customer care", "RET-05", "Damaged on Delivery|CX + Logistics|returns"],
  ["Customer care", "REF-01", "Refund Request|CX + Finance|returns"], ["Customer care", "REF-02", "Refund Processing|Finance|pos"], ["Customer care", "REF-03", "Refund Completion|Finance + CX|pos"],
  ["Finance", "FIN-01", "Customer Payment|Finance / Sales|pos"], ["Finance", "FIN-02", "Payment Methods|Finance|pos"], ["Finance", "FIN-03", "Customer Receivable|Finance|finance-admin"], ["Finance", "FIN-04", "COD Receivable|Finance|finance-admin"],
  ["Finance", "FIN-05", "Speedaf Reconciliation|Finance|finance-admin"], ["Finance", "FIN-06", "Supplier Bill / Payable|Finance|procurement"], ["Finance", "FIN-07", "Supplier Payment|Finance|finance-admin"], ["Finance", "FIN-08", "Logistics Payable|Finance|logistics"],
  ["Finance", "FIN-09", "Expense Request|Requester + Finance|finance"], ["Finance", "FIN-10", "Petty Cash / Small Expense|Finance|finance"], ["Finance", "FIN-11", "Refund|Finance|pos"], ["Finance", "FIN-12", "Customer Deposit|Finance / Sales|orders"],
  ["Finance", "FIN-13", "Cash / Bank Reconciliation|Finance|finance"], ["Finance", "FIN-14", "Unreconciled Transaction|Finance|finance"], ["Finance", "FIN-15", "Revenue / Collection Reporting|Finance / Management|reports"],
  ["Finance", "FIN-16", "Cost of Goods / Repair Parts Cost|Finance / System|reports"], ["Finance", "FIN-17", "Profitability|Management / Finance|reports"], ["Finance", "FIN-18", "Fixed Asset Purchase|Finance / Management|finance"],
  ["Finance", "FIN-19", "Payroll|Finance / HR|"], ["Finance", "FIN-20", "Financial Approval|Authorised approver|finance"],
  ["Operations", "OPS-01", "Opening Routine|Operations / Branch Manager|routines"], ["Operations", "OPS-02", "Daily Team Allocation|Operations Manager|routines"], ["Operations", "OPS-03", "Start-of-Day Exception Review|Operations Manager|routines"],
  ["Operations", "OPS-04", "Daily Shopfloor & Sales Oversight|Operations / Business Manager|overview"], ["Operations", "OPS-05", "Daily Exception Management|Operations|overview"], ["Operations", "OPS-06", "Daily Closing Routine|Operations / Branch Manager|routines"],
  ["Operations", "OPS-07", "End-of-Day Reporting|System / Operations|routines"], ["Operations", "OPS-08", "Daily Manager Review|Business / Operations Manager|reports"], ["Operations", "OPS-09", "Weekly Operations Review|Management|reports"],
  ["Operations", "OPS-10", "Weekly Meeting Action Log|Management / Operations|routines"], ["Operations", "OPS-11", "Monthly Management Review|Management|reports"], ["Operations", "OPS-12", "SOP Adoption - Learn|Managers / Academy|library"],
  ["Operations", "OPS-13", "SOP Adoption - Demonstrate|Managers / Academy|library"], ["Operations", "OPS-14", "SOP Adoption - Execute & Sustain|Managers / Operations|library"], ["Operations", "OPS-15", "Expected Result Achievement Review|Management|reports"],
  ["Operations", "OPS-16", "SOP Change Management|Management / Product / Operations|library"],
];
export const WORKFLOW_CATALOG: WorkflowCode[] = rows.map(([area, code, rest]) => { const [name, owner, where] = rest.split("|"); return { code, name, area, owner, where: where as Where }; });
export const codeExists = (code: string) => WORKFLOW_CATALOG.some((entry) => entry.code === code);
export const AREAS: Area[] = ["Sales", "Procurement", "Inventory", "Digital", "Logistics", "Repairs", "Customer care", "Finance", "Operations"];
export function coverage(catalog = WORKFLOW_CATALOG) {
  return AREAS.map((area) => { const mine = catalog.filter((entry) => entry.area === area); return { area, total: mine.length, built: mine.filter((entry) => entry.where && entry.where !== "repairs").length, repairs: mine.filter((entry) => entry.where === "repairs").length, gaps: mine.filter((entry) => !entry.where) }; });
}
