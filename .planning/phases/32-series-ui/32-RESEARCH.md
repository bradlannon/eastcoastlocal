# Phase 32: Series UI - Research

**Researched:** 2026-03-16
**Domain:** React/Next.js UI — badge rendering, client-side list collapsing, TypeScript type extension
**Confidence:** HIGH

## Summary

Phase 32 adds two visual features to the public event list: a "Recurring" badge on EventCard when `series_id` is non-null, and collapsing of same-series events in EventList so only the next upcoming occurrence is shown (with a count of total upcoming occurrences).

The data foundation is already complete. The `events` table has a `series_id` integer column (nullable FK to `recurring_series.id`) that Phase 31 backfilled. However, the `/api/events` route does **not** currently select `series_id` — it returns a full `select()` from events which includes all columns, so `series_id` is already present in the raw Drizzle result. The `EventWithVenue` type is derived from `InferSelectModel<typeof events>`, meaning `event.events.series_id` is already typed as `number | null`. No schema changes are needed.

Both UI changes are self-contained: EventCard reads `ev.series_id`, and EventList needs a collapsing step between sort and render. The only integration point is confirming that `series_id` flows through the API response — which it does via the full `select()` in the route. All work is pure TypeScript/React with zero new dependencies.

**Primary recommendation:** Implement the badge directly in EventCard using the existing badge pattern (same `text-xs ... px-1.5 py-0.5 rounded` style as the category badge). Implement series collapsing as a pure utility function in EventList (or a co-located helper) using a Map keyed on `series_id`. Write Jest unit tests for the collapse logic.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | (Next.js 15 peer) | Component rendering | Already in use |
| Tailwind CSS | (project-configured) | Badge styling | All existing badges use Tailwind utility classes |
| date-fns | ^4.1.0 | Date formatting | Already imported in EventCard |
| TypeScript | (ts-jest) | Type safety | All source files are TypeScript |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Jest + ts-jest | ^30.3.0 | Unit tests for collapse logic | Required — nyquist_validation enabled |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side collapse in EventList | Server-side collapse in /api/events | Server-side would be cleaner for performance at scale, but adds API complexity and breaks the client-side filter chain (province/category/bounds filters run after fetch); client-side is the right level for this app |
| Inline collapse logic in EventList | Separate collapseSeriesEvents() utility | Separate utility is easier to unit-test and matches how filter-utils.ts is structured |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/events/
│   ├── EventCard.tsx      # Add "Recurring" badge (series_id check)
│   └── EventList.tsx      # Add series collapse step before render
├── lib/
│   └── series-utils.ts    # collapseSeriesEvents() — pure function, unit-testable
└── lib/
    └── series-utils.test.ts  # Jest tests for collapse logic
```

### Pattern 1: Recurring Badge in EventCard
**What:** Conditionally render a teal/green badge when `ev.series_id` is not null, using the same inline badge pattern already in EventCard for price and category.
**When to use:** Any event with a non-null `series_id` gets the badge.
**Example:**
```typescript
// Pattern mirrors existing category badge in EventCard.tsx (line 77-81)
{ev.series_id !== null && ev.series_id !== undefined && (
  <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-medium">
    Recurring
  </span>
)}
```

### Pattern 2: Series Collapse in EventList
**What:** Before rendering, reduce the sorted event array so that events sharing a `series_id` are represented by only the first/next upcoming occurrence. Attach an `occurrenceCount` to let the card display "X upcoming."
**When to use:** Applied to `sorted` events before `.map()` in EventList.
**Example:**
```typescript
// src/lib/series-utils.ts
export interface CollapsedEvent {
  event: EventWithVenue;
  occurrenceCount: number; // total in series (including this one), 1 = not collapsed
}

export function collapseSeriesEvents(events: EventWithVenue[]): CollapsedEvent[] {
  // Events arrive already sorted ascending by date.
  // For non-series events (series_id null): emit as-is with occurrenceCount = 1.
  // For series events: group by series_id, emit first (earliest) occurrence,
  //   set occurrenceCount = group size.
  const seriesMap = new Map<number, EventWithVenue[]>();
  const result: CollapsedEvent[] = [];

  for (const ev of events) {
    const sid = ev.events.series_id;
    if (sid === null || sid === undefined) {
      result.push({ event: ev, occurrenceCount: 1 });
    } else {
      const group = seriesMap.get(sid) ?? [];
      group.push(ev);
      seriesMap.set(sid, group);
    }
  }

  // Insert series representatives at the position of the first occurrence
  // Rebuild pass: iterate sorted again, emit first-time series encounters
  const emitted = new Set<number>();
  const final: CollapsedEvent[] = [];
  for (const ev of events) {
    const sid = ev.events.series_id;
    if (sid === null || sid === undefined) {
      final.push({ event: ev, occurrenceCount: 1 });
    } else if (!emitted.has(sid)) {
      emitted.add(sid);
      final.push({
        event: ev,
        occurrenceCount: seriesMap.get(sid)!.length,
      });
    }
  }
  return final;
}
```

### Pattern 3: Occurrence Count Display in EventCard
**What:** EventCard must accept an optional `occurrenceCount` prop and render "+ N more" text when count > 1.
**When to use:** When EventList passes collapsed events down.

Two valid approaches:
- **Option A (recommended):** Add `occurrenceCount?: number` prop to EventCard. EventList passes it from `CollapsedEvent`.
- **Option B:** Create a thin `CollapsedEventCard` wrapper that renders EventCard + the count annotation.

Option A is simpler — one component, one prop.

```typescript
// EventCard prop addition
interface EventCardProps {
  event: EventWithVenue;
  occurrenceCount?: number;  // new — undefined or 1 = no count shown
  onHover?: (venueId: number | null) => void;
  onClickVenue?: (venueId: number, lat: number, lng: number) => void;
}

