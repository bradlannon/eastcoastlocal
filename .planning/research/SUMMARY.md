# Project Research Summary

**Project:** East Coast Local — v2.2 Recurring Event Series Detection & Past Event Archival
**Domain:** Event discovery app — recurring event grouping and soft-delete archival on an existing Next.js + Neon Postgres stack
**Researched:** 2026-03-16
**Confidence:** HIGH

---

## Executive Summary

East Coast Local v2.2 is an additive milestone on a fully-shipped v2.1 stack (Next.js 16, Neon Postgres + Drizzle, Vercel Hobby, Tailwind). The two features — past event archival and recurring series detection/grouping — share no schema dependencies and can be built and shipped in sequence. Both are well-understood patterns with minimal architectural novelty: archival is a soft-delete timestamp column plus a daily cron, and series detection is an enrichment pass that groups existing scraped rows by (venue_id, normalized_performer) into a new `recurring_series` table.

The recommended approach is to build archival first (simpler, self-contained, immediately visible to users), then series detection (depends on archival being live so archived events are excluded from occurrence counts), then series UI (pure rendering changes on top of populated data). Schema migrations come first for both features as the non-breaking foundation. No new npm packages are required for the MVP; an optional Radix UI collapsible can be added later if animated UI is needed.

The critical risks are concentrated in three areas: (1) the archival cron must preserve `archived_at` in the upsert's ON CONFLICT clause or re-scraping will unarchive events, (2) series detection must be scoped to venue_id or same-named events at different venues will be falsely grouped, and (3) timezone handling must use Atlantic time for the archival threshold or tonight's events disappear from the map hours before they start. All three risks have clear prevention strategies documented in the research and must be addressed in the initial implementation — retrofitting any of them after data accumulates requires a migration.

---

## Key Findings

### Recommended Stack

The v2.2 stack additions are minimal. The existing Drizzle + Neon + date-fns + Vercel cron infrastructure covers everything. No new production dependencies are required for core schema and archival. Series detection reuses `normalized_performer` (already indexed), `venue_id`, and `event_date` — all existing columns.

**Core technologies (additions only):**
- Drizzle ORM 0.45.1 (existing): Self-referential FK pattern uses standalone `foreignKey()` operator — confirmed supported in Drizzle 0.45.1 official docs
- date-fns 4.x (existing): `subDays`, `isBefore`, `differenceInDays` cover all archival and detection date math with no new imports
- Vercel cron (existing infra): One new `/api/cron/archive` entry in vercel.json; follows established CRON_SECRET + maxDuration = 60 pattern exactly

**Explicitly ruled out:**
- `rrule` npm package: Solves the wrong problem (generating future occurrences from a rule string; this project detects patterns from scraped discrete events). Also abandoned (last published v2.8.1, 2+ years ago).
- Separate archive table: Overkill at Atlantic Canada scale; `archived_at` timestamp column is strictly better for this volume.
- `shadcn/ui`: Would impose a component library convention for one collapsible. Use plain `<details>`/`<summary>` HTML for the MVP.

### Expected Features

The research confirms a two-tier feature scope: a tightly bounded MVP (ship with v2.2) and a post-validation follow-on (ship after admin review confirms detection accuracy).

**Must have (P1 — table stakes for v2.2):**
- `archived_at` nullable timestamp on events + archive cron — keeps public UI free of stale events automatically
- `archived_at IS NULL` guard in `/api/events` — authoritative gate on stale data (replaces the implicit `event_date >= NOW()` filter)
- `event_series` table + `series_id` nullable FK on events — schema foundation for all series features
- Series detection enrichment (temporal pattern: same normalized_performer + venue_id appearing on multiple same-weekday dates) — core value of the milestone
- Title keyword heuristic detection ("every", "weekly", "open mic", "trivia", "bingo") — catches explicit recurrence signals in performer names
- "Recurring" badge on EventCard when `series_id IS NOT NULL` — visual trust signal
- List view collapse: one card per series showing next upcoming occurrence — prevents weekly events flooding the list
- Admin archived events tab — admin visibility to catch false positive archival

**Should have (P2 — add after detection is validated):**
- "Next: Wed Mar 18 — then every Wed" contextual label on series cards
- Map popup enhancement: "Open Mic Night — every Wednesday (5 upcoming)"
- Admin series management UI (merge/split series manually)

