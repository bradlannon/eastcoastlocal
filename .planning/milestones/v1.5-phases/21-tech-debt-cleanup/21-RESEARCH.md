# Phase 21: Tech Debt Cleanup - Research

**Researched:** 2026-03-15
**Domain:** TypeScript/Drizzle ORM upsert COALESCE, dead-code removal, React prop data flow
**Confidence:** HIGH

## Summary

Phase 21 closes three discrete gaps identified in the v1.5 audit. Each gap is self-contained with a clear before/after state — no new libraries, no schema migrations, no new API routes needed.

**Gap 1 (ATTR-02):** `normalizer.ts` upsertEvent already applies `COALESCE` for `source_url` in the `onConflictDoUpdate` set clause (line 46), but `ticket_link` uses direct assignment (line 49), meaning a scraper upsert with `null` ticket_link will overwrite an existing TM link. The fix is a one-line change: replace `ticket_link: extracted.ticket_link ?? null` with `ticket_link: sql\`COALESCE(${events.ticket_link}, ${extracted.ticket_link ?? null})\``.

**Gap 2 (orphaned export):** `venue-dedup.ts` exports `findBestMatch` but `ticketmaster.ts` never imports it — the TM ingest loop calls `scoreVenueCandidate` per-candidate directly (by design, to retain `candidate.id` for audit log insertion). `findBestMatch` is imported and tested only in `venue-dedup.test.ts`. Removing the export (or the entire function + its tests) cleans the public surface. The test file must also be updated to not import `findBestMatch`.

**Gap 3 (eventCount badge):** In `page.tsx`, `eventCount={sidebarEvents.length}` is passed to `MapClientWrapper` (line 206). `sidebarEvents` is the bounds-clipped list — it changes as the user pans the map. The CategoryChipsRow badge should reflect the map-wide category count before bounds clipping. The correct value is `timeFilteredEvents.length` in timelapse mode (already computed in the `useMemo` block as `categoryFiltered` before the `filterByBounds` call).

**Primary recommendation:** Three single-file surgical changes — one in `normalizer.ts` (COALESCE fix), one in `venue-dedup.ts` + its test (export removal), and one in `page.tsx` (prop source correction). Plan as a single plan with three tasks; no schema migration needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ATTR-02 | On cross-source conflict, ticket link is updated non-destructively if existing event has none | Gap confirmed in normalizer.ts line 49: ticket_link uses direct assignment, not COALESCE. Fix mirrors the existing source_url COALESCE pattern at line 46 of same file. |
</phase_requirements>

---

## Standard Stack

### Core (already present — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm `sql` tag | already installed | Raw SQL fragments in typed upsert set clauses | Used by the existing `source_url` COALESCE at normalizer.ts:46 |
| Jest + ts-jest | already installed | Unit test runner | `jest.config.ts` at repo root, `testMatch: ['**/*.test.ts']` |

**Installation:** None required.

---

## Architecture Patterns

### Pattern 1: COALESCE in Drizzle onConflictDoUpdate

**What:** Use the `sql` template tag from drizzle-orm to produce a `COALESCE(column, value)` expression in the `set` object of `onConflictDoUpdate`.

**When to use:** Any column that should "keep existing value if set, apply new value only if currently null."

**Current working example (source_url, normalizer.ts line 46):**
```typescript
// Source: src/lib/scraper/normalizer.ts (already in production)
source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
```

**Fix to apply for ticket_link:**
```typescript
// Replace line 49 in normalizer.ts
// BEFORE (destructive — overwrites existing TM link with null):
ticket_link: extracted.ticket_link ?? null,

// AFTER (non-destructive — keeps existing if incoming is null):
ticket_link: sql`COALESCE(${events.ticket_link}, ${extracted.ticket_link ?? null})`,
```

The `sql` import is already present at normalizer.ts line 3: `import { sql } from 'drizzle-orm';`

### Pattern 2: Removing an orphaned export + its tests

**What:** Delete `findBestMatch` from `venue-dedup.ts` and remove the corresponding `describe('findBestMatch')` block from `venue-dedup.test.ts`.

