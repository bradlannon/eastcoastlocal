# Architecture Research

**Domain:** Recurring event series detection + past event archival — East Coast Local v2.2
**Researched:** 2026-03-16
**Confidence:** HIGH — full codebase read; all integration points traced from schema through API to UI

---

## Context: What Already Exists

This is a subsequent-milestone document. The architecture is a working Next.js 16 + Neon Postgres + Drizzle + Vercel Hobby app (v2.1, shipped). All design decisions must integrate with, not replace, the existing system.

**Core constraint: Vercel Hobby plan — 60s function timeout, no persistent processes.**

Relevant existing pipeline (confirmed by direct code read):

```
Daily scrape cron → runScrapeJob()
    └── for each enabled source:
            upsertEvent(venueId, extracted, sourceUrl, scrapeSourceId, sourceType)
                └── INSERT events ON CONFLICT DO UPDATE (dedup key: venue_id + event_date + normalized_performer)
                └── INSERT event_sources ON CONFLICT DO UPDATE (last_seen_at)

GET /api/events
    └── SELECT events + venues WHERE event_date >= NOW()
    └── Supplementary SELECT event_sources WHERE event_id IN [ids]
    └── Return EventWithVenue[] (events.* + venues.* + source_types[])

EventCard.tsx
    └── Renders event.events.* fields (performer, event_date, event_category, price)
    └── Renders series badge based on source_types ('ticketmaster' check — same pattern for series)
```

---

## System Overview: v2.2 Additions

Two features integrate with the existing system. Neither replaces anything — both are additive.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Public Frontend                            │
│  ┌──────────────┐  ┌───────────────────────────────────────────┐   │
│  │  EventList   │  │  EventCard                                │   │
│  │  (no change) │  │  MODIFIED: series badge on series_id != null│  │
│  └──────┬───────┘  └───────────────────────────────────────────┘   │
│         └──────────── EventWithVenue[] (unchanged shape)            │
├─────────────────────────────────────────────────────────────────────┤
│                           API Layer                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GET /api/events                                             │   │
│  │  MODIFIED: add isNull(events.archived_at) to WHERE clause    │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                          Data Layer                                 │
│  ┌─────────────────────┐  ┌──────────────────┐                     │
│  │  events             │  │  recurring_series │                     │
│  │  +series_id FK      │  │  NEW TABLE        │                     │
│  │  +archived_at ts    │  │                   │                     │
│  └─────────────────────┘  └──────────────────┘                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  event_sources / venues / scrape_sources  (NO CHANGE)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                        Background Jobs                              │
│  ┌──────────────────────────┐  ┌────────────────────────────────┐   │
│  │  /api/cron/scrape        │  │  /api/cron/archive  (NEW)       │   │
│  │  MODIFIED: post-upsert   │  │  Daily. Sets archived_at on     │   │
│  │  series detection pass   │  │  past events.                   │   │
│  └──────────────────────────┘  └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### New Components

| Component | Type | Responsibility |
|-----------|------|----------------|
| `recurring_series` table | NEW schema object | Stores series-level metadata keyed by (venue_id, normalized_performer); events reference via nullable FK |
| `series-detector.ts` | NEW lib module | `detectAndLinkSeries(venueId, normalizedPerformer)` — counts non-archived occurrences, upserts series row, tags event rows with series_id |
| `archiver.ts` | NEW lib module | `archivePassedEvents()` — bulk UPDATE events SET archived_at = NOW() WHERE event_date < NOW() AND archived_at IS NULL |
| `/api/cron/archive/route.ts` | NEW cron endpoint | CRON_SECRET-gated GET handler calling `archivePassedEvents()`; `maxDuration = 60` |

### Modified Components

| Component | Change |
|-----------|--------|
| `schema.ts` | Add `recurring_series` table; add `series_id` nullable FK + `archived_at` nullable timestamp to `events` table |
| `extracted-event.ts` | Add optional `recurrence_pattern: string \| null` to Zod schema |
| `extractor.ts` | Add `recurrence_pattern` field description to Gemini prompt |
| `orchestrator.ts` | After upsert loop per source: collect unique (venue_id, normalized_performer) pairs, call `detectAndLinkSeries()` for each |
| `/api/events/route.ts` | Add `isNull(events.archived_at)` to WHERE clause |
| `EventCard.tsx` | Render "Recurring" badge when `event.events.series_id !== null` |
| `vercel.json` | Add cron entry for `/api/cron/archive` |

