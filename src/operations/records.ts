import { appendAuditUnlocked, readFromStorage, withSaleLock, writeToStorage } from "@/pos/lib/store";

// Shared plumbing for the operations modules: one array per key, every change appended to the
// record's own history and to the shared audit trail, inside the same lock so they cannot diverge.
export interface Trail { at: string; by: string; action: string; detail: string; }
export interface Tracked { id: string; history: Trail[]; }
export const money = (value: number) => Math.round(value * 100) / 100;
export const nextNumber = (prefix: string, count: number) => prefix + "-" + String(count + 1).padStart(4, "0");
export const isoNow = () => new Date().toISOString();
export const hoursFrom = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3600000).toISOString();

export function recordStore<T extends Tracked>(key: string, auditPrefix: string, label: (item: T) => string) {
  const all = async (): Promise<T[]> => {
    const raw = await readFromStorage<T[]>(key);
    return Array.isArray(raw) ? raw : [];
  };
  // `mutate` may throw to reject. It returns the changed item (or undefined for a pure create-less change) and what to log.
  async function change<R>(actor: string, mutate: (list: T[]) => { item: T; action: string; detail: string; result?: R }): Promise<R> {
    if (!actor.trim()) throw new Error("Sign in to record this action.");
    return withSaleLock(async () => {
      const list = await all(); const { item, action, detail, result } = mutate(list);
      item.history.push({ at: isoNow(), by: actor, action, detail });
      await writeToStorage(key, list);
      await appendAuditUnlocked(actor, auditPrefix + "_" + action, label(item) + " · " + detail);
      return result as R;
    });
  }
  const find = (list: T[], id: string, what: string) => {
    const item = list.find((entry) => entry.id === id);
    if (!item) throw new Error(what + " not found.");
    return item;
  };
  return { all, change, find };
}
export const reject = (message: string) => Promise.reject(new Error(message));
