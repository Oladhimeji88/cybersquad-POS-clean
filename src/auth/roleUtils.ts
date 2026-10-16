export const ROLE_LANDING_PATHS = {
  admin: "/admin",
  front_desk: "/dashboard",
  engineer: "/engineer",
  qa: "/qa",
  inventory_manager: "/inventory",
  sales: "/pos",
  procurement: "/operations",
  logistics: "/operations",
  finance: "/operations",
  cx: "/operations",
  marketing: "/operations",
  operations: "/operations",
} as const;

export type AppRole = keyof typeof ROLE_LANDING_PATHS;

function normalizeRoleCandidate(candidate: unknown): AppRole | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized === "front_desk" ||
    normalized === "front desk" ||
    normalized === "front desk manager" ||
    normalized === "front_desk_manager"
  ) {
    return "front_desk";
  }

  if (normalized === "engineer" || normalized === "technician") {
    return "engineer";
  }

  if (
    normalized === "qa" ||
    normalized === "qa manager" ||
    normalized === "quality assurance" ||
    normalized === "quality_assurance"
  ) {
    return "qa";
  }

  if (normalized === "inventory_manager" || normalized === "inventory manager") {
    return "inventory_manager";
  }

  if (normalized === "procurement" || normalized.includes("purchasing")) return "procurement";
  if (normalized.startsWith("logistics") || normalized.includes("dispatch")) return "logistics";
  if (normalized === "finance" || normalized.includes("accountant") || normalized.startsWith("finance ")) return "finance";
  if (normalized === "cx" || normalized.includes("customer experience") || normalized.includes("customer_experience") || normalized.includes("customer support")) return "cx";
  if (normalized.includes("marketing")) return "marketing";
  if (normalized === "operations" || normalized.startsWith("operations ")) return "operations";
  if (normalized === "management") return "admin";

  // Sales is checked before the loose "admin" match so names like "Sales Administrator" stay sales.
  if (normalized.includes("sales") || normalized.includes("cashier")) {
    return "sales";
  }

  if (normalized === "admin" || normalized.includes("admin")) {
    return "admin";
  }

  return null;
}

// Every recognised role the account holds, in the order the backend lists them, without duplicates.
export function resolveAppRolesFromAuthPayload(payload: any): AppRole[] {
  const rolesArr = Array.isArray(payload?.roles) ? payload.roles : [];
  const adminRolesArr = Array.isArray(payload?.admin_roles) ? payload.admin_roles : [];
  // The explicit role assignments are authoritative; the looser fields only apply when there are none,
  // so a generic "admin" flag on the account cannot override a salesperson's assigned role.
  const assignedRoles = rolesArr.map((role) => role?.name);
  const roleCandidates = assignedRoles.some((name) => normalizeRoleCandidate(name))
    ? assignedRoles
    : [...adminRolesArr, payload?.user?.role, payload?.role];

  const roles: AppRole[] = [];
  for (const candidate of roleCandidates) {
    const resolvedRole = normalizeRoleCandidate(candidate);
    if (resolvedRole && !roles.includes(resolvedRole)) {
      roles.push(resolvedRole);
    }
  }

  if (roles.length === 0 && (payload?.user?.is_superuser || payload?.user?.is_staff)) {
    roles.push("admin");
  }

  return roles;
}

// The account's main role: it sets the landing page and drives the repair screens, which are written for one role.
// Sales is an add-on role (a front desk or QA user can also be given POS), so it is main only when it is the only one.
export function resolveAppRoleFromAuthPayload(payload: any): AppRole | null {
  const roles = resolveAppRolesFromAuthPayload(payload);
  return roles.find((role) => role !== "sales") ?? roles[0] ?? null;
}

// True when the user holds any of the wanted roles, as the main role or an additional one.
export function userHasRole(
  user: { role?: AppRole | null; roles?: readonly AppRole[] | null } | null | undefined,
  ...wanted: AppRole[]
): boolean {
  if (!user) return false;
  const held = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return wanted.some((role) => held.includes(role));
}

export function getLandingPath(role: AppRole | null | undefined, fallbackPath = "/"): string {
  if (!role) {
    return fallbackPath;
  }

  return ROLE_LANDING_PATHS[role] || fallbackPath;
}
