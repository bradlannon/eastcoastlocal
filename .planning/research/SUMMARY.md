# Project Research Summary

**Project:** East Coast Local v1.5
**Domain:** Event/venue deduplication + map UX polish on an existing Atlantic Canada event discovery platform
**Researched:** 2026-03-15
**Confidence:** HIGH

---

## Executive Summary

East Coast Local v1.5 is a focused polish milestone on an already-working platform. The four features break cleanly into two backend pipeline changes (venue deduplication, cross-source event deduplication) and two frontend wiring tasks (zoom-to-location on event cards, timelapse category chip visibility). Research confirms that three of the four features require zero new packages — the entire UX improvement surface is wiring against existing infrastructure already in production. Only deduplication requires a new dependency, and that dependency is a single lightweight library: `fastest-levenshtein@1.0.16`.

The recommended approach is dependency-first sequencing: venue deduplication must run before cross-source event deduplication, because event dedup is fully solved once the canonical `venue_id` is resolved correctly. When TM-created venues are merged into the canonical venue row before `upsertEvent` is called, the existing `(venue_id, event_date, normalized_performer)` composite key handles cross-source dedup automatically — no separate event-level fuzzy matching is required. This is a significantly simpler implementation path than it first appears.

The key risk is venue merge correctness. Auto-merging on name similarity alone produces false positives; geocoordinate proximity alone is unreliable at meter-level precision. Research confirms the safe pattern is a two-signal gate: name similarity AND geocoordinate proximity must both meet thresholds for auto-merge. Borderline cases (name match but distant, or geo close but name differs) should be logged rather than silently merged or silently rejected. The frontend features carry minimal risk — both are conditional-render/state-wiring changes against existing components with no architectural impact.

---

## Key Findings

### Recommended Stack

Three features require no new packages. `MapViewController.flyTo`, the `useEventFilters()` hook, and the `nuqs` category state are already in production and need to be wired in new contexts only. The sole new dependency is `fastest-levenshtein@1.0.16` for edit-distance scoring in the deduplication pipeline.

**Core technologies:**
- `fastest-levenshtein@1.0.16`: edit-distance scoring for venue and performer name fuzzy matching — zero dependencies, 78K ops/sec, pure JS, works in Node.js scraper context, ships its own TypeScript types
- `react-leaflet` (existing): `MapViewController.flyTo` already implemented with animated pan + marker popup open; `useMap()` via `useMapEvents` already in use — zoom-to-location is pure wiring
- `nuqs` (existing): category state already URL-persisted and silently applied in timelapse; chips need conditional rendering removed only
- `fastest-levenshtein` vs rejected alternatives: `natural` is 13.8MB overkill for two-string edit distance; `string-similarity` unmaintained since 2023; `fuse.js` built for interactive search not batch dedup; `pg_trgm` adds infra coupling and moves threshold logic out of testable application code

**Critical integration notes:**
- `fastest-levenshtein` runs server-side in the nightly scrape cron only — no bundle size concern, no Edge runtime constraint
- Venue dedup integrates into `findOrCreateVenue()` in `src/lib/scraper/ticketmaster.ts` after the existing `ilike` exact-match miss
- Event dedup requires no changes — relies on existing `INSERT ON CONFLICT DO UPDATE` in `normalizer.ts` once venue is resolved correctly
- Use proportional threshold `distance / Math.max(a.length, b.length) < 0.15` for venue names; `distance <= 2` for normalized performer names under 20 chars

### Expected Features

**Must have (table stakes — v1.5 launch blockers):**
- Venue deduplication: detect TM-created duplicate venue rows using name similarity + geocoordinate proximity; auto-merge at high confidence; log borderline cases without acting on them
- Cross-source event deduplication: fully resolved once venue merge runs; the existing composite key upsert handles it automatically
- Category filter chips rendered in timelapse mode: remove the conditional that hides chips when `timelapse === true`; filter logic already works correctly in timelapse, only visibility is broken
- Zoom-to-location: "Show on map" button on event cards calls `map.flyTo([lat, lng], 15)` with animated pan+zoom; zoom 15 is correct for city-block venue resolution on CartoDB Positron

