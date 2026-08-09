const DATABASE_NAME = 'joeanime-web-database-v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const DATABASE_KEY = 'primary';

function indexedDBAvailable() {
  return typeof window !== 'undefined' && Boolean(window.indexedDB);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!indexedDBAvailable()) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error('JoeAnimeDB could not open browser storage.')
    );
    request.onblocked = () => reject(
      new Error('JoeAnimeDB browser storage is blocked by another open tab.')
    );
  });
}

async function runRequest(mode, operation) {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(
        request.error || transaction.error || new Error('Browser storage operation failed.')
      );
      transaction.onabort = () => reject(
        transaction.error || new Error('Browser storage transaction was cancelled.')
      );
    });
  } finally {
    database.close();
  }
}

export function supportsWebDatabase() {
  return indexedDBAvailable();
}

export async function readWebDatabase() {
  return runRequest('readonly', (store) => store.get(DATABASE_KEY));
}

export async function writeWebDatabase(snapshot = {}) {
  await runRequest('readwrite', (store) => store.put(snapshot, DATABASE_KEY));
  return snapshot;
}

export async function deleteWebDatabase() {
  await runRequest('readwrite', (store) => store.delete(DATABASE_KEY));
}

export async function requestWebPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false };
  }

  try {
    const alreadyPersisted = typeof navigator.storage.persisted === 'function'
      ? await navigator.storage.persisted()
      : false;
    const persisted = alreadyPersisted || (
      typeof navigator.storage.persist === 'function'
        ? await navigator.storage.persist()
        : false
    );
    const estimate = typeof navigator.storage.estimate === 'function'
      ? await navigator.storage.estimate()
      : {};

    return {
      supported: true,
      persisted: Boolean(persisted),
      usage: Number(estimate?.usage || 0),
      quota: Number(estimate?.quota || 0)
    };
  } catch (error) {
    return {
      supported: true,
      persisted: false,
      error: error?.message || String(error)
    };
  }
}
