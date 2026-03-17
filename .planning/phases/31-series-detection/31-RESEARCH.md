# Phase 31: Series Detection - Research

**Researched:** 2026-03-16
**Domain:** Post-scrape series detection, Levenshtein fuzzy grouping, Drizzle batch upsert, cron integration
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SER-02 | Post-scrape enrichment detects recurring patterns (same performer + venue + regular weekday interval) | `series-detector.ts` queries non-archived events grouped by (venue_id, normalized_performer), counts occurrences, checks weekday regularity; called from `orchestrator.ts` after all upserts complete |
| SER-03 | Keyword heuristic detects explicit recurrence signals ("every", "weekly", "open mic", etc.) | Keyword check on raw `performer` + `description` fields in detector, bypasses min-occurrence threshold |
| SER-04 | Fuzzy name matching (~20% Levenshtein) groups minor name variations into same series | `fastest-levenshtein` already installed and used in `venue-dedup.ts`; same `distance(a, b) / max(len) < 0.20` pattern |
| SER-05 | Gemini extraction includes optional recurrence_pattern hint from page content | `ExtractedEventSchema` already has `recurrence_pattern: z.string().optional()` — schema done; extractor prompt needs updated instructions to populate it; detector reads it as a supplementary signal |
| SER-06 | Existing events backfilled with series detection on first run | One-shot script at `src/lib/db/backfill-series.ts` modeled on `backfill-categories.ts`; runs via `tsx` from command line |
</phase_requirements>

---

## Summary

Phase 31 builds a series detector that runs as a post-scrape pass after every scrape job. The schema prerequisites (recurring_series table, series_id FK on events, recurrence_pattern in ExtractedEventSchema) were all delivered in Phase 29 and are live. The implementation has three moving parts: (1) a `series-detector.ts` library that contains the detection algorithm, (2) an integration hook at the end of `runScrapeJob()` in `orchestrator.ts`, and (3) a one-shot backfill script for existing events.

The detection algorithm groups non-archived events by `(venue_id, normalized_performer)`, then applies three independent detection signals: weekday regularity (same weekday appearing 3+ times in 90 days), keyword heuristic ("every", "weekly", "open mic", "trivia", "bingo" in performer/description), and Gemini's `recurrence_pattern` hint. Any event group that triggers at least one signal gets upserted into `recurring_series` and its events tagged via `series_id`.

Fuzzy name grouping uses `fastest-levenshtein` (already installed at 1.0.16) with a 20% proportional distance threshold — the same pattern already proven in `venue-dedup.ts`. The key difference for series detection is that fuzzy matching happens at grouping time: before querying the DB, candidate performer names within the same venue are clustered so minor variations ("Open Mic Night" vs "Open Mic") map to the same normalized representative and thus the same `recurring_series` row.

The Vercel 60s cron timeout is the most significant operational constraint. The scrape cron (`/api/cron/scrape`) already runs at the limit for large source counts. State.md records an unresolved concern about whether the scrape cron has headroom. The safest design is a **dedicated detect endpoint** at `/api/cron/detect-series` that runs immediately after scrape (e.g., 6:10am UTC) rather than inline in `runScrapeJob()`. This decouples budgets and allows the detection pass to fail independently without impacting scrape results.

