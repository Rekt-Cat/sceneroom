/**
 * A tiny wrapper around the browser's IndexedDB (its built-in database), so the rest of the app can use
 * promises. IndexedDB can keep large binary data (like model files) that localStorage cannot.
 *
 * One database, two "stores" (like tables): the scene, and the imported files.
 */
export const DB_NAME = "sceneroom";
export const DB_VERSION = 1;
export const STORE_SCENES = "scenes";
export const STORE_ASSETS = "assets";

/** Opens (and, the first time, creates) the database. Rejects if the browser does not allow it. */
export function openDatabase(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [STORE_SCENES, STORE_ASSETS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the browser storage."));
    request.onblocked = () =>
      reject(
        new Error(
          "The browser storage is blocked by another SceneRoom tab. Close the other tabs and reload.",
        ),
      );
  });
}

/**
 * Runs one request in its own transaction and waits until the data is really written (the
 * transaction completed), not just until the request was accepted.
 */
export function run<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(transaction.error ?? request.error ?? new Error("Storage error."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The browser stopped the save."));
  });
}

/** A sentence for the user from a storage error (the usual cause is a full or blocked store). */
export function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") {
    return "The browser storage is full. Free some space (or delete other saved sites' data) and try again.";
  }
  if (name === "SecurityError" || name === "InvalidStateError") {
    return "This browser is blocking storage for this site (a private window can do this).";
  }
  return "The browser could not save the data.";
}
