---
phase: 18
slug: venue-deduplication
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Quick run command** | `npm test -- --testPathPattern venue-dedup` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern venue-dedup`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | DEDUP-01 | unit | `npm test -- --testPathPattern venue-dedup -t "auto-merge"` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | DEDUP-01 | unit | `npm test -- --testPathPattern venue-dedup -t "keep_separate"` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | DEDUP-01 | unit | `npm test -- --testPathPattern ticketmaster -t "findOrCreateVenue"` | ✅ extend | ⬜ pending |
| 18-01-04 | 01 | 1 | DEDUP-02 | unit | `npm test -- --testPathPattern normalizer -t "onConflictDoUpdate"` | ✅ exists | ⬜ pending |
| 18-01-05 | 01 | 1 | DEDUP-03 | unit | `npm test -- --testPathPattern venue-dedup -t "review"` | ❌ W0 | ⬜ pending |
| 18-01-06 | 01 | 1 | DEDUP-03 | unit | `npm test -- --testPathPattern venue-dedup -t "dry-run"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/scraper/venue-dedup.test.ts` — stubs for DEDUP-01, DEDUP-03 (matching + merge decision logic)
- [ ] Extend `src/lib/scraper/ticketmaster.test.ts` — findOrCreateVenue fuzzy match integration

*Existing infrastructure covers DEDUP-02 (normalizer composite key tests already exist).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Duplicate venue pins resolved on map | DEDUP-01 | Visual map check | After TM ingest with dedup enabled, verify no duplicate venue pins for same physical location |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
