# Project Research Summary

**Project:** East Coast Local — Atlantic Canada live music discovery app
**Domain:** Local events aggregation + interactive map + heatmap timelapse visualization
**Researched:** 2026-03-13 (v1.0 baseline) / 2026-03-14 (v1.1 heatmap timelapse additions)
**Confidence:** HIGH (stack and architecture), MEDIUM (AI scraping approach and geocoding)

---

## Executive Summary

East Coast Local is a hyper-local live music discovery app for Atlantic Canada (NB, NS, PEI, NL) built on Next.js 16 / Vercel / Neon Postgres. The core v1.0 product — pin-cluster map, event list sidebar, AI-powered scraping pipeline — has been researched and is partially implemented. The v1.1 milestone adds a heatmap timelapse mode: an alternative map visualization controlled by a 30-day timeline scrubber that shows event density shifting across time. The mode sits alongside the existing cluster view as a toggle, not a replacement. No new API endpoints, database schema changes, or server infrastructure are required for v1.1 — all time-window filtering runs client-side against the already-loaded event dataset using `useMemo` and `Array.filter`.

The recommended implementation for v1.1 uses `leaflet.heat` 0.2.0 directly via a custom `useMap()` + `useEffect()` component (not a third-party wrapper — all existing wrappers target react-leaflet v3/v4 and are incompatible with react-leaflet 5.x). Time position is stored as a normalized 0–1 float in React `useState`, never in the URL. The sidebar event list syncs to the current time window through the same mode-aware filter chain in `HomeContent` that already drives the cluster view. `EventList` itself requires no changes — it receives `sidebarEvents` regardless of mode.

The highest-risk areas are architectural, not visual: (1) the SSR build failure that `leaflet.heat` triggers when imported at module top level in Next.js must be verified to not exist before any animation logic is written; (2) `leaflet.heat` renders to a flat canvas with no click events — click-through from heatmap hotspots requires a parallel invisible `CircleMarker` layer, not a click handler on the HeatLayer; (3) animation state (`timePosition`, `isPlaying`) must not be routed through nuqs URL state, which cannot keep up with 5-updates-per-second playback. All three are discoverable only through the research — they are not visible from the API surface.

---

## Key Findings

### Recommended Stack

The stack is fully determined and version-pinned. Next.js 16 with Turbopack, React 19.2, TypeScript 5.x, Neon Postgres with Drizzle ORM, and Vercel AI SDK 5.x form the core. Drizzle is specifically chosen over Prisma to avoid the 1–3 second cold start penalty from Prisma's query engine binary on Vercel serverless functions. The map layer is react-leaflet 5.x + react-leaflet-cluster for pin view, and `leaflet.heat` 0.2.0 (with `@types/leaflet.heat` 0.2.5) for the heatmap. Both map layer components use the custom `useMap()` + `useEffect()` pattern from react-leaflet's core architecture docs, not any third-party wrapper.

For v1.1, no new UI library is needed. The timeline scrubber is a native `<input type="range">` styled with Tailwind — not a custom div slider, which would fail WCAG 2.2 SC 2.5.7 (Dragging Movements, Level AA). The animation loop uses `setInterval` at 200ms (not `requestAnimationFrame` — intentionally lower frequency to prevent 60 React re-renders per second during playback). Time-window filtering uses `date-fns` (already in stack) and `Array.filter` on the in-memory dataset.

