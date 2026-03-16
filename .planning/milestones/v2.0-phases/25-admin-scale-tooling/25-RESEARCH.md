# Phase 25: Admin Scale Tooling - Research

**Researched:** 2026-03-16
**Domain:** Next.js server actions, React client state, Drizzle ORM schema migration
**Confidence:** HIGH

## Summary

This phase adds three admin productivity features that are entirely internal to the existing codebase: batch-approve for discovery candidates, a `discovery_runs` DB table for instrumentation, and a dashboard summary section. No new external APIs are introduced. All patterns already exist in the project — the work is wiring them together in new combinations.

The highest-complexity piece is the batch-approve UI: it requires adding checkbox state to a client component that currently uses row-click expansion, and a new server action that processes an array of IDs. The migration is straightforward Drizzle schema work. The dashboard additions follow the existing stat card and table patterns exactly.

The three features are loosely coupled and can be implemented in sequence as separate plans: (1) DB schema + discoverer instrumentation, (2) batch approve UI + action, (3) dashboard additions.

**Primary recommendation:** Build in dependency order — migration first (no UI dependency), then batch approve (standalone UI change), then dashboard (reads from new table).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Batch Approve UX**
- Add checkbox column to discovery list table (left of Name column)
- Per-row checkboxes for individual selection
- "Select All" checkbox in table header toggles all visible rows
- "Batch Approve (N)" button appears when any rows are selected — count updates live
- Immediate execution on click — no confirmation dialog (admin made conscious selections via checkboxes)
- Batch approve only — reject stays one-at-a-time since rejection reasons are per-candidate
- Batch approve calls existing `promoteSource()` for each selected candidate (same as individual approve)
- Only visible on the "pending" tab — no batch actions on approved/rejected tabs

**Discovery Run Metrics Storage**
- New `discovery_runs` DB table (requires Drizzle migration)
- Columns: id (serial PK), discovery_method (text), province (text nullable), started_at (timestamp), completed_at (timestamp), candidates_found (int), auto_approved (int), queued_pending (int), skipped_dedup (int), errors (int), error_detail (text nullable)
- All three discovery channels instrument this table: google_places (4 province endpoints), gemini_google_search (existing discovery), reddit_gemini
- One row per cron run — Places gets one row per province endpoint, Reddit gets one aggregate row (province = null), Gemini gets one row (province = null)
- Keep all history — no retention cleanup (rows are tiny, ~350/year)

**Dashboard Run Summary**
- New 5th stat card: "Last Discovery" showing relative time of most recent run + success/error indicator
- "Last Discovery" card links to /admin/discovery (pending tab) on click — same pattern as existing "Pending Discoveries" card
- New "Recent Discovery Runs" section below existing Source Health table
- Shows last 10 runs across all channels, ordered by completed_at desc
- Table columns: Method, Province, Found, Approved, Pending, Errors, When (relative time)

### Claude's Discretion
- Error row visual treatment in discovery runs table (red highlight vs plain number)
- Exact "Select All" checkbox behavior when some rows are already selected (toggle all vs clear all)
- Whether batch approve uses a single server action call with array of IDs or sequential calls
- Loading/disabled state during batch approve execution

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADMIN-01 | Admin can batch-approve multiple discovered sources in one action | New `batchApproveCandidate` server action accepting `ids[]`; checkbox state in DiscoveryList client component |
| ADMIN-02 | System logs discovery run metrics (candidates found, auto-approved, queued, errors) | New `discovery_runs` Drizzle table + insert calls in all three cron route handlers |
| ADMIN-03 | Admin dashboard shows last discovery run summary with counts | New stat card + table reading from `discovery_runs`; follows existing dashboard query pattern |
</phase_requirements>

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | existing | Schema definition + query builder | Already used for all DB access |
| drizzle-kit | existing | Migration generation (`db:generate`) | Established migration workflow |
| React useState | built-in | Checkbox selection state in client component | Already used in DiscoveryList for expandedId, rejectingId, revokingId |
| Next.js server actions | built-in | `batchApproveCandidate` action | Already used for approveCandidate, rejectCandidate, revokeCandidate |
| `revalidatePath` | next/cache | Cache invalidation after batch approve | Already used in all existing actions |
| `useFormStatus` | react-dom | Loading/disabled state on submit button | Already used for ApproveSubmitButton, RejectSubmitButton |

