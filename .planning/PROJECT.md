# East Coast Local

## What This Is

A public-facing web app that helps people discover events across Atlantic Canada (New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador). It uses AI-powered web scraping, Ticketmaster Discovery API, Google Maps Places API, and Reddit mining via Gemini to automatically discover venues and extract event data, then displays upcoming events on an interactive map with pin clusters and a heatmap timelapse mode. Events are automatically categorized by type, duplicate venues and events are merged across sources, and an admin dashboard provides full control over scraping, discovery, batch approval, and venue management.

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

- ✓ Ticketmaster Discovery API integration for Atlantic Canada events — v1.4
- ✓ Google Events JSON-LD structured data extraction (fast path before Gemini) — v1.4
- ✓ Multi-page/pagination support for venue website scraping — v1.4
- ✓ Rate limiting to avoid being blocked by venue websites — v1.4
- ✓ Scrape quality metrics (event count, confidence, failure rate per source) — v1.4
- ✓ Auto-approve high-confidence discovered sources without manual review — v1.4

- ✓ Auto-detect and merge duplicate venues (TM-created vs existing) — v1.5
- ✓ Cross-source duplicate event prevention via venue merge + upsert dedup — v1.5
- ✓ Borderline venue merge candidates logged for admin review — v1.5
- ✓ Admin merge review UI with side-by-side comparison, merge, and keep-separate — v1.5
- ✓ Event source tracking via event_sources join table — v1.5
- ✓ Non-destructive ticket link update on cross-source conflict (COALESCE) — v1.5
- ✓ Zoom-to-location button on event cards — v1.5
- ✓ Category filter chips visible in timelapse mode — v1.5

- ✓ Google Maps Places API bulk venue discovery across all 4 provinces — v2.0
- ✓ Places API filtering by 7 venue-relevant place types — v2.0
- ✓ Rate limiting and configurable throttle for Places API — v2.0
- ✓ google_place_id deduplication across discovered_sources and venues — v2.0
- ✓ No-website venue stubs with pre-geocoded coordinates — v2.0
- ✓ Geographic coverage of ~41 communities across all 4 Atlantic provinces — v2.0
- ✓ Per-province cron isolation (Mon-Thu) within 60s Vercel timeout — v2.0
- ✓ Per-channel cron scheduling (Places, Gemini, Reddit on separate days) — v2.0
- ✓ Reddit subreddit mining for venue/event mentions via Gemini extraction — v2.0
- ✓ Province-specific subreddit mapping with configurable targets — v2.0
- ✓ Reddit candidates flow through existing discovered_sources pipeline — v2.0
- ✓ Per-method auto-approve thresholds (Places 0.8, Reddit/Gemini 0.9) — v2.0
- ✓ discovery_method tracking on all discovered sources — v2.0
- ✓ Admin batch-approve multiple discovered sources in one action — v2.0
- ✓ Discovery run metrics logging (candidates found, auto-approved, queued, errors) — v2.0
- ✓ Admin dashboard discovery run summary with stat card and recent runs table — v2.0

- ✓ FK-safe venue dedup backfill via performVenueMerge — v2.1
- ✓ EventCard attribution via source_type enum, not URL string matching — v2.1
- ✓ Dead phone column removed from venues and discovered_sources — v2.1
- ✓ No Website tab on /admin/discovery for Places API venue stubs — v2.1
- ✓ GEMINI_AUTO_APPROVE threshold env-overridable in places-discoverer — v2.1
- ✓ Ticketmaster .limit() mock chain fixed (33/33 tests passing) — v2.1
- ✓ 21 Nyquist VALIDATION.md files finalized across v1.0-v2.0 — v2.1

### Active

<!-- Current scope. Building toward these. -->

## Current Milestone: v2.2 Event Data Quality

**Goal:** Make event data trustworthy by handling recurring events as grouped series and archiving past events to keep the UI fresh.

**Target features:**
- Recurring event series detection and grouping (tag occurrences, UI badge/collapse)
- Past event archival via daily cron (archived_at flag, excluded from API, visible in admin)

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
- Facebook Events integration — requires headless browser, blocked by Vercel Hobby 50MB limit
- Fully automated venue merge with no review path — false positives corrupt data; two-signal gate + admin review for borderline cases
- Fuzzy event matching independent of venue — title similarity across different venues produces false positives
- Real-time dedup during user requests — fuzzy matching is O(n^2); daily cron only
- Storing raw Reddit post text — large, legally ambiguous (Reddit TOS); store extracted structured data only
- Geocoding Reddit venues during discovery — Reddit-extracted names are noisy; geocode only after promotion to venues table

## Context

- Geographic scope: All four Atlantic Canadian provinces (NB, NS, PEI, NL)
- Event sources: ~41 cities covered by Places API discovery + 10 subreddits + Gemini search grounding + Ticketmaster API + manually curated venues
- Event types: 8 categories — live music, comedy, theatre, arts, sports, festival, community, other
- Scraping approach: AI-powered extraction using Gemini LLM to parse event data from arbitrary page formats — no brittle CSS selectors
- Discovery channels: Google Maps Places API (Mon-Thu, per-province), Reddit subreddit mining via Gemini (Friday), Gemini + Google Search grounding (Monday), daily scrape cron
- The app is hands-off once configured — 7 cron endpoints run automatically via Vercel
- Public app accessible to anyone in the region
- Map has two modes: pin clustering (default) and heatmap timelapse with 6-hour block steps
- v2.1 shipped: 15,293 LOC TypeScript, Next.js 16 + Neon Postgres + Drizzle ORM + leaflet.heat
- Admin UI at /admin with JWT auth, dashboard, venue management, discovery review (with batch approve), merge review, and discovery run metrics
- Ticketmaster Discovery API integration sourcing major ticketed events across all 4 provinces
- Venue deduplication via two-signal scoring (name similarity + geocoordinate proximity) with admin merge review for borderline cases
- Places API two-step dedup: google_place_id exact match then fuzzy name+geo scoring
- Event source tracking via event_sources join table; non-destructive COALESCE for source_url and ticket_link
- Deployed at eastcoastlocal.bradlannon.ca

