# Project Research Summary

**Project:** East Coast Local v2.0 — Mass Venue Discovery
**Domain:** Regional event discovery platform — bulk venue acquisition via Google Maps Places API, Reddit mining, and expanded geographic coverage
**Researched:** 2026-03-15
**Confidence:** HIGH (stack and architecture based on direct codebase analysis); MEDIUM (Places API field names and pricing, Reddit API behavior)

## Executive Summary

East Coast Local v2.0 is a well-scoped expansion of an already-shipped system. The v1.5 codebase provides the complete downstream pipeline — staging table (`discovered_sources`), scoring (`scoreCandidate()`), promotion (`promoteSource()`), dedup (`venue-dedup.ts`), and admin review UI — that v2.0 new features simply pour into. The headline finding is that **no fundamental architecture changes are required**; the work is adding two new discovery modules (`places-discoverer.ts` and `reddit-discoverer.ts`) and a small schema migration, not rebuilding the pipeline. The existing `DiscoveredCandidate` type needs four new optional fields (`address`, `googlePlaceId`, `lat`, `lng`) and the `discovered_sources` and `venues` tables each need a corresponding migration.

The primary constraint governing all design decisions is the Vercel Hobby plan's 60-second function timeout. The existing `discover` cron already uses ~20-30 seconds running 6 cities through Gemini+Search. Adding Places API discovery (140+ requests for 20 cities) into the same cron window will reliably timeout. The correct approach — confirmed by both the architecture and pitfalls research — is to give each discovery channel its own cron endpoint on a separate schedule: Places API on Monday, Reddit on Wednesday. This isolation also means a failure in one channel doesn't block the others.

The key risk is Places API score tuning and managing the `no_website` venue case. Google Maps will return venues without websites (community halls, small bars) that have real geographic value as dedup anchors but cannot be scraped. These must be handled as a `status = 'no_website'` staging entry rather than discarded. The second risk is Reddit's noise: 60-80% of Gemini-extracted Reddit candidates will be false positives. This is acceptable if the auto-approve threshold for Reddit-sourced candidates is raised to 0.9 (vs. 0.8 for Places) and the admin review queue is the safety valve.

## Key Findings

### Recommended Stack

No new packages are required for the core features. Google Maps Places API Text Search and Reddit's public JSON API are both consumed via native `fetch()`, consistent with the project's established pattern in `geocoder.ts`. The existing `@ai-sdk/google` + `generateText` + `Output.object` handles Reddit text extraction the same way it handles Gemini discovery today. The `discovered_sources` staging table and its insert/score/promote pipeline already accommodate new `discovery_method` values without schema changes to the flow logic.

**Core technologies:**
- `fetch()` to `https://places.googleapis.com/v1/places:searchText`: Places API Text Search — consistent with geocoder pattern, no SDK needed
- `fetch()` to `https://www.reddit.com/r/{sub}/new.json`: Reddit public JSON — stable since 2012, no OAuth required for read-only access, requires `User-Agent` header
- `@ai-sdk/google` (existing): Gemini extraction for Reddit post text — reuses existing `CandidateSchema` and `Output.object` pattern
- `p-limit@^6.1.0` (optional): Concurrency limiter if city list exceeds ~20 — prevents Places API rate errors while keeping cron time under 60s
- Existing `GOOGLE_MAPS_API_KEY`: Same key used by geocoder; must verify "Places API (New)" is separately enabled in GCP Console

**Critical version note:** Verify the Places API (new) v1 endpoint URL and `X-Goog-FieldMask` header field names against official docs before implementation — research confidence on exact field names is MEDIUM.

### Expected Features

**Must have (table stakes — v2.0 launch):**
- Google Maps Places API venue discovery — Text Search per city, extracting name/address/website/lat/lng/place type
- Expanded city coverage — all Atlantic Canada population centers (~25 cities across 4 provinces, up from 6)
- Place type filtering — only stage venues with event-hosting types (bar, night_club, performing_arts_theater, community_center, etc.)
- Dedup against existing venues before staging — wire `scoreVenueCandidate()` before inserting to `discovered_sources`
- Places-specific scoring — separate scoring path crediting structured lat/lng, verified place type, website presence
- Chunked cron design — discovery job does not attempt all cities in one 60s window
- Reddit venue mining (supplemental) — scan Atlantic Canada subreddits for venue mentions, extract via Gemini, stage in `discovered_sources`

