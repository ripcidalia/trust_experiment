/**
 * @file src/logging/index.js
 * @summary
 *  Durable client-side logging pipeline.
 *  - Queues rows to IndexedDB (falls back to localStorage).
 *  - Flushes in batches with exponential backoff.
 *  - Supports background send via sendBeacon on pagehide.
 */

import { idbOpen, idbPutAll, idbReadBatch, idbDeleteIds, LOG_STORE } from './idb.js';

/** HTTP endpoint for the Apps Script receiver */
export const LOG_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxX24F1UDZmQgTgU7tXcdkKGfieoIj3HJHlB4XEbFXGpyvnZcUM_VwLFhrs2EmWsELl/exec';

const LOG_BATCH_SIZE = 25;

let LOG_RETRY_ATTEMPTS = 0;
let LOG_FLUSHING = false;
let LOG_BACKOFF_TIMER = null;

/**
 * Enqueue one or more rows for durable delivery.
 * - Mirrors to an in-memory buffer used by `flushSyncBeacon`.
 * - Persists to IDB/localStorage.
 * - Schedules a near-term flush.
 * @param {object|object[]} rows
 */
export async function logEnqueue(rows) {
  if (!Array.isArray(rows)) rows = [rows];
  (window.__LOG_BUFFER__ ||= []).push(...rows); // in-memory tail
  await idbPutAll(rows);
  scheduleFlush(250);
}

/**
 * Schedule a queue flush. No-op if a backoff timer is already set.
 * @param {number} delayMs
 */
export function scheduleFlush(delayMs = 0) {
  if (window.__DISCARD_DATA__) return;
  if (LOG_BACKOFF_TIMER) return;
  LOG_BACKOFF_TIMER = setTimeout(() => {
    LOG_BACKOFF_TIMER = null;
    flushQueue();
  }, delayMs);
}

/**
 * Attempt a fire-and-forget send of recent rows using `navigator.sendBeacon`.
 * Sends up to ~60KB in a single beacon (tail slice only).
 * Safe to call in `pagehide` / `visibilitychange`.
 */
export function flushSyncBeacon() {
  try {
    const buf = window.__LOG_BUFFER__;
    if (!buf || !buf.length) return;

    const maxBytes = 60000; // conservative payload cap
    let sliceStart = Math.max(0, buf.length - LOG_BATCH_SIZE); // prefer the most recent rows
    let end = buf.length;
    let blob = null;

    while (end > sliceStart) {
      const payload = JSON.stringify({ rows: buf.slice(sliceStart, end) });
      const body = 'payload=' + encodeURIComponent(payload);
      blob = new Blob([body], { type: 'application/x-www-form-urlencoded;charset=UTF-8' });
      if (blob.size <= maxBytes) break;
      end = Math.max(sliceStart + 1, Math.floor((sliceStart + end) / 2));
    }

    if (navigator.sendBeacon && blob) {
      navigator.sendBeacon(LOG_ENDPOINT, blob);
    }
  } catch {
    /* swallow: sync beacons are best-effort */
  }
}

/**
 * Clear all local queue state (memory + IDB/LS).
 * Useful for explicit “discard data” flows.
 */
export async function clearLocalQueue() {
  window.__LOG_BUFFER__ = [];
  const db = await idbOpen();
  if (!db) {
    localStorage.removeItem('log_queue_ls');
    return;
  }
  await new Promise((resolve) => {
    const tx = db.transaction(LOG_STORE, 'readwrite');
    const store = tx.objectStore(LOG_STORE);
    const req = store.clear();
    req.onsuccess = resolve;
    req.onerror = resolve;
  });
}

/**
 * Ask the server to delete all rows belonging to a participant.
 * Uses `sendBeacon` when available (to survive navigations).
 * @param {string} participantId
 */
export async function requestDeleteByParticipant(participantId) {
  if (!participantId || !LOG_ENDPOINT) return;

  const body = new URLSearchParams();
  body.set('action', 'delete_by_participant');
  body.set('participant_id', participantId);

  if (navigator.sendBeacon) {
    const blob = new Blob([body.toString()], { type: 'application/x-www-form-urlencoded;charset=UTF-8' });
    navigator.sendBeacon(LOG_ENDPOINT, blob);
    return;
  }

  try {
    await fetch(LOG_ENDPOINT, { method: 'POST', body, keepalive: true });
  } catch {
    /* network failures are acceptable here */
  }
}

/** Internal: drain the persistent queue in batches with backoff. */
async function flushQueue() {
  if (LOG_FLUSHING || window.__DISCARD_DATA__) return;
  LOG_FLUSHING = true;

  try {
    for (;;) {
      const batch = await idbReadBatch(LOG_BATCH_SIZE);
      if (!batch.length) {
        window.__LOG_BUFFER__ = [];
        LOG_RETRY_ATTEMPTS = 0;
        break;
      }

      const rows = batch.map(b => b.row);
      const ok = await sendBatch(rows);

      if (ok) {
        await idbDeleteIds(batch);
        (window.__LOG_BUFFER__ ||= []).splice(0, rows.length);
        LOG_RETRY_ATTEMPTS = 0;
        continue; // next batch
      }

      LOG_RETRY_ATTEMPTS++;
      const backoffMs = Math.min(30000, 500 * Math.pow(2, LOG_RETRY_ATTEMPTS)); // 0.5s → 30s cap
      scheduleFlush(backoffMs);
      break;
    }
  } finally {
    LOG_FLUSHING = false;
  }
}

/**
 * POST a batch to the endpoint. Treat common redirect/opaque responses as success.
 * @param {object[]} rows
 * @returns {Promise<boolean>}
 */
async function sendBatch(rows) {
  if (window.__DISCARD_DATA__) return true;

  try {
    const body = new URLSearchParams({ payload: JSON.stringify({ rows }) });
    const res = await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      redirect: 'follow'
    });

    const okLike =
      (res && res.ok) ||
      (res && res.status === 302) ||
      (res && (res.type === 'opaqueredirect' || res.type === 'opaque'));

    return !!okLike;
  } catch (e) {
    console.error('sendBatch error:', e);
    return false;
  }
}