**Defer to v2+:**
- "Recurring events only" filter chip in public UI — wait until series coverage is broad enough to be useful
- Series confidence score + admin review queue — defer until detection volume needs triage
- Hard purge of events archived > 90 days — storage costs at Atlantic Canada scale are negligible

**Anti-features to reject:**
- Hard delete of past events — destroys dedup anchors; future scrapes re-import the same events
- RRULE-based recurrence generation — wrong tool for scraped discrete events
- Real-time series detection on event insert — O(n) per insert; use post-scrape enrichment pass instead
- Public "past events" tab — out of scope; heatmap covers historical density use cases

### Architecture Approach

The v2.2 architecture is purely additive. Two new lib modules (`series-detector.ts`, `archiver.ts`), one new cron endpoint (`/api/cron/archive`), one new table (`recurring_series`), and two new nullable columns on `events`. The existing upsert pipeline, API shape, and admin UI require targeted modifications, not structural changes. The `Event` TypeScript type auto-propagates new columns via Drizzle `InferSelectModel` — no manual type editing required.

**Major components:**
1. `recurring_series` table — stores series-level metadata (venue_id, normalized_performer, recurrence_label, occurrence_count, first_seen_at); unique index on (venue_id, normalized_performer) enforces venue-scoping at the schema level
2. `series-detector.ts` (`lib/scraper/`) — `detectAndLinkSeries(venueId, normalizedPerformer)`: queries occurrence count, upserts series row via ON CONFLICT, tags event rows with series_id; called once per unique (venue_id, normalized_performer) pair after source upserts complete
3. `archiver.ts` (`lib/scraper/`) — `archivePassedEvents()`: bulk UPDATE events SET archived_at = NOW() WHERE event_date < NOW() AND archived_at IS NULL; idempotent and millisecond-fast at current scale
4. `/api/cron/archive/route.ts` — dedicated cron endpoint following existing CRON_SECRET + maxDuration = 60 pattern; isolated from scrape cron
5. Modified `orchestrator.ts` — accumulates unique (venue_id, normalized_performer) pairs via Set during upsert loop; calls detectAndLinkSeries per pair after source upserts complete
6. Modified `EventCard.tsx` — series badge on `events.series_id !== null`; follows existing source_types badge pattern
7. Modified `/api/events/route.ts` — adds `isNull(events.archived_at)` to WHERE clause via `and(gte(...), isNull(...))`

### Critical Pitfalls

Eight v2.2-specific pitfalls were identified. The top five require prevention strategies baked into the initial implementation:

1. **Archival race with active scraping (Pitfall 17)** — The upsert ON CONFLICT clause must explicitly exclude `archived_at` from the SET clause (COALESCE or field omission). Otherwise re-scraping an archived event resets the flag and produces a permanent archive/unarchive oscillation. Prevention: add COALESCE guard to `upsertEvent` before the archival cron is scheduled; verify with a test that upserts an archived event row and confirms `archived_at` is unchanged.

2. **False positive series grouping across venues (Pitfall 15)** — Series detection must always be scoped to (venue_id, normalized_performer). Never group events across different venues into the same series. Prevention: the unique index on `recurring_series(venue_id, normalized_performer)` enforces this at the schema level, not just in application logic.

3. **Timezone errors in "past" determination (Pitfall 18)** — Postgres `NOW()` is UTC; Atlantic Canada is UTC-4/UTC-5. Using UTC midnight as the archival threshold archives tonight's events in the afternoon. Prevention: store event_date as TIMESTAMPTZ; compute Atlantic-time threshold in application code before querying; schedule the archival cron at a UTC time that corresponds to late night Atlantic time.

4. **Series over-detection on generic performer names (Pitfall 21)** — "Various Artists," "Open Mic Night," "TBD" at 40 different venues must not be grouped into a mega-series. Prevention: require minimum 3 occurrences in a rolling 90-day window at the same venue; add temporal regularity check (weekly ± 3 days); maintain a configurable blocklist for known generic placeholders.

5. **Series breaking on minor name variations (Pitfall 16)** — "Open Mic Nite" vs "Open Mic Night" should stay in the same series. `fastest-levenshtein` is already installed. Prevention: apply ~20% edit-distance tolerance when matching series members; set series canonical name once at creation and never overwrite it from subsequent scrapes with slightly different event names.

