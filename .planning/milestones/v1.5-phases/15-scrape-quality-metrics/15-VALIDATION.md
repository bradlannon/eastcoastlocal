---
phase: 15
slug: scrape-quality-metrics
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.x + ts-jest 29.x |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest orchestrator schema` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest orchestrator schema`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SCRP-04 | unit | `npx jest orchestrator` | N/A | ✅ pass |
| 15-01-02 | 01 | 1 | SCRP-04 | manual | Admin UI visual check | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/app/api/cron/scrape/route.test.ts` — existing, may need extension for metric update assertions
- [x] Orchestrator metric write tests — verify columns are updated on success/failure paths

*Existing jest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin source list shows metrics columns | SCRP-04 | UI rendering | Navigate to /admin, verify event count, avg confidence, failure count columns |
| Sources with 3+ failures are flagged | SCRP-04 | Visual styling | Create a source with 3+ failures, verify red/warning badge |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
