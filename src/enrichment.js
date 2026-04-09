/**
 * enrichment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hunter.io email enrichment module.
 *
 * Hunter.io's Email Finder API accepts a domain name + first/last name and
 * returns the most likely professional email address along with a confidence
 * score and verification status.
 *
 * Docs: https://hunter.io/api-documentation/v2#email-finder
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const HUNTER_FINDER_URL = 'https://api.hunter.io/v2/email-finder';

/**
 * Attempts to find/verify a professional email address for a given contact.
 *
 * Returns an enrichment result object regardless of success so callers can
 * always destructure `{ email, emailStatus }` from the result.
 *
 * @param {string} domain     - Company domain (e.g. "acme.com")
 * @param {string} firstName  - Contact's first name
 * @param {string} lastName   - Contact's last name
 * @param {string} apiKey     - Hunter.io API key
 * @returns {Promise<{email: string|null, emailStatus: string}>}
 */
export async function enrichEmail(domain, firstName, lastName, apiKey) {
  // Guard: skip enrichment if essential data is missing
  if (!domain || !firstName || !lastName || !apiKey) {
    return { email: null, emailStatus: 'skipped' };
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2_000;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await axios.get(HUNTER_FINDER_URL, {
        params: {
          domain,
          first_name: firstName,
          last_name:  lastName,
          api_key:    apiKey,
        },
        timeout: 15_000,
      });

      const data = response.data?.data ?? {};

      // Hunter returns null email when it cannot find a match
      if (!data.email) {
        return { email: null, emailStatus: 'not_found' };
      }

      return {
        email:       data.email,
        // Hunter verification statuses: 'valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'
        emailStatus: data.verification?.status ?? data.confidence_score >= 70
          ? 'verified'
          : 'unverified',
      };

    } catch (error) {
      const status = error.response?.status;

      // ── Hunter quota exhausted ────────────────────────────────────────────
      if (status === 429) {
        console.warn(`[Hunter] Rate limit hit. Waiting 30s before retry ${attempt}/${MAX_RETRIES}...`);
        await sleep(30_000);
        continue;
      }

      // ── Bad request / invalid params: no point retrying ──────────────────
      if (status === 400 || status === 422) {
        console.warn(`[Hunter] Bad request for ${firstName} ${lastName} @ ${domain}: ${error.message}`);
        return { email: null, emailStatus: 'error' };
      }

      // ── Transient error: wait then retry ─────────────────────────────────
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[Hunter] Error for ${domain} (attempt ${attempt}/${MAX_RETRIES}): ` +
          `${error.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // ── All retries exhausted: return graceful fallback ───────────────────
      console.error(`[Hunter] All retries exhausted for ${firstName} ${lastName} @ ${domain}`);
      return { email: null, emailStatus: 'error' };
    }
  }

  // Fallback (should not reach here)
  return { email: null, emailStatus: 'error' };
}

/**
 * Promise-based sleep helper.
 * @param {number} ms - Milliseconds to wait
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
