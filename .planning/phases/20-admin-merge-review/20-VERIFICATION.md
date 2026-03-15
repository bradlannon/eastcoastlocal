---
phase: 20-admin-merge-review
verified: 2026-03-15T21:30:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Navigate to /admin and confirm Merge Review appears in the nav"
    expected: "Nav bar shows a 'Merge Review' link; if any pending candidates exist, an orange count badge appears beside it"
    why_human: "NavLinks renders dynamically via usePathname — badge display depends on live pending count from DB"
  - test: "Click Merge Review link, verify page loads with Pending tab active"
    expected: "Either side-by-side venue card pairs OR the empty-state message is shown; tab bar shows Pending / Merged / Kept Separate with counts"
    why_human: "Page content depends on whether venue_merge_candidates rows exist in the live DB"
  - test: "Inline merge confirmation flow"
    expected: "Clicking 'Merge' changes button to 'Confirm merge?' (red) + 'Cancel'. Clicking Cancel reverts to 'Merge'."
    why_human: "Client-side useState(confirmingId) toggle — requires browser interaction"
  - test: "Keep Separate action"
    expected: "Clicking 'Keep Separate' removes the pair from Pending tab and it appears under Kept Separate tab with reviewed_at date"
    why_human: "Requires live DB + server action round-trip to verify status update and redirect"
  - test: "Merge action end-to-end"
    expected: "Confirm merge removes pair from Pending, duplicate venue deleted, events reassigned to canonical, audit row in venue_merge_log"
    why_human: "Requires live DB with a merge candidate to exercise the full performVenueMerge path"
---

# Phase 20: Admin Merge Review — Verification Report