**Why it is safe:** `ticketmaster.ts` imports only `scoreVenueCandidate` and `venueNameRatio` from `venue-dedup`. A codebase-wide grep confirms `findBestMatch` is only referenced in `venue-dedup.ts` and `venue-dedup.test.ts`. Removing it does not break any runtime path.

**Steps:**
1. Delete lines 154–190 from `venue-dedup.ts` (the `findBestMatch` function and its comment block).
2. Remove `findBestMatch` from the named import on `venue-dedup.test.ts` line 5.
3. Delete lines 183–242 from `venue-dedup.test.ts` (the `describe('findBestMatch')` block).

### Pattern 3: Correcting the eventCount prop source

**What:** In `page.tsx`, pass a map-wide count (not the bounds-clipped sidebar count) to `MapClientWrapper` for the `CategoryChipsRow` badge.

**Current (incorrect):**
```typescript
// page.tsx line 206
eventCount={sidebarEvents.length}
```

`sidebarEvents` = `filterByBounds(categoryFiltered, bounds)` — changes on every map pan.

**Correct value:** In timelapse mode, `timeFilteredEvents` is `categoryFiltered` (province + category filtered, not bounds-clipped). This is the map-wide count. In cluster mode the `eventCount` prop is still passed but `CategoryChipsRow` is only rendered in timelapse mode — so we only need to fix what timelapse mode sees.

**The cleanest fix:** Pass `timeFilteredEvents.length` as `eventCount` to `MapClientWrapper`. In cluster mode `timeFilteredEvents` is `[]` (see page.tsx lines 101–103), so the badge would show 0 — but `CategoryChipsRow` is hidden in cluster mode, so this is harmless. Alternatively, pass `mapEvents.length` which is the category/province filtered set in both modes (pre-bounds).

**Recommended: use `mapEvents.length`** because `mapEvents` is available in both modes and equals the category-filtered, pre-bounds event set. It correctly reflects the map-wide category count regardless of current viewport.

```typescript
// page.tsx — change line 206
// BEFORE:
eventCount={sidebarEvents.length}
// AFTER:
eventCount={mapEvents.length}
```

`mapEvents` is already destructured from the same `useMemo` block at line 83.

### Anti-Patterns to Avoid

- **Don't add a new prop to CategoryChipsRow** to accept a separate "total" vs "visible" count. The issue is upstream — the wrong value is passed in.
- **Don't use `allEvents.length`** for the badge — that ignores active category/province filters entirely, making the badge misleading.
- **Don't COALESCE both sides symmetrically** (`COALESCE(incoming, existing)`) — the intent is "keep existing if set," so the column reference must be first: `COALESCE(${events.ticket_link}, ${incoming_value})`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Non-destructive upsert column | Custom SELECT + conditional UPDATE | Drizzle `sql\`COALESCE(...)\`` in `onConflictDoUpdate.set` | Already established pattern; single round-trip; atomic |

---

## Common Pitfalls

### Pitfall 1: COALESCE argument order reversed
**What goes wrong:** Writing `COALESCE(${incoming_value}, ${events.ticket_link})` — this overwrites the existing DB value with the incoming value if incoming is non-null, which is the original destructive behavior.
**How to avoid:** Always put the column reference first: `COALESCE(${events.ticket_link}, ${incoming_value})`. Match the pattern at normalizer.ts line 46.

### Pitfall 2: Forgetting to update the test import after removing findBestMatch
**What goes wrong:** `venue-dedup.test.ts` line 5 still imports `findBestMatch` — TypeScript compile error, tests fail.
**How to avoid:** Remove `findBestMatch` from the import destructure on the same pass as deleting the function. Jest will immediately surface this if missed.

### Pitfall 3: Using timeFilteredEvents (empty in cluster mode) as eventCount
**What goes wrong:** In cluster mode, `timeFilteredEvents = []` so badge shows 0 if switched from timelapse to cluster while CategoryChipsRow were visible. Not a current bug (chips are hidden in cluster mode) but fragile.
**How to avoid:** Use `mapEvents.length` which is the correct pre-bounds count in both modes.