### Unchanged Components

| Component | Notes |
|-----------|-------|
| `normalizer.ts` / `upsertEvent()` | Signature and logic unchanged — series detection runs after, not inside, upsert |
| `EventList.tsx` | No structural change required; series collapse is optional polish, not MVP |
| `event_sources` table | Fully unchanged — archival sets `archived_at` on `events`, not `event_sources` |
| `types/index.ts` | `Event` type auto-updates via Drizzle `InferSelectModel` — no manual edit |
| All discovery crons | Unaffected |
| Admin UI (existing pages) | No required changes; archived events admin view is optional polish |

---

## Recommended Project Structure

Changes and additions relative to v2.1 tree:

```
src/
├── lib/
│   ├── db/
│   │   └── schema.ts                    # MODIFIED — new table + 2 columns on events
│   ├── scraper/
│   │   ├── series-detector.ts           # NEW
│   │   ├── series-detector.test.ts      # NEW
│   │   ├── archiver.ts                  # NEW
│   │   ├── archiver.test.ts             # NEW
│   │   ├── orchestrator.ts              # MODIFIED — series detection pass after upserts
│   │   └── extractor.ts                 # MODIFIED — recurrence_pattern in prompt
│   └── schemas/
│       └── extracted-event.ts           # MODIFIED — recurrence_pattern field
├── app/
│   └── api/
│       └── cron/
│           └── archive/
│               └── route.ts             # NEW — daily archival cron
├── components/
│   └── events/
│       └── EventCard.tsx                # MODIFIED — series badge
└── types/
    └── index.ts                         # AUTO-UPDATED by Drizzle InferSelectModel
```

### Structure Rationale

- **`series-detector.ts` in `lib/scraper/`:** Series detection is a post-scrape data enrichment step. Placing it alongside `normalizer.ts` and `orchestrator.ts` follows the established module boundary for all scrape-pipeline logic.
- **`archiver.ts` in `lib/scraper/`:** Archive logic is a scheduled DB maintenance operation. Same module grouping as the scrape orchestrator — all cron-driven data operations live in `lib/scraper/`.
- **`/api/cron/archive/`:** Follows the established pattern (one directory + `route.ts` per cron job, CRON_SECRET auth, `maxDuration = 60`).

---

## Architectural Patterns

### Pattern 1: New Table for Series (not column-only)

**What:** A separate `recurring_series` table holds series-level metadata. Events reference it via nullable FK `series_id`. The series is keyed by a unique index on `(venue_id, normalized_performer)`.

**When to use:** When grouped entities need their own metadata (recurrence_label, occurrence_count, first_seen_at) that doesn't belong on individual rows.

**Trade-offs:** One extra table and FK. The alternative — a `series_key TEXT` column on events with no separate table — is simpler but can't store series-level metadata without denormalization. At this scale the extra table is negligible overhead.

**Example:**
```typescript
// schema.ts addition
export const recurring_series = pgTable(
  'recurring_series',
  {
    id: serial('id').primaryKey(),
    venue_id: integer('venue_id').references(() => venues.id).notNull(),
    normalized_performer: text('normalized_performer').notNull(),
    recurrence_label: text('recurrence_label'),  // "weekly", "monthly", "bi-weekly", etc.
    first_seen_at: timestamp('first_seen_at').defaultNow().notNull(),
    occurrence_count: integer('occurrence_count').notNull().default(1),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('recurring_series_venue_performer').on(
      table.venue_id,
      table.normalized_performer
    ),
  ]
);

// events table additions (two new nullable columns)
series_id: integer('series_id').references(() => recurring_series.id),
archived_at: timestamp('archived_at'),
```

### Pattern 2: archived_at Nullable Timestamp (Soft Delete)

**What:** A nullable `archived_at` timestamp on the `events` table. NULL means active; non-null means archived. The public `/api/events` route adds `isNull(events.archived_at)` to its WHERE clause. Admin queries intentionally omit this guard to see archived records.

**When to use:** When records should disappear from the public view but be preserved for audit integrity. Avoids hard deletes that would orphan `event_sources` rows or break FK constraints.

**Trade-offs:** All public-facing queries touching events need the `isNull` guard. This is only one call site (`/api/events`) — the guard is surgical.

**Example:**
```typescript
// /api/events route — modified WHERE clause
.where(
  and(
    gte(events.event_date, new Date()),
    isNull(events.archived_at)
  )
)
```