**Phase Goal:** Admin can inspect and resolve borderline venue merge candidates that Phase 18 logged but did not auto-merge, preventing permanent data gaps from under-merging
**Verified:** 2026-03-15T21:30:00Z
**Status:** human_needed (all automated checks pass)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | performVenueMerge reassigns events to canonical venue, deletes conflicts, writes audit log, updates candidate status | VERIFIED | `src/lib/db/merge-venue.ts` lines 52–108; all 5 steps present and exercised by 7 passing unit tests |
| 2 | Event_sources rows for deleted events are cleaned up before event deletion (FK RESTRICT) | VERIFIED | `merge-venue.ts` lines 71–77: `delete(event_sources)` before `delete(events)` in the unique-conflict catch block; Test 3 verifies ordering |
| 3 | keepSeparate server action marks candidate as kept_separate with reviewed_at timestamp | VERIFIED | `actions.ts` lines 85–100: sets `{ status: 'kept_separate', reviewed_at: new Date() }` |
| 4 | Ticketmaster pipeline does not re-insert candidates for pairs already resolved (any status, either order) | VERIFIED | `ticketmaster.ts` lines 184–204: raw select checks both `(a,b)` and `(b,a)` orderings; inserts only if `existing.length === 0` |
| 5 | Admin can see a list of near-match venue pairs with all metadata side by side | VERIFIED | `MergeReviewList.tsx`: `VenueCard` shows name, city, province, lat/lng, event_count, source_count; center panel shows name_score %, distance, reason label |
| 6 | Admin can merge a pair with inline confirmation (button changes to Confirm merge? / Cancel) | VERIFIED | `MergeReviewList.tsx` lines 106, 170–207: `useState(confirmingId)` toggles between Merge button and Confirm/Cancel pair; `ConfirmMergeButton` uses `useFormStatus` |
| 7 | Admin can mark a pair as keep separate with single click | VERIFIED | `MergeReviewList.tsx` lines 179–186: form with `action={keepSeparate}` and hidden `candidateId`; no confirmation step |
| 8 | Admin can filter by Pending / Merged / Kept Separate tabs | VERIFIED | `MergeReviewList.tsx` lines 15–129: tab bar links to `?status=pending|merged|kept_separate`; `page.tsx` validates status and passes to Drizzle `.where()` |
| 9 | Pending count badge shows on admin nav Merge Review link | VERIFIED | `layout.tsx` fetches pending count from DB; passes to `NavLinks`; `NavLinks.tsx` line 39–43 renders orange badge when `pendingMergeCount > 0` |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Details |
|----------|-----------|--------------|--------|---------|
| `src/lib/db/merge-venue.ts` | — | 109 | VERIFIED | Exports `performVenueMerge` with full 5-step implementation |
| `src/lib/db/merge-venue.test.ts` | 40 | 292 | VERIFIED | 7 unit tests, all passing |
| `src/app/admin/merge-review/actions.ts` | — | 101 | VERIFIED | Exports `mergePair` and `keepSeparate`; `'use server'` directive present |
| `src/app/admin/merge-review/page.tsx` | 40 | 190 | VERIFIED | Server component with Drizzle alias self-join, parallel count queries, event/source count maps |
| `src/app/admin/merge-review/_components/MergeReviewList.tsx` | 80 | 223 | VERIFIED | Client component with tabs, side-by-side VenueCard, inline confirmation, keep-separate |
| `src/app/admin/_components/NavLinks.tsx` | 20 | 57 | VERIFIED | Client component with active link detection, orange badge, logout button |
| `src/app/admin/layout.tsx` | 15 | 35 | VERIFIED | Async server component; fetches pending count; renders `<NavLinks>` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/admin/merge-review/actions.ts` | `src/lib/db/merge-venue.ts` | `import performVenueMerge` | WIRED | Line 8: `import { performVenueMerge } from '@/lib/db/merge-venue'`; called at line 68 |
| `src/lib/scraper/ticketmaster.ts` | `venue_merge_candidates table` | dedup guard before insert | WIRED | Lines 187–204: raw select checks both orderings; gate on `existing.length === 0` before insert |
| `src/app/admin/merge-review/page.tsx` | `venue_merge_candidates + venues (self-join)` | Drizzle alias | WIRED | Lines 56–57: `alias(venues, 'venue_a')` and `alias(venues, 'venue_b')`; `innerJoin` on both FKs |
| `src/app/admin/merge-review/_components/MergeReviewList.tsx` | `src/app/admin/merge-review/actions.ts` | `form action={mergePair}` and `action={keepSeparate}` | WIRED | Line 6: imports both; lines 179, 190: used as form actions |
| `src/app/admin/layout.tsx` | `src/app/admin/_components/NavLinks.tsx` | `pendingMergeCount` prop | WIRED | Line 4: imports `NavLinks`; line 26: `<NavLinks pendingMergeCount={pendingMergeCount} />` |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DEDUP-04 | 20-01, 20-02 | Admin can view near-match venue pairs with side-by-side comparison and merge or keep separate | SATISFIED | Full implementation: backend merge utility + server actions (20-01); side-by-side UI with tabs and inline confirm (20-02) |

No orphaned requirements — DEDUP-04 is the only requirement mapped to Phase 20 in REQUIREMENTS.md.

### Anti-Patterns Found

None detected. Scanned all 7 phase artifacts for TODO/FIXME/placeholder comments, empty return stubs, and console.log-only handlers.

### TypeScript

`npx tsc --noEmit` exits clean with zero errors.

### Test Results

`npx jest src/lib/db/merge-venue.test.ts --no-coverage`:
- 7 tests, 7 passed, 0 failed
- Tests cover: event reassignment, unique constraint drop, FK ordering (event_sources before event), scrape_sources reassignment, venue deletion, audit log insertion, candidate status update

### Commit Verification

All 4 implementation commits confirmed present in git history:
- `8be5549` — feat(20-01): extract performVenueMerge utility with 7 unit tests
- `e1a0063` — feat(20-01): add server actions and ticketmaster dedup guard
- `e2f09c6` — feat(20-02): build merge review page and client component
- `16bf998` — feat(20-02): refactor admin layout for pending merge count badge

### Human Verification Required

All automated checks pass. The following items require browser verification because they depend on live DB state or interactive client behavior:

**1. Admin nav Merge Review link and badge**

**Test:** Navigate to `http://localhost:3000/admin`
**Expected:** "Merge Review" appears in the nav bar. If pending candidates exist, an orange count badge appears beside the label.
**Why human:** Badge display is conditional on live `venue_merge_candidates` rows with `status='pending'`; CSS rendering requires browser.

**2. Merge review page loads with tab bar**

**Test:** Click "Merge Review" in the nav
**Expected:** Page loads with Pending/Merged/Kept Separate tabs and counts. Either candidate card pairs or the empty-state message is shown.
**Why human:** Content depends on live DB state.

**3. Inline merge confirmation flow**

**Test:** With a pending candidate visible, click "Merge"
**Expected:** Button changes to "Confirm merge?" (red) + "Cancel" button appears. Clicking "Cancel" reverts to the original "Merge" button.
**Why human:** `useState(confirmingId)` client toggle requires browser interaction.

**4. Keep Separate action**

**Test:** Click "Keep Separate" on a pending candidate
**Expected:** Candidate disappears from Pending tab, appears in Kept Separate tab with a "Reviewed [date]" footer.
**Why human:** Requires server action round-trip and redirect to verify DB update and UI refresh.

**5. Merge action end-to-end**

**Test:** With a pending candidate, click "Merge" then "Confirm merge?"
**Expected:** Candidate moves out of Pending; duplicate venue no longer appears in `/admin/venues`; events visible under the canonical venue.
**Why human:** Full `performVenueMerge` path requires live DB with a mergeable candidate pair.

---

_Verified: 2026-03-15T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
