import { useEffect, useMemo, useRef, useState } from "react";
import { Package, PackageSearch, ScanBarcode } from "lucide-react";
import SearchField from "@/frontdesk/components/SearchField";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/frontdesk/lib/invoice";
import { warrantyLabel, type PosProduct } from "../lib/devices";

interface ProductGridProps {
  items: PosProduct[];
  loading: boolean;
  onAddItem: (item: PosProduct, quantity?: number) => void;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export default function ProductGrid({ items, loading, onAddItem }: ProductGridProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [scanFlashId, setScanFlashId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const categories = useMemo(() => {
    const unique = new Set(items.map((item) => item.category || "General"));
    return ["all", ...Array.from(unique).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const query = normalize(search);
    return items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesQuery =
        !query || normalize(item.name).includes(query) || normalize(item.sku ?? "").includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [items, search, category]);

  // Barcode scanners type the code then send Enter — if the search text is an
  // exact SKU/id match, add it straight to the cart instead of requiring a click.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const query = normalize(search);
    if (!query) return;

    const exactMatch = items.find(
      (item) => normalize(item.sku ?? "") === query || normalize(item.id) === query
    );
    if (exactMatch) {
      e.preventDefault();
      onAddItem(exactMatch);
      setScanFlashId(exactMatch.id);
      setSearch("");
      window.setTimeout(() => setScanFlashId(null), 600);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 space-y-4">
        <SearchField
          ref={searchRef}
          placeholder="Search by name or SKU, or scan a barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ScanBarcode className="h-4 w-4" />
          <span>Scan a barcode or type a SKU and press Enter to add instantly. Shortcuts: F2 search · F4 refunds · F7 hold.</span>
        </div>

        {categories.length > 2 && (
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="flex-wrap h-auto justify-start bg-transparent p-0 gap-2">
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="rounded-full border border-border data-[state=active]:border-primary"
                >
                  {cat === "all" ? "All" : cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="glass-card p-4">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <PackageSearch className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {search ? `No products match "${search}"` : "No products in this category"}
            </p>
            <p className="text-xs text-muted-foreground">Try a different search term or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4 motion-stagger">
            {filtered.map((item) => {
              const outOfStock = item.quantity - item.locked <= 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onAddItem(item)}
                  className={`text-left rounded-lg border p-4 press lift min-h-[8rem] flex flex-col ${
                    scanFlashId === item.id
                      ? "border-primary ring-2 ring-primary/40 bg-secondary"
                      : "border-border hover:border-primary hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    {outOfStock && (
                      <span className="text-[10px] font-medium text-destructive uppercase tracking-wide">
                        Out of stock
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1 line-clamp-2">{item.name}</p>
                  {item.sku && <p className="text-xs text-muted-foreground truncate">SKU: {item.sku}</p>}
                  {item.tracking === "serial" && <p className="text-xs text-primary mt-1">IMEI / serial selection required</p>}
                  <p className="text-xs text-muted-foreground mt-1">{warrantyLabel(item.warranty)}</p>
                  <p className="mt-2 rounded-md bg-primary text-primary-foreground text-center text-sm font-semibold py-2">{formatCurrency(item.price)}</p>
                  {!outOfStock && (
                    <p className={`text-xs mt-1 ${item.quantity - item.locked <= 3 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {item.quantity - item.locked <= 3 ? "Low stock: " : "In stock: "}{item.quantity - item.locked}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
