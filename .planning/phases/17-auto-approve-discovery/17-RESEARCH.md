# Phase 17: Auto-Approve Discovery - Research

**Researched:** 2026-03-15
**Domain:** Venue discovery pipeline — heuristic scoring + automated promotion
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-05 | High-confidence discovered sources are auto-approved using multiple signals (LLM confidence + test extraction + future events) | `scoreCandidate()` function in `discovery-orchestrator.ts` scores candidates 0.0–1.0; threshold 0.8 triggers `promoteSource()` automatically |
| DISC-06 | Auto-approved sources are visible in admin UI and can be revoked | `discovery_score` column surfaced in `/admin/discovery`; "auto-approved" label on approved tab; revoke action sets `discovered_sources.status = 'pending'` and `scrape_sources.enabled = false` |
</phase_requirements>

---

## Summary

Phase 17 closes the admin review bottleneck for high-confidence discovered venue sources. After the discovery job runs, a scoring pass evaluates each new candidate using a deterministic heuristic. Candidates scoring 0.8 or higher are promoted immediately via the existing `promoteSource()` function — no new promotion logic is needed. Candidates below the threshold remain `pending` in the admin review queue.

The admin discovery UI gains two capabilities: a `discovery_score` column visible in all tabs (so admins understand why candidates were or were not auto-approved), and a "Revoke" action on the approved tab that returns an auto-approved source to a manageable state. "Revoke" means: mark the `discovered_sources` row back to `pending` and disable the corresponding `scrape_sources` row (`enabled = false`).

The entire phase touches three surfaces: `discovery-orchestrator.ts` (scoring + auto-promote pass), `schema.ts` + a new Drizzle migration (`discovery_score` column on `discovered_sources`), and the `/admin/discovery` UI (score display + revoke action).

**Primary recommendation:** Add `scoreCandidate()` and the auto-promote loop to `discovery-orchestrator.ts` immediately after the existing insert loop. Reuse `promoteSource()` unchanged. Add revoke as a new server action in `discovery/actions.ts` that disables the scrape source and resets the discovered source status.

---

## Standard Stack

### Core (all existing — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.39.x | Schema column addition + DB updates | Already in use; additive migration only |
| Next.js Server Actions | 16.x | `revokeCandidate` server action | Existing pattern in `actions.ts` |
| Zod | (existing) | No new schema needed | Scoring is pure TS arithmetic |

**New dependency for Phase 17:** None.

### Installation

No new packages required.

---

## Architecture Patterns

### Recommended File Changes

```
src/
├── lib/
│   ├── db/
│   │   └── schema.ts                   # Add discovery_score column
│   └── scraper/
│       ├── discovery-orchestrator.ts   # Add scoreCandidate() + auto-promote loop
│       └── discovery-orchestrator.test.ts  # Add tests for scoring + auto-promote
└── app/
    └── admin/
        └── discovery/
            ├── actions.ts              # Add revokeCandidate() server action
            └── _components/
                └── DiscoveryList.tsx   # Show discovery_score, add revoke button
drizzle/
└── 0004_*.sql                          # discovery_score column migration
```

### Pattern 1: scoreCandidate() Heuristic

**What:** Pure function, no I/O, scores a discovery candidate 0.0–1.0 based on structural signals.
**When to use:** Called once per inserted candidate immediately after the insert loop in `runDiscoveryJob()`.

The heuristic from ARCHITECTURE.md is the confirmed design (HIGH confidence — defined by the project architect):

```typescript
// Source: .planning/research/ARCHITECTURE.md
function scoreCandidate(candidate: {
  url: string;
  city: string | null;
  province: string | null;
  source_name: string | null;
}): number {
  let score = 0.5; // base

  if (candidate.city)         score += 0.15;
  if (candidate.province)     score += 0.15;
  if (candidate.source_name)  score += 0.10;

  // URL quality signal
  if (candidate.url.startsWith('https://')) score += 0.05;

  // Penalize: event/ticket page paths are likely not venue home pages
  if (/\/events\/|\/tickets\/|\/shows\//i.test(candidate.url)) score -= 0.20;

  // Penalize: social/aggregator hostnames that slipped through
  if (/facebook\.com|instagram\.com|eventbrite\.com/i.test(candidate.url)) score -= 0.50;

  return Math.max(0, Math.min(score, 1.0));
}
```

