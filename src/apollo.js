/**
 * apollo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Module responsible for all Apollo.io API interactions.
 *
 * Apollo.io does not have a public API for people search, so we reverse-engineer
 * the authenticated internal endpoint used by the web application.
 *
 * Endpoint: POST https://app.apollo.io/api/v1/mixed_people/search
 * Auth:     Session cookie passed via Cookie header + CSRF token via X-CSRF-Token
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const APOLLO_SEARCH_URL = 'https://app.apollo.io/api/v1/mixed_people/search';

/**
 * Maps human-readable employee size strings to Apollo's internal filter codes.
 * Apollo uses specific range codes in its API payload.
 */
const EMPLOYEE_SIZE_MAP = {
  '1 - 1':      '1,1',
  '2 - 10':     '2,10',
  '11 - 50':    '11,50',
  '51 - 200':   '51,200',
  '201 - 500':  '201,500',
  '501 - 1000': '501,1000',
  '1001 - 5000':'1001,5000',
  '5001+':      '5001,10000000',
};

/**
 * Builds the Apollo API request payload from user-provided filter options.
 *
 * @param {Object} filters       - Normalised filter object from actor input
 * @param {number} page          - 1-based page number
 * @param {number} pageSize      - Results per page (max 25)
 * @returns {Object}             - Apollo API request body
 */
function buildPayload(filters, page, pageSize) {
  // Map employee size strings to Apollo's expected numeric range format
  const employeeRanges = (filters.companyEmployeeSize || []).map(
    (size) => EMPLOYEE_SIZE_MAP[size] ?? size,
  );

  return {
    api_key: undefined, // Not needed – we use cookie auth
    page,
    per_page: pageSize,
    // Title / role filters
    person_titles:       filters.personTitle       ?? [],
    person_seniorities:  filters.seniority         ?? [],
    // Geography
    person_locations:    filters.personCountry     ?? [],
    // Company attributes
    organization_num_employees_ranges: employeeRanges,
    // Industry / keyword filters
    organization_industry_tag_ids: [],          // populated below if available
    q_organization_keyword_tags:   filters.industry ?? [],
    // We want people with LinkedIn profiles when possible
    linkedin_url: '',
    // Always request contact info fields
    contact_email_status_v2: ['verified', 'unverified', 'likely_to_engage'],
  };
}

/**
 * Executes a single paginated search query against Apollo.io's internal API.
 *
 * Retry logic:
 *   - On HTTP 429 (rate-limit) or 403 (auth re-challenge): waits 30 s then retries
 *   - On any other transient error: up to 3 attempts with 2 s between each
 *
 * @param {Object} filters    - Apollo filter options
 * @param {number} page       - Page number (1-indexed)
 * @param {string} cookie     - Full Apollo session cookie string
 * @param {number} [pageSize] - Results per page (default 25)
 * @returns {Promise<{people: Array, totalCount: number}>}
 */
export async function getLeads(filters, page, cookie, pageSize = 25) {
  const payload = buildPayload(filters, page, pageSize);
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2_000;
  const RATE_LIMIT_DELAY_MS = 30_000;

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await axios.post(APOLLO_SEARCH_URL, payload, {
        headers: buildHeaders(cookie),
        timeout: 30_000, // 30-second timeout per request
      });

      const data = response.data;

      // Apollo returns top-level `people` array and `pagination` object
      const people     = data.people     ?? [];
      const totalCount = data.pagination?.total_entries ?? 0;

      return { people, totalCount };

    } catch (error) {
      const status = error.response?.status;

      // ── Rate-limited or forbidden: hold 30 s then retry ──────────────────
      if (status === 429 || status === 403) {
        console.warn(
          `[Apollo] HTTP ${status} on page ${page}. ` +
          `Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before retry ${attempt}/${MAX_RETRIES}...`,
        );
        await sleep(RATE_LIMIT_DELAY_MS);
        continue; // retry immediately without counting this against MAX_RETRIES
      }

      // ── Transient network/server error: wait 2 s then retry ──────────────
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[Apollo] Request error on page ${page} (attempt ${attempt}/${MAX_RETRIES}): ` +
          `${error.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // ── Exhausted retries ─────────────────────────────────────────────────
      console.error(`[Apollo] All retries exhausted for page ${page}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Builds the HTTP headers required to authenticate with Apollo's internal API.
 * These are reverse-engineered from normal browser traffic.
 *
 * @param {string} cookie - Full Apollo session cookie string
 * @returns {Object}       - Axios-compatible headers object
 */
function buildHeaders(cookie) {
  // Extract the CSRF token that Apollo embeds inside the cookie string
  // The token appears as `_csrf_token=<value>` or `X-CSRF-Token` form value
  const csrfMatch = cookie.match(/(?:_csrf_token|csrf_token|X-CSRF-TOKEN)=([^;]+)/i);
  const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';

  return {
    'Content-Type':    'application/json',
    'Accept':          'application/json, text/plain, */*',
    'Cookie':          cookie,
    'X-CSRF-Token':    csrfToken,
    // Apollo validates these browser-like headers
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/122.0.0.0 Safari/537.36',
    'Referer':         'https://app.apollo.io/',
    'Origin':          'https://app.apollo.io',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };
}

/**
 * Promise-based sleep helper.
 * @param {number} ms - Milliseconds to wait
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