### No new dependencies needed
All required functionality exists in the current project stack. This phase adds zero new npm packages.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Plan Split

```
Plan A: DB schema + cron instrumentation
  - Add discovery_runs table to schema.ts
  - Run drizzle-kit generate + migrate
  - Add insertDiscoveryRun() helper function
  - Instrument places-discoverer.ts (all 4 province routes)
  - Instrument discovery-orchestrator.ts (gemini_google_search)
  - Instrument reddit-discoverer.ts

Plan B: Batch approve
  - Add batchApproveCandidate server action to actions.ts
  - Modify DiscoveryList.tsx: checkbox column, selectedIds state, batch approve button

Plan C: Dashboard additions
  - Add "Last Discovery" stat card to admin/page.tsx
  - Add "Recent Discovery Runs" table section to admin/page.tsx
  - Query discovery_runs table in Promise.all()
```

### Pattern 1: Drizzle Schema Addition
**What:** Add new table definition to schema.ts, then run `drizzle-kit generate` to produce migration SQL.
**When to use:** Any new persistent storage.

```typescript
// Source: existing schema.ts pattern
export const discovery_runs = pgTable('discovery_runs', {
  id: serial('id').primaryKey(),
  discovery_method: text('discovery_method').notNull(),
  province: text('province'),                         // null for Reddit, Gemini
  started_at: timestamp('started_at').notNull(),
  completed_at: timestamp('completed_at').notNull(),
  candidates_found: integer('candidates_found').notNull().default(0),
  auto_approved: integer('auto_approved').notNull().default(0),
  queued_pending: integer('queued_pending').notNull().default(0),
  skipped_dedup: integer('skipped_dedup').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  error_detail: text('error_detail'),
});
```

Migration command: `npm run db:generate && npm run db:migrate`

### Pattern 2: Cron Instrumentation — Before/After Wrapper
**What:** Wrap each cron `GET` handler body with a `started_at` capture before calling the discoverer, and a DB insert after it completes.
**When to use:** All three cron route files.

```typescript
// Pattern for cron route instrumentation
// Source: inferred from existing cron route structure
const startedAt = new Date();
try {
  const result = await runPlacesDiscovery(PLACES_CITIES.NS);
  await db.insert(discovery_runs).values({
    discovery_method: 'google_places',
    province: 'NS',
    started_at: startedAt,
    completed_at: new Date(),
    candidates_found: result.candidatesFound,
    auto_approved: result.autoApproved,
    queued_pending: result.stagedPending,
    skipped_dedup: result.enriched,   // 'enriched' = skipped dedup
    errors: result.errors,
  });
  return Response.json({ success: true, ...result });
} catch (err) {
  await db.insert(discovery_runs).values({
    discovery_method: 'google_places',
    province: 'NS',
    started_at: startedAt,
    completed_at: new Date(),
    candidates_found: 0,
    auto_approved: 0,
    queued_pending: 0,
    skipped_dedup: 0,
    errors: 1,
    error_detail: String(err),
  });
  return Response.json({ success: false, error: String(err) }, { status: 500 });
}
```

### Pattern 3: Batch Server Action
**What:** New server action accepting multiple IDs, calling `promoteSource()` for each.
**When to use:** Batch approve button click.

The key decision (Claude's discretion) is sequential vs parallel execution:
- **Sequential** (`for` loop): Simpler, consistent with existing single-approve pattern, avoids DB contention. Recommended for correctness.
- **Parallel** (`Promise.all`): Faster for large batches but risks overwhelming the DB connection pool.

Recommendation: **Sequential with `Promise.allSettled`** — processes all IDs, collects errors, does not abort on first failure.

```typescript
// Source: inferred from existing approveCandidate pattern
'use server';

export async function batchApproveCandidate(formData: FormData): Promise<void> {
  const raw = formData.get('ids');
  const ids = String(raw ?? '').split(',').map(Number).filter(n => !isNaN(n));
  if (ids.length === 0) return;

  const results = await Promise.allSettled(
    ids.map(id => promoteSource(id))
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[batchApproveCandidate] ${failures.length} of ${ids.length} failed`);
  }

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}
```

### Pattern 4: Checkbox State in Client Component
**What:** Add `selectedIds: Set<number>` state to DiscoveryList, render checkboxes in a new leftmost `<th>`/`<td>` column, show batch button above table when `selectedIds.size > 0`.
**When to use:** Pending tab only (`activeStatus === 'pending'`).

Key considerations from existing component:
- Row `onClick` expands the row — checkboxes must use `e.stopPropagation()` to prevent row expansion on checkbox click
- The existing table has 5 columns (Name, URL, City, Province, Score); adding a checkbox column makes 6 — `colSpan={5}` on expanded rows must become `colSpan={6}`
- "Select All" in header: simplest behavior is toggle (if all selected → clear all; else → select all) rather than indeterminate state

```typescript
// Source: React useState pattern, existing component structure
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