### Pattern 3: Post-Upsert Series Detection (Separate Pass)

**What:** Series detection runs after `upsertEvent()` completes for a source, not inside it. The orchestrator collects a `Set` of unique `(venue_id, normalized_performer)` pairs during the upsert loop, then calls `detectAndLinkSeries()` for each unique pair once per scrape run.

**When to use:** When a classification step needs to look at aggregate state ("how many occurrences of X at Y exist?") rather than a single row. Running inside upsert would mean each event only sees itself.

**Trade-offs:** One extra DB round-trip per unique venue+performer pair after scraping. At Atlantic Canada scale (dozens of sources, few recurring performers per venue) this is negligible. The dedup also prevents redundant detection calls when the same performer appears across multiple sources in one run.

**Example:**
```typescript
// orchestrator.ts modification
const seriesKeys = new Set<string>();

for (const source of sources) {
  // ... existing upsert logic ...
  for (const event of extracted) {
    await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
    if (event.performer) {
      const key = `${source.venue_id}:${normalizePerformer(event.performer)}`;
      seriesKeys.add(key);
    }
  }
}

// Series detection pass — after all upserts complete
for (const key of seriesKeys) {
  const [venueIdStr, ...parts] = key.split(':');
  await detectAndLinkSeries(parseInt(venueIdStr), parts.join(':'));
}
```

### Pattern 4: Gemini Recurrence Hint (Advisory Only)

**What:** Add an optional `recurrence_pattern` field to the Gemini extraction prompt and Zod schema. Gemini can detect phrases like "every Friday" or "weekly open mic" in page content and surface them as a text hint. This is advisory — the series detector makes the final call based on occurrence count in the DB.

**When to use:** When the LLM is already processing content that may contain recurrence signals. Zero additional API cost.

**Trade-offs:** Gemini may hallucinate recurrence on one-off events. Acceptable because the detector only creates a series when >= 2 real occurrences exist in the DB. The hint is stored as `recurrence_label` on the series row but never drives the series-creation decision.

**Example:**
```typescript
// extracted-event.ts — Zod schema addition
recurrence_pattern: z.string().nullable().optional(),
// e.g. "weekly", "every Friday", "monthly", "bi-weekly"

// extractor.ts — prompt field addition
`- recurrence_pattern: if this appears to be a recurring event series (weekly open mic,
   monthly trivia night, etc.), describe the pattern (e.g. "weekly", "every Friday",
   "monthly"); otherwise null`
```

The extracted `recurrence_pattern` can be passed to `detectAndLinkSeries()` and stored on `recurring_series.recurrence_label` when the series is first created.

---

## Data Flow

### Archival Cron Flow (New)

```
Vercel cron (daily, e.g. 0 6 * * *)
    ↓
GET /api/cron/archive
    ↓ CRON_SECRET check (Bearer token, same as all crons)
archivePassedEvents()
    ↓
UPDATE events
  SET archived_at = NOW()
  WHERE event_date < NOW()
    AND archived_at IS NULL
    ↓
Return count of archived rows
    ↓
Response: { success: true, archived: N, timestamp: "..." }
```

### Series Detection Flow (Modified Scrape Path)

```
runScrapeJob() [existing]
    ↓ for each enabled source
upsertEvent() [existing — no change to this function]
    ↓ collect unique (venue_id, normalized_performer) pairs via Set
-- after upsert loop for this source --
detectAndLinkSeries(venueId, normalizedPerformer) [new, per unique pair]
    ↓
SELECT id, event_date FROM events
  WHERE venue_id = ? AND normalized_performer = ? AND archived_at IS NULL
    ↓ if count < 2: return (not yet a series)
    ↓ if count >= 2:
INSERT recurring_series (venue_id, normalized_performer, occurrence_count)
  ON CONFLICT (venue_id, normalized_performer)
  DO UPDATE SET occurrence_count = excluded.occurrence_count
RETURNING id
    ↓
UPDATE events SET series_id = <series.id>
  WHERE id IN [occurrence ids]
```

### Public Events API Flow (Modified)

```
GET /api/events
    ↓
SELECT events.*, venues.*
  FROM events
  INNER JOIN venues ON events.venue_id = venues.id
  WHERE events.event_date >= NOW()
    AND events.archived_at IS NULL   ← ADD THIS
  ORDER BY events.event_date
    ↓ supplementary source_types query [existing, unchanged]
    ↓
Return EventWithVenue[]
  events.series_id is included in events.* — no API shape change needed
  Frontend reads events.series_id to decide series badge
```

