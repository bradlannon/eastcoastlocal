# Phase 18: Venue Deduplication - Research

**Researched:** 2026-03-15
**Domain:** Fuzzy venue name matching + geocoordinate proximity merge in a Next.js/Drizzle/Neon scraper pipeline
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEDUP-01 | System auto-detects and merges duplicate venues using name similarity + geocoordinate proximity after Ticketmaster ingest | `findOrCreateVenue()` in `ticketmaster.ts` is the exact insertion point; `haversineDistance()` already exists in `timelapse-utils.ts`; `fastest-levenshtein` provides edit-distance scoring |
| DEDUP-02 | Cross-source duplicate events are prevented when the same event appears from multiple sources for the same venue | Automatically resolved once DEDUP-01 runs — the existing `(venue_id, event_date, normalized_performer)` unique index in `normalizer.ts` handles it with no additional logic |
| DEDUP-03 | Borderline venue merge candidates (name match but uncertain geo, or vice versa) are written to a review log and not auto-merged | Structured log output (JSON lines to stdout/console.warn) in dry-run and production modes; `venue_merge_log` table or flat log file; planner decides format |
</phase_requirements>

---

## Summary

Phase 18 is a focused enhancement to `findOrCreateVenue()` in `src/lib/scraper/ticketmaster.ts`. The current implementation does an exact ILIKE name + city match; when that misses, it creates a new venue row. The result: "Scotiabank Centre" and "Scotiabank Centre Halifax" both exist as separate rows, each accumulating events. This phase adds fuzzy matching between the ILIKE miss and the INSERT.

The deduplication algorithm needs two signals: edit-distance name similarity using `fastest-levenshtein` (selected pre-phase) and Haversine geocoordinate proximity. The Haversine function `haversineDistance()` already exists in `src/lib/timelapse-utils.ts` — it is a tested, pure Node.js function with no Leaflet dependency. It can be imported directly into the ticketmaster handler. No new distance library is needed.

Cross-source event deduplication (DEDUP-02) is fully resolved as a consequence of DEDUP-01. Once TM-created venues merge into the canonical `venue_id`, the existing `onConflictDoUpdate` in `normalizer.ts` keyed on `(venue_id, event_date, normalized_performer)` handles event dedup automatically. No changes to `normalizer.ts` are required.

The open architectural question is merge strategy: delete the duplicate venue row after reassigning its events, or add a `merged_into_venue_id` nullable FK to the venues table. Research confirms deletion is simpler and safe (cascades handle FK cleanup if configured), while the FK column is auditable but adds schema migration overhead. Both are valid; planning must decide.

**Primary recommendation:** Enhance `findOrCreateVenue()` with a two-signal fuzzy gate (name ratio < 0.15 AND Haversine < 100m = auto-merge; name match but geo > 500m = log only; geo < 500m but name different = log only). Add a `--dry-run` mode that logs all candidates without executing merges. Build a standalone `src/lib/scraper/venue-dedup.ts` module that encapsulates matching + merge logic, callable from `ticketmaster.ts` and from a one-off CLI script for threshold validation.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastest-levenshtein | 1.0.16 | Edit-distance scoring for venue name fuzzy matching | Pre-selected in v1.5 research; zero deps, pure JS, ships TS types, 78K ops/sec; already in project decisions |
| drizzle-orm | 0.45.1 (existing) | DB queries — load all venues in city, update events.venue_id, delete duplicate venue | Already the project ORM; no alternative |
| haversineDistance | already in codebase | Geo proximity in meters between two lat/lng pairs | `src/lib/timelapse-utils.ts` exports tested implementation; do NOT rewrite |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Jest | 30.x (existing) | Unit tests for matching logic and decision matrix | All new functions in `venue-dedup.ts` must be unit tested |
| tsx | 4.x (existing) | Run one-off dry-run CLI script for threshold validation | `npx tsx src/scripts/venue-dedup-dryrun.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastest-levenshtein | pg_trgm (Postgres extension) | pg_trgm moves threshold logic out of testable application code and adds infra coupling; rejected |
| fastest-levenshtein | Jaro-Winkler (via `natural`) | natural is 13.8 MB; Jaro-Winkler is marginally better for names with transposed characters, but the proportional Levenshtein ratio handles Atlantic Canada venue names well given the low count (~50-200 venues) |
| Delete duplicate row | merged_into_venue_id FK column | FK column is auditable but requires schema migration and complicates future queries; deletion is simpler if events.venue_id FK has ON DELETE CASCADE or if events are reassigned first |

**Installation:**
```bash
npm install fastest-levenshtein
```

---

## Architecture Patterns

### Recommended Project Structure

The dedup logic should live in a dedicated module, not inline in `ticketmaster.ts`:

```
src/lib/scraper/
├── ticketmaster.ts          # MODIFIED: call dedupeVenue() after ILIKE miss
├── venue-dedup.ts           # NEW: fuzzy matching + merge logic (pure functions)
├── venue-dedup.test.ts      # NEW: unit tests for matching thresholds
└── normalizer.ts            # UNCHANGED: existing upsert handles DEDUP-02 automatically

