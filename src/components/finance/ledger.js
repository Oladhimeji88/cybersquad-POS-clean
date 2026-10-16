// Shared normalisation for the Receivables and Payables screens: both are the
// same shape (a counterparty, a reference, an amount, a due date, a status).
import { isWithinRange } from "../../pos/lib/store";
import { settlementBalance, settlementPaid, settlementStatus } from "../../finance/lib/settlements";

const num = (value) => Number(value) || 0;

export function normaliseOdooRows(rows, party) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: "odoo:" + (row.id ?? row.reference),
    party: row[party] ?? row.partner ?? "-",
    reference: row.reference ?? "-",
    amount: num(row.amount),
    balance: row.balance === undefined ? (row.status === "paid" ? 0 : num(row.amount)) : num(row.balance),
    issuedOn: row.issue_date,
    dueOn: row.due_date,
    status: row.status,
    source: "odoo",
  }));
}

// Speedef settlements are receivables too (PRD US5). Once Odoo returns the
// invoice for a synced settlement, the local row stays and the Odoo copy is
// dropped: payments recorded against it must update the settlement (balance,
// COD orders -> Settled), which only the local record can do.
export function mergeReceivables(settlements, odooRows = []) {
  const local = new Set(settlements.map((item) => item.reference));
  const rows = settlements.map((item) => ({
    id: "settlement:" + item.id,
    party: item.courier,
    reference: item.reference,
    amount: item.net,
    balance: settlementBalance(item),
    paid: settlementPaid(item),
    issuedOn: item.issuedOn,
    dueOn: item.dueOn,
    status: settlementStatus(item),
    source: "settlement",
    settlement: item,
  }));
  return [...rows, ...odooRows.filter((row) => !local.has(row.reference))];
}

export function filterRows(rows, { range, status, query }) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) =>
    (!row.issuedOn || isWithinRange(row.issuedOn, range)) &&
    (status === "all" || row.status === status) &&
    (!needle || row.party.toLowerCase().includes(needle) || row.reference.toLowerCase().includes(needle)));
}

export function ledgerTotals(rows, now = new Date()) {
  const open = rows.filter((row) => row.status !== "paid");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const sum = (list) => list.reduce((total, row) => total + row.balance, 0);
  const dueThisMonth = open.filter((row) => row.dueOn && new Date(row.dueOn).getTime() >= monthStart && new Date(row.dueOn).getTime() < monthEnd);
  return {
    outstanding: sum(open), outstandingCount: open.length,
    overdue: sum(open.filter((row) => row.status === "overdue")), overdueCount: open.filter((row) => row.status === "overdue").length,
    dueThisMonth: sum(dueThisMonth),
  };
}