**Primary recommendation:** Build `series-detector.ts` as a pure library function (no cron knowledge, fully testable), add a dedicated `/api/cron/detect-series` endpoint with its own vercel.json entry, add a `detect-series` case to the admin trigger switch, and deliver the backfill script as a standalone `tsx` script.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastest-levenshtein | 1.0.16 | Edit distance for fuzzy name grouping | Already installed; used in `venue-dedup.ts`; zero native dependencies, pure JS |
| drizzle-orm | 0.45.1 | DB queries (select events, upsert recurring_series, update events.series_id) | Project-standard ORM; `db.select`, `db.insert().onConflictDoUpdate()`, `db.update()` patterns established |
| drizzle-kit | 0.31.9 | No new migration needed — schema complete from Phase 29 | N/A this phase |
| zod | 4.3.6 | ExtractedEventSchema already includes recurrence_pattern — no changes to schema | N/A |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.21.0 | Run backfill script directly without tsc compilation | `tsx src/lib/db/backfill-series.ts` for first-run backfill |
| date-fns | 4.1.0 | `getDay()` for weekday extraction from event_date | Already installed; alternative is native `new Date().getDay()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastest-levenshtein | string-similarity (Dice coefficient) | fastest-levenshtein already installed and proven; no new dep needed |
| Dedicated detect cron | Inline in runScrapeJob | Inline risks Vercel 60s timeout overflow; dedicated cron runs in its own budget |
| tsx backfill script | One-time DB migration | Migration is permanent schema change; backfill is application logic (better as script) |

**Installation:** No new packages needed — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
```
src/lib/
├── series-detector.ts       # Core detection algorithm (new)
├── series-detector.test.ts  # Unit tests for detector (new)
├── db/
│   └── backfill-series.ts   # One-shot backfill script (new)
src/app/api/cron/
├── detect-series/
│   ├── route.ts             # CRON_SECRET-protected GET endpoint (new)
│   └── route.test.ts        # Auth + job delegation tests (new)
src/app/api/admin/trigger/[job]/
└── route.ts                 # Add 'detect-series' case (edit existing)
vercel.json                  # Add detect-series cron entry (edit existing)
```

### Pattern 1: Detection Algorithm Structure

**What:** `detectAndTagSeries()` is a single async function in `series-detector.ts`. It: fetches all non-archived events grouped by venue, applies fuzzy clustering within each venue group, scores each cluster against three signals, upserts series rows, then batch-updates event `series_id`.

**When to use:** Called after scrape completes. Also called directly by the backfill script.

**Example:**
```typescript
// src/lib/series-detector.ts
import { db } from '@/lib/db/client';
import { events, recurring_series } from '@/lib/db/schema';
import { isNull, eq, and, inArray } from 'drizzle-orm';
import { distance } from 'fastest-levenshtein';

export const SERIES_LEVENSHTEIN_THRESHOLD = 0.20; // ~20% edit distance
export const SERIES_MIN_OCCURRENCES = 3;          // min dates to call it a pattern
export const SERIES_WINDOW_DAYS = 90;             // look back window

export const RECURRENCE_KEYWORDS = [
  'every', 'weekly', 'open mic', 'trivia', 'bingo',
  'karaoke', 'open stage', 'jam night', 'quiz night',
];

export function performerFuzzyRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return distance(a, b) / maxLen;
}

export function hasRecurrenceKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return RECURRENCE_KEYWORDS.some(kw => lower.includes(kw));
}

export function isWeekdayRegular(dates: Date[]): boolean {
  if (dates.length < SERIES_MIN_OCCURRENCES) return false;
  const weekdayCounts = new Map<number, number>();
  for (const d of dates) {
    const wd = d.getDay();
    weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
  }
  return [...weekdayCounts.values()].some(count => count >= SERIES_MIN_OCCURRENCES);
}

export async function detectAndTagSeries(): Promise<{ seriesUpserted: number; eventsTagged: number }> {
  // ... implementation
}
```

### Pattern 2: Fuzzy Grouping Within a Venue

**What:** Before scoring, events for the same venue are clustered by normalized_performer with 20% Levenshtein tolerance. The cluster representative (first encountered or most common variant) becomes `normalized_performer` for the `recurring_series` row.

**When to use:** During the grouping phase before occurrence counting.

**Example:**
```typescript
// Group performers by fuzzy similarity
function clusterPerformers(
  normalizedPerformers: string[]
): Map<string, string[]> {
  const clusters = new Map<string, string[]>(); // representative → all variants
  for (const name of normalizedPerformers) {
    let matched = false;
    for (const rep of clusters.keys()) {
      if (performerFuzzyRatio(name, rep) < SERIES_LEVENSHTEIN_THRESHOLD) {
        clusters.get(rep)!.push(name);
        matched = true;
        break;
      }
    }
    if (!matched) clusters.set(name, [name]);
  }
  return clusters;
}
```

### Pattern 3: Upsert recurring_series + Tag Events

**What:** For each detected series, INSERT INTO recurring_series ON CONFLICT DO NOTHING (or DO UPDATE updated_at), then UPDATE events SET series_id = <id> WHERE venue_id = X AND normalized_performer IN (...cluster variants).

**When to use:** After a cluster passes any detection signal.

**Example:**
```typescript
// Upsert series row
const [seriesRow] = await db
  .insert(recurring_series)
  .values({ venue_id: venueId, normalized_performer: representative })
  .onConflictDoUpdate({
    target: [recurring_series.venue_id, recurring_series.normalized_performer],
    set: { updated_at: new Date() },
  })
  .returning({ id: recurring_series.id });