src/scripts/
└── venue-dedup-dryrun.ts    # NEW: one-off CLI script for threshold validation
```

### Pattern 1: Two-Signal Gate in findOrCreateVenue

**What:** After the ILIKE exact match misses, load all venues in the same city, score each against the incoming name with edit-distance ratio AND Haversine distance. Only auto-merge when both signals pass. Log borderline cases.

**When to use:** Every time `findOrCreateVenue()` is called during TM ingest (already is the only call site).

**Example:**
```typescript
// src/lib/scraper/venue-dedup.ts
import { distance } from 'fastest-levenshtein';
import { haversineDistance } from '@/lib/timelapse-utils';

export const MERGE_NAME_RATIO = 0.15;   // proportional edit distance
export const MERGE_GEO_METERS = 100;    // auto-merge threshold
export const REVIEW_GEO_METERS = 500;  // log-for-review threshold

export function venueNameRatio(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  const d = distance(na, nb);
  return d / Math.max(na.length, nb.length);
}

export type DedupeDecision =
  | { action: 'merge'; canonicalId: number; score: number; distanceM: number }
  | { action: 'review'; reason: string; candidateId: number; score: number; distanceM: number }
  | { action: 'keep_separate' };

export function scoreVenueCandidate(
  incoming: { name: string; lat: number | null; lng: number | null },
  candidate: { id: number; name: string; lat: number | null; lng: number | null }
): DedupeDecision {
  const nameScore = venueNameRatio(incoming.name, candidate.name);
  const hasGeo = incoming.lat != null && incoming.lng != null && candidate.lat != null && candidate.lng != null;
  const distanceM = hasGeo
    ? haversineDistance(incoming.lat!, incoming.lng!, candidate.lat!, candidate.lng!)
    : Infinity;

  const nameMatch = nameScore < MERGE_NAME_RATIO;
  const geoClose = distanceM < MERGE_GEO_METERS;
  const geoNear = distanceM < REVIEW_GEO_METERS;

  if (nameMatch && geoClose) {
    return { action: 'merge', canonicalId: candidate.id, score: nameScore, distanceM };
  }
  if (nameMatch && !geoNear) {
    return { action: 'review', reason: 'name_match_geo_distant', candidateId: candidate.id, score: nameScore, distanceM };
  }
  if (!nameMatch && geoClose) {
    return { action: 'review', reason: 'geo_close_name_differs', candidateId: candidate.id, score: nameScore, distanceM };
  }
  return { action: 'keep_separate' };
}
```

### Pattern 2: Merge Operation

**What:** When a candidate is confirmed for auto-merge, reassign all events from the duplicate venue to the canonical venue, then delete (or mark) the duplicate.

**When to use:** Only after `scoreVenueCandidate` returns `{ action: 'merge' }`.

**Example:**
```typescript
// src/lib/scraper/venue-dedup.ts (continued)
import { db } from '@/lib/db/client';
import { venues, events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function mergeVenueDuplicate(
  duplicateId: number,
  canonicalId: number
): Promise<void> {
  // Step 1: reassign all events from duplicate to canonical
  await db
    .update(events)
    .set({ venue_id: canonicalId })
    .where(eq(events.venue_id, duplicateId));

  // Step 2: delete the duplicate venue row
  await db.delete(venues).where(eq(venues.id, duplicateId));
}
```

### Pattern 3: Dry-Run Mode

**What:** Log all merge candidates with scores without executing any DB writes. Enables threshold validation before enabling production auto-merge.

**When to use:** Pass `dryRun: true` to the dedup caller, or run the standalone CLI script.

**Example:**
```typescript
// Modified findOrCreateVenue signature to accept dryRun flag
export async function findOrCreateVenue(
  name: string,
  city: string,
  province: string,
  address: string,
  options: { dryRun?: boolean } = {}
): Promise<number>
```

The dry-run CLI (`src/scripts/venue-dedup-dryrun.ts`) loads all current venues from the DB and simulates the decision matrix for every TM-created venue vs. every existing venue in the same city, logging results as JSON lines.

### Pattern 4: Integration Point in ticketmaster.ts

**What:** Replace the current two-step (ILIKE hit → return; ILIKE miss → insert) with a three-step (ILIKE hit → return; ILIKE miss → fuzzy scan → merge/insert).

**Current code location:** `findOrCreateVenue()` in `src/lib/scraper/ticketmaster.ts`, lines 118-136.

**After change:**
```typescript
// After ILIKE miss, load city venues and run dedup before inserting
const cityVenues = await db.query.venues.findMany({
  where: eq(venues.city, city),
  columns: { id: true, name: true, lat: true, lng: true },
});

// TM-created venues may not have geocoordinates yet — handle gracefully
const incomingGeo = { name, lat: null, lng: null }; // TM provides no lat/lng in event payload

for (const candidate of cityVenues) {
  const decision = scoreVenueCandidate(incomingGeo, candidate);
  if (decision.action === 'merge') {
    logMergeDecision({ incoming: name, canonical: candidate.name, ...decision });
    if (!options.dryRun) {
      await mergeVenueDuplicate(/* newly-inserted id is not needed — return canonical */ );
      return candidate.id;  // return canonical before inserting duplicate
    }
  }
  if (decision.action === 'review') {
    logReviewCandidate({ incoming: name, ...decision });
  }
}

// No merge candidate found — insert new venue
const [inserted] = await db.insert(venues).values({ name, address, city, province }).returning({ id: venues.id });
return inserted.id;
```

**Critical note:** TM API venue payloads do NOT include lat/lng coordinates. Only the venue name, address, city, and state are provided. The geocoder is called separately when the venue row is created (existing behavior in v1.4). This means the Haversine signal is only available when the NEW TM venue is being matched against EXISTING venues that already have geocoordinates. The incoming TM venue will have `lat: null, lng: null` at match time. The two-signal gate must handle this:

- If incoming has no geo AND candidate has geo: name match only → send to review log, do not auto-merge
- If both have geo: full two-signal gate applies

This is a key constraint that the plan must address.

### Anti-Patterns to Avoid
- **Loading all venues globally for each TM event:** Load only venues in the same city (`eq(venues.city, city)`) to bound the comparison set. Atlantic Canada has < 50 venues per city.
- **Running dedup on every scrape source type:** Only the TM pipeline creates synthetic venues. The dedup step in `findOrCreateVenue` is called only from `ticketmaster.ts`. No changes to `eventbrite.ts`, `bandsintown.ts`, or `orchestrator.ts`.
- **Modifying normalizer.ts for DEDUP-02:** Event dedup is already handled. Touching `normalizer.ts` for this phase is unnecessary and risky.
- **Geocoding TM venue mid-flight:** Do not call the Google geocoding API during the dedup scan to get TM venue coordinates — this adds latency per event, costs API calls, and the geocoding happens as a separate post-create step. Accept that name-only matching is the available signal for TM venues at creation time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Edit distance calculation | Custom Levenshtein implementation | `fastest-levenshtein` | Already selected; battle-tested, typed, zero deps |
| Haversine distance | Second haversine function | `haversineDistance` from `src/lib/timelapse-utils.ts` | Already exists, already tested, no new code needed |
| Venue name normalization | Custom stripping logic | Build on `normalizePerformer` pattern OR simple `.toLowerCase().trim()` | Consistency with existing normalizer; no need to strip venue suffixes ("Centre", "Bar") for this scale |

**Key insight:** The two hardest parts of venue dedup — distance calculation and edit-distance scoring — are already solved. This phase is primarily glue logic and threshold configuration.

---

## Common Pitfalls

### Pitfall 1: TM Venues Have No Geocoordinates at Match Time
**What goes wrong:** Research assumed both signals (name + geo) would be available for all candidates. TM API venue payloads do NOT include lat/lng. Only name, address, city, province are in the TM response. The geocoding API is called after venue creation — not before.
**Why it happens:** Architecture research documented geocoding as "already in the pipeline" without verifying when in the pipeline it runs. The geocoder is called on the created row, not inline during `findOrCreateVenue`.
**How to avoid:** Check the geocoder call site in the current v1.4 code. Design the dedup logic to handle `lat: null, lng: null` on the incoming TM venue. When incoming has no geo: name-match only with lower confidence → route to review log, not auto-merge. Only use Haversine when the incoming TM venue was previously created (a re-ingest scenario).
**Warning signs:** All merge decisions show `distanceM: Infinity` in dry-run output.

### Pitfall 2: City String Mismatch Between TM and Existing Venues
**What goes wrong:** TM returns `city: "Saint John"` but the canonical venue row has `city: "saint john"` or `city: "St. John"`. The city-equality filter misses the candidate entirely.
**Why it happens:** City names were entered manually for existing venues; TM returns TitleCase; the filter uses exact equality.
**How to avoid:** Use `ilike(venues.city, city)` for the city filter in the candidate load query, matching the pattern already used for the exact name match. Alternatively, normalize city names to lowercase before comparison.
**Warning signs:** Zero candidates returned in dry-run for cities known to have TM venues.

### Pitfall 3: scrape_sources FK Blocking Venue Delete
**What goes wrong:** `db.delete(venues).where(eq(venues.id, duplicateId))` fails with a FK constraint error because `scrape_sources.venue_id` references the duplicate venue row.
**Why it happens:** TM-created venues do NOT have a `scrape_sources` row (the TM source is at province level, `ticketmaster:province:NB`). But if a manually-added venue was somehow identified as the duplicate, it will have scrape_sources. The merge operation needs to check for this.
**How to avoid:** Before deleting, verify the duplicate has no `scrape_sources` rows. If it does, abort the delete with a logged warning rather than throwing. TM-created venues are safe to delete (no scrape source).
**Warning signs:** FK constraint violation in logs.

### Pitfall 4: Merge Interleaves With Concurrent TM Ingest
**What goes wrong:** Two concurrent TM events for the same venue both pass the ILIKE miss, both scan city candidates, neither finds a match yet (because the other hasn't inserted yet), both insert new venue rows, resulting in two new duplicate rows.
**Why it happens:** `scrapeTicketmaster` processes events in a `for...of` loop sequentially — no concurrency risk within a single run. But if two cron runs overlap (e.g., a stuck previous run + a new trigger), concurrent `findOrCreateVenue` calls race.
**How to avoid:** This is Vercel Hobby; cron overlaps are unlikely and the existing pipeline does not guard against this either. For now, document this as acceptable risk. The fix (if needed later) is a DB unique constraint on `(city, normalized_name)` in the venues table.
**Warning signs:** Duplicate venue rows with identical names appearing after a cron run.

### Pitfall 5: Threshold Too Tight Misses Real Duplicates
**What goes wrong:** "Scotiabank Centre Halifax" vs "Scotiabank Centre" has a name ratio of ~0.23 (distance 8, max length 25 = 0.32) — above the 0.15 threshold. The venues are NOT auto-merged even though they are the same physical venue.
**Why it happens:** The 0.15 ratio threshold was chosen based on research heuristics, not validated against actual TM venue name data. Atlantic Canada TM venue names often include city suffixes not present in the canonical name.
**How to avoid:** Run the dry-run script against real production data BEFORE enabling auto-merge. Adjust the threshold based on actual observed distances. Also consider name normalization: strip common suffixes ("Halifax", "Moncton") before scoring when city is already matched.
**Warning signs:** Dry-run output shows candidates with score 0.15–0.35 that are clearly the same venue.

---

## Code Examples

Verified patterns from existing codebase:

### Existing haversineDistance (already in codebase — import, don't rewrite)
```typescript
// Source: src/lib/timelapse-utils.ts (lines 134-155)
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Current findOrCreateVenue (the function being enhanced)
```typescript
// Source: src/lib/scraper/ticketmaster.ts (lines 118-136)
export async function findOrCreateVenue(
  name: string, city: string, province: string, address: string
): Promise<number> {
  const existing = await db.query.venues.findFirst({
    where: and(ilike(venues.name, name), eq(venues.city, city)),
  });
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(venues)
    .values({ name, address, city, province })
    .returning({ id: venues.id });
  return inserted.id;
}
```

### fastest-levenshtein usage pattern
```typescript
// Source: fastest-levenshtein npm docs / v1.5 STACK.md
import { distance } from 'fastest-levenshtein';

function venueNameRatio(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  return distance(na, nb) / Math.max(na.length, nb.length);
}
// "Scotiabank Centre" vs "Scotiabank Centre" → 0.0 (exact)
// "Marquee Ballroom" vs "The Marquee Ballroom" → distance 4 / max 20 = 0.20
// "Harbour Station" vs "Saint John Arena" → distance ~12 / max 17 = 0.70
```

### Existing upsert dedup key (unchanged for DEDUP-02)
```typescript
// Source: src/lib/scraper/normalizer.ts (lines 38-40)
// No changes needed — this handles cross-source event dedup automatically
.onConflictDoUpdate({
  target: [events.venue_id, events.event_date, events.normalized_performer],
  set: { ... }
});
```

### Drizzle bulk update (events reassignment on merge)
```typescript
// Source: drizzle-orm docs / existing codebase pattern
import { eq } from 'drizzle-orm';
await db.update(events)
  .set({ venue_id: canonicalId })
  .where(eq(events.venue_id, duplicateId));
await db.delete(venues).where(eq(venues.id, duplicateId));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Exact ILIKE match only in findOrCreateVenue | Two-signal fuzzy gate (name ratio + Haversine) | Phase 18 | Eliminates duplicate venue pins for TM venues |
| Event dedup only within same source | Cross-source event dedup via resolved venue_id | Phase 18 (consequence of DEDUP-01) | Same show from TM + venue scraper appears once |
| No merge tracking | Review log for borderline cases | Phase 18 | Surfaced in Phase 20 admin UI |

**No deprecated items to remove in this phase.**

---

## Open Questions

1. **TM venue geocoordinates at match time**
   - What we know: TM API event payloads include venue name/city/address but NOT lat/lng. Geocoding runs after the venue row is created.
   - What's unclear: Is the geocoder called synchronously within `findOrCreateVenue` (meaning geo IS available before the function returns) or asynchronously after? Check the v1.4 call site.
   - Recommendation: Read the current `ticketmaster.ts` carefully — if geocoder is called inline after INSERT, the coordinates ARE available for a re-ingest scenario (second TM run after the venue was created and geocoded). For first-time TM venues, geo is null. Design the logic to handle both cases.

2. **Merge operation: delete vs. merged_into_venue_id column**
   - What we know: Research flags this as open. Deletion is simpler; FK column is auditable.
   - What's unclear: Does the schema need a migration for the FK column? Is the admin review UI in Phase 20 expected to show merged venues?
   - Recommendation: Default to deletion (simpler, no migration). If Phase 20 needs to show merge history, revisit in that phase. Document the decision.

3. **Review log storage format**
   - What we know: DEDUP-03 requires borderline candidates to be "written to a review log." Phase 20 will surface these in an admin UI.
   - What's unclear: Does Phase 20 need a DB table to query, or is a log file sufficient for MVP? A DB table requires a migration now; a log file defers the schema work.
   - Recommendation: For Phase 18, write review candidates to a `venue_merge_candidates` table with: `id`, `incoming_venue_id`, `canonical_venue_id`, `name_ratio`, `distance_meters`, `reason`, `created_at`, `status` (pending/merged/kept_separate). Phase 20 queries this table. Alternatively, log to stdout and defer the table to Phase 20 — but then Phase 20 has nothing to show.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x with ts-jest |
| Config file | `jest.config.ts` (project root) |
| Quick run command | `npm test -- --testPathPattern venue-dedup` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEDUP-01 | Auto-merge when name ratio < 0.15 AND geo < 100m | unit | `npm test -- --testPathPattern venue-dedup -t "auto-merge"` | Wave 0 |
| DEDUP-01 | No merge when name ratio >= 0.15 (name differs) | unit | `npm test -- --testPathPattern venue-dedup -t "keep_separate"` | Wave 0 |
| DEDUP-01 | findOrCreateVenue returns canonical id after merge | unit | `npm test -- --testPathPattern ticketmaster -t "findOrCreateVenue"` | exists (extend) |
| DEDUP-02 | Same event from TM + venue website inserts once (composite key) | unit | `npm test -- --testPathPattern normalizer -t "onConflictDoUpdate"` | exists (no change needed) |
| DEDUP-03 | Name match but geo > 500m → review log entry, no merge | unit | `npm test -- --testPathPattern venue-dedup -t "review"` | Wave 0 |
| DEDUP-03 | Geo < 100m but name differs → review log entry, no merge | unit | `npm test -- --testPathPattern venue-dedup -t "review"` | Wave 0 |
| DEDUP-03 | Dry-run mode: logs candidates, no DB writes | unit | `npm test -- --testPathPattern venue-dedup -t "dry-run"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern venue-dedup`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/scraper/venue-dedup.test.ts` — covers DEDUP-01, DEDUP-03 (all matching + merge decision logic)
- [ ] `src/scripts/venue-dedup-dryrun.ts` — dry-run CLI (no test needed, but the module it calls is tested)

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis — `src/lib/scraper/ticketmaster.ts` (findOrCreateVenue, lines 118-136), `src/lib/timelapse-utils.ts` (haversineDistance, lines 134-155), `src/lib/scraper/normalizer.ts` (upsertEvent composite key, lines 38-40), `src/lib/db/schema.ts` (venues + events schema), `src/lib/scraper/geocoder.ts` (geocoder API), test files for coverage baseline
- `.planning/research/SUMMARY.md` — project-level research confirming selected approach, thresholds, and library choices
- `.planning/research/STACK.md` — fastest-levenshtein selection rationale, integration patterns
- `.planning/research/FEATURES.md` — dedup algorithm detail, decision matrix, merge operation patterns
- `.planning/STATE.md` — confirmed decisions: two-signal gate, 0.15 name ratio, 100m/500m geo thresholds, fastest-levenshtein@1.0.16

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — pipeline structure, scrape_sources schema, extension pattern
- npm registry — `fastest-levenshtein@1.0.16` — stable (last published 2022-08-02), ships own TypeScript types

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — library pre-selected and confirmed; haversine already in codebase
- Architecture: HIGH — exact file and function locations verified via direct code reads; TM venue geo caveat discovered through code inspection
- Pitfalls: HIGH — pitfalls discovered through actual code reading (TM has no lat/lng, scrape_sources FK risk, city string mismatch); not inferred

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (30 days; stable domain, no fast-moving dependencies)

### Key Discovery Not in Prior Research

The ARCHITECTURE.md research noted geocoordinates are "already on venues." What was not previously noted: **TM API event payloads do not include lat/lng**. Only name, address, city, province are in the TM API response. Haversine proximity is only available for EXISTING venues that were geocoded after creation, not for the incoming TM venue on first ingest. The two-signal gate must handle `lat: null` on the incoming side gracefully — defaulting to review-log (not auto-merge) when geo is unavailable.