### Series Badge Render Flow (Modified UI)

```
EventWithVenue.events.series_id
    ↓ null → no badge
    ↓ non-null → render "Recurring" badge (or series recurrence_label if available)

// EventCard.tsx addition (follows existing source_types badge pattern)
{ev.series_id !== null && ev.series_id !== undefined && (
  <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
    Recurring
  </span>
)}
```

---

## New vs Modified: Explicit Inventory

| Artifact | Status | What Changes |
|----------|--------|--------------|
| `schema.ts` | MODIFIED | Add `recurring_series` table; add nullable `series_id` FK + nullable `archived_at` timestamp to `events` table |
| `extracted-event.ts` | MODIFIED | Add `recurrence_pattern: z.string().nullable().optional()` |
| `extractor.ts` | MODIFIED | Add `recurrence_pattern` field description to Gemini prompt |
| `normalizer.ts` | NO CHANGE | `upsertEvent()` signature and body unchanged |
| `orchestrator.ts` | MODIFIED | Accumulate unique (venue_id, normalized_performer) pairs during upsert loop; call `detectAndLinkSeries()` per pair after upserts |
| `series-detector.ts` | NEW | `detectAndLinkSeries(venueId, normalizedPerformer, recurrenceLabel?)` |
| `series-detector.test.ts` | NEW | Tests: single occurrence = no series; 2+ = series created; occurrence_count updates; series_id set on all occurrences; idempotent on re-run |
| `archiver.ts` | NEW | `archivePassedEvents()` returning `{ archived: number }` |
| `archiver.test.ts` | NEW | Tests: past events archived; future events untouched; already-archived events not double-stamped; idempotent |
| `/api/cron/archive/route.ts` | NEW | CRON_SECRET GET handler; `maxDuration = 60`; calls `archivePassedEvents()` |
| `/api/events/route.ts` | MODIFIED | Add `isNull(events.archived_at)` to WHERE clause via `and(gte(...), isNull(...))` |
| `EventCard.tsx` | MODIFIED | Render series badge when `event.events.series_id !== null` |
| `EventList.tsx` | NO CHANGE (MVP) | Series collapse/grouping is optional polish; defer |
| `types/index.ts` | AUTO-UPDATED | `Event` type picks up `series_id` + `archived_at` automatically via `InferSelectModel` |
| `vercel.json` | MODIFIED | Add `{ "path": "/api/cron/archive", "schedule": "0 6 * * *" }` |
| Admin events view | OPTIONAL | Add archived events tab filtered by `archived_at IS NOT NULL`; not required for MVP |

---

## Build Order

Build order respects hard dependencies: schema migration before any code using new columns; archiver before its cron endpoint; API guard independent of series; series detector before orchestrator wires it in; UI last.

### Phase 1 — Schema Foundation

**Prerequisite for everything. Ship this first, independently.**

1. Add `recurring_series` table to `schema.ts`
2. Add `series_id` nullable FK and `archived_at` nullable timestamp to `events` in `schema.ts`
3. Add optional `recurrence_pattern` to `ExtractedEventSchema` in `extracted-event.ts`
4. Run `drizzle-kit generate` → produces migration SQL
5. Run `drizzle-kit migrate` → apply to Neon Postgres

**Why this block is safe:** Adding nullable columns and a new table is non-breaking. No existing queries reference the new columns. Drizzle `InferSelectModel` auto-propagates `series_id` and `archived_at` to the `Event` type — `types/index.ts` requires no manual edit. The Zod schema addition is purely optional — existing events flow through with `recurrence_pattern = undefined` without error.

### Phase 2 — Archival (Independent of Series, Lower Risk)

**Ship second. Unblocks the API change. Self-contained.**

6. Write `archiver.ts` with `archivePassedEvents()`
7. Write `archiver.test.ts`
8. Create `/api/cron/archive/route.ts`
9. Add archive cron to `vercel.json`
10. Modify `/api/events/route.ts` — add `isNull(events.archived_at)` guard

**Why before series:** Archival is fully self-contained — no dependency on series logic. The `archived_at IS NULL` guard in the API is a no-op until the archival cron runs, so it can be deployed immediately. Once archival is live, the series detector must include `isNull(events.archived_at)` in its occurrence query so it doesn't count past events — meaning archival must be in place before series detection for correct behavior.

### Phase 3 — Series Detection

**Depends on Phase 1 (schema) and Phase 2 (archival must be live first).**

