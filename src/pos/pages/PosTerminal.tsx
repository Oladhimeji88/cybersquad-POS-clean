import { useEffect, useState } from "react";
import ReserveOrderDialog from "../components/ReserveOrderDialog";
import DeviceSelectionDialog from "../components/DeviceSelectionDialog";
import { SAMPLE_CATALOG } from "../lib/sampleCatalog";
import { validateDeviceLines, type PosProduct, type SaleCustomer } from "../lib/devices";
import { toast } from "sonner";
import { FlaskConical, History, PauseCircle, Wallet, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { fetchPosCatalog } from "@/pos/lib/catalog";
import { validatePosVoucher } from "@/pos/lib/vouchers";
import { usePosCart } from "@/pos/lib/cart";
import {
  COD_COURIER,
  createSale,
  logAudit,
  getSales,
  getHeldSales,
  getActiveShift,
  holdSale,
  resumeHeldSale,
  startShift,
  type CashShift,
  type Sale,
  type SalePayment,
  type SalePaymentMode,
} from "@/pos/lib/store";
import { getAuth, getSettings, AppSettings, User } from "@/frontdesk/lib/store";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import ProductGrid from "@/pos/components/ProductGrid";
import CartPanel from "@/pos/components/CartPanel";
import SaleCompleteDialog from "@/pos/components/SaleCompleteDialog";
import StartShiftDialog from "@/pos/components/StartShiftDialog";
import EndShiftDialog from "@/pos/components/EndShiftDialog";
import HeldSalesDialog from "@/pos/components/HeldSalesDialog";
import HoldSaleDialog from "@/pos/components/HoldSaleDialog";
import RefundsDialog from "@/pos/components/RefundsDialog";
import { SalesDetailModal } from "@/components/SalesDetailModal";

const DISCOUNT_LIMIT_PERCENT = 10;

export default function PosTerminal() {
  const { api } = useApi();
  const cart = usePosCart();

  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [sampleMode, setSampleMode] = useState(false);
  const [note, setNote] = useState("");
  const [showReserve, setShowReserve] = useState(false);
  const [customer, setCustomer] = useState<SaleCustomer>({ name: "", phone: "" });
  const [deviceProduct, setDeviceProduct] = useState<PosProduct | null>(null);
  const [unavailableUnits, setUnavailableUnits] = useState<Set<string>>(new Set());
  const activeCatalog = sampleMode ? SAMPLE_CATALOG : catalog;
  const needsCustomer = cart.lines.some((line) => line.tracking === "serial");
  const deviceCheckoutReady = !needsCustomer || Boolean(customer.name.trim() && customer.phone.trim());
  const [discount, setDiscount] = useState<{ amount: number; reason: string } | null>(null);
  const clearSale = () => { cart.clear(); setNote(""); setCustomer({ name: "", phone: "" }); setDiscount(null); };
  const payable = Math.max(0, cart.subtotal - (discount?.amount ?? 0));
  const selectDevices = async (item: PosProduct) => {
    try {
      const [sales, held] = await Promise.all([getSales(), getHeldSales()]);
      setUnavailableUnits(new Set([...sales.filter((sale) => sale.lifecycle !== "cancelled"), ...held].flatMap((record) =>
        record.lines.flatMap((line) => (line.devices ?? []).map((unit) => unit.id)))));
      setDeviceProduct(item);
    } catch {
      toast.error("Could not check device availability. Try again.");
    }
  };
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings | undefined>(undefined);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  const [shift, setShift] = useState<CashShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [showHoldPrompt, setShowHoldPrompt] = useState(false);
  const [showSaleHistory, setShowSaleHistory] = useState(false);
  const [showRefunds, setShowRefunds] = useState(false);
  const [heldRefreshKey, setHeldRefreshKey] = useState(0);

  useEffect(() => { setDiscount(null); }, [cart.subtotal]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); document.querySelector<HTMLInputElement>('input[placeholder^="Search by name"]')?.focus(); }
      else if (event.key === "F4") { event.preventDefault(); setShowRefunds(true); }
      else if (event.key === "F7" && cart.lines.length > 0) { event.preventDefault(); setShowHoldPrompt(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.lines.length]);

  useEffect(() => {
    if (cart.lines.length === 0) { setCustomer({ name: "", phone: "" }); setNote(""); }
  }, [cart.lines.length]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [items, authUser, appSettings, activeShift] = await Promise.all([
          fetchPosCatalog(api).catch((error) => {
            console.error("Could not load catalog", error);
            toast.error("Could not load the product catalog. Sample devices are still available.");
            return [];
          }),
          getAuth(),
          getSettings(),
          getActiveShift(),
        ]);
        if (!mounted) return;
        setCatalog(items);
        setUser(authUser);
        setSettings(appSettings);
        setShift(activeShift);
      } catch (err) {
        console.error("Failed to load POS terminal:", err);
        toast.error("Could not load the product catalog.");
      } finally {
        if (mounted) {
          setLoading(false);
          setShiftLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddItem = (item: PosProduct, quantity = 1) => {
    if (item.tracking === "serial") { void selectDevices(item); return; }
    const existing = cart.lines.find((line) => line.productId === item.id)?.quantity ?? 0;
    if (existing + quantity > item.quantity - item.locked) { toast.error("Requested quantity is not available."); return; }
    cart.addItem(item, quantity);
  };

  const handleStartShift = async (openingFloat: number) => {
    const newShift = await startShift(user?.name || "Cashier", openingFloat);
    setShift(newShift);
    setShowStartShift(false);
    toast.success("Shift started.");
  };

  const handleHold = (label: string) => {
    void holdSale({ label, lines: cart.lines, subtotal: cart.subtotal, customer, note }).then(() => {
      clearSale();
      setShowHoldPrompt(false);
      setHeldRefreshKey((k) => k + 1);
      toast.success("Sale held.");
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not hold sale."));
  };

  const handleResume = (heldSaleId: string) => {
    if (cart.lines.length > 0) {
      toast.error("Hold or clear the current sale before resuming another.");
      return;
    }
    void resumeHeldSale(heldSaleId).then((sale) => {
      if (sale) {
        cart.restore(sale.lines);
        setCustomer(sale.customer ?? { name: "", phone: "" });
        setNote(sale.note ?? "");
        setSampleMode(sale.lines.some((line) => line.isDemo));
        setShowHeldSales(false);
      }
    }).catch(() => toast.error("Could not resume held sale."));
  };

  const handleCharge = async (payments: SalePayment[]) => {
    if (cart.lines.length === 0 || payments.length === 0) return;
    if (!shift) {
      toast.error("Start a shift before taking payment.");
      return;
    }

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.round(totalPaid) !== Math.round(payable)) return;

    setCharging(true);
    try {
      validateDeviceLines(cart.lines);
      const primary = payments[0];
      const sale = await createSale({
        cashierName: user?.name || "Cashier",
        branch: user?.storeLocation,
        customer: customer.name.trim() ? { ...customer, name: customer.name.trim(), phone: customer.phone.trim() } : undefined,
        note,
        channel: "in_store",
        lines: cart.lines,
        subtotal: cart.subtotal,
        total: payable,
        ...(discount ? { discount: { ...discount, approvedBy: user?.name || "Cashier" } } : {}),
        payments,
        paymentMode: primary.mode,
        ...(payments.length === 1 && primary.mode === "cash"
          ? { cashTendered: primary.cashTendered, changeDue: primary.changeDue }
          : {}),
      });

      setCompletedSale(sale);
      clearSale();
    } catch (err) {
      console.error("Failed to complete sale:", err);
      toast.error(err instanceof Error ? err.message : "Could not complete the sale.");
    } finally {
      setCharging(false);
    }
  };

  // Cash on delivery: the sale is recorded (and counts as revenue) now, with
  // payment Pending — the courier collects, and the settlement is paid later.
  const handleChargeCod = async ({ address, fee }: { address: string; fee: number }) => {
    if (cart.lines.length === 0) return;
    if (!shift) { toast.error("Start a shift before recording a sale."); return; }
    setCharging(true);
    try {
      validateDeviceLines(cart.lines);
      const sale = await createSale({
        cashierName: user?.name || "Cashier",
        branch: user?.storeLocation,
        customer: customer.name.trim() ? { ...customer, name: customer.name.trim(), phone: customer.phone.trim() } : undefined,
        note,
        channel: "in_store",
        lines: cart.lines,
        subtotal: cart.subtotal,
        total: payable,
        ...(discount ? { discount: { ...discount, approvedBy: user?.name || "Cashier" } } : {}),
        payments: [],
        paymentMode: "cod",
        cod: { courier: COD_COURIER, address, fee, status: "pending", history: [] },
      });
      setCompletedSale(sale);
      clearSale();
    } catch (err) {
      console.error("Failed to record COD sale:", err);
      toast.error(err instanceof Error ? err.message : "Could not record the COD sale.");
    } finally {
      setCharging(false);
    }
  };

  const reserveOrder = async (amount: number, mode: SalePaymentMode, dueAt: string) => {
    setCharging(true);
    try {
      if (!shift && amount > 0) throw new Error("Start a shift before receiving a deposit.");
      await createSale({ cashierName: user?.name || "Cashier", branch: user?.storeLocation, channel: "in_store",
        customer, note, lifecycle: "reserved", collectionDueAt: dueAt, lines: cart.lines,
        subtotal: cart.subtotal, total: payable,
        ...(discount ? { discount: { ...discount, approvedBy: user?.name || "Cashier" } } : {}),
        payments: amount > 0 ? [{ mode, amount }] : [], paymentMode: mode });
      setShowReserve(false); clearSale(); toast.success("Order reserved. Open Sale History to record payment or collection.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not reserve order."); }
    finally { setCharging(false); }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4 text-primary" />
          {shiftLoading ? (
            <span className="text-muted-foreground">Checking shift status...</span>
          ) : shift ? (
            <span className="text-foreground">
              Shift open · Float {formatCurrency(shift.openingFloat)} · since{" "}
              {new Date(shift.openedAt).toLocaleTimeString()}
            </span>
          ) : (
            <span className="text-muted-foreground">No active shift</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHeldSales(true)}>
            <PauseCircle className="h-4 w-4" />
            Held Sales
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSaleHistory(true)}>
            <History className="h-4 w-4" />
            Sale History
          </Button>
          <Button variant="outline" size="sm" disabled={cart.lines.length > 0} onClick={() => setSampleMode(!sampleMode)}>
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            {sampleMode ? "Back to catalog" : "Sample devices"}
          </Button>
          {shift ? (
            <Button variant="outline" size="sm" onClick={() => setShowEndShift(true)}>
              <LogOut className="h-4 w-4" />
              End Shift
            </Button>
          ) : (
            !shiftLoading && (
              <Button size="sm" onClick={() => setShowStartShift(true)}>
                <Wallet className="h-4 w-4" />
                Start Shift
              </Button>
            )
          )}
        </div>
      </div>

      {sampleMode && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sample catalog: fictional devices and warranty terms. Sample sales are excluded from revenue and cash totals.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 lg:order-2">
          <ProductGrid items={activeCatalog} loading={!sampleMode && loading} onAddItem={handleAddItem} />
        </div>

        <div className="lg:col-span-2 lg:order-1"><CartPanel
          lines={cart.lines}
          subtotal={payable}
          itemsTotal={cart.subtotal}
          discount={discount}
          discountLimitPercent={user?.role === "admin" ? null : DISCOUNT_LIMIT_PERCENT}
          onApplyDiscount={(amount, reason) => {
            if (!(amount > 0) || amount > cart.subtotal) return "Discount must be more than 0 and no more than the subtotal.";
            if (user?.role !== "admin" && amount > cart.subtotal * DISCOUNT_LIMIT_PERCENT / 100) return "This discount needs an admin account.";
            setDiscount({ amount: Math.round(amount * 100) / 100, reason });
          }}
          onRemoveDiscount={() => setDiscount(null)}
          onApplyVoucher={async (code) => {
            try {
              const { code: applied, discount: amount } = await validatePosVoucher(api, code, cart.subtotal, cart.lines);
              setDiscount({ amount: Math.min(Math.round(amount * 100) / 100, cart.subtotal), reason: "Voucher " + applied });
            } catch (error) {
              return error instanceof Error ? error.message : "Voucher validation failed.";
            }
          }}
          onUpdateQuantity={(id, quantity) => {
            const product = activeCatalog.find((item) => item.id === id);
            if (!product || quantity > product.quantity - product.locked) { toast.error("Requested quantity is not available."); return; }
            cart.updateQuantity(id, quantity);
          }}
          onRemoveItem={cart.removeItem}
          onClear={clearSale}
          deviceCheckoutReady={deviceCheckoutReady}
          customer={customer}
          onCustomerChange={setCustomer}
          note={note}
          onNoteChange={setNote}
          customerRequired={needsCustomer}
          onRefunds={() => setShowRefunds(true)}
          onReserve={() => setShowReserve(true)}
          canReserve={!charging && Boolean(customer.name.trim() && customer.phone.trim())}
          onSetPrice={user?.role === "admin" ? (productId, price) => {
            const line = cart.lines.find((entry) => entry.productId === productId);
            if (!line || !(price >= 0) || price === line.unitPrice) return;
            cart.setPrice(productId, price);
            void logAudit(user?.name ?? "Admin", "price_override", line.name + ": " + line.unitPrice + " to " + price);
          } : undefined}
          onSelectDevices={(productId) => {
            const item = activeCatalog.find((product) => product.id === productId);
            if (item) void selectDevices(item);
            else toast.error("Product is no longer in the catalog.");
          }}
          onHold={() => setShowHoldPrompt(true)}
          onCharge={handleCharge}
          onChargeCod={handleChargeCod}
          charging={charging}
          shiftActive={!!shift}
        /></div>
      </div>

      {showReserve && <ReserveOrderDialog total={payable} busy={charging} onClose={() => setShowReserve(false)} onSave={reserveOrder} />}
      {deviceProduct && <DeviceSelectionDialog key={deviceProduct.id} product={deviceProduct}
        selected={cart.lines.find((line) => line.productId === deviceProduct.id)?.devices ?? []}
        unavailable={unavailableUnits} onClose={() => setDeviceProduct(null)}
        onConfirm={(devices) => { cart.setDevices(deviceProduct, devices); setDeviceProduct(null); }} />}
      <StartShiftDialog open={showStartShift} onOpenChange={setShowStartShift} onStart={handleStartShift} />
      <EndShiftDialog
        open={showEndShift}
        shift={shift}
        onOpenChange={setShowEndShift}
        onEnded={() => setShift(null)}
        showVariance={user?.role === "admin"}
      />
      <HeldSalesDialog
        open={showHeldSales}
        onOpenChange={setShowHeldSales}
        onResume={handleResume}
        refreshKey={heldRefreshKey}
      />
      <HoldSaleDialog open={showHoldPrompt} onOpenChange={setShowHoldPrompt} onHold={handleHold} />
      <RefundsDialog open={showRefunds} onOpenChange={setShowRefunds} />
      <SalesDetailModal open={showSaleHistory} onOpenChange={setShowSaleHistory} />
      <SaleCompleteDialog sale={completedSale} settings={settings} onNewSale={() => setCompletedSale(null)} />
    </div>
  );
}
