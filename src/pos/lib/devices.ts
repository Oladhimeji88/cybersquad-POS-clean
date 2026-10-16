import type { InventoryItem } from "@/frontdesk/lib/store";

export interface WarrantyPolicy {
  type: string;
  provider: string;
  durationMonths: number;
  startsOn: "sale" | "fixed";
  terms: string;
  startsAt?: string;
  expiresAt?: string;
}
export interface WarrantySnapshot extends WarrantyPolicy { startsAt: string; expiresAt: string; }
export interface SerializedUnit {
  id: string;
  productId: string;
  serialNumber: string;
  imei?: string;
  imei2?: string;
  status: "available" | "unavailable";
  warranty?: WarrantyPolicy;
}
export interface PosProduct extends InventoryItem {
  tracking?: "none" | "serial";
  warranty?: WarrantyPolicy;
  units?: SerializedUnit[];
  isDemo?: boolean;
}
export interface SelectedDevice extends SerializedUnit { coverage?: WarrantySnapshot; }
export interface SaleCustomer { id?: string; name: string; phone: string; email?: string; }
export interface DeviceLine {
  productId: string;
  name: string;
  quantity: number;
  tracking?: "none" | "serial";
  devices?: SelectedDevice[];
  warranty?: WarrantyPolicy;
  coverage?: WarrantySnapshot;
  isDemo?: boolean;
}
export function deviceIdentifiers(unit: SerializedUnit): string[] {
  return [unit.serialNumber, unit.imei, unit.imei2].filter((value): value is string => Boolean(value));
}
export function warrantyLabel(policy?: WarrantyPolicy): string {
  if (!policy) return "Warranty not configured";
  if (policy.durationMonths === 0) return "No warranty";
  if (policy.startsOn === "fixed") return policy.type + " · Expires " + (policy.expiresAt?.slice(0, 10) ?? "not configured");
  return policy.type + " · " + policy.durationMonths + " months from purchase";
}
export function activateWarranty(policy: WarrantyPolicy | undefined, soldAt: string): WarrantySnapshot | undefined {
  if (!policy) return undefined;
  if (policy.startsOn === "fixed") {
    if (!policy.startsAt || !policy.expiresAt || !Number.isFinite(Date.parse(policy.startsAt)) ||
        !Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= Date.parse(policy.startsAt)) {
      throw new Error("This device has incomplete warranty dates. Ask inventory to correct its record.");
    }
    return { ...policy, startsAt: policy.startsAt, expiresAt: policy.expiresAt };
  }
  if (!Number.isInteger(policy.durationMonths) || policy.durationMonths < 0) throw new Error("Invalid warranty duration.");
  const start = new Date(soldAt);
  const end = new Date(soldAt);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + policy.durationMonths);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return { ...policy, startsAt: start.toISOString(), expiresAt: end.toISOString() };
}
export function validateDeviceLines(lines: DeviceLine[], unavailableIds: Set<string> = new Set()): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("Enter a valid item quantity.");
    if (line.tracking !== "serial") continue;
    if (line.devices?.length !== line.quantity) throw new Error("Select one recorded device for each " + line.name + ".");
    for (const unit of line.devices) {
      if (unit.productId !== line.productId || unit.status !== "available" || !deviceIdentifiers(unit).length) {
        throw new Error("Select an available device belonging to this product.");
      }
      if (seen.has(unit.id) || unavailableIds.has(unit.id)) throw new Error("A selected device is already sold or held in another sale.");
      seen.add(unit.id);
      if (!(unit.warranty ?? line.warranty)) throw new Error("Warranty terms must be configured before selling this device.");
    }
  }
}
export function snapshotDeviceLines<T extends DeviceLine>(lines: T[], soldAt: string): T[] {
  return lines.map((line) => ({
    ...line,
    coverage: activateWarranty(line.warranty, soldAt),
    devices: line.devices?.map((unit) => ({
      ...unit, coverage: activateWarranty(unit.warranty ?? line.warranty, soldAt),
    })),
  }));
}
export function deviceDetailText(line: DeviceLine): string[] {
  const coverageText = (coverage: WarrantySnapshot) => coverage.durationMonths === 0 ? "No warranty" :
    coverage.type + " (" + coverage.provider + "): " + coverage.startsAt.slice(0, 10) + " to " + coverage.expiresAt.slice(0, 10);
  const details = (line.devices ?? []).flatMap((unit) => {
    const policy = unit.coverage ?? unit.warranty ?? line.coverage ?? line.warranty;
    return [
      "Serial: " + unit.serialNumber + (unit.imei ? " · IMEI: " + unit.imei : "") + (unit.imei2 ? " · IMEI 2: " + unit.imei2 : ""),
      unit.coverage ? coverageText(unit.coverage) : warrantyLabel(policy),
      ...(policy?.terms ? ["Terms: " + policy.terms] : []),
    ];
  });
  if (!line.devices?.length && (line.coverage || line.warranty)) {
    details.push(line.coverage ? coverageText(line.coverage) : warrantyLabel(line.warranty));
  }
  return details;
}