**Scoring outcome for a complete, well-formed candidate:**
- base (0.5) + city (0.15) + province (0.15) + source_name (0.10) + https (0.05) = **0.95**
- If URL has `/events/` path: 0.95 - 0.20 = **0.75** (stays pending — correct)
- If missing city: 0.95 - 0.15 = **0.80** (exactly threshold — auto-approves)

This means: any candidate with province + source_name + https URL (but no city) sits exactly at the 0.8 threshold. Candidates lacking province will score 0.70 and stay pending. This calibration is intentional.

### Pattern 2: Auto-Promote Loop in runDiscoveryJob()

**What:** After the existing insert loop, a second pass scores each inserted candidate and calls `promoteSource()` for those above threshold.

```typescript
// Source: .planning/research/ARCHITECTURE.md
const AUTO_APPROVE_THRESHOLD = parseFloat(
  process.env.AUTO_APPROVE_THRESHOLD ?? '0.8'
);

for (const candidate of insertedCandidates) {
  const score = scoreCandidate(candidate);

  // Write score regardless of threshold
  await db.update(discovered_sources)
    .set({ discovery_score: score })
    .where(eq(discovered_sources.url, candidate.url));

  if (score >= AUTO_APPROVE_THRESHOLD) {
    const staged = await db.query.discovered_sources.findFirst({
      where: eq(discovered_sources.url, candidate.url),
    });
    if (staged?.status === 'pending') {
      await promoteSource(staged.id);
      console.log(`Auto-approved: ${candidate.url} (score: ${score.toFixed(2)})`);
    }
  }
}
```

**Implementation detail:** The current `runDiscoveryJob()` inserts candidates via `db.insert(...).onConflictDoNothing()` but does not return the inserted rows or collect them in an array. The loop must be adapted to either:
1. Collect candidates into an `insertedCandidates` array as they are inserted (preferred — no extra DB reads for dedup), OR
2. After the city loop completes, query `discovered_sources` for rows with `discovery_score IS NULL` (simpler but adds a query)

Option 1 is preferred: accumulate candidates that pass the hostname dedup check into `insertedCandidates: Array<{url, city, province, source_name}>` before the insert, then run the scoring loop after the city loop completes.

### Pattern 3: Schema Addition

**What:** One new column on `discovered_sources`. Drizzle migration generated via `npm run db:generate`.

```typescript
// schema.ts addition — discovered_sources table
discovery_score: doublePrecision('discovery_score'),
// nullable — null means "not yet scored" (pre-Phase 17 rows)
```

**Current schema state:** The `discovered_sources` table does NOT have `discovery_score`. Confirmed by direct inspection of `schema.ts` (lines 89–102) and all four migration files (0000–0003). This column must be added in Phase 17.

**Migration command:**
```bash
npm run db:generate  # generates drizzle/0004_*.sql
npm run db:migrate   # applies to Neon Postgres
```

### Pattern 4: Revoke Action

**What:** Server action that "undoes" an auto-approval, leaving the source in a manageable disabled state.

**Revoke semantics** (per DISC-06 success criteria: "returning it to a reviewable state or disabling it"):
1. Set `discovered_sources.status = 'pending'` (returns to review queue) and `discovered_sources.reviewed_at = null`
2. Find the corresponding `scrape_sources` row by URL and set `enabled = false` (disables scraping without deleting)
3. Do NOT delete the venue or scrape_source row — non-destructive operation

```typescript
// src/app/admin/discovery/actions.ts — new server action
export async function revokeCandidate(formData: FormData): Promise<void> {
  const raw = formData.get('id');
  const id = parseInt(String(raw ?? ''), 10);
  if (isNaN(id)) return;

  const staged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.id, id),
  });
  if (!staged || staged.status !== 'approved') return;

  // Disable corresponding scrape source
  await db.update(scrape_sources)
    .set({ enabled: false })
    .where(eq(scrape_sources.url, staged.url));

  // Return to pending state
  await db.update(discovered_sources)
    .set({
      status: 'pending',
      reviewed_at: null,
      added_to_sources_at: null,
    })
    .where(eq(discovered_sources.id, id));

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}
```

### Pattern 5: Admin UI Changes

**What:** Two changes to `DiscoveryList.tsx` and the server component `page.tsx`.

