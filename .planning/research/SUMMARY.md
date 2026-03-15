# Project Research Summary

**Project:** East Coast Local — Atlantic Canada Events Discovery Platform
**Domain:** AI-powered event aggregation with web scraping, API integrations, and interactive map
**Researched:** 2026-03-13 (v1.0 baseline) / 2026-03-14 (v1.1 heatmap, v1.2 discovery + categorization) / 2026-03-15 (v1.4 API integrations + scraping improvements)
**Milestone:** v1.4 — Platform Integrations and Scraping Improvements (current build target)
**Confidence:** HIGH (stack, architecture, pitfalls), MEDIUM (automated venue discovery yield), MEDIUM (auto-approve heuristic calibration)

---

## Executive Summary

East Coast Local is a deployed Next.js application aggregating local event listings across Atlantic Canada via AI-powered web scraping, displaying them on an interactive Leaflet map with pin-cluster and heatmap timelapse modes. As of v1.3, the platform scrapes 26 venues, integrates Eventbrite and Bandsintown APIs, runs automated source discovery, and categorizes events across 8 types. The v1.4 milestone extends this foundation with higher-coverage data (Ticketmaster for major ticketed venues), improved scraping reliability (multi-page support, rate limiting), lower extraction cost (Google Events JSON-LD fast-path), operational visibility (scrape quality metrics), and reduced admin burden (auto-approve for high-confidence discovered sources).

The recommended v1.4 approach is a dependency-ordered build sequence: schema migration first (all new columns on existing tables, one Drizzle migration), then fetch pipeline improvements (rate limiting, multi-page, JSON-LD — these improve the 26 existing sources immediately), then quality metrics instrumentation, and finally Ticketmaster integration and auto-approve discovery. All schema changes are additive. The existing `source_type` dispatch pattern in `orchestrator.ts` is the well-established extension point — every new API integration follows it without touching existing handlers. Songkick is explicitly excluded: it requires a paid commercial partnership at $500+/month, confirmed at the developer portal on 2026-03-15. Ticketmaster's free Discovery API covers the same Atlantic Canada concert inventory.

The binding architectural constraint throughout v1.4 is the Vercel 60-second function timeout (extendable to 300s with Fluid Compute). Multi-page scraping is the highest-risk addition: each additional page requires a fetch plus Gemini call plus throttle delay, and adding pagination to half of the 26 sources can push job duration from ~110s to ~220s. The mitigation is a hard 3-page cap enforced in code (not configuration), per-domain rate limiting (not global delays), and monitoring `consecutive_failures` to detect sources timing out silently. A secondary risk is Ticketmaster ToS compliance: events must carry `source=ticketmaster` attribution, link back to the TM event page, and be treated as ephemeral (refreshed daily) rather than accumulated indefinitely.

---

## Key Findings

### Recommended Stack

The core stack is already in production and requires no changes for v1.4. No new npm packages are needed. Ticketmaster uses raw `fetch()`. Google JSON-LD parsing uses the existing `cheerio` dependency.

**Core technologies (existing, all correct for v1.4):**
- **Next.js 16.x**: Full-stack framework — Vercel-native cron, App Router Server Components, Fluid Compute (Hobby max duration 300s with Fluid Compute enabled)
- **Neon Postgres + Drizzle ORM 0.39.x**: Serverless Postgres; 7.4KB bundle vs Prisma's 40KB; critical for Vercel cold start performance
- **Vercel AI SDK 5.x + Gemini**: Provider-agnostic `generateObject()` with Zod schemas; fallback path when JSON-LD is absent
- **cheerio 1.x**: HTML parsing — used for JSON-LD `<script>` block extraction and static HTML preprocessing
- **leaflet.heat 0.2.0**: Canvas heatmap for timelapse mode (v1.1 feature, already deployed)
- **nuqs 2**: URL-persistent filter state for date, province, and category filters

**New dependency for v1.4:** None.

