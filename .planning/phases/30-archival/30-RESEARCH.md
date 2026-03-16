# Phase 30: Archival - Research

**Researched:** 2026-03-16
**Domain:** Soft-archival cron, Drizzle ORM null-guard patterns, Atlantic timezone threshold, Next.js admin page with pagination
**Confidence:** HIGH

## Summary

Phase 30 is a well-bounded surgical operation on three existing surfaces: the public events API, the upsertEvent ON CONFLICT clause, and the admin UI. All schema prerequisites exist — `archived_at TIMESTAMPTZ` is live in the events table and `province` is available on venues. No migrations are required.

The most technically interesting piece is the Atlantic timezone threshold calculation. The province column uses two-char codes (NB, NS, PEI, NL); NL maps to `America/St_Johns` (UTC-3:30/UTC-2:30), all others map to `America/Halifax` (UTC-4/UTC-3). The cron must compute "start of today in Atlantic time, converted to UTC" to correctly identify events whose calendar day has passed. The `date-fns` package (already installed at v4.1.0) provides `startOfDay` and `toZonedTime`/`fromZonedTime` via `date-fns-tz` — but `date-fns-tz` is NOT in the current package.json. The simplest correct approach is to compute the threshold with JavaScript's `Intl.DateTimeFormat` API (no new deps) or to install `date-fns-tz`.

The COALESCE guard in upsertEvent is the highest-risk single change: the correct implementation is to simply omit `archived_at` from the ON CONFLICT SET clause entirely. The CONTEXT.md note about `COALESCE(${events.archived_at}, ${events.archived_at})` is a no-op identity expression; the cleaner and equivalent approach is exclusion from the SET object.

The admin archived tab follows the exact same server-component pattern as `/admin/discovery` and `/admin/merge-review`. Pagination should use `searchParams` page offset (simpler than cursor for a read-only descending list with no live updates) matching Next.js 15+ async searchParams pattern already established in the codebase.

**Primary recommendation:** Four independent deliverables (API filter, upsert guard, cron endpoint, admin tab) can be planned as sequential tasks in a single plan. No new dependencies needed if using native `Intl` for timezone math. Install `date-fns-tz` only if the team prefers explicit named functions.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Archival threshold**
- Archive events whose event_date has passed the end of the calendar day in the venue's province timezone
- Per-province timezone: America/Halifax for NS, NB, PEI; America/St_Johns for NL
- Cron joins events→venues to get province column for timezone selection
- event_date stored values treated as UTC — compare against "start of today in province timezone, converted to UTC"

**Cron scheduling**
- New dedicated endpoint at /api/cron/archive (not part of existing scrape cron)
- Runs at 7am UTC (after the 6am UTC scrape cron completes)
- Add to vercel.json cron configuration
- CRON_SECRET authorization check matching existing cron endpoint pattern
- Console logging only (count of events archived) — no new database table for archive run history

**Admin archived events tab**
- New "Archived" nav tab in admin UI at /admin/archived
- Essential info per row: performer, venue name, event date, archived_at date
- Read-only — no manual unarchive action
- No search or filtering — simple paginated list sorted by archived_at descending
- Pagination for the list (archived events grow over time)

**API filter strategy**
- Replace current gte(event_date, new Date()) in /api/events with archived_at IS NULL
- Cron is the single source of truth for what's archived — no redundant date filter
- Acceptable if past events briefly show when cron hasn't run yet (cosmetic, not data integrity)
- Separate /api/admin/archived endpoint for the admin tab (not a query param on /api/events)