Additional pitfalls to address (see PITFALLS.md for full detail): Orphaned event_sources after archival (Pitfall 19: prefer soft delete, add ON DELETE CASCADE only if hard delete ever needed); Map UI confusion with series (Pitfall 20: enumerate all event consumers before building any series UI); Archival cron timeout (Pitfall 22: dedicated endpoint with isolated 60s budget; event_date index already exists).

---

## Implications for Roadmap

The build order is deterministic: schema first (prerequisite for everything), archival second (self-contained; must be live before series detection), series detection third (requires archival guard in occurrence query), then series UI last (pure rendering).

### Phase 1: Schema Foundation
**Rationale:** Adding nullable columns and a new table is non-breaking and safe to deploy independently. Must exist before any code referencing the new columns deploys. Drizzle `InferSelectModel` auto-propagates new columns to TypeScript types, reducing downstream changes.
**Delivers:** Migration SQL applied to Neon; `recurring_series` table live; `series_id` and `archived_at` columns on events; Zod schema updated for optional `recurrence_pattern` field
**Addresses:** Foundation for all v2.2 features; zero backfill required since both columns are nullable
**Avoids:** Deployment ordering issues; ensures all subsequent phases can test against the real schema

### Phase 2: Archival
**Rationale:** Fully self-contained, no dependency on series logic, lowest risk, ships immediate user value (stale events disappear from public UI). Must be live before series detection so archived past occurrences are excluded from the occurrence count used to qualify a series.
**Delivers:** `archiver.ts`, `archiver.test.ts`, `/api/cron/archive/route.ts`, modified `/api/events` WHERE clause, vercel.json cron entry, COALESCE guard in upsertEvent
**Avoids:** Pitfall 17 (COALESCE guard in upsertEvent); Pitfall 22 (dedicated endpoint, not appended to scrape cron); Pitfall 18 (Atlantic timezone threshold, not UTC midnight)
**Uses:** Existing date-fns, Drizzle, Vercel cron patterns

### Phase 3: Series Detection
**Rationale:** Depends on Phase 1 (schema) and Phase 2 (archival must be live so `WHERE archived_at IS NULL` correctly excludes past events from occurrence counts). Detection logic is more complex than archival and benefits from a clean baseline.
**Delivers:** `series-detector.ts`, `series-detector.test.ts`, modified `orchestrator.ts`, modified `extractor.ts` (Gemini recurrence_pattern hint), one-time backfill run against existing events
**Avoids:** Pitfall 15 (venue_id scope enforced by schema unique index); Pitfall 16 (fuzzy name matching must be initial implementation, not added after first false splits); Pitfall 21 (minimum occurrence threshold + temporal regularity check + generic name blocklist)
**Implements:** Post-upsert enrichment pattern — Set accumulation during upsert loop, detection pass runs after all upserts for a source complete

### Phase 4: Series UI
**Rationale:** Pure rendering changes. Depends on series_id being populated in the DB. Low risk — conditional badge and list collapse require no new API endpoints and follow established EventCard badge patterns.
**Delivers:** `EventCard.tsx` series badge, list view collapse to next occurrence per series, admin archived events tab
**Avoids:** Pitfall 20 (enumerate all event consumers — map pin popups, cluster count badges, event list, heatmap — before building; document series vs instance counting decision upfront)
**Addresses:** All P1 user-visible features from FEATURES.md

### Phase Ordering Rationale

- Schema must be first: Drizzle migration is a hard prerequisite for all other phases; nullable columns are non-breaking and can deploy without touching any existing query
- Archival before series detection: the series detector queries `WHERE archived_at IS NULL` to count valid occurrences; without archival in place, past events inflate occurrence counts and produce false series
- Series detection before series UI: the badge and collapse logic require `series_id` to be populated on event rows; UI built before detection runs would show no series
- Admin archived events tab can ship in Phase 4 alongside series UI — it is a filtered view of existing data, no new logic required

### Research Flags

Phases with standard, well-documented patterns (research-phase not needed):
- **Phase 1 (Schema):** Drizzle nullable column additions are trivial; self-referential FK via standalone `foreignKey()` operator is confirmed in Drizzle 0.45.1 docs; schema changes are non-breaking
- **Phase 2 (Archival):** Soft-delete timestamp is a standard pattern; archival UPDATE is a single Drizzle call; cron endpoint follows existing pattern exactly
- **Phase 4 (UI):** Conditional badge rendering follows existing source_types badge pattern in EventCard.tsx; no new component library needed

