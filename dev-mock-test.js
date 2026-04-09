/**
 * dev-mock-test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A mocking script to verify the Actor logic without real API calls.
 * It overrides axios to simulate Apollo pagination and Hunter enrichment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

// 1. Mock Apollo Response
const mockApolloSearch = (url, payload) => {
    const page = payload.page;
    console.log(`[Mock Apollo] Requesting page ${page}`);
    
    // Simulate 2 pages of 5 leads each
    if (page > 2) return { data: { people: [], pagination: { total_entries: 10 } } };
    
    return {
        data: {
            people: Array.from({ length: 5 }, (_, i) => ({
                first_name: `Lead`,
                last_name: `${(page - 1) * 5 + i + 1}`,
                title: 'Software Engineer',
                organization: { name: 'MockCorp', primary_domain: 'mockcorp.com' },
                email: page === 1 ? `lead${(page - 1) * 5 + i + 1}@mockcorp.com` : null,
                email_status: page === 1 ? 'verified' : null,
                linkedin_url: 'https://linkedin.com/in/mock',
            })),
            pagination: { total_entries: 10 }
        }
    };
};

// 2. Mock Hunter Response
const mockHunterEnrich = (url, config) => {
    console.log(`[Mock Hunter] Enriching for ${config.params.first_name}...`);
    return {
        data: {
            data: {
                email: `${config.params.first_name.toLowerCase()}.${config.params.last_name.toLowerCase()}@mockcorp.com`,
                verification: { status: 'valid' }
            }
        }
    };
};

// Apply Mocks
axios.post = async (url, payload) => {
    if (url.includes('mixed_people/search')) return mockApolloSearch(url, payload);
    throw new Error(`Unhandled POST to ${url}`);
};

axios.get = async (url, config) => {
    if (url.includes('email-finder')) return mockHunterEnrich(url, config);
    throw new Error(`Unhandled GET to ${url}`);
};

// 3. Run the Main Actor Logic
console.log('🧪 Starting mock test run...');
process.env.APIFY_IS_AT_HOME = '0'; // Simulate local run
import('./src/main.js');