**COALESCE guard for re-scraping**
- upsertEvent ON CONFLICT clause must preserve existing archived_at via COALESCE
- Re-scraping an already-archived event leaves archived_at unchanged
- Pattern: `archived_at: sql\`COALESCE(${events.archived_at}, ${events.archived_at})\`` (no-op — simply don't include archived_at in the SET clause)

### Claude's Discretion
- Pagination implementation (cursor vs offset)
- Admin archived tab styling and layout details
- Exact console log format for cron results
- Error handling patterns for the cron endpoint

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-02 | Daily cron archives past events using Atlantic timezone threshold | Cron pattern from `/api/cron/scrape/route.ts`; timezone math section below; vercel.json cron format confirmed |
| ARCH-03 | Events API excludes archived events from public map and list | `isNull` from `drizzle-orm` replaces `gte` in `/api/events/route.ts` WHERE clause |
| ARCH-04 | Re-scraping an archived event does not unarchive it (COALESCE guard in upsert) | `normalizer.ts` upsertEvent ON CONFLICT SET object — omit `archived_at` entirely |
| ARCH-05 | Admin can view archived events in a dedicated tab | Server component pattern from `/admin/discovery/page.tsx`; NavLinks array pattern; `/api/admin/archived` endpoint |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 | ORM queries — `isNull`, `and`, `lt`, `desc`, `offset`, `limit` | Already used throughout codebase |
| next.js | 16.1.6 | Server components, Route Handlers, async searchParams | Project framework |
| date-fns | ^4.1.0 | Date utilities | Already in package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns-tz | Not installed | Named `toZonedTime`/`fromZonedTime` helpers | Only needed if team prefers explicit tz functions over `Intl` API |
| Node.js `Intl.DateTimeFormat` | built-in | Compute Atlantic midnight in UTC | Preferred — zero new dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `Intl` timezone math | `date-fns-tz` | `date-fns-tz` is more readable but requires a new dependency; `Intl` is built-in and sufficient for this threshold calculation |
| Offset-based pagination | Cursor-based | Cursor is more efficient at scale but offset is simpler and matches the read-only, no-live-update use case |

**Installation (if date-fns-tz chosen):**
```bash
npm install date-fns-tz
```

---

## Architecture Patterns

### Existing Project Structure (relevant areas)
```
src/
├── app/
│   ├── admin/
│   │   ├── _components/NavLinks.tsx   # Add Archived link here
│   │   ├── archived/                  # NEW: page.tsx + loading.tsx
│   │   └── layout.tsx                 # No changes needed
│   └── api/
│       ├── admin/
│       │   └── archived/              # NEW: route.ts
│       ├── cron/
│       │   ├── scrape/route.ts        # Reference pattern for archive cron
│       │   └── archive/               # NEW: route.ts
│       └── events/route.ts            # Modify WHERE clause
└── lib/
    └── scraper/
        └── normalizer.ts              # Modify upsertEvent ON CONFLICT SET
```

### Pattern 1: Cron Route Handler
**What:** Next.js Route Handler with CRON_SECRET Bearer auth, try/catch, JSON response
**When to use:** All `/api/cron/*` endpoints

Exact pattern from `/api/cron/scrape/route.ts`:
```typescript
// Source: src/app/api/cron/scrape/route.ts
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ... do work ...
    return Response.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Cron archive job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

### Pattern 2: Drizzle isNull Filter
**What:** Replace `gte(events.event_date, new Date())` with `isNull(events.archived_at)`
**When to use:** ARCH-03 — public events endpoint

```typescript
// Source: drizzle-orm (isNull imported alongside other operators)
import { isNull, eq, inArray } from 'drizzle-orm';

// In /api/events/route.ts WHERE clause:
.where(isNull(events.archived_at))
```

### Pattern 3: Drizzle Bulk UPDATE with JOIN for Archival
**What:** Archive all events past the Atlantic threshold in a single UPDATE statement
**When to use:** The archive cron endpoint

The cron must archive events per province because NL and all other provinces have different thresholds. Two approaches are valid:

**Option A: Two-query approach (simpler, recommended)**
```typescript
// Compute thresholds for each timezone bucket
const halifaxThreshold = getStartOfTodayInTimezone('America/Halifax');
const stjohnsThreshold = getStartOfTodayInTimezone('America/St_Johns');

// Archive Halifax-timezone provinces (NS, NB, PEI)
const halifaxResult = await db
  .update(events)
  .set({ archived_at: new Date() })
  .where(
    and(
      isNull(events.archived_at),
      lt(events.event_date, halifaxThreshold),
      inArray(
        events.venue_id,
        db.select({ id: venues.id }).from(venues).where(
          inArray(venues.province, ['NS', 'NB', 'PEI'])
        )
      )
    )
  )
  .returning({ id: events.id });

// Archive NL timezone
const nlResult = await db
  .update(events)
  .set({ archived_at: new Date() })
  .where(
    and(
      isNull(events.archived_at),
      lt(events.event_date, stjohnsThreshold),
      inArray(
        events.venue_id,
        db.select({ id: venues.id }).from(venues).where(
          eq(venues.province, 'NL')
        )
      )
    )
  )
  .returning({ id: events.id });

const total = halifaxResult.length + nlResult.length;
console.log(`[archive-cron] Archived ${total} events (Halifax: ${halifaxResult.length}, NL: ${nlResult.length})`);
```

**Option B: JOIN approach via raw sql** — more complex, not necessary at Atlantic Canada scale.

### Pattern 4: Atlantic Timezone Threshold Calculation
**What:** Compute "start of today in Atlantic timezone, as UTC Date"
**When to use:** Archive cron threshold calculation

```typescript
// No external deps — uses built-in Intl API
function getStartOfTodayInTimezone(tz: string): Date {
  const now = new Date();
  // Format current time in target timezone to extract Y/M/D
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;

  // Construct midnight in that timezone as a UTC timestamp
  // ISO string with explicit offset: parse as UTC-equivalent
  const midnightLocal = new Date(`${year}-${month}-${day}T00:00:00`);
  // This gives local midnight if run in Node — need to use the offset
  // Safer: use the timezone offset trick
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // Get today midnight string in target tz, then reinterpret as UTC offset
  // Simplest correct approach: shift from UTC by the tz offset
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const startOfDayInTz = new Date(nowInTz);
  startOfDayInTz.setHours(0, 0, 0, 0);
  // Convert back: find the UTC equivalent of midnight in tz
  const diff = nowInTz.getTime() - now.getTime();
  return new Date(startOfDayInTz.getTime() - diff);
}
```

**Simpler, more reliable alternative with date-fns-tz (if installed):**
```typescript
import { startOfDay, fromZonedTime, toZonedTime } from 'date-fns-tz';

function getStartOfTodayInTimezone(tz: string): Date {
  const now = new Date();
  const localMidnight = startOfDay(toZonedTime(now, tz));
  return fromZonedTime(localMidnight, tz);
}
```

### Pattern 5: Admin Server Component with Offset Pagination
**What:** Server component reading `searchParams.page`, computing `offset`, passing to Drizzle `.offset().limit()`
**When to use:** `/admin/archived/page.tsx` — matches existing discovery/merge-review pattern

```typescript
// Source: pattern from src/app/admin/discovery/page.tsx (adapted for pagination)
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ArchivedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: events.id,
        performer: events.performer,
        event_date: events.event_date,
        archived_at: events.archived_at,
        venue_name: venues.name,
      })
      .from(events)
      .innerJoin(venues, eq(events.venue_id, venues.id))
      .where(isNotNull(events.archived_at))
      .orderBy(desc(events.archived_at))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(events)
      .where(isNotNull(events.archived_at)),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  // ...render table + prev/next links
}
```

### Pattern 6: upsertEvent COALESCE Guard
**What:** Omit `archived_at` from the ON CONFLICT SET clause entirely
**When to use:** ARCH-04 — normalizer.ts upsertEvent

```typescript
// Source: src/lib/scraper/normalizer.ts (current onConflictDoUpdate set object)
// Simply do NOT include archived_at in the set object:
.onConflictDoUpdate({
  target: [events.venue_id, events.event_date, events.normalized_performer],
  set: {
    performer: extracted.performer!,
    event_time: extracted.event_time ?? null,
    source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
    scrape_timestamp: new Date(),
    price: extracted.price ?? null,
    ticket_link: sql`COALESCE(${events.ticket_link}, ${extracted.ticket_link ?? null})`,
    description: extracted.description ?? null,
    cover_image_url: extracted.cover_image_url ?? null,
    event_category: extracted.event_category ?? 'other',
    updated_at: new Date(),
    // archived_at is intentionally absent — omission preserves existing value
  },
})
```

**Note:** The CONTEXT.md shows an alternative `sql\`COALESCE(${events.archived_at}, ${events.archived_at})\`` which is a valid no-op expression, but omission is cleaner and equally correct. Either works.

