# Company Buying Signals: Hiring, Tech & Contacts

Give it a list of company domains. Get back one row per company combining
three sales-relevant signals that would otherwise mean stitching together
three separate tools:

- **Hiring signal** — open roles pulled from the company's own Greenhouse or
  Lever job board API (which roles, how many, whether any match your target
  titles)
- **Tech stack fingerprint** — CMS, ecommerce platform, analytics, payment,
  and live-chat tools detected from the homepage
- **Public contact info** — the company's own business emails, phone and
  social profiles from the homepage and a linked contact/about page

...plus a computed **buying-signal score** (`low`/`medium`/`high`) with the
specific reasons behind it, so you're not just getting three raw feeds but a
sortable "who to call first" list.

Built for SDRs and sales teams prioritizing a target-account list, agencies
scoping prospects before outreach, and market researchers tracking
tech-adoption + hiring trends together. A 100-account target list normally
means three separate tool exports and a manual join in a spreadsheet before
anyone can rank who to call first — this returns the ranked list directly.

## Input

```json
{
  "companies": [
    { "domain": "stripe.com", "greenhouseSlug": "stripe" },
    { "domain": "palantir.com", "leverSlug": "palantir" },
    { "domain": "some-startup.com" }
  ],
  "roleKeywords": ["sales", "account executive", "engineer", "growth"],
  "fetchContactPage": true
}
```

| Field | Type | Description |
|---|---|---|
| `companies` | array | One entry per company. `domain` is required. `greenhouseSlug`/`leverSlug` are optional — see below. |
| `roleKeywords` | array of strings | Open roles matching one of these count as a stronger hiring signal. |
| `fetchContactPage` | boolean | Also fetch a linked contact/about page to improve contact-info coverage (default `true`, adds one request per company). |

**On slugs:** if you omit `greenhouseSlug`/`leverSlug`, the actor guesses one
from the domain (`stripe.com` → `stripe`). This works when a company's board
slug matches their domain name and misses when it doesn't — pass the slug
explicitly (findable on their careers page URL) for a guaranteed hit.

## Output

One record per company:

A real row from a local test run on 2026-11-13 (`roleKeywords` from the example input; the role lists are shortened):

```json
{
  "rowType": "company",
  "domain": "stripe.com",
  "hiring": {
    "ats": "greenhouse",
    "slug": "stripe",
    "openRolesCount": 788,
    "notableRoles": ["Account Executive, AI Sales", "..."],
    "roles": [{ "title": "Abuse Investigator", "location": "Seattle, San Francisco, New York City", "url": "https://stripe.com/jobs/search?gh_jid=8172510" }]
  },
  "techStack": {
    "cms": [],
    "ecommerce": [],
    "jsFrameworks": ["Next.js"],
    "analytics": [],
    "cdnHosting": [],
    "payment": [],
    "liveChat": []
  },
  "contact": {
    "emails": [],
    "phones": ["+1 888 926 2289"],
    "socialProfiles": { "github": "https://github.com/stripe" }
  },
  "signalStrength": "high",
  "signalScore": 4,
  "signalReasons": [
    "788 open roles (actively scaling)",
    "407 role(s) match notable keywords",
    "public contact info found"
  ],
  "homepageError": null,
  "hiringError": null,
  "analyzedAt": "2026-11-13T09:40:06.029Z"
}
```

`rowType` is `"company"`. If the homepage or the job board can't be read, the row says why in `homepageError` or `hiringError`. A company where neither could be read, or an entry with no domain, comes back as a free `"error"` row instead, with the reason.

## How it works

Three passive, ToS-clean lookups per company — no proxy, no login, no
headless browser:

- **Hiring**: direct calls to `boards-api.greenhouse.io` / `api.lever.co`,
  the same public JSON APIs that power each company's own careers page.
- **Tech stack**: signature matching (response headers, meta tags, script
  sources) against the homepage HTML — the same technique tools like
  Wappalyzer use.
- **Contact info**: the homepage (and one linked contact/about page) for
  emails, phone numbers, and social links — nothing behind a login, nothing a
  browser wouldn't show any visitor. Only the company's own addresses are
  kept: generic mailboxes (`info@`, `sales@`, `press@`...) and addresses
  carrying the company's name. An address that looks like one person's own
  mailbox is left out, even when the site publishes it. Phones need an
  unambiguous format, so order numbers and dates aren't mistaken for them.

## Pricing note

$0.007 per **company report**, not per sub-signal — one charge whether the
company has 3 open roles or 300, and regardless of how many tech-stack
signatures or contact fields matched. Priced above a single-source lookup
because it replaces three separate tool runs with one.

| Approach | Cost |
|---|---|
| Hiring-only actor + tech-stack actor + lead-extractor actor, run separately | 3 runs, 3 line items, manual joining |
| This actor | 1 run, 1 row per company, already joined |

Error rows (nothing could be read, or no domain given) are free.

## Related products

Need one signal in depth instead of the combined report?

- [ATS & Remote Jobs Scraper](https://apify.com/m_ctim/ats-jobs-aggregator): every open job from a company's Workday, Greenhouse, Lever, Ashby or Workable board, with a hiring monitor
- [Tech Stack Detector & Lead Finder](https://apify.com/m_ctim/tech-stack-lead-finder): 124 technologies per site, or sites filtered by the tools they use, with business contacts