// Batch-tag events
await db
  .update(events)
  .set({ series_id: seriesRow.id })
  .where(
    and(
      eq(events.venue_id, venueId),
      inArray(events.normalized_performer, clusterVariants),
      isNull(events.archived_at)   // do not tag archived events
    )
  );
```

### Pattern 4: Dedicated Cron Endpoint

**What:** Mirror the existing `/api/cron/archive/route.ts` pattern exactly: CRON_SECRET Bearer auth, `maxDuration = 60`, call library function, return count JSON.

```typescript
// src/app/api/cron/detect-series/route.ts
import { detectAndTagSeries } from '@/lib/series-detector';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await detectAndTagSeries();
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

### Pattern 5: Backfill Script

**What:** Mirror `backfill-categories.ts` — `dotenv/config` import at top, call `detectAndTagSeries()`, log results, `process.exit(0)`.

```typescript
// src/lib/db/backfill-series.ts
import 'dotenv/config';
import { detectAndTagSeries } from '@/lib/series-detector';

async function main() {
  const result = await detectAndTagSeries();
  console.log(`Backfill complete: ${result.seriesUpserted} series, ${result.eventsTagged} events tagged`);
}

main().catch(console.error).finally(() => process.exit(0));
// Run: tsx src/lib/db/backfill-series.ts
```

### Pattern 6: Extractor Prompt Update for recurrence_pattern (SER-05)

**What:** `extractor.ts` prompt needs a `recurrence_pattern` field instruction added. The Zod schema already accepts it; the prompt just doesn't ask Gemini to populate it yet.

**When to use:** In the same task that wires the detector — so the hint flows into detection from day one.

**Example addition to extractor.ts prompt:**
```
- recurrence_pattern: if the page indicates this event repeats on a schedule
  (e.g., "every Tuesday", "weekly open mic", "first Friday of each month"),
  capture that pattern as a short string. Omit if no recurrence is indicated.
```

### Anti-Patterns to Avoid

- **Running detection inline in `runScrapeJob()`:** Risks blowing the 60s cron timeout when source count is high. Keep detection in its own cron budget.
- **Tagging archived events:** Detection WHERE clause must include `isNull(events.archived_at)` — archived events must not be linked to series (their series_id is irrelevant after archival).
- **Using `normalized_performer` from events table directly as series representative without fuzzy clustering:** Minor name variations ("Open Mic Night" / "Open Mic") would create two separate series for the same real event. Cluster first, then use the representative.
- **Setting MIN_OCCURRENCES = 1 or 2:** A single event or two appearances is not a series. Minimum 3 occurrences prevents false positives from coincidental performer name overlaps across weeks.
- **Querying all events on every detection run (including far-future events):** Scope the detection window to events within the past 90 days + next 90 days. Far-future events don't yet have enough occurrence history to detect patterns.
- **Running the backfill script in production without testing dry-run first:** The backfill will tag all existing events. Validate thresholds against a dry-run count before committing updates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Edit distance between performer names | Custom string comparison | `fastest-levenshtein` `distance()` | Already installed; handles Unicode; benchmark shows 15-50x faster than naive implementations |
| Series uniqueness guarantee | App-level check-before-insert | `recurring_series` `uniqueIndex` on `(venue_id, normalized_performer)` with `ON CONFLICT DO UPDATE` | DB-level uniqueness is atomic; avoids race conditions between concurrent detection runs |
| Recurrence keyword detection | Custom regex | Simple `string.includes()` scan against keyword list | Keyword matching is linear; regex adds no value for short fixed-word matching; easier to extend the list |
| Weekday regularity check | Complex calendar math | `date.getDay()` frequency count | JS native; no library needed for "count how many times each weekday appears" |

**Key insight:** The series detection algorithm is fundamentally a grouping + threshold problem, not a machine-learning problem. Simple heuristics (keyword scan, weekday frequency, Levenshtein distance) are correct for scraped discrete events at Atlantic Canada scale (~hundreds to low thousands of events).

---

## Common Pitfalls

### Pitfall 1: Vercel 60s Timeout — Inline Detection Breaks Scrape Cron

**What goes wrong:** Adding `detectAndTagSeries()` at the end of `runScrapeJob()` pushes the total runtime over 60 seconds when there are many sources. The entire scrape cron fails with a timeout — no events are updated to success status.

**Why it happens:** The scrape cron already runs close to the limit. Detection requires multiple DB round-trips (select events, loop venue groups, upsert series, update events) which adds seconds.

