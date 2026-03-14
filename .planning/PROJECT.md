# East Coast Local

## What This Is

A public-facing web app that helps people discover live music across Atlantic Canada (New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador). It uses AI-powered web scraping to automatically extract event data from venue websites and event platforms, then displays upcoming gigs on an interactive map with pin clusters that users can zoom into to find what's playing near them.

## Core Value

Users can instantly see what live music is happening near them on a map — where, when, and who's playing — without having to check dozens of individual venue websites.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ AI-powered web scraper that periodically extracts event data from configured URLs — v1.0
- ✓ Configurable list of scraping targets (venue websites + event platforms like Eventbrite, Bandsintown) — v1.0
- ✓ Event data storage with band/performer, venue, date, time, and location — v1.0
- ✓ Interactive map (Leaflet) covering Atlantic Canada with pin clusters — v1.0
- ✓ Pin clusters that expand into individual event pins when zoomed in — v1.0
- ✓ Event detail view showing band, venue, date, time, and location — v1.0
- ✓ Event listing/browse view with filtering by date and location — v1.0
- ✓ Clean, intuitive public-facing UI for discovering upcoming live music — v1.0
- ✓ Scheduled/periodic rescanning of sources (hands-off operation) — v1.0
- ✓ Cloud deployment (Vercel) — v1.0

### Active

<!-- Current scope. Building toward these. -->

(None — plan next milestone)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Non-music events (festivals, community events, markets) — focused on live music discovery only for v1
- AI-powered source discovery (finding new venues automatically) — too ambitious for v1, configure sources manually
- User accounts/authentication — public read-only app, no login needed
- Mobile native app — web-first, responsive design covers mobile
- Event submission by venues — scraping-only for v1
- Ticket purchasing/booking — link out to source if available

## Context

- Geographic scope: All four Atlantic Canadian provinces (NB, NS, PEI, NL)
- Event sources: Mix of individual venue websites and event platforms (Eventbrite, Bandsintown, etc.)
- Scraping approach: AI-powered extraction using Gemini LLM to parse event data from arbitrary page formats — no brittle CSS selectors
- The app is hands-off once configured — daily cron rescans happen automatically via Vercel
- Public app accessible to anyone in the region
- Map uses pin clustering: one pin per venue, clusters when zoomed out, expand to individual venues when zoomed in
- v1.0 shipped: 3,521 LOC TypeScript, 77 tests, Next.js 16 + Neon Postgres + Drizzle ORM

## Constraints

- **Hosting**: Cloud-hosted on Vercel with Neon Postgres — no self-hosted infrastructure
- **Scraping**: Must respect robots.txt and rate limits on source websites
- **Cost**: AI extraction costs managed via batch processing (daily cron, not real-time per-request)
- **Geography**: Google Maps Geocoding API for accurate Canadian addresses; rejects APPROXIMATE precision
- **Vercel Hobby**: 60s function timeout (maxDuration=60); 50MB function size limit rules out Playwright/Puppeteer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI-powered extraction over structured scrapers | Resilient to site redesigns, hands-off maintenance | ✓ Good — Gemini LLM extracts reliably from arbitrary HTML |
| Pin clusters over heat map | More intuitive for finding specific events | ✓ Good — one pin per venue with multi-event popups |
| Live music only (no general events) | Focused scope, clear value prop for v1 | ✓ Good — kept scope tight |
| No user accounts for v1 | Public read-only reduces complexity, faster to ship | ✓ Good — shipped in 2 days |
| Cloud deployment (Vercel) | Managed platform, no infrastructure management | ✓ Good — Neon integration auto-injects DATABASE_URL |
| Gemini Pro via Vercel AI SDK | User already pays for Gemini; avoids additional API costs | ✓ Good — generateText + Output.object pattern works |
| Google Maps Geocoding over Nominatim | Best accuracy for Canadian addresses | ✓ Good — ROOFTOP precision requirement filters bad geocodes |
| Drizzle ORM over raw SQL | Type-safe queries, schema-as-code, easy migrations | ✓ Good — innerJoin works with Neon HTTP driver |
| react-leaflet 5.x + react-leaflet-cluster 4.0 | React 19 compatible, stable releases | ✓ Good — SSR bypass via dynamic import works |
| nuqs for URL filter state | Type-safe URL params, useState-like API | ✓ Good — shareable filtered views, back-nav preserves state |
| Light theme + CartoDB Positron tiles | User chose light tiles; consistent light UI throughout | ✓ Good — clean, readable design |

---
*Last updated: 2026-03-14 after v1.0 milestone*
