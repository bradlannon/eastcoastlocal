# East Coast Local

## What This Is

A public-facing web app that helps people discover events across Atlantic Canada (New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador). It uses AI-powered web scraping to automatically extract event data from venue websites and event platforms, then displays upcoming events on an interactive map with pin clusters and a heatmap timelapse mode. Events are automatically categorized by type (live music, comedy, theatre, arts, sports, festival, community) and users can filter by category. A weekly discovery pipeline automatically finds new event venues across the region.

## Core Value

Users can instantly see what events are happening near them on a map — where, when, and what type — without having to check dozens of individual venue websites.

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
- ✓ Heatmap overlay showing event density by location — v1.1
- ✓ Heatmap intensity reflects number of events at each venue within time window — v1.1
- ✓ Click-through from heatmap hotspots to specific events — v1.1
- ✓ Heatmap updates smoothly as time position changes — v1.1
- ✓ Draggable timeline scrubber across 30-day window — v1.1
- ✓ 24-hour rolling window per scrubber position — v1.1
- ✓ Date/time label showing current window — v1.1
- ✓ Play/pause auto-advance animation — v1.1
- ✓ Toggle between pin/cluster view and heatmap timelapse mode — v1.1
- ✓ Event list sidebar syncs with current time window — v1.1
- ✓ Map viewport preserved when switching modes — v1.1
- ✓ Events automatically assigned a category by AI during scraping — v1.2
- ✓ Existing events backfilled with categories — v1.2
- ✓ Database schema includes event_category enum column — v1.2
- ✓ User can filter events by category using chip buttons — v1.2
- ✓ Category filter applies to heatmap mode — v1.2
- ✓ Category filter persisted in URL and shareable — v1.2
- ✓ System automatically searches for new event venues across Atlantic Canada — v1.2
- ✓ Discovered sources staged for review before scraping — v1.2
- ✓ Approved sources can be promoted to active scraping — v1.2

- ✓ Admin routes protected behind login gate — v1.3
- ✓ Admin can log in with configured email/password — v1.3
- ✓ Admin dashboard shows system health (venues, sources, discoveries, last scrape) — v1.3
- ✓ Per-source scrape status with last success, last error, enabled/disabled — v1.3
- ✓ Admin can view, add, and edit venues through web UI — v1.3
- ✓ Admin can add scrape source URLs to venues — v1.3
- ✓ Admin can toggle scrape sources enabled/disabled — v1.3
- ✓ Admin can review discovered sources filtered by status — v1.3
- ✓ Admin can approve discovered sources (promotes to venue + scrape source) — v1.3
- ✓ Admin can reject discovered sources with optional reason — v1.3

### Active

<!-- Current scope. Building toward these. -->

- [ ] Ticketmaster Discovery API integration for Atlantic Canada events — v1.4
- [ ] Songkick concert listings integration — v1.4
- [ ] Google Events structured data extraction — v1.4
- [ ] Multi-page/pagination support for venue website scraping — v1.4
- [ ] Rate limiting to avoid being blocked by venue websites — v1.4
- [ ] Scrape quality metrics (accuracy tracking, confidence scores, false positive detection) — v1.4
- [ ] Auto-approve high-confidence discovered sources without manual review — v1.4

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- User accounts/authentication — public read-only app, no login needed
- Mobile native app — web-first, responsive design covers mobile
- Event submission by venues — scraping-only
- Ticket purchasing/booking — link out to source if available
- Server-side heatmap aggregation — client-side filtering sufficient at Atlantic Canada data scale
- URL persistence of time position — animation state through nuqs causes History API rate-limit issues
- Multi-select category filter — single-select chips sufficient for current taxonomy size
- Real-time discovery (user-triggered) — discovery is a periodic cron job, not on-demand
- Category customization by users — fixed 8-category taxonomy enforced by AI
- Facebook Events integration — requires headless browser, blocked by Vercel Hobby constraints; deferred to v1.5

## Context

