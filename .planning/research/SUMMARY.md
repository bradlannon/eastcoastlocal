# Project Research Summary

**Project:** East Coast Local
**Domain:** Local live music discovery — AI-powered web scraping + interactive map (Atlantic Canada)
**Researched:** 2026-03-13
**Confidence:** HIGH (overall — core stack and architecture verified with official sources; AI scraping costs and Atlantic Canada geocoding accuracy at MEDIUM)

## Executive Summary

East Coast Local is a hyper-local live music discovery app for Atlantic Canada (NB, NS, PEI, NL) that fills a genuine gap: national platforms like Bandsintown and Songkick have poor coverage of small-town Maritime venues because they require artist self-registration. This app takes the opposite approach — it automatically scrapes venue websites on a schedule, uses an LLM to extract structured event data from arbitrary HTML, and displays results on an interactive map. The product has no user accounts, no manual data entry, and no in-app ticketing. It is a read-only discovery tool that stays current through scheduled automation.

The recommended implementation uses Next.js 16 deployed on Vercel, with Neon Postgres as the database, Drizzle ORM for data access, the Vercel AI SDK with GPT-4o mini for LLM extraction, and react-leaflet with react-leaflet-cluster for the interactive map. This stack is a tight fit for the use case: Vercel's native cron jobs handle scheduled scraping, Neon's serverless Postgres scales to zero when idle, and Leaflet/OpenStreetMap avoids Google Maps API costs for a public anonymous-user app. The scraping pipeline architecture is well-understood: fetch HTML, strip to clean text, pass to LLM with a Zod schema, normalize output, geocode venue once, upsert to database.

The highest-risk area is the scraping infrastructure, not the UI. Three pitfalls require architectural decisions before writing any scraper logic: (1) headless browser use must be decoupled from Vercel functions due to the 50MB bundle limit, (2) LLM extraction must validate against null rather than hallucinated field values, and (3) all cron jobs must be idempotent using upsert-based deduplication. The frontend and event display layers are straightforward once events exist in the database with valid coordinates. The critical path is: database schema → scraper pipeline → geocoding → API routes → map UI.

## Key Findings

### Recommended Stack

The stack is Vercel-native and optimized for a serverless, low-maintenance deployment. Next.js 16 with the App Router provides both the frontend and the API/cron infrastructure in a single codebase. Neon Postgres replaces Vercel's deprecated Postgres offering (Vercel migrated all stores to Neon in Q4 2024) and provides database branching that pairs with Vercel preview deployments. Drizzle ORM is preferred over Prisma due to its ~7.4KB bundle and sub-500ms cold starts vs. Prisma's ~40KB and 1-3s cold start penalty. react-leaflet (not Mapbox GL) is correct for this use case — Leaflet's raster tiles are free via OpenStreetMap and sufficient for static venue pins at regional scale.

**Core technologies:**
- Next.js 16 + React 19: full-stack framework — zero-config Vercel deployment, App Router Server Components, native cron job wiring
- Neon Postgres: persistent event storage — serverless-native, scale-to-zero, official Vercel integration partner
- Drizzle ORM 0.39.x: database access — TypeScript-first, tiny bundle, no cold-start penalty unlike Prisma
- Vercel AI SDK 5.x + GPT-4o mini: LLM extraction — `generateObject()` with Zod schemas produces typed structured output; GPT-4o mini at $0.15/1M input tokens is the right cost/accuracy balance
- react-leaflet 5.x + react-leaflet-cluster 2.x: interactive map — free tile source, no API key, proven clustering up to 50k markers
- Zod 3.x: single schema source — used by both Drizzle (table inference) and AI SDK (extraction validation)
- cheerio 1.x: static HTML parsing — use before sending to LLM; avoids need for headless browser on most venue sites
- Tailwind CSS 4.x + shadcn/ui: styling — zero-config in Next.js 16; shadcn components work out of the box for event cards and filter UI

**Critical version constraints:**
- react-leaflet@5.x requires leaflet@1.9.x (not 2.x) and React 19.x
- react-leaflet-cluster@2.x requires manual CSS import in Next.js: `import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'`
- ai@5.x has breaking changes from v4; do not mix versions
- Use Neon's serverless driver (`@neondatabase/serverless`), not `pg`, to avoid WebSocket issues in Vercel edge environments

### Expected Features

National competitors (Bandsintown, Songkick, Eventbrite) all require manual artist or venue registration and have no map-primary discovery interface. East Coast Local's value proposition is: automatic coverage of any venue in the configured list, displayed on a regional map, with no login required.