**How to avoid:** Use a dedicated `/api/cron/detect-series` endpoint scheduled a few minutes after scrape (e.g., `0 6 * * *` for scrape, `10 6 * * *` for detection at 6:10am UTC). Both endpoints have independent 60s budgets.

**Warning signs:** `maxDuration exceeded` errors in Vercel logs; source status updates not written; detection never completes.

### Pitfall 2: Fuzzy Clustering Order Dependency

**What goes wrong:** The cluster representative is the first name encountered for a group. If a noisy name ("Open Mic Nite") appears before the canonical form ("Open Mic Night"), it becomes the series representative in `recurring_series.normalized_performer`. Subsequent scraped events with the canonical form won't match the stored representative exactly.

**Why it happens:** Greedy first-match clustering. The order of rows returned by the DB SELECT is not guaranteed.

**How to avoid:** After clustering, choose the most-frequent variant within the cluster as the representative, not the first-encountered. Alternatively, always pick the shortest variant (more likely to be canonical). Either approach is deterministic.

**Warning signs:** Multiple `recurring_series` rows for what looks like the same performer at the same venue.

### Pitfall 3: recurrence_pattern Signal Without Occurrence Count

**What goes wrong:** Gemini returns `recurrence_pattern: "every Tuesday"` for an event that only has one occurrence in the DB. The detector tags it as a series with a single event. This creates orphaned series rows with no recurring pattern — misleading.

**Why it happens:** Keyword and recurrence_pattern signals bypass the `MIN_OCCURRENCES` threshold by design. This is correct for well-known recurring events like trivia nights and open mics, but the signal must come from multiple events or be accompanied by an explicit recurrence phrase.

**How to avoid:** Use keyword/recurrence_pattern as a signal that lowers the threshold (e.g., from 3 to 1 occurrence), not eliminates it entirely. OR: keep the bypass but limit it to the explicit RECURRENCE_KEYWORDS list (domain-specific terms with high precision), not arbitrary Gemini recurrence_pattern strings.

**Recommendation:** Keyword bypass at 1 occurrence is acceptable for the fixed keyword list (these are definitionally recurring). Recurrence_pattern from Gemini should still require MIN_OCCURRENCES = 2 since it's an untrusted AI signal.

### Pitfall 4: Detection Tags Archived Events

**What goes wrong:** The UPDATE events SET series_id = ... WHERE venue_id = X AND normalized_performer IN (...) does not filter `archived_at IS NULL`. Past events get tagged with a series_id even though they are archived.

**Why it happens:** series_id is independent of archived_at in the schema — both are nullable.

**How to avoid:** Always include `isNull(events.archived_at)` in the WHERE clause of the series tag UPDATE. Archived events are effectively read-only after archival.

### Pitfall 5: 90-Day Window Excludes Legitimate Series Evidence

**What goes wrong:** A recurring series that has been running for months only has events in the 90-day window that fall on holidays or venue closures — appearing as 1-2 occurrences. The detector misses it.

**Why it happens:** Fixed 90-day lookback is a reasonable approximation but misses infrequent or seasonally disrupted series.

**How to avoid:** Accept this as a known limitation. The first detection run won't catch every series; subsequent runs accumulate more evidence. SER-06 backfill on first run covers historical events beyond 90 days for initial seeding. Threshold validation against dry-run is essential before go-live.

**Warning signs:** Expected recurring events not tagged in initial backfill.

### Pitfall 6: normalizePerformer Strips Too Aggressively for Series Grouping

**What goes wrong:** `normalizePerformer` in `normalizer.ts` strips all non-alphanumeric characters. "AC/DC Tribute" and "AC DC Tribute" both normalize to "acdc tribute" — identical. But "Open Mic Night" and "Open Mic" normalize to different strings. Fuzzy matching catches them, but only if the Levenshtein threshold is calibrated correctly.

**Why it happens:** The normalizer was designed for dedup (exact-match), not for fuzzy grouping. The normalized forms are used as DB column values; the fuzzy comparison happens on top.

**How to avoid:** Fuzzy comparison in the detector must use the `normalized_performer` values already stored in the DB (not re-normalized from raw). The 20% threshold should be validated against real data. Consider running the detector in dry-run mode to print proposed groupings before committing.

---

## Code Examples

Verified patterns from this codebase:

### fastest-levenshtein usage (from venue-dedup.ts)
```typescript
// Source: src/lib/scraper/venue-dedup.ts (existing pattern)
import { distance } from 'fastest-levenshtein';

function ratio(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return distance(na, nb) / maxLen;
}
// ratio < 0.15 in venue-dedup.ts; use < 0.20 for performer names (more variation expected)
```

