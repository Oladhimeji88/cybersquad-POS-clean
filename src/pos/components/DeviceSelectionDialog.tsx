import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deviceIdentifiers, warrantyLabel, type PosProduct, type SelectedDevice } from "../lib/devices";

export default function DeviceSelectionDialog({ product, selected, unavailable, onClose, onConfirm }: {
  product: PosProduct; selected: SelectedDevice[]; unavailable: Set<string>;
  onClose: () => void; onConfirm: (devices: SelectedDevice[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState(() => selected.filter((unit) => !unavailable.has(unit.id)).map((unit) => unit.id));
  const [error, setError] = useState("");
  const units = product.units ?? [];
  const normalized = query.trim().toLowerCase();
  const matches = units.filter((unit) => deviceIdentifiers(unit).some((value) => value.toLowerCase().includes(normalized)));
  const available = (unit: SelectedDevice) => unit.status === "available" && !unavailable.has(unit.id);
  const toggle = (id: string) => {
    setError("");
    setIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent style={{ maxWidth: "36rem", maxHeight: "85vh", overflowY: "auto" }}>
      <DialogHeader>
        <DialogTitle>Select device</DialogTitle>
        <DialogDescription>{product.name}. Select one recorded unit for each item being sold.</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{warrantyLabel(product.warranty)}</p>
      <Input autoFocus aria-label="Scan IMEI or serial number" placeholder="Scan or search IMEI / serial number"
        value={query} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const unit = units.find((candidate) => deviceIdentifiers(candidate).some((value) => value.toLowerCase() === normalized));
          if (!unit) { setError("No recorded device matches this code."); return; }
          if (!available(unit)) { setError("This device is unavailable, already sold, or held in another sale."); return; }
          setIds((current) => current.includes(unit.id) ? current : [...current, unit.id]);
          setError(""); setQuery("");
        }} />
      <div className="space-y-2">
        {matches.map((unit) => <label key={unit.id} className="flex gap-4 rounded-lg border border-border p-4">
          <input type="checkbox" checked={ids.includes(unit.id)} disabled={!available(unit)}
            onChange={() => toggle(unit.id)} aria-label={"Select " + unit.serialNumber} />
          <span className="min-w-0 text-sm break-words">
            <span className="block font-medium">{unit.serialNumber}</span>
            {unit.imei && <span className="block">IMEI: {unit.imei}</span>}
            {unit.imei2 && <span className="block">IMEI 2: {unit.imei2}</span>}
            <span className="block text-xs text-muted-foreground">{warrantyLabel(unit.warranty ?? product.warranty)}</span>
            <span className="block text-xs text-muted-foreground">{(unit.warranty ?? product.warranty)?.terms}</span>
            {!available(unit) && <span className="block text-xs text-destructive">Unavailable</span>}
          </span>
        </label>)}
        {!matches.length && <p className="text-sm text-muted-foreground">No recorded devices found. Inventory must register devices before sale.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={ids.length === 0} onClick={() => onConfirm(units.filter((unit) => ids.includes(unit.id) && available(unit)))}>
          Confirm {ids.length} device{ids.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