**Must have (table stakes):**
- AI-powered scraping with configurable source list — nothing works without this; it is the foundational pipeline
- Event data storage with geocoded coordinates — feeds both map and list
- Interactive map with pin clustering — the primary differentiator; must cover all 4 Atlantic provinces
- Event list / browse view with date filtering — required fallback for non-map users and mobile contexts
- Event detail page with source link — users need performer, venue, date/time, and a link to buy tickets
- Scheduled periodic rescan (nightly minimum) — makes the app hands-off post-setup
- Mobile-responsive UI — most discovery happens on phones

**Should have (competitive, add post-launch):**
- Location / city / province filter — add when event corpus is large enough for filtering to be useful
- "What's on near me" geolocation — add when mobile usage patterns are confirmed
- Stale data indicator ("last checked" timestamp) — builds user trust with low implementation cost
- Search by artist name — add when users report frustration finding specific artists

**Defer (v2+):**
- Genre filtering — requires reliable genre tagging; LLM genre extraction is unreliable; sparse data makes genre browsing feel empty
- Artist profiles / deduplication — significant data cleaning work; only worthwhile with proven engagement
- PWA / installable web app — defer until mobile usage justifies the effort
- User accounts, event submission by venues, in-app ticketing, native mobile app — anti-features that add infrastructure cost without proportional value for this product type

### Architecture Approach

The architecture separates concerns into four layers with a one-way data flow: a scheduled scraping layer writes to the database; the database serves an API layer; the API serves the frontend. The scraping pipeline is a pure sequential pipeline — fetch raw HTML, strip to clean text (cheerio), pass to LLM with Zod schema, normalize dates/strings, geocode venue address (once, cached), upsert event record. The frontend is a read-only consumer of the database — it never triggers scraping. This separation is critical: scraping takes seconds to minutes; user requests must be fast and deterministic.

**Major components:**
1. Cron Orchestrator (`/api/cron/scrape`) — iterates enabled scrape sources, dispatches per-source scrape jobs sequentially, continues on per-source failure
2. Scraper Library (`lib/scraper/`) — fetch → extract → normalize → geocode pipeline; pure functions, testable independently, swappable without touching API or UI
3. Event Store (Neon Postgres, `events` + `venues` + `scrape_sources` tables) — normalized relational schema; geocoordinates on Venue, not Event; upsert on `source_url`
4. Events API (`/api/events`, `/api/events/[id]`, `/api/venues`) — read-only query endpoints filtering by bounding box and date range
5. Map View (react-leaflet + react-leaflet-cluster) — client-side clustering; all events with coordinates fetched on load; cluster expands on zoom
6. List / Browse View — server-rendered event cards filtered by date and location; fallback for non-map use

**Build order (dependency-driven):**
Database schema → Scraper library → Geocoding → Cron route → Events API → Map frontend → List view + Event detail

### Critical Pitfalls

1. **Chromium binary exceeds Vercel's 50MB function size limit** — Never run headless Playwright/Puppeteer in a Vercel serverless function. For JS-rendered venue sites (minority of cases), either use `@sparticuz/chromium` (tight, fragile) or decouple scraping to a separate process (GitHub Actions, Fly.io). Use cheerio + static fetch as the default path; headless browser is the exception.

2. **LLM hallucinating dates and times** — JSON schema mode constrains output format, not factual accuracy. Explicitly instruct: "If a field is not clearly present, return null — do not infer or guess." Make all date/time fields nullable. Add sanity checks: reject events where date is null or outside a 90-day future window. Build this validation into the extraction pipeline from day one.

3. **Token costs scaling unexpectedly with raw HTML input** — Raw venue page HTML can be 50,000-100,000 tokens. Strip `<script>`, `<style>`, nav, footer, and sidebar elements before sending to LLM. Libraries like `mozilla/readability` or targeted cheerio selectors reduce token count 10-25×. Log token usage per scrape run from day one; alert when a single run exceeds $1.

4. **Duplicate events from multiple sources** — The same show scraped from the venue website + Eventbrite + Bandsintown creates 3 database rows that appear as 3 map pins. Deduplication key at schema design time: composite of (normalized venue name, normalized event date, normalized artist name). Implement upsert-based deduplication before ingesting a second source.

5. **Geocoding failures for Atlantic Canada addresses** — Nominatim's public API prohibits production use and has limited coverage of small Maritime addresses. Use OpenCage, Google Maps Geocoding API, or Positionstack instead. Geocode once at venue creation time; store lat/lng on the `venues` record; only re-geocode on address change. Allow manual lat/lng override for venues with problematic addresses.