### Pattern 7: NavLinks Addition
**What:** Add entry to NAV_LINKS constant array in `NavLinks.tsx`
**When to use:** ARCH-05 — admin nav tab

```typescript
// Source: src/app/admin/_components/NavLinks.tsx
const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/venues', label: 'Venues', exact: false },
  { href: '/admin/discovery', label: 'Discovery', exact: false },
  { href: '/admin/merge-review', label: 'Merge Review', exact: false },
  { href: '/admin/archived', label: 'Archived', exact: false },   // NEW
  { href: '/admin/settings', label: 'Settings', exact: false },
];
```

### Pattern 8: vercel.json Cron Entry
**What:** Add archive cron to vercel.json crons array
**When to use:** ARCH-02 — scheduling

```json
{
  "path": "/api/cron/archive",
  "schedule": "0 7 * * *"
}
```

### Anti-Patterns to Avoid
- **Adding both `isNull(archived_at)` AND a date filter to `/api/events`:** The decision is archived_at IS NULL alone. Redundant date filter would re-exclude freshly unarchived events (if that feature ever exists) and contradicts the cron-as-single-source-of-truth decision.
- **Including `archived_at` in upsertEvent ON CONFLICT SET:** Any SET value for archived_at risks resetting it to NULL on re-scrape.
- **Using UTC midnight instead of Atlantic midnight:** Events on 2026-03-17 in Halifax are still future events at midnight UTC but past in Atlantic time after 11 PM UTC. Use the correct timezone threshold.
- **Archived tab as a query param on `/api/events`:** The decision is a separate `/api/admin/archived` endpoint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-aware "start of day" | Custom offset math | `Intl.DateTimeFormat` formatToParts + offset calculation, or `date-fns-tz` | DST transitions make raw offset math error-prone (Halifax DST gap causes 3:30AM NL anomalies if miscalculated) |
| Null check in SQL | Raw `sql` template | `isNull(events.archived_at)` from drizzle-orm | Already imported in other route files; type-safe |
| Pagination math | Custom offset tracking | Standard `page * PAGE_SIZE` offset with `.limit().offset()` | Built into Drizzle; no cursor needed for a read-only descending list |

