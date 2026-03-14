# Requirements: East Coast Local

**Defined:** 2026-03-14
**Core Value:** Users can instantly see what live music is happening near them on a map — where, when, and who's playing

## v1.1 Requirements

Requirements for heatmap timelapse mode. Each maps to roadmap phases.

### Heatmap

- [ ] **HEAT-01**: User can see a heatmap overlay on the map showing event density by location
- [x] **HEAT-02**: Heatmap intensity reflects the number of events at each venue within the current time window
- [ ] **HEAT-03**: User can click a heatmap hotspot to see the specific events at that location
- [ ] **HEAT-04**: Heatmap updates smoothly in-place as the time position changes (no flicker)

### Timeline

- [ ] **TIME-01**: User can drag a scrubber bar to move through a 30-day window of events
- [x] **TIME-02**: Each scrubber position shows events within a 24-hour rolling window
- [x] **TIME-03**: User can see the current date/time label showing what window is displayed
- [ ] **TIME-04**: User can play/pause to auto-advance the scrubber through time

### Mode

- [ ] **MODE-01**: User can toggle between pin/cluster view and heatmap timelapse view
- [ ] **MODE-02**: Event list sidebar updates to show only events within the current 24-hour time window
- [ ] **MODE-03**: Map viewport (zoom/pan) is preserved when switching between modes

## Future Requirements

### Heatmap Enhancements

- **HEAT-05**: User can adjust heatmap radius/blur settings
- **HEAT-06**: Heatmap color gradient reflects event categories or genres

### Timeline Enhancements

- **TIME-05**: Step forward/back buttons to move one increment at a time
- **TIME-06**: Adjustable playback speed
- **TIME-07**: Mini calendar view alongside scrubber for date jumping

## Out of Scope

| Feature | Reason |
|---------|--------|
| Server-side heatmap aggregation | Client-side filtering sufficient at Atlantic Canada data scale |
| 3D heatmap / elevation | Unnecessary complexity, 2D density conveys the information |
| URL persistence of time position | Animation state through nuqs causes History API rate-limit issues |
| Custom scrubber (div-based) | Native input[range] provides accessibility (WCAG 2.5.7) for free |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HEAT-01 | Phase 4 | Pending |
| HEAT-02 | Phase 4 | Complete |
| HEAT-03 | Phase 5 | Pending |
| HEAT-04 | Phase 4 | Pending |
| TIME-01 | Phase 4 | Pending |
| TIME-02 | Phase 4 | Complete |
| TIME-03 | Phase 4 | Complete |
| TIME-04 | Phase 4 | Pending |
| MODE-01 | Phase 4 | Pending |
| MODE-02 | Phase 4 | Pending |
| MODE-03 | Phase 4 | Pending |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — Phase mapping complete after roadmap creation*
