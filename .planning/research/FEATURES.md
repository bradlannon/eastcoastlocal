# Feature Research

**Domain:** Event discovery platform — external API integrations, scraping robustness, and quality metrics (v1.4 milestone)
**Researched:** 2026-03-15
**Confidence:** MEDIUM-HIGH overall (Ticketmaster API is HIGH confidence from official docs; Songkick is HIGH confidence it requires paid partnership; Google structured data is HIGH confidence; multi-page scraping and rate limiting patterns are HIGH confidence; auto-approve heuristics are MEDIUM confidence — no canonical pattern for this specific use case)

---

## Context: What Already Exists (Must Preserve)

This is the v1.4 milestone. The following are already built and must be integrated with, not replaced:

- **Scrape pipeline:** `runScrapeJob` iterates `scrape_sources` rows, calls `fetchAndPreprocess` + `extractEvents` (Gemini) + `upsertEvent`
- **API integrations:** Eventbrite and Bandsintown already integrated as source types alongside venue HTML scraping
- **Source table:** `scrape_sources` with `source_type` field distinguishing scraper vs. API sources
- **Discovery pipeline:** Weekly Gemini + Google Search grounding scan for new venues; discovered sources staged in `discovered_sources` table with `pending/approved/rejected` statuses
- **Admin UI:** Admin can manually approve/reject discovered sources at `/admin`
- **26 configured venues** across NB, NS, PEI, NL
- **Vercel Hobby constraints:** 60s function timeout, no Playwright/Puppeteer, 50MB function size limit
- **Event schema:** `ExtractedEventSchema` Zod object with performer, event_date, event_time, price, ticket_link, description, cover_image_url, confidence, category (enum, 8 values)

The v1.4 features extend this system. New API integrations follow the existing `source_type` pattern. Rate limiting and multi-page support modify the existing scrape orchestrator.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make the platform feel complete now that v1.3 is shipped. Missing these will be felt once Ticketmaster-listed events don't appear or venue sites with "Page 2" events are missed.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ticketmaster Discovery API integration | Major venues in Atlantic Canada (Halifax's Scotiabank Centre, Moncton's Avenir Centre) list events exclusively through Ticketmaster; users will notice these are missing | MEDIUM | Free API key, 5000 calls/day, 5 req/sec limit. Filter by `countryCode=CA` + province `stateCode` (NS, NB, PE, NL). Returns structured JSON — no LLM extraction needed. Map venue → existing `venues` table or create new venue row. |
| Multi-page / pagination support | Many venue websites spread events across multiple pages (e.g., "Month View" with prev/next, numbered pages 1–3); current scraper only fetches the first URL, silently dropping events on pages 2+ | MEDIUM | Detect pagination in extracted HTML (look for "next page" links, numbered nav). Follow up to a configurable page limit (e.g., 5 pages). Accumulate events across pages before upsert. Must respect existing 60s timeout constraint — serial page fetches with short delays. |
| Rate limiting / politeness delays | Venue websites will eventually block the scraper if it hammers them without delays; this is an operational reliability feature, not optional | LOW-MEDIUM | Add configurable delay between scrape source fetches (default: 2–5s jitter). Honour `Retry-After` headers on 429 responses. Exponential backoff on transient errors (3 retries max). Does not require new infrastructure — adds delay logic to `runScrapeJob` orchestrator. |

### Differentiators (Competitive Advantage)