**Critical version constraints carried forward:**
- `react-leaflet@5.x` incompatible with `leaflet@2.x` — pin to `leaflet@1.9.x`
- `ai@5.x` has breaking changes from v4 — do not mix versions
- Export all Drizzle `pgEnum` definitions — confirmed open bug #5174, silently omitted from migration SQL otherwise
- `leaflet.heat` must only be imported inside `useEffect` or within a second `dynamic(..., { ssr: false })` boundary

See `.planning/research/STACK.md` for full alternatives matrix and version compatibility notes.

### Expected Features

**Must have for v1.4 launch (P1):**
- **Ticketmaster Discovery API** — Major Atlantic Canada venues (Scotiabank Centre Halifax, Avenir Centre Moncton) list events exclusively through TM; users notice these gaps. Free API, 5000 calls/day, 4 province queries/day is trivial against quota.
- **Multi-page scraping** — Current scraper silently drops events on pages 2+. Hard cap at 3 pages in code (not config) to stay within Vercel timeout.
- **Rate limiting** — Operational reliability: per-domain delay (2–5s jitter), Retry-After header handling, exponential backoff (2 retries). Pairs with multi-page support — build together.
- **Google Events JSON-LD extraction** — Pre-pass before Gemini: deterministic extraction for venues that embed `schema.org/Event` markup. Reduces Gemini calls. Tiered fallback (JSON-LD → Gemini) is the correct architecture.

**Should have for v1.4 (P2, add when P1 is stable):**
- **Scrape quality metrics** — Per-source tracking of `last_event_count`, `avg_confidence`, `consecutive_failures`, `total_scrapes`, `total_events_extracted` on `scrape_sources`. Admin dashboard surfaces health signals. High complexity (pipeline instrumentation + schema + UI).
- **Auto-approve high-confidence sources** — Score discovered candidates; auto-promote those scoring >= 0.8 (configurable env var). Reduces admin review queue. Medium complexity; reuses existing `promoteSource()` unchanged.

**Defer to v1.4.x / v2+:**
- TM venue deduplication cleanup (after first run identifies merge candidates)
- Quality metric alerting (email/log on consecutive failure threshold)
- JavaScript-rendered site scraping (requires self-hosted Playwright — blocked on Vercel Hobby 50MB function limit)
- SeatGeek API (viable Songkick alternative if concert coverage gaps emerge post-TM)

**Anti-features (do not build):**
- Songkick API — commercial license required, confirmed hobbyist access rejected
- Unlimited pagination — will cause Vercel timeout; hard cap at 3 pages
- Real-time Ticketmaster sync — 5000 call/day quota exhausted by per-request user traffic
- Headless browser on Vercel — 50MB function limit blocks Playwright/Puppeteer

See `.planning/research/FEATURES.md` for full API behavior details, dependency graph, and scrape quality metrics design.

### Architecture Approach

V1.4 extends the existing `source_type` dispatch pattern without structural changes. `orchestrator.ts` dispatches on `scrape_sources.source_type`; every new integration adds a handler module plus an `else if` branch. The most significant interface change in v1.4 is `fetcher.ts` returning `{ text: string; rawHtml: string }` instead of `string`, enabling the JSON-LD pre-pass. All schema changes are additive — new columns with defaults on existing tables, one migration file.

**Major components (v1.4 target state):**
1. **`orchestrator.ts`** — Source dispatch, HTTP throttle between venue_website sources, quality metric writes on success/failure paths
2. **`fetcher.ts`** — Rate-limited HTTP fetch with `fetchWithRetry()`, multi-page loop (3-page hard cap), returns `{ text, rawHtml }`
3. **`json-ld.ts`** (new) — Parse `<script type="application/ld+json">` for `@type: "Event"`; confidence = 1.0 (deterministic); falls through to Gemini when absent
4. **`ticketmaster.ts`** (new) — TM Discovery API handler: 4 province-scoped requests per cron run, venue find-or-create (ILIKE match on name + city), map TM `classifications` to 8-category enum, `upsertEvent()`
5. **`discovery-orchestrator.ts`** (modified) — Existing discovery pipeline + scoring pass + auto-promote for candidates scoring >= 0.8
6. **`schema.ts`** (modified) — 5 new columns on `scrape_sources`, 1 new column on `discovered_sources`; one Drizzle migration covers all

