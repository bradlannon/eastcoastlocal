---
phase: 18
slug: venue-deduplication
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest |
| **Config file** | `jest.config.ts` (project root) |
| **Quick run command** | `npm test -- venue-dedup` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- venue-dedup`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | DEDUP-01 | unit | `npm test -- venue-dedup -t "auto-merge"` | N/A | ✅ pass |
| 18-01-02 | 01 | 1 | DEDUP-01 | unit | `npm test -- venue-dedup -t "keep_separate"` | N/A | ✅ pass |
| 18-01-03 | 01 | 1 | DEDUP-01 | unit | `npm test -- ticketmaster -t "findOrCreateVenue"` | ✅ extend | ✅ pass |
| 18-01-04 | 01 | 1 | DEDUP-02 | unit | `npm test -- normalizer -t "onConflictDoUpdate"` | ✅ exists | ✅ pass |
| 18-01-05 | 01 | 1 | DEDUP-03 | unit | `npm test -- venue-dedup -t "review"` | N/A | ✅ pass |
| 18-01-06 | 01 | 1 | DEDUP-03 | unit | `npm test -- venue-dedup -t "dry-run"` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/scraper/venue-dedup.test.ts` — stubs for DEDUP-01, DEDUP-03 (matching + merge decision logic)
- [x] Extend `src/lib/scraper/ticketmaster.test.ts` — findOrCreateVenue fuzzy match integration

*Existing infrastructure covers DEDUP-02 (normalizer composite key tests already exist).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Duplicate venue pins resolved on map | DEDUP-01 | Visual map check | After TM ingest with dedup enabled, verify no duplicate venue pins for same physical location |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