**Core technologies:**
- **Next.js 16 + React 19.2:** Full-stack framework — App Router, Server Components, native Vercel cron wiring, zero-config deployment
- **Neon Postgres + Drizzle ORM 0.39.x:** Serverless database + lightweight ORM — sub-500ms cold starts vs. Prisma's 1–3s, TypeScript-first schema inference
- **Vercel AI SDK 5.x + GPT-4o mini:** Event extraction pipeline — `generateObject()` with Zod schemas produces typed, validated JSON from stripped HTML
- **react-leaflet 5.x + react-leaflet-cluster:** Interactive pin-cluster map — free OSM tiles, no per-load API cost, cluster supports 10k–50k markers
- **leaflet.heat 0.2.0:** Canvas heatmap layer — official Leaflet org plugin, `setLatLngs()` for dynamic updates without destroying/recreating the canvas element
- **cheerio 1.x:** HTML preprocessing before LLM — strips scripts/styles/nav/footer to reduce token count 10–25x
- **Tailwind CSS 4.x + shadcn/ui:** Styling and UI component primitives — zero runtime overhead, React 19 compatible
- **date-fns 4.x:** Date normalization and timezone handling (Atlantic time, AST/ADT)

**Critical version constraints:**
- Do NOT use `leaflet@2.x` — react-leaflet 5.x is not yet compatible; pin to `leaflet@1.9.x`
- Do NOT mix AI SDK v4 and v5 — breaking API changes between versions
- Do NOT use `react-leaflet-markercluster` (unmaintained) — use `react-leaflet-cluster`
- Do NOT use any react-leaflet heatmap wrapper package — all target v3/v4; build directly with `useMap()`

### Expected Features

The v1.0 foundation (pin map, sidebar, scraping) covers the table-stakes discovery experience. The v1.1 heatmap timelapse adds a time-dimension visualization mode. Feature research was validated against windy.com, kepler.gl, and ArcGIS Time Slider as reference tools.

**Must have (v1.0 — already researched/building):**
- AI-powered scraping with configurable venue source list
- Event data storage with geocoded venue coordinates
- Interactive map with pin clustering across all 4 Atlantic provinces
- Event list sidebar with date and province filters, viewport-synced
- Event detail page with performer, venue, date/time, and source link
- Scheduled nightly rescan via Vercel cron
- Mobile-responsive UI

**Must have (v1.1 — heatmap timelapse MVP):**
- Mode toggle: pin/cluster view vs. heatmap timelapse view (mutually exclusive)
- Heatmap layer rendering event density for current 24-hour time window
- Timeline scrubber covering 30-day range (native `<input type="range">`, keyboard accessible)
- Play / pause animation with 6-hour step size and loop at 30-day end
- Current time position label (human-readable day + time, not epoch)
- Sidebar event list synced to current time window (updates within 250ms of time position change)
- Step forward / backward buttons flanking play button
- Empty time window state message ("No events in this time window")

