---
phase: 4
slug: timelapse-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 4 — Validation Strategy

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
| TBD | TBD | TBD | HEAT-01 | manual | Visual: heatmap renders on map | N/A | ⬜ pending |
| TBD | TBD | TBD | HEAT-02 | unit | `npm test -- timelapse-utils` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HEAT-04 | manual | Visual: no flicker on scrub | N/A | ⬜ pending |
| TBD | TBD | TBD | TIME-01 | manual | Drag scrubber, verify range | N/A | ⬜ pending |
| TBD | TBD | TBD | TIME-02 | unit | `npm test -- timelapse-utils` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TIME-03 | unit | `npm test -- timelapse-utils` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TIME-04 | manual | Play/pause buttons work | N/A | ⬜ pending |
| TBD | TBD | TBD | MODE-01 | manual | Toggle switches layers | N/A | ⬜ pending |
| TBD | TBD | TBD | MODE-02 | manual | Sidebar updates with window | N/A | ⬜ pending |
| TBD | TBD | TBD | MODE-03 | manual | Zoom/pan preserved on toggle | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/timelapse-utils.test.ts` — unit tests for time windowing, heatmap point computation, step label formatting
- [ ] Existing test infrastructure (Jest 30 + ts-jest) covers framework needs

*No new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Heatmap renders on map | HEAT-01 | Canvas rendering, no DOM assertion | Toggle heatmap mode, verify blue-red gradient appears |
| Heatmap updates without flicker | HEAT-04 | Visual smoothness assessment | Drag scrubber, confirm no flicker/flash |
| Scrubber drag interaction | TIME-01 | Browser input interaction | Drag range input across full width |
| Play/pause animation | TIME-04 | setInterval timing behavior | Click play, observe auto-advance, click pause |
| Mode toggle switches layers | MODE-01 | Layer visibility on Leaflet map | Click toggle, verify pins hidden + heatmap shown |
| Sidebar syncs with time | MODE-02 | Full integration: state → filter → render | Scrub to specific date, verify sidebar matches |
| Viewport preserved on toggle | MODE-03 | Leaflet map state persistence | Zoom to city, toggle mode, verify zoom preserved |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