function toggleRow(id: number) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}

function toggleAll() {
  if (selectedIds.size === candidates.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(candidates.map(c => c.id)));
  }
}
```

### Pattern 5: Dashboard Query Extension
**What:** Add `discovery_runs` query to the existing `Promise.all()` in `admin/page.tsx`.
**When to use:** Dashboard page data fetch.

```typescript
// Source: existing admin/page.tsx Promise.all pattern
const [
  venueResult,
  activeSourceResult,
  pendingDiscoveryResult,
  lastScrapeResult,
  sourceHealthResult,
  lastDiscoveryRunResult,   // NEW — most recent completed_at
  recentRunsResult,         // NEW — last 10 runs
] = await Promise.all([
  // ... existing queries ...
  db.select({ completedAt: max(discovery_runs.completed_at), errors: sum(discovery_runs.errors) })
    .from(discovery_runs),
  db.select({ ... })
    .from(discovery_runs)
    .orderBy(desc(discovery_runs.completed_at))
    .limit(10),
]);
```

### Anti-Patterns to Avoid
- **`redirect()` inside try/catch:** The existing `approveCandidate` puts `redirect()` after the try/catch. Follow this pattern for `batchApproveCandidate` — Next.js `redirect()` throws internally and must not be caught.
- **Forgetting `colSpan` update:** When adding the checkbox column, the expanded row `<td colSpan={5}>` must become `colSpan={6}`. Missing this will break the row expansion layout.
- **Inserting into discovery_runs inside the discoverer functions:** The instrumentation belongs in the cron route handlers, not inside `runPlacesDiscovery()` or `runRedditDiscovery()`. The discoverer functions return result objects; the route handler is the right place to persist them. This keeps the discoverer functions testable without DB side effects.
- **Parallel `Promise.all` for batch promote:** `promoteSource()` does multiple DB operations per call. Running them fully parallel risks violating unique constraints or exceeding the Neon serverless connection pool. Use `Promise.allSettled` over sequential, not `Promise.all` over parallel.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB migration | Manual SQL ALTER TABLE | `drizzle-kit generate` + `drizzle-kit migrate` | Tracks migration history in `drizzle/meta/`, handles rollbacks |
| Relative timestamps on dashboard | Custom time formatting | Reuse existing `relativeTime()` in `admin/page.tsx` | Already handles minutes/hours/days; no new utility needed |
| Batch action loading state | Custom fetch + state | `useFormStatus()` in a submit button component | Established pattern; works with server actions out of the box |

**Key insight:** Every building block already exists. This phase is assembly, not invention.

## Common Pitfalls

### Pitfall 1: Checkbox click triggers row expansion
**What goes wrong:** Clicking a checkbox expands the row detail panel because the `<tr onClick>` handler fires.
**Why it happens:** Event bubbles from checkbox `<td>` up to `<tr>`.
**How to avoid:** Add `e.stopPropagation()` on the checkbox `onChange` or the wrapping `<td onClick>`.
**Warning signs:** Row expands when checking the box.

### Pitfall 2: `colSpan` mismatch after adding checkbox column
**What goes wrong:** Expanded detail row stretches only 5 columns while the table now has 6.
**Why it happens:** The existing `<td colSpan={5}>` is hardcoded.
**How to avoid:** Update to `colSpan={6}` when adding the checkbox column.
**Warning signs:** Expanded row appears narrower than table; white gap on right.

### Pitfall 3: Selected IDs persist across tab navigation
**What goes wrong:** Admin switches from Pending to Approved tab and back; checkbox state remains, but candidates list has changed (or is empty on other tabs).
**Why it happens:** `selectedIds` state lives in the component and is not cleared on prop changes.
**How to avoid:** Clear `selectedIds` when `activeStatus` changes, or use `key={activeStatus}` on the component to force a remount.
**Warning signs:** Batch approve button shows "N selected" after tab switch even though no boxes are checked visually.

### Pitfall 4: discovery_runs insert fails silently in error path
**What goes wrong:** The error-path insert itself throws (e.g., DB connectivity), masking the original cron error.
**Why it happens:** Instrumentation is in the catch block, which can itself throw.
**How to avoid:** Wrap the error-path insert in its own try/catch that logs but does not rethrow.
**Warning signs:** Cron endpoint returns 500 with no `discovery_runs` row.

### Pitfall 5: `runDiscoveryJob()` field mapping for discovery_runs
**What goes wrong:** `runDiscoveryJob()` (gemini_google_search) does not return a structured result object — it currently returns `void`. The cron handler has no metrics to insert.
**Why it happens:** Unlike `runPlacesDiscovery()` and `runRedditDiscovery()`, the Gemini orchestrator was written before structured results were needed.
**How to avoid:** Before instrumenting the route, change `runDiscoveryJob()` to return a result object with the same metric fields as the other discoverers.
**Warning signs:** TypeScript error on the cron route when trying to access result fields.

### Pitfall 6: Batch approve with `redirect()` inside server action
**What goes wrong:** `redirect()` throws a special Next.js internal error (`NEXT_REDIRECT`). If it's inside a try/catch, it gets swallowed.
**Why it happens:** Next.js `redirect()` works by throwing.
**How to avoid:** Place `redirect()` after the try/catch block, matching the existing `approveCandidate` pattern.
**Warning signs:** Batch approve completes but page does not redirect; no error shown.

## Code Examples

### Existing promoteSource call (approveCandidate)
```typescript
// Source: src/app/admin/discovery/actions.ts
export async function approveCandidate(formData: FormData): Promise<void> {
  const raw = formData.get('id');
  const id = parseInt(String(raw ?? ''), 10);
  if (isNaN(id)) return;
  try {
    await promoteSource(id);
  } catch (err) {
    console.error('[approveCandidate] promoteSource failed:', err);
  }
  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}