**Change 1 — discovery_score column in table:** Add a "Score" column to the table header and each row. Display as a number formatted to 2 decimal places (e.g., "0.85") or "—" if null. Visible in all tabs (pending, approved, rejected).

**Change 2 — "auto-approved" label on approved tab:** When `status === 'approved'` and `discovery_score !== null`, display an "Auto-approved" badge alongside the green "Approved" badge. This satisfies DISC-06 requirement that auto-approved sources are identifiable.

**Change 3 — Revoke button on approved tab:** In the expanded row detail for `status === 'approved'` items, show a "Revoke" button that submits to `revokeCandidate`. Mirror the pattern of the existing Approve form.

**`DiscoveryList` interface change:** The `candidates` array type must include `discovery_score: number | null`. The `page.tsx` query already uses `db.select()` from `discovered_sources` which will automatically include the new column once schema and migration are applied.

### Anti-Patterns to Avoid

- **Running the scoring loop BEFORE inserting:** Score writes go to `discovered_sources`, which must exist first. Always insert → then score.
- **Calling promoteSource() on a non-pending row:** `promoteSource()` throws if `status !== 'pending'`. The check `if (staged?.status === 'pending')` is mandatory.
- **Deleting venue/scrape_source on revoke:** Revoke is non-destructive — disable only, no deletes. The venue may have legitimately scraped events already.
- **Hard-coding AUTO_APPROVE_THRESHOLD at 0.8 without env var:** Make it configurable via `process.env.AUTO_APPROVE_THRESHOLD` (default `'0.8'`) so the threshold can be tuned after first deployment without a code change.
- **Scoring previously-existing rows:** Only score newly-inserted candidates in the current run. Do not retroactively score pre-Phase 17 rows — they remain `discovery_score = null` until a future discovery run re-encounters them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source promotion | Custom venue + scrape_source creation | `promoteSource()` | Already handles all steps: create venue, insert scrape_source, update status |
| URL normalization | Custom hostname extractor | `new URL(candidate.url).hostname` | Already used in discovery-orchestrator.ts at line 87; handles edge cases |
| Admin action pattern | Custom API route | Next.js Server Action (`'use server'`) | Established pattern in `discovery/actions.ts` and `venues/actions.ts` |
| Score persistence | In-memory only | Drizzle update to `discovered_sources` | Score must survive across sessions for admin visibility |

---

## Common Pitfalls

### Pitfall 1: Threshold Too Low Floods the Scrape Pipeline
**What goes wrong:** Setting `AUTO_APPROVE_THRESHOLD` to 0.5 promotes aggregator pages, social profiles, and irrelevant sites. They fail scraping, increment `consecutive_failures`, and waste Gemini quota.
**Why it happens:** Developers want to maximize discovery yield and lower the threshold.
**How to avoid:** Keep threshold at 0.8 (default). With the scoring heuristic, any candidate missing province OR city will score at most 0.75 — staying in pending. Review auto-approve rate after first run; target 10–30% of candidates.
**Warning signs:** `consecutive_failures` spiking on newly-added sources within 1–2 days of a discovery run.

### Pitfall 2: promoteSource() Called on Already-Approved Row
**What goes wrong:** If `onConflictDoNothing()` silently skips an existing candidate but the scoring loop doesn't check current status, calling `promoteSource()` on a row where `status = 'approved'` throws: "Discovered source X is not pending."
**Why it happens:** The insert conflict means the row already exists (and was previously approved). The scoring loop then tries to promote again.
**How to avoid:** Always check `if (staged?.status === 'pending')` before calling `promoteSource()`. The guard is in the reference implementation and must not be removed.

### Pitfall 3: discovery_score Column Not in DiscoveryList Props
**What goes wrong:** `DiscoveryList.tsx` has a typed `candidates` array interface that does not include `discovery_score`. TypeScript silently strips the field or throws a type error.
**Why it happens:** The interface is defined inline in the component (line 9–23 of DiscoveryList.tsx) and doesn't auto-update when the DB schema changes.
**How to avoid:** Update the `DiscoveryList` props interface to add `discovery_score: number | null` alongside the other candidate fields. Update the table rendering to display it.

