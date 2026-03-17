---
phase: 32
slug: series-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npx jest src/lib/series-utils.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/series-utils.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 0 | UI-01, UI-02 | unit | `npx jest src/lib/series-utils.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 1 | UI-01 | unit + visual | `npx jest src/lib/series-utils.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 1 | UI-02 | unit | `npx jest src/lib/series-utils.test.ts --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/series-utils.test.ts` — stubs for UI-01 badge data path and UI-02 collapse logic
- [ ] Update `src/app/api/events/route.test.ts` mock to include `series_id` field

*Existing infrastructure covers framework needs — Jest + ts-jest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Recurring" badge renders visually correct | UI-01 | No React Testing Library in project | Inspect EventCard in browser; badge should appear on series events with teal styling |
| Collapsed series card layout | UI-02 | Visual layout verification | Browse event list; series should show one card with "+N more upcoming" text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
