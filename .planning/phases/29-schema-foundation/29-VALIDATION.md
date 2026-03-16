---
phase: 29
slug: schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest 29.x |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest src/lib/db/schema.test.ts src/lib/schemas/extracted-event.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/db/schema.test.ts src/lib/schemas/extracted-event.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 0 | ARCH-01 | unit | `npx jest src/lib/db/schema.test.ts -t "archived_at"` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 0 | SER-01 | unit | `npx jest src/lib/db/schema.test.ts -t "recurring_series"` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 0 | SER-01 | unit | `npx jest src/lib/db/schema.test.ts -t "series_id"` | ❌ W0 | ⬜ pending |
| 29-01-04 | 01 | 0 | SER-05 | unit | `npx jest src/lib/schemas/extracted-event.test.ts -t "recurrence_pattern"` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | ARCH-01 | unit | `npx jest src/lib/db/schema.test.ts -t "archived_at"` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 1 | SER-01 | unit | `npx jest src/lib/db/schema.test.ts -t "recurring_series"` | ❌ W0 | ⬜ pending |
| 29-02-03 | 02 | 1 | SER-01 | unit | `npx jest src/lib/db/schema.test.ts -t "series_id"` | ❌ W0 | ⬜ pending |
| 29-02-04 | 02 | 1 | ARCH-01 | type-level | `npx jest src/lib/db/schema.test.ts` (ts-jest compile check) | ❌ W0 | ⬜ pending |
| 29-03-01 | 03 | 1 | SER-05 | unit | `npx jest src/lib/schemas/extracted-event.test.ts -t "recurrence_pattern"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/db/schema.test.ts` — add `archived_at` and `series_id` to events expected columns, add `recurring_series` describe block
- [ ] `src/lib/schemas/extracted-event.test.ts` — add test case for `recurrence_pattern` optional field (present and absent)

*(Existing test files exist; new test cases needed within them — no new files required)*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