### Pitfall 4: Revoke Leaves Orphan Enabled Scrape Source
**What goes wrong:** Revoke only updates `discovered_sources.status` but forgets to disable the `scrape_sources` row. The venue keeps scraping even though it's been revoked.
**Why it happens:** Two-table update; developers implement the first update and stop.
**How to avoid:** `revokeCandidate` must update BOTH tables in sequence: disable `scrape_sources` first (find by URL match), then reset `discovered_sources`. Test: after revoking, confirm `scrape_sources.enabled = false` in DB.

### Pitfall 5: Drizzle pgEnum Export Bug
**What goes wrong:** If any new `pgEnum` is added without being exported, the migration SQL silently omits it.
**Why it happens:** Confirmed open Drizzle bug #5174.
**How to avoid:** Phase 17 adds no new enums (only a `doublePrecision` column), so this bug does not apply here. However, if the `status` field is ever converted to a pgEnum in the future, remember to export it.

---

## Code Examples

### Complete scoreCandidate() with test extraction signals

The ARCHITECTURE.md heuristic scores on metadata signals only (city, province, source_name, URL structure). DISC-05 mentions "LLM confidence + test extraction + future events" as additional signals. The architecture decision treats test extraction as out of scope for v1.4 (too slow to do per candidate in the discovery job) and "future events" as a post-promotion scrape signal. The heuristic-only approach (HIGH confidence per prior research) is the correct Phase 17 implementation.

```typescript
// Source: .planning/research/ARCHITECTURE.md — confirmed design
export function scoreCandidate(candidate: {
  url: string;
  city: string | null;
  province: string | null;
  source_name: string | null;
}): number {
  let score = 0.5;

  if (candidate.city)         score += 0.15;
  if (candidate.province)     score += 0.15;
  if (candidate.source_name)  score += 0.10;
  if (candidate.url.startsWith('https://')) score += 0.05;

  if (/\/events\/|\/tickets\/|\/shows\//i.test(candidate.url)) score -= 0.20;
  if (/facebook\.com|instagram\.com|eventbrite\.com/i.test(candidate.url)) score -= 0.50;

  return Math.max(0, Math.min(score, 1.0));
}
```

### discovery_score schema column

```typescript
// src/lib/db/schema.ts — discovered_sources table addition
discovery_score: doublePrecision('discovery_score'),
// No default, nullable — null = not yet scored
```

### Drizzle migration (generated, reference only)

```sql
-- drizzle/0004_*.sql (generated by npm run db:generate)
ALTER TABLE "discovered_sources" ADD COLUMN "discovery_score" double precision;
```

### revokeCandidate server action

