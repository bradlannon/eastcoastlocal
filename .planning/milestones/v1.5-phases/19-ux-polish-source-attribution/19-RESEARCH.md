# Phase 19: UX Polish & Source Attribution - Research

**Researched:** 2026-03-15
**Domain:** React/Leaflet frontend interactions, Drizzle ORM schema migrations, scraper pipeline instrumentation
**Confidence:** HIGH

## Summary

Phase 19 has four loosely coupled work streams that share a release: two frontend UX additions (map pin on EventCard, category chips in timelapse mode) and two backend schema/logic additions (event_sources join table, non-destructive source_url backfill). All four areas are low-risk because the codebase already has the load-bearing infrastructure in place — flyTo is wired, filterByCategory runs in timelapse, Drizzle pgTable migrations are established, and upsertEvent is the single insertion point.

The frontend work is purely additive: EventCard gains a map-pin icon (no behavior change), and page.tsx swaps the hidden EventFilters for a new slim CategoryChipsRow component in timelapse mode. The backend work adds one new pgTable (event_sources) to schema.ts plus Drizzle migration, then instruments upsertEvent and scrapeTicketmaster to insert into event_sources after each successful event upsert. Source conflict resolution (ATTR-02) is handled by extending upsertEvent's `onConflictDoUpdate` set clause to include a conditional source_url fill.

The pending todo from STATE.md about "map ref access pattern — React context vs. restructuring" can be resolved now: the existing prop-drilling pattern (flyToTarget passed from page.tsx → MapClientWrapper → MapClient → MapViewController) already works and does NOT need restructuring. The FlyToTarget interface is already exported from MapViewController.tsx and consumed at the top level in page.tsx. There is nothing to change for UX-01.

