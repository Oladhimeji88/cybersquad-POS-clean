const DB_NAME = "cybersquad_repair_db";
const DB_VERSION = 1;
const STORE_NAME = "kv_store";
const MIGRATION_KEY = "repair_shop_idb_migrated_v1";
const IDB_TIMEOUT_MS = 2500;

type KeyValueEntry = {
  key: string;
  value: unknown;
};

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), IDB_TIMEOUT_MS);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  if (dbPromise) {
    return withTimeout(dbPromise, "Timed out while opening IndexedDB.");
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB open request was blocked by another tab."));
  });

  return withTimeout(dbPromise, "Timed out while opening IndexedDB.").catch((error) => {
    dbPromise = null;
    throw error;
  });
}

export async function dbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();

  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as KeyValueEntry | undefined;
        resolve((entry?.value as T | undefined) ?? null);
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to read from IndexedDB."));
    }),
    `Timed out while reading key "${key}" from IndexedDB.`
  );
}

export async function dbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();

  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ key, value } as KeyValueEntry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Failed to write to IndexedDB."));
    }),
    `Timed out while writing key "${key}" to IndexedDB.`
  );
}

export async function dbDelete(key: string): Promise<void> {
  const db = await openDatabase();

  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Failed to delete from IndexedDB."));
    }),
    `Timed out while deleting key "${key}" from IndexedDB.`
  );
}

export async function migrateFromLocalStorage(keys: string[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isIndexedDbAvailable()) return;
  if (window.localStorage.getItem(MIGRATION_KEY) === "true") return;

  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (raw == null) continue;

    const current = await dbGet<unknown>(key);
    if (current != null) continue;

    try {
      await dbSet(key, JSON.parse(raw));
    } catch {
      await dbSet(key, raw);
    }
  }

  window.localStorage.setItem(MIGRATION_KEY, "true");
}