**Should have (v1.5.x differentiators — add after validation):**
- Admin UI for borderline venue merge candidates: surface near-match pairs with side-by-side comparison and one-click merge or "keep separate" action
- Source attribution: `event_sources` join table tracking which sources each event was seen on (enables admin debugging and future ticket link preference)
- Canonical ticket link preference: on cross-source conflict, if existing row has no `ticket_link` and incoming row does, update it non-destructively

**Defer to v2+:**
- Bulk venue merge audit (retrospective full scan for missed historical merges; run once after v1.5 ships and monitor for regressions)
- Event title fuzzy match as a secondary dedup signal for rare cross-source performer name spelling variations
- Animated `flyTo` on scroll or hover (confirmed anti-feature; bind only to explicit button click)

### Architecture Approach

V1.5 changes are additive to the existing scraper pipeline architecture established in v1.4. The orchestrator dispatches on `source_type`; venue deduplication integrates as an enhancement to `findOrCreateVenue()` in the Ticketmaster handler — not as a new pipeline stage. Event dedup requires no separate function. Both frontend changes are isolated to the map client and event card components with no backend or schema dependencies. Source attribution is the only feature that would require a new schema object (an `event_sources` join table), and it is correctly deferred to post-validation.

**Major components and their v1.5 responsibilities:**
1. `src/lib/scraper/ticketmaster.ts` (`findOrCreateVenue`) — enhanced with `fastest-levenshtein` to fuzzy-match incoming TM venue names against all existing venues in the same city before creating new rows; two-signal gate prevents false-positive merges
2. `src/lib/scraper/normalizer.ts` (`upsertEvent`) — no change; existing composite key `(venue_id, event_date, normalized_performer)` handles cross-source dedup once venue is resolved
3. `src/components/map/MapClient.tsx` — add category chip strip inside timelapse overlay conditionally on `mapMode === 'timelapse'`; accept `flyToTarget` prop and forward to `MapViewController`
4. `src/components/events/EventCard.tsx` — add "Show on map" button wired to existing `onClickVenue(venueId, lat, lng)` callback; lift `flyToTarget` state to parent
5. `src/components/map/MapViewController.tsx` — no change; `flyTo([lat, lng], 15, { animate: true, duration: 0.8 })` already implemented

### Critical Pitfalls

1. **Name similarity alone causes venue merge false positives** — "The Marquee" in Halifax and "The Marquee" in Sydney, NS are different venues; name match alone must never trigger a merge. Prevention: require both name score (proportional distance < 0.15) AND geo proximity (< 100m) for auto-merge; same name + geo distance > 500m = log as suspicious, do NOT merge.

2. **Cross-source event dedup attempted without resolving venue first** — fuzzy event title matching independent of venue produces false positives ("Jazz Night at The Marquee" and "Jazz Night at The Casino" look similar but are different events). Prevention: anchor all event dedup to a resolved `venue_id`; fix venue resolution, not event matching.

3. **Zoom level too high on `flyTo`** — CartoDB Positron tiles become sparse and lose legibility above zoom 16; venue context is lost. Prevention: cap `flyTo` at zoom 15.

4. **`flyTo` bound to scroll or hover events** — constant `flyTo` calls during list scroll are visually jarring and make mobile map unusable. Prevention: bind only to explicit "Show on map" button click intent.

5. **Category chips restored but state not confirmed in timelapse context** — the chips are hidden, but the filter logic already applies silently. Prevention: remove only the conditional render; verify `useEventFilters()` reads the same nuqs `category` state in timelapse context before shipping; no filter logic changes needed.

---

## Implications for Roadmap

Based on combined research, the v1.5 work maps cleanly to 2 phases with an optional third:

