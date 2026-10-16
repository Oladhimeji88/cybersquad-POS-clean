import { getTickets, type Ticket } from "@/frontdesk/lib/store";
import { getRefunds, getSales, type Refund, type Sale } from "@/pos/lib/store";
import { getBusiness, type Enquiry } from "./business";
import { countStore, quarantineStore, reservationStore, varianceStore, type QuarantineItem, type Reservation, type StockCount, type Variance } from "./inventoryOps";
import { jobStore, logisticsWorkItems, type LogisticsJob } from "./logistics";
import { poStore, priceStore, procurementWorkItems, replenishmentStore, supplierReturnStore, supplierStore, type PriceEntry, type PurchaseOrder, type Replenishment, type Supplier, type SupplierReturn } from "./procurement";
import { getPolicy, type OpsPolicy } from "./policy";
import { quoteStore, quoteWorkItems, type Quote } from "./quotes";
import { getReturns, type ReturnCase } from "./returns";
import { actionStore, adoptionStore, dayStore, routinesWorkItems, sopStore, type ActionItem, type Adoption, type DayRecord, type SopVersion } from "./routines";
import { getSourcing, type SourcingRequest } from "./sourcing";
import { complaintStore, complaintWorkItems, type Complaint } from "./support";
import { abandonedStore, digitalWorkItems, webOrderStore, type AbandonedInterest, type WebOrder } from "./digital";
import { expenseStore, financeWorkItems, reconciliationStore, type Expense, type Reconciliation } from "./finops";
import { inventoryWorkItems } from "./inventoryOps";
import { buildWorkItems, withOverrides, type WorkItem } from "./workItems";

// Everything the Operations screens read, loaded together so every view agrees on the same snapshot.
export interface OpsData {
  policy: OpsPolicy; sales: Sale[]; refunds: Refund[]; tickets: Ticket[]; enquiries: Enquiry[]; blockers: Awaited<ReturnType<typeof getBusiness>>["blockers"];
  sourcing: SourcingRequest[]; returns: ReturnCase[]; suppliers: Supplier[]; prices: PriceEntry[]; pos: PurchaseOrder[]; supplierReturns: SupplierReturn[]; replenishments: Replenishment[];
  jobs: LogisticsJob[]; counts: StockCount[]; variances: Variance[]; quarantine: QuarantineItem[]; reservations: Reservation[]; complaints: Complaint[]; quotes: Quote[];
  webOrders: WebOrder[]; abandoned: AbandonedInterest[]; expenses: Expense[]; reconciliations: Reconciliation[]; days: DayRecord[]; actions: ActionItem[]; adoption: Adoption[]; sop: SopVersion[];
}
export async function loadOpsData(): Promise<OpsData> {
  const [policy, sales, refunds, tickets, business, sourcing, returns, suppliers, prices, pos, supplierReturns, replenishments, jobs, counts, variances, quarantine, reservations, complaints, quotes, webOrders, abandoned, expenses, reconciliations, days, actions, adoption, sop] = await Promise.all([
    getPolicy(), getSales(), getRefunds(), getTickets(), getBusiness(), getSourcing(), getReturns(), supplierStore.all(), priceStore.all(), poStore.all(), supplierReturnStore.all(), replenishmentStore.all(), jobStore.all(), countStore.all(), varianceStore.all(),
    quarantineStore.all(), reservationStore.all(), complaintStore.all(), quoteStore.all(), webOrderStore.all(), abandonedStore.all(), expenseStore.all(), reconciliationStore.all(), dayStore.all(), actionStore.all(), adoptionStore.all(), sopStore.all(),
  ]);
  return { policy, sales, refunds, tickets, enquiries: business.enquiries, blockers: business.blockers, sourcing, returns, suppliers, prices, pos, supplierReturns, replenishments, jobs, counts, variances, quarantine, reservations, complaints, quotes,
    webOrders, abandoned, expenses, reconciliations, days, actions, adoption, sop };
}

// One queue across every department (OPS-05). Repairs are included read-only from the existing repair records.
export function buildAllWorkItems(data: OpsData, now = Date.now()): WorkItem[] {
  const { policy } = data;
  const items = [
    ...buildWorkItems({ sales: data.sales, refunds: data.refunds, tickets: data.tickets, enquiries: data.enquiries, sourcing: data.sourcing, returns: data.returns, policy, now }),
    ...procurementWorkItems({ pos: data.pos, returns: data.supplierReturns, replenishments: data.replenishments, policy, now }),
    ...logisticsWorkItems(data.jobs, policy, now),
    ...inventoryWorkItems({ counts: data.counts, variances: data.variances, quarantine: data.quarantine, reservations: data.reservations, policy, now }),
    ...complaintWorkItems(data.complaints, now), ...quoteWorkItems(data.quotes, now), ...digitalWorkItems({ orders: data.webOrders, abandoned: data.abandoned, policy, now }),
    ...financeWorkItems({ expenses: data.expenses, reconciliations: data.reconciliations, now }), ...routinesWorkItems({ actions: data.actions, sop: data.sop, now }),
  ];
  return withOverrides(items, data.blockers, now);
}