### Drizzle select non-archived events by venue (detection query)
```typescript
// Source: derived from src/app/api/events/route.ts pattern
import { isNull, eq } from 'drizzle-orm';
import { events } from '@/lib/db/schema';

const rows = await db
  .select({
    id: events.id,
    venue_id: events.venue_id,
    normalized_performer: events.normalized_performer,
    performer: events.performer,
    description: events.description,
    event_date: events.event_date,
  })
  .from(events)
  .where(isNull(events.archived_at));
// Filter to 90-day window in application code after fetch (or add gte/lte to WHERE)
```

### Drizzle recurring_series upsert (ON CONFLICT DO UPDATE)
```typescript
// Source: established pattern from normalizer.ts + schema uniqueIndex
const [row] = await db
  .insert(recurring_series)
  .values({
    venue_id: venueId,
    normalized_performer: representative,
  })
  .onConflictDoUpdate({
    target: [recurring_series.venue_id, recurring_series.normalized_performer],
    set: { updated_at: new Date() },
  })
  .returning({ id: recurring_series.id });
```

### Drizzle batch update events.series_id
```typescript
// Source: derived from archiver.ts update pattern
import { and, isNull, inArray, eq } from 'drizzle-orm';

await db
  .update(events)
  .set({ series_id: seriesId })
  .where(
    and(
      eq(events.venue_id, venueId),
      inArray(events.normalized_performer, clusterVariants),
      isNull(events.archived_at)
    )
  );
```

### vercel.json detect-series cron entry
```json
{
  "path": "/api/cron/detect-series",
  "schedule": "10 6 * * *"
}
```
(6:10am UTC — 10 minutes after the scrape cron at 6:00am UTC)

### Backfill script pattern (from backfill-categories.ts)
```typescript
// Source: src/lib/db/backfill-categories.ts — same pattern
import 'dotenv/config';
import { detectAndTagSeries } from '@/lib/series-detector';

async function main() {
  const result = await detectAndTagSeries();
  console.log(`[backfill-series] ${result.seriesUpserted} series upserted, ${result.eventsTagged} events tagged`);
}

main().catch(console.error).finally(() => process.exit(0));
// Run: tsx src/lib/db/backfill-series.ts
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Discrete event storage only | Discrete events + series grouping via series_id FK | Phase 29 schema complete | Events can now be grouped for UI collapse (Phase 32) |
| Normalizer strips non-alphanumeric (exact-match dedup) | Fuzzy Levenshtein for series grouping on top of exact dedup | Phase 31 | Catches minor name variations; doesn't break existing exact-match dedup |

**Deprecated/outdated:**
- Inline detection inside scrape cron: Not used in this project (design choice — dedicated cron endpoint).
- RRULE generation: Explicitly out of scope per REQUIREMENTS.md.

---

## Open Questions

1. **Does the scrape cron have headroom for inline detection?**
   - What we know: STATE.md records this as an unresolved concern. scrape cron has `maxDuration = 60`. Number of enabled sources is not confirmed.
   - What's unclear: Current typical runtime of `runScrapeJob()` in production.
   - Recommendation: Design for a dedicated cron endpoint as the default. If scrape runtime is confirmed well under 60s, inline integration is a valid simplification — but dedicate cron is safe regardless.

2. **Should recurrence_pattern from Gemini bypass the MIN_OCCURRENCES threshold?**
   - What we know: Keyword heuristic (SER-03) is intended to detect recurrence regardless of occurrence count. recurrence_pattern is a Gemini hint.
   - What's unclear: Gemini false positive rate for recurrence_pattern.
   - Recommendation: Apply keyword bypass (1 occurrence) only to the fixed RECURRENCE_KEYWORDS list. For Gemini recurrence_pattern, require MIN_OCCURRENCES = 2 as a safety guard.

3. **Should series_id be set on archived events during backfill?**
   - What we know: SER-06 says "all existing events backfilled." Some existing events are already archived.
   - What's unclear: Whether archived events with series_id provide value for Phase 32 UI (which shows only non-archived events).
   - Recommendation: Exclude archived events from series tagging. series_id on archived events has no current use case and adds complexity to the backfill.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x with ts-jest 29.x |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest src/lib/series-detector.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SER-02 | `isWeekdayRegular()` returns true when 3+ events share a weekday | unit | `npx jest src/lib/series-detector.test.ts -t "isWeekdayRegular"` | ❌ Wave 0 |
| SER-02 | `isWeekdayRegular()` returns false for fewer than MIN_OCCURRENCES | unit | `npx jest src/lib/series-detector.test.ts -t "isWeekdayRegular"` | ❌ Wave 0 |
| SER-03 | `hasRecurrenceKeyword()` matches "open mic", "weekly", "every", "trivia", "bingo" | unit | `npx jest src/lib/series-detector.test.ts -t "hasRecurrenceKeyword"` | ❌ Wave 0 |
| SER-03 | `hasRecurrenceKeyword()` returns false for non-keyword performer name | unit | `npx jest src/lib/series-detector.test.ts -t "hasRecurrenceKeyword"` | ❌ Wave 0 |
| SER-04 | `performerFuzzyRatio()` groups "Open Mic Night" and "Open Mic" within 20% threshold | unit | `npx jest src/lib/series-detector.test.ts -t "performerFuzzyRatio"` | ❌ Wave 0 |
| SER-04 | `performerFuzzyRatio()` keeps "Jazz Night" and "Open Mic Night" separate (>20%) | unit | `npx jest src/lib/series-detector.test.ts -t "performerFuzzyRatio"` | ❌ Wave 0 |
| SER-05 | GET /api/cron/detect-series returns 401 without CRON_SECRET | unit | `npx jest src/app/api/cron/detect-series/route.test.ts -t "401"` | ❌ Wave 0 |
| SER-05 | GET /api/cron/detect-series calls detectAndTagSeries and returns 200 | unit | `npx jest src/app/api/cron/detect-series/route.test.ts -t "200"` | ❌ Wave 0 |
| SER-06 | backfill-series.ts script exists and exports correct pattern | manual | `tsx src/lib/db/backfill-series.ts` (dry-run against staging DB) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/lib/series-detector.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/series-detector.ts` — core detection library (not a test gap, a prerequisite)
- [ ] `src/lib/series-detector.test.ts` — unit tests for `isWeekdayRegular`, `hasRecurrenceKeyword`, `performerFuzzyRatio`, `clusterPerformers`
- [ ] `src/app/api/cron/detect-series/route.test.ts` — auth + delegation tests (mirrors `scrape/route.test.ts` pattern)
- [ ] `src/lib/db/backfill-series.ts` — backfill script