**Should have (add when P1 features are stable):**
- Batch admin approve UI — checkboxes + "approve selected" to reduce review friction at scale
- No-website venue stubs — promote Places venues without `websiteUri` as stub venue rows (dedup anchors for Ticketmaster)
- Discovery run logging — `discovery_runs` table surfaced on admin dashboard for operational visibility

**Defer to v2.x / v3+:**
- Real-time discovery coverage health — admin view showing per-city venue counts and last-discovered dates
- User venue suggestion form — queued for admin review, no automated pipeline
- Auto-refresh stale venue websites — re-evaluate websites that haven't yielded successful scrapes in 30+ days

### Architecture Approach

The architecture is additive: two new discovery modules feed the existing `discovered_sources` funnel, each running as its own isolated cron endpoint. The `DiscoveredCandidate` interface gains optional structured-data fields from Places API. The `promoteSource()` function gains a geocode-skip optimization when `lat/lng` are pre-populated from Places API. The `scoreCandidate()` function gains per-method thresholds (Places=0.8, Gemini Search=0.8, Reddit=0.9). Everything else — admin UI, scraping pipeline, event dedup — is untouched.

**Major components:**
1. `places-discoverer.ts` (NEW) — Calls Places API Text Search per city+type combo; returns `DiscoveredCandidate[]`; includes pre-geocoded coordinates to skip `geocodeAddress()` at promotion time
2. `reddit-discoverer.ts` (NEW) — Fetches subreddit JSON, batches post text to Gemini for extraction; returns `DiscoveredCandidate[]` with `discovery_method = 'reddit_gemini'`
3. `/api/cron/reddit-discover/route.ts` (NEW) — Isolated cron endpoint on Wednesday schedule; same `CRON_SECRET` auth + `maxDuration = 60`
4. `discovery-orchestrator.ts` (MODIFIED) — Calls `runPlacesDiscovery()` on Monday cron; expands `ATLANTIC_CITIES` from 6 to ~20 entries
5. Schema migration (NEW) — Adds `address`, `google_place_id`, `lat`, `lng` to `discovered_sources`; adds `google_place_id` to `venues`

### Critical Pitfalls

1. **Stacking Places discovery inside the existing 60s discover cron** — The existing Gemini+Search loop already uses 20-30s. Adding 140 Places API calls into the same function will timeout. Run Places discovery as its own cron endpoint on a separate day, or replace Gemini+Search on Mondays with Places discovery.

2. **Global auto-approve threshold for all discovery methods** — Reddit-mined candidates have much lower precision than Places API candidates. Applying a uniform 0.8 threshold will auto-approve bad venue rows. Use per-method thresholds: `google_places` = 0.8, `reddit_gemini` = 0.9.

3. **Discarding `url = null` venues from Places API** — Many real Atlantic Canada venues (community halls, seasonal spaces) have no website in Google Maps. Adding a `WHERE websiteUri IS NOT NULL` guard silently drops venues with real dedup value. Insert with `status = 'no_website'`; the `google_place_id` becomes a future Ticketmaster dedup anchor.

4. **Building separate admin review flows for each discovery source** — Creating separate admin pages for "Google Places candidates" and "Reddit candidates" fragments the review queue and doubles UI complexity. The existing `/admin/discovery` page handles all sources via the `discovery_method` column. Add a filter chip if needed — not a new page.

5. **Not verifying Places API (New) is separately enabled on the GCP key** — The existing `GOOGLE_MAPS_API_KEY` enables the Geocoding API. Places API (New) is a different product in GCP Console requiring a separate toggle. Verify before implementing — an unchecked key returns 403s that look like authentication failures.

6. **Sequential Places discovery for 20+ cities at the Vercel 60s limit** — At 7 type queries x 20 cities = 140 requests with ~200ms throttle, sequential execution takes 28+ seconds on network alone. Use `p-limit` with concurrency=5 if the city list exceeds ~15 entries. If the function still approaches 60s, split by province into separate cron endpoints.

## Implications for Roadmap

Based on combined research, the natural phase structure mirrors the dependency chain: schema first (gates everything else), Places API module second (highest value, most structured, isolated development), orchestrator wiring third (integrates Places into the live pipeline), Reddit fourth (lower precision, builds on the established pipeline), admin polish fifth (reduces review friction at scale).

