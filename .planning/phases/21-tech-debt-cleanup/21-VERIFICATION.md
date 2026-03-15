---
phase: 21-tech-debt-cleanup
verified: 2026-03-15T00:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 21: Tech Debt Cleanup Verification Report

**Phase Goal:** Close the ATTR-02 integration gap (ticket_link COALESCE), remove orphaned exports, and fix cosmetic eventCount badge — clearing all tech debt from v1.5 audit
**Verified:** 2026-03-15
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A scraper upsert with null ticket_link does not overwrite an existing TM ticket link | VERIFIED | `normalizer.ts:49` — `ticket_link: sql\`COALESCE(${events.ticket_link}, ${extracted.ticket_link ?? null})\`` — DB column is first argument (preserve existing), incoming value is second (apply only when column is NULL) |
| 2 | findBestMatch is not exported from venue-dedup module | VERIFIED | `venue-dedup.ts` ends at line 153 with `scoreVenueCandidate`; no `findBestMatch` function or export present. `grep -r "findBestMatch" src/` returns zero results. |
| 3 | CategoryChipsRow eventCount badge reflects map-wide category count, not bounds-clipped sidebar count | VERIFIED | `page.tsx:179` — `eventCount={mapEvents.length}` (cluster mode / EventFilters); `page.tsx:206` — `eventCount={mapEvents.length}` (timelapse mode / MapClientWrapper). No remaining `eventCount={sidebarEvents.length}` references. |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/scraper/normalizer.ts` | Non-destructive ticket_link COALESCE in upsertEvent onConflictDoUpdate | VERIFIED | Line 49: `ticket_link: sql\`COALESCE(${events.ticket_link}, ${extracted.ticket_link ?? null})\`` — correct argument order (column first, preserves existing TM link) |
| `src/lib/scraper/normalizer.test.ts` | Test asserting ticket_link uses COALESCE (not plain string) | VERIFIED | Lines 256–277: `it('uses COALESCE for ticket_link in onConflictDoUpdate set clause', ...)` — asserts `typeof ticketLinkVal !== 'string'` and `ticketLinkVal` is defined. Schema mock at line 17 includes `ticket_link: 'ticket_link'`. |
| `src/lib/scraper/venue-dedup.ts` | Clean public API with findBestMatch removed | VERIFIED | File is 153 lines; exports only `normalizeVenueName`, `venueNameRatio`, `scoreVenueCandidate`, plus constants and types. `findBestMatch` is absent. |
| `src/app/page.tsx` | Corrected eventCount prop using mapEvents.length | VERIFIED | Both prop sites (lines 179 and 206) use `mapEvents.length`. `sidebarEvents.length` is not used anywhere as an eventCount prop. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/scraper/normalizer.ts` | `events.ticket_link` | COALESCE in onConflictDoUpdate set clause | WIRED | Pattern `COALESCE(${events.ticket_link}, ...)` confirmed at line 49. `events` table reference is the DB column — correct non-destructive semantics. |
| `src/app/page.tsx` | `src/components/map/MapClientWrapper.tsx` | eventCount prop | WIRED | `eventCount={mapEvents.length}` appears at both MapClientWrapper call sites (lines 179 and 206). `mapEvents` is destructured from the `useMemo` block at line 83 — it is the pre-bounds, province+category-filtered event set. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ATTR-02 | 21-01-PLAN.md | On cross-source conflict, ticket link is updated non-destructively if existing event has none | SATISFIED | `normalizer.ts:49` — `COALESCE(${events.ticket_link}, ...)` stores DB column first; incoming null cannot overwrite an existing value. Test at `normalizer.test.ts:256` confirms the set value is a SQL expression object, not a plain string. REQUIREMENTS.md traceability table marks ATTR-02 as Complete / Phase 21. |

No orphaned requirements. REQUIREMENTS.md maps ATTR-02 to Phase 21 and lists it as Complete. No other v1.5 requirement IDs are mapped to Phase 21.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

Scanned `normalizer.ts`, `normalizer.test.ts`, `venue-dedup.ts`, `venue-dedup.test.ts`, and `page.tsx` for TODO/FIXME, placeholder returns, empty handlers, and stub implementations. None found.

---

### Human Verification Required

#### 1. EventCount badge correctness in timelapse mode

**Test:** Open the app in timelapse mode. Note the event count shown in the CategoryChipsRow badge. Pan the map to a different area. Observe whether the badge count changes.
**Expected:** The count should remain stable across map pans (it reflects the province+category-filtered total, not the viewport-clipped count). Switching category/province filter should update it; panning alone should not.
**Why human:** The data flow is correct in code — `mapEvents.length` is pre-bounds — but the visual stability can only be confirmed in a running browser session.

---

### Commit Verification

All three task commits documented in SUMMARY.md were verified against the repository:

| Commit | Message | Verified |
|--------|---------|---------|
| `69a8de5` | feat(21-01): fix ticket_link COALESCE in upsertEvent (ATTR-02) | Present |
| `f2d8ba9` | feat(21-01): remove orphaned findBestMatch export and tests | Present |
| `282d947` | fix(21-01): fix eventCount badge to use map-wide mapEvents count | Present |

---

### Summary

All three tech debt items from the v1.5 audit are closed:

1. **ATTR-02 (ticket_link COALESCE):** `normalizer.ts` line 49 now uses `COALESCE(${events.ticket_link}, ...)` with the correct argument order — the DB column is the first (preferred) argument, so an incoming `null` from the scraper cannot overwrite an existing Ticketmaster link. A matching unit test in `normalizer.test.ts` asserts the set value is a SQL expression object, not a plain string, providing regression coverage.

2. **Orphaned findBestMatch export removed:** `venue-dedup.ts` no longer exports `findBestMatch`. The file's public surface is now `normalizeVenueName`, `venueNameRatio`, `scoreVenueCandidate`, and associated types/constants. `venue-dedup.test.ts` imports only the legitimate exports. A codebase-wide grep returns zero results for `findBestMatch`.

3. **eventCount badge corrected:** Both EventFilters (cluster mode, line 179) and MapClientWrapper (timelapse mode, line 206) in `page.tsx` receive `eventCount={mapEvents.length}`, which is the pre-bounds province+category-filtered count. The stale `sidebarEvents.length` (bounds-clipped) has been fully replaced.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