**Key patterns:**
- **Source type dispatch** — new API source = new `source_type` value + handler module + `else if` in orchestrator
- **Fast path before AI fallback** — JSON-LD first (zero LLM cost), Gemini only when absent; short-circuit if JSON-LD events found (never merge both)
- **Synthetic URL as config carrier** — `ticketmaster:province:NB` decoded by handler (precedent: `eventbrite:org:12345`, `bandsintown:artist:name`)
- **Additive schema only** — no destructive migrations on production data; all new columns have safe defaults

**Build order (dependency-aware, from ARCHITECTURE.md):**
1. Schema migration (prerequisite for all metric/score writes)
2. Rate limiting (no schema deps, validates independently)
3. Multi-page support (depends on schema for `max_pages` column; changes `fetcher.ts` return type)
4. JSON-LD extraction (depends on Step 3 for `rawHtml` return)
5. Scrape quality metrics (depends on schema; can run in parallel with Steps 2–4)
6. Ticketmaster integration (benefits from stable, instrumented pipeline; should be last)
7. Auto-approve discovery (depends on schema for `discovery_score`; independent of Steps 2–6)

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, exact code-level interfaces, and anti-patterns to avoid.

### Critical Pitfalls

**v1.4 — highest priority for this milestone:**

1. **Multi-page scraping breaches Vercel timeout** — Each page = additional fetch + Gemini call + throttle delay. With 26 sources, half with pagination averaging 3 pages, job duration roughly doubles to 220s. Prevention: hard cap at 3 pages in code (`Math.min(options?.maxPages ?? 1, 3)`), measure scrape duration in staging before deploying, consider splitting API integrations and web scraping into separate cron endpoints.

2. **Ticketmaster ToS requires attribution and TTL** — Events stored without `source=ticketmaster` flag or without link back to TM event page violates Terms of Use; key revocation is without notice. Prevention: mark all TM events with source column, display "via Ticketmaster" attribution, implement refresh TTL (re-fetch daily) rather than indefinite accumulation.

3. **Ticketmaster daily quota exhausted by naive pagination** — Fetching broadly by country and filtering client-side can exhaust 5000 calls/day in one run. Prevention: always filter by `countryCode=CA` + province `stateCode`, limit date window to 30 days, log running call count and alert at 80% quota (4000/5000).

4. **Rate limiting applied globally instead of per-domain** — Global delays serialize requests to different domains unnecessarily while still allowing rapid-fire hits to the same domain across paginated pages. Prevention: `Map<domain, lastRequestTime>` per-domain throttle; allow concurrent requests across different domains; add ±500ms jitter.

5. **Songkick access is gated behind a paid commercial partnership** — Confirmed as of 2026-03-15: $500+/month license required, hobbyist/indie access rejected. Do not build. Ticketmaster + Bandsintown (already integrated) cover the same Atlantic Canada concert use cases.

6. **JSON-LD extraction covers fewer than 20% of Atlantic Canada venues** — Small venues using basic WordPress or hand-coded HTML rarely implement schema.org markup. Prevention: audit the existing 26 venues for JSON-LD presence before scoping (expected: 3–6 out of 26), design as tiered fallback not primary strategy, never merge JSON-LD and Gemini results for the same source (causes duplicate events with conflicting confidence scores).

7. **Auto-approve threshold too low floods the scrape pipeline** — Setting threshold to 0.5 promotes aggregator pages, social profiles, and irrelevant sites that fail scraping, waste Gemini quota, and increment `consecutive_failures`. Prevention: keep threshold at 0.8; apply URL penalties in scoring heuristic (penalize `/events/`, `/tickets/` paths; heavily penalize `facebook.com`, `instagram.com`, `eventbrite.com` hostnames).

**v1.0–v1.2 pitfalls — still relevant, not resolved by v1.4 work:**

8. **LLM hallucinates dates and times** — Preserve "return null, do not infer or guess" discipline through any prompt updates. Adding new event types in v1.2 expanded prompt scope; validate updated prompts against real venue HTML before deploying.