### Phase 1: Schema Migration
**Rationale:** Foundation for everything else. Pure Drizzle migration, no logic changes, safe to ship and verify independently. All subsequent phases depend on the new columns.
**Delivers:** `discovered_sources` gains `address`, `google_place_id`, `lat`, `lng`; `venues` gains `google_place_id`; unique index on `google_place_id` (nullable — safe for non-Places rows)
**Addresses:** Dedup anchor for cross-source venue matching; enables geocode-skip optimization in `promoteSource()`
**Avoids:** Retrofitting column additions after data is already in the pipeline

### Phase 2: Places API Discoverer Module
**Rationale:** Highest-value discovery channel — structured data with address, coordinates, and place type. Build and unit-test in isolation with mocked fetch responses before wiring to the live orchestrator.
**Delivers:** `places-discoverer.ts` with Text Search per city+type returning `DiscoveredCandidate[]`; `places-discoverer.test.ts` with mocked fetch
**Uses:** Native `fetch()`, existing `GOOGLE_MAPS_API_KEY`, `X-Goog-FieldMask` header, optional `p-limit`
**Implements:** Discovery Channel Protocol (shared `DiscoveredCandidate` output contract)
**Critical check:** Verify Places API (New) is enabled on the GCP key and confirm current field names against official docs before writing integration code

### Phase 3: Orchestrator Integration and Score Tuning
**Rationale:** Wire the Places module into the live pipeline with production cron scheduling. Requires Phase 1 columns. Includes the cron separation decision and per-method threshold tuning after seeing real output.
**Delivers:** Working Places discovery in production; `scoreCandidate()` with per-method thresholds (0.8 for Places, 0.9 for Reddit); `promoteSource()` geocode-skip optimization; `vercel.json` updated with new/modified cron schedule; `ATLANTIC_CITIES` expanded to ~20 entries
**Uses:** `p-limit` if concurrency is needed; existing `DISCOVERY_THROTTLE_MS` pattern
**Implements:** Segmented Cron pattern (60s timeout mitigation via separate endpoints)
**Avoids:** Pitfall 1 (stacking channels in one cron), Pitfall 2 (uniform threshold), Pitfall 5 (GCP key verification)

### Phase 4: Reddit Discoverer
**Rationale:** Supplemental channel — lower precision than Places but discovers niche/local venues Google Maps misses. Build after the high-quality Places path is working and you have a quality baseline for comparison.
**Delivers:** `reddit-discoverer.ts`; `/api/cron/reddit-discover/route.ts` on Wednesday schedule; 0.9 auto-approve threshold for Reddit candidates
**Uses:** Reddit public JSON API (no auth, `User-Agent` header required); existing `@ai-sdk/google` + `CandidateSchema` pattern
**Avoids:** Pitfall 2 (must use 0.9 threshold, not 0.8); Pitfall 5 (separate cron endpoint prevents timeout competition with Places discovery)

### Phase 5: Admin Polish — No-Website Filter and Batch Approve
**Rationale:** Only needed once bulk import is producing staged candidates at scale. Independent of all backend phases; can be deferred until the admin queue actually fills up.
**Delivers:** `no_website` filter chip on `/admin/discovery`; batch approve checkboxes + "approve selected" server action accepting array of IDs; Google Maps link (via `google_place_id`) in discovery review cards
**Addresses:** Reduces review friction when 50-100 staged candidates appear after first Places discovery run
**Avoids:** Pitfall 4 (adds to existing review page, not a replacement)

### Phase Ordering Rationale

- **Schema first** because both Places and Reddit channels require the new `lat`/`lng`/`google_place_id` columns — you cannot stage pre-geocoded candidates without them
- **Places before Reddit** because Places produces structured, high-quality output and establishes the pipeline baseline; Reddit's noise level is only meaningful to evaluate once you have Places results as a quality reference
- **Orchestrator integration as its own phase** because it involves production cron schedule changes, which carry deployment risk separate from isolated module development in Phase 2
- **Admin polish last** because it is UI-only, unblocks nothing, and the need for batch approve is only felt after the first real discovery run produces volume
- The existing daily scrape cron is untouched throughout all phases — the first scrape scaling concern (serial scrape at 200+ venues exceeding 60s) is a post-v2.0 concern documented in architecture research

### Research Flags

