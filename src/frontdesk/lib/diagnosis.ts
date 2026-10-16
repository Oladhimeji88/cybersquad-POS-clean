import type { AxiosInstance } from "axios";
import { uniquePartIds } from "./parts";
import type { InventoryItem } from "./store";

// A no-parts diagnosis replaces the default Walk-in service, so Walk-in itself
// is never offered.
function isDiagnosisServiceOption(service: any) {
  return String(service.id) !== "31" && String(service.code ?? "").trim().toLowerCase() !== "walk-in";
}

// Returns null when the response is unusable so callers can retry later.
export async function fetchDiagnosisServiceOptions(api: AxiosInstance): Promise<any[] | null> {
  const res = await api.get("/jobs/catalog/services/?service_type=other");
  if (!res.data?.success || !Array.isArray(res.data.result)) return null;
  return res.data.result.filter(isDiagnosisServiceOption);
}

// Body for POST/PATCH /jobs/<id>/assessment/. A no-parts diagnosis bills the
// selected catalog service; otherwise the selected parts become the quotation.
export function buildAssessmentPayload({
  diagnosis,
  noPartsRequired,
  serviceId,
  partIds,
  inventory,
}: {
  diagnosis: string;
  noPartsRequired: boolean;
  serviceId: string;
  partIds: string[];
  inventory: InventoryItem[];
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    preliminary_diagnosis: diagnosis,
    estimated_hours: "1.0",
  };

  if (noPartsRequired) {
    if (!serviceId) {
      throw new Error("Select a service when no parts are required.");
    }
    payload.service_id = serviceId;
    return payload;
  }

  payload.parts_required = uniquePartIds(partIds).map((partId) => {
    const item = inventory.find((entry) => entry.id === partId);
    return {
      part: item?.name || `Part ${partId}`,
      price: String(item?.price ?? 0),
      qty: 1,
    };
  });

  return payload;
}
