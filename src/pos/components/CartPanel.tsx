import { useEffect, useState } from "react";
import DeviceDetails from "./DeviceDetails";
import { Minus, Plus, ShoppingCart, Trash2, Banknote, PauseCircle, SplitSquareHorizontal, X, Undo2, BadgePercent, Delete, ClipboardList, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomerPicker from "@/operations/CustomerPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { PAYMENT_MODE_LABELS } from "@/frontdesk/lib/store";
import type { PosCartLine } from "@/pos/lib/cart";
import type { SalePayment, SalePaymentMode } from "@/pos/lib/store";
import type { SaleCustomer } from "@/pos/lib/devices";

const PAYMENT_MODES: SalePaymentMode[] = ["cash", "pos", "bank_transfer"];
// COD is offered only as a single (non-split) method: it is not money taken at the till.
type CheckoutMode = SalePaymentMode | "cod";
export interface CodDetails { address: string; fee: number }

interface PaymentRow {
  id: string;
  mode: SalePaymentMode;
  amount: string;
}

let rowIdCounter = 0;
function nextRowId() {
  rowIdCounter += 1;
  return `row-${rowIdCounter}`;
}

interface CartPanelProps {
  lines: PosCartLine[];
  subtotal: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClear: () => void;
  onHold: () => void;
  onCharge: (payments: SalePayment[]) => void;
  // Records the sale as cash-on-delivery (payment pending, collected by the courier).
  onChargeCod?: (details: CodDetails) => void;
  charging: boolean;
  shiftActive: boolean;
  onSelectDevices: (productId: string) => void;
  deviceCheckoutReady: boolean;
  customer: SaleCustomer;
  onCustomerChange: (customer: SaleCustomer) => void;
  note: string;
  onNoteChange: (note: string) => void;
  customerRequired: boolean;
  onRefunds: () => void;
  itemsTotal: number;
  discount: { amount: number; reason: string } | null;
  discountLimitPercent: number | null;
  onApplyDiscount: (amount: number, reason: string) => string | undefined;
  onRemoveDiscount: () => void;
  onApplyVoucher: (code: string) => Promise<string | undefined>;
  onSetPrice?: (productId: string, price: number) => void;
  onReserve: () => void;
  canReserve: boolean;
}

export default function CartPanel({
  lines,
  subtotal,
  onUpdateQuantity,
  onRemoveItem,
  onClear,
  onHold,
  onCharge,
  onChargeCod,
  charging,
  shiftActive,
  onSelectDevices,
  deviceCheckoutReady,
  customer,
  onCustomerChange,
  note,
  onNoteChange,
  customerRequired,
  onRefunds,
  itemsTotal,
  discount,
  discountLimitPercent,
  onApplyDiscount,
  onRemoveDiscount,
  onApplyVoucher,
  onSetPrice,
  onReserve,
  canReserve,
}: CartPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyMode, setKeyMode] = useState<"qty" | "disc" | "price">("qty");
  const [keyBuffer, setKeyBuffer] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountKind, setDiscountKind] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [voucherBusy, setVoucherBusy] = useState(false);
  const submitVoucher = async () => {
    if (!voucherCode.trim()) { setVoucherError("Enter a voucher code."); return; }
    setVoucherBusy(true);
    const error = await onApplyVoucher(voucherCode.trim().toUpperCase());
    setVoucherBusy(false);
    setVoucherError(error ?? "");
    if (!error) { setVoucherOpen(false); setVoucherCode(""); }
  };
  const submitDiscount = () => {
    const value = Number(discountValue);
    const amount = discountKind === "percent" ? Math.round(itemsTotal * value) / 100 : value;
    const error = !(value > 0) ? "Enter a discount." : !discountReason.trim() ? "Enter a reason." : onApplyDiscount(amount, discountReason.trim());
    setDiscountError(error ?? "");
    if (!error) { setDiscountOpen(false); setDiscountValue(""); setDiscountReason(""); }
  };

  // Single-payment path (the common case): one method covers the whole sale.
  const [paymentMode, setPaymentMode] = useState<CheckoutMode>("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [codAddress, setCodAddress] = useState("");
  const [codFee, setCodFee] = useState("");

  // Split-payment path: two or more methods each cover part of the sale.
  const [splitRows, setSplitRows] = useState<PaymentRow[] | null>(null);

  // Start each new sale with a clean payment state.
  useEffect(() => {
    if (lines.length === 0) {
      setPaymentMode("cash");
      setCashTendered("");
      setCodAddress("");
      setCodFee("");
      setSplitRows(null);
    }
  }, [lines.length]);

  const selected = lines.find((line) => line.productId === selectedId) ?? lines[lines.length - 1];
  const changeKeyMode = (mode: "qty" | "disc" | "price") => { setKeyMode(mode); setKeyBuffer(""); };
  const pressKey = (key: string) => {
    const next = key === "back" ? keyBuffer.slice(0, -1) : key === "clear" ? "" : key === "." ? (keyBuffer.includes(".") ? keyBuffer : (keyBuffer || "0") + ".") : keyBuffer + key;
    setKeyBuffer(next);
    const value = Number(next);
    if (keyMode === "disc") { if (!discount) { setDiscountKind("percent"); setDiscountValue(next); setDiscountOpen(true); } return; }
    if (!selected || !(value >= 0)) return;
    if (keyMode === "qty" && Number.isInteger(value) && value >= 1 && selected.tracking !== "serial") onUpdateQuantity(selected.productId, value);
    if (keyMode === "price" && onSetPrice && next !== "") onSetPrice(selected.productId, value);
  };
  const isSplit = splitRows !== null;

  const startSplit = () => {
    setSplitRows([
      { id: nextRowId(), mode: paymentMode === "cod" ? "cash" : paymentMode, amount: "" },
      { id: nextRowId(), mode: "pos", amount: "" },
    ]);
  };

  const cancelSplit = () => {
    setSplitRows(null);
  };

  const addSplitRow = () => {
    setSplitRows((rows) => [...(rows ?? []), { id: nextRowId(), mode: "cash", amount: "" }]);
  };

  const removeSplitRow = (id: string) => {
    setSplitRows((rows) => {
      const next = (rows ?? []).filter((row) => row.id !== id);
      return next.length >= 2 ? next : null;
    });
  };

  const updateSplitRow = (id: string, patch: Partial<PaymentRow>) => {
    setSplitRows((rows) => (rows ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const tenderedAmount = Number(cashTendered) || 0;
  const changeDue = tenderedAmount - subtotal;
  const cashInsufficient = !isSplit && paymentMode === "cash" && (!cashTendered || tenderedAmount < subtotal);

  const splitAllocated = isSplit
    ? (splitRows ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    : 0;
  const splitRemaining = subtotal - splitAllocated;
  const splitInvalid =
    isSplit && (Math.abs(splitRemaining) > 0.01 || (splitRows ?? []).some((row) => !(Number(row.amount) > 0)));

  const isCod = !isSplit && paymentMode === "cod";
  const codFeeValue = Number(codFee) || 0;
  const codInvalid = isCod && (!codAddress.trim() || codFeeValue < 0 || codFeeValue > subtotal);
  const canCharge = lines.length > 0 && !charging && !cashInsufficient && !splitInvalid && !codInvalid && shiftActive && deviceCheckoutReady;
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const handleCharge = () => {
    if (!canCharge) return;
    if (isCod) {
      onChargeCod?.({ address: codAddress.trim(), fee: codFeeValue });
    } else if (isSplit) {
      onCharge((splitRows ?? []).map((row) => ({ mode: row.mode, amount: Number(row.amount) || 0 })));
    } else {
      onCharge([
        {
          mode: paymentMode as SalePaymentMode,
          amount: subtotal,
          ...(paymentMode === "cash" ? { cashTendered: tenderedAmount, changeDue } : {}),
        },
      ]);
    }
  };

  return (
    <div className="glass-card p-4 flex flex-col h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Current Sale</h3>
          {itemCount > 0 && (
            <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2">
              {itemCount}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={onRefunds}><Undo2 className="h-4 w-4" />Refund</Button>
        <Button variant="outline" size="sm" disabled={lines.length === 0} onClick={onHold}><PauseCircle className="h-4 w-4" />Hold</Button>
        <Button variant="outline" size="sm" disabled={lines.length === 0 || !!discount} onClick={() => setDiscountOpen(true)}><BadgePercent className="h-4 w-4" />Discount</Button>
        <Button variant="outline" size="sm" disabled={lines.length === 0 || !!discount} onClick={() => setVoucherOpen(true)}><Ticket className="h-4 w-4" />Voucher</Button>
        <Button variant="outline" size="sm" disabled={lines.length === 0 || !canReserve} title={canReserve ? undefined : "Add a customer name and phone first"} onClick={onReserve}><ClipboardList className="h-4 w-4" />Reserve</Button>
        <Button variant="outline" size="sm" className="col-span-2 hover:text-destructive" disabled={lines.length === 0} onClick={() => setConfirmClear(true)}><Trash2 className="h-4 w-4" />Clear sale</Button>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Cart is empty</p>
          <p className="text-xs text-muted-foreground">Scan a barcode or select a product to get started.</p>
        </div>
      ) : (
        <div className="space-y-4 mb-4 max-h-[40vh] overflow-y-auto pr-1" aria-live="polite">
          {lines.map((line) => (
            <div key={line.productId} onClick={() => { setSelectedId(line.productId); setKeyBuffer(""); }} className={`flex items-center justify-between gap-2 rounded-md p-2 cursor-pointer motion-pop transition-colors duration-150 ${selected?.productId === line.productId ? "ring-2 ring-primary/50 bg-secondary" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{line.name}</p>
                <DeviceDetails line={line} />
                {line.tracking === "serial" && <Button size="sm" variant="outline" onClick={() => onSelectDevices(line.productId)}>Change devices</Button>}
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(line.unitPrice)} × {line.quantity} ={" "}
                  {formatCurrency(line.unitPrice * line.quantity)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={`Decrease quantity of ${line.name}`}
                  disabled={line.tracking === "serial"}
                  onClick={() => onUpdateQuantity(line.productId, line.quantity - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  disabled={line.tracking === "serial"}
                  min={1}
                  value={line.quantity}
                  aria-label={`Quantity of ${line.name}`}
                  onChange={(e) => {
                    const value = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    onUpdateQuantity(line.productId, value);
                  }}
                  className="w-14 h-10 text-center px-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={`Increase quantity of ${line.name}`}
                  disabled={line.tracking === "serial"}
                  onClick={() => onUpdateQuantity(line.productId, line.quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  aria-label={`Remove ${line.name} from cart`}
                  onClick={() => onRemoveItem(line.productId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="mb-4 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">
            Customer <span className="font-normal text-muted-foreground">{customerRequired ? "· required for device purchases" : "· optional"}</span>
          </p>
          <CustomerPicker value={customer} onChange={onCustomerChange} />
          <Input aria-label="Customer note" placeholder="Customer note (optional)" value={note} onChange={(event) => onNoteChange(event.target.value)} />
          {!deviceCheckoutReady && <p className="text-xs text-muted-foreground">Add a name and phone to link the device and warranty to this customer.</p>}
        </div>
      )}

      {lines.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4" role="group" aria-label="Keypad">
          {["1", "2", "3", "qty", "4", "5", "6", "disc", "7", "8", "9", "price", "clear", "0", ".", "back"].map((key) => {
            const mode = key === "qty" || key === "disc" || key === "price";
            if (mode) {
              const label = key === "qty" ? "Qty" : key === "disc" ? "% Disc" : "Price";
              return <Button key={key} type="button" size="sm" variant={keyMode === key ? "default" : "outline"} className="h-10" disabled={key === "price" && !onSetPrice}
                title={key === "price" && !onSetPrice ? "Price changes need an admin account" : undefined} onClick={() => changeKeyMode(key as "qty" | "disc" | "price")}>{label}</Button>;
            }
            return <Button key={key} type="button" size="sm" variant="outline" className="h-10 text-base" aria-label={key === "back" ? "Backspace" : key === "clear" ? "Clear entry" : key}
              onClick={() => pressKey(key)}>{key === "back" ? <Delete className="w-4 h-4" /> : key === "clear" ? "C" : key}</Button>;
          })}
          <p className="col-span-4 text-xs text-muted-foreground">{keyMode === "qty" ? "Type a quantity for the highlighted item." : keyMode === "price" ? "Type a new unit price for the highlighted item." : "Type a % discount, then confirm it below."}</p>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-4 mt-auto">
        {lines.length > 0 && (discount ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(itemsTotal)}</span></div>
            <div className="flex justify-between items-center">
              <span>Discount ({discount.reason})</span>
              <span className="flex items-center gap-1">-{formatCurrency(discount.amount)}
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove discount" onClick={onRemoveDiscount}><X className="h-4 w-4" /></Button></span>
            </div>
          </div>
        ) : voucherOpen ? (
          <div className="space-y-2 rounded-lg border border-border p-4 motion-rise">
            <Input aria-label="Voucher code" placeholder="Voucher code" value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => { if (event.key === "Enter") void submitVoucher(); }} />
            {voucherError && <p className="text-xs text-destructive" role="alert">{voucherError}</p>}
            <div className="flex gap-2"><Button size="sm" disabled={voucherBusy} onClick={() => void submitVoucher()}>{voucherBusy ? "Checking..." : "Apply"}</Button>
              <Button size="sm" variant="outline" onClick={() => { setVoucherOpen(false); setVoucherError(""); }}>Cancel</Button></div>
          </div>
        ) : discountOpen ? (
          <div className="space-y-2 rounded-lg border border-border p-4 motion-rise">
            <div className="flex gap-2">
              <select aria-label="Discount type" className="border rounded p-2 bg-background" value={discountKind} onChange={(event) => setDiscountKind(event.target.value as "percent" | "amount")}>
                <option value="percent">%</option><option value="amount">Amount</option></select>
              <Input aria-label="Discount value" type="number" min={0} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
            </div>
            <Input aria-label="Discount reason" placeholder="Reason (required)" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} />
            {discountLimitPercent !== null && <p className="text-xs text-muted-foreground">Discounts above {discountLimitPercent}% need an admin account.</p>}
            {discountError && <p className="text-xs text-destructive" role="alert">{discountError}</p>}
            <div className="flex gap-2"><Button size="sm" onClick={submitDiscount}>Apply</Button><Button size="sm" variant="outline" onClick={() => { setDiscountOpen(false); setDiscountError(""); }}>Cancel</Button></div>
          </div>
        ) : null)}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold text-lg text-foreground">{formatCurrency(subtotal)}</span>
        </div>

        {!isSplit ? (
          <>
            <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as CheckoutMode)}>
              <SelectTrigger aria-label="Payment method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {PAYMENT_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
                {onChargeCod && <SelectItem value="cod">Cash on Delivery (COD)</SelectItem>}
              </SelectContent>
            </Select>

            {paymentMode === "cod" && (
              <div className="space-y-2 rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Recorded as a sale now; payment stays Pending until the courier (Speedef) collects and settles. Customer name and phone are required.</p>
                <Input aria-label="Delivery address" placeholder="Delivery address (required)" value={codAddress} onChange={(e) => setCodAddress(e.target.value)} />
                <Input aria-label="Courier fee" type="number" min={0} inputMode="decimal" placeholder="Courier COD fee (optional)" value={codFee} onChange={(e) => setCodFee(e.target.value)} />
              </div>
            )}

            {paymentMode === "cash" && (
              <div className="space-y-2 rounded-lg border border-border p-4">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" htmlFor="cash-tendered">
                  <Banknote className="h-4 w-4" />
                  Cash Tendered
                </label>
                <Input
                  id="cash-tendered"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="0"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Change Due</span>
                  <span className={`font-medium ${changeDue < 0 ? "text-destructive" : "text-success"}`}>
                    {formatCurrency(Math.max(0, changeDue))}
                  </span>
                </div>
              </div>
            )}

            {lines.length > 0 && !isCod && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={startSplit}>
                <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                Split Payment
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <SplitSquareHorizontal className="h-4 w-4" />
                Split Payment
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-muted-foreground" onClick={cancelSplit}>
                Cancel
              </Button>
            </div>

            {(splitRows ?? []).map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <Select value={row.mode} onValueChange={(v) => updateSplitRow(row.id, { mode: v as SalePaymentMode })}>
                  <SelectTrigger aria-label="Payment method" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {PAYMENT_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="Amount"
                  aria-label={`Amount for ${PAYMENT_MODE_LABELS[row.mode]}`}
                  value={row.amount}
                  onChange={(e) => updateSplitRow(row.id, { amount: e.target.value })}
                  className="h-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove payment method"
                  onClick={() => removeSplitRow(row.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" className="w-full" onClick={addSplitRow}>
              <Plus className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>

            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted-foreground">Remaining</span>
              <span className={`font-medium ${splitRemaining !== 0 ? "text-destructive" : "text-success"}`}>
                {formatCurrency(splitRemaining)}
              </span>
            </div>
          </div>
        )}

        {!shiftActive && (
          <p className="text-xs text-destructive text-center">Start a shift to accept payment.</p>
        )}
        <Button className="w-full h-12 text-base" disabled={!canCharge} onClick={handleCharge}>
          {charging ? "Processing..." : isCod ? `Record COD sale ${formatCurrency(subtotal)}` : `Charge ${formatCurrency(subtotal)}`}
        </Button>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {itemCount} item(s) from the cart. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
            >
              Clear Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
