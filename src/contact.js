import * as cheerio from 'cheerio';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}/g;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp)(?:@|$)/i;

const SOCIAL_DOMAINS = {
    linkedin: /linkedin\.com/i,
    twitter: /(?:twitter\.com|x\.com)/i,
    facebook: /facebook\.com/i,
    instagram: /instagram\.com/i,
    github: /github\.com/i,
};

const CONTACT_LINK_RE = /contact|about/i;

export function extractContactInfo($) {
    // .clone() so removing script/style doesn't mutate the shared document —
    // detectTechStack() and findContactPageLink() still need the originals.
    const bodyText = $('body').clone().find('script, style').remove().end().text();
    const emails = [...new Set((bodyText.match(EMAIL_RE) ?? []).filter((e) => !IMAGE_EXT_RE.test(e)))];
    const phones = [...new Set(bodyText.match(PHONE_RE) ?? [])].filter((p) => p.replace(/\D/g, '').length >= 7);

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
