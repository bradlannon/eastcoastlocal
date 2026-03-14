# Phase 4: Timelapse Core - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Heatmap timelapse mode: users can toggle to a heatmap overlay, scrub through 30 days of events in 6-hour blocks, watch animated playback, and see the sidebar event list sync to the current 24-hour time window. Click-through from hotspots is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Scrubber Appearance
- Positioned at the bottom of the map panel, overlaying the map (like windy.tv)
- Semi-transparent frosted glass/blur background — map visible underneath
- Shows: date label, time-of-day label, event count badge, play/pause button — all on the bar
- Only appears when heatmap mode is active — hidden in normal pin view
- Uses native `<input type="range">` for accessibility (WCAG 2.5.7)

### Heatmap Visual Style
- Blue-to-red classic color gradient
- Even a single event creates a visible warm spot — sparse areas should not be invisible
- Heatmap radius scales with zoom level (geographic accuracy)
- Pin clusters are hidden in heatmap mode — clean heatmap only, no visual clutter

### Mode Toggle
- Floating icon button on the map, top-right (consistent with existing GeolocationButton pattern)
- Single button that changes appearance when active (not a segmented control)
- Province filters still apply in heatmap mode (e.g. filter to NB, heatmap shows only NB events)
- Date filter replaced by scrubber control in heatmap mode
- Map viewport (zoom/pan) preserved when switching modes

### Playback Behavior
- 6-hour block steps: Morning/Afternoon/Evening/Night — matches event scheduling patterns
- ~1 second per step — 120 steps = ~2 minutes for full 30 days
- Stops at end (does not loop)
- Dragging the scrubber auto-pauses playback
- Time position state in React useState — never nuqs (History API rate-limit concern)
- Uses setInterval at ~1000ms for playback, setLatLngs() for smooth heatmap updates

### Claude's Discretion
- Exact frosted glass CSS approach (backdrop-blur, opacity)
- Exact icon for heatmap toggle button
- Layout of elements within the scrubber bar (date left, play center, count right, etc.)
- Transition animation when entering/exiting heatmap mode

</decisions>

<specifics>
## Specific Ideas

- "Like windy.tv" — the timeline scrubber at the bottom with playback controls is the reference UX
- Semi-transparent overlay feel — the scrubber floats on the map, not a separate chrome element
- 24-hour rolling window with 6-hour steps — each position shows events within that window

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MapBoundsTracker` / `MapViewController`: Custom `useMap()` hook pattern — same approach for HeatmapLayer
- `ClusterLayer`: Venue grouping logic (Map<venueId, {venue, events}>) — reuse for heatmap point generation
- `GeolocationButton`: Floating map button pattern — reuse for mode toggle placement
- `filterByDateRange` / `filterByProvince` / `filterByBounds`: Filter chain pattern — extend for time window filtering
- `MapClientWrapper`: Dynamic import with `ssr: false` — same pattern needed for leaflet.heat

### Established Patterns
- All map components are children of `MapContainer` in `MapClient.tsx`
- State lives in `HomeContent` (page.tsx) and flows down via props through `MapClientWrapper` → `MapClient`
- Venue popup pattern via `VenuePopup` component
- Event list receives filtered events array and renders

### Integration Points
- `HomeContent` (page.tsx): Add `isHeatmapMode` and `timePosition` state, wire to new components
- `MapClient.tsx`: Add HeatmapLayer alongside ClusterLayer, toggle visibility based on mode
- `MapClientWrapper.tsx`: Thread new props (mode, timePosition, onTimeChange)
- `EventList`: Already accepts filtered events — just pass time-windowed events in heatmap mode

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-timelapse-core*
*Context gathered: 2026-03-14*