*(All are new files; no existing files need new test cases for this phase)*

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db/schema.ts` — confirmed: `recurring_series` table live, `events.series_id` FK live, `recurrence_pattern` in `ExtractedEventSchema`
- `src/lib/scraper/venue-dedup.ts` — `fastest-levenshtein` usage pattern with proportional ratio
- `src/lib/scraper/normalizer.ts` — `normalizePerformer` function signature and behavior
- `src/lib/scraper/orchestrator.ts` — `runScrapeJob()` structure, integration point
- `src/lib/archiver.ts` — batch UPDATE pattern with `isNull` filter
- `src/lib/db/backfill-categories.ts` — backfill script pattern
- `src/app/api/cron/scrape/route.ts` — cron endpoint pattern (CRON_SECRET, maxDuration)
- `src/app/api/admin/trigger/[job]/route.ts` — admin trigger switch pattern
- `vercel.json` — confirmed cron schedule format and existing entries
- `package.json` — confirmed `fastest-levenshtein@1.0.16`, `tsx@4.21.0`, `date-fns@4.1.0` present
- `node_modules/fastest-levenshtein/mod.d.ts` — confirmed `distance(a, b): number` export
- `.planning/STATE.md` — confirmed scrape-timeout concern, detection threshold estimates

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — SER-02 through SER-06 requirements confirmed; out-of-scope items (RRULE, real-time detection) confirmed
- Phase 29 RESEARCH.md — `recurrence_pattern: z.string().optional()` already in ExtractedEventSchema, schema prerequisites confirmed complete

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from installed node_modules; no new packages required
- Architecture: HIGH — all patterns derived from existing code in this repo; detector structure is a natural extension of venue-dedup.ts
- Pitfalls: HIGH — Vercel timeout concern confirmed in STATE.md; fuzzy clustering order dependency is a known algorithmic property; all other pitfalls derived from schema/code inspection
- Validation: HIGH — test framework, file locations, and test patterns all confirmed from existing test files

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable stack; detection thresholds flagged for dry-run validation before go-live)
