import { Actor, log } from 'apify';
import * as cheerio from 'cheerio';
import { detectTechStack } from './signatures.js';
import { fetchHiringSignal } from './boards.js';
import { extractContactInfo, findContactPageLink, mergeContactInfo } from './contact.js';
import { computeSignal } from './scoring.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { companies = [], roleKeywords = [], fetchContactPage = true } = input;

if (companies.length === 0) {
    throw new Error('No companies provided.');
}

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const COMPANY_REPORT_EVENT = 'company-report';

const USER_AGENT = 'CompanyBuyingSignalReport/0.1 (+contact: buying-signal-admin@example.com)';

function matchesKeywords(title, keywords) {
    if (!keywords || keywords.length === 0) return false;
    const lower = title.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase()));
}

async function fetchHtml(url) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
    return { html: await res.text(), headers: Object.fromEntries(res.headers.entries()), finalUrl: res.url };
}

for (const company of companies) {
    const domain = company.domain;
    if (!domain) {
        log.warning('Skipping company with no domain', { company });
        continue;
    }
    const homepageUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    let techStack = { detected: { cms: [], ecommerce: [], jsFrameworks: [], analytics: [], cdnHosting: [], payment: [], liveChat: [] } };
    let contact = { emails: [], phones: [], socialProfiles: {} };

    try {
        const { html, headers, finalUrl } = await fetchHtml(homepageUrl);
        const $ = cheerio.load(html);
        techStack = detectTechStack({ headers, html, $ });
        contact = extractContactInfo($);

        if (fetchContactPage) {
            const contactUrl = findContactPageLink($, finalUrl);
            if (contactUrl) {
                try {
                    const { html: contactHtml } = await fetchHtml(contactUrl);
                    contact = mergeContactInfo(contact, extractContactInfo(cheerio.load(contactHtml)));
                } catch (err) {
                    log.warning(`Contact page fetch failed`, { contactUrl, error: err.message });
                }
            }
        }
    } catch (err) {
        log.warning(`Homepage fetch failed`, { domain, error: err.message });
    }

    let hiring = null;
    try {
        hiring = await fetchHiringSignal({ domain, greenhouseSlug: company.greenhouseSlug, leverSlug: company.leverSlug });
    } catch (err) {
        log.warning(`Hiring signal lookup failed`, { domain, error: err.message });
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
        analyzedAt: new Date().toISOString(),
    });
    await Actor.charge({ eventName: COMPANY_REPORT_EVENT });

    log.info(`Reported on ${domain}`, { signalStrength: signal.strength, openRoles: roles.length });
}

await Actor.exit();
