const USER_AGENT = 'CompanyBuyingSignalReport/0.1 (+contact: buying-signal-admin@example.com)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
            continue;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res.json();
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`Request failed: ${url} (${res.status})`);
        }
        lastError = new Error(`Request failed: ${url} (${res.status})`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

async function fetchGreenhouse(slug) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
    const data = await fetchJson(url);
    return (data.jobs ?? []).map((job) => ({ title: job.title, location: job.location?.name ?? null, url: job.absolute_url }));
}

async function fetchLever(slug) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
    const data = await fetchJson(url);
    return (data ?? []).map((job) => ({ title: job.text, location: job.categories?.location ?? job.country ?? null, url: job.hostedUrl }));
}

/** Best-effort slug guess from a domain: strip protocol/www/TLD, keep the main label. */
export function guessSlugFromDomain(domain) {
    return domain
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('.')[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
}

/**
 * Tries the explicit slug for the given ATS if provided; otherwise guesses one from the
 * domain. Returns `{ ats, slug, roles }` for whichever ATS produced a result, or `null` if
 * neither Greenhouse nor Lever returned anything (common — plenty of companies use neither,
 * or use a slug that doesn't match their domain).
 */
export async function fetchHiringSignal({ domain, greenhouseSlug, leverSlug }) {
    const guessed = guessSlugFromDomain(domain);

    const attempts = [
        { ats: 'greenhouse', slug: greenhouseSlug ?? guessed, fetcher: fetchGreenhouse },
        { ats: 'lever', slug: leverSlug ?? guessed, fetcher: fetchLever },
    ];

    for (const { ats, slug, fetcher } of attempts) {
        try {
            const roles = await fetcher(slug);
            if (roles.length > 0) return { ats, slug, roles };
        } catch {
            // Slug didn't resolve on this ATS — try the next one.
        }
    }
    return null;
}