**Key insight:** This phase has no genuinely novel problems. Every piece maps to an established codebase pattern. The only subtlety is timezone math for Atlantic provinces.

---

## Common Pitfalls

### Pitfall 1: event_date is plain TIMESTAMP, not TIMESTAMPTZ
**What goes wrong:** The schema shows `timestamp('event_date').notNull()` — no `{ withTimezone: true }`. This means event_date values are stored as-is with no timezone offset. If scrapers write local Atlantic times without explicit UTC annotation, comparisons against a UTC threshold will be off by the Atlantic offset.
**Why it happens:** The schema uses plain `timestamp` for event_date but `timestamptz` for `archived_at`. This is an existing inconsistency.
**How to avoid:** The CONTEXT.md decision is: "event_date stored values treated as UTC — compare against 'start of today in province timezone, converted to UTC'". Follow this exactly. The cron computes `getStartOfTodayInTimezone('America/Halifax')` as a UTC Date and uses `lt(events.event_date, halifaxThreshold)`. This is correct given the stated assumption.
**Warning signs:** If archived events appear on the map or future events get archived at wrong times, suspect timezone mismatch.

### Pitfall 2: NL timezone offset is non-standard
**What goes wrong:** `America/St_Johns` is UTC-3:30 standard / UTC-2:30 DST — a 30-minute offset. Hard-coding `-4:00` for all Atlantic provinces would mis-archive NL events by 30 minutes.
**Why it happens:** NL is the only jurisdiction in North America with a non-whole-hour UTC offset.
**How to avoid:** Use named IANA timezone strings, never numeric offsets. The `Intl` or `date-fns-tz` approach handles this automatically.
**Warning signs:** NL events archiving 30 minutes early or late compared to other provinces.

### Pitfall 3: Drizzle subquery in UPDATE WHERE
**What goes wrong:** Drizzle's `.update().where(inArray(events.venue_id, subquery))` syntax requires the subquery to be expressed as `db.select().from(venues).where(...)` — passing a plain array is fine but passing a Drizzle subquery object has specific syntax requirements.
**Why it happens:** Drizzle's subquery support in `inArray` was introduced but the exact API varies by version.
**How to avoid:** Pre-fetch venue IDs for each province bucket as a separate query, then pass the plain `number[]` array to `inArray`. This is simpler and avoids subquery syntax issues entirely:
```typescript
const halifaxVenueIds = await db
  .select({ id: venues.id })
  .from(venues)
  .where(inArray(venues.province, ['NS', 'NB', 'PEI']));
const halifaxIds = halifaxVenueIds.map(r => r.id);
// then: inArray(events.venue_id, halifaxIds)
```
**Warning signs:** TypeScript error "Argument of type ... is not assignable" when passing subquery to inArray.

