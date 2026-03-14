# Project Research Summary

**Project:** East Coast Local — Atlantic Canada Event Discovery App
**Domain:** Regional event discovery platform with AI-powered scraping, interactive map, heatmap timelapse, automated source discovery, and event categorization
**Researched:** 2026-03-13 (v1.0 baseline) / 2026-03-14 (v1.1 heatmap timelapse, v1.2 discovery + categorization)
**Confidence:** HIGH (stack, architecture, pitfalls), MEDIUM (automated venue discovery approach)

---

## Executive Summary

East Coast Local is a serverless Next.js app that aggregates local event listings across Atlantic Canada (NB, NS, PEI, NL) via AI-powered web scraping, displays them on an interactive Leaflet map with pin-cluster and heatmap timelapse modes, and — in the v1.2 milestone — automatically discovers new venue sources and categorizes events by type. The project is already at v1.1 with 26 scraped venue sources, a working pin-cluster map, heatmap timelapse mode, and date/province filters in place. This research synthesizes all three milestone layers (v1.0 core, v1.1 heatmap, v1.2 discovery + categorization) with emphasis on v1.2, which is the current build target.

The recommended v1.2 approach is additive and non-breaking. It extends the existing Gemini extraction schema with a `category` enum field (adding classification to the same Gemini call, not a second pass), introduces a `discovered_sources` staging table as a quality gate before new venues enter the active scrape queue, and adds a second daily discovery cron that runs independently from the existing scrape cron. The category filter UI follows the established nuqs URL-state pattern applied client-side. No new npm packages are required — all v1.2 features extend existing infrastructure.

The primary risks are discovery quality (search results returning irrelevant pages that swamp the scrape queue) and LLM category drift (model returning labels outside the defined taxonomy). Both are solved architecturally: a `discovered_sources` staging table with a pre-screening quality gate prevents junk sources from reaching the scrape queue, and a closed `z.enum()` Zod constraint passed to `generateObject()` forces Gemini to produce only valid category values. The most critical implementation constraint is that the DB migration adding `event_category` and `discovered_sources` must ship first — everything else in v1.2 depends on it.

---

## Key Findings

### Recommended Stack

The core stack (Next.js 16 + Neon Postgres + Drizzle ORM + Vercel AI SDK + Gemini + react-leaflet) is already in production. V1.2 requires no new npm packages. Venue discovery uses the Gemini API's native Google Search grounding feature (`useSearchGrounding: true` in `@ai-sdk/google`) — no additional search API or key required. Category filtering extends the existing `nuqs` URL-state pattern. Google Places API (New) and Ticketmaster Discovery API are available as REST endpoints via raw `fetch()` for supplemental venue discovery if Gemini grounding proves insufficient.