```

### Existing dashboard stat card pattern
```typescript
// Source: src/app/admin/page.tsx
<Link href="/admin/discovery" className="block">
  <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
    <p className="text-sm text-gray-500">Pending Discoveries</p>
    <p className="text-3xl font-bold text-gray-900 mt-1">{pendingDiscoveryCount}</p>
  </div>
</Link>
```

### Existing table pattern (Source Health)
```typescript
// Source: src/app/admin/page.tsx
<table className="w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <tr>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">...</th>
    </tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200">
    {rows.map((row) => (
      <tr key={row.id}>
        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">...</td>
      </tr>
    ))}
  </tbody>
</table>
```

### DiscoveryRunResult fields from places-discoverer
```typescript
// Source: src/lib/scraper/places-discoverer.ts
export interface DiscoveryRunResult {
  citiesSearched: number;
  candidatesFound: number;
  enriched: number;        // maps to skipped_dedup
  stagedPending: number;   // maps to queued_pending
  stagedNoWebsite: number; // informational; no dedicated column needed
  autoApproved: number;    // maps to auto_approved
  errors: number;
}
```

### RedditDiscoveryRunResult fields
```typescript
// Source: src/lib/scraper/reddit-discoverer.ts
export interface RedditDiscoveryRunResult {
  subredditsChecked: number;
  postsScanned: number;
  postsFiltered: number;
  candidatesFound: number; // maps to candidates_found
  staged: number;          // maps to queued_pending
  autoApproved: number;    // maps to auto_approved
  errors: number;
}
// skipped_dedup: Reddit has no dedup step producing a count — use 0
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTML form per action | React server actions with `revalidatePath` | Next.js 14+ | No API route needed; action lives in actions.ts |
| Manual migration SQL | drizzle-kit generate | Phase 22+ | Migration tracked in drizzle/meta/_journal.json |

**No deprecated patterns in use for this phase.**

## Open Questions