// In EventCard JSX, after badge row:
{occurrenceCount !== undefined && occurrenceCount > 1 && (
  <div className="mt-0.5 text-xs text-teal-600 font-medium">
    +{occurrenceCount - 1} more upcoming
  </div>
)}
```

### Pattern 4: EventList integration
**What:** Import and call `collapseSeriesEvents` inside EventList after sorting.
**When to use:** Replace the direct `.map(sorted)` with a map over the collapsed result.

```typescript
// EventList.tsx
import { collapseSeriesEvents } from '@/lib/series-utils';

// Inside component, after sort:
const collapsed = collapseSeriesEvents(sorted);

// In JSX:
{collapsed.map(({ event, occurrenceCount }) => (
  <EventCard
    key={event.events.id}
    event={event}
    occurrenceCount={occurrenceCount}
    onHover={onHoverVenue}
    onClickVenue={onClickVenue}
  />
))}
```

### Anti-Patterns to Avoid
- **Filtering in the API route:** Collapse must happen client-side because the filter chain (bounds, date, province, category) runs after fetch. Collapsing server-side would lose awareness of per-filter contexts.
- **Using `series_id = 0` as sentinel:** The column is nullable; check for `null`/`undefined`, not falsy, to avoid false positives on a hypothetical `series_id = 0`.
- **Mutating the sorted array:** `collapseSeriesEvents` should be a pure function returning a new array; EventList already does `[...events].sort()` to avoid mutation.
- **Keying collapsed cards by series_id:** The React key should remain `event.events.id` (the DB primary key) — it's stable and unique.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date comparison for "next upcoming" | Custom date sorter | date-fns (already in use) for any formatting; rely on existing sort in EventList for ordering | Sort is already ascending by event_date; first element in group IS the next occurrence |
| Fuzzy matching in UI | UI-side performer grouping | Use `series_id` from DB | Phase 31 already computed the canonical grouping; trusting the DB FK is authoritative |

**Key insight:** The hard work (grouping, fuzzy matching, series ID assignment) was done in Phase 31. The UI only needs to read `series_id` and collapse on it — no algorithmic work required in the frontend.

## Common Pitfalls

### Pitfall 1: series_id not flowing through the API
**What goes wrong:** The badge never renders because `ev.series_id` is always `undefined` at runtime even though the column exists in the DB.
**Why it happens:** The `/api/events` GET route uses `db.select().from(events).innerJoin(...)` — Drizzle's full `select()` without a field projection does include all columns, but the test mocks in `route.test.ts` build mock `EventWithVenue` objects that omit `series_id` and `archived_at`. This would cause tests to fail if they assert on those fields, but the real API response includes them.
**How to avoid:** Verify by adding `series_id` to the mock event objects in the test file when adding tests for series-related behavior. In production, `series_id` is present; confirm with a quick `console.log` in dev or by checking the network tab.
**Warning signs:** Badge never appears even for events you know are in a series.

### Pitfall 2: Stale mock shapes in route.test.ts
**What goes wrong:** Adding tests for collapse behavior or badge rendering fails with TypeScript errors because existing mocks for `EventWithVenue` don't include `series_id`.
**Why it happens:** The mock objects were written before Phase 31. TypeScript's `InferSelectModel` now includes `series_id: number | null`.
**How to avoid:** When writing new tests that check series-related behavior, add `series_id: null` (or a number) to mock event objects. Existing tests need no change since they don't assert on `series_id`.

### Pitfall 3: Occurrence count includes past/archived events
**What goes wrong:** The collapsed card shows "5 upcoming" but 3 of those are already in the past and would be archived by the next cron run.
**Why it happens:** The API already filters `WHERE archived_at IS NULL`, but some events may have dates in the past that haven't been archived yet (archival runs once daily). Counting all events in the series group would include today's event if it hasn't been archived.
**How to avoid:** The `collapseSeriesEvents` function receives only what the API returns (non-archived events). The count reflects the live unarchived group. This is acceptable behavior — count reflects "upcoming including today" from the user's perspective. Document this in a code comment.

### Pitfall 4: EventCard key collision after collapsing
**What goes wrong:** React warns about duplicate keys after adding collapse logic.
**Why it happens:** If two series groups accidentally share a representative event (shouldn't happen with correct `series_id` FK, but bugs happen), duplicate keys appear.
**How to avoid:** Key on `event.events.id` (always unique per DB row). Never key on `series_id`.

## Code Examples

Verified patterns from project source:

### Existing badge pattern (from EventCard.tsx lines 77-81)
```typescript
// Source: src/components/events/EventCard.tsx
{ev.event_category && (
  <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
    {CATEGORY_META[ev.event_category as EventCategory]?.label ?? ev.event_category}
  </span>
)}
```

### Existing sort in EventList (lines 17-21)
```typescript
// Source: src/components/events/EventList.tsx
const sorted = [...events].sort(
  (a, b) =>
    new Date(a.events.event_date).getTime() -
    new Date(b.events.event_date).getTime()
);
```

### series_id in schema (from schema.ts line 81)
```typescript
// Source: src/lib/db/schema.ts
series_id: integer('series_id').references(() => recurring_series.id),
// nullable — no .notNull() — so TypeScript type is: number | null | undefined
```

### Existing Jest mock pattern (from route.test.ts)
```typescript
// Source: src/app/api/events/route.test.ts
// Mock event shape — series_id must be added to match current InferSelectModel
const mockEvent = {
  id: 1,
  series_id: null,   // add this field
  archived_at: null, // add this field
  // ... other fields
};
```

### Existing filter-utils pattern (for series-utils structure)
```typescript
// Source: src/lib/filter-utils.ts (pattern to follow for series-utils.ts)
// Pure functions exported, tested in filter-utils.test.ts
// No side effects, no DB calls
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No series awareness in UI | series_id available on all event rows | Phase 31 (complete) | UI can read it directly — no new API needed |
| All events rendered individually | Collapse to next occurrence | Phase 32 (this phase) | Cleaner list — open mics don't flood the sidebar |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Occurrence count: future-only or all non-archived?**
   - What we know: `/api/events` returns all non-archived events; events past their date are archived nightly.
   - What's unclear: Should the count say "3 upcoming" (events after today) or "3 total" (all non-archived, which may include today's event if it's currently happening)?
   - Recommendation: Count all non-archived events in the series that the API already returned (simpler, consistent). A nightly archival pass will trim the count as events pass. Label it "upcoming" since all non-archived future events qualify.