Phases needing deeper research at planning time:
- **Phase 2 (Places API Discoverer):** MEDIUM confidence on exact field names (`displayName.text` vs. `displayName`, `location.latitude` vs. `location.lat`), `includedTypes` behavior in Text Search vs. Nearby Search, and current Text Search billing SKU. Verify against https://developers.google.com/maps/documentation/places/web-service/text-search before writing the field mask. Also confirm current per-request pricing before finalizing the 7-type x 20-city query strategy (~140 requests/week).
- **Phase 3 (Score Tuning):** The scoring weights for Places candidates (base 0.5, +0.2 for website, +0.15 for type match) are research estimates. Plan one tuning iteration after the first real discovery run before declaring Places discovery stable.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema Migration):** Standard Drizzle migration pattern already established in codebase. No research needed.
- **Phase 4 (Reddit Discoverer):** Reddit public JSON API is well-understood and stable. Gemini extraction reuses existing `CandidateSchema` verbatim. Spot-check `User-Agent` requirement at implementation time.
- **Phase 5 (Admin Polish):** Standard Next.js server action with array input, existing component patterns. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on direct reads of `package.json`, `geocoder.ts`, `discovery-orchestrator.ts`, `schema.ts`. No new packages needed confirmed. Places API and Reddit API behaviors from training knowledge (cutoff Aug 2025). |
| Features | MEDIUM | Feature list well-grounded in codebase reality. Places API field names and `includedTypes` behavior need doc verification. Reddit rate limits (60 req/min) are stable but should be spot-checked. |
| Architecture | HIGH | Component boundaries, data flows, and cron separation strategy derived directly from existing codebase patterns and confirmed Vercel constraints. Per-method threshold values are estimates requiring empirical tuning. |
| Pitfalls | HIGH | Core pitfalls (60s timeout, uniform threshold, no-website venues) confirmed by both codebase analysis and architecture cross-check. Anti-patterns validated against documented Leaflet and Next.js issues in prior milestones. |

**Overall confidence:** HIGH for architecture and implementation approach; MEDIUM for external API specifics that need doc verification before coding begins.

### Gaps to Address

- **Places API field names:** The `X-Goog-FieldMask` values and exact response field structure need verification against current official docs before writing `places-discoverer.ts`. Do this at the start of Phase 2.
- **Places API (New) toggle in GCP Console:** Confirm "Places API (New)" is enabled on the existing key before any integration test. One-time GCP Console check, not a code concern.
- **`p-limit` necessity decision:** Depends on final `ATLANTIC_CITIES` count. If the list stays under 15 cities, sequential `await delay()` is sufficient. Decide at Phase 3 when the city list is finalized.
- **Reddit subreddit activity validation:** The 9 targeted subreddits should be spot-checked for actual "venue/event" post volume before committing to all 9. Some (r/PEI) are low-traffic; a Gemini call per low-volume subreddit wastes quota.
- **`businessStatus` field availability:** Architecture research recommends filtering `CLOSED_PERMANENTLY` venues. Verify this field is included in the Text Search response before relying on it as a filter.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis — `src/lib/scraper/discovery-orchestrator.ts`, `geocoder.ts`, `schema.ts`, `package.json`, `src/app/api/cron/` routes — confirmed existing patterns, integration points, and Vercel constraint configuration
- Vercel Hobby plan constraints — `maxDuration = 60` confirmed in all cron route files; 50MB function size limit confirmed in PROJECT.md

### Secondary (MEDIUM confidence)
- Google Maps Places API (New) v1 — training knowledge (cutoff Aug 2025) — endpoint `https://places.googleapis.com/v1/places:searchText`, `X-Goog-FieldMask` header, field names; verify at https://developers.google.com/maps/documentation/places/web-service/text-search
- Reddit public JSON API — `https://www.reddit.com/r/{sub}/new.json` — training knowledge; API stable since 2012, 60 req/min unauthenticated rate limit
- Text Search billing (~$0.017/request) — training knowledge; verify current SKU pricing before finalizing query strategy

### Tertiary (LOW confidence)
- Places API `websiteUri` population rate (60-70% for Atlantic Canada bars/venues) — regional data density estimate; actual rate may be lower for smaller towns
- Atlantic Canada subreddit activity levels — community knowledge; validate by spot-checking post volume before targeting all 9 subreddits

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
