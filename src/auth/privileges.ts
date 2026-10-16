function readStoredAuth(): any {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasPrivilege(privilegeKey: string): boolean {
  const stored = readStoredAuth();
  if (!stored) return false;

  if (stored?.user?.is_superuser === true) return true;

  if (stored?.aggregated_privileges?.[privilegeKey] === true) return true;

  if (Array.isArray(stored?.enabled_privileges) && stored.enabled_privileges.includes(privilegeKey)) {
    return true;
  }

  if (Array.isArray(stored?.roles)) {
    return stored.roles.some((role: any) => role?.privileges?.[privilegeKey] === true);
  }

  return false;
}

export function canApprovePayouts(): boolean {
  const stored = readStoredAuth();
  if (!stored) return false;
  if (stored?.user?.is_superuser === true) return true;
  if (stored?.can_approve_payouts === true) return true;
  if (Array.isArray(stored?.roles)) {
    return stored.roles.some((role: any) => role?.can_approve_payouts === true);
  }
  return false;
}
