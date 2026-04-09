/**
 * progress.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Key-Value Store based progress tracker for the Leads Scraper actor.
 *
 * Progress is stored under a deterministic key derived from an MD5 hash of the
 * serialised filter object. This means:
 *   - Identical filter sets always resolve to the same key → resumable runs.
 *   - Different filter sets get independent progress slots → no cross-contamination.
 *
 * Stored progress shape:
 * {
 *   lastPageScraped: number,   // last successfully completed page index
 *   totalScraped:    number,   // cumulative lead count saved so far
 *   totalAvailable:  number,   // total leads Apollo reports for these filters
 *   startedAt:       string,   // ISO timestamp of first run
 *   updatedAt:       string,   // ISO timestamp of last update
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Actor } from 'apify';
import md5 from 'md5';

/**
 * Generates a stable, deterministic key for a given filter set.
 * Sorts the filter object keys before hashing to ensure order-independence.
 *
 * @param {Object} filters - The filter object from actor input
 * @returns {string}        - KV Store key, e.g. "PROGRESS_a1b2c3d4e5f6..."
 */
export function buildProgressKey(filters) {
  // Sort keys to make hash order-independent
  const sortedFilters = Object.fromEntries(
    Object.entries(filters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
  );
  const hash = md5(JSON.stringify(sortedFilters));
  return `PROGRESS_${hash}`;
}

/**
 * Loads existing progress from Apify Key-Value Store.
 * Returns null if no prior progress exists for this filter set.
 *
 * @param {string} key - The KV Store key (from buildProgressKey)
 * @returns {Promise<Object|null>}
 */
export async function loadProgress(key) {
  const store = await Actor.openKeyValueStore();
  const saved  = await store.getValue(key);

  if (saved) {
    console.log(
      `[Progress] Resuming previous run from page ${saved.lastPageScraped + 1}. ` +
      `Leads already scraped: ${saved.totalScraped}`,
    );
  } else {
    console.log('[Progress] No previous run found. Starting fresh.');
  }

  return saved ?? null;
}

/**
 * Saves current scraping progress to Apify Key-Value Store.
 *
 * @param {string} key           - The KV Store key
 * @param {Object} progressData  - Progress object to persist
 */
export async function saveProgress(key, progressData) {
  const store = await Actor.openKeyValueStore();
  await store.setValue(key, {
    ...progressData,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Clears progress for a given filter key (useful after a fully completed run).
 *
 * @param {string} key - The KV Store key to remove
 */
export async function clearProgress(key) {
  const store = await Actor.openKeyValueStore();
  await store.setValue(key, null);
  console.log(`[Progress] Cleared progress for key: ${key}`);
}
