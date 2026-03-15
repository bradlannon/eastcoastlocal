# Phase 20: Admin Merge Review - Research

**Researched:** 2026-03-15
**Domain:** Next.js admin UI, Drizzle ORM mutations, server actions, React inline-confirmation pattern
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Candidate list layout**
- Side-by-side cards for each candidate pair — two venue cards next to each other with match metadata between them
- Each card shows: venue name, city, province, lat/lng (if available), event count, source count
- Match metadata between cards: name_score, distance_meters (if available), and reason
- Reason displayed as human-readable label (e.g. "Name match, no coordinates" not "name_match_no_geo")
- No mini map — lat/lng numbers and distance are sufficient
- Merge and Keep Separate action buttons below the card pair

**Merge action behavior**
- Canonical venue chosen by highest event count — the venue with more events survives, its identity (name/address/coords) is preserved
- Inline confirmation: click "Merge" -> button changes to "Confirm merge?" with cancel. No modal
- Hard delete the duplicate venue row after reassigning its events and sources to the canonical venue (same approach as existing backfill script)
- Write to existing `venue_merge_log` table for audit trail (canonical_venue_id, merged_venue_name, merged_venue_city, name_score, distance_meters)
- Update `venue_merge_candidates` row: set status='merged' and reviewed_at timestamp

**Keep-separate workflow**
- Single click, no confirmation needed (low-risk — no data changes)
- Updates `venue_merge_candidates` row: set status='kept_separate' and reviewed_at timestamp
- Permanently resolved — if the same pair is re-detected by a future TM ingest, it does NOT reappear in the queue (check existing candidates before inserting)
- Not reversible from this UI — admin can always manually merge venues through the venue edit page if they change their mind
- No undo/re-queue functionality needed

**Filtering & prioritization**
- Tab filter matching discovery page pattern: Pending | Merged | Kept Separate
- Default tab: Pending (the actionable queue)
- Sort: newest first (created_at descending) within each tab
- No reason-type filter — queue expected to be small; reason visible on each card
- Pending count badge on admin nav "Merge Review" item (orange, same visual language as discovery)
- Empty state: "No pending merge candidates. Candidates appear after Ticketmaster ingests detect near-match venues."

### Claude's Discretion
- Exact card styling, spacing, and responsive behavior
- Human-readable reason label text for each of the 4 reason codes
- Admin nav placement and badge implementation
- Server action vs API route for merge/keep-separate operations
- Whether to show reviewed_at timestamp on merged/kept-separate tab items

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEDUP-04 | Admin can view near-match venue pairs with side-by-side comparison and merge or keep separate | Fully covered: schema fields, merge logic in backfill script, server action pattern from discovery page, tab/status pattern established |
</phase_requirements>

---

## Summary

Phase 20 builds a single admin page (`/admin/merge-review`) that surfaces the `venue_merge_candidates` rows with status='pending' and lets admin resolve each pair with two actions: Merge or Keep Separate. The data model already exists (Phase 18); the merge logic already exists (backfill script); the UI pattern already exists (discovery page tabs). This phase is primarily an assembly task — extract the merge logic into a shared utility, build the page using established patterns, add the nav badge.

The main technical decision is where to run the merge DB transaction. Server actions (co-located `actions.ts` with `'use server'`) are the established pattern in this codebase and are the correct choice here: they keep DB access server-side, integrate with `revalidatePath`, and avoid a separate API route.

The one non-trivial piece is the merge server action itself: it must determine canonical venue by event count query, reassign events one-by-one (catching unique constraint violations as the backfill script does), reassign scrape_sources, delete the duplicate venue row, write to `venue_merge_log`, and update `venue_merge_candidates` status — all in a single operation. Extracting this into `src/lib/db/merge-venue.ts` makes it testable and reusable.