- Geographic scope: All four Atlantic Canadian provinces (NB, NS, PEI, NL)
- Event sources: 26 configured venues across all 4 provinces (pubs, bars, breweries, theatres) + automated discovery of new sources
- Event types: 8 categories — live music, comedy, theatre, arts, sports, festival, community, other
- Scraping approach: AI-powered extraction using Gemini LLM to parse event data from arbitrary page formats — no brittle CSS selectors
- Discovery: Weekly Gemini + Google Search grounding scans 6 Atlantic Canada cities for new venue websites, stages for human review
- The app is hands-off once configured — daily scrape cron and weekly discovery cron run automatically via Vercel
- Public app accessible to anyone in the region
- Map has two modes: pin clustering (default) and heatmap timelapse with 6-hour block steps
- v1.3 shipped: 7,983 LOC TypeScript, Next.js 16 + Neon Postgres + Drizzle ORM + leaflet.heat
- Admin UI at /admin with JWT auth, dashboard, venue management, and discovery review
- Deployed at eastcoastlocal.bradlannon.ca

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
| Live music only (no general events) | Focused scope, clear value prop for v1 | ✓ Good — kept scope tight; expanded in v1.2 |
| No user accounts for v1 | Public read-only reduces complexity, faster to ship | ✓ Good — shipped in 2 days |
| Cloud deployment (Vercel) | Managed platform, no infrastructure management | ✓ Good — Neon integration auto-injects DATABASE_URL |
| Gemini Pro via Vercel AI SDK | User already pays for Gemini; avoids additional API costs | ✓ Good — generateText + Output.object pattern works |
| Google Maps Geocoding over Nominatim | Best accuracy for Canadian addresses | ✓ Good — ROOFTOP precision requirement filters bad geocodes |
| Drizzle ORM over raw SQL | Type-safe queries, schema-as-code, easy migrations | ✓ Good — innerJoin works with Neon HTTP driver |
| react-leaflet 5.x + react-leaflet-cluster 4.0 | React 19 compatible, stable releases | ✓ Good — SSR bypass via dynamic import works |
| nuqs for URL filter state | Type-safe URL params, useState-like API | ✓ Good — shareable filtered views, back-nav preserves state |
| Light theme + CartoDB Positron tiles | User chose light tiles; consistent light UI throughout | ✓ Good — clean, readable design |
| leaflet.heat via custom useMap() component | No wrapper libs compatible with react-leaflet 5.x | ✓ Good — setLatLngs for smooth updates, SSR safe |
| Time position in useState, not nuqs | Animation fires 5 updates/sec — History API rate-limits | ✓ Good — no URL thrashing during playback |
| 6-hour blocks over hourly steps | Matches event scheduling patterns, 120 steps for 30 days | ✓ Good — readable labels (Morning/Afternoon/Evening/Night) |
| Dynamic heatmap max scaling | Sparse data (few venues) invisible with default max:1.0 | ✓ Good — single events always visible |
| Map-level click handler over per-marker | One listener regardless of venue count, handles overlap | ✓ Good — clean spatial proximity query with Haversine |
| Fixed 8-value category taxonomy via pgEnum | Structured filtering, Zod enum validation at extraction time | ✓ Good — clean chip UI, predictable DB values |
| Gemini + Google Search grounding for discovery | No new packages; reuses existing AI SDK integration | ✓ Good — finds venue websites directly from search results |
| CLI-only source promotion (no admin UI) | Keeps v1.2 scope tight; admin UI deferred | ✓ Good — replaced by web UI in v1.3 |
| discovered_sources.status as plain text | Flexible status values without migration for each new state | ✓ Good — pending/approved/rejected without enum constraints |
| SHA-256 via Web Crypto (not bcrypt) for admin auth | Edge-compatible, no native dependency | ✓ Good — single-admin credential, no performance concern |
| jose library for JWT (not jsonwebtoken) | ESM-native, Edge runtime compatible | ✓ Good — works with Vercel Edge middleware |
| Auto-geocode venues on save | Reuse existing Google Maps API integration | ✓ Good — venues get lat/lng automatically when created/edited |
| promoteSource() reused for admin approve | No duplication of promotion logic | ✓ Good — web UI calls same function as CLI |
| Rejection reason appended to raw_context | Avoids schema migration for dedicated column | ✓ Good — pragmatic; reason preserved without new column |

---
*Last updated: 2026-03-15 after v1.4 milestone started*
