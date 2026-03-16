---
phase: 17
slug: auto-approve-discovery
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.x + ts-jest 29.x |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest discovery-orchestrator discover` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest discovery-orchestrator discover`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | DISC-05 | unit | `npx jest discovery-orchestrator` | ✅ | ✅ pass |
| 17-01-02 | 01 | 1 | DISC-06 | unit | `npx jest discover` | ✅ | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Extend `src/lib/scraper/discovery-orchestrator.test.ts` — add scoring + auto-approve tests
- [x] Extend `src/app/api/cron/discover/route.test.ts` — if revoke action tested here

*Existing jest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "auto-approved" label in discovery UI | DISC-06 | UI rendering | Navigate to /admin/discovery, check for auto-approved badge |
| Revoke button works | DISC-06 | UI interaction | Click revoke on an auto-approved source, verify status changes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
