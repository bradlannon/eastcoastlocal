---
phase: 16
slug: ticketmaster-integration
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.x + ts-jest 29.x |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest ticketmaster` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest ticketmaster`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | PLAT-01, PLAT-02 | unit | `npx jest ticketmaster` | Yes | ✅ pass |
| 16-01-02 | 01 | 1 | PLAT-03 | unit | `npx tsc --noEmit` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/scraper/ticketmaster.test.ts` — stubs for TM handler (PLAT-01, PLAT-02)

*Existing jest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TM events appear on map | PLAT-01 | Requires API key and live data | Set TICKETMASTER_API_KEY, run scrape cron, verify events on map |
| "via Ticketmaster" attribution visible | PLAT-03 | UI rendering | Check event card/detail page for attribution text |
| Venue dedup works for known venues | PLAT-02 | Data-dependent | Verify Scotiabank Centre events match existing venue |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