6. **Stale events accumulating indefinitely** — Without cleanup logic, past events fill the map and slow queries. Add a nightly cleanup job that marks past events and excludes them from all public queries. Default filter in the API layer must always include `WHERE event_date >= NOW()`. Add an index on `event_date` at schema creation time.

7. **Anti-bot blocking returning Cloudflare challenge pages** — HTTP 200 does not mean valid content. Validate response content before calling the LLM: check for expected event-related keywords. Log and skip when a "Just a moment" or "Enable JavaScript" page is detected. Use official APIs for Eventbrite and Bandsintown — never scrape these platforms' HTML.

## Implications for Roadmap

Based on combined research findings, the architecture has clear dependency chains that dictate phase order. The scraping pipeline and database are the critical path — the frontend is completely unblockable until events exist with valid coordinates.

### Phase 1: Foundation and Database Schema

**Rationale:** Every other component depends on the database schema existing. This is the correct first phase per the ARCHITECTURE.md build order. Decisions made here (deduplication strategy, geocoding column placement, date indexing) are expensive to change later. The execution environment decision (how scraping runs on Vercel) must also be resolved before writing any scraper code, to avoid the Chromium/Vercel architecture pitfall.
**Delivers:** Working Next.js project scaffolded on Vercel, Neon database connected, Drizzle schema with `events`, `venues`, and `scrape_sources` tables, migrations running, `event_date` index in place, initial configurable source list populated.
**Addresses features:** Configurable source list, event data storage foundation.
**Avoids pitfalls:** Stale event accumulation (date index + cleanup job designed in), duplicate events (upsert key defined in schema), Chromium/Vercel size limit (execution environment decided upfront), geocoding re-runs (coordinates on `venues` not `events`).
**Research flag:** Standard patterns — well-documented Drizzle + Neon setup. No phase-level research needed.

### Phase 2: Scraping Pipeline and Data Ingestion

**Rationale:** The scraper is the engine of the entire product. Without events in the database, there is nothing to display. This phase builds the fetch → extract → normalize → geocode → upsert pipeline as isolated, testable library functions before wiring them to the cron endpoint. Addressing pitfalls around LLM extraction quality, token costs, and anti-bot blocking here prevents expensive retrofitting.
**Delivers:** Working scraper that processes at least 5 real Atlantic Canada venue URLs, extracts structured event data via GPT-4o mini, geocodes venues with OpenCage/Google, upserts to database idempotently, and logs token usage per run.
**Uses stack:** cheerio (HTML preprocessing), Vercel AI SDK + GPT-4o mini (extraction), Zod (schema validation), date-fns (date normalization), Neon + Drizzle (upsert), Nominatim alternative for geocoding.
**Implements components:** Fetcher, AI Extractor, Normalizer, Geocoder, Deduplicator, Event Store (writes).
**Avoids pitfalls:** LLM date hallucination (nullable fields, null-rejection validation), token cost explosion (cheerio preprocessing before LLM call), duplicate events (upsert on source_url + composite key), geocoding failures (production geocoder with confidence threshold + manual override).
**Research flag:** Needs `/gsd:research-phase` during planning — the LLM extraction prompt design, HTML preprocessing approach, and geocoder selection are all non-trivial decisions with cost implications specific to Atlantic Canada venue site variety.

### Phase 3: Cron Wiring and Automated Rescan

**Rationale:** Once the scraper library works end-to-end, wiring it to Vercel's cron system is a thin integration step. This phase makes the app hands-off and validates the full pipeline against Vercel's function timeout constraints.
**Delivers:** `/api/cron/scrape` route that runs the full orchestrator, Vercel cron configured in `vercel.json`, per-source error isolation (scrape run continues if one source fails), `last_scraped` timestamps updating in `scrape_sources` table, basic source health logging.
**Uses stack:** Vercel Cron Jobs, Next.js API Route Handler.
**Implements components:** Cron Orchestrator.
**Avoids pitfalls:** Vercel function timeout (sequential scraping tested against realistic source count; batching added if needed), Vercel cron non-idempotency (upsert already in place from Phase 2).
**Research flag:** Standard patterns — Vercel cron docs are comprehensive and HIGH confidence. No additional research needed if Phase 2 scraper library is working.

### Phase 4: Events API