### Phase 1: Venue Deduplication (Backend Pipeline)
**Rationale:** All cross-source event dedup is blocked on correct venue resolution. This phase is the prerequisite that makes everything else work automatically. Install `fastest-levenshtein`, enhance `findOrCreateVenue()` with the two-signal fuzzy match, and run the dedup step at the end of each Ticketmaster ingest cron. Cross-source event dedup is delivered as a consequence — no additional work.
**Delivers:** TM-created venue rows correctly merged into canonical existing venues; no more double venue pins for the same physical location; cross-source event dedup working automatically via the existing composite key
**Addresses:** Venue dedup (P1), cross-source event dedup (P1)
**Uses:** `fastest-levenshtein@1.0.16` (only new dependency); existing Haversine function from codebase for geo proximity; existing `ilike` exact-match as the fast-pass before fuzzy scoring
**Avoids:** False positive merges (two-signal gate: name AND geo required); same-name-different-city merges (log, do not auto-merge); O(n²) full-scan overhead (run only on venues created since last cron run, not all venues every day)
**Research flag:** Threshold calibration (0.15 ratio for name, 100m for auto-merge, 500m for queue-to-review) should be validated against a sample of actual TM venue names in the existing database before enabling production auto-merge. Build a dry-run mode that logs match candidates without executing merges.

### Phase 2: Frontend UX Fixes
**Rationale:** Both frontend features are independent of the backend dedup work and of each other. They can be built in parallel with Phase 1 or after it. They should ship together as they represent the visible UX improvements users will notice.
**Delivers:** Category chips visible and interactive in timelapse mode; "Show on map" button on event cards animates map to venue coordinates with a smooth flyTo
**Addresses:** Category chips in timelapse (P1), zoom-to-location (P1)
**Implements:** Remove `timelapse` conditional from chip bar render in `MapClient.tsx`; pass `flyToTarget: { lat, lng, venueId }` state from `EventCard.onClickVenue` through `MapWrapper`/`page.tsx` to `MapClient` → `MapViewController`; use React context (not restructured `<MapContainer>` children) for map ref access from the sidebar
**Avoids:** Binding `flyTo` to scroll or hover (explicit button click only); zoom level above 16; breaking the existing component tree structure
**Research flag:** Standard patterns — well-documented against existing codebase components. No additional research phase needed.

### Phase 3: Admin Merge Review (Optional, Post-validation)
**Rationale:** Auto-merge at high confidence handles the common case. Borderline cases are logged but not surfaced to the admin without this phase. Build only after Phase 1 is validated in production and the actual borderline case volume is understood from logs.
**Delivers:** Admin UI showing near-match venue pairs queued for review; side-by-side comparison of name, address, and coordinates; one-click merge or "keep separate" action
**Addresses:** Admin merge review UI (P2 differentiator)
**Research flag:** Standard admin CRUD pattern. No research needed; defer planning to implementation time.

### Phase Ordering Rationale

- Venue dedup (Phase 1) is a prerequisite for cross-source event dedup trust; cannot be skipped or deferred
- Frontend features (Phase 2) are entirely independent — they can proceed in parallel with Phase 1 or after it; there is no dependency between them
- Source attribution requires a new join table (`event_sources`) — correctly deferred to v1.5.x after the core dedup is validated and stable
- Admin merge review (Phase 3) depends on having real production data from Phase 1 to understand the volume and character of borderline cases before designing the review UI

### Research Flags

Needs threshold validation during planning (not a full research phase):
- **Phase 1:** Dedup threshold calibration — run `fastest-levenshtein` against a sample of actual TM venue names vs. existing venue names in the database; adjust 0.15 ratio and 100m/500m geo thresholds based on real Atlantic Canada name data distribution before enabling auto-merge