2. **Badge color choice**
   - What we know: Existing badges use orange (category), gray (price), blue (Ticketmaster attribution).
   - What's unclear: Teal/green is unoccupied — fits "trust signal" semantics.
   - Recommendation: Use `bg-teal-50 text-teal-700 border border-teal-200` to distinguish from the orange category badge.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npx jest src/lib/series-utils.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | EventCard shows "Recurring" badge when series_id is not null | unit | `npx jest src/lib/series-utils.test.ts --no-coverage` (logic) + visual check | ❌ Wave 0 |
| UI-02 | Event list collapses series to next occurrence with count | unit | `npx jest src/lib/series-utils.test.ts --no-coverage` | ❌ Wave 0 |

Note: EventCard badge logic (UI-01) is a conditional render — testable as a unit test on the `collapseSeriesEvents` utility which feeds it. The actual React rendering is covered by manual visual verification (no React Testing Library in this project).

### Sampling Rate
- **Per task commit:** `npx jest src/lib/series-utils.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/series-utils.test.ts` — covers UI-02 collapse logic (and indirectly UI-01 data path)

*(No new framework install needed — Jest + ts-jest already configured)*

## Sources

### Primary (HIGH confidence)
- Direct source read: `src/components/events/EventCard.tsx` — badge pattern, existing props, Tailwind classes used
- Direct source read: `src/components/events/EventList.tsx` — sort pattern, map-to-EventCard structure
- Direct source read: `src/lib/db/schema.ts` — series_id column definition, nullable, FK type
- Direct source read: `src/types/index.ts` — EventWithVenue shape, InferSelectModel derivation
- Direct source read: `src/app/api/events/route.ts` — full select() confirms series_id flows through
- Direct source read: `jest.config.ts` — Jest configuration (ts-jest preset, node env, @ alias)

### Secondary (MEDIUM confidence)
- Direct source read: `src/app/api/events/route.test.ts` — mock shape for EventWithVenue (confirms series_id absent from current mocks, will need updating)
- Direct source read: `src/lib/series-detector.ts` — confirms series_id set on events, understanding of series grouping logic

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present, no new deps
- Architecture: HIGH — patterns read directly from existing source files
- Pitfalls: HIGH — identified from direct code inspection (mock gap, nullable check)

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable Next.js/React/Tailwind codebase, no external service changes)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | EventCard shows "Recurring" badge when event belongs to a series | `ev.series_id` is already typed as `number | null` via `InferSelectModel`; badge renders conditionally using existing Tailwind badge pattern |
| UI-02 | Event list collapses recurring series to next occurrence with occurrence count | `collapseSeriesEvents()` pure function groups by `series_id`, emits first occurrence per series with `occurrenceCount`; EventCard accepts new `occurrenceCount` prop |
</phase_requirements>