**Primary recommendation:** Build `app/admin/merge-review/` using the discovery page as the template; extract merge logic into `src/lib/db/merge-venue.ts` from the backfill script; use server actions for mutations.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | (project version) | Server components, server actions, URL searchParams for tabs | Established throughout admin |
| Drizzle ORM | (project version) | DB queries and mutations | Established, all admin pages use it |
| React `useActionState` | React 19 / Next 15 | Inline error state from server actions | Already used in DiscoveryList.tsx |
| React `useFormStatus` | React 19 / Next 15 | Loading state on submit buttons | Already used in DiscoveryList.tsx |
| Tailwind CSS | (project version) | All styling | Established throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `count()` from drizzle-orm | — | Aggregate event/source counts per venue for canonical selection and display | Used in discovery page |
| `revalidatePath` from next/cache | — | Invalidate page cache after action | Used in all existing actions |
| `redirect` from next/navigation | — | Navigate after successful action | Used in all existing actions |

### No New Dependencies

This phase requires zero new npm packages. All functionality is achievable with existing stack.

---

## Architecture Patterns

### Recommended File Structure

```
src/app/admin/merge-review/
├── page.tsx             # Server component — queries DB, renders MergeReviewList
├── actions.ts           # Server actions: mergePair, keepSeparate
└── _components/
    └── MergeReviewList.tsx  # Client component — tabs, cards, inline confirm

src/lib/db/
└── merge-venue.ts       # Shared utility: performVenueMerge(canonicalId, duplicateId, candidateId, ...)
```

### Pattern 1: Tab-filtered server component (matches discovery page)

**What:** Page component reads `searchParams.status`, queries `venue_merge_candidates` filtered by that status plus all three counts in parallel.

**When to use:** Whenever admin page has multiple status buckets — exactly matches this use case.

```typescript
// Source: src/app/admin/discovery/page.tsx (established pattern)
export const dynamic = 'force-dynamic';

type Status = 'pending' | 'merged' | 'kept_separate';
const VALID_STATUSES: Status[] = ['pending', 'merged', 'kept_separate'];

export default async function MergeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status: Status = isValidStatus(params.status ?? 'pending') ? (params.status as Status) : 'pending';

  const [candidates, pendingCount, mergedCount, keptCount] = await Promise.all([
    db.select({ /* venue_a fields, venue_b fields, candidate fields */ })
      .from(venueMergeCandidates)
      .innerJoin(venueA, eq(venueMergeCandidates.venue_a_id, venueA.id))
      .innerJoin(venueB, eq(venueMergeCandidates.venue_b_id, venueB.id))
      .where(eq(venueMergeCandidates.status, status))
      .orderBy(desc(venueMergeCandidates.created_at)),
    db.select({ count: count() }).from(venueMergeCandidates).where(eq(venueMergeCandidates.status, 'pending')),
    db.select({ count: count() }).from(venueMergeCandidates).where(eq(venueMergeCandidates.status, 'merged')),
    db.select({ count: count() }).from(venueMergeCandidates).where(eq(venueMergeCandidates.status, 'kept_separate')),
  ]);
  // ...
}
```

**Drizzle join alias note:** Joining `venues` twice (once as venue_a, once as venue_b) requires Drizzle table aliases. Use `alias` from drizzle-orm:

```typescript
import { alias } from 'drizzle-orm/pg-core';
const venueA = alias(venues, 'venue_a');
const venueB = alias(venues, 'venue_b');
```

### Pattern 2: Event/source count subquery per venue

**What:** For each candidate pair, display event count and source count per venue. Also used server-side in the merge action to determine canonical venue (higher event count wins).

```typescript
// Count events per venue — run for both venue_a_id and venue_b_id
const eventCounts = await db
  .select({ venue_id: events.venue_id, count: count() })
  .from(events)
  .where(inArray(events.venue_id, [venueAId, venueBId]))
  .groupBy(events.venue_id);

const sourceCounts = await db
  .select({ venue_id: scrape_sources.venue_id, count: count() })
  .from(scrape_sources)
  .where(inArray(scrape_sources.venue_id, [venueAId, venueBId]))
  .groupBy(scrape_sources.venue_id);
```