Standard patterns — skip research-phase:
- **Phase 2:** Both frontend features follow existing patterns already in the codebase; `MapViewController.flyTo`, `useEventFilters()`, and chip render are all live and inspected
- **Phase 3:** Admin CRUD follows existing admin UI patterns; no research needed

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase analysis confirms all three no-new-library features against actual source files; `fastest-levenshtein` verified via npm registry; integration points confirmed in `ticketmaster.ts` and `normalizer.ts` |
| Features | HIGH | Feature dependencies clearly mapped; dedup approach validated against established data engineering patterns; frontend features confirmed against existing component interfaces |
| Architecture | HIGH | Based on direct codebase inspection; integration points in `ticketmaster.ts`, `MapClient.tsx`, and `EventCard.tsx` verified with specific function names and file paths |
| Pitfalls | HIGH | v1.5-specific pitfalls verified via Leaflet API reference, Crunchy Data fuzzy match guide, and established event aggregation dedup patterns; all five critical pitfalls have explicit prevention strategies |

**Overall confidence:** HIGH

### Gaps to Address

- **Dedup threshold calibration:** The 0.15 name similarity ratio and 100m/500m geo thresholds are research-recommended starting points. They should be validated against real TM venue name data before enabling production auto-merge. Plan a dry-run logging pass first.
- **Merge operation strategy:** Research leaves open whether to delete merged duplicate venue rows or mark them with a `merged_into_venue_id` nullable FK. This is a schema design decision for planning — deletion is simpler but irreversible; the FK approach is auditable but adds schema complexity.
- **Map ref access pattern for flyTo:** Research identifies two valid implementation paths: React context carrying the map ref, or restructuring sidebar components to be children of `<MapContainer>`. Planning should confirm which pattern the current codebase uses to avoid introducing inconsistency.

---

## Sources

### Primary (HIGH confidence)
- Codebase analysis (direct file reads) — `MapViewController.tsx`, `EventCard.tsx`, `MapClient.tsx`, `EventFilters.tsx`, `TimelineBar.tsx`, `normalizer.ts`, `ticketmaster.ts`, `schema.ts` — confirmed existing infrastructure and integration points
- npm registry — `npm info fastest-levenshtein` — version 1.0.16, stable; ships own TypeScript types; pure JS, no native bindings
- [react-leaflet official docs — Map creation and interactions](https://react-leaflet.js.org/docs/api-map/) — confirmed `useMap()` hook and `flyTo` via Leaflet instance
- [Leaflet map.flyTo documentation](https://leafletjs.com/reference.html) — animated pan+zoom API, zoom level behavior
- [Haversine formula — Movable Type Scripts](https://www.movable-type.co.uk/scripts/latlong.html) — distance calculation for geocoordinate proximity

### Secondary (MEDIUM confidence)
- [Fuzzy Matching 101 — Data Ladder](https://dataladder.com/fuzzy-matching-101/) — algorithm comparison for name matching in dedup contexts; Levenshtein vs Jaro-Winkler vs token-sort
- [Streamline Data Deduplication — Capella Solutions](https://www.capellasolutions.com/blog/streamline-data-deduplication-advanced-matching-techniques) — multi-field matching strategies and threshold approaches
- [List and Details — Map UI Patterns](https://mapuipatterns.com/list-details/) — expected UX: selecting a list item zooms map to that item's location
- [Filter UI Patterns — Arounda](https://arounda.agency/blog/filter-ui-examples) — chip filter visibility best practices; active filters should be visible in all app modes
- [npm-compare: fuse.js vs string-similarity vs natural](https://npm-compare.com/fuse.js,natural,string-natural-compare,string-similarity) — download and maintenance comparison for alternative library evaluation

### Tertiary (LOW confidence)
- None — all findings in this summary are backed by HIGH or MEDIUM confidence sources

---
*Research completed: 2026-03-15*
*Covers: v1.5 — cross-source deduplication, venue merge, zoom-to-location, timelapse filter chip visibility*
*Ready for roadmap: yes*