**Should have (v1.1.x — add after core timelapse validated):**
- Click-through from heatmap hotspot to events (spatial proximity lookup, NOT a HeatLayer click handler)
- Animation speed control (slow/medium/fast presets — windy.com's lack of this is a top user complaint)
- Sidebar event count + time context label ("12 events — Friday evening")

**Defer (v2+):**
- Configurable time window size (24h hard-coded for v1.1)
- Keyboard shortcuts (spacebar play/pause, arrow keys step)
- Permalink to specific time position in URL (requires URL state for ephemeral animation position)
- Genre filtering, artist profiles, PWA, user accounts, in-app ticketing

**Explicit anti-features (documented rationale for not building):**
- Heatmap as default view — event data is too sparse in rural NL/PEI; heatmap over sparse data communicates nothing
- Province/location filters active during heatmap mode — geographic heatmap + geo-filter creates invisible restriction that contradicts the map
- Per-hour time steps — event data only has date + rough time; per-hour steps create false precision
- Animated particle trails — meaningful for continuous phenomena (wind); misleading for discrete events (gigs)

### Architecture Approach

The existing architecture is a single `HomeContent` client component that owns all state and passes derived data down to `MapClientWrapper` (Leaflet, loaded via `dynamic(..., { ssr: false })`) and `EventList`. For v1.1, three new state variables are added to `HomeContent` (`mapMode`, `timePosition`, `isPlaying`), and the filter chain becomes mode-aware: in cluster mode it uses the existing nuqs URL state (date, province, bounds); in timelapse mode it replaces date/province filters with a time-window filter derived from `timePosition` normalized float. The sidebar receives `sidebarEvents` regardless of mode — no internal changes to `EventList`.

The most important architectural constraint is the SSR boundary. ALL Leaflet-related code — including `leaflet.heat` — must remain inside the `ssr: false` dynamic import boundary. `leaflet.heat` patches the global `L` object at module evaluation time and will cause `ReferenceError: window is not defined` at `next build` if imported at module top level anywhere in the component tree.

**Major components (v1.1 additions and modifications):**
1. `HomeContent` (page.tsx) — state owner for `mapMode`, `timePosition`, `isPlaying`; mode-aware filter chain for `sidebarEvents`; `heatPoints` via `useMemo`; `setInterval` play loop managed by `useRef`
2. `HeatmapLayer.tsx` — imperative `useMap()` + `useEffect()` wrapper around `leaflet.heat`; accepts pre-computed `{lat, lng, intensity}[]` points; calls `setLatLngs()` for updates (no DOM re-creation); must be inside the `ssr: false` boundary
3. `HeatmapClickLayer.tsx` — invisible `CircleMarker` components at venue positions; the ONLY mechanism for click events in heatmap mode (HeatLayer canvas has no click support)
4. `TimelineBar.tsx` — native `<input type="range">` scrubber, play/pause `<button>`, time label; lives outside `MapContainer` as an overlay div inside the map panel
5. `ModeToggle.tsx` — single button in header switching `mapMode` between `'cluster'` and `'timelapse'`
6. `lib/timelapse-utils.ts` — pure functions: `positionToTimestamp`, `filterByTimeWindow`, `computeVenueHeatPoints`; no dependencies; build and test first

**Build order for v1.1 (strict dependency sequence):**
1. `lib/timelapse-utils.ts` → pure functions, no deps, fully testable
2. `HeatmapLayer.tsx` → verify `next build` passes before any animation logic
3. `TimelineBar.tsx` + `ModeToggle.tsx` → pure UI, stub props/callbacks
4. `HeatmapClickLayer.tsx` → invisible CircleMarkers at venue positions
5. `HomeContent` wiring → state, play interval, `useMemo` chains, mode-aware filter
6. `MapClient.tsx` + `MapClientWrapper.tsx` → prop threading, conditional layer rendering
7. Integration testing → full checklist from PITFALLS.md

### Critical Pitfalls

**v1.0 — Scraping pipeline:**

1. **Chromium binary blows Vercel's 50MB function size limit** — Playwright/Puppeteer's Chromium binary is ~280MB. Never run headless browser scraping inside a Vercel function. Decouple to a separate process (GitHub Actions scheduled workflow, Fly.io) that writes results to Neon. The Vercel app reads from DB only.

2. **LLM hallucinates dates and times not present on the page** — JSON schema mode constrains format, not factual accuracy. Instruct explicitly: "If a field is not clearly present, return null — do not infer or guess." Use nullable schema fields. Post-process: reject events with null dates; sanity-check that date is in future and within 90 days.

3. **Token costs scale unexpectedly with raw HTML** — A single venue page can be 50,000–100,000 tokens. Strip `<script>`, `<style>`, nav, footer before sending to LLM. `mozilla/readability` or targeted cheerio selectors reduce token count 10–25x. Log per-run token usage and alert above $1/run.

4. **Duplicate events from multiple sources** — The same show scraped from venue site + Eventbrite + Bandsintown = 3 database rows = 3 map pins. Design a composite deduplication key at schema time: `normalize(venue_name) + normalize(event_date) + normalize(performer)`. Use upsert. Add before ingesting from a second source — retrofitting is painful.

5. **Geocoding failures for Atlantic Canada addresses** — Nominatim public API prohibits production use and has limited coverage of small Maritime addresses. Use OpenCage, Google Maps Geocoding, or Positionstack. Geocode once at venue creation time; store lat/lng on the `venues` record; allow manual lat/lng override for problematic addresses.

**v1.1 — Heatmap timelapse:**

6. **`leaflet.heat` has no click-through support** — The HeatLayer renders to a flat canvas with no spatial index. GitHub issue #61 (open since the plugin began) confirms this will never change. Never attach click handlers to the HeatLayer. Implement click-through via `HeatmapClickLayer` — invisible `CircleMarker` components at venue positions that receive native Leaflet click events.

7. **SSR build failure from `leaflet.heat` import** — `leaflet.heat` calls `window` and `document` at module evaluation time. Never `import 'leaflet.heat'` at module top level. Import inside `useEffect` with `await import('leaflet.heat')`, or keep `HeatmapLayer` inside a second `dynamic(..., { ssr: false })` boundary. Test `next build && next start` immediately after `HeatmapLayer` setup — before any animation logic.

8. **Animation loop memory leak on mode toggle** — The rAF/interval ID must be stored in `useRef`, never a local variable. Use `useLayoutEffect` for synchronous cleanup. Always call `map.removeLayer(heatLayerRef.current)` in `useEffect` cleanup. An empirical study of React repos found 86% had missing cleanup; rAF loops leaked ~8 KB per mount/unmount cycle. Verify with DevTools heap snapshots across 10 toggle cycles.

9. **Time position state must NOT go in the URL** — Animation advances 5 times/second during playback. Writing `timePosition` to nuqs causes browser History API rate-limit errors (~100 pushState/30s Chrome limit), URL thrashing visible to users, and sidebar lag from nuqs's debouncing. Keep `timePosition` in `useState`. Only write to URL on pause or scrub-end if shareability is needed later.

10. **Sidebar desync from heatmap time window** — nuqs URL state (date, province) updates asynchronously and is rate-limited. Heatmap time position changes multiple times per second. These must be separate state channels. Derive sidebar events from the same `timePosition` `useState` that drives `heatPoints` — never route heatmap time through nuqs.

---

## Implications for Roadmap

This project has two milestone layers: the v1.0 scraping + discovery foundation, and the v1.1 heatmap timelapse addition. The v1.0 phases establish the critical path (no display without data); the v1.1 phases follow strict internal dependency order within the milestone.

### Phase 1: Foundation and Database Schema
**Rationale:** Every component depends on schema decisions that are expensive to change. Deduplication key, geocoding column placement (on `venues`, not `events`), and `event_date` index must be designed before any data is written. The execution environment decision (headless browser decoupled from Vercel) must also be resolved before any scraper logic is written.
**Delivers:** Scaffolded Next.js project on Vercel, Neon database connected, Drizzle schema with `events`, `venues`, and `scrape_sources` tables, migrations running, `event_date` index in place.
**Avoids:** Stale event accumulation (date index + cleanup job in schema), duplicate events (upsert key defined in schema), Chromium/Vercel size limit (execution environment decided upfront).
**Research flag:** Standard patterns — well-documented Drizzle + Neon setup. No additional research needed.

### Phase 2: Scraping Pipeline and Data Ingestion
**Rationale:** The scraper is the engine. Without events in the database, there is nothing to display. Build the fetch → extract → normalize → geocode → upsert pipeline as isolated library functions before wiring to cron. Token cost and LLM quality pitfalls must be addressed here — retrofitting is expensive.
**Delivers:** Working scraper processing at least 5 real Atlantic Canada venue URLs, extracting structured event data via GPT-4o mini, geocoding venues, upserting idempotently, logging token usage per run.
**Uses:** cheerio (HTML preprocessing), Vercel AI SDK + GPT-4o mini, Zod, date-fns, Neon + Drizzle, production geocoder (OpenCage or Google).
**Avoids:** LLM date hallucination (nullable fields, null-rejection validation), token cost explosion (cheerio preprocessing), duplicate events (upsert on composite key), geocoding failures (paid geocoder with confidence threshold + manual override).
**Research flag:** Needs deeper research during planning — LLM extraction prompt design, HTML preprocessing approach, and geocoder selection for Atlantic Canada venue variety are non-trivial decisions with cost implications.

### Phase 3: Cron Wiring and Automated Rescan
**Rationale:** Once the scraper library works end-to-end, cron wiring is a thin integration step. This phase makes the app hands-off and validates the full pipeline against Vercel's function timeout constraints.
**Delivers:** `/api/cron/scrape` route, `vercel.json` cron config, per-source error isolation, `last_scraped` timestamps, basic source health logging.
**Avoids:** Vercel function timeout (sequential scraping tested against realistic source count; batching added if needed), non-idempotency (upsert already in place from Phase 2).
**Research flag:** Standard patterns — Vercel cron docs are HIGH confidence and comprehensive.

### Phase 4: Events API
**Rationale:** The frontend cannot be built until read-only API endpoints exist. Thin but necessary — parameterized endpoints accepting bounding box and date range. Default filter enforces `event_date >= NOW()` at the query layer.
**Delivers:** `GET /api/events`, `GET /api/events/[id]`, `GET /api/venues` — JSON with coordinates, future events only.
**Avoids:** Unbounded queries (date filter enforced in Drizzle query, not optionally at frontend), stale events leaking through (API layer enforces the filter).
**Research flag:** Standard patterns. No additional research needed.

### Phase 5: Map Frontend and Event Display
**Rationale:** With real geocoded events and a working API, the map and list can be built and validated with actual data. The map is the primary differentiator; the list and detail page are supporting surfaces.
**Delivers:** Interactive map with clustered event pins, event list with date/province filter and viewport sync, event detail panel, mobile-responsive, empty state handling.
**Uses:** react-leaflet 5.x, react-leaflet-cluster (with manual CSS import), shadcn/ui event cards and filter sidebar, Tailwind CSS 4.x.
**Avoids:** Map clustering performance issues (test with 500+ pins on mobile at zoom 6–7), missing empty states, default extent too zoomed out (default to densest event area, not all of Atlantic Canada).
**Research flag:** Standard patterns. react-leaflet CSS import gotcha is documented in STACK.md and known upfront.

### Phase 6: Heatmap Timelapse (v1.1) — Core Layer
**Rationale:** The timelapse feature builds on the existing map foundation. The dependency order within this milestone is strict: pure logic first, then the Leaflet layer, then UI, then integration. The SSR guard verification must happen at the start of this phase — before any animation logic.
**Delivers:** Working timelapse mode: mode toggle, heatmap renders for current 24-hour time window, timeline scrubber (30-day range), play/pause animation with loop, current time label, sidebar synced to time window, step controls, empty window state.
**Uses:** leaflet.heat 0.2.0, @types/leaflet.heat 0.2.5, react-leaflet `useMap()` hook, native `<input type="range">`, `setInterval` play loop.
**Avoids:** SSR build failure (HeatLayer in dynamic import boundary; `next build` verified first), animation memory leak (useRef + useLayoutEffect cleanup), timePosition in URL (useState only), sidebar desync (same timePosition drives both heatPoints and sidebarEvents), HeatLayer click handlers (spatial lookup via HeatmapClickLayer stub instead).
**Research flag:** Research is complete and HIGH confidence. ARCHITECTURE.md provides exact implementation patterns for all new components. No additional research needed — reference existing research files during implementation.

### Phase 7: Heatmap Timelapse (v1.1) — Interaction and Validation
**Rationale:** After core timelapse is working, add the highest-value interaction (click-through) and run the full verification checklist from PITFALLS.md. Mobile scrubber behavior and heap stability across repeated mode toggles are the highest-risk items.
**Delivers:** Click-through from heatmap hotspot (spatial proximity lookup, not HeatLayer click handler), animation speed control if user testing reveals need, full PITFALLS.md checklist verified (8 items), mobile-validated.
**Avoids:** All v1.1 pitfalls (Pitfalls 8–14) systematically verified against the "looks done but isn't" checklist.
**Research flag:** PITFALLS.md provides the complete verification checklist. No additional research needed.

### Phase 8: Polish, Monitoring, and Source Expansion
**Rationale:** Once the core product works end-to-end with a small venue set, harden operational monitoring and expand coverage to the full Atlantic Canada target.
**Delivers:** Source health monitoring (alert on 3+ consecutive empty scrape runs), stale data indicator on event cards, expanded venue source list (NB, NS, PEI, NL), token cost reporting.
**Research flag:** Per-venue scraping challenges (JS-rendered sites, anti-bot measures) will surface as venues are added. Light venue-specific research as needed; not a wholesale phase-level research requirement.

### Phase Ordering Rationale

- Database schema first (Phase 1): deduplication key, geocoding placement, and date indexing decisions are expensive to change after data is written. Must be resolved before any scraping.
- Scraper before API before frontend (Phases 2–5): the frontend has nothing to display without real data. Scaffolding is fine; validation is not possible until the pipeline produces real events.
- Cron wiring is thin (Phase 3 is short): separating it from the scraper library makes Phase 2 testable without a live cron setup. The orchestrator is called directly during development.
- Map before heatmap (Phase 5 before Phase 6): the heatmap depends on the existing cluster map infrastructure (`MapContainer`, `MapClient`, `allEvents` data flow). Build that first.
- Pure logic before components within v1.1 (within Phase 6): `timelapse-utils.ts` has no dependencies and enables all other components; `HeatmapLayer.tsx` SSR verification gates all animation work.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Scraping Pipeline):** LLM extraction prompt engineering for heterogeneous Atlantic Canada venue HTML, HTML preprocessing library selection, geocoder selection and pricing for ~50–200 venues, scraper response validation patterns.