```typescript
// src/app/admin/discovery/actions.ts
'use server';
export async function revokeCandidate(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  const staged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.id, id),
  });
  if (!staged || staged.status !== 'approved') return;

  // Disable scrape source first (non-destructive)
  await db.update(scrape_sources)
    .set({ enabled: false })
    .where(eq(scrape_sources.url, staged.url));

  // Reset discovery record to pending
  await db.update(discovered_sources)
    .set({ status: 'pending', reviewed_at: null, added_to_sources_at: null })
    .where(eq(discovered_sources.id, id));

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All discovered sources require admin review | High-confidence candidates (score >= 0.8) auto-promoted | Phase 17 | Admin queue reduced; only ambiguous candidates need review |
| `discovered_sources` has no score column | `discovery_score` persisted per candidate | Phase 17 | Score visible in admin UI; calibration data accumulates |
| No revoke mechanism | `revokeCandidate` resets status + disables source | Phase 17 | Admin can undo any auto-approval without data loss |

**Prerequisite state confirmed:**
- `discovered_sources` table exists with `status`, `url`, `domain`, `city`, `province`, `source_name` columns (verified schema.ts line 89–102)
- `discovery_score` column does NOT yet exist — must be added in this phase
- `promoteSource()` function is complete and tested (promote-source.ts, promote-source.test.ts)
- `/admin/discovery` UI with approve/reject already built (DiscoveryList.tsx, actions.ts)
- All prior migrations (0000–0003) cover scrape_sources columns; no discovered_sources columns were added

---

## Open Questions

1. **Should `AUTO_APPROVE_THRESHOLD` be an env var or hard-coded?**
   - What we know: Hard-coding at 0.8 is simpler; env var allows runtime tuning without redeploy
   - Recommendation: Use `parseFloat(process.env.AUTO_APPROVE_THRESHOLD ?? '0.8')` — small cost, real operational value for post-deployment calibration

2. **Should the scoring loop run for ALL candidates each discovery run, or only newly-inserted ones?**
   - What we know: `onConflictDoNothing()` means existing URLs are silently skipped — only new insertions are truly "new"
   - Recommendation: Collect newly-accepted candidates into an array during the insert loop; only score those. Do not retroactively score pre-Phase 17 rows.

3. **Should revoke show a confirmation dialog or submit directly?**
   - What we know: Reject has an inline form with cancel/confirm (RejectForm pattern). Revoke is similarly destructive.
   - Recommendation: Mirror the RejectForm pattern — show a confirm button before submitting, with a cancel option. One-click revoke is too easy to trigger accidentally.

4. **Auto-approve rate after first run — calibration needed?**
   - What we know: 0.8 threshold is a starting recommendation; target 10–30% of candidates auto-promoted
   - Recommendation: Log auto-approve count per discovery run. After first live run, check: if >40% auto-approved, raise threshold or add URL signal. If <5%, lower threshold slightly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `jest.config.ts` (root) |
| Quick run command | `jest src/lib/scraper/discovery-orchestrator.test.ts --no-coverage` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-05 | `scoreCandidate()` returns correct score for complete candidate | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `scoreCandidate()` penalizes `/events/` URL path correctly | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `scoreCandidate()` penalizes social domain hostnames | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `scoreCandidate()` clamps output to [0.0, 1.0] | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `runDiscoveryJob()` calls `promoteSource()` when score >= 0.8 | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `runDiscoveryJob()` skips `promoteSource()` when score < 0.8 | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-05 | `runDiscoveryJob()` writes `discovery_score` for all inserted candidates | unit | `jest discovery-orchestrator.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-06 | `revokeCandidate` disables `scrape_sources.enabled` | unit | `jest discovery/actions.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-06 | `revokeCandidate` resets `discovered_sources.status` to pending | unit | `jest discovery/actions.test.ts --no-coverage` | ❌ Wave 0 |
| DISC-06 | Admin UI displays `discovery_score` column | manual | Visual check at `/admin/discovery` | N/A |
| DISC-06 | "Auto-approved" badge visible for auto-approved sources | manual | Visual check at `/admin/discovery?status=approved` | N/A |
| DISC-06 | Revoke button visible on approved tab expanded row | manual | Visual check at `/admin/discovery?status=approved` | N/A |

### Sampling Rate
- **Per task commit:** `jest src/lib/scraper/discovery-orchestrator.test.ts --no-coverage`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New `scoreCandidate` and auto-promote tests in `src/lib/scraper/discovery-orchestrator.test.ts` — covers DISC-05 (file exists, new `describe('scoreCandidate')` block needed)
- [ ] New `src/app/admin/discovery/actions.test.ts` — covers DISC-06 `revokeCandidate` (file does not exist)

---

## Sources

### Primary (HIGH confidence)

- East Coast Local codebase direct inspection — `src/lib/scraper/discovery-orchestrator.ts`, `src/lib/scraper/promote-source.ts`, `src/lib/db/schema.ts`, `src/app/admin/discovery/` (2026-03-15)
- `.planning/research/ARCHITECTURE.md` — Section 7: Auto-Approve High-Confidence Discovered Sources (verified design, 2026-03-15)
- `.planning/research/SUMMARY.md` — Phase D rationale and confidence assessment
- Drizzle migration files `0000`–`0003` — confirmed `discovery_score` not yet added to any migration

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` — "Auto-approve threshold at 0.8" flagged as MEDIUM confidence (no canonical benchmark); starting recommendation for this use case

### Tertiary (LOW confidence / needs runtime validation)

- Auto-approve rate target of 10–30% — inferred from scoring heuristic arithmetic, not validated against real discovery run data. Calibrate after first deployment.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns established in codebase
- Architecture (scoring): HIGH — design specified in ARCHITECTURE.md, verified against live code
- Architecture (revoke): HIGH — mirrors existing disable pattern from `venues/actions.ts`
- Schema: HIGH — `discovery_score` absence confirmed by direct schema.ts and migration inspection
- Pitfalls: HIGH — derived from direct code inspection + established project pitfall research
- Threshold calibration: MEDIUM — 0.8 is a reasoned starting point; runtime data needed to confirm

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain — threshold calibration may need revision after first discovery run)