### Pitfall 4: Existing /api/events test asserts date filter behavior
**What goes wrong:** `src/app/api/events/route.test.ts` line 105-110 has a test: "only returns future events (DB query filters by date)". This test description will be wrong after ARCH-03, and it only checks that `mockWhere` was called — not what argument was passed. The test will still pass mechanically but its description will be misleading.
**Why it happens:** The test was written for the `gte(event_date)` filter and uses a shallow mock that doesn't validate the WHERE argument.
**How to avoid:** Update the test description to "only returns non-archived events (filters by archived_at IS NULL)" and add a check that the `isNull` operator was used if the mock chain supports it.

### Pitfall 5: `maxDuration` not needed for archive cron
**What goes wrong:** The scrape cron has `export const maxDuration = 60` because scraping multiple venues is time-intensive. The archive cron is a single SQL UPDATE; omitting `maxDuration` is fine. Including it unnecessarily is harmless but adds noise.
**Why it happens:** Copy-paste from scrape cron template.
**How to avoid:** Only include `maxDuration` if the operation is expected to exceed the 10-second default.

### Pitfall 6: Admin route needs `export const dynamic = 'force-dynamic'`
**What goes wrong:** Without `force-dynamic`, Next.js may statically cache the archived events page at build time, showing stale data.
**Why it happens:** Next.js 15 defaults to static rendering for server components.
**How to avoid:** Add `export const dynamic = 'force-dynamic'` to both `page.tsx` and the `/api/admin/archived/route.ts`. All existing admin pages use this pattern.

---

## Code Examples

### Drizzle isNull import and usage
```typescript
// Source: drizzle-orm package (confirmed in backfill-categories.ts and merge-venue.ts)
import { isNull, isNotNull, and, lt, desc, count, eq, inArray } from 'drizzle-orm';

// ARCH-03: public events filter
.where(isNull(events.archived_at))

// ARCH-05: admin archived list filter
.where(isNotNull(events.archived_at))
```

### Vercel cron schedule (UTC)
```json
// Source: vercel.json existing pattern
{
  "path": "/api/cron/archive",
  "schedule": "0 7 * * *"
}
```
The existing scrape cron runs at `0 6 * * *` (6am UTC). Archive at `0 7 * * *` (7am UTC) satisfies the "after scrape completes" ordering requirement.

### Drizzle .limit().offset() for pagination
```typescript
// Source: Drizzle ORM docs (confirmed — .limit() and .offset() are standard query modifiers)
const PAGE_SIZE = 50;
const offset = (page - 1) * PAGE_SIZE;

db.select({...})
  .from(events)
  .innerJoin(venues, eq(events.venue_id, venues.id))
  .where(isNotNull(events.archived_at))
  .orderBy(desc(events.archived_at))
  .limit(PAGE_SIZE)
  .offset(offset)
```

### Pre-fetch venue IDs by province (recommended for cron)
```typescript
// Avoids subquery syntax issues; straightforward at Atlantic Canada scale
const [halifaxVenues, nlVenues] = await Promise.all([
  db.select({ id: venues.id }).from(venues)
    .where(inArray(venues.province, ['NS', 'NB', 'PEI'])),
  db.select({ id: venues.id }).from(venues)
    .where(eq(venues.province, 'NL')),
]);

const halifaxIds = halifaxVenues.map(r => r.id);
const nlIds = nlVenues.map(r => r.id);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gte(events.event_date, new Date())` in /api/events | `isNull(events.archived_at)` | Phase 30 | Cron becomes single archival authority; brief window after midnight where past events show (acceptable per decision) |
| No archived_at column | `archived_at TIMESTAMPTZ` on events | Phase 29 (complete) | Schema prerequisite satisfied |

**Deprecated/outdated:**
- The date-filter in `/api/events/route.ts`: replaced by null-check after ARCH-03 is implemented

---

## Open Questions

1. **Timezone math approach: native Intl vs date-fns-tz**
   - What we know: `date-fns` v4.1.0 is installed; `date-fns-tz` is not. Native `Intl` works but is more verbose. Both produce the same correct result.
   - What's unclear: Team preference for readability vs. dependency count
   - Recommendation: Use native `Intl` to avoid a new dependency. The `getStartOfTodayInTimezone` function is small and testable.