Features that improve coverage and quality beyond what v1.3 shipped, differentiating from a static-list scraper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Google Events structured data extraction | Many venue websites embed `schema.org/Event` JSON-LD in their HTML; extracting this directly is faster and more accurate than Gemini LLM parsing because the data is already structured | MEDIUM | Parse `<script type="application/ld+json">` blocks from HTML before sending to Gemini. If a valid `Event` schema is found, extract `name`, `startDate`, `endDate`, `location`, `offers`, `performer` directly. Fall through to Gemini if no schema present. This is a pre-extraction step, not a replacement. |
| Scrape quality metrics and confidence tracking | Provides visibility into which sources are producing accurate events, which are failing silently, and whether Gemini extraction quality is trending up or down | HIGH | Track per-source: fields populated (completeness %), confidence score distribution, false positive signals (e.g., past events ingested as future, duplicate rate). Store metrics in a new `scrape_metrics` table or add columns to `scrape_sources`. Surface in admin dashboard. |
| Auto-approve high-confidence discovered sources | Reduces admin burden: sources that look clearly like event pages (strong Gemini confidence score + matching URL patterns) bypass the manual review queue | MEDIUM | After LLM candidate evaluation produces a confidence score, sources above a threshold (e.g., 0.85) are inserted directly as `approved` with `auto_approved: true` flag. Sources below threshold remain `pending` for human review. Threshold tunable via env var. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Songkick API integration | Songkick is a well-known concert discovery platform; adding it seems like obvious data enrichment | Songkick explicitly does not approve hobbyist or open-source projects; requires a paid partnership agreement (reported $500+/month license fee); access is commercially gated — integrating it is not feasible | Ticketmaster Discovery API covers major ticketed concerts; Bandsintown (already integrated) covers artist tour dates. Songkick is a non-starter for this project. |
| Headless browser for JavaScript-heavy venue sites | Some venue sites render event lists via JavaScript (React SPAs, etc.) and raw HTML fetch yields empty pages | Playwright and Puppeteer are blocked on Vercel Hobby due to the 50MB function size limit; Chromium alone is ~300MB | Accept that JS-rendered sites cannot be scraped on Vercel Hobby. Flag these sources with `requires_js: true` in `scrape_sources`. Admin can see which sources are failing for this reason. Defer JS scraping to a self-hosted worker (v2+). |
| Real-time Ticketmaster sync | "Refresh whenever a user visits the map" | Ticketmaster's free tier allows only 5000 API calls/day — per-request API calls from user traffic would exhaust this quota immediately; also increases latency | Keep Ticketmaster integration as a cron-sourced pipeline (daily), same as other scrape sources. Cache results in Neon Postgres. |
| Unlimited pagination | "Scrape every page of every venue site" | Vercel's 60s function timeout limits how many pages can be fetched serially; fetching 10+ pages per source will cause timeout failures; also risks triggering anti-scraping blocks | Cap pagination at 5 pages per source (configurable). Log when a source appears to have more pages than the cap — admin can review. |
| Per-field accuracy scoring via LLM | "Have Gemini rate each extracted field as correct or not" | Gemini cannot verify correctness of its own output without ground truth; self-evaluation creates false confidence metrics | Use proxy metrics instead: field completeness (were all required fields populated?), confidence score from `ExtractedEventSchema`, future-date filter (events with past dates are likely extraction errors), duplicate rate |

---

## Feature Dependencies

```
[Ticketmaster Discovery API]
    └──requires──> [API key registration] (developer.ticketmaster.com, free)
    └──requires──> [New source_type in scrape_sources] (e.g., 'ticketmaster_api')
    └──requires──> [Ticketmaster fetch adapter] (replaces fetchAndPreprocess for API sources)
    └──does NOT require──> [Gemini extraction] (data already structured; skip LLM for API sources)
    └──requires──> [Venue matching logic] (TM venue → existing venues row or create new)

[Google Events Structured Data Extraction]
    └──requires──> [HTML pre-processor update] (parse JSON-LD before Gemini call)
    └──enhances──> [Existing Gemini extraction] (structured data replaces LLM; falls through if absent)
    └──does NOT require──> [DB schema change] (maps to existing ExtractedEventSchema fields)

[Multi-page Scraping]
    └──requires──> [Pagination detector] (identify next-page links in HTML)
    └──requires──> [Page accumulator] (merge events from multiple page fetches)
    └──requires──> [Timeout guard] (track elapsed time; stop pagination if approaching 60s limit)
    └──integrates with──> [Rate limiting] (each page fetch should respect politeness delay)

[Rate Limiting]
    └──requires──> [Delay logic in runScrapeJob] (inter-source and inter-page delays)
    └──requires──> [Retry-After header handling] (429 response processing)
    └──enhances──> [Multi-page Scraping] (each page fetch benefits from rate limiting)
    └──does NOT require──> [DB schema change]

[Scrape Quality Metrics]
    └──requires──> [Metrics storage] (new table or columns on scrape_sources)
    └──requires──> [Metrics collection in extraction pipeline] (instrument runScrapeJob)
    └──requires──> [Admin dashboard UI update] (surface metrics to admin)
    └──drives──> [Auto-approve logic] (quality metrics can feed confidence in discovered sources)

[Auto-approve High-Confidence Sources]
    └──requires──> [Existing discovery pipeline] (already produces candidate sources with LLM evaluation)
    └──requires──> [Confidence score on discovered_sources] (may already exist; confirm schema)
    └──requires──> [Threshold configuration] (env var DISCOVERY_AUTO_APPROVE_THRESHOLD)
    └──enhances──> [Admin review queue] (fewer low-value pending items for human review)
    └──does NOT conflict with──> [Manual approval] (sources below threshold still go to manual review)
```