Phases with complete research (reference existing files, no additional research needed):
- **Phase 1 (Foundation):** Drizzle + Neon setup is well-documented. Next.js scaffolding is zero-config.
- **Phase 3 (Cron Wiring):** Vercel cron documentation is HIGH confidence.
- **Phase 4 (Events API):** Standard Next.js Route Handler + Drizzle read query patterns.
- **Phase 5 (Map Frontend):** react-leaflet + react-leaflet-cluster patterns well-documented; CSS import gotcha known.
- **Phase 6 (Heatmap Core):** ARCHITECTURE.md and STACK.md provide exact implementation patterns for all new components.
- **Phase 7 (Heatmap Validation):** PITFALLS.md provides the complete verification checklist.
- **Phase 8 (Polish):** Incremental additions to existing patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core choices verified against official sources and npm registry. react-leaflet 5.x + leaflet.heat compatibility confirmed by direct npm inspection and official docs. AI SDK 5 recently released but core `generateObject()` API confirmed. |
| Features | HIGH | UX patterns verified against windy.com, kepler.gl, ArcGIS Time Slider. Anti-features have documented rationale from real user behavior (windy.com community discussions). MVP scope is well-defined and prioritized. |
| Architecture | HIGH | Based on direct codebase inspection of existing components plus react-leaflet 5.x core API verification against official docs. All implementation patterns are explicit and verified, including exact component code. |
| Pitfalls | HIGH | v1.0 pitfalls from multiple industry sources; v1.1 pitfalls verified via Leaflet.heat GitHub source, WCAG 2.2 spec, empirical React memory leak research, react-leaflet GitHub issue tracker, and nuqs source code. |