2. **Pre-fetching venue IDs vs. subquery in UPDATE**
   - What we know: Drizzle `inArray` accepts `number[]`. Subquery in `inArray` is supported but syntax varies by version.
   - What's unclear: Whether Drizzle 0.45.x supports nested select in `inArray` WHERE within `.update()`
   - Recommendation: Pre-fetch venue ID arrays in two separate queries. Simpler, unambiguously correct, and at Atlantic Canada scale (< 200 venues) the extra round-trip is negligible.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npm test -- --testPathPattern="cron/archive\|api/events\|normalizer"` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-02 | Archive cron returns 401 without CRON_SECRET | unit | `npm test -- --testPathPattern="cron/archive"` | Wave 0 |
| ARCH-02 | Archive cron returns 200 and calls archive function | unit | `npm test -- --testPathPattern="cron/archive"` | Wave 0 |
| ARCH-02 | Archive cron returns 500 on DB error | unit | `npm test -- --testPathPattern="cron/archive"` | Wave 0 |
| ARCH-02 | `getStartOfTodayInTimezone` returns correct UTC midnight for America/Halifax | unit | `npm test -- --testPathPattern="archive-utils\|cron/archive"` | Wave 0 |
| ARCH-02 | `getStartOfTodayInTimezone` returns correct UTC midnight for America/St_Johns | unit | `npm test -- --testPathPattern="archive-utils\|cron/archive"` | Wave 0 |
| ARCH-03 | /api/events WHERE clause uses isNull(archived_at) not gte(event_date) | unit | `npm test -- --testPathPattern="api/events"` | Exists (update needed) |
| ARCH-04 | upsertEvent ON CONFLICT SET does not include archived_at | unit | `npm test -- --testPathPattern="normalizer"` | Exists (update needed) |
| ARCH-05 | /api/admin/archived returns paginated archived events | unit | `npm test -- --testPathPattern="admin/archived"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern="cron/archive\|api/events\|normalizer\|admin/archived"`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/cron/archive/route.test.ts` — covers ARCH-02 auth + success + error cases
- [ ] `src/app/api/admin/archived/route.test.ts` — covers ARCH-05 pagination endpoint
- [ ] `src/lib/archiver.ts` (or inline in route) — archive logic unit tests including timezone threshold

*(Existing files needing updates, not new files:)*
- [ ] `src/app/api/events/route.test.ts` — update test at line 105 to assert `isNull` behavior (ARCH-03)
- [ ] `src/lib/scraper/normalizer.test.ts` — add test asserting archived_at absent from ON CONFLICT SET (ARCH-04)

---

## Sources

### Primary (HIGH confidence)
- `/Users/brad/Apps/eastcoastlocal/src/app/api/cron/scrape/route.ts` — exact cron auth pattern
- `/Users/brad/Apps/eastcoastlocal/src/app/api/events/route.ts` — exact WHERE clause to replace
- `/Users/brad/Apps/eastcoastlocal/src/lib/scraper/normalizer.ts` — exact ON CONFLICT SET to modify
- `/Users/brad/Apps/eastcoastlocal/src/app/admin/_components/NavLinks.tsx` — exact NAV_LINKS array to extend
- `/Users/brad/Apps/eastcoastlocal/src/app/admin/discovery/page.tsx` — server component pattern with searchParams
- `/Users/brad/Apps/eastcoastlocal/vercel.json` — exact cron configuration format
- `/Users/brad/Apps/eastcoastlocal/src/lib/db/schema.ts` — confirmed archived_at TIMESTAMPTZ, province column
- `/Users/brad/Apps/eastcoastlocal/src/lib/db/backfill-categories.ts` — confirmed `isNull` import from drizzle-orm works in this codebase
- `/Users/brad/Apps/eastcoastlocal/package.json` — confirmed drizzle-orm ^0.45.1, date-fns ^4.1.0, no date-fns-tz

### Secondary (MEDIUM confidence)
- Node.js `Intl.DateTimeFormat` API — well-established built-in; DST-aware when using IANA timezone names

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from package.json and source files
- Architecture: HIGH — all patterns traced to existing codebase files
- Pitfalls: HIGH (timezone) / MEDIUM (Drizzle subquery syntax edge case)

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable stack, no fast-moving dependencies)