9. **Leaflet.heat SSR build failure** — `import 'leaflet.heat'` at module top level causes `next build` failure even within `dynamic(..., { ssr: false })`. Always import inside `useEffect` or within a nested `dynamic()` boundary. Test with `next build && next start` after any HeatLayer change.

10. **Discovery pulls irrelevant pages swamping the scrape queue** — `discovered_sources` staging table + pre-screening quality gate is the mitigation (already built for v1.2). The v1.4 auto-approve threshold (0.8) reinforces this gate.

See `.planning/research/PITFALLS.md` for the complete 28-pitfall catalog organized by milestone.

---

## Implications for Roadmap

### v1.4 Phase Structure

Based on the build order verified against the codebase (ARCHITECTURE.md Steps 1–7), the v1.4 work groups into 4 phases:

#### Phase A: Schema Migration and Fetch Pipeline
**Rationale:** All metric writes, quality columns, and per-source pagination config depend on the new schema. Rate limiting and fetch improvements are pure code changes that validate independently and immediately benefit all 26 existing sources. These should be in production before any new API integrations are added.
**Delivers:** Drizzle migration adding 5 columns to `scrape_sources` and 1 column to `discovered_sources`; `fetchWithRetry()` with exponential backoff; per-domain rate limiting (`Map<domain, lastRequestTime>`); multi-page loop with 3-page hard cap; `fetcher.ts` returns `{ text, rawHtml }`; `json-ld.ts` new module; orchestrator updated to use all of the above.
**Addresses:** Multi-page scraping (P1), rate limiting (P1), Google JSON-LD extraction (P1)
**Avoids:** Timeout from pagination (3-page hard cap), bot blocking (per-domain rate limit + jitter), JSON-LD/Gemini result merging (short-circuit pattern)
**Research flag:** Standard patterns — well-documented. Codebase was directly inspected. No additional research needed.

#### Phase B: Scrape Quality Metrics and Admin Visibility
**Rationale:** Metric columns are created in Phase A schema. Instrumentation of the orchestrator and admin UI extension can proceed independently of new API integrations. Having metrics live before Ticketmaster adds new event volume means TM source health is tracked from day one.
**Delivers:** Success/failure metric writes in `orchestrator.ts` for all source types; `/admin` source list extended with `last_event_count`, `avg_confidence`, `consecutive_failures` columns; `consecutive_failures >= 3` highlighted as a health signal.
**Addresses:** Scrape quality metrics (P2)
**Avoids:** Measuring volume instead of accuracy — use confidence score distribution and field completeness, not just event count
**Research flag:** Standard patterns. Orchestrator instrumentation and admin table extension follow established code patterns.

#### Phase C: Ticketmaster Discovery API Integration
**Rationale:** Ticketmaster should go in after the pipeline is stable and instrumented. The handler follows the established `source_type` dispatch pattern. Venue find-or-create logic is the highest-complexity piece in v1.4; having quality metrics live means TM source health is visible immediately.
**Delivers:** `ticketmaster.ts` handler module; `else if (source_type === 'ticketmaster')` in `orchestrator.ts`; `TICKETMASTER_API_KEY` env var; 4 seed rows in `scrape_sources` (one per province); major Atlantic Canada ticketed events appearing in the map daily.
**Avoids:** Quota exhaustion (province-filtered queries + 30-day window + quota monitoring), ToS violations (source attribution + TTL strategy), venue duplicate sprawl (ILIKE find-or-create)
**Research flag:** Needs tactical validation — venue ILIKE matching for Atlantic Canada name variants (e.g., "Rebecca Cohn" vs. "Rebecca Cohn Auditorium") should be tested on TM response data before finalizing the normalization logic.