11. Write `series-detector.ts` with `detectAndLinkSeries()`
12. Write `series-detector.test.ts`
13. Modify `extractor.ts` — add `recurrence_pattern` to Gemini prompt
14. Modify `orchestrator.ts` — accumulate unique pairs, call `detectAndLinkSeries()` per pair after source upserts

**Why after archival:** The detector queries `WHERE archived_at IS NULL` to count valid occurrences. If archival is not live yet, it may count past events as occurrences and incorrectly tag a performer who has played once in the past and once upcoming as a "series."

### Phase 4 — UI

**Pure rendering. No data dependencies beyond the API changes in Phase 2.**

15. Modify `EventCard.tsx` — add series badge on `events.series_id !== null`
16. Optionally: add archived events admin view (`/admin/events?archived=true`)
17. Optionally: `EventList.tsx` series collapse/grouping (defer to next milestone if scope is tight)

---

## Integration Points

### Schema Integration

The `events` table dedup key (`venue_id`, `event_date`, `normalized_performer`) is unchanged. New columns `series_id` and `archived_at` are additive nullable columns — no existing indexes or constraints are affected. The `recurring_series` unique index on `(venue_id, normalized_performer)` mirrors the dedup pattern already used across the schema (`events_dedup_key`, `event_sources_dedup`).

### API WHERE Clause

Current: `gte(events.event_date, new Date())`
After v2.2: `and(gte(events.event_date, new Date()), isNull(events.archived_at))`

The `and` and `isNull` operators are already imported and used throughout the codebase (`merge-venue.ts`, admin routes). No new imports needed in the events route.

### Cron Pattern Conformance

All existing cron endpoints follow: CRON_SECRET Bearer auth check, `export const maxDuration = 60`, GET handler, calls one `lib/scraper/` function, returns `{ success: true, timestamp }`. The new `/api/cron/archive/route.ts` follows this pattern exactly — no new conventions introduced.

Suggested `vercel.json` schedule for archival: `"0 6 * * *"` (6 AM UTC daily, same time as the scrape cron). Running archival and scrape at the same time is acceptable because they write to different columns (`archived_at` vs content fields) and the upsert dedup key does not include `archived_at`. If contention is a concern, offset by one hour: `"0 7 * * *"`.

### series_id in EventWithVenue

`EventWithVenue.events` is typed as `InferSelectModel<typeof events>`. Once `series_id` is added to the schema, it appears in this type automatically — no changes to `types/index.ts`, the API route, or the `enriched` map. `EventCard.tsx` can read `event.events.series_id` immediately.

### Orchestrator Integration

`runScrapeJob()` processes sources in a `for` loop. The series detection pass fits as a post-source step without restructuring the loop:

```
for (const source of sources) {
  const seriesKeys = new Set<string>();
  // ... existing extract + upsert loop ...
  // ADD: seriesKeys.add(`${venueId}:${normalizedPerformer}`)
  // ADD: after upserts for this source:
  for (const key of seriesKeys) { await detectAndLinkSeries(...) }
}
```

The per-source scoping is important: it avoids accumulating a global set across all sources in a single run, which could cause stale pair detection if sources for the same venue are spread across a long scrape run.

### event_sources Boundary

`event_sources` is fully untouched. Archival operates only on `events.archived_at`. Series detection operates only on `events.series_id`. The FK integrity of `event_sources → events` is preserved because soft-deleted events are never hard-deleted.

---

## Anti-Patterns

### Anti-Pattern 1: Running Series Detection Inside upsertEvent()

**What people do:** Add series detection logic inside `upsertEvent()` so it triggers on every event insert/update.

**Why it's wrong:** `upsertEvent()` is called once per extracted event. At the moment of upsert, the DB may contain only one occurrence (the one being inserted). Series detection requires aggregate state — it must query all occurrences and therefore must run after, not during, individual upserts. Running it inline adds N extra queries for N events where most are single-occurrence events that will never form a series.

**Do this instead:** Accumulate unique (venue_id, normalized_performer) pairs during the upsert loop, then run a single detection pass after all upserts for a source complete.

### Anti-Pattern 2: Hard-Deleting Past Events

**What people do:** `DELETE FROM events WHERE event_date < NOW()` in the archival cron.

**Why it's wrong:** Hard deletes orphan `event_sources` rows (FK violation unless cascaded — cascading breaks the audit trail). The existing upsert dedup key will re-insert the same event on the next scrape if the source page still lists it. Admin visibility into what was scraped is lost.