For the page query, this can be done as lateral subqueries or by fetching all candidates and then batching count queries. Given expected small queue size, N+1 per candidate row is acceptable but a single GROUP BY query is preferred.

### Pattern 3: Inline confirmation without modal

**What:** "Merge" button starts in normal state; on click, switches to "Confirm merge? | Cancel" inline. No modal. Matches the CONTEXT.md decision exactly.

**When to use:** Destructive actions where accidental click risk is low enough that a single inline confirm suffices — this is the established DiscoveryList revoke pattern.

```typescript
// Source: DiscoveryList.tsx revoke flow (established pattern)
const [confirmingId, setConfirmingId] = useState<number | null>(null);

// Render:
{confirmingId !== candidateId ? (
  <button onClick={() => setConfirmingId(candidateId)}>Merge</button>
) : (
  <>
    <form action={mergePair}>
      <input type="hidden" name="candidateId" value={candidateId} />
      <MergeSubmitButton />
    </form>
    <button onClick={() => setConfirmingId(null)}>Cancel</button>
  </>
)}
```

### Pattern 4: Keep Separate server action (no confirmation)

**What:** Single form submit, no client-side confirm state needed. Updates candidate status and revalidates.

```typescript
// Source: actions.ts pattern (established)
'use server';
export async function keepSeparate(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('candidateId') ?? ''), 10);
  if (isNaN(id)) return;
  await db
    .update(venueMergeCandidates)
    .set({ status: 'kept_separate', reviewed_at: new Date() })
    .where(eq(venueMergeCandidates.id, id));
  revalidatePath('/admin/merge-review');
  redirect('/admin/merge-review');
}
```

### Pattern 5: Merge utility extracted from backfill script

**What:** `src/lib/db/merge-venue.ts` — pure async function that performs the full merge operation. Extracted from `venue-dedup-backfill.ts` which already has the correct algorithm.

```typescript
// Source: scripts/venue-dedup-backfill.ts lines 191-238 (adapt for shared use)
export async function performVenueMerge(opts: {
  canonicalId: number;
  duplicateId: number;
  candidateId: number;
  nameScore: number;
  distanceMeters: number | null;
  duplicateName: string;
  duplicateCity: string;
}): Promise<{ eventsReassigned: number; eventsDropped: number }> {
  // 1. Reassign events one-by-one (catch unique constraint violations → delete orphan)
  // 2. Reassign scrape_sources
  // 3. Delete duplicate venue row
  // 4. Insert into venue_merge_log
  // 5. Update venue_merge_candidates: status='merged', reviewed_at=now()
}
```

**Critical:** Event reassignment must remain per-event (not bulk UPDATE) because the unique index on (venue_id, event_date, normalized_performer) means a duplicate event on the canonical venue must be deleted, not reassigned. The backfill script handles this with a try/catch per event — preserve this exact approach.

### Pattern 6: Admin nav badge for pending count

**What:** Add pending count to the "Merge Review" nav link. The `admin/layout.tsx` is currently a client component (uses `usePathname`), so it can fetch the pending count as a server component with a child client component for active state, or the count can be passed as a prop from a server wrapper.

**Constraint:** `layout.tsx` is currently `'use client'`. To add a live pending count badge, the simplest approach is:
- Convert layout to a server component that fetches the pending count
- Extract the active-link logic into a separate `NavLinks` client component
- Pass `pendingMergeCount` prop to `NavLinks`

This avoids introducing `useState`/`useEffect` data fetching in a client component.

### Anti-Patterns to Avoid

