export type CacheMode = "memory" | "no-store" | "persist";

export const responseCache = new Map<string, unknown>();
export const inFlight = new Map<string, Promise<unknown>>();

const IDB_NAME = "openf1-cache";
const IDB_STORE = "responses";
let idbPromise: Promise<IDBDatabase> | null = null;

const getDb = () => {
  if (idbPromise) {
    return idbPromise;
  }
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onerror = () => reject(request.error);
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
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  });
};

export const setPersisted = async (key: string, value: unknown) => {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
