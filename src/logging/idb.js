/**
 * @file src/logging/idb.js
 * @summary
 *  Small persistence layer for the client-side log queue:
 *  - Uses IndexedDB when available for durable, append-only buffering.
 *  - Falls back to localStorage if IndexedDB is unavailable or fails to open.
 *  - Exposes simple put/read/delete primitives used by the uploader.
 */

const LOG_DB_NAME = 'trustdoors-logs';
export const LOG_STORE = 'events';

/**
 * Open (or create) the IndexedDB database.
 * Returns `null` if IndexedDB is not available or fails to open.
 * @returns {Promise<IDBDatabase|null>}
 */
export function idbOpen() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);

    const req = indexedDB.open(LOG_DB_NAME, 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOG_STORE)) {
        db.createObjectStore(LOG_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // Treat as unavailable; caller will use fallback.
  });
}

/**
 * Append a batch of rows to the queue.
 * Uses IndexedDB when possible, else appends to a localStorage array.
 * @param {Array<Record<string, any>>} rows
 * @returns {Promise<void>}
 */
export async function idbPutAll(rows) {
  const db = await idbOpen();
  if (!db) {
    const key = 'log_queue_ls';
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify(prev.concat(rows)));
    return;
  }

  await new Promise((resolve) => {
    const tx = db.transaction(LOG_STORE, 'readwrite');
    const store = tx.objectStore(LOG_STORE);
    rows.forEach(row => store.add({ createdAt: Date.now(), row }));
    tx.oncomplete = resolve;
    tx.onerror = () => resolve(); // Swallow errors; caller still has in-memory copy.
  });
}

/**
 * Read up to `limit` rows from the head of the queue (without removing).
 * @param {number} limit
 * @returns {Promise<Array<{id: number|string, row: any, _ls?: boolean, _rawIndex?: number}>>}
 */
export async function idbReadBatch(limit) {
  const db = await idbOpen();
  if (!db) {
    const key = 'log_queue_ls';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    // Create synthetic identifiers for the fallback items.
    return arr.slice(0, limit).map((row, i) => ({ id: 'ls_' + i, row, _ls: true, _rawIndex: i }));
  }

  return new Promise((resolve) => {
    const tx = db.transaction(LOG_STORE, 'readonly');
    const store = tx.objectStore(LOG_STORE);
    const out = [];
    const req = store.openCursor();

    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur && out.length < limit) {
        out.push({ id: cur.key, row: cur.value.row });
        cur.continue();
      } else {
        resolve(out);
      }
    };

    req.onerror = () => resolve([]);
  });
}

/**
 * Delete the given items from the queue.
 * - For IndexedDB: deletes by primary key.
 * - For localStorage fallback: removes the first N items (batch semantics).
 * @param {Array<{id: number|string}>} items
 * @returns {Promise<void>}
 */
export async function idbDeleteIds(items) {
  const db = await idbOpen();
  if (!db) {
    const key = 'log_queue_ls';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    // In fallback mode we always send a prefix batch, so drop the first N.
    arr.splice(0, items.length);
    localStorage.setItem(key, JSON.stringify(arr));
    return;
  }

  await new Promise((resolve) => {
    const tx = db.transaction(LOG_STORE, 'readwrite');
    const store = tx.objectStore(LOG_STORE);
    items.forEach(it => store.delete(it.id));
    tx.oncomplete = resolve;
    tx.onerror = () => resolve();
  });
}
