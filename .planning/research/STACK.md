# Stack Research

**Domain:** Event/venue deduplication + map UX polish (v1.5)
**Researched:** 2026-03-15
**Confidence:** HIGH

## Summary

Three of the four v1.5 features require zero new packages. The zoom-to-location button and timelapse category chips are pure wiring tasks against infrastructure already in the codebase (`MapViewController.flyTo`, `nuqs` category state, `EventFilters` chip components). Only the deduplication features require a new dependency, and even there the choice is a single small library.

---

## New Library Needed: One Package

### `fastest-levenshtein` for fuzzy matching in deduplication

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| fastest-levenshtein | 1.0.16 | Edit-distance scoring for performer and venue name fuzzy matching | Zero dependencies, 78K ops/sec (benchmarked fastest in class), pure JS, works in Node.js scraper context. The project only needs `distance()` — no heavy NLP pipeline required. |

This covers both dedup use cases:
- **Event deduplication**: compare `normalized_performer` values across candidate events on the same date at nearby venues
- **Venue deduplication**: compare incoming TM venue names against existing venue names in the same city before creating a new row

**Why not `natural` (8.1.1)?** It ships Jaro-Winkler alongside tokenization, stemming, WordNet, and classifiers — 13.8 MB for capabilities never used here. The project only needs edit distance on short strings (venue and performer names), not NLP. Overkill.

**Why not `string-similarity` (4.0.4)?** Last published May 2023, no recent maintenance. Its Dice coefficient approach is fine but slower than fastest-levenshtein for the brute-force candidate scan this project needs (compare one incoming name against O(100) existing venue names per city).

**Why not `fuse.js` (7.0.0)?** Fuse is optimized for interactive search (user types, results filter). Deduplication here is a batch server-side operation comparing two known strings — overkill abstraction, and its configurable threshold tuning adds debugging surface area.

---

## Features With No New Packages

### Zoom-to-location on event cards

**Status:** Infrastructure already complete. No new library.

`MapViewController.tsx` already implements `flyTo` with animated pan + marker popup open. `EventCard.tsx` already has `onClickVenue(venueId, lat, lng)` callback prop. The gap is wiring: `MapWrapper` or `page.tsx` needs to accept a zoom trigger from the event list and pass it as `flyToTarget` to `MapClient`. Pattern already used for the geolocation button.

Relevant existing files:
- `src/components/map/MapViewController.tsx` — `flyTo([lat, lng], 15, { animate: true, duration: 0.8 })`
- `src/components/events/EventCard.tsx` — `onClickVenue` callback already defined
- `src/components/map/MapClient.tsx` — `flyToTarget` prop already in interface

### Category filter chips in timelapse mode

**Status:** All state and UI components already exist. No new library.

Category filter state lives in nuqs (`useQueryState('category')`). `EventFilters.tsx` renders the chip buttons. `TimelineBar.tsx` renders the playback controls. The gap is layout: the category chips are currently only shown above the event list sidebar, not overlaid on the map in timelapse mode. The fix is rendering the chip row inside the map overlay in timelapse mode, reading the same nuqs state.

Relevant existing files:
- `src/components/events/EventFilters.tsx` — `useEventFilters()` hook exported, chips already built
- `src/lib/db/schema.ts` — `EVENT_CATEGORIES` constant used by chip render
- `src/lib/categories.ts` — `CATEGORY_META` labels

---

## Installation

```bash
# Deduplication only — single new dependency
npm install fastest-levenshtein
```

No dev dependencies needed. `fastest-levenshtein` ships its own TypeScript types.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| fastest-levenshtein | natural | If the project also needs tokenization, stemming, or classification — not the case here |
| fastest-levenshtein | string-similarity | Acceptable if edit-distance semantics are not needed; Dice coefficient is fine for search but package is unmaintained since 2023 |
| fastest-levenshtein | fuse.js | If building an interactive search UI where users type and results filter; wrong pattern for batch dedup |
| Custom normalization (existing) | Any library | Performer normalization (`normalizePerformer`) already strips punctuation and lowercases — run before distance scoring |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `natural` | 13.8 MB; includes NLP facilities (WordNet, stemming, classifiers) never needed for two-string edit distance | fastest-levenshtein |
| `fuse.js` | Built for interactive search UI; threshold config adds debugging surface; wrong mental model for batch dedup | fastest-levenshtein |
| Postgres `pg_trgm` extension | Requires enabling a Postgres extension on Neon — possible but adds infra coupling; similarity threshold tuning belongs in application code where it can be tested | fastest-levenshtein in Node |
| Any new map library | react-leaflet already exposes `useMap()` and `flyTo()` — adding a wrapper library would duplicate existing capability | existing react-leaflet hooks |

