// What each role is accountable for, from the handoff's role architecture and information boundaries.
// Capabilities, not role names, decide what a screen shows, so a person holding two roles gets both.
export type Capability = "manage" | "operate" | "sell" | "procure" | "inventory" | "logistics" | "finance" | "support" | "lead";
const ALL: Capability[] = ["manage", "operate", "sell", "procure", "inventory", "logistics", "finance", "support", "lead"];
const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  admin: ALL,
  operations: ["operate"],
  sales: ["sell"],
  front_desk: ["sell", "support"],
  procurement: ["procure"],
  inventory_manager: ["inventory"],
  logistics: ["logistics"],
  finance: ["finance"],
  cx: ["support"],
  marketing: ["lead"],
};
export function capabilities(roles: readonly string[]): Set<Capability> {
  return new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role] ?? []));
}
export function can(roles: readonly string[], ...wanted: Capability[]) {
  const held = capabilities(roles);
  return wanted.some((capability) => held.has(capability));
}
