import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DEVICE_TYPE_LABELS, STATUS_PROGRESS, Ticket } from "@/frontdesk/lib/store";
import { getTickets } from "@/frontdesk/lib/store";
import { getSales, type Sale } from "@/pos/lib/store";
import { getCustomerDirectory, sameCustomer, type DirectoryCustomer } from "@/operations/business";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { SaleRecordDetailModal } from "@/components/SaleRecordDetailModal";
import SearchField from "@/frontdesk/components/SearchField";
import StatusBadge from "@/frontdesk/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, ReceiptText, UserRound, Wrench } from "lucide-react";

type CustomerGroup = {
  key: string;
  name: string;
  phone: string;
  email: string;
  contact: DirectoryCustomer;
  tickets: Ticket[];
  sales: Sale[];
  latestUpdatedAt: number;
};

function ticketDeviceType(ticket: Ticket) {
  return ticket.device.type ?? "other";
}

function ticketProgress(status: Ticket["status"]) {
  return STATUS_PROGRESS[status] ?? 0;
}

function saleUpdatedAt(sale: Sale) {
  return new Date(sale.collectionDueAt ?? sale.orderCreatedAt ?? sale.createdAt).getTime();
}

function groupKey(customer: DirectoryCustomer) {
  return customer.email?.trim().toLowerCase() || customer.phone.trim() || customer.id;
}