**Overall confidence: HIGH**

### Gaps to Address

- **LLM extraction prompt tuning:** Research establishes the structural approach (nullable fields, null-not-infer instruction) but does not validate extraction quality against real Atlantic Canada venue HTML. First real scrape runs will reveal prompt adjustments. Budget 1–2 iteration cycles during Phase 2.
- **Geocoding service selection:** OpenCage, Google Maps Geocoding, and Positionstack are all flagged as options. Best fit for Atlantic Canada small-town and rural addresses has not been empirically benchmarked. Test OpenCage on a sample of 10–15 rural venue addresses before committing.
- **Atlantic Canada venue site variety:** The percentage of target venues using JS rendering vs. static HTML, or protected by Cloudflare, is unknown without actual scraping. Expect 1–3 venues per province that require the headless browser path or manual data entry.
- **Animation performance threshold:** The pre-bucketing optimization (replace `Array.filter` per scrubber event with an O(1) bucket lookup) is documented as the escape hatch if filter performance becomes sluggish. At current Atlantic Canada volume (hundreds of events), `Array.filter` is fine. Revisit if event count grows past ~500.
- **Vercel Hobby vs. Pro cron limits:** Hobby plan allows one cron execution per day. Sufficient for initial validation; may be insufficient above ~20 venues per scrape run. Monitor scrape run duration against function timeout; escalate to Pro or GitHub Actions cron trigger if needed.

