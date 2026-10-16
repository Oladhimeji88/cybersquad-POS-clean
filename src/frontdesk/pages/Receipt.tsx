import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createInvoice,
  AppSettings,
  getInventory,
  getLatestInvoiceByTicketAndType,
  getSettings,
  getTickets,
  InventoryItem,
  Invoice,
  Ticket,
  DEFAULT_SETTINGS,
  PAYMENT_MODE_LABELS,
  PaymentMode,
} from "@/frontdesk/lib/store";
import { getInventoryPartName, getTicketPartRequests } from "@/frontdesk/lib/parts";
import { formatCurrency, printInvoice } from "@/frontdesk/lib/invoice";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, Printer, ArrowLeft, ReceiptText } from "lucide-react";
import { toast } from "sonner";

export default function Receipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const requestedPaymentMode = searchParams.get("paymentMode");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [tickets, inventoryData, appSettings] = await Promise.all([
          getTickets(),
          getInventory(),
          getSettings(),
        ]);
        const found = tickets.find((item) => item.id === id);

        if (!mounted) return;
        if (!found) {
          setLoading(false);
          return;
        }

        setTicket(found);
        setInventory(inventoryData);
        setSettings(appSettings);

        if (!found.quotation || found.quotation <= 0 || !found.diagnosis) {
          setLoading(false);
          return;
        }

        const preferredPaymentMode: PaymentMode =
          requestedPaymentMode === "bank_transfer" ||
          requestedPaymentMode === "cash" ||
          requestedPaymentMode === "pos"
            ? requestedPaymentMode
            : found.repairPaymentMode;

        const existing = await getLatestInvoiceByTicketAndType(found.id, "repair_quote");
        if (existing && existing.paymentMode === preferredPaymentMode) {
          if (mounted) setReceipt(existing);
          setLoading(false);
          return;
        }

        const created = await createInvoice({
          ticketId: found.id,
          jobId: found.jobId,
          customerName: found.customer.name,
          customerPhone: found.customer.phone,
          customerEmail: found.customer.email,
          deviceLabel: `${found.device.make} ${found.device.model}`.trim(),
          type: "repair_quote",
          description: "Repair quotation payment request",
          amount: found.quotation,
          paymentMode: preferredPaymentMode,
        });

        if (mounted) setReceipt(created);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [id, requestedPaymentMode]);

  const handlePrintReceipt = () => {
    if (!ticket || !receipt) return;
    printInvoice(receipt, ticket, settings);
  };

  const handleCopyReceiptLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Receipt link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Preparing receipt...</div>;
  }

  if (!ticket) {
    return <div className="text-center py-20 text-muted-foreground">Ticket not found.</div>;
  }

  if (!ticket.diagnosis || !ticket.quotation || ticket.quotation <= 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(`/ticket/${ticket.id}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Ticket
        </Button>
        <div className="glass-card p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-foreground">Receipt not ready</p>
          <p className="text-sm text-muted-foreground">
            Complete diagnosis and set a quotation first.
          </p>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return <div className="text-center py-20 text-muted-foreground">Could not generate receipt.</div>;
  }

  const requestedParts = getTicketPartRequests(ticket).map((request) =>
    getInventoryPartName(request.partId, inventory, request.partName)
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(`/ticket/${ticket.id}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Ticket
        </Button>
        <Button variant="outline" onClick={handleCopyReceiptLink}>
          <Copy className="w-4 h-4 mr-2" />
          Copy Link
        </Button>
        <Button onClick={handlePrintReceipt}>
          <Printer className="w-4 h-4 mr-2" />
          Print / Download
        </Button>
      </div>

      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Repair Payment Receipt</h1>
              <p className="text-sm text-muted-foreground">Send to customer for payment</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-semibold text-primary">{receipt.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(receipt.issuedAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">Customer</p>
            <p className="text-foreground font-medium">{ticket.customer.name}</p>
            <p className="text-muted-foreground">{ticket.customer.phone}</p>
            <p className="text-muted-foreground">{ticket.customer.email}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Device</p>
            <p className="text-foreground font-medium">
              {ticket.device.make} {ticket.device.model}
            </p>
            <p className="text-muted-foreground font-mono">IMEI: {ticket.device.imei}</p>
            <p className="text-muted-foreground">Job ID: {ticket.jobId}</p>
            <p className="text-muted-foreground">
              Payment Mode: {PAYMENT_MODE_LABELS[receipt.paymentMode]}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-4 text-sm">
          <p>
            <strong className="text-foreground">Diagnosis:</strong>{" "}
            <span className="text-muted-foreground">{ticket.diagnosis}</span>
          </p>
          <p>
            <strong className="text-foreground">Part{requestedParts.length === 1 ? "" : "s"}:</strong>{" "}
            <span className="text-muted-foreground">
              {requestedParts.length > 0 ? requestedParts.join(", ") : "Not specified"}
            </span>
          </p>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-foreground font-semibold">Amount Due</span>
            <span className="text-2xl font-bold gradient-text">
              {formatCurrency(ticket.quotation)}
            </span>
          </div>
        </div>

        {settings.paymentInstructions && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Payment Instructions:</strong>{" "}
              {settings.paymentInstructions}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" />
          <span>Receipt generated and ready to share.</span>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        After customer payment confirmation, return to{" "}
        <Link to={`/ticket/${ticket.id}`} className="text-primary hover:underline">
          Ticket Details
        </Link>{" "}
        and continue the workflow.
      </div>
    </div>
  );
}
