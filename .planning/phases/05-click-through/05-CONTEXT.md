# Phase 5: Click-Through - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can click a heatmap hotspot and see the specific events at that location via a popup. This requires an invisible interaction layer since leaflet.heat canvas has no native click events (GitHub issue #61).

</domain>

<decisions>
## Implementation Decisions

### Click Feedback
- Show a popup on the map at the clicked location (reuse existing VenuePopup pattern)
- Popup shows only events within the current 24-hour time window — consistent with what the heatmap is displaying
- Clicking a hotspot while playing auto-pauses playback — consistent with how drag auto-pauses

### Overlap Handling
- When multiple venues are within the click radius, popup shows all of them
- Events grouped by venue in the popup (Venue A: events, Venue B: events) — not a flat list
- Reuse existing VenuePopup component structure for each venue group

### Click Target Size
- Claude's discretion — pick what feels best for both touch and mouse interaction

### Claude's Discretion
- Click target radius (fixed pixel vs zoom-dependent)
- Invisible CircleMarker styling (must be truly invisible — no fill, no stroke)
- How the multi-venue popup is styled compared to existing single-venue VenuePopup
- Spatial proximity algorithm for finding nearby venues

</decisions>

<specifics>
## Specific Ideas

- Auto-pause on click is key — user needs to read the popup without the time window moving
- Multi-venue popup should look like the existing VenuePopup but with venue name headers separating groups

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VenuePopup`: Existing popup component showing venue name + event list — reuse or extend for multi-venue
- `ClusterLayer`: Groups events by venue_id into a Map — same grouping pattern needed for click lookup
- `computeVenueHeatPoints`: Already computes venue positions — can reuse for placing invisible markers
- `filterByTimeWindow`: Filters events to current 24-hour window — use for popup event filtering

### Established Patterns
- `useMap()` hook for custom Leaflet components (MapBoundsTracker, MapViewController, HeatmapLayer)
- Popup via react-leaflet's `<Popup>` component inside `<Marker>` or `<CircleMarker>`
- `handleScrubStart` callback pattern already auto-pauses playback — same pattern for click

### Integration Points
- New `HeatmapClickLayer` component inside `MapContainer` alongside `HeatmapLayer`
- Needs `allEvents` (or time-windowed events) + `timePosition` to filter popup content
- Needs `onScrubStart` (or similar) callback to auto-pause on click
- Only renders when `mapMode === 'timelapse'`

</code_context>

<deferred>
## Deferred Ideas

- Zoom-to-location button on event cards — noted for roadmap backlog

</deferred>

---

*Phase: 05-click-through*
*Context gathered: 2026-03-14*
