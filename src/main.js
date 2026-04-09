/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Main entry point for the "Leads Scraper" Apify Actor.
 * Coordinates Apollo searching, Hunter enrichment, and persistence.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Actor } from 'apify';
import { getLeads } from './apollo.js';
import { enrichEmail } from './enrichment.js';
import { buildProgressKey, loadProgress, saveProgress, clearProgress } from './progress.js';

// Initialize the Actor environment
await Actor.init();

try {
    // 1. Get Actor input
    const input = await Actor.getInput();
    if (!input) throw new Error('Missing input data');

    const {
        personTitle,
        seniority,
        personCountry,
        companyEmployeeSize,
        industry,
        totalResults = 100,
        includeEmails = false,
        apolloSessionCookie,
        hunterApiKey,
        pageSize = 25,
        requestDelayMs = 1500,
    } = input;

    if (!apolloSessionCookie) {
        throw new Error('Apollo Session Cookie is required.');
    }

    if (includeEmails && !hunterApiKey) {
        throw new Error('Hunter API Key is required when "includeEmails" is true.');
    }

    // Filter set for progress tracking (excluding session/api keys)
    const filters = {
        personTitle,
        seniority,
        personCountry,
        companyEmployeeSize,
        industry,
    };

    // 2. Handle Progress tracking
    const progressKey = buildProgressKey(filters);
    const existingProgress = await loadProgress(progressKey);

    let currentPage = existingProgress ? existingProgress.lastPageScraped + 1 : 1;
    let leadsScraped = existingProgress ? existingProgress.totalScraped : 0;
    const startedAt = existingProgress ? existingProgress.startedAt : new Date().toISOString();

    console.log(`🚀 Starting scraper for up to ${totalResults} leads.`);

    // 3. Main Pagination Loop
    while (leadsScraped < totalResults) {
        console.log(`🔍 Fetching page ${currentPage}...`);
        
        // Fetch leads from Apollo
        const { people, totalCount } = await getLeads(filters, currentPage, apolloSessionCookie, pageSize);
        
        if (people.length === 0) {
            console.log('🏁 No more leads found on Apollo. Finishing.');
            break;
        }

        const remainingLimit = totalResults - leadsScraped;
        const pageLeads = people.slice(0, remainingLimit);

        // Process leads on the current page
        for (const person of pageLeads) {
            const firstName = person.first_name;
            const lastName = person.last_name;
            const company = person.organization?.name;
            const companyDomain = person.organization?.primary_domain;

            let email = person.email;
            let emailStatus = person.email_status || 'unknown';

            // 4. Enrichment (if requested and if email not already verified in Apollo)
            if (includeEmails && (!email || emailStatus !== 'verified')) {
                const enrichment = await enrichEmail(companyDomain, firstName, lastName, hunterApiKey);
                if (enrichment.email) {
                    email = enrichment.email;
                    emailStatus = enrichment.emailStatus;
                }
            }

            // 5. Build and Push result
            const leadData = {
                firstName,
                lastName,
                title: person.title,
                company,
                companyDomain,
                linkedinUrl: person.linkedin_url,
                companyLinkedinUrl: person.organization?.linkedin_url,
                email,
                emailStatus,
                phone: person.phone_numbers?.[0]?.sanitized_number || null,
                country: person.country,
                state: person.state,
            };

            await Actor.pushData(leadData);
            leadsScraped++;

            // Periodic progress logging
            if (leadsScraped % 100 === 0) {
                console.log(`📈 Scraped ${leadsScraped} / ${Math.min(totalResults, totalCount)} leads`);
            }
        }

        // 6. Update and save progress after each successful page
        await saveProgress(progressKey, {
            lastPageScraped: currentPage,
            totalScraped: leadsScraped,
            totalAvailable: totalCount,
            startedAt,
        });

        // Check if we've reached the end of Apollo's results
        if (leadsScraped >= totalCount) {
            console.log(`🏁 Reached total available results (${totalCount}). Finishing.`);
            break;
        }

        currentPage++;

        // 7. Rate limit avoidance delay
        const randomDelay = requestDelayMs + Math.floor(Math.random() * 1000);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
    }

    console.log(`✅ Successfully scraped ${leadsScraped} leads.`);
    
    // Clear progress if fully completed
    if (leadsScraped >= totalResults) {
        await clearProgress(progressKey);
    }

} catch (error) {
    console.error('❌ Actor failed:', error.message);
    await Actor.fail(error.message);
} finally {
    // Gracefully exit the Actor
    await Actor.exit();
}
