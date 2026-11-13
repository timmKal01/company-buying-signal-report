import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import { detectTechStack } from './signatures.js';
import { fetchHiringSignal } from './boards.js';
import { extractContactInfo, findContactPageLink, mergeContactInfo } from './contact.js';
import { computeSignal } from './scoring.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { domain: singleDomain, greenhouseSlug, leverSlug, companies: companiesInput, roleKeywords = [], fetchContactPage = true } = input;

// The single-company fields (domain/greenhouseSlug/leverSlug) exist so a Store visitor never has
// to touch the raw JSON "companies" editor just to check one company. They take priority when
// filled in; "companies" is for the bulk/multi-company case.
const companies = singleDomain
    ? [{ domain: singleDomain, greenhouseSlug, leverSlug }]
    : companiesInput?.length
        ? companiesInput
        : [{ domain: 'stripe.com', greenhouseSlug: 'stripe' }, { domain: 'palantir.com', leverSlug: 'palantir' }];

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const COMPANY_REPORT_EVENT = 'company-report';

const USER_AGENT = 'company-buying-signal-report/0.1 (+https://apify.com/m_ctim/company-buying-signal-report)';
const PAGE_TIMEOUT_MS = 20_000;

function matchesKeywords(title, keywords) {
    if (!keywords || keywords.length === 0) return false;
    const lower = title.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/** One page, with a timeout that covers the body too, so a site that stalls can't hang the run. */
async function fetchHtml(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, signal: controller.signal });
        if (!res.ok) throw new Error(`the site answered HTTP ${res.status}`);
        return { html: await res.text(), headers: Object.fromEntries(res.headers.entries()), finalUrl: res.url };
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`no answer within ${PAGE_TIMEOUT_MS / 1000} s`);
        const code = err.cause?.code ?? '';
        if (/ENOTFOUND|EAI_AGAIN/.test(code)) throw new Error("the domain doesn't resolve (DNS lookup failed)");
        if (/ECONNREFUSED/.test(code)) throw new Error('the server refused the connection');
        if (/CERT|SSL|TLS/.test(code)) throw new Error("the site's SSL certificate couldn't be verified");
        if (/TIMEOUT/.test(code)) throw new Error(`no answer within ${PAGE_TIMEOUT_MS / 1000} s`);
        throw err.message === 'fetch failed' && code ? new Error(`the connection failed (${code})`) : err;
    } finally {
        clearTimeout(timer);
    }
}

for (const company of companies) {
    const domain = typeof company?.domain === 'string' ? company.domain.trim() : '';
    if (!domain) {
        // A free row instead of a silent skip, so a buyer can see which entry was wrong.
        await Actor.pushData({ rowType: 'error', domain: null, input: company ?? null, error: 'No domain given. Use { "domain": "stripe.com" }. Not charged.', analyzedAt: new Date().toISOString() });
        log.warning('Company with no domain', { company });
        continue;
    }
    const homepageUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    let techStack = { detected: { cms: [], ecommerce: [], jsFrameworks: [], analytics: [], cdnHosting: [], payment: [], liveChat: [] } };
    let contact = { emails: [], phones: [], socialProfiles: {} };
    let homepageError = null;
    let hiringError = null;

    try {
        const { html, headers, finalUrl } = await fetchHtml(homepageUrl);
        const $ = cheerio.load(html);
        techStack = detectTechStack({ headers, html, $ });
        contact = extractContactInfo($, finalUrl);

        if (fetchContactPage) {
            const contactUrl = findContactPageLink($, finalUrl);
            if (contactUrl) {
                try {
                    const { html: contactHtml } = await fetchHtml(contactUrl);
                    contact = mergeContactInfo(contact, extractContactInfo(cheerio.load(contactHtml), contactUrl));
                } catch (err) {
                    log.warning(`Contact page fetch failed`, { contactUrl, error: err.message });
                }
            }
        }
    } catch (err) {
        homepageError = `The homepage couldn't be read: ${err.message}.`;
        log.warning(`Homepage fetch failed`, { domain, error: err.message });
    }

    let hiring = null;
    try {
        hiring = await fetchHiringSignal({ domain, greenhouseSlug: company.greenhouseSlug, leverSlug: company.leverSlug });
    } catch (err) {
        hiringError = `The job board couldn't be read: ${err.message}.`;
        log.warning(`Hiring signal lookup failed`, { domain, error: err.message });
    }

    // Nothing could be read at all: a free error row, not a charged report of zeros.
    if (homepageError && !hiring) {
        await Actor.pushData({ rowType: 'error', domain, error: [homepageError, hiringError ?? 'No Greenhouse or Lever board was found.'].join(' ') + ' Not charged.', analyzedAt: new Date().toISOString() });
        continue;
    }

    const roles = hiring?.roles ?? [];
    const notableRoles = roles.filter((r) => matchesKeywords(r.title, roleKeywords));
    const hasContact = contact.emails.length > 0 || contact.phones.length > 0 || Object.keys(contact.socialProfiles).length > 0;

    const signal = computeSignal({
        openRolesCount: roles.length,
        notableRolesCount: notableRoles.length,
        techStack: techStack.detected,
        hasContact,
    });

    await Actor.pushData({
        rowType: 'company',
        domain,
        hiring: {
            ats: hiring?.ats ?? null,
            slug: hiring?.slug ?? null,
            openRolesCount: roles.length,
            notableRoles: notableRoles.map((r) => r.title),
            roles,
        },
        techStack: techStack.detected,
        contact,
        signalStrength: signal.strength,
        signalScore: signal.score,
        signalReasons: signal.reasons,
        homepageError,
        hiringError,
        analyzedAt: new Date().toISOString(),
    });
    await Actor.charge({ eventName: COMPANY_REPORT_EVENT });

    log.info(`Reported on ${domain}`, { signalStrength: signal.strength, openRoles: roles.length });
}

await Actor.exit();
