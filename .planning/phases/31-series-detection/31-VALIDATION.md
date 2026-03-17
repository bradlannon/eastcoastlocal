---
phase: 31
slug: series-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest 29.x |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest src/lib/series-detector.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/series-detector.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | SER-02 | unit | `npx jest src/lib/series-detector.test.ts -t "isWeekdayRegular"` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | SER-03 | unit | `npx jest src/lib/series-detector.test.ts -t "hasRecurrenceKeyword"` | ❌ W0 | ⬜ pending |
| 31-01-03 | 01 | 1 | SER-04 | unit | `npx jest src/lib/series-detector.test.ts -t "performerFuzzyRatio"` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 1 | SER-05 | unit | `npx jest src/app/api/cron/detect-series/route.test.ts -t "401"` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 1 | SER-05 | unit | `npx jest src/app/api/cron/detect-series/route.test.ts -t "200"` | ❌ W0 | ⬜ pending |
| 31-03-01 | 03 | 2 | SER-06 | manual | `tsx src/lib/db/backfill-series.ts` (dry-run) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/series-detector.test.ts` — stubs for SER-02, SER-03, SER-04
- [ ] `src/app/api/cron/detect-series/route.test.ts` — auth + delegation tests

*Existing infrastructure covers framework setup; only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backfill script tags all existing events | SER-06 | Requires live database with existing events | Run `tsx src/lib/db/backfill-series.ts` against staging DB, verify series_id populated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