#### Phase D: Auto-Approve Discovery Pipeline
**Rationale:** Auto-approve touches `discovery-orchestrator.ts` and the `discovered_sources` schema (column added in Phase A). Can proceed after Phase A in parallel with Phase C. Benefits from Phase B quality metrics insights (actual confidence score distributions) to calibrate the 0.8 threshold before locking it in.
**Delivers:** `scoreCandidate()` scoring function in `discovery-orchestrator.ts`; `discovery_score` written to all inserted candidates; candidates >= 0.8 promoted automatically via existing `promoteSource()` (unchanged); `/admin/discovery` UI extended with `discovery_score` column.
**Avoids:** Over-aggressive auto-approve (URL and hostname penalties in scoring heuristic), promoting social/aggregator domains (explicit negative scoring for facebook.com, instagram.com, eventbrite.com)
**Research flag:** Threshold (0.8) is a starting recommendation with no canonical precedent for this exact use case. Plan a calibration review after first discovery run post-deployment.

### Phase Ordering Rationale

- Phase A schema migration is a hard prerequisite for all metric/score column writes — must be first and deployed before Phase B, C, or D work goes to production
- Rate limiting and multi-page are pure code changes that can be tested independently against existing sources without affecting any new integrations
- JSON-LD extraction depends on the `{ text, rawHtml }` return type change in Phase A `fetcher.ts`
- Phase B (quality metrics) and Phase D (auto-approve) are both independent of Phase C (Ticketmaster) after Phase A is complete — Phases B, C, D can proceed in parallel if capacity allows
- Ticketmaster integration is last among new integrations because it introduces venue find-or-create logic (novel for TM sources) and benefits from all pipeline improvements being stable
- Phase D auto-approve reuses `promoteSource()` unchanged — it is truly additive work with no risk to the existing promotion flow

### v1.0–v1.2 Phase Reference

The v1.0–v1.2 phase structure (Foundation, Scraping Pipeline, Cron Wiring, Events API, Map Frontend, Heatmap Core, Heatmap Validation, DB Migration, Extraction Extension, Category Filter, Discovery Pipeline, Source Promotion) is documented in the v1.2 version of this file and remains valid as historical context. Those phases are complete. V1.4 builds on their outputs.

### Research Flags

Phases with standard, well-documented patterns (no additional research needed):
- **Phase A (Schema + Pipeline):** Drizzle additive migrations, exponential backoff, and cheerio JSON-LD parsing are well-documented. Codebase extension points verified by direct inspection.
- **Phase B (Quality Metrics):** Column-level metric writes and admin UI table extension follow the existing `orchestrator.ts` and `/admin` patterns precisely.
- **Phase D (Auto-Approve):** Heuristic scoring and threshold-based promotion use `promoteSource()` unchanged. The pattern is clear from the existing discovery pipeline.

Phases needing tactical research or validation during planning:
- **Phase C (Ticketmaster):** Venue find-or-create with ILIKE matching needs validation against real TM response data for Atlantic Canada venue name variants. Run a single manual TM API call for one province and inspect the `_embedded.venues[]` response format before finalizing normalization logic.
- **Phase D calibration:** The 0.8 auto-approve threshold has no canonical precedent for this use case. Plan a post-deployment review after the first discovery run to evaluate auto-approve rate (target: 10–30% of candidates auto-promoted).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing production codebase; no new dependencies for v1.4; all v1.4 integrations use existing fetch/cheerio/Drizzle patterns |
| Features | MEDIUM-HIGH | Ticketmaster and Google JSON-LD are HIGH (verified official docs); Songkick confirmed commercial-only (HIGH); auto-approve heuristic threshold is MEDIUM (no canonical benchmark for this use case) |
| Architecture | HIGH | Based on direct codebase inspection 2026-03-15 + verified API documentation; build order is dependency-validated; code-level interfaces provided in ARCHITECTURE.md |
| Pitfalls | HIGH | Scraping/LLM pitfalls empirically grounded; Ticketmaster ToS and Songkick access status verified at source; Vercel timeout constraints verified via official docs; v1.0–v1.2 pitfalls remain HIGH from prior research |

**Overall confidence:** HIGH for execution plan; MEDIUM for auto-approve threshold calibration and JSON-LD adoption rate among the 26 target venues.

### Gaps to Address