- **Bulk UPDATE for event reassignment:** Don't do `UPDATE events SET venue_id=canonicalId WHERE venue_id=duplicateId` — this will fail on the unique index when canonical already has that event. Must be per-event with individual error handling.
- **Modal for merge confirmation:** CONTEXT.md explicitly requires inline confirm, not a modal.
- **Fetching counts in the client component:** Counts must be fetched server-side and passed as props.
- **Trusting venue_a as canonical:** Canonical is determined by highest event count at merge time, not by which is venue_a or venue_b in the candidates table.
- **Not checking kept_separate before inserting new candidates:** `ticketmaster.ts:185` currently inserts without checking if the same pair was previously kept_separate. This dedup guard must be added.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event reassignment during merge | Custom merge transaction | Extract from `venue-dedup-backfill.ts` | Already handles unique constraint violations correctly |
| Tab URL state | Client-side state management | URL searchParams (existing pattern) | Server components, shareable URLs, no hydration issues |
| Badge count in nav | Polling or websocket | Server component with `force-dynamic` layout | Simple, no client complexity, accurate on each load |

---

## Common Pitfalls

### Pitfall 1: Drizzle alias for self-join on venues table

**What goes wrong:** Joining `venues` twice without aliases produces ambiguous column names — Drizzle selects from the same table object, breaking the query.

**Why it happens:** Each candidate row references `venue_a_id` and `venue_b_id`, both pointing to `venues`. Drizzle needs two distinct table references.

**How to avoid:** Use `alias(venues, 'venue_a')` and `alias(venues, 'venue_b')` from `drizzle-orm/pg-core`.

**Warning signs:** TypeScript will not catch this at compile time — runtime query returns wrong columns silently.

### Pitfall 2: Canonical venue determination is dynamic, not stored

**What goes wrong:** Admin code assumes venue_a or venue_b is always canonical. In reality, canonical is the one with more events at merge time.

**Why it happens:** The schema does not encode which is canonical — that determination happens at merge execution.

**How to avoid:** In the merge server action, query event counts for both venue IDs, pick the higher one as canonical, pass both IDs to `performVenueMerge`.

### Pitfall 3: kept_separate pairs re-entering the queue on future TM ingest

**What goes wrong:** After admin marks a pair as kept_separate, a future Ticketmaster ingest creates a new `venue_merge_candidates` row for the same pair.

**Why it happens:** `ticketmaster.ts:findOrCreateVenue` currently inserts into `venue_merge_candidates` without checking if a kept_separate record exists for that pair.

**How to avoid:** Before inserting a new candidate row in `findOrCreateVenue`, query for any existing record with (venue_a_id, venue_b_id) in either order. If one exists with any status, skip insertion. This is the guard described in CONTEXT.md.

**Warning signs:** Kept-separate items reappear in Pending tab after TM scrape runs.

### Pitfall 4: Admin layout.tsx is a client component — can't fetch DB directly

**What goes wrong:** Trying to call `db.select()` inside `layout.tsx` which has `'use client'`.

**Why it happens:** The nav uses `usePathname()` for active link detection.

**How to avoid:** Extract nav link rendering into a `NavLinks.tsx` client component, convert `layout.tsx` to a server component that fetches the pending count and passes it as a prop.

### Pitfall 5: `redirect()` throwing inside try/catch

**What goes wrong:** `redirect()` from `next/navigation` throws a special Next.js error internally — if called inside a try/catch block that catches all errors, the redirect is swallowed.

**Why it happens:** Next.js redirect() works by throwing a special error that Next.js intercepts.

**How to avoid:** Call `redirect()` outside of any try/catch block. Perform DB operations inside try/catch, collect errors, then call redirect or return error after the try/catch completes. Existing actions.ts files in this project already follow this pattern correctly.

---

## Code Examples

### Reason code human-readable labels

```typescript
// For MergeReviewList.tsx display
const REASON_LABELS: Record<string, string> = {
  name_match_no_geo:       'Name match, no coordinates',
  name_match_geo_distant:  'Name match, locations too far apart',
  name_match_geo_uncertain:'Name match, locations borderline distance',
  geo_close_name_differs:  'Locations close, names differ',
};
```

### Drizzle self-join query skeleton

