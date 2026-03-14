---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Heatmap Timelapse
status: planning
stopped_at: Completed 04-timelapse-core/04-03-PLAN.md
last_updated: "2026-03-14T17:17:59.224Z"
last_activity: 2026-03-14 — Roadmap created, phases 4-5 defined
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Users can instantly see what live music is happening near them on a map — where, when, and who's playing
**Current focus:** Phase 4 — Timelapse Core

## Current Position

Phase: 4 of 5 — Timelapse Core
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-14 — Roadmap created, phases 4-5 defined

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v1.0)
- v1.1 plans completed: 0

**By Phase (v1.0):**

| Phase | Plans | Completed |
|-------|-------|-----------|
| 1. Foundation | 2 | 2026-03-14 |
| 2. Data Pipeline | 3 | 2026-03-14 |
| 3. Public Frontend | 3 | 2026-03-14 |
| Phase 04-timelapse-core P01 | 3 | 2 tasks | 2 files |
| Phase 04-timelapse-core P02 | 3 | 2 tasks | 3 files |
| Phase 04-timelapse-core P03 | 3 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- v1.1 roadmap: Two coarse phases — Phase 4 wires all interdependent timelapse components together; Phase 5 isolates HeatmapClickLayer (architecturally distinct invisible-layer approach)
- v1.1: `timePosition` in React `useState` only — never nuqs (History API rate-limit at 5 updates/sec playback)
- v1.1: `setLatLngs()` for heatmap updates (no layer re-creation), `setInterval` at 200ms for playback
- v1.1: SSR guard for `leaflet.heat` must be verified via `next build` before any animation logic is written
- [Phase 04-timelapse-core]: positionToBlockName uses Math.round(position * (TOTAL_STEPS-1)) — position 119/120 maps to step 118 (Evening), position 1.0 maps to step 119 (Night)
- [Phase 04-timelapse-core]: HeatPoint type imported from timelapse-utils.ts in HeatmapLayer (not redefined) — single source of truth
- [Phase 04-timelapse-core]: @ts-expect-error removed — @types/leaflet.heat provides full L.heatLayer typing, no suppression needed
- [Phase 04-timelapse-core]: Mode-aware useMemo derives sidebarEvents and heatPoints together to prevent dual filter runs
- [Phase 04-timelapse-core]: ClusterLayer unmounts (not CSS-hidden) in timelapse mode per research Open Question 2 recommendation
- [Phase 04-timelapse-core]: EventFilters hidden in timelapse mode — TimelineBar replaces date filter UI entirely

### Pending Todos

None.

### Blockers/Concerns

- Phase 4: SSR build verification is gating — must confirm `leaflet.heat` dynamic import does not cause `window is not defined` at build time before any animation work proceeds
- Phase 5: `HeatmapClickLayer` requires invisible `CircleMarker` layer (HeatLayer canvas has no click events — GitHub issue #61 confirmed unresolved)

## Session Continuity

Last session: 2026-03-14T16:33:35.915Z
Stopped at: Completed 04-timelapse-core/04-03-PLAN.md
Resume file: None