### Dependency Notes

- **Ticketmaster and Google Structured Data are independent of each other:** They can be built in parallel or sequentially without blocking each other.
- **Multi-page and rate limiting should be built together:** They share concerns about timing and must coordinate around Vercel's 60s timeout. Building one without the other creates a half-solution.
- **Scrape quality metrics is the highest-complexity feature:** It requires instrumentation throughout the pipeline, a storage decision, and UI work. It does not block other features but should be sequenced after the simpler integrations are stable.
- **Auto-approve requires reviewing the existing `discovered_sources` schema first:** The LLM evaluation in the discovery pipeline already produces some confidence signal; the work may be adding a threshold check rather than building new scoring.
- **Google Structured Data extraction is a pre-processor, not a replacement:** The fallback to Gemini must be preserved. Sites without schema.org markup (the majority) must continue working identically.

---

## MVP Definition

### Launch With (v1.4)

Minimum viable feature set for this milestone to be complete and valuable.

- [ ] Ticketmaster Discovery API integrated as a new source type, fetching Atlantic Canada events daily via cron
- [ ] Multi-page scraping with pagination detection, configurable page cap (5), and timeout guard
- [ ] Rate limiting: per-source politeness delay (2-5s jitter), Retry-After header handling, exponential backoff (3 retries)
- [ ] Google Events structured data extraction as a pre-processing step before Gemini LLM
- [ ] Scrape quality metrics: completeness %, confidence score distribution, stored per source and surfaced in admin
- [ ] Auto-approve discovered sources above configurable confidence threshold

### Add After Validation (v1.4.x)

- [ ] Ticketmaster venue deduplication improvement — after first run, identify and merge duplicate venue rows created from TM data vs. existing venues
- [ ] Quality metric alerting — email or log alert when a source's success rate drops below threshold for N consecutive runs
- [ ] Page cap increase for specific sources — allow per-source override of the 5-page default for sources known to have deep pagination

### Future Consideration (v2+)

- [ ] JavaScript-rendered site scraping via self-hosted Playwright worker (not feasible on Vercel Hobby)
- [ ] Songkick integration — only if the project graduates to commercial status and licensing becomes viable
- [ ] SeatGeek API integration — SeatGeek has a more accessible API for event discovery; viable alternative to Songkick for ticket-listed events
- [ ] Quality metrics trend charts — historical view of scrape health over time, not just current state

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Ticketmaster Discovery API | HIGH (covers major ticketed venues) | MEDIUM | P1 |
| Multi-page scraping | HIGH (silently drops events today) | MEDIUM | P1 |
| Rate limiting | MEDIUM (operational reliability) | LOW-MEDIUM | P1 |
| Google Structured Data extraction | MEDIUM (faster/more accurate for structured sites) | MEDIUM | P1 |
| Scrape quality metrics | MEDIUM (admin visibility, debugging) | HIGH | P2 |
| Auto-approve discovered sources | LOW-MEDIUM (reduces admin burden) | MEDIUM | P2 |

**Priority key:**
- P1: Must have for v1.4 launch
- P2: Should have; add when P1 features are stable

---

## API-Specific Behavior Details

### Ticketmaster Discovery API

- **Auth:** API key as query param `?apikey={key}`. Register free at developer.ticketmaster.com.
- **Quota:** 5000 calls/day, 5 req/sec. Sufficient for daily batch pull across 4 provinces.
- **Key endpoint:** `GET /discovery/v2/events?countryCode=CA&stateCode=NS,NB,PE,NL&size=200`
- **Pagination:** API supports `page` param; max retrievable is 1000 items total (size × page < 1000).
- **Response structure:** HAL JSON with `_embedded.events[]`, each containing `name`, `dates.start`, `_embedded.venues[]`, `_embedded.attractions[]`, `url`, `classifications[]`.
- **Deduplication:** Events have a stable `id` field. Use as idempotency key to avoid inserting duplicates on subsequent daily runs.
- **No LLM needed:** Data arrives structured. Write a TM-specific adapter that maps TM response fields to `ExtractedEventSchema` without calling Gemini.
- **Province stateCode mapping:** NS = Nova Scotia, NB = New Brunswick, PE = Prince Edward Island, NL = Newfoundland and Labrador. Standard Canadian postal abbreviations.

### Google Events Structured Data

- **Format:** `<script type="application/ld+json">` blocks in HTML `<head>` or `<body>`. May be Microdata instead (less common).
- **Key fields:** `name` (event title), `startDate` (ISO 8601), `endDate`, `location.name` (venue), `location.address`, `performer[].name`, `offers.price`, `url`.
- **Extraction approach:** After HTML fetch, before Gemini call, scan for JSON-LD blocks with `@type: "Event"`. Parse with `JSON.parse`. Map to `ExtractedEventSchema`. If valid and complete, skip Gemini call.
- **Fallback:** If JSON-LD parse fails or required fields are missing, proceed with Gemini extraction as today.
- **Multiple events:** A page may contain an array of Event objects in a single JSON-LD block. Handle both single object and array.
- **Confidence:** Set `confidence: 1.0` for structured data extractions (deterministic, no LLM hallucination risk).

### Songkick

- **Access:** Requires paid partnership agreement. Not open to hobbyist or open-source projects. Standard license fee reported at $500+/month. Do not integrate.
- **Alternative coverage:** Ticketmaster (already planned) + Bandsintown (already integrated) covers the same concert/tour date use cases.

---

## Scrape Quality Metrics Design

The goal is detecting when a source is producing bad data without needing ground-truth labels.

**Proxy metrics (no ground truth required):**

| Metric | What It Detects | How to Compute |
|--------|----------------|----------------|
| Field completeness % | Extraction returning sparse/empty events | Count non-null required fields (performer, date, time) / total required fields per event |
| Confidence score mean | Gemini uncertainty about extraction | Average `confidence` from `ExtractedEventSchema` over last N scrapes |
| Future-date rate | Past events being scraped as current | % of events where `event_date` > current date at ingest time |
| Duplicate rate | Same event inserted multiple times | Count of upsert no-ops vs. new inserts per scrape run |
| Zero-event rate | Page fetch or extraction returning nothing | Track runs where 0 events extracted; alert after N consecutive zero runs |

**Storage options:**
1. Add columns to `scrape_sources` for last-run metrics (simple, no migration headache)
2. New `scrape_run_log` table with one row per source per run (enables trending over time)

Recommendation: Option 2 for long-term value, but Option 1 is acceptable if timeline is tight.

---

## Competitor Feature Analysis

| Feature | Ticketmaster (as platform) | Eventbrite | Bandsintown | Our Approach |
|---------|---------------------------|------------|-------------|--------------|
| API availability | Free Discovery API, 5000 calls/day | Requires organizer account; public API limited | Free public API | Consume TM as data source; not positioning against them |
| Geographic filtering | countryCode + stateCode params | City-based search | Artist-centric (not location-first) | Province-level TM query daily; merge into existing event store |
| Structured data | TM embeds schema.org on event pages | Eventbrite uses schema.org heavily | Minimal structured data | Extract JSON-LD as first-pass before LLM |
| Pagination | TM API has page param | Eventbrite has paginated API | N/A | HTTP pagination in scraper; API pagination in TM adapter |

---

## Sources

- [Ticketmaster Discovery API v2 — Official Docs](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) — Rate limits, endpoints, geographic filtering, response format (HIGH confidence)
- [Ticketmaster Getting Started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/) — Authentication, quota (HIGH confidence)
- [Songkick Developer Portal](https://www.songkick.com/developer) — Partnership requirement, license fee, explicit rejection of hobbyist access (HIGH confidence)
- [Google Event Structured Data — Search Central Docs](https://developers.google.com/search/docs/appearance/structured-data/event) — Required/recommended properties, JSON-LD format (HIGH confidence)
- [schema.org/Event](https://schema.org/Event) — Full schema definition (HIGH confidence)
- [Web Scraping Pagination Patterns — ScrapingAnt](https://scrapingant.com/blog/javascript-pagination-web-scraping) — Pagination detection and handling strategies (MEDIUM confidence)
- [Rate Limiting Best Practices — TheWebScraping.club](https://substack.thewebscraping.club/p/rate-limit-scraping-exponential-backoff) — Exponential backoff, jitter, Retry-After handling (MEDIUM confidence)
- [Data Quality in Web Scraping — Litport](https://litport.net/blog/data-quality-in-web-scraping-essential-practices-for-reliable-data-collection-13028) — Proxy metrics for scrape quality without ground truth (MEDIUM confidence)
- [Confidence Threshold in AI Systems — LlamaIndex Glossary](https://www.llamaindex.ai/glossary/what-is-confidence-threshold) — Threshold-based auto-approval pattern (MEDIUM confidence)

---
*Feature research for: East Coast Local v1.4 — Platform Integrations and Scraping Improvements*
*Researched: 2026-03-15*