```typescript
// Source: Drizzle ORM alias documentation (verified pattern)
import { alias } from 'drizzle-orm/pg-core';
import { eq, desc, count } from 'drizzle-orm';
import { venues, venueMergeCandidates } from '@/lib/db/schema';

const venueA = alias(venues, 'venue_a');
const venueB = alias(venues, 'venue_b');

const rows = await db
  .select({
    candidateId: venueMergeCandidates.id,
    nameScore: venueMergeCandidates.name_score,
    distanceMeters: venueMergeCandidates.distance_meters,
    reason: venueMergeCandidates.reason,
    status: venueMergeCandidates.status,
    createdAt: venueMergeCandidates.created_at,
    reviewedAt: venueMergeCandidates.reviewed_at,
    venueAId: venueA.id,
    venueAName: venueA.name,
    venueACity: venueA.city,
    venueAProvince: venueA.province,
    venueALat: venueA.lat,
    venueALng: venueA.lng,
    venueBId: venueB.id,
    venueBName: venueB.name,
    venueBCity: venueB.city,
    venueBProvince: venueB.province,
    venueBLat: venueB.lat,
    venueBLng: venueB.lng,
  })
  .from(venueMergeCandidates)
  .innerJoin(venueA, eq(venueMergeCandidates.venue_a_id, venueA.id))
  .innerJoin(venueB, eq(venueMergeCandidates.venue_b_id, venueB.id))
  .where(eq(venueMergeCandidates.status, status))
  .orderBy(desc(venueMergeCandidates.created_at));
```

### Kept-separate dedup guard in ticketmaster.ts

```typescript
// Add before inserting new venue_merge_candidates row
// Check if this pair was already resolved (any status, either order)
const existingCandidate = await db.query.venueMergeCandidates.findFirst({
  where: (t, { and, eq: eqOp, or }) =>
    or(
      and(eqOp(t.venue_a_id, inserted.id), eqOp(t.venue_b_id, bestCandidateId!)),
      and(eqOp(t.venue_a_id, bestCandidateId!), eqOp(t.venue_b_id, inserted.id))
    ),
});

if (!existingCandidate) {
  await db.insert(venueMergeCandidates).values({ /* ... */ });
}
```

### merge-venue.ts utility skeleton

```typescript
// Source: scripts/venue-dedup-backfill.ts merge logic (adapted)
import { db } from '@/lib/db/client';
import { venues, events, scrape_sources, venueMergeLog, venueMergeCandidates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function performVenueMerge(opts: {
  canonicalId: number;
  duplicateId: number;
  candidateId: number;
  nameScore: number;
  distanceMeters: number | null;
  duplicateName: string;
  duplicateCity: string;
}): Promise<void> {
  const { canonicalId, duplicateId, candidateId, nameScore, distanceMeters, duplicateName, duplicateCity } = opts;

  // 1. Reassign events one-by-one (handle unique constraint on venue_id+event_date+normalized_performer)
  const dupeEvents = await db.select({ id: events.id }).from(events).where(eq(events.venue_id, duplicateId));
  for (const evt of dupeEvents) {
    try {
      await db.update(events).set({ venue_id: canonicalId }).where(eq(events.id, evt.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unique') || msg.includes('duplicate')) {
        await db.delete(events).where(eq(events.id, evt.id));
      } else {
        throw err;
      }
    }
  }

  // 2. Reassign scrape_sources
  await db.update(scrape_sources).set({ venue_id: canonicalId }).where(eq(scrape_sources.venue_id, duplicateId));

  // 3. Delete duplicate venue
  await db.delete(venues).where(eq(venues.id, duplicateId));

  // 4. Audit log
  await db.insert(venueMergeLog).values({
    canonical_venue_id: canonicalId,
    merged_venue_name: duplicateName,
    merged_venue_city: duplicateCity,
    name_score: nameScore,
    distance_meters: distanceMeters,
  });

  // 5. Update candidate status
  await db.update(venueMergeCandidates)
    .set({ status: 'merged', reviewed_at: new Date() })
    .where(eq(venueMergeCandidates.id, candidateId));
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| formData-based server actions without `useActionState` | `useActionState(action, initialState)` for inline errors | Error state reflected without page reload |
| `searchParams` as `{ status: string }` synchronously | `searchParams: Promise<{ status?: string }>` awaited | Required in Next.js 15+ async params |

**Note on Next.js 15 searchParams:** The project's discovery page already uses `searchParams: Promise<{ status?: string }>` with `await searchParams` — use the same pattern.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEDUP-04 | `performVenueMerge` reassigns events, drops conflicts, writes audit log, updates candidate status | unit | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | Wave 0 |
| DEDUP-04 | `keepSeparate` action updates status to 'kept_separate' | unit (mock DB) | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | Wave 0 |
| DEDUP-04 | Kept-separate guard prevents duplicate candidate insertion in ticketmaster.ts | unit | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` | Extend existing ✅ |
| DEDUP-04 | Reason label map covers all 4 reason codes | unit | `npx jest src/app/admin/merge-review --no-coverage` | Wave 0 |

