import * as cheerio from 'cheerio';
import { businessEmails, extractEmails, extractPhones, hrefs, visibleText } from './contactRules.js';

const SOCIAL_DOMAINS = {
    linkedin: /linkedin\.com/i,
    twitter: /(?:twitter\.com|x\.com)/i,
    facebook: /facebook\.com/i,
    instagram: /instagram\.com/i,
    github: /github\.com/i,
};

const CONTACT_LINK_RE = /contact|about/i;

/**
 * Contact details a company publishes on one page. Since 2026-11-13 (when the actor came back from retirement):
 * emails and phones use the stricter rules from tech-stack-lead-finder (no next word glued onto an address, no order
 * numbers or dates read as phones), and only the business's own addresses are kept: generic mailboxes (info@,
 * sales@...) and addresses carrying the company's name, never an address that may be one person's own mailbox.
 */
export function extractContactInfo($, pageUrl) {
    const links = hrefs($, pageUrl);
    const text = visibleText($);
    const emails = businessEmails(extractEmails(text, links.filter((h) => /^mailto:/i.test(h))), pageUrl);
    const phones = extractPhones(text, links.filter((h) => /^tel:/i.test(h)));

    const socialProfiles = {};
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        for (const [platform, re] of Object.entries(SOCIAL_DOMAINS)) {
            if (!socialProfiles[platform] && re.test(href)) {
                socialProfiles[platform] = href;
            }
        }
    });

    return { emails, phones, socialProfiles };
}

/** Finds the first same-domain link whose href or text looks like a contact/about page. */
export function findContactPageLink($, baseUrl) {
    let found = null;
    $('a[href]').each((_, el) => {
        if (found) return;
        const href = $(el).attr('href');
        const text = $(el).text();
        if (!href) return;
        if (CONTACT_LINK_RE.test(href) || CONTACT_LINK_RE.test(text)) {
            try {
                const resolved = new URL(href, baseUrl);
                if (resolved.hostname.replace(/^www\./, '') === new URL(baseUrl).hostname.replace(/^www\./, '')) {
                    found = resolved.toString();
                }
            } catch {
                // Malformed href — skip.
            }
        }
    });
    return found;
}

export function mergeContactInfo(a, b) {
    return {
        emails: [...new Set([...a.emails, ...b.emails])],
        phones: [...new Set([...a.phones, ...b.phones])],
        socialProfiles: { ...a.socialProfiles, ...b.socialProfiles },
    };
}

export { cheerio };