### Pitfall 4: The normalizer.ts test doesn't cover ticket_link COALESCE
**What goes wrong:** The existing `upsertEvent` test at normalizer.test.ts:233 checks that `source_url` is a non-string (COALESCE object), but there is no equivalent test for `ticket_link`. After fixing the code, add a matching test.
**How to avoid:** Add a test asserting `conflictArgs.set.ticket_link` is not a string (same pattern as the source_url test on line 251).

---

## Code Examples

### COALESCE upsert set (verified — existing pattern in normalizer.ts)
```typescript
// Source: src/lib/scraper/normalizer.ts:46 (production code)
source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
```

### Finding all callers of findBestMatch (run before deleting)
```bash
# Confirms only venue-dedup.ts and venue-dedup.test.ts reference it
grep -r "findBestMatch" src/
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `jest.config.ts` (repo root) |
| Quick run command | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATTR-02 | ticket_link COALESCE in upsertEvent onConflict set | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ✅ (test must be added to existing file) |
| (Gap 2) | findBestMatch removed from venue-dedup exports | unit | `npx jest src/lib/scraper/venue-dedup.test.ts --no-coverage` | ✅ (test block to be deleted, import to be updated) |
| (Gap 3) | eventCount badge uses map-wide count | manual-only | Visual inspection in timelapse mode: badge count must not change on pan | N/A |

### Sampling Rate
- **Per task commit:** `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/venue-dedup.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add ticket_link COALESCE test to `src/lib/scraper/normalizer.test.ts` — covers ATTR-02 (mirrors the existing `source_url` COALESCE test at line 233)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct assignment in upsert set | COALESCE for non-destructive merge | Phase 19 (source_url) | ticket_link was missed in the same pass |

**Deprecated/outdated:**
- `ticket_link: extracted.ticket_link ?? null` in `onConflictDoUpdate.set`: Destructive. Replace with COALESCE.
- `findBestMatch` export in venue-dedup.ts: Never used outside tests. Remove to reduce public surface confusion.

---

## Open Questions

1. **Should findBestMatch tests also be deleted, or just marked skip?**
   - What we know: The function will be deleted, so tests testing it directly will error.
   - What's unclear: Whether there is value in keeping the tests as documentation of the intended behavior.
   - Recommendation: Delete the tests. The function itself is gone; the behavior it described (multi-candidate priority) is now implicit in `ticketmaster.ts`'s loop. Keeping failing/skipped tests adds noise.

2. **TimelineBar also receives `eventCount` — should it change too?**
   - What we know: TimelineBar at `MapClient.tsx:131` also receives `eventCount ?? 0`. TimelineBar uses it as a cosmetic "X events" display (same as CategoryChipsRow).
   - What's unclear: Whether it should also be map-wide or bounds-clipped.
   - Recommendation: Fix both from the same `mapEvents.length` change at the call site in `page.tsx`. Single prop, both consumers get the corrected value.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/lib/scraper/normalizer.ts` — confirmed ticket_link gap at line 49
- Direct code inspection: `src/lib/scraper/venue-dedup.ts` — confirmed findBestMatch export at line 167
- Direct code inspection: `src/lib/scraper/ticketmaster.ts` — confirmed findBestMatch is NOT imported
- Direct code inspection: `src/app/page.tsx` — confirmed eventCount={sidebarEvents.length} at line 206
- Direct code inspection: `src/components/map/MapClient.tsx` — confirmed CategoryChipsRow receives eventCount prop at line 126
- Grep output: findBestMatch only referenced in venue-dedup.ts and venue-dedup.test.ts

### Secondary (MEDIUM confidence)
- None required — all findings derived from direct code inspection.

---

## Metadata

**Confidence breakdown:**
- ATTR-02 COALESCE fix: HIGH — gap confirmed by direct code diff; fix pattern is identical to existing source_url COALESCE
- findBestMatch removal: HIGH — grep confirms zero runtime callers; test-only reference is expected to be deleted
- eventCount badge fix: HIGH — data flow traced from useMemo through prop chain; mapEvents.length is the correct pre-bounds value

**Research date:** 2026-03-15
**Valid until:** N/A — this is internal code, not an external library; findings are stable until codebase changes
