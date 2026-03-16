---
phase: 5
slug: click-through
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x + ts-jest |
| **Config file** | jest.config.ts |
| **Quick run command** | `npm test -- --testPathPattern=timelapse` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=timelapse`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | HEAT-03 | unit | `npm test -- timelapse-utils` | N/A | ✅ pass |
| TBD | TBD | TBD | HEAT-03 | manual | Click hotspot, verify popup | N/A | ✅ pass |
| TBD | TBD | TBD | HEAT-03 | manual | Click overlapping venues, verify grouped popup | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `findNearbyVenues` unit tests added to `src/lib/timelapse-utils.test.ts` — spatial proximity query logic

*Existing test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click hotspot shows popup | HEAT-03 | Requires Leaflet map + click event | Toggle heatmap, click a colored area, verify popup appears |
| Multi-venue popup groups correctly | HEAT-03 | Popup rendering in browser | Click area with multiple venues, verify grouped by venue |
| Click auto-pauses playback | HEAT-03 | setInterval + click interaction | Start playback, click hotspot, verify playback stops |
| Popup shows time-windowed events | HEAT-03 | Full state integration | Scrub to specific time, click hotspot, verify events match window |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
