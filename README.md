# Company Buying Signal Report — Hiring, Tech Stack & Contact in One Row

Give it a list of company domains. Get back one row per company combining
three sales-relevant signals that would otherwise mean stitching together
three separate tools:

- **Hiring signal** — open roles pulled from the company's own Greenhouse or
  Lever job board API (which roles, how many, whether any match your target
  titles)
- **Tech stack fingerprint** — CMS, ecommerce platform, analytics, payment,
  and live-chat tools detected from the homepage
- **Public contact info** — email, phone, and social profiles from the
  homepage and a linked contact/about page

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

```json
{
  "domain": "stripe.com",
  "hiring": {
    "ats": "greenhouse",
    "slug": "stripe",
    "openRolesCount": 142,
    "notableRoles": ["Account Executive, Bridge", "Senior Software Engineer"],
    "roles": [{ "title": "Account Executive, Bridge", "location": "London", "url": "https://stripe.com/jobs/..." }]
  },
  "techStack": {
    "cms": [],
    "ecommerce": [],
    "jsFrameworks": ["React"],
    "analytics": ["Google Analytics", "Segment"],
    "cdnHosting": ["Cloudflare"],
    "payment": ["Stripe"],
    "liveChat": ["Intercom"]
  },
  "contact": {
    "emails": ["press@stripe.com"],
    "phones": [],
    "socialProfiles": { "linkedin": "https://linkedin.com/company/stripe" }
  },
  "signalStrength": "high",
  "signalScore": 4,
  "signalReasons": [
    "142 open roles (actively scaling)",
    "2 role(s) match notable keywords",
    "uses paid ecommerce/payment/chat/analytics tooling",
    "public contact info found"
  ],
  "analyzedAt": "2026-08-07T00:00:00.000Z"
}
```

## How it works

Three passive, ToS-clean lookups per company — no proxy, no login, no
headless browser:

- **Hiring**: direct calls to `boards-api.greenhouse.io` / `api.lever.co`,
  the same public JSON APIs that power each company's own careers page.
- **Tech stack**: signature matching (response headers, meta tags, script
  sources) against the homepage HTML — the same technique tools like
  Wappalyzer use.
- **Contact info**: regex extraction over the homepage (and one linked
  contact/about page) for emails, phone numbers, and social links — nothing
  behind a login, nothing a browser wouldn't show any visitor.

## Pricing note

Billed per **company report**, not per sub-signal — one charge whether the
company has 3 open roles or 300, and regardless of how many tech-stack
signatures or contact fields matched. Priced above a single-source lookup
because it replaces three separate tool runs with one.

| Approach | Cost |
|---|---|
| Hiring-only actor + tech-stack actor + lead-extractor actor, run separately | 3 runs, 3 line items, manual joining |
| This actor | 1 run, 1 row per company, already joined |

## Related products

Need just one signal instead of the combined report? Same underlying
methods, standalone:

- [Company Hiring Tracker](https://github.com/timmKal01/company-hiring-tracker) — hiring signal only, full job list per board
- [Website Tech Stack Detector](https://github.com/timmKal01/website-tech-stack-detector) — tech fingerprint only, deeper signature set
- [Website Lead Extractor](https://github.com/timmKal01/website-lead-extractor) — contact info only, with configurable crawl depth