export default function CustomerRecords() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<DirectoryCustomer[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState((searchParams.get("query") ?? "").trim());
  const [deviceFilter, setDeviceFilter] = useState("all");

  useEffect(() => {
    let mounted = true;

    void Promise.all([getCustomerDirectory(), getTickets(), getSales()])
      .then(([contacts, repairTickets, saleRecords]) => {
        if (!mounted) return;
        setCustomers(contacts);
        setTickets(repairTickets);
        setSales(saleRecords.filter((sale) => !sale.isDemo));
      })
      .catch(() => {
        if (!mounted) return;
        setCustomers([]);
        setTickets([]);
        setSales([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const customerGroups = useMemo(() => {
    return customers.map((contact) => {
      const customerTickets = tickets
        .filter((ticket) => sameCustomer(ticket.customer, contact))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const customerSales = sales
        .filter((sale) => sameCustomer(sale.customer, contact))
        .sort((a, b) => saleUpdatedAt(b) - saleUpdatedAt(a));
      const latestUpdatedAt = Math.max(
        0,
        ...customerTickets.map((ticket) => new Date(ticket.updatedAt).getTime()),
        ...customerSales.map(saleUpdatedAt),
      );

      return {
        key: groupKey(contact),
        name: contact.name,
        phone: contact.phone,
        email: contact.email ?? "",
        contact,
        tickets: customerTickets,
        sales: customerSales,
        latestUpdatedAt,
      };
    }).sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt || a.name.localeCompare(b.name));
  }, [customers, tickets, sales]);

  const deviceFilters = useMemo(() => {
    const availableTypes = Array.from(
      new Set(customerGroups.flatMap((group) => group.tickets.map(ticketDeviceType)))
    ).sort((left, right) => DEVICE_TYPE_LABELS[left].localeCompare(DEVICE_TYPE_LABELS[right]));

    return [
      { value: "all", label: "All Device Types" },
      ...availableTypes.map((value) => ({
        value,
        label: DEVICE_TYPE_LABELS[value],
      })),
    ];
  }, [customerGroups]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return customerGroups.filter((group) => {
      const matchesDeviceFilter =
        deviceFilter === "all" ||
        group.tickets.some((ticket) => ticketDeviceType(ticket) === deviceFilter);

      if (!matchesDeviceFilter) return false;
      if (!normalizedQuery) return true;

      const customerHaystack = [group.name, group.phone, group.email]
        .join(" ")
        .toLowerCase();
      if (customerHaystack.includes(normalizedQuery)) return true;

      const hasTicketMatch = group.tickets.some((ticket) =>
        [
          ticket.jobId,
          ticket.device.make,
          ticket.device.model,
          ticket.device.imei,
          ticket.issueReported ?? "",
          ticket.customerNote ?? "",
          ticket.diagnosis ?? "",
          ticket.device.type ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      );
      if (hasTicketMatch) return true;

      return group.sales.some((sale) =>
        [
          sale.saleNumber,
          sale.lifecycle ?? "completed",
          sale.note ?? "",
          sale.lines.map((line) => [line.name, line.sku ?? ""].join(" ")).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [customerGroups, query, deviceFilter]);

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading customer records...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Check purchases, previous repairs, issues reported, device type, and live progress for returning customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{customerGroups.length} customer{customerGroups.length === 1 ? "" : "s"}</Badge>
          <Badge variant="secondary">
            {customerGroups.filter((group) => group.tickets.length + group.sales.length > 1).length} returning
          </Badge>
        </div>
      </div>

      <div className="glass-card p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer, sale, job ID, issue, diagnosis, IMEI..."
          />
          <Select
            value={deviceFilter}
            onValueChange={setDeviceFilter}
          >
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder="Filter by device type" />
            </SelectTrigger>
            <SelectContent>
              {deviceFilters.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setDeviceFilter("all");
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          {customerGroups.length === 0 ? (
            <p className="text-muted-foreground">No customer records yet. Create a ticket or record a sale.</p>
          ) : (
            <p className="text-muted-foreground">No customer records match your search.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const completedCount = group.tickets.filter((ticket) => ticket.status === "completed").length;
            const activeCount = group.tickets.filter((ticket) => !["completed", "cancelled", "warranty_void"].includes(ticket.status))
              .length;
            const completedSales = group.sales.filter((sale) => !sale.lifecycle || sale.lifecycle === "completed").length;
            const reservedSales = group.sales.filter((sale) => sale.lifecycle === "reserved").length;
            const hasHistory = group.tickets.length > 0 || group.sales.length > 0;

            return (
              <div key={group.key} className="glass-card p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-primary" />
                      <h2 className="text-lg font-semibold text-foreground">{group.name}</h2>
                      {group.tickets.length + group.sales.length > 1 && <Badge>Returning</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {group.phone} {group.email ? `- ${group.email}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {group.sales.length} purchase{group.sales.length === 1 ? "" : "s"} | {group.tickets.length} repair{group.tickets.length === 1 ? "" : "s"}
                  </div>
                </div>

                {!hasHistory && (
                  <p className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                    This customer is saved as a contact but has no sales or repair history yet.
                  </p>
                )}

                {group.sales.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ReceiptText className="h-4 w-4 text-primary" /> Purchases
                      </h3>
                      <p className="text-xs text-muted-foreground">{completedSales} completed | {reservedSales} reserved</p>
                    </div>
                    {group.sales.map((sale) => (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => setSelectedSale(sale)}
                        className="w-full rounded-lg border border-border bg-secondary/30 p-4 text-left transition-colors hover:bg-secondary"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-mono text-sm font-semibold text-primary">{sale.saleNumber}</p>
                            <p className="text-sm text-foreground">{sale.lines.map((line) => line.name).join(", ")}</p>
                            {sale.note && <p className="text-sm text-muted-foreground">Note: {sale.note}</p>}
                          </div>
                          <div className="text-left lg:text-right text-sm">
                            <p className="font-semibold text-foreground">{formatCurrency(sale.total)}</p>
                            <p className="text-muted-foreground">{sale.lifecycle ?? "completed"} - {new Date(sale.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </section>
                )}

                {group.tickets.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Wrench className="h-4 w-4 text-primary" /> Repairs
                      </h3>
                      <p className="text-xs text-muted-foreground">{completedCount} completed | {activeCount} active</p>
                    </div>
                    {group.tickets.map((ticket) => {
                      const progress = ticketProgress(ticket.status);
                      const deviceType = ticketDeviceType(ticket);

                      return (
                        <div key={ticket.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div className="space-y-1">
                              <p className="font-mono text-sm font-semibold text-primary">{ticket.jobId}</p>
                              <p className="text-sm text-foreground">
                                {DEVICE_TYPE_LABELS[deviceType]} - {ticket.device.make} {ticket.device.model}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                IMEI / Serial: {ticket.device.imei}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                <span className="text-foreground font-medium">Issue:</span>{" "}
                                {ticket.issueReported || "Not captured"}
                              </p>
                              {ticket.customerNote && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="text-foreground font-medium">Note:</span>{" "}
                                  {ticket.customerNote}
                                </p>
                              )}
                              {ticket.diagnosis && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="text-foreground font-medium">Diagnosis:</span>{" "}
                                  {ticket.diagnosis}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-start lg:items-end gap-2">
                              <StatusBadge status={ticket.status} />
                              <Link to={`/ticket/${ticket.id}`} className="text-sm text-primary hover:underline">
                                Open Ticket
                              </Link>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium text-foreground">{progress}%</span>
                            </div>
                            <div className="h-2 w-full rounded bg-secondary">
                              <div
                                className="h-full rounded bg-primary transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
            );
          })}
        </div>
      )}
      <SaleRecordDetailModal open={Boolean(selectedSale)} onOpenChange={(open: boolean) => !open && setSelectedSale(null)} sale={selectedSale} />
    </div>
  );
}