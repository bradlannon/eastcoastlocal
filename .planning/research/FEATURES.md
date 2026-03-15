# Feature Research

**Domain:** Event discovery platform — mass venue discovery and coverage scaling (v2.0 milestone)
**Researched:** 2026-03-15
**Confidence:** MEDIUM overall — Google Maps Places API and Reddit API behaviors drawn from training data (cutoff August 2025); flag for verification before implementation

---

## Context: What Already Exists (Must Preserve)

This is the v2.0 milestone. The following are already built and must be integrated with, not replaced:

- **Discovery pipeline:** `runDiscoveryJob()` queries Gemini + Google Search grounding for 6 hardcoded Atlantic cities; stages results in `discovered_sources`; auto-approves at score ≥ 0.8
- **Scoring:** `scoreCandidate()` assigns 0.5 base + bonuses for city/province/name presence; penalizes aggregator domains and event-path URLs
- **Promotion:** `promoteSource()` creates a `venues` row + `scrape_sources` row from a `discovered_sources` row; called by both admin UI and auto-approve
- **Venue dedup:** Two-signal gate (name ratio + geocoordinate proximity); auto-merge at high confidence; borderline cases queued to `venueMergeCandidates` for admin review
- **Auto-geocoding:** `geocodeAddress()` uses Google Maps Geocoding API with APPROXIMATE-precision rejection
- **Vercel Hobby constraints:** 60s function timeout; 50MB size limit; no Playwright/Puppeteer
- **Existing geography:** 6 cities hardcoded in `ATLANTIC_CITIES` array (Halifax, Moncton, Fredericton, Saint John, Charlottetown, St. John's)

The v2.0 features add new discovery *sources* (Google Maps Places API, Reddit) and expand *geography*. The downstream pipeline (scraping, dedup, promotion) is largely unchanged.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the minimum behaviors for a system claiming "mass venue discovery." Missing them = the feature does not work as described.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Google Maps Places API venue search | The only reliable structured data source for venue metadata (name, address, website, lat/lng, place type, phone) at scale. Text Search and Nearby Search are the standard mechanisms. Without this, "bulk discovery" relies entirely on Gemini web search, which has no structured output guarantees. | MEDIUM | Requires Places API (New) enabled on the Google Cloud project. Text Search: `POST https://places.googleapis.com/v1/places:searchText` with `textQuery: "bars pubs venues events [city]"`. Nearby Search: `POST .../places:searchNearby` with lat/lng + radius. Response fields include `displayName`, `formattedAddress`, `websiteUri`, `nationalPhoneNumber`, `types`, `location`. Field mask header required — only request needed fields to control billing. |
| Expanded city coverage beyond 6 cities | Current 6-city list misses population centers like Truro NS, Amherst NS, Miramichi NB, Corner Brook NL, Summerside PEI. "Expanded geographic coverage" is a stated goal; without it, the milestone is incomplete. | LOW | Extend the `ATLANTIC_CITIES` array (or equivalent config) with smaller cities. Atlantic Canada has ~30 population centers worth targeting. The existing loop already iterates per-city — adding more cities is additive. Timeout risk: 30 cities × 2s throttle = 60s, which hits the Vercel function limit. See pitfalls. |
| Deduplication against existing venues before bulk import | Google Maps will return venues already in the system. Without dedup, bulk import creates duplicate venue rows and double pins. The venue dedup system (two-signal gate) already exists but is only triggered by Ticketmaster ingest. | LOW | Before inserting a Places-discovered venue, run it through `scoreVenueCandidate()` against existing venues. Auto-merge at high confidence; queue borderline to `venueMergeCandidates`. Reuse existing logic; wire it into the new discovery path. |
| Website URL extraction from Places results | The point of venue discovery is to find scrapeable websites. If a Places result has no `websiteUri`, it cannot be promoted to a scrape source. The system needs to handle "no website" venues separately from "has website" venues. | LOW | Filter Places results: venues with `websiteUri` are candidates for scrape source promotion. Venues without website but with phone/address can be stored as venue stubs (with no scrape source) for future manual review or Ticketmaster-only coverage. |
| Rate limit compliance for Places API | Google Maps Places API has per-minute and per-day quotas. A bulk import loop hammering the API without throttling will hit 429 errors and may incur unexpected billing spikes. | LOW | Apply the same per-request delay pattern already used in `runDiscoveryJob()` (configurable `DISCOVERY_THROTTLE_MS`). Add a distinct `PLACES_THROTTLE_MS` env var. Cache responses — do not re-query a city that was searched in the current run. |
| Reddit post mining for venue/event mentions | r/halifax, r/fredericton, r/stjohnsnl, r/newbrunswick, r/PEI are active Atlantic Canada communities. Event and venue recommendations appear in "what's on this weekend" and "live music" threads. Without extracting from these sources, the feature is not delivered. | HIGH | Reddit API (OAuth2, read-only) or direct Reddit JSON endpoints (`.json` suffix on any post/thread URL, no auth required for public subreddits). Use Gemini to parse raw comment text and extract venue names + URLs. High complexity because Reddit data is unstructured and noisy; false positive rate will be higher than Places API. |
| Aggressive auto-approval for high-confidence venues | The current auto-approve threshold (0.8) was calibrated for Gemini web-search results. Places API results have structured data (address, coordinates, place type) that warrants different — likely lower — threshold or a separate scoring path. Without tuning this, the admin queue fills with Places-sourced venues that should be auto-approved. | LOW | Add a `places_api` discovery method value for `discovered_sources.discovery_method`. Score Places candidates with a separate scoring function that gives credit for having structured lat/lng, a verified place type (bar, restaurant, night_club, etc.), and a real website URL. Auto-approve at a lower threshold (e.g., 0.7) for Places-sourced venues. |

### Differentiators (Competitive Advantage)

Features that extend beyond the minimum and improve data quality or coverage significantly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Place type filtering for venue relevance | Google Maps returns businesses of all types. Without filtering, "venue discovery" query returns restaurants, grocery stores, and gas stations. Filtering by place type ensures only plausible event venues are staged. | LOW | Include `includedTypes` in the Nearby Search request body (e.g., `["bar", "night_club", "concert_hall", "performing_arts_theater", "comedy_club", "community_center", "stadium"]`). Text Search does not support `includedTypes` natively — apply type filtering as a post-process step on the response. |
| Scalable discovery job architecture (chunked cron) | 30+ cities × Places API + Gemini + Reddit = well over 60 seconds of sequential work. A single cron that tries to do everything will timeout on Vercel Hobby. | HIGH | Split discovery into city-chunked jobs. Option A: multiple Vercel cron schedules, each covering a subset of cities (e.g., NB cities at 2am, NS at 3am). Option B: a single cron that tracks last-processed city index in DB and picks up where it left off. Option B is more elegant but requires state management. |
| Reddit subreddit targeting per province | Different provinces have different active communities (r/halifax is large; r/PEI is smaller). Blanket scraping all subreddits equally wastes quota on low-signal sources. | LOW | Maintain a province-to-subreddit mapping. Prioritize high-activity subreddits. Limit search to "new" or "hot" posts within the past 30 days. Use specific search terms: "live music", "events this weekend", "shows", "playing tonight". |
| No-website venue stubs for Ticketmaster coverage | Some venues have no scrapeable website but appear on Ticketmaster (e.g., sports arenas, amphitheatres). Storing these as venue stubs with lat/lng allows Ticketmaster events at those venues to be geocoded and mapped correctly, even without a scrape source. | LOW | On promotion: if `websiteUri` is null but venue has name + address + coordinates, create a venues row without a `scrape_sources` entry. Mark with a `venue_type: 'stub'` or a new boolean `has_scrape_source: false`. Ticketmaster's existing dedup will match TM venue names against these stubs. |
| Admin batch-approve UI for discovery queue | When bulk import produces 50–100 staged candidates, reviewing them one by one is impractical. A "select all / approve selected" batch action in the admin discovery UI dramatically reduces review friction. | MEDIUM | Add checkboxes to the discovery list rows. "Approve selected" button calls `promoteSource()` for each checked ID. Requires server action that accepts an array of IDs. Current per-item approve action can be reused per-item internally. |
| Discovery run logging and metrics | At scale (hundreds of venues processed per run), the admin needs visibility into what was discovered, what was auto-approved, what failed, and why — not just a console.log. | MEDIUM | Add a `discovery_runs` table with `run_at`, `method`, `cities_searched`, `candidates_found`, `auto_approved`, `queued_for_review`, `errors`. Populate at end of each cron run. Surface on admin dashboard as "Last discovery run" with counts. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fully automated bulk import with zero admin review | "Just approve everything from Google Maps — they're legit businesses" | Google Maps returns tattoo parlors, nail salons, and food trucks alongside bars and venues. Even with type filtering, false positives exist. Bulk auto-import without any review path will populate the map with non-event venues and require manual cleanup. | Auto-approve only when place type is in a high-confidence whitelist (bar, night_club, concert_hall, performing_arts_theater) AND website is present AND address is valid. Route everything else through admin review. |
| Reddit as primary discovery source | Reddit is unstructured, community-sourced, and noisy. Using it as the primary input for venue discovery would produce many false positives. | Reddit posts mention venues in passing (e.g., "I saw a band at [venue name]"). Extracting structured URLs from these mentions requires LLM parsing, which has error rates. Reddit API also has rate limits and requires OAuth2 setup. | Use Reddit as a *supplemental* signal — a second-pass enrichment after Places API has built the baseline. Reddit is better for discovering niche venues that don't appear in Places than as a primary data source. |
| Storing raw Reddit posts in the database | "Save the full post text for provenance" | Raw Reddit content is large, legally ambiguous (Reddit TOS), and unnecessary. The useful output is extracted venue names and URLs, not the raw text. | Store only the extracted structured output (venue name, URL, city) in `discovered_sources.raw_context`. Record the subreddit and post ID as the source reference, not the full post body. |
| Real-time venue discovery triggered by users | "Let users suggest venues to add" | Triggers LLM + Places API calls on user requests, which is expensive, slow, and open to abuse. | Discovery remains a scheduled cron job only. If user-triggered venue requests are needed in the future, implement a simple "suggest a venue" form that queues suggestions for admin review — no automated pipeline triggered. |
| Scraping Facebook Events for venue discovery | "Lots of Atlantic Canada venues post events only on Facebook" | Requires headless browser (Playwright/Puppeteer), which exceeds Vercel Hobby's 50MB function size limit. Facebook actively blocks scrapers. This is explicitly listed as Out of Scope in PROJECT.md. | Focus on venues with their own websites (Places API `websiteUri`), Eventbrite pages, and Bandsintown pages. These are scrapeable without headless browsers. Accept that Facebook-only venues are out of scope. |
| Geocoding every Reddit-mentioned venue during discovery | "Let's geocode each extracted venue immediately so we have coordinates" | Reddit-extracted venue names are noisy and many will fail geocoding (e.g., "the bar on Gottingen" is not a geocodable address). Burning Geocoding API credits on low-quality inputs wastes money. | Geocode only after a venue passes the quality gate and is promoted to the `venues` table. The existing `promoteSource()` already geocodes on creation. Do not geocode during the discovery/staging phase. |

---

## Feature Dependencies

```
[Google Maps Places API Discovery]
    └──requires──> [Places API enabled on GCP project] (may need API key scope update)
    └──requires──> [Throttling per request] (reuse DISCOVERY_THROTTLE_MS pattern)
    └──feeds into──> [discovered_sources table] (same staging table as Gemini discovery)
    └──requires──> [Venue dedup check before insert] (scoreVenueCandidate against existing venues)
    └──requires──> [Separate scoring function] (Places candidates score differently than Gemini candidates)

[Expanded City Coverage]
    └──requires──> [City list expansion] (extend ATLANTIC_CITIES or equivalent config)
    └──conflicts with──> [Vercel 60s timeout] (more cities = longer sequential job; see Architecture)
    └──requires──> [Chunked cron job design] (if >15 cities, sequential loop will timeout)

[Reddit Venue Mining]
    └──requires──> [Reddit API access] (OAuth2 app registration OR public JSON endpoints)
    └──requires──> [Gemini extraction] (reuse existing extractor pattern; parse unstructured text)
    └──feeds into──> [discovered_sources table] (discovery_method: 'reddit_mining')
    └──depends on──> [Google Maps Places API Discovery] (Reddit is supplemental, not primary)
    └──does NOT require──> [Schema changes] (discovery_method column already exists as free text)

[Batch Admin Approve UI]
    └──requires──> [Checkboxes on discovery list] (UI change to DiscoveryList component)
    └──requires──> [Batch server action] (new action accepting array of IDs)
    └──reuses──> [promoteSource()] (calls per-item internally)
    └──enhances──> [Admin discovery review] (reduces friction for bulk review)

[Scalable Discovery Job (Chunked Cron)]
    └──requires──> [Either: multiple Vercel cron schedules OR DB-tracked job cursor]
    └──required by──> [Expanded City Coverage] (prerequisite if >15 cities)
    └──required by──> [Reddit Mining at scale] (Reddit adds significant per-subreddit latency)

[No-website Venue Stubs]
    └──requires──> [Venue promotion path for Places results without websiteUri]
    └──reuses──> [venues table] (no schema change needed)
    └──enhances──> [Ticketmaster dedup] (TM venues can merge against stubs)
    └──does NOT require──> [scrape_sources entry]

[Discovery Run Logging]
    └──requires──> [New discovery_runs table] (schema migration)
    └──fed by──> [runDiscoveryJob() return value or wrapper]
    └──surfaces on──> [Admin dashboard]
```

### Dependency Notes

- **Places API before Reddit:** Build Places API discovery first. It produces higher-quality structured results and establishes the bulk discovery pipeline pattern. Reddit mining is a supplemental pass that uses the same staging table — add it after Places API is working.
- **Chunked cron is required for expanded geography:** The Vercel 60s timeout is the binding constraint. Any design that adds more than ~15 cities to a sequential discovery loop must address this before expanding geography. The chunked cron design gates all city expansion work.
- **Dedup wiring is a prerequisite for bulk import:** Google Maps will return venues already in the system. Without running `scoreVenueCandidate()` before insert, the bulk import will create duplicates that require manual merge. Wire dedup before enabling Places API discovery at scale.
- **Batch approve UI is independent:** It is a UI-only change that can be added at any point. It does not gate any backend feature.

---

## MVP Definition

### Launch With (v2.0)

Minimum viable feature set for this milestone to be complete and valuable.

- [ ] Google Maps Places API venue discovery — Text Search or Nearby Search per city, extracting name + address + website + coordinates + place type
- [ ] Expanded city list — all Atlantic Canada population centers (target: ~25 cities/towns across 4 provinces)
- [ ] Place type filtering — only stage venues with plausible event-hosting types (bar, night_club, performing_arts_theater, community_center, etc.)
- [ ] Dedup against existing venues before staging — run `scoreVenueCandidate()` before inserting to `discovered_sources`
- [ ] Places-specific scoring — separate scoring path that credits structured lat/lng, verified place type, and website presence
- [ ] Chunked cron design — discovery job does not attempt all cities in one 60s window
- [ ] Reddit mining (supplemental) — scan r/halifax, r/fredericton, r/stjohnsnl, r/newbrunswick, r/PEI for venue mentions; extract with Gemini; stage in `discovered_sources`

### Add After Validation (v2.x)

- [ ] Batch admin approve UI — checkboxes + "approve selected" for bulk review
- [ ] No-website venue stubs — promote Places venues without websites as stub venue rows
- [ ] Discovery run logging — `discovery_runs` table surfaced on admin dashboard

### Future Consideration (v3+)

- [ ] Real-time discovery coverage health — admin view showing province/city coverage metrics (X venues per city, last discovered date)
- [ ] Venue suggestion form — user-submitted venue suggestions queued for admin review (no automated pipeline)
- [ ] Auto-refresh stale venue websites — detect venues that haven't had successful scrapes in 30+ days and re-evaluate their website URL

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Google Maps Places API discovery | HIGH (structured bulk input; enables scale) | MEDIUM (API integration + field masking + throttling) | P1 |
| Expanded city coverage | HIGH (directly increases event coverage) | LOW (list expansion) + depends on chunked cron | P1 |
| Chunked cron job design | MEDIUM (infrastructure; enables scale) | MEDIUM (cron splitting or cursor state) | P1 — gates city expansion |
| Dedup wiring for Places results | HIGH (prevents data corruption at scale) | LOW (reuse existing scoreVenueCandidate) | P1 |
| Place type filtering | MEDIUM (reduces false positives) | LOW (includedTypes param or post-filter) | P1 |
| Reddit venue mining | MEDIUM (discovers niche/local venues Places misses) | HIGH (API setup + Gemini extraction + noise handling) | P2 |
| Batch admin approve UI | MEDIUM (reduces admin burden at scale) | MEDIUM (UI + server action) | P2 |
| Discovery run logging | LOW-MEDIUM (operational visibility) | MEDIUM (schema + instrumentation) | P2 |
| No-website venue stubs | LOW (improves TM dedup; no immediate map value) | LOW (promotion path change) | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Should have; add when P1 features are stable
- P3: Nice to have; defer if time-constrained

---

## Implementation Detail Notes

### Google Maps Places API (New) — Key Behaviors

**Confidence: MEDIUM — based on training data through August 2025; verify current quota and pricing before implementation.**

The Places API (New) uses a different endpoint structure than the legacy Places API:
- Text Search: `POST https://places.googleapis.com/v1/places:searchText`
- Nearby Search: `POST https://places.googleapis.com/v1/places:searchNearby`
- Field mask header: `X-Goog-FieldMask: places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.types,places.location,places.businessStatus`

**Recommended approach — Text Search per city:**
Query: `"bars pubs live music venues [city] [province] Canada"` — returns up to 20 results per request. Use `pageToken` for pagination (up to 3 pages = 60 results per city). For 25 cities this is up to 1,500 candidate venues before filtering.

**Place types relevant to event venues:**
`bar`, `night_club`, `concert_hall`, `performing_arts_theater`, `comedy_club`, `community_center`, `stadium`, `amphitheatre_or_outdoor_concert_venue`, `pub`. Filter client-side: keep results that have at least one of these types in the `types` array. Discard results that are only `restaurant`, `lodging`, `store`, etc.

**businessStatus field:** Filter out `CLOSED_PERMANENTLY` and `CLOSED_TEMPORARILY` venues before staging — no point scraping a closed venue.

**Cost:** Text Search is billed per request. At 25 cities × 3 pages each = 75 API requests per discovery run. At Google's current pricing this is inexpensive but verify the SKU pricing before enabling.

**Rate limits:** 600 requests per minute (project-level). A 25-city discovery run at 75 requests is well within limits. No per-second throttling needed beyond the existing courtesy delay.

### Reddit Mining via Gemini — Approach

**Confidence: MEDIUM — Reddit public JSON API behavior is stable; Gemini extraction pattern reuses existing code.**

**No OAuth2 required for read-only public subreddit access:** Reddit exposes public subreddit listings as JSON by appending `.json` to any subreddit URL:
- `https://www.reddit.com/r/halifax/search.json?q=live+music+venue&sort=new&t=month&limit=25`
- `https://www.reddit.com/r/fredericton/search.json?q=events+shows&sort=new&t=month&limit=25`

This requires a descriptive `User-Agent` header (e.g., `EastCoastLocal/1.0`). No API key needed. Rate limit: 60 requests/minute for unauthenticated access.

**Extraction approach:** Fetch top posts + comments for target search terms. Concatenate post title + selftext + top-level comments into a single text blob. Pass to Gemini with a prompt to extract: venue names, URLs, city, province. Use the existing `Output.object({ schema: CandidateSchema })` pattern from `discovery-orchestrator.ts`. The existing schema already captures all needed fields.

**Noise handling:** Expect 60–80% of extracted "venues" to be invalid (band names mistaken for venues, addresses, aggregator links). Scoring will reject aggregator URLs. Admin review handles borderline cases. Do not attempt NLP-based venue classification — scoring + admin review is sufficient.

**Subreddit targeting:**
```
NB: r/newbrunswick, r/fredericton, r/SaintJohn, r/moncton
NS: r/halifax, r/novascotia
PEI: r/PEI
NL: r/newfoundland, r/stjohnsnl
```

### Chunked Cron Job Design

**The Vercel Hobby 60s function timeout is the primary architecture constraint.**

**Option A — Multiple Vercel cron schedules (recommended for simplicity):**
```
/api/cron/discover/nb  → runs at 2:00 AM UTC — NB cities
/api/cron/discover/ns  → runs at 3:00 AM UTC — NS cities
/api/cron/discover/pei → runs at 4:00 AM UTC — PEI + NL
```
Each cron handles a subset of cities that fits within 60 seconds. No state management needed. Downside: multiple cron endpoint files.

**Option B — DB-tracked job cursor:**
Store `last_processed_city_index` in a `discovery_job_state` table. Each cron invocation reads the cursor, processes the next N cities, and advances the cursor. Wraps around after last city. More complex but keeps a single cron endpoint.

**Recommendation:** Option A for v2.0 (lower complexity, easier to debug). Option B if the number of cron files becomes unwieldy.

### Scoring Places API Candidates vs. Gemini Candidates

The existing `scoreCandidate()` function was designed for Gemini web-search output. Places API results have different signal availability:

| Signal | Gemini candidates | Places API candidates |
|--------|------------------|-----------------------|
| City present | Optional (LLM may omit) | Always present (formattedAddress) |
| Province present | Optional | Derivable from address |
| Name present | Optional | Always present (displayName) |
| Coordinates | Never (URL-only output) | Always present (location.lat/lng) |
| Website | Present (it's the URL) | Optional (websiteUri field) |
| Place type | Never | Always present (types array) |

Recommended scoring for Places candidates:
- Base: 0.5
- Has websiteUri: +0.2
- Place type in event-venue whitelist: +0.15
- businessStatus is OPERATIONAL: +0.05
- Has coordinates: +0.05 (bonus for geocoding accuracy)
- Place type NOT in whitelist: -0.3
- businessStatus CLOSED_PERMANENTLY: reject outright

This scoring means most operational venues with websites and event-venue types will score ≥ 0.8 and auto-approve. Venues without websites will score ~0.7 and go to admin review.

---

## Competitor Feature Analysis

| Feature | Songkick | Bandsintown | Google Maps/Events | Our Approach |
|---------|----------|-------------|-------------------|--------------|
| Venue discovery | Manually curated + promoter submissions | Promoter/artist push | Places API (structured) | Places API pull + Reddit supplemental |
| Geographic coverage | Major cities only | Major cities only | Global (Places API) | All Atlantic Canada, including small towns |
| Auto-approval | N/A (curated) | N/A (push model) | N/A | Score-gated auto-approve; admin review for borderline |
| Venue without website | Not scraped | Artist-linked only | Listed in Places regardless | Venue stubs (no scrape source); TM dedup still works |
| Admin review UI | N/A | N/A | N/A | Per-item approve/reject; batch approve for scale |

---

## Sources

- Google Maps Places API (New) documentation — `places:searchText`, `places:searchNearby`, field masking, `includedTypes` — training data through August 2025. **MEDIUM confidence — verify current endpoint behavior and pricing before implementation.**
- Reddit public JSON API (`/r/subreddit/search.json`) — stable behavior for unauthenticated public access — **MEDIUM confidence.**
- Existing codebase: `discovery-orchestrator.ts`, `promote-source.ts`, `venue-dedup.ts`, `geocoder.ts`, `schema.ts` — direct inspection — **HIGH confidence.**
- Vercel Hobby plan constraints (60s timeout, 50MB function size) — PROJECT.md Constraints section — **HIGH confidence.**
- Atlantic Canada subreddit list — community knowledge — **MEDIUM confidence; verify subreddit activity before targeting.**

---

*Feature research for: East Coast Local v2.0 — Mass Venue Discovery and Coverage Scaling*
*Researched: 2026-03-15*