**Do this instead:** Set `archived_at = NOW()` (soft delete). The public API filters `WHERE archived_at IS NULL`. Admin can query `WHERE archived_at IS NOT NULL`. If the scraper re-encounters a previously archived event, `upsertEvent()` hits the unique constraint and updates the row — the archival cron will re-archive it on the next run if the date has passed.

### Anti-Pattern 3: Text-Column-Only Series Tagging

**What people do:** Add a `series_key TEXT` column to events (e.g., `"open-mic-the-dome"`) and skip the `recurring_series` table.

**Why it's wrong:** Series-level metadata (recurrence_label, occurrence_count, first_seen_at) can't be stored without denormalizing across all event rows. Series-level admin operations (rename, dissolve) require a full-table UPDATE. Querying "all active series" requires a GROUP BY on a large table. The text key has no enforced referential integrity.

**Do this instead:** Normalize to `recurring_series` with `events.series_id` FK. Series metadata lives in one row. Querying all series is a table scan on a small purpose-built table.

### Anti-Pattern 4: Expanding the 30-day Extraction Window for Recurring Events

**What people do:** Increase the extractor's 30-day future window to 60 or 90 days so more occurrences are visible for series detection.

**Why it's wrong:** The 30-day cap is a deliberate product decision — locals care about what's coming up soon. Expanding it increases Gemini context, cost, and noise from tentative/distant events. It also violates the existing filter in `extractor.ts`.

**Do this instead:** Keep the 30-day window. Recurring events (weekly, monthly) naturally produce 2-4 occurrences within any 30-day window. If a performer has only one upcoming occurrence in the next 30 days, they are not "recurring" in a way that's useful to surface to users right now — the series badge would be misleading.

### Anti-Pattern 5: Making Series Detection Synchronous and Blocking

**What people do:** Call `detectAndLinkSeries()` inside the upsert loop for every event, awaiting each call before continuing.

**Why it's wrong:** This multiplies the number of DB round-trips per scrape run by the number of unique performers per source. Most performers are one-off; calling detection on each wastes DB connections and adds latency inside the 60s Vercel timeout.

**Do this instead:** Accumulate a `Set<string>` of unique pairs during the upsert loop (O(1) Set.add, no DB call), then run detection only for unique pairs after the source's upserts complete. The Set deduplicates naturally.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (~dozens of active events, ~41 venues) | Archival bulk UPDATE is trivially fast. Series detection: handful of unique pairs per run. No indexes needed. |
| 10x events (~5k active) | Still fine. Archival is one UPDATE. Series detection bounded by unique venue+performer pairs. Consider adding `index('events_archived_at_idx').on(table.archived_at)` at this scale. |
| 100k+ events | Add `index('events_series_id_idx').on(table.series_id)` for series-grouped queries. Add `events_archived_at_idx` for archival UPDATE query. Archival UPDATE may benefit from batching. |

### Scaling Priorities

1. **First concern (not yet needed):** Index on `events.archived_at`. The archival UPDATE scans all non-archived events. At Atlantic Canada scale this is a small table; no index needed now.
2. **Second concern (not yet needed):** Index on `events.series_id`. Querying "all events in series X" requires a full scan of events without this index. At current scale the table is small; add when EventList series-grouping is implemented if needed.

---

## Sources

- Direct codebase read: `schema.ts`, `extractor.ts`, `orchestrator.ts`, `normalizer.ts`, `/api/events/route.ts`, `EventCard.tsx`, `EventList.tsx`, `types/index.ts`, `extracted-event.ts`, `/api/cron/scrape/route.ts` — HIGH confidence
- Drizzle ORM: `isNull`, `and`, `onConflictDoUpdate`, `inArray` operators — standard Drizzle pg-core API, confirmed present and used throughout existing codebase — HIGH confidence
- Vercel Hobby 60s limit: confirmed via `export const maxDuration = 60` in all existing cron routes — HIGH confidence
- Soft-delete (nullable timestamp) pattern: established pattern in this codebase (`reviewed_at`, `last_scraped_at`, `merged_at` all nullable timestamps used as state flags) — HIGH confidence
- PostgreSQL: adding nullable columns is non-blocking, no table rewrite — HIGH confidence (standard Postgres behavior)

---
*Architecture research for: East Coast Local v2.2 — Recurring Event Series + Past Event Archival*
*Researched: 2026-03-16*
