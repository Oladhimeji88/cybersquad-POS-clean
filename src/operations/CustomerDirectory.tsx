import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTickets, type Ticket } from "@/frontdesk/lib/store";
import { getSales, getRefunds, type Sale, type Refund } from "@/pos/lib/store";
import type { SaleCustomer } from "@/pos/lib/devices";
import { SaleRecordDetailModal } from "@/components/SaleRecordDetailModal";
import CustomerPicker from "./CustomerPicker";
import { getBusiness, getCustomerDirectory, sameCustomer, type DirectoryCustomer, type Enquiry } from "./business";
import { formatCurrency } from "@/frontdesk/lib/invoice";

export default function CustomerDirectory({ onOpenRepair }: { onOpenRepair: (ticket: Ticket) => void }) {
  const [customers, setCustomers] = useState<DirectoryCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<SaleCustomer>();
  const [sales, setSales] = useState<Sale[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);

  const load = () => Promise.all([getCustomerDirectory(), getSales(), getTickets(), getRefunds(), getBusiness()])
    .then(([contacts, orders, repairs, returns, business]) => {
      setEnquiries(business.enquiries);
      setCustomers(contacts);
      setSales(orders);
      setTickets(repairs);
      setRefunds(returns);
    })
    .catch(() => toast.error("Could not load customer history."));

  useEffect(() => { void load(); }, []);

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((entry) => `${entry.name} ${entry.phone} ${entry.email}`.toLowerCase().includes(needle));
  }, [customers, query]);

  const selectedSales = sales.filter((sale) => !sale.isDemo && sameCustomer(sale.customer, customer));
  const selectedEnquiries = enquiries.filter((enquiry) => sameCustomer(enquiry.customer, customer));
  const selectedTickets = tickets.filter((ticket) => sameCustomer(ticket.customer, customer));
  const hasActivity = selectedSales.length > 0 || selectedEnquiries.length > 0 || selectedTickets.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Customer Directory</CardTitle>
          <CardDescription>Find a customer, review purchases, returns, enquiries, and repair history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomerPicker value={customer} onChange={(value) => { setCustomer(value); void load(); }} />
          <Input placeholder="Search customer name, phone or email" aria-label="Search customer directory" value={query} onChange={(event) => setQuery(event.target.value)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
            <CardDescription>{visibleCustomers.length} shown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[36rem] overflow-y-auto pr-1">
              {visibleCustomers.map((entry) => (
                <button key={entry.id} type="button" className="w-full text-left rounded-lg border border-border p-4 hover:bg-secondary" onClick={() => setCustomer(entry)}>
                  <span className="block font-medium">{entry.name}</span>
                  <span className="text-sm text-muted-foreground">{entry.phone} - {entry.email}</span>
                </button>
              ))}
              {!customers.length && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No customers yet.</p>}
              {customers.length > 0 && !visibleCustomers.length && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No customers match your search.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{customer?.name ? customer.name : "Customer Activity"}</CardTitle>
            <CardDescription>Purchases, returns, enquiries, and repairs for the selected customer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!customer?.name && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a customer to see their history.</p>}
            {customer?.name && !hasActivity && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">This customer is saved as a contact but has no sales or repair history yet.</p>}

            {selectedSales.map((sale) => (
              <div key={sale.id} className="rounded-lg border border-border p-4 space-y-1">
                <Button variant="link" className="h-auto p-0" onClick={() => setSelected(sale)}>{sale.saleNumber}</Button>
                <p className="text-sm text-muted-foreground">{formatCurrency(sale.total)} - {sale.lifecycle ?? "completed"}</p>
                {refunds.filter((refund) => refund.saleId === sale.id && refund.status !== "cancelled").map((refund) => (
                  <p key={refund.id} className="text-xs text-muted-foreground">Refund {formatCurrency(refund.total)} - {refund.status}</p>
                ))}
              </div>
            ))}

            {selectedEnquiries.map((enquiry) => (
              <div key={enquiry.id} className="rounded-lg border border-border p-4 text-sm space-y-1">
                <p className="font-medium">Enquiry: {enquiry.request}</p>
                <p className="text-muted-foreground">{enquiry.status} - {enquiry.owner} - follow up {new Date(enquiry.followUpAt).toLocaleDateString()} - {enquiry.contacts?.length ?? 0} contact(s)</p>
              </div>
            ))}

            {selectedTickets.map((ticket) => (
              <Button key={ticket.id} variant="outline" className="w-full justify-start" onClick={() => onOpenRepair(ticket)}>
                {ticket.jobId} - {ticket.device.model} - {ticket.status.replaceAll("_", " ")}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <SaleRecordDetailModal open={Boolean(selected)} sale={selected} onOpenChange={(open: boolean) => { if (!open) { setSelected(null); void load(); } }} />
    </div>
  );
}