**Primary recommendation:** Implement as three separate tasks — (1) EventCard pin icon, (2) CategoryChipsRow in timelapse, (3) event_sources schema + upsertEvent instrumentation (ATTR-01 + ATTR-02 together since they touch the same function). This is coarse granularity consistent with project config.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Show on map (zoom-to-location)**
- Keep whole-card click behavior — clicking the event card (except links) triggers flyTo to venue at zoom 15
- Add a subtle map-pin icon on each card as a visual affordance (placement at Claude's discretion)
- In timelapse mode, flyTo still fires — centers map on venue even though there's no marker popup
- On mobile, keep auto-switch to map tab on card tap (existing behavior)

**Category chips in timelapse**
- Show category chip row below the TimelineBar — slim dedicated row, always visible in timelapse mode
- Category chips only — province dropdown is NOT shown in timelapse (map viewport constrains geography)
- Event count badge visible alongside category chips in timelapse
- Selecting a category during playback does NOT pause — heatmap and sidebar update live

**Event source tracking (event_sources join table)**
- Schema: event_id (FK), scrape_source_id (nullable FK to scrape_sources), source_type enum ('scrape'|'ticketmaster'|'manual')
- Include first_seen_at and last_seen_at timestamps per source record
- Source attribution is backend/admin data only — not surfaced to public users
- Keep existing source_url column on events table — don't migrate or drop it. Join table adds multi-source tracking alongside it
- Existing TM attribution link on EventCard continues to derive from source_url as-is

**Source conflict resolution**
- Auto-fill source_url if empty when a second source provides a ticket link — non-destructive, never overwrites existing links
- Only auto-fill ticket links (source_url) — no enrichment of other fields (price, time, description)
- Cross-source event matching key: same venue_id + performer + event_date (reuses existing dedup logic)
- Performer name matching: case-insensitive + trim whitespace. No fuzzy matching — exact normalized strings only

### Claude's Discretion
- Map-pin icon design, size, and exact placement on EventCard
- Category chip row styling and spacing below TimelineBar
- event_sources migration strategy (Drizzle migration approach)
- Whether to backfill event_sources for existing events from scrape run data

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | User can click "Show on map" on an event card to animate the map to the venue location | FlyToTarget interface + flyTo effect already implemented in MapViewController.tsx; EventCard.onClickVenue already wired; only change is adding a map-pin icon for visual affordance |
| UX-02 | Category filter chips are visible and interactive in timelapse mode | filterByCategory already applied in timelapse filter chain (page.tsx line 88); EventFilters hidden in timelapse (page.tsx line 177); need new CategoryChipsRow component rendered below TimelineBar overlay |
| ATTR-01 | System tracks which sources each event was discovered from via an event_sources join table | New pgTable in schema.ts + Drizzle migration; upsertEvent extended to insert/update event_sources row; scrapeTicketmaster needs scrape_source_id reference passed through |
| ATTR-02 | On cross-source conflict, ticket link is updated non-destructively if existing event has none | upsertEvent onConflictDoUpdate set clause: source_url updated only when existing row's source_url IS NULL using sql conditional; exact normalized_performer match already used as dedup key |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^0.45.1 (installed) | Schema definition, migrations, DB queries | Already the project ORM; pgTable/pgEnum pattern established |
| drizzle-kit | ^0.31.9 (installed) | Migration generation via `npm run db:generate` | Already in use; generates SQL from schema diffs |
| react-leaflet | ^5.0.0 (installed) | Map rendering; `useMap()` hook for flyTo | Already the map library; MapViewController uses `useMap()` |
| nuqs | ^2.8.9 (installed) | URL-persisted filter state via `useQueryState` | `category` param already syncs; EventFilters already uses it |
| tailwindcss | ^4 (installed) | Styling for new chip row and pin icon | All existing components use Tailwind utility classes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | not installed | SVG map pin icons | Not needed — project uses inline SVG (see TimelineBar.tsx pattern) |

**Installation:** No new dependencies required. All work uses existing installed packages.

## Architecture Patterns

### Recommended Project Structure
The changes touch existing files — no new directories needed.

```
src/
├── components/
│   ├── events/
│   │   ├── EventCard.tsx          # Add map-pin icon SVG (UX-01)
│   │   └── CategoryChipsRow.tsx   # NEW: extracted chip-only row (UX-02)
│   ├── map/
│   │   └── MapClient.tsx          # Render CategoryChipsRow below TimelineBar (UX-02)
│   └── timelapse/
│       └── TimelineBar.tsx        # Pass eventCount + category through if needed (UX-02)
├── lib/
│   ├── db/
│   │   └── schema.ts              # Add event_sources table + source_type_enum (ATTR-01)
│   └── scraper/
│       ├── normalizer.ts          # upsertEvent: insert event_sources, conditional source_url (ATTR-01/02)
│       └── ticketmaster.ts        # Pass scrape_source_id to upsertEvent for TM events (ATTR-01)
└── app/
    └── page.tsx                   # Pass category + eventCount to MapClientWrapper for timelapse (UX-02)
```

### Pattern 1: Inline SVG Icon in EventCard (UX-01)

The project already uses inline SVG in TimelineBar.tsx rather than an icon library. Follow the same pattern for the map-pin icon in EventCard.

**What:** Add a small map-pin SVG to EventCard's header area, rendered only when the venue has coordinates (same guard condition as handleCardClick). The whole-card click already triggers flyTo — the icon is purely a visual affordance.

**When to use:** Icon renders when `venue.lat !== null && venue.lng !== null`.

**Example based on existing TimelineBar SVG pattern:**
```tsx
{/* Map pin affordance — shows when venue has coordinates */}
{venue.lat !== null && venue.lng !== null && (
  <span className="flex-shrink-0 text-gray-400 group-hover:text-[#E85D26] transition-colors ml-auto">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  </span>
)}
```

### Pattern 2: CategoryChipsRow Component (UX-02)

**What:** Extract category chip rendering from EventFilters into a standalone CategoryChipsRow component. Render it as a second row inside the timelapse overlay panel in MapClient.tsx, below the TimelineBar.

**When to use:** Rendered only in timelapse mode. EventFilters continues unchanged for cluster mode.

**Key insight from EventFilters.tsx:** The category chips already use `useQueryState('category')` which is URL-persisted. CategoryChipsRow can call `useQueryState('category')` independently — no prop-drilling of category value needed. nuqs automatically syncs URL state across component tree.

**Example structure:**
```tsx
// src/components/events/CategoryChipsRow.tsx
'use client';
import { useQueryState } from 'nuqs';
import { EVENT_CATEGORIES } from '@/lib/db/schema';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface CategoryChipsRowProps {
  eventCount: number;
}

export default function CategoryChipsRow({ eventCount }: CategoryChipsRowProps) {
  const [category, setCategory] = useQueryState('category');

  return (
    <div className="backdrop-blur-md bg-white/70 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
      <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 flex-shrink-0">
        {eventCount}
      </span>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setCategory(null)}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
            !category
              ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
              : 'bg-white/80 text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          All
        </button>
        {EVENT_CATEGORIES.map((cat) => {
          const isActive = category === cat;
          const meta = CATEGORY_META[cat as EventCategory];
          return (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
                  : 'bg-white/80 text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**In MapClient.tsx**, the timelapse overlay block at line 125–139 becomes:
```tsx
{mapMode === 'timelapse' && (
  <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 pb-4 flex flex-col gap-2">
    <CategoryChipsRow eventCount={eventCount ?? 0} />
    <TimelineBar ... />
  </div>
)}
```

### Pattern 3: event_sources Schema (ATTR-01)

**What:** Add pgEnum for source_type and pgTable for event_sources to schema.ts, following the exact same pgTable/pgEnum pattern as existing tables.

**Key insight from existing schema.ts:**
- pgEnum values are defined as a const array first (like `EVENT_CATEGORIES`), then passed to `pgEnum()`
- Foreign key syntax: `.references(() => tableName.id)`
- Nullable FK: omit `.notNull()`
- Timestamps use `timestamp('col_name')` without `.defaultNow()` for user-controlled columns

**Example:**
```typescript
// In schema.ts, after scrape_sources definition:
export const SOURCE_TYPES = ['scrape', 'ticketmaster', 'manual'] as const;
export const sourceTypeEnum = pgEnum('source_type', SOURCE_TYPES);

export const event_sources = pgTable(
  'event_sources',
  {
    id: serial('id').primaryKey(),
    event_id: integer('event_id')
      .references(() => events.id)
      .notNull(),
    scrape_source_id: integer('scrape_source_id')
      .references(() => scrape_sources.id),    // nullable — TM events have no scrape_sources row
    source_type: sourceTypeEnum('source_type').notNull(),
    first_seen_at: timestamp('first_seen_at').defaultNow().notNull(),
    last_seen_at: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('event_sources_dedup').on(table.event_id, table.scrape_source_id),
    index('event_sources_event_id_idx').on(table.event_id),
  ]
);
```

Note: The uniqueIndex on (event_id, scrape_source_id) enables `onConflictDoUpdate` to update `last_seen_at` on repeated scrapes.

### Pattern 4: upsertEvent Extension (ATTR-01 + ATTR-02)

**What:** Extend `upsertEvent` in normalizer.ts to:
1. Accept an optional `scrapeSourceId: number | null` parameter
2. After the events insert, insert/update an event_sources row
3. Apply non-destructive source_url fill (ATTR-02) using a SQL conditional in onConflictDoUpdate

**Key insight from existing upsertEvent:** The function already uses `onConflictDoUpdate`. ATTR-02's "fill source_url if empty" maps directly to adding `source_url: sql\`COALESCE(events.source_url, ${sourceUrl})\`` to the conflict update set. This is a single-line addition.

**Drizzle COALESCE pattern for non-destructive update:**
```typescript
import { sql } from 'drizzle-orm';

// In onConflictDoUpdate set:
source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
```

This leaves the existing source_url unchanged if non-null, and fills it with the new value if null.

**Updated upsertEvent signature:**
```typescript
export async function upsertEvent(
  venueId: number,
  extracted: ExtractedEvent,
  sourceUrl: string,
  scrapeSourceId: number | null = null,   // new optional param with default
  sourceType: 'scrape' | 'ticketmaster' | 'manual' = 'scrape'  // new optional param
): Promise<void>
```

This is backward-compatible — all existing callers pass only 3 args and get the defaults.

**event_sources upsert after events insert:**
```typescript
// Get the event id from the insert/conflict
const [row] = await db
  .insert(events)
  .values({ ... })
  .onConflictDoUpdate({ ... })
  .returning({ id: events.id });

await db
  .insert(event_sources)
  .values({
    event_id: row.id,
    scrape_source_id: scrapeSourceId,
    source_type: sourceType,
    first_seen_at: new Date(),
    last_seen_at: new Date(),
  })
  .onConflictDoUpdate({
    target: [event_sources.event_id, event_sources.scrape_source_id],
    set: { last_seen_at: new Date() },
  });
```

**Important:** The current `upsertEvent` does not use `.returning()`. Adding `.returning({ id: events.id })` to the existing INSERT is required to get the event_id for the join table insert. This is a non-breaking change.

### Pattern 5: Drizzle Migration Workflow

Based on the existing migration files (0000–0004), the project workflow is:
1. Edit `schema.ts` to add new table/enum
2. Run `npm run db:generate` — drizzle-kit diffs schema against DB state and generates a new `.sql` migration file in `drizzle/`
3. Run `npm run db:migrate` — applies pending migrations
4. Commit both `schema.ts` and the generated migration file

The generated SQL will look like:
```sql
CREATE TYPE "public"."source_type" AS ENUM('scrape', 'ticketmaster', 'manual');--> statement-breakpoint
CREATE TABLE "event_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" integer NOT NULL,
  "scrape_source_id" integer,
  "source_type" "source_type" NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
```

### Anti-Patterns to Avoid

- **Re-fetching event by ID to get event_id for join table:** The `.returning({ id: events.id })` on the upsert gives the id directly — no second SELECT needed.
- **Conditionally skipping event_sources insert:** Always insert/upsert — the uniqueIndex + onConflictDoUpdate pattern handles idempotency. A `try/catch` around the event_sources insert (in case event_id is somehow missing) is acceptable but should not silently swallow errors.
- **Using `setCategory` callback in CategoryChipsRow during timelapse playback:** The user decided category selection does NOT pause playback. Do not call `setIsPlaying(false)` from CategoryChipsRow. The chip click only updates the URL param.
- **Prop-drilling category state through MapClient → TimelineBar → CategoryChipsRow:** nuqs `useQueryState` reads URL state directly. CategoryChipsRow should call `useQueryState('category')` itself.
- **Province dropdown in timelapse overlay:** Explicitly excluded by user. Only category chips.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Non-destructive conditional update | Custom SELECT + UPDATE if-null logic | `sql\`COALESCE(events.source_url, ${newUrl})\`` in Drizzle set | Single atomic operation, no race condition |
| Map pin icon | Icon library import | Inline SVG (12x12 map pin, same path as TimelineBar's existing pin toggle) | No new dependency; project already has a map-pin SVG in TimelineBar.tsx line 98–108 |
| Idempotent join table inserts | Check-then-insert in application code | `onConflictDoUpdate` on uniqueIndex(event_id, scrape_source_id) | Atomic; handles concurrent scrape runs |
| Category state management in timelapse | Lift category state to page.tsx and prop-drill | `useQueryState('category')` in CategoryChipsRow directly | nuqs handles URL sync; no state duplication |

**Key insight:** The map-pin SVG path is already present in TimelineBar.tsx (the "Show pins" toggle button uses an identical path at `<path d="M12 2C8.13 2..."/>`). Reuse the same SVG path in EventCard at a smaller size (12px vs 16px).

## Common Pitfalls

### Pitfall 1: upsertEvent returning() change breaks existing tests
**What goes wrong:** Adding `.returning({ id: events.id })` to the upsertEvent INSERT changes the mock shape expected by normalizer.test.ts. Current mock chain ends at `onConflictDoUpdate` with `.mockResolvedValue(undefined)`. Adding `.returning()` requires the mock chain to continue.
**Why it happens:** The test mocks `insert().values().onConflictDoUpdate()` — adding `.returning()` after `onConflictDoUpdate` breaks the mock chain unless the test mock is updated.
**How to avoid:** Update normalizer.test.ts mock chain to `onConflictDoUpdate().returning()` and return `[{ id: 1 }]`. Also update ticketmaster.test.ts which mocks a different insert chain.
**Warning signs:** Jest error `Cannot read properties of undefined (reading 'returning')` in normalizer.test.ts.

### Pitfall 2: event_sources uniqueIndex on nullable FK
**What goes wrong:** PostgreSQL treats NULL != NULL for unique constraints. If scrape_source_id is NULL for two different TM events pointing to the same event_id, the unique constraint `(event_id, scrape_source_id)` does NOT prevent duplicate rows because NULL != NULL in unique indexes.
**Why it happens:** ANSI SQL null semantics in unique constraints.
**How to avoid:** For TM events where scrape_source_id is always null, the uniqueIndex should be `(event_id, source_type)` OR use a partial unique index, OR accept that TM events will generate one row per scrape run. The simplest fix: use `uniqueIndex` on `(event_id, source_type)` instead of `(event_id, scrape_source_id)` — since there's only one TM source per event anyway.
**Warning signs:** Duplicate rows in event_sources for TM events after multiple scrape runs.

### Pitfall 3: CategoryChipsRow inside MapContainer breaking Leaflet click propagation
**What goes wrong:** The timelapse overlay div is inside the map's root div but outside `<MapContainer>`. Leaflet can intercept click events on elements that overlap the map canvas. If chip buttons don't stop propagation, clicks may also trigger map interactions.
**Why it happens:** Leaflet attaches global click handlers to the map container element.
**How to avoid:** The overlay divs are positioned with `pointer-events-none` on the container and `pointer-events-auto` on the interactive children — OR the existing TimelineBar already works fine because it uses `z-[1000]` and HTML buttons naturally stop event propagation. Verify by inspecting the existing TimelineBar behavior (it already has buttons inside the overlay).
**Warning signs:** Map zoom/click triggers when clicking a category chip.

### Pitfall 4: Timelapse CategoryChipsRow position on mobile
**What goes wrong:** Two overlay rows (CategoryChipsRow + TimelineBar) may overflow or stack badly on narrow mobile screens, especially when both are visible and the mobile tab bar is present.
**Why it happens:** The map panel is full-screen on mobile; the `pb-[56px] md:pb-0` padding accounts for the mobile tab bar in the list panel but not in the map panel.
**How to avoid:** The overlay `pb-4` gives bottom clearance. Two rows at ~36px each = ~88px of overlay. Test on 375px width. If needed, make CategoryChipsRow horizontally scrollable (already planned via `overflow-x-auto no-scrollbar` from EventFilters pattern).

### Pitfall 5: timelapse flyTo fires but no popup opens
**What goes wrong:** In timelapse mode with `showPins=false` (default), ClusterLayer is hidden so `markersRef` is empty. When flyTo completes and the `handleMoveEnd` callback fires, `markersRef.current?.get(flyToTarget.venueId)` returns undefined, and `marker.openPopup()` is never called.
**Why it happens:** MapViewController's moveend handler assumes a marker exists. In timelapse mode without pins, there is no marker to open.
**How to avoid:** This is acceptable behavior per the user decision: "flyTo still fires — centers map on venue even though there's no marker popup." No code change needed. The `marker?.openPopup()` is already guarded with a null check.

## Code Examples

Verified patterns from the existing codebase:

### Existing flyTo in MapViewController.tsx (UX-01 reference)
```typescript
// Source: src/components/map/MapViewController.tsx lines 49-70
useEffect(() => {
  if (!flyToTarget) return;

  map.flyTo([flyToTarget.lat, flyToTarget.lng], 15, {
    animate: true,
    duration: 0.8,
  });

  const handleMoveEnd = () => {
    map.off('moveend', handleMoveEnd);
    const marker = markersRef.current?.get(flyToTarget.venueId);
    if (marker) {
      marker.openPopup();
    }
  };

  map.on('moveend', handleMoveEnd);
  return () => { map.off('moveend', handleMoveEnd); };
}, [map, flyToTarget, markersRef]);
```

### Existing timelapse filter chain (UX-02 reference — category already working)
```typescript
// Source: src/app/page.tsx lines 84-94
if (mapMode === 'timelapse') {
  const center = positionToTimestamp(timePosition, referenceDate);
  const timeWindowed = filterByTimeWindow(allEvents, center.getTime(), 24);
  const provinceFiltered = filterByProvince(timeWindowed, province);
  const categoryFiltered = filterByCategory(provinceFiltered, category);
  return {
    sidebarEvents: filterByBounds(categoryFiltered, bounds),
    heatPoints: computeVenueHeatPoints(categoryFiltered),
    // ...
  };
}
```

### Existing onConflictDoUpdate pattern (ATTR-02 reference)
```typescript
// Source: src/lib/scraper/normalizer.ts lines 23-52
await db
  .insert(events)
  .values({ ... })
  .onConflictDoUpdate({
    target: [events.venue_id, events.event_date, events.normalized_performer],
    set: {
      performer: extracted.performer!,
      source_url: sourceUrl,   // <-- currently overwrites; ATTR-02 changes this to COALESCE
      // ...
      updated_at: new Date(),
    },
  });
```

### Drizzle sql() import for COALESCE
```typescript
// Source: src/lib/scraper/ticketmaster.ts line 4 (already imported in project)
import { ilike, eq, and, sql } from 'drizzle-orm';

// Usage in set clause:
source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
```

### Existing category chip styling (UX-02 reference)
```tsx
// Source: src/components/events/EventFilters.tsx lines 83-99
{EVENT_CATEGORIES.map((cat) => {
  const isActive = category === cat;
  const meta = CATEGORY_META[cat as EventCategory];
  return (
    <button
      key={cat}
      onClick={() => setCategory(cat)}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
        isActive
          ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      {meta.label}
    </button>
  );
})}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Category chips hidden in timelapse | Category chips visible below TimelineBar in timelapse | Users can filter heatmap by category during playback |
| Events have source_url string only | event_sources join table with timestamps | Multi-source provenance trackable; source_url fills non-destructively |
| map-pin icon absent from EventCard | Subtle map-pin SVG on cards with coordinates | Visual affordance that cards are clickable to map |

**Deprecated/outdated:**
- None for this phase; no removals, only additions.

## Open Questions

1. **uniqueIndex column choice for event_sources with nullable scrape_source_id**
   - What we know: PostgreSQL NULL != NULL in unique indexes; TM events always have scrape_source_id = NULL
   - What's unclear: Whether `(event_id, source_type)` uniqueIndex is the right semantic (one row per source_type per event, not one row per scrape_source row)
   - Recommendation: Use `uniqueIndex('event_sources_dedup').on(table.event_id, table.source_type)` — semantically "one attribution record per event per source type." This means all TM-sourced attribution is one row per event (correct), and scrape-sourced is also one row per event regardless of which scrape_source (acceptable for v1.5 scope).

2. **Backfill event_sources for existing events**
   - What we know: Claude's Discretion; existing events predate this table
   - What's unclear: Is backfill useful for ATTR-01's admin/reporting purpose given the data exists in scrape run records
   - Recommendation: Skip backfill in this phase. event_sources starts tracking from the next scrape run after deployment. The requirement (ATTR-01) says "system tracks" — forward-tracking is sufficient. A backfill CLI can be a fast-follow if needed.

3. **`upsertEvent` source_url semantics after ATTR-02**
   - What we know: Currently `onConflictDoUpdate` unconditionally overwrites `source_url: sourceUrl`
   - What's unclear: Whether "non-destructive" means we also stop overwriting `source_url` on re-scrape of the same source (i.e., source that originally set it), or only for cross-source enrichment
   - Recommendation: Apply COALESCE universally in the conflict update set. Once a source_url is set by any source, it is never overwritten by another conflict update. This is simpler and safe — the original source URL is preserved.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 with ts-jest |
| Config file | jest.config.ts (root) |
| Quick run command | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | EventCard renders map-pin icon when venue has lat/lng | unit | N/A — React component, no test infrastructure for components | manual-only (no jsdom setup) |
| UX-02 | CategoryChipsRow renders all EVENT_CATEGORIES and toggles active state via nuqs | unit | N/A — React component | manual-only |
| ATTR-01 | upsertEvent inserts event_sources row with correct event_id, source_type, timestamps | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ❌ Wave 0 gap |
| ATTR-01 | upsertEvent updates last_seen_at on conflict (same event_id + source_type) | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ❌ Wave 0 gap |
| ATTR-01 | scrapeTicketmaster passes source_type='ticketmaster' to upsertEvent | unit | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` | ❌ Wave 0 gap |
| ATTR-02 | upsertEvent uses COALESCE for source_url — does not overwrite existing | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ❌ Wave 0 gap |
| ATTR-02 | upsertEvent fills source_url when existing row has null source_url | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ❌ Wave 0 gap |

**Note on UX-01/UX-02:** The project has no jsdom or React Testing Library setup (jest.config.ts sets `testEnvironment: 'node'`). Component behavior must be verified manually in the browser. The ATTR tests are the only automated path.

### Sampling Rate
- **Per task commit:** `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/ticketmaster.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/scraper/normalizer.test.ts` — extend existing file with event_sources tests (REQ ATTR-01, ATTR-02): mock the event_sources table in jest.mock('@/lib/db/schema'), add tests for upsertEvent's new behavior
- [ ] `src/lib/scraper/ticketmaster.test.ts` — extend existing file with test asserting upsertEvent called with source_type='ticketmaster' (REQ ATTR-01)
- [ ] Update existing normalizer mock chain to handle `.returning({ id: events.id })` addition

## Sources

### Primary (HIGH confidence)
- Source code inspection (MapViewController.tsx, EventCard.tsx, EventFilters.tsx, page.tsx, MapClient.tsx, TimelineBar.tsx, normalizer.ts, ticketmaster.ts, schema.ts, filter-utils.ts) — all patterns derived from reading actual project files
- drizzle/0000–0004 migration files — Drizzle migration SQL format confirmed
- jest.config.ts — test framework confirmed as Jest 30 + ts-jest, node environment

### Secondary (MEDIUM confidence)
- Drizzle ORM docs (via codebase patterns) — COALESCE in onConflictDoUpdate set clause confirmed by existing `sql` import usage in ticketmaster.ts
- PostgreSQL NULL semantics in unique indexes — standard SQL behavior, HIGH confidence

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed; no new deps
- Architecture: HIGH — all patterns traced to existing project files
- Pitfalls: HIGH for test mock breakage and NULL unique index (confirmed patterns); MEDIUM for mobile overflow (layout inference)

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable libraries; no fast-moving dependencies in scope)
