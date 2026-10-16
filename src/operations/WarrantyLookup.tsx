import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWarrantyRecords, warrantyStatus, type WarrantyRecord } from "./business";

export default function WarrantyLookup({ onSelect, initialId, includeSamples = false }: {
  onSelect?: (record: WarrantyRecord) => void; initialId?: string; includeSamples?: boolean;
}) {
  const [records, setRecords] = useState<WarrantyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [samples, setSamples] = useState(includeSamples);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWarrantyRecords().then((data) => {
      setRecords(data);
      if (initialId) {
        const record = data.find((entry) => entry.id === initialId);
        if (record) {
          setQuery(record.serial);
          setSamples(Boolean(record.isDemo));
          if (!record.returned) onSelect?.(record);
        }
      }
    }).catch(() => toast.error("Could not load warranty records.")).finally(() => setLoading(false));
  }, [initialId]);

  const normalized = query.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const matches = records.filter((record) => (samples || !record.isDemo) && (!normalized ||
    [...record.identifiers, record.reference, record.customer.name, record.customer.phone].some((value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(normalized))));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Warranty Lookup</CardTitle>
        <CardDescription>
          Search the original purchase or completed repair before approving warranty work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <Input aria-label="Search warranty records" placeholder="IMEI, serial, receipt, customer or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={samples} onChange={(event) => setSamples(event.target.checked)} />
            Include sample records
          </label>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading warranties...</p>}
        {!loading && !matches.length && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No recorded coverage found. Do not assume a warranty from the device age.
          </p>
        )}

        <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
          {matches.map((record) => (
            <article key={record.id} className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="font-medium">{record.product}</p>
                <span className="text-xs text-muted-foreground">{record.isDemo ? "Sample - " : ""}{record.source} warranty</span>
              </div>
              <p className="text-sm text-muted-foreground">{record.reference} - {record.customer.name} - {record.customer.phone}</p>
              <p className="text-sm break-words">{record.identifiers.join(" - ")}</p>
              <p className="text-sm text-muted-foreground">{record.coverage.type} - {record.coverage.startsAt.slice(0, 10)} to {record.coverage.expiresAt.slice(0, 10)}</p>
              <p className="text-sm font-medium">{warrantyStatus(record)}</p>
              <p className="text-xs text-muted-foreground">{record.coverage.terms}</p>
              {onSelect && <Button size="sm" variant="outline" disabled={record.returned || record.isDemo} onClick={() => onSelect(record)}>Use original record for intake</Button>}
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