## Constraints

- **Hosting**: Cloud-hosted on Vercel with Neon Postgres — no self-hosted infrastructure
- **Scraping**: Must respect robots.txt and rate limits on source websites
- **Cost**: AI extraction costs managed via batch processing (daily cron, not real-time per-request)
- **Geography**: Google Maps Geocoding API for accurate Canadian addresses; rejects APPROXIMATE precision
- **Vercel Hobby**: 60s function timeout (maxDuration=60); 50MB function size limit rules out Playwright/Puppeteer
- **Places API**: Separate per-province cron endpoints to stay within 60s timeout for ~41 cities

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
| discovered_sources.status as plain text | Flexible status values without migration for each new state | ✓ Good — pending/approved/rejected/no_website without enum constraints |
| SHA-256 via Web Crypto (not bcrypt) for admin auth | Edge-compatible, no native dependency | ✓ Good — single-admin credential, no performance concern |
| jose library for JWT (not jsonwebtoken) | ESM-native, Edge runtime compatible | ✓ Good — works with Vercel Edge middleware |
| Auto-geocode venues on save | Reuse existing Google Maps API integration | ✓ Good — venues get lat/lng automatically when created/edited |
| promoteSource() reused for admin approve | No duplication of promotion logic | ✓ Good — web UI calls same function as CLI |
| Rejection reason appended to raw_context | Avoids schema migration for dedicated column | ✓ Good — pragmatic; reason preserved without new column |
| JSON-LD extraction before Gemini fallback | Skip expensive AI calls for structured data pages | ✓ Good — confidence=1.0 events, no API cost |
| Per-domain rate limiting via module-level Map | Prevent being blocked by venue websites | ✓ Good — 2s+ gap per domain with jitter |
| Ticketmaster synthetic URL pattern (ticketmaster:province:XX) | One scrape_source row per province, reuse orchestrator dispatch | ✓ Good — clean integration with existing pipeline |
| Two-signal venue merge gate (name ratio < 0.15 AND geo < 100m) | Prevent false positive merges from name-only or geo-only matches | ✓ Good — conservative; borderline cases go to admin review |
| fastest-levenshtein for edit distance | Zero dependencies, pure JS, server-side only | ✓ Good — no native bindings needed |
| event_sources uniqueIndex on (event_id, source_type) | PostgreSQL NULL != NULL allows multiple scrape sources per event | ✓ Good — clean dedup without composite nullability issues |
| COALESCE for source_url and ticket_link in upsertEvent | First source to set a link wins; subsequent nulls cannot overwrite | ✓ Good — non-destructive cross-source attribution |
| Drizzle alias() for venue self-join in merge review | Side-by-side venue_a/venue_b comparison in single query | ✓ Good — clean pattern for self-referencing FK joins |
| NavLinks extracted as client component | Admin layout can be async server component (fetches pending count) | ✓ Good — server/client boundary clean |
| Per-province Places API cron endpoints | Full Atlantic scan exceeds 60s Vercel timeout | ✓ Good — each province runs Mon-Thu with isolated timeout budget |
| 7 venue-relevant place types for Places filtering | Reduce false positives from restaurants/cafes/stores | ✓ Good — core types (0.85) auto-approve; secondary types (0.70) go to admin review |
| Two-step Places dedup (google_place_id + fuzzy) | Exact match first (O(1)), fuzzy loop only for new candidates | ✓ Good — efficient; enriches existing venues with place_id |
| no_website status for Places venues without URLs | Preserves dedup anchors for Ticketmaster cross-referencing | ✓ Good — synthetic places:{id} URL is stable and unique |
| Reddit public JSON API (no OAuth) | Simpler auth, no app registration needed | ✓ Good — custom User-Agent sufficient for read-only access |
| Keyword pre-filter before Gemini for Reddit | Reduce unnecessary LLM API calls on irrelevant posts | ✓ Good — 20-term venue/event keyword list catches relevant posts |
| GEMINI_AUTO_APPROVE threshold at 0.9 for Gemini/Reddit | Higher bar for noisier data sources vs Places (0.8) | ✓ Good — structured Places data is more reliable than text extraction |
| discovery_runs table for cron instrumentation | Audit trail for pipeline health without external monitoring | ✓ Good — dashboard shows last run + recent 10 at a glance |
| Promise.allSettled for batch approve | Individual failures don't abort entire batch | ✓ Good — resilient; logs failure count for admin visibility |
| Supplementary query pattern for event sources | Avoid JOIN row duplication from Drizzle's select-all with multiple source rows | ✓ Good — 2 DB round-trips + Map merge, clean EventWithVenue type |
| Thenable mock pattern for Drizzle chains | Object.assign(Promise.resolve(value), { limit: jest.fn() }) for db.select chain | ✓ Good — 33/33 tests passing, no test framework hacks |
| isActionableTab helper in DiscoveryList | DRY condition reuse across 5 JSX locations | ✓ Good — single source of truth for tab-specific action rendering |
| parseFloat env pattern for GEMINI_AUTO_APPROVE | Match existing env-overridable pattern in discovery-orchestrator.ts and reddit-discoverer.ts | ✓ Good — consistent threshold configuration across all discoverers |

---
*Last updated: 2026-03-16 after v2.2 milestone start*
