---
phase: 30
slug: archival
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npm test -- --testPathPattern="cron/archive\|api/events\|normalizer\|admin/archived"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="cron/archive\|api/events\|normalizer\|admin/archived"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | ARCH-02 | unit | `npm test -- --testPathPattern="cron/archive"` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | ARCH-02 | unit | `npm test -- --testPathPattern="cron/archive"` | ❌ W0 | ⬜ pending |
| 30-01-03 | 01 | 1 | ARCH-03 | unit | `npm test -- --testPathPattern="api/events"` | ✅ (update) | ⬜ pending |
| 30-01-04 | 01 | 1 | ARCH-04 | unit | `npm test -- --testPathPattern="normalizer"` | ✅ (update) | ⬜ pending |
| 30-01-05 | 01 | 1 | ARCH-05 | unit | `npm test -- --testPathPattern="admin/archived"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/cron/archive/route.test.ts` — stubs for ARCH-02 (auth, success, error, timezone threshold)
- [ ] `src/app/api/admin/archived/route.test.ts` — stubs for ARCH-05 (paginated archived events)
- [ ] Update `src/app/api/events/route.test.ts` — update existing test to assert `isNull(archived_at)` behavior (ARCH-03)
- [ ] Update `src/lib/scraper/normalizer.test.ts` — add test asserting `archived_at` absent from ON CONFLICT SET (ARCH-04)

*Existing test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin archived tab renders with nav link | ARCH-05 | Visual UI layout | Load /admin/archived, verify tab appears in nav and page renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
