---
phase: 20
slug: admin-merge-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/db/merge-venue.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` | ✅ extend | ⬜ pending |
| 20-02-01 | 02 | 1 | DEDUP-04 | manual | Server component rendering | N/A | ⬜ pending |
| 20-02-02 | 02 | 1 | DEDUP-04 | manual | Server action integration | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/db/merge-venue.test.ts` — unit tests for `performVenueMerge` and `keepSeparate` (mocked DB)
- [ ] `src/app/admin/merge-review/` — directory structure (page.tsx, actions.ts, _components/)

*Existing infrastructure covers test framework — Jest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Side-by-side card layout renders correctly | DEDUP-04 | Server component UI rendering | Navigate to /admin/merge-review, verify card pair display |
| Merge inline confirm flow works end-to-end | DEDUP-04 | Server action + revalidation | Click Merge → Confirm → verify venue deleted, events reassigned |
| Keep Separate removes pair from pending tab | DEDUP-04 | Server action + revalidation | Click Keep Separate → verify pair moves to Kept Separate tab |
| Pending count badge appears on admin nav | DEDUP-04 | Layout rendering | Check admin nav shows badge with correct count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
