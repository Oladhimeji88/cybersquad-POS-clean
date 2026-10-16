import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

import { DollarSign, Upload, Save, Plus, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../hooks/useApi";

const REQUIRED_CSV_HEADERS = [
  "service_code",
  "service_name",
  "service_type",
  "brand",
  "model_name",
  "override_price",
  "currency",
];

export function ServicePricesModal({ open, onClose, service, onSaved }) {
  const { api } = useApi();

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Local editable overrides list
  const [overrides, setOverrides] = useState([]);

  // CSV input ref
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !service) return;

    // NOTE: We're using what the backend already returns in service.overrides
    // If later you add a dedicated endpoint for service details, we can fetch it here.
    const base = Array.isArray(service?.overrides) ? service.overrides : [];

    // Normalize for UI editing
    setOverrides(
      base.map((o) => ({
        id: o?.id,
        brand: o?.brand || "",
        model_name: o?.model_name || "",
        override_price: o?.override_price || "",
        currency: o?.currency || "NGN",
        _dirty: false,
        _isNew: false,
      }))
    );

    setSearch("");
  }, [open, service]);

  const serviceMeta = useMemo(() => {
    if (!service) return null;
    return {
      code: service.code,
      name: service.name || service.title || "",
      type: service.service_type,
      currency: service.currency || "NGN",
      base_price: service.base_price,
      override_count: service.override_count || 0,
      sla_hours: service.sla_hours,
      is_active: service.is_active,
    };
  }, [service]);

  const filteredOverrides = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overrides;

    return overrides.filter((o) => {
      const b = String(o.brand || "").toLowerCase();
      const m = String(o.model_name || "").toLowerCase();
      return b.includes(q) || m.includes(q);
    });
  }, [overrides, search]);

  const formatMoney = (amount) => {
    if (amount === null || amount === undefined || amount === "") return "-";
    const n = Number(amount);
    if (Number.isNaN(n)) return `₦${amount}`;
    return `₦${n.toLocaleString()}`;
  };

  const markDirty = (idx, patch) => {
    setOverrides((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, _dirty: true };
      return next;
    });
  };

  const addOverrideRow = () => {
    setOverrides((prev) => [
      {
        id: `new-${Date.now()}`,
        brand: "",
        model_name: "",
        override_price: "",
        currency: "NGN",
        _dirty: true,
        _isNew: true,
      },
      ...prev,
    ]);
  };

  const removeOverrideRow = (id) => {
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  };

  const buildPayloadItems = () => {
    if (!serviceMeta?.code) return { items: [], errors: ["Missing service_code"] };

    const dirty = overrides.filter((o) => o._dirty);

    const errors = [];
    const items = [];

    dirty.forEach((o) => {
      const brand = String(o.brand || "").trim();
      const model = String(o.model_name || "").trim();
      const price = String(o.override_price || "").trim();

      if (!brand) errors.push("Brand is required for all edited rows");
      if (!model) errors.push("Model name is required for all edited rows");
      if (!price) errors.push("Override price is required for all edited rows");

      if (brand && model && price) {
        items.push({
          service_code: serviceMeta.code,
          service_name: serviceMeta.name,
          service_type: serviceMeta.type,
          brand,
          model_name: model,
          override_price: price,
          currency: "NGN",
        });
      }
    });

    return { items, errors: [...new Set(errors)] };
  };

  const handleSave = async () => {
    const { items, errors } = buildPayloadItems();

    if (errors.length) {
      toast.error(errors[0]);
      return;
    }

    if (!items.length) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const res = await api.put("/jobs/services/overrides/bulk/", {
        dry_run: false,
        items,
      });

      const data = res?.data?.result || res?.data?.data || res?.data || {};
      const created = Number(data?.created || data?.data?.created || 0);
      const updated = Number(data?.updated || data?.data?.updated || 0);

      toast.success(`Saved overrides (updated: ${updated}, created: ${created})`);

      // Best-effort: clear dirty flags
      setOverrides((prev) => prev.map((o) => ({ ...o, _dirty: false, _isNew: false })));

      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error("Save overrides failed:", e);
      toast.error("Failed to save overrides");
    } finally {
      setSaving(false);
    }
  };

  const detectDelimiter = (line) => (line.includes("\t") ? "\t" : ",");

  const validateCSVHeaders = async (file) => {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/).find(Boolean) || "";
    const delimiter = detectDelimiter(firstLine);

    const headers = firstLine
      .split(delimiter)
      .map((h) => String(h || "").trim().toLowerCase())
      .filter(Boolean);

    const missing = REQUIRED_CSV_HEADERS.filter((h) => !headers.includes(h));
    return { ok: missing.length === 0, missing, headers, delimiter };
  };

  const handleImportClick = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const handleCSVSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { ok, missing } = await validateCSVHeaders(file);
      if (!ok) {
        toast.error(`Invalid CSV. Missing: ${missing.join(", ")}`);
        e.target.value = "";
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", "false");

      // Backend expects PUT (as you said)
      await api.put("/jobs/services/overrides/bulk/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("CSV processed successfully");
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error("CSV import failed:", err);
      toast.error("CSV import failed");
    } finally {
      e.target.value = "";
    }
  };

  if (!serviceMeta) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose?.();
      }}
    >
      <DialogContent className="w-[96vw] sm:max-w-[85vw] lg:max-w-7xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Manage Overrides
          </DialogTitle>
          <DialogDescription>
            {serviceMeta.name} • <span className="uppercase">{serviceMeta.type}</span> • Code:{" "}
            <span className="font-medium">{serviceMeta.code}</span>
          </DialogDescription>

          <div className="pt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Base: {formatMoney(serviceMeta.base_price)}</Badge>
              <Badge variant="secondary">Overrides: {Number(serviceMeta.override_count).toLocaleString()}</Badge>
              <Badge variant="secondary">SLA: {serviceMeta.sla_hours ? `${serviceMeta.sla_hours} hrs` : "-"}</Badge>
              {serviceMeta.is_active ? (
                <Badge className="bg-green-600 text-white">Active</Badge>
              ) : (
                <Badge variant="outline">Inactive</Badge>
              )}
              <div className="relative flex-1 min-w-[200px]">
                {/* <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none " /> */}
                <Input
                  className="pl-12 pr-4 py-2 w-full text-base"
                  placeholder="Search by brand or model..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleImportClick}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload CSV
                </Button>

                <Button onClick={addOverrideRow}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Override
                </Button>

                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>

              {/* hidden file input */}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCSVSelected}
              />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="px-6 py-4 space-y-6">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{filteredOverrides.length}</span> rows
              {search ? " (filtered)" : ""}. Edit prices, add rows, then save.
            </div>

            <Separator />

            <div className="border rounded-lg mb-6">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-4 font-medium w-[180px]">Brand</th>
                    <th className="text-left p-4 font-medium w-[360px]">Model</th>
                    <th className="text-left p-4 font-medium w-[180px]">Override Price (₦)</th>
                    <th className="text-right p-4 font-medium w-[90px]">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredOverrides.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-muted-foreground">
                        No overrides found.
                      </td>
                    </tr>
                  ) : (
                    filteredOverrides.map((row) => {
                      // We need the real index in `overrides` so edits apply correctly
                      const realIndex = overrides.findIndex((x) => x.id === row.id);

                      return (
                        <tr key={row.id} className={row._dirty ? "bg-amber-50/40" : ""}>
                          <td className="p-4">
                            <Input
                              value={row.brand}
                              placeholder="e.g. Apple"
                              onChange={(e) => markDirty(realIndex, { brand: e.target.value })}
                            />
                          </td>

                          <td className="p-4">
                            <Input
                              value={row.model_name}
                              placeholder="e.g. iPhone 14"
                              title={row.model_name}
                              className="w-full"
                              onChange={(e) => markDirty(realIndex, { model_name: e.target.value })}
                            />
                          </td>

                          <td className="p-4">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                                ₦
                              </span>
                              <Input
                                className="pl-8"
                                type="number"
                                value={row.override_price}
                                placeholder="0"
                                onChange={(e) => markDirty(realIndex, { override_price: e.target.value })}
                              />
                            </div>

                            {row._dirty ? (
                              <div className="text-xs text-amber-700 mt-1">Edited</div>
                            ) : null}
                          </td>

                          <td className="p-4 text-right">
                            {row._isNew ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeOverrideRow(row.id)}
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t flex items-center justify-between">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}