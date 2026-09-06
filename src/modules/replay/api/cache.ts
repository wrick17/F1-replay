export type CacheMode = "memory" | "no-store" | "persist";

const MAX_MEMORY_ENTRIES = 100;

class BoundedMap<K, V> extends Map<K, V> {
  override set(key: K, value: V) {
    super.set(key, value);
    while (this.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    return this;
  }
}

export const responseCache = new BoundedMap<string, unknown>();
export const inFlight = new Map<string, Promise<unknown>>();

const IDB_NAME = "openf1-cache";
const IDB_STORE = "responses";
const IDB_VERSION = 2;
const CURRENT_METADATA_TTL_MS = 5 * 60 * 1000;
const HISTORICAL_BY_YEAR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let idbPromise: Promise<IDBDatabase> | null = null;

type PersistedRecord = {
  version: 1;
  storedAt: number;
  expiresAt: number;
  value: unknown;
};

const getTtlMs = (key: string) => {
  const year = Number(/(?:^|[?&])year=(\d{4})(?:&|$)/.exec(key)?.[1]);
  return Number.isInteger(year) && year < new Date().getUTCFullYear()
    ? HISTORICAL_BY_YEAR_TTL_MS
    : CURRENT_METADATA_TTL_MS;
};

const getDb = () => {
  if (idbPromise) {
    return idbPromise;
  }
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onerror = () => {
      idbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
  });
  return idbPromise;
};

export const getPersisted = async <T>(key: string): Promise<T | null> => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result as PersistedRecord | undefined;
      if (
        !record ||
        record.version !== 1 ||
        !Number.isFinite(record.expiresAt) ||
        record.expiresAt <= Date.now()
      ) {
        resolve(null);
        return;
      }
      resolve(record.value as T);
    };
    request.onerror = () => reject(request.error);
  });
};

export const setPersisted = async (key: string, value: unknown) => {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put(
      {
        version: 1,
        storedAt: Date.now(),
        expiresAt: Date.now() + getTtlMs(key),
        value,
      } satisfies PersistedRecord,
      key,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
};