**Rationale:** The frontend cannot be built until the API exists. This is a thin but necessary step — parameterized read-only endpoints that accept bounding box and date range filters. No user mutation; no auth.
**Delivers:** `GET /api/events?bbox=...&from=...&to=...`, `GET /api/events/[id]`, `GET /api/venues` — all returning JSON with coordinates. Default filter enforces `event_date >= NOW()`.
**Uses stack:** Next.js Route Handlers, Drizzle ORM (read queries), Neon Postgres.
**Implements components:** Events API.
**Avoids pitfalls:** Unbounded queries (date filter enforced at the query layer, not optionally at the frontend), SQL injection (parameterized queries via Drizzle, never raw SQL in routes).
**Research flag:** Standard patterns. No additional research needed.

### Phase 5: Map Frontend and Event Display

**Rationale:** With events in the database and an API serving them with coordinates, the map and list views can be built and tested with real data. The map is the primary differentiator; the list view and event detail page are supporting surfaces.
**Delivers:** Interactive map centered on Atlantic Canada with clustered event pins, event list with date filter, event detail panel/page showing performer, venue, date/time, and source link. Mobile-responsive. Empty state handling for zero-result filters.
**Uses stack:** react-leaflet 5.x, react-leaflet-cluster 2.x, Leaflet 1.9.x, shadcn/ui (event cards, filter sidebar, date pickers), Tailwind CSS 4.x.
**Implements components:** Map View (EventMap, EventMarker, ClusterMarker), List View, Event Detail.
**Avoids pitfalls:** Map clustering performance (react-leaflet-cluster tested with 500+ test pins on mobile at zoom level 6-7), UX empty states (explicit "no events found" message with actionable suggestion), stale events on map (API enforces future-only filter so this is already handled), default map view too zoomed out (default extent to densest event area, not all of Atlantic Canada).
**Research flag:** Standard patterns for react-leaflet + clustering. The CSS import gotcha (`MarkerCluster.css` must be manually imported in Next.js) is documented in STACK.md and known upfront.

### Phase 6: Polish, Monitoring, and Source Expansion

**Rationale:** Once the core product is working end-to-end with a small source set, this phase hardening the operational aspects and expanding venue coverage to the full Atlantic Canada target.
**Delivers:** Source health monitoring (alert when a source returns zero events for 3+ consecutive runs), stale data indicator on event cards ("last checked" timestamp), expanded source list covering major venues across NB, NS, PEI, NL, token cost reporting, and any UX improvements identified from initial usage.
**Addresses features:** Stale data indicator (v1.x), expanded source coverage (core value of regional focus).
**Research flag:** The source expansion will surface venue-specific scraping challenges (JS-rendered sites, anti-bot measures) that may require per-venue decisions. Light research into specific problematic venues as they're encountered; not a wholesale phase-level research need.

### Phase Ordering Rationale

- **Database first (Phase 1):** All components depend on schema decisions that are expensive to change. Geocoding column placement, deduplication key, and date indexing must be decided before any data is written.
- **Scraper before API (Phases 2-3 before Phase 4):** The API has nothing to return until events exist. The API and frontend can be scaffolded but not validated without real data.
- **Cron wiring is thin (Phase 3):** Separating cron wiring from the scraper library makes Phase 2 testable without needing a live cron setup. The orchestrator can be called directly during development.
- **Map last (Phase 5):** This is the most visible phase but has the most dependencies — it needs real geocoded events from a working pipeline. Building it last avoids the "map looks empty" validation problem.
- **Source expansion is Phase 6:** Core pipeline correctness matters more than source breadth. Five well-validated sources are more valuable than 50 sources with undetected failures.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Scraping Pipeline):** LLM extraction prompt engineering for heterogeneous venue site HTML, HTML preprocessing library selection (readability vs. cheerio targeting), geocoder selection and pricing for Atlantic Canada volume (~50-200 venues), and scraper response validation patterns all warrant dedicated research before implementation begins.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Drizzle + Neon setup is well-documented with official guides. Next.js scaffolding is zero-config.
- **Phase 3 (Cron Wiring):** Vercel cron documentation is HIGH confidence and comprehensive. The pattern is a thin wrapper around Phase 2 library code.
- **Phase 4 (Events API):** Standard Next.js Route Handler patterns with Drizzle read queries. No novel patterns required.
- **Phase 5 (Map Frontend):** react-leaflet + react-leaflet-cluster patterns are well-documented. Known gotchas (CSS import, SSR compatibility) are already captured in STACK.md.
- **Phase 6 (Polish):** Incremental additions to existing patterns; no novel architecture.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core choices (Next.js 16, Neon, Drizzle, react-leaflet) verified with official sources and version compatibility documented. AI SDK 5 is newly released — some docs in transition, but core API confirmed. |
| Features | MEDIUM-HIGH | Competitor analysis is solid; Atlantic Canada market specifics (venue count, typical site structure, scraping difficulty) are LOW confidence and can only be validated with real scraping runs. |
| Architecture | HIGH | Vercel cron, Neon, and Next.js App Router patterns verified with official docs. Scraping pipeline patterns from multiple community sources with consistent conclusions. |
| Pitfalls | HIGH | Chromium/Vercel size limit, LLM hallucination, token costs, and deduplication are all independently verified across multiple authoritative sources. Geocoding accuracy for Atlantic Canada specifically is MEDIUM. |