- **JSON-LD coverage audit:** Before scoping Phase A JSON-LD work, manually fetch the 26 existing scrape source URLs and count those with `<script type="application/ld+json">` containing `@type: "Event"`. Expected count: 3–6. This calibrates expected Gemini call reduction and confirms the feature is worth the implementation cost. If the count is 0–2, deprioritize JSON-LD below Phase A and build it later.

- **TM venue name normalization edge cases:** First Ticketmaster scrape run will reveal how well ILIKE matching handles real Atlantic Canada venue name variants. Plan a cleanup pass after the first run to merge any duplicate venue rows created for the same physical location.

- **Vercel Fluid Compute status:** The discovery endpoint's `maxDuration` should be confirmed at 300s, but this requires verifying Fluid Compute is enabled in the Vercel project settings. Confirm before any discovery pipeline changes go to production.

- **Auto-approve threshold calibration:** The 0.8 threshold is a starting recommendation. After Phase D is live, review the percentage of candidates auto-approved vs. sent to manual review. If auto-approve rate is > 40% (potential noise), raise threshold. If < 5% (admin burden not reduced), lower slightly and add more granular URL signals.

- **Ticketmaster event volume for Atlantic Canada:** Unknown without running the API. After first run, check whether 4 province queries return < 200 events each (fits in one page) or require pagination (needs the API's `page` param, max `size × page < 1000`).

---

## Sources

### Primary (HIGH confidence)
- East Coast Local codebase direct inspection — `/src/lib/scraper/*`, `/src/lib/db/schema.ts`, `/src/app/api/cron/*`, `/src/app/admin/*` (2026-03-15)
- Ticketmaster Discovery API v2 official docs (developer.ticketmaster.com 2026-03-15) — endpoints, rate limits, geographic filtering, response format, stateCode values for Atlantic Canada
- Ticketmaster Terms of Use (ticketmaster.com 2026-03-15) — caching restrictions, commercial use prohibitions, attribution requirements
- Google Event Structured Data — Search Central docs (developers.google.com 2026-03-15) — required/recommended JSON-LD properties, extraction approach
- schema.org/Event — full schema definition for JSON-LD field mapping
- Songkick Developer Portal (songkick.com/developer 2026-03-15) — confirmed commercial partnership requirement, hobbyist access rejection, $500+/month license
- Vercel Fluid Compute official docs — maxDuration limits per plan, Hobby ceiling of 300s with Fluid Compute enabled
- Drizzle ORM pgEnum export bug #5174 — confirmed open issue, enum silently omitted from migration SQL

### Secondary (MEDIUM confidence)
- Web scraping pagination patterns (ScrapingAnt blog) — next-page link detection strategies, `rel="next"` and `aria-label` selectors
- Exponential backoff for scraping (TheWebScraping.club Substack) — retry strategy, jitter timing, Retry-After header handling
- Data quality in web scraping (Litport blog) — proxy metrics (field completeness, confidence score, duplicate rate) without ground truth
- Confidence threshold in AI systems (LlamaIndex glossary) — threshold-based auto-approval pattern and common calibration approaches
- Scraping quality metrics framework (witanworld.com 2026-02-02) — pipeline evaluation metrics for web scraping systems

### Tertiary (LOW confidence / needs runtime validation)
- **Auto-approve threshold at 0.8** — Inferred from standard binary classification threshold practices; no canonical threshold exists for venue discovery scoring at this scale. Treat as starting point; calibrate after first deployment.
- **JSON-LD adoption rate < 20% for Atlantic Canada venues** — Based on general structured data adoption research, not an audit of the actual 26 target sources. Audit before finalizing Phase A scope.
- **Ticketmaster Atlantic Canada event volume** — Unknown without running the API. Four province queries at `size=200` should cover the inventory, but pagination may be needed for larger provinces. Verify on first manual run.

---

*Research completed: 2026-03-15*
*Covers: v1.0 core scraping + map, v1.1 heatmap timelapse, v1.2 discovery + categorization, v1.4 API integrations + scraping improvements*
*Ready for roadmap: yes*
