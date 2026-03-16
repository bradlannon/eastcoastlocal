---
phase: 33
slug: admin-manual-triggers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npm test -- --testPathPattern="admin/trigger"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="admin/trigger"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | TRIG-01 | unit | `npm test -- --testPathPattern="admin/trigger"` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | TRIG-02 | unit + visual | `npm test -- --testPathPattern="admin/trigger"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/admin/trigger/[job]/route.test.ts` — stubs for auth, dispatch, response shapes, error paths

*Existing test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TriggerActions renders buttons on dashboard | TRIG-02 | Visual UI layout | Load /admin, verify Actions section with 3 button groups |
| Spinner + result toast on trigger click | TRIG-02 | Interactive UX | Click Run Scrape, verify spinner and toast |
| 30s timeout warning appears | TRIG-02 | Timing-dependent UX | Trigger a slow job, verify warning appears |
| Dashboard stats refresh after success | TRIG-02 | Page behavior | Trigger archive, verify Last Scrape time updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