**Core technologies:**
- **Next.js 16 + Vercel:** Full-stack framework — cron jobs, API routes, ISR, zero-config CI/CD; Fluid Compute now default on all plans (Hobby max duration 300s, not 60s)
- **Neon Postgres + Drizzle ORM 0.39.x:** Serverless Postgres with sub-500ms cold starts; TypeScript-first schema inference; pgEnum must be exported to appear in migrations (confirmed bug #5174)
- **Vercel AI SDK 5.x + Gemini 2.5 Flash:** `generateObject()` with Zod schemas; `useSearchGrounding` enables web-search-backed venue discovery with no extra credentials
- **react-leaflet 5.x + react-leaflet-cluster + leaflet.heat:** Pin cluster map and canvas heatmap; custom `useMap()` hook components (no wrapper libraries)
- **nuqs 2:** URL-persistent filter state for date, province, and category — `parseAsArrayOf(parseAsStringLiteral(...))` for multi-select category filter
- **cheerio 1.x + date-fns 4.x:** HTML preprocessing (10–25x token reduction) and timezone-aware date normalization (AST/ADT)
- **Tailwind CSS 4.x + shadcn/ui:** Styling and UI components — filter chip badges, event cards, detail pages

**Critical version constraints:**
- `react-leaflet@5.x` is incompatible with `leaflet@2.x` — pin to `leaflet@1.9.x`
- `ai@5.x` has breaking changes from v4 — do not mix versions
- Export all Drizzle `pgEnum` definitions; silently omitted from generated migrations otherwise (confirmed open bug #5174)
- `leaflet.heat` must only be imported inside a `useEffect` (never at module top level) or within a second `dynamic(..., { ssr: false })` boundary — it patches `window.L` at evaluation time

**Discovery APIs available (no new npm packages):**
- Gemini + Google Search grounding: existing `@ai-sdk/google` key, structured venue URL lists from web search
- Google Places API (New): raw `fetch()`, `GOOGLE_PLACES_API_KEY`; 5,000 free Pro SKU calls/month post-March 2025
- Ticketmaster Discovery API: raw `fetch()`, free, 5,000 calls/day; returns structured event data for Ticketmaster-listed events

### Expected Features

The v1.2 milestone is additive on an existing, deployed app. The scope is bounded.

**Must have (table stakes for v1.2 — missing these makes the milestone incomplete):**
- Category filter chips — horizontal chip row with "All" default and 8 category options; users expect this the moment events span music, comedy, theatre, and community
- Stable 8-category taxonomy (`live_music`, `comedy`, `theatre`, `festival`, `community`, `arts`, `sports`, `other`) — hard-coded enum, LLM-constrained, not free-form tags
- Category badge on event cards and detail pages — categories are meaningless if not surfaced on events
- New sources discovered and appearing without code changes — this is the milestone promise; requiring manual seeding defeats the feature
- "All" / clear filter option — no filter-chip UI ships without it

**Should have (differentiators):**
- AI-assigned categories at extraction time via extended `ExtractedEventSchema` — same Gemini call, zero extra cost
- Automatic venue discovery via Gemini Google Search Grounding — scoped to Atlantic Canada cities, candidates staged in `discovered_sources` for review
- Human review gate before new sources go live — `pending_review` status prevents junk from hitting the scrape queue and burning Gemini quota

**Defer to v1.2.x / v2+:**
- Multi-select category filter (single-select sufficient for v1.2 launch)
- Category-aware heatmap mode
- Full auto-approval for high-confidence discovered sources
- Category subcategories (Jazz, Celtic under Live Music) — only valuable at higher event volume
- User-submitted venues — requires moderation infrastructure explicitly out of scope
- Discovery coverage reporting

### Architecture Approach

V1.2 adds two concerns to the existing pipeline at well-defined seams. The existing scrape cron, `/api/events` route, `EventList`, and map components require minimal modification. The `event_category` column flows through automatically via `db.select()` (returns all columns) and Drizzle's `InferSelectModel`.

**Major components (v1.2 additions and modifications):**

1. **`discovered_sources` table (NEW)** — staging area for candidate venues found by discovery; `status: pending | approved | rejected | duplicate`; deduplication gate before promotion to `scrape_sources`
2. **Discovery pipeline (NEW)** — `/api/cron/discover` at 04:00 UTC; `discovery-orchestrator.ts` iterates Atlantic Canada cities; `discoverer.ts` calls Gemini with Google Search grounding; deduplicates against existing sources by domain; inserts to `discovered_sources`
3. **Promotion mechanism (NEW)** — script or minimal admin endpoint; moves approved `discovered_sources` rows to `venues` + `scrape_sources`; explicit gate for quality control
4. **Extended `ExtractedEventSchema` (MODIFIED)** — adds `event_category: z.enum([...]).nullable()` to the existing Zod schema; extractor prompt updated to remove "live music only" constraint and add category classification instruction
5. **`normalizer.ts` (MODIFIED)** — writes `event_category` in INSERT values and ON CONFLICT SET (enables backfill on re-scrape)
6. **Category filter (MODIFIED)** — new `?category=` nuqs param in `EventFilters.tsx`; `filterByCategory()` utility applied in `HomeContent` filter chain to both sidebar and map layer (both must receive the same filtered set)

**Build order (strict dependency sequence):**
1. DB migration — `event_category` column on `events`, `discovered_sources` table (prerequisite for everything)
2. `ExtractedEventSchema` extension + `extractor.ts` prompt update (parallelizable with step 6)
3. `normalizer.ts` write of `event_category` (depends on steps 1 + 2)
4. `filterByCategory()` utility (pure function, no deps — can be done anytime)
5. `EventFilters.tsx` + `HomeContent` category filter wiring (depends on step 4)
6. `discoverer.ts` + `discovery-orchestrator.ts` (depends on step 1 for `discovered_sources` table; independent of steps 2–5)
7. `/api/cron/discover` route + `vercel.json` cron entry (depends on step 6)
8. Promotion mechanism (depends on step 7 having produced real `discovered_sources` data)

### Critical Pitfalls

**v1.2 — Discovery and categorization (top priority for this milestone):**

1. **Discovery pulls irrelevant pages that swamp the scrape queue** — Use `discovered_sources` staging table; pre-screen candidates with keyword check before any Gemini call; run a single Gemini Flash-Lite YES/NO call ("does this page list upcoming events with specific dates?") before promoting; cap discovery batch at 10 candidates per cron run regardless of search result count.

2. **AI category labels drift across scrape runs** — Enforce the taxonomy via `z.enum([...])` in the Zod schema passed to `generateObject()`; validate returned category against allowlist post-extraction; map any invalid value to `'other'`; store slugs in DB, resolve to display labels in the frontend only.

3. **Categorization added as a separate Gemini call** — Add `event_category` to `ExtractedEventSchema`; extract and classify in the same call. A separate categorization pass doubles Gemini call count, doubles scrape duration, and risks Vercel function timeout.

4. **Drizzle `pgEnum` not exported from schema file** — Confirmed open bug (#5174): `pgEnum` not exported from `schema.ts` is silently omitted from migration SQL, causing deploy-time "type does not exist" failure. Always `export const` every enum.

5. **Discovery cron hitting function timeout** — Use a separate `/api/cron/discover` route with `export const maxDuration = 300`. Confirm Fluid Compute is enabled in Vercel project settings. Do not reuse the existing scrape cron. The existing `maxDuration = 60` in the scrape cron was set before Fluid Compute and is artificially conservative — update it, but keep the routes separate.

6. **Existing events have null category after migration** — Plan a one-time backfill script as part of the Phase 2 deliverable. Run it immediately after migration deploys, before the feature is announced. Without it, category filter returns zero results until the next scrape cycle.

7. **Duplicate venues discovered from multiple search queries** — Dedup at candidate insertion: extract and normalize the domain from each discovered URL; check if a venue with that domain already exists in `venues` table; if yes, link to existing venue instead of creating a duplicate. Add unique constraint on `venues.website` domain.

8. **Map and sidebar showing different filtered sets after category filter** — Apply `filterByCategory()` to both `sidebarEvents` and the events passed to `MapClientWrapper`. Derive `mapEvents = filterByCategory(allEvents, category)` separately. Map and sidebar must always show the same filtered set.

**v1.0/v1.1 — still relevant (not resolved by v1.2 work):**

9. **LLM hallucinates dates and times** — The v1.2 extractor prompt update must preserve the "return null, do not infer or guess" discipline. Removing the "live music only" constraint expands scope — re-validate that the updated prompt still produces null for ambiguous dates, not guesses.

10. **Leaflet.heat SSR build failure** — `import 'leaflet.heat'` at module top level causes `next build` failure even within `dynamic(..., { ssr: false })` wrapper. Import inside `useEffect` or keep `HeatmapLayer` in a second `dynamic()` boundary. Test with `next build && next start` immediately on any HeatLayer change.

---

## Implications for Roadmap

### Phase 1: Foundation and Database Schema (v1.0)
**Rationale:** Schema decisions are expensive to change once data is written. Dedup key, geocoding placement, and `event_date` index must be resolved before any scraping starts.
**Delivers:** Scaffolded Next.js + Vercel + Neon + Drizzle; `events`, `venues`, `scrape_sources` tables; migrations running; `event_date` index; geocoder selected.
**Avoids:** Duplicate events (upsert key defined upfront), stale events (date index + cleanup job), geocoding failures (paid geocoder with confidence threshold)
**Research flag:** Standard patterns — well-documented Drizzle + Neon setup. No additional research needed.

### Phase 2: Scraping Pipeline and Data Ingestion (v1.0)
**Rationale:** No display without data. Build fetch → extract → normalize → geocode → upsert as isolated library functions before wiring to cron. LLM quality and token cost pitfalls must be addressed here — retrofitting is expensive.
**Delivers:** Working scraper on 5+ real Atlantic Canada venue URLs; GPT-4o mini / Gemini extraction; upsert; token logging.
**Avoids:** LLM date hallucination (nullable fields, null-rejection), token cost explosion (cheerio preprocessing), geocoding failures (paid geocoder).
**Research flag:** Needs deeper research during planning — LLM extraction prompt design for heterogeneous Atlantic Canada venue HTML is non-trivial.

### Phase 3: Cron Wiring and Automated Rescan (v1.0)
**Rationale:** Thin integration step after scraper library works end-to-end. Validates full pipeline against Vercel timeout constraints.
**Delivers:** `/api/cron/scrape` route, `vercel.json` cron config, per-source error isolation, source health logging.
**Research flag:** Standard patterns — Vercel cron docs are HIGH confidence.

### Phase 4: Events API (v1.0)
**Rationale:** Frontend cannot be built without read-only endpoints. Default filter enforces `event_date >= NOW()` at query layer.
**Delivers:** `GET /api/events`, `GET /api/events/[id]`, `GET /api/venues`; future events only.
**Research flag:** Standard patterns. No additional research needed.

### Phase 5: Map Frontend and Event Display (v1.0)
**Rationale:** With real geocoded events and a working API, the map and list can be built and validated with actual data.
**Delivers:** Interactive map with clustered pins, event list with date/province filter and viewport sync, event detail panel, mobile-responsive.
**Research flag:** Standard patterns. react-leaflet CSS import requirement for cluster is documented in STACK.md.

### Phase 6: Heatmap Timelapse Core (v1.1)
**Rationale:** Builds on existing map foundation. SSR guard verification must happen before any animation logic is written.
**Delivers:** Mode toggle, heatmap renders for current 24-hour time window, 30-day timeline scrubber, play/pause animation, time label, sidebar synced to time window.
**Avoids:** SSR build failure (HeatLayer in dynamic import boundary), animation memory leak (useRef + useLayoutEffect cleanup), timePosition in URL (useState only), sidebar desync.
**Research flag:** Research complete and HIGH confidence. ARCHITECTURE.md provides exact implementation patterns.

### Phase 7: Heatmap Validation and Interaction (v1.1)
**Rationale:** After core timelapse works, add click-through and validate against the PITFALLS.md checklist. Mobile scrubber behavior and heap stability are highest-risk items.
**Delivers:** Click-through from hotspot (spatial lookup, not HeatLayer click handler), animation speed control, full pitfalls checklist verified, mobile-validated.
**Research flag:** PITFALLS.md provides the complete verification checklist.

### Phase 8: DB Migration and Category Schema (v1.2 Gate)
**Rationale:** Hard gate for all v1.2 work. No other v1.2 phase can produce useful output without the schema in place. Ship independently.
**Delivers:** `event_category TEXT` on `events` table; `discovered_sources` table; Drizzle migration files; verified in production Neon; backfill script ready to run immediately post-deploy.
**Avoids:** pgEnum export bug (use `text` column for flexibility, or correctly export enum), null category on existing events at feature launch.
**Research flag:** Standard patterns — additive migration is low-risk. Backfill cost estimate: ~5,000 events × 200 tokens ≈ 1M tokens at Gemini Flash pricing, well under $1.

### Phase 9: AI Extraction Extension + Categorization (v1.2)
**Rationale:** Extends the working scraper without new infrastructure. Highest value-to-effort ratio of all v1.2 phases.
**Delivers:** `event_category` written on all newly scraped events; extractor prompt updated to include all event types (not just live music); `normalizer.ts` stores category via ON CONFLICT DO UPDATE (backfills on re-scrape).
**Avoids:** Two-Gemini-call anti-pattern (one call extracts and classifies), category drift (`z.enum()` constraint), LLM date hallucination regression (preserve null-over-guess discipline through prompt rewrite).
**Research flag:** No additional research needed — STACK.md and ARCHITECTURE.md provide exact Zod schema extension and prompt update patterns.

### Phase 10: Category Filter UI (v1.2)
**Rationale:** Can be built with mock/null category data while Phase 9 populates real categories. Clean nuqs extension.
**Delivers:** Horizontal chip row in `EventFilters`, `?category=` nuqs param, `filterByCategory()` utility applied to both sidebar and `MapClientWrapper`, category badge on event cards and detail pages.
**Avoids:** Map/sidebar desync (both receive the same `filterByCategory(allEvents, category)` result).
**Research flag:** Standard patterns — identical to existing nuqs date/province filter implementation.

### Phase 11: Venue Discovery Pipeline (v1.2)
**Rationale:** Independent of Phases 9–10 (only requires `discovered_sources` table from Phase 8). Highest complexity deliverable in v1.2.
**Delivers:** `/api/cron/discover` route with `maxDuration = 300`; `discoverer.ts` with Gemini + Google Search grounding; domain-based deduplication; insertion to `discovered_sources` with `pending` status; `vercel.json` discovery cron entry at 04:00 UTC.
**Avoids:** Discovery timeout (separate route, maxDuration 300), irrelevant page accumulation (pre-screening quality gate), duplicate venue creation (domain-based dedup at candidate insertion).
**Research flag:** Needs validation — Gemini grounding output structure for venue URL discovery should be tested on a single city (Halifax) before building the full orchestrator. Verify that `@ai-sdk/google` exposes `useSearchGrounding` in the current installed version.

### Phase 12: Source Promotion and First Discovery Validation (v1.2)
**Rationale:** Requires Phase 11 to have run and populated `discovered_sources` with real data before promotion mechanics can be validated against actual candidates.
**Delivers:** Promotion script or minimal admin endpoint; first real discovered venues promoted to `scrape_sources`; discovery query tuning based on first-run false positive rate.
**Research flag:** No canonical pattern at this scale — prototype and iterate based on actual discovery output quality.

### Phase Ordering Rationale

- **Phase 8 is a hard gate for all v1.2 work:** Schema first, always. Ship independently.
- **Phases 9 and 10 are parallelizable after Phase 8:** Extractor changes improve the existing scraper immediately (high value, low risk). The UI can be built with mock data while waiting for real categories.
- **Phase 11 is independent of Phases 9–10:** Discovery does not depend on categorization. Both tracks can run in parallel after Phase 8.
- **Phase 12 gates on real discovery data:** Promotion logic can be designed in Phase 11, but must be validated against actual `discovered_sources` rows from a real discovery run.
- **Backfill (Phase 8 deliverable) must run before feature is announced:** Not a deferred task — include in Phase 8 definition of done.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Scraping Pipeline):** LLM extraction prompt engineering for heterogeneous Atlantic Canada venue HTML; geocoder selection and pricing for ~50–200 venues.
- **Phase 11 (Discovery Pipeline):** Gemini grounding output structure for venue URL discovery needs empirical validation on a single city before building the full orchestrator. Also confirm `useSearchGrounding` availability in current `@ai-sdk/google` version.

Phases with complete research (reference existing files, no additional research needed):
- **Phase 1 (Foundation):** Drizzle + Neon setup well-documented.
- **Phase 3 (Cron Wiring):** Vercel cron docs are HIGH confidence.
- **Phase 4 (Events API):** Standard Next.js Route Handler + Drizzle read queries.
- **Phase 5 (Map Frontend):** react-leaflet + react-leaflet-cluster patterns well-documented.
- **Phase 6 (Heatmap Core):** ARCHITECTURE.md provides exact implementation patterns.
- **Phase 7 (Heatmap Validation):** PITFALLS.md provides the complete verification checklist.
- **Phase 8 (DB Migration):** Additive migration, low-risk, established pattern.
- **Phase 9 (Extraction Extension):** STACK.md and ARCHITECTURE.md provide exact Zod schema extension pattern.
- **Phase 10 (Category Filter UI):** Identical to existing nuqs date/province filter.
- **Phase 12 (Source Promotion):** Prototype-and-iterate based on real discovery output.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack in production; v1.2 additions verified via official docs and npm registry. AI SDK 5 `generateObject` pattern is well-documented. No new packages needed. |
| Features | HIGH (categorization + filter), MEDIUM (discovery) | Category taxonomy and filter UX are established patterns. Automated venue discovery via Gemini grounding has no canonical precedent — the approach is architecturally sound but real-world yield in Atlantic Canada is unverified. |
| Architecture | HIGH | Based on direct codebase inspection; integration points are verified, not inferred. Build order respects strict dependency chain. |
| Pitfalls | HIGH | v1.0–v1.1 pitfalls empirically grounded; v1.2 pitfalls verified via Vercel docs, confirmed open issues, Gemini API pricing docs, and LLM drift empirical research. |

**Overall confidence:** HIGH for execution plan; MEDIUM for discovery pipeline real-world yield in Atlantic Canada specifically.

### Gaps to Address

- **Gemini grounding output quality for venue discovery:** The model may return inconsistent structure, non-Atlantic results, or duplicate domains across city queries. Test on a single city (Halifax) and inspect raw output before building the orchestrator. Budget for 1–2 prompt iteration cycles.

- **Google Places API field mask billing:** Research notes requesting only Basic fields may qualify for lower billing. Validate the actual field mask + billing tier before using at scale. This API is a fallback if Gemini grounding underperforms — may not be needed at all.

- **Category backfill scope and cost:** Estimate ~5,000 events × 200 tokens ≈ 1M tokens at Gemini Flash pricing ≈ well under $1. Validate before running. Run immediately post-migration, before feature announcement.

- **Discovery cron cadence:** Research recommends daily (04:00 UTC), but Atlantic Canada's venue landscape doesn't change daily. Weekly cadence may be more appropriate initially. Confirm with team before locking in `vercel.json` schedule.

- **LLM extraction prompt regression:** The v1.2 prompt update removes the "live music only" constraint. Re-validate that the updated prompt still produces null for ambiguous dates and correctly handles all-event-type HTML (breweries running markets, theatres running both plays and concerts, etc.). Run against 5–10 real venue URLs before deploying.

- **Animation performance at higher event volume:** The pre-bucketing optimization (O(1) lookup instead of O(n) `Array.filter` per animation frame) is documented as the escape hatch. At current Atlantic Canada scale (hundreds of events), `Array.filter` is fine. Revisit if event count grows past ~500 events in the 30-day window.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection (`src/lib/scraper/`, `src/lib/db/schema.ts`, `src/app/api/cron/`, `src/components/`, `vercel.json`) — existing architecture, verified integration points
- `npm info react-leaflet`, `npm info leaflet.heat`, `npm info @types/leaflet.heat`, `npm info react-leaflet-cluster` — version and compatibility verification
- [react-leaflet Core Architecture docs](https://react-leaflet.js.org/docs/core-architecture/) — `useMap` hook, `useLayerLifecycle`, official patterns
- [Leaflet.heat GitHub (Leaflet org)](https://github.com/Leaflet/Leaflet.heat) — `setLatLngs()` API, canvas rendering, Issue #61 (no click events)
- [Vercel Fluid Compute docs](https://vercel.com/docs/fluid-compute) — Hobby 300s max duration confirmed
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby plan: 100 cron jobs, once per day
- [Drizzle ORM pgEnum export bug #5174](https://github.com/drizzle-team/drizzle-orm/issues/5174) — confirmed open issue, enum silently omitted from migration SQL
- [Google Places API (New): Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search) — place types, field masks, pricing
- [Ticketmaster Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) — Atlantic Canada stateCode filter, 5,000 calls/day free
- [Gemini API Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) — grounding as first-class Gemini API feature
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) — enum constraints in schema for classification tasks
- [nuqs parseAsArrayOf docs](https://nuqs.dev/) — multi-select URL state pattern
- [Vercel AI SDK: generateObject](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — Zod enum output constraint

### Secondary (MEDIUM confidence)
- [Drizzle vs Prisma 2026 comparison (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) — cold start benchmarks, bundle sizes
- [AI SDK Core: generateObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — structured output API (docs in transition for AI SDK 5)
- [kepler.gl Time Playback docs](https://docs.kepler.gl/docs/user-guides/h-playback) — speed control patterns
- [nuqs GitHub (47ng/nuqs)](https://github.com/47ng/nuqs) — browser rate-limit on URL updates
- [Frontend Memory Leaks empirical study (stackinsight.dev)](https://stackinsight.dev/blog/memory-leak-empirical-study/) — 86% missing cleanup; ~8 KB/cycle rAF leak quantification
- [Eventbrite location search removal](https://groups.google.com/g/eventbrite-api/c/ZD9rP1dQGag) — confirmed via community report and absence from current API docs
- [Bandsintown API documentation](https://help.artists.bandsintown.com/) — region search unavailable, new key applications suspended
- [Filter UI Design Best Practices](https://www.insaim.design/blog/filter-ui-design-best-ux-practices-and-examples) — chip-based filter patterns, "Clear All" convention
- [react-leaflet GitHub Issue #941](https://github.com/PaulLeCam/react-leaflet/issues/941) — layer leak on unmount without explicit `removeLayer`
- [WCAG 2.2 SC 2.5.7 — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — native range input requirement

### Tertiary (informational / needs runtime validation)
- [PredictHQ Event Categories](https://www.predicthq.com/intelligence/data-enrichment/event-categories) — informed decision to use small flat taxonomy vs. 19+ categories
- [DEV: Tech Event Discovery Platform](https://dev.to/danishaft/how-i-built-a-tech-event-discovery-platform-with-real-time-scraping-3o4f) — confirmed no existing platform does automated venue discovery; all rely on curated or self-submitted sources
- [OpenAI pricing](https://openai.com/api/pricing/) — GPT-4o mini token costs (subject to change; Gemini now primary)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) — 1 req/sec public limit; confirms must use paid geocoder for production

---

*Research completed: 2026-03-14*
*Covers: v1.0 core scraping + map, v1.1 heatmap timelapse, v1.2 discovery + categorization*
*Ready for roadmap: yes*