**Overall confidence:** HIGH

### Gaps to Address

- **Atlantic Canada venue site variety:** We don't know what percentage of target venues use JS rendering vs. static HTML, or how many are protected by Cloudflare. This can only be determined by attempting real scrapes. Expect to encounter 1-3 venues per province that require the headless browser path or manual data entry.
- **LLM extraction prompt quality:** The prompt for extracting events from arbitrary venue HTML will need iteration against real venue pages. The current research establishes the pattern; the actual prompt quality is validated empirically. Budget 1-2 days of prompt engineering during Phase 2.
- **Geocoding accuracy for rural/small-town addresses:** The research flags this as MEDIUM confidence specifically for Atlantic Canada. OpenCage and Google Maps Geocoding both have Canadian coverage, but confidence thresholds for specific venues (e.g., rural NL) need empirical testing. Plan for a manual coordinate override mechanism in the venue schema from day one.
- **Vercel Hobby vs. Pro cron limits:** Hobby plan allows one cron execution per day, which is sufficient for initial validation but may be insufficient once source count exceeds 20 venues. Monitor scrape run duration against the 300s function timeout on Pro, or plan for GitHub Actions as a free cron trigger if Hobby limits bind first.
- **Source count and event volume for Atlantic Canada:** The feature research assumes ~50-200 venues total in Atlantic Canada, which keeps the architecture in the "simple" tier (sequential scraping, no job queue). If the source list grows beyond 50 URLs, the sequential scraping pattern will approach Vercel function timeout limits and may require batching or an external worker.

## Sources

### Primary (HIGH confidence)
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) — cron configuration, timeout limits, Hobby vs Pro constraints
- [Neon for Vercel marketplace](https://vercel.com/marketplace/neon) — official integration, confirmed Vercel Postgres migration
- [Drizzle vs Prisma 2026 comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/) — cold start benchmarks, bundle sizes
- [react-leaflet-cluster npm](https://www.npmjs.com/package/react-leaflet-cluster) — React 19 / react-leaflet 5 compatibility
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) — production use prohibition confirmed
- [Supercluster library (Mapbox)](https://github.com/mapbox/supercluster) — clustering approach
- [Next.js 16 blog post](https://nextjs.org/blog/next-16) — version confirmed, Turbopack stable
- [Eventbrite API Terms of Use](https://www.eventbrite.com/help/en-us/articles/833731/eventbrite-api-terms-of-use/) — use API, not scraping

### Secondary (MEDIUM confidence)
- [AI SDK Core: generateObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — structured output API (docs in transition for AI SDK 5)
- [Playwright on Vercel](https://www.zenrows.com/blog/playwright-vercel) — 50MB limit, @sparticuz/chromium workaround
- [LLM Web Scraping patterns](https://scrapegraphai.com/blog/llm-web-scraping) — extraction approach
- [Tech Event Discovery Platform architecture (DEV.to)](https://dev.to/danishaft/how-i-built-a-tech-event-discovery-platform-with-real-time-scraping-3o4f) — pipeline patterns
- [OpenAI pricing](https://openai.com/api/pricing/) — GPT-4o mini cost basis
- [Firecrawl Extract](https://docs.firecrawl.dev/v0/features/extract) — alternative managed extraction
- [ScrapFly: Bypass Cloudflare](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping) — anti-bot detection patterns
- [Parasoft: Controlling LLM Hallucinations](https://www.parasoft.com/blog/controlling-llm-hallucinations-application-level-best-practices/) — null-return extraction patterns

### Tertiary (LOW confidence)
- Atlantic Canada event platform gap: inferred from competitor coverage analysis (Bandsintown, Songkick, Eventbrite) — needs validation with actual market research and venue outreach

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
