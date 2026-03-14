# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- 🚧 **v1.1 Heatmap Timelapse** — Phases 4-5 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 2: Data Pipeline (3/3 plans) — completed 2026-03-14
- [x] Phase 3: Public Frontend (3/3 plans) — completed 2026-03-14

</details>

### 🚧 v1.1 Heatmap Timelapse (In Progress)

**Milestone Goal:** Add a dynamic time dimension to the map — users can switch to a heatmap timelapse mode, scrub through 30 days of events, play animated playback, and see the sidebar sync to the current time window.

- [ ] **Phase 4: Timelapse Core** - Pure utilities, HeatmapLayer (SSR-guarded), TimelineBar, ModeToggle, and HomeContent wiring — delivers the working timelapse loop
- [ ] **Phase 5: Click-Through** - HeatmapClickLayer invisible CircleMarker implementation enabling hotspot click events, plus full pitfall verification

## Phase Details

### Phase 4: Timelapse Core
**Goal**: Users can switch to heatmap timelapse mode, scrub through 30 days of events, watch playback animate, and see the sidebar stay in sync with the current time window
**Depends on**: Phase 3 (v1.0 map infrastructure — MapContainer, HomeContent, allEvents data flow)
**Requirements**: HEAT-01, HEAT-02, HEAT-04, TIME-01, TIME-02, TIME-03, TIME-04, MODE-01, MODE-02, MODE-03
**Success Criteria** (what must be TRUE):
  1. User can click the mode toggle and see the pin cluster view replaced by a heatmap overlay on the map
  2. User can drag the scrubber to any position across a 30-day window and see the heatmap intensity update without flicker to reflect events in that 24-hour slot
  3. User can press play and watch the scrubber auto-advance, with the heatmap updating continuously, and press pause to stop at any position
  4. The current date/time label updates to show a human-readable window (e.g., "Friday Mar 20, 8pm – Saturday Mar 21, 8pm") as the scrubber moves
  5. The event list sidebar shows only events within the current 24-hour time window and updates within 250ms as the scrubber moves
**Plans:** 2/4 plans executed

Plans:
- [ ] 04-01-PLAN.md — TDD: timelapse utility functions (time position, block names, time window filtering, heat point computation)
- [ ] 04-02-PLAN.md — Install leaflet.heat, create HeatmapLayer and ModeToggle components, verify SSR build gate
- [ ] 04-03-PLAN.md — Create TimelineBar scrubber, wire all components into HomeContent/MapClient/MapClientWrapper
- [ ] 04-04-PLAN.md — Visual verification checkpoint for complete timelapse feature

### Phase 5: Click-Through
**Goal**: Users can click a heatmap hotspot and reach the specific events at that location
**Depends on**: Phase 4
**Requirements**: HEAT-03
**Success Criteria** (what must be TRUE):
  1. User can click a heatmap hotspot and see the events at that venue (via the existing event detail or popup flow)
  2. Click-through works correctly when venues overlap or are close together at the current zoom level
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-14 |
| 3. Public Frontend | v1.0 | 3/3 | Complete | 2026-03-14 |
| 4. Timelapse Core | 2/4 | In Progress|  | - |
| 5. Click-Through | v1.1 | 0/? | Not started | - |