**Note:** Server action behavior (page-level integration) is not unit-testable; acceptance criteria are verified manually or through the verify-work phase.

### Sampling Rate
- **Per task commit:** `npx jest src/lib/db/merge-venue.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/db/merge-venue.test.ts` — unit tests for `performVenueMerge` (with mocked DB)
- [ ] `src/app/admin/merge-review/` directory and files (page.tsx, actions.ts, _components/MergeReviewList.tsx)

---

## Open Questions

1. **Event_sources reassignment during merge**
   - What we know: `performVenueMerge` reassigns `events` and `scrape_sources` — but `event_sources` references `event_id`, not `venue_id` directly
   - What's unclear: When an event is deleted (unique conflict), its `event_sources` rows reference the deleted event_id. The `event_sources.event_id` FK likely has ON DELETE CASCADE or will fail.
   - Recommendation: Check the schema FK definition for `event_sources.event_id`. If no CASCADE, add `await db.delete(event_sources).where(eq(event_sources.event_id, evt.id))` before deleting the event in the merge utility. The schema shows `references(() => events.id)` with no explicit CASCADE — assume Postgres default (RESTRICT), so deletion order matters.

2. **Nav badge: layout server component conversion**
   - What we know: `layout.tsx` is `'use client'` (uses `usePathname`), meaning DB access must be in a server parent
   - What's unclear: Whether converting layout to server + extracting NavLinks client component might break any existing pattern
   - Recommendation: Convert layout.tsx to server component; extract active-link logic to `_components/NavLinks.tsx` client component that accepts `pendingMergeCount: number` prop. This is a small, clean refactor with no risk.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `src/app/admin/discovery/` — Tab pattern, DiscoveryList client component, actions.ts server action pattern
- Codebase: `scripts/venue-dedup-backfill.ts` — Merge algorithm (event reassignment with unique conflict handling)
- Codebase: `src/lib/db/schema.ts` — `venueMergeCandidates`, `venueMergeLog`, `venues`, `events`, `scrape_sources` schemas
- Codebase: `src/lib/scraper/venue-dedup.ts` — Reason codes (4 values), scoring algorithm
- Codebase: `src/lib/scraper/ticketmaster.ts` — Existing candidate insertion without kept_separate guard (gap to fix)
- Codebase: `src/app/admin/layout.tsx` — Current nav structure (client component, needs refactor for badge)

### Secondary (MEDIUM confidence)

- Drizzle ORM docs: `alias()` for self-joins — standard pattern, present in Drizzle docs
- Next.js 15 docs: `searchParams` as Promise — confirmed by project's existing discovery page usage

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — direct extrapolation from existing patterns in codebase
- Pitfalls: HIGH — identified from reading actual code (backfill script, layout.tsx, ticketmaster.ts)
- Open questions: MEDIUM — event_sources FK cascade behavior requires one targeted schema check

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable stack; no external dependencies added)