---

## Integration Points

### Venue deduplication — where to call

Modify `findOrCreateVenue()` in `src/lib/scraper/ticketmaster.ts`. After the `ilike` exact-match miss, load all venues in the same city and score each against the incoming name with `distance()`. If the best score is within threshold (proportional: `distance / Math.max(a.length, b.length) < 0.15`), return the existing venue ID instead of inserting a new row.

```typescript
import { distance } from 'fastest-levenshtein';

const VENUE_SIMILARITY_THRESHOLD = 0.15; // 15% edit distance ratio

function isSameVenue(a: string, b: string): boolean {
  const normalized_a = a.toLowerCase().trim();
  const normalized_b = b.toLowerCase().trim();
  const d = distance(normalized_a, normalized_b);
  return d / Math.max(normalized_a.length, normalized_b.length) < VENUE_SIMILARITY_THRESHOLD;
}
```

### Event deduplication — where to call

Modify `upsertEvent()` in `src/lib/scraper/normalizer.ts`. Before the `onConflictDoUpdate` insert, query for events at the same `venue_id` on the same date. Score each against the incoming `normalized_performer`. If similarity is high enough (edit distance <= 2 for names under 20 chars, or proportional for longer), treat as same event.

The existing `uniqueIndex('events_dedup_key')` on `(venue_id, event_date, normalized_performer)` already handles exact matches via `onConflictDoUpdate`. Fuzzy dedup only needs to catch near-misses that slip past the unique index (e.g., "The East Pointers" vs "East Pointers").

### Zoom-to-location — wiring path

`EventCard` already fires `onClickVenue(venueId, lat, lng)`. Lift this state to a `flyToTarget: { lat, lng, venueId }` setter in the parent, pass to `MapClient` → `MapViewController`. Pattern is identical to the existing province-zoom behavior — no architectural change required.

### Timelapse category chips — placement

Add a chip strip inside `MapClient.tsx`, conditionally rendered when `mapMode === 'timelapse'`, positioned above the `TimelineBar` via absolute positioning. Read `category` from nuqs using `useEventFilters()`. No new state, no new library.

---

## Stack Patterns by Variant

**Deduplication threshold tuning:**
- Venue names: Use proportional threshold `distance / Math.max(a.length, b.length) < 0.15` — catches "Marquee Ballroom" vs "The Marquee Ballroom" (distance 4, ratio 0.13) without false positives.
- Performer names: After `normalizePerformer()` normalization, distance <= 2 covers common abbreviations and typos. Same proportional guard for longer names.

**Running dedup during scrape only (not at read time):**
- Dedup runs in the nightly scrape cron (server, Node.js context) — no bundle size concern, no Edge runtime constraint.
- `fastest-levenshtein` does not need to run in the browser or Vercel Edge middleware.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| fastest-levenshtein@1.0.16 | Node.js 18+, TypeScript 5 | Ships own types, no `@types/` package needed |
| fastest-levenshtein@1.0.16 | Vercel serverless functions | Pure JS, no native bindings, no wasm — cold start safe |

---

## Sources

- npm registry — `npm info fastest-levenshtein` — version 1.0.16, modified 2022-08-02 (stable, no open issues)
- npm registry — `npm info natural` — version 8.1.1, modified 2026-02-27, 13.8 MB (active but oversized)
- npm registry — `npm info string-similarity time.modified` — 2023-05-01 (unmaintained)
- [npm-compare: fuse.js vs string-similarity vs natural](https://npm-compare.com/fuse.js,natural,string-natural-compare,string-similarity) — download/popularity comparison, MEDIUM confidence
- [react-leaflet official docs — Map creation and interactions](https://react-leaflet.js.org/docs/api-map/) — confirmed `useMap()` hook and `flyTo` via Leaflet instance, HIGH confidence
- Codebase analysis (direct file reads) — `MapViewController.tsx`, `EventCard.tsx`, `MapClient.tsx`, `EventFilters.tsx`, `TimelineBar.tsx`, `normalizer.ts`, `ticketmaster.ts`, `schema.ts` — confirmed existing infrastructure, HIGH confidence

---
*Stack research for: East Coast Local v1.5 — deduplication + UX polish*
*Researched: 2026-03-15*