---

## Sources

### Primary (HIGH confidence)
- `npm info react-leaflet`, `npm info leaflet.heat`, `npm info @types/leaflet.heat`, `npm info react-leaflet-cluster` — npm registry version and compatibility verification
- [react-leaflet Core Architecture docs](https://react-leaflet.js.org/docs/core-architecture/) — useMap hook, useLayerLifecycle, official patterns for custom Leaflet plugin wrapping
- [Leaflet.heat GitHub (Leaflet org)](https://github.com/Leaflet/Leaflet.heat) — setLatLngs API, canvas rendering, Issue #61 (no click events — confirmed open and unresolved)
- [react-leaflet GitHub Issue #941](https://github.com/PaulLeCam/react-leaflet/issues/941) — layer leak on unmount without explicit removeLayer
- [WCAG 2.2 SC 2.5.7 — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — native range input requirement
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) + [usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby (daily) vs. Pro (per-minute) limits
- [Neon for Vercel marketplace](https://vercel.com/marketplace/neon) — official integration, confirmed Vercel Postgres → Neon migration
- Direct codebase inspection: `src/components/map/`, `src/app/page.tsx`, `src/lib/filter-utils.ts`, `package.json` — existing component tree and state inventory

### Secondary (MEDIUM confidence)
- [Drizzle vs Prisma 2026 comparison (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) — cold start benchmarks, bundle sizes
- [AI SDK Core: generateObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — structured output API (docs in transition for AI SDK 5)
- [kepler.gl Time Playback docs](https://docs.kepler.gl/docs/user-guides/h-playback) — speed control patterns, window selection
- [windy.com community discussions](https://community.windy.com) — speed control user frustration; timeline UX as established conventions
- [ArcGIS Timeline Widget](https://developers.arcgis.com/experience-builder/guide/timeline-widget/) — sidebar sync pattern (connected list widgets via shared data source)
- [Frontend Memory Leaks empirical study (stackinsight.dev)](https://stackinsight.dev/blog/memory-leak-empirical-study/) — 86% missing cleanup; ~8 KB/cycle rAF leak quantification
- [nuqs GitHub (47ng/nuqs)](https://github.com/47ng/nuqs) — browser rate-limit on URL updates; throttle/debounce capabilities

### Tertiary (LOW confidence — validates assumptions, needs runtime verification)
- [OpenAI pricing](https://openai.com/api/pricing/) — GPT-4o mini token costs (subject to change)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) — 1 req/sec public limit; confirms must use paid geocoder for production
- [ZenRows: Playwright on Vercel](https://www.zenrows.com/blog/playwright-vercel) — @sparticuz/chromium workaround (decoupling scraper to external process is the cleaner path)
- Atlantic Canada event platform gap: inferred from competitor coverage analysis — needs validation with actual venue outreach

---

*Research completed: 2026-03-14*
*Ready for roadmap: yes*