Phase that warrants planning attention before implementation:
- **Phase 3 (Series Detection):** The fuzzy name matching threshold (~20% Levenshtein) and minimum occurrence count (3 in 90 days) are estimates. They need empirical validation against the actual events dataset. Recommend: run detection logic against the existing events table in a dry-run mode (log proposed groupings without writing series rows) and review with admin before committing. The threshold values are data-dependent and wrong defaults require a data migration to correct.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Full codebase read; all integration points traced; no new dependencies required for MVP; Drizzle self-referential FK confirmed in official docs; all existing pattern reuse confirmed by direct source inspection |
| Features | MEDIUM | Core UX patterns are well-established from Eventbrite, Meetup, Google Events; detection heuristics and thresholds are informed estimates that need empirical validation against real data before locking in |
| Architecture | HIGH | Full codebase read; all file paths, function signatures, and data flows confirmed from direct source inspection; build order derived from actual dependency analysis, not inference |
| Pitfalls | HIGH | v2.2 pitfalls derived from direct codebase analysis (upsertEvent ON CONFLICT logic, events API WHERE clause, existing cron patterns); standard PostgreSQL/Vercel/timezone pitfalls confirmed by multiple sources |

**Overall confidence:** HIGH

### Gaps to Address

- **Detection thresholds are data-dependent:** The minimum occurrence count (3 in 90 days) and temporal regularity tolerance (weekly ± 3 days) are estimates. Validate with a dry-run against the live events table before committing — Atlantic Canada event frequency may require adjustment. Plan for one threshold tuning iteration after the first detection run.
- **COALESCE guard in upsertEvent syntax:** The exact Drizzle ORM syntax to exclude `archived_at` from the ON CONFLICT DO UPDATE SET clause needs to be confirmed against the current `upsertEvent` implementation (`normalizer.ts`) before the archival cron is scheduled. This is the highest-risk integration point.
- **Timezone storage convention:** Whether `event_date` is currently stored as `TIMESTAMP` or `TIMESTAMPTZ` in Neon needs confirmation from the schema before implementing the archival threshold. If stored as plain `TIMESTAMP`, the application-layer offset approach must compensate explicitly.
- **Scrape cron timeout headroom:** The series detection pass adds N additional DB round-trips to the scrape cron (one per unique venue+performer pair). If the scrape cron is already near the 60s limit, the detection pass should run as a separate dedicated cron endpoint rather than appended to the scrape cron.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `schema.ts`, `orchestrator.ts`, `normalizer.ts`, `extractor.ts`, `/api/events/route.ts`, `EventCard.tsx`, `EventList.tsx`, `types/index.ts`, `extracted-event.ts`, `/api/cron/scrape/route.ts`, `vercel.json`, `package.json` — all integration points confirmed by direct file read
- Drizzle ORM official docs (orm.drizzle.team/docs/relations-v2) — FK and relation patterns; self-referential FK syntax confirmed
- Soft deletion with PostgreSQL — Evil Martians (evilmartians.com/chronicles) — timestamp vs boolean soft delete
- Soft Deletion Probably Isn't Worth It — brandur.org — when separate archive table is warranted vs in-table column
- @radix-ui/react-collapsible@1.1.12 — confirmed React 19 compatible
- Vercel Cron Jobs docs — cron schedule format, Hobby plan constraints
- rrule npm package (npmjs.com) — confirmed abandoned (v2.8.1, 2+ years ago); ruled out

### Secondary (MEDIUM confidence)
- Self Referencing Foreign Key in Drizzle ORM (gebna.gg/blog) — community blog consistent with official Drizzle docs
- Again and Again! Managing Recurring Events in a Data Model (Red Gate) — series_id vs parent_event_id tradeoffs
- Calendar Recurring Events: Best Database Storage Method (codegenes.net) — storage method comparison
- Eventbrite, Meetup, Google Events help docs — competitor recurrence and archival patterns
- Recurring Events and PostgreSQL (Thoughtbot blog) — PostgreSQL-specific recurring event patterns
- Hacker News: Recurring events database schema discussion (news.ycombinator.com/item?id=18477975) — community validation of series table approach

### Tertiary (LOW confidence)
- Detection threshold estimates (3 occurrences, ± 3 day tolerance) — inferred from domain knowledge; must be validated empirically against the live events dataset before locking in

---
*Research completed: 2026-03-16*
*Ready for roadmap: yes*