1. **`runDiscoveryJob()` return type**
   - What we know: Currently returns `void`. Route handler does `await runDiscoveryJob()` with no result capture.
   - What's unclear: What metrics are available internally (totalInserted, autoApproved are local vars) vs what needs to be surfaced.
   - Recommendation: Change return type to a result object before instrumentation. Fields to expose: `candidatesFound` (= totalInserted), `autoApproved`, `errors` (currently not counted — add a local counter). Queued pending = totalInserted - autoApproved.

2. **"Last Discovery" stat card — success/error indicator logic**
   - What we know: The card shows relative time of most recent run + success/error indicator (Claude's discretion for visual treatment).
   - What's unclear: Definition of "error run" — is it `errors > 0`, or `candidates_found === 0`, or something else?
   - Recommendation: Treat `errors > 0` as error indicator (red text or badge), consistent with how the Source Health table treats `consecutiveFailures >= 3`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing) |
| Config file | jest.config.ts (or package.json — existing) |
| Quick run command | `npm test -- --testPathPattern=discovery-runs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | `batchApproveCandidate` calls `promoteSource` for each valid ID | unit | `npm test -- --testPathPattern=actions` | ❌ Wave 0 |
| ADMIN-01 | `batchApproveCandidate` skips NaN IDs | unit | `npm test -- --testPathPattern=actions` | ❌ Wave 0 |
| ADMIN-01 | checkbox state: toggleRow adds/removes from Set | unit | manual-only (UI component) | N/A |
| ADMIN-01 | toggleAll selects all when none/partial selected | unit | manual-only (UI component) | N/A |
| ADMIN-02 | `runPlacesDiscovery` result fields map correctly to discovery_runs columns | unit | `npm test -- --testPathPattern=places-discoverer` | ✅ (extend existing) |
| ADMIN-02 | cron route inserts discovery_runs row on success | unit | `npm test -- --testPathPattern=discover-places` | ❌ Wave 0 |
| ADMIN-02 | cron route inserts discovery_runs row with errors on failure | unit | `npm test -- --testPathPattern=discover-places` | ❌ Wave 0 |
| ADMIN-03 | dashboard page includes discovery_runs query | manual-only (server component) | manual smoke test | N/A |

**Note:** DiscoveryList checkbox UI and the admin dashboard page.tsx are Next.js server/client components without existing unit tests. These are verified manually (visual inspection + smoke test).

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=actions|discoverer|route`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/admin/discovery/actions.test.ts` — covers ADMIN-01 (batchApproveCandidate unit tests)
- [ ] `src/app/api/cron/discover-places-ns/route.test.ts` (and NB, PEI, NL) — covers ADMIN-02 (discovery_runs insert after cron run). Currently no test file exists for these route handlers.
- [ ] `src/app/api/cron/discover/route.test.ts` — covers ADMIN-02 for gemini_google_search channel (extend existing file if it exists — it does exist, check content)

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/app/admin/discovery/actions.ts` — server action patterns
- Direct code inspection: `src/app/admin/discovery/_components/DiscoveryList.tsx` — component state, table structure, colSpan
- Direct code inspection: `src/app/admin/page.tsx` — stat card and table patterns, Promise.all query structure
- Direct code inspection: `src/lib/scraper/places-discoverer.ts` — DiscoveryRunResult interface, field names
- Direct code inspection: `src/lib/scraper/reddit-discoverer.ts` — RedditDiscoveryRunResult interface
- Direct code inspection: `src/lib/scraper/discovery-orchestrator.ts` — current void return type, internal metric vars
- Direct code inspection: `src/lib/db/schema.ts` — existing table patterns (serial PK, timestamps, nullable columns)
- Direct code inspection: `drizzle/meta/_journal.json` — migration workflow is established (0007 is latest)

### Secondary (MEDIUM confidence)
- Next.js server actions docs (training data, verified against existing usage): `redirect()` throws internally, must be outside try/catch

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns are direct code inspection of existing files
- Architecture: HIGH — direct observation of what exists; patterns are already proven in the codebase
- Pitfalls: HIGH — pitfall 1 (stopPropagation), 2 (colSpan), 3 (tab state) are observable from DiscoveryList.tsx; pitfall 5 (void return) is confirmed from discovery-orchestrator.ts line 54

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable — no external dependencies changing)
