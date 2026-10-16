// Prototype helper: rings up a handful of COD orders in assorted states so the
// whole COD -> settlement -> payment -> Odoo flow can be walked through without
// first selling things at the till. These go through the real createSale /
// updateCodStatus paths, so they obey every rule real orders do.
import { COD_COURIER, createSale, updateCodStatus, type CodStatus } from "@/pos/lib/store";

const ORDERS: { customer: string; phone: string; item: string; price: number; fee: number; status: CodStatus }[] = [
  { customer: "John Doe", phone: "08030000001", item: "Wireless Earbuds", price: 85000, fee: 2500, status: "delivered" },
  { customer: "Mary Smith", phone: "08030000002", item: "Phone Case Bundle", price: 120000, fee: 3000, status: "collected" },
  { customer: "David Ibe", phone: "08030000003", item: "Laptop Stand", price: 75000, fee: 2000, status: "delivered" },
  { customer: "Amaka Obi", phone: "08030000004", item: "Power Bank 20000mAh", price: 45000, fee: 1500, status: "collected" },
  { customer: "Tunde Bello", phone: "08030000005", item: "Bluetooth Speaker", price: 60000, fee: 2000, status: "pending" },
  { customer: "Ngozi Eze", phone: "08030000006", item: "USB-C Hub", price: 30000, fee: 1000, status: "cancelled" },
];

export async function seedDemoCodOrders(actor: string) {
  for (const order of ORDERS) {
    const sale = await createSale({
      cashierName: actor, channel: "in_store", customer: { name: order.customer, phone: order.phone },
      note: "Prototype demo order",
      lines: [{ productId: "demo-cod-" + order.item, name: order.item, quantity: 1, unitPrice: order.price }],
      subtotal: order.price, total: order.price, payments: [], paymentMode: "cod",
      cod: { courier: COD_COURIER, address: "12 Admiralty Way, Lekki, Lagos", fee: order.fee, status: "pending", history: [] },
    } as never);
    if (order.status === "delivered" || order.status === "collected") await updateCodStatus(sale.id, "delivered", actor);
    if (order.status === "collected") await updateCodStatus(sale.id, "collected", actor);
    if (order.status === "cancelled") await updateCodStatus(sale.id, "cancelled", actor);
  }
}
