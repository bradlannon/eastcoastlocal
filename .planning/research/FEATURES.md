# Feature Research

**Domain:** Heatmap timelapse mode for live music event discovery map (v1.1 milestone)
**Researched:** 2026-03-14
**Confidence:** MEDIUM (core UX patterns are HIGH confidence from established tools like kepler.gl, ArcGIS, windy.com; implementation specifics for this exact data shape are MEDIUM confidence from analogous examples)

---

## Context: What Already Exists

This is a subsequent milestone. The following are already built and must be preserved and integrated with:

- Interactive Leaflet map with pin clusters (react-leaflet 5.x + react-leaflet-cluster 4.0)
- Event list sidebar with date and province filters (nuqs URL state)
- Event detail pages
- Split-screen layout (map left, list right)
- Viewport-synced list (list shows events visible in current map bounds)

The heatmap timelapse mode is an alternative visualization mode layered onto this foundation — not a replacement.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of map timelapse tools (windy.com, kepler.gl, ArcGIS) expect. Missing these makes the feature feel broken or half-built.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Play / pause button | Every animation tool from Google Earth to windy.com has this; users immediately look for it | LOW | Single toggle button; keyboard spacebar shortcut is expected by power users |
| Timeline scrubber (draggable) | Users must be able to jump to any time position, not just play forward; learned behavior from video players and windy.com | MEDIUM | Horizontal slider showing 30-day window; dragging updates heatmap and sidebar in real time |
| Current time display | Users need to know what time slice they are viewing; "Thursday 8 PM" is the essential context for event discovery | LOW | Show day + time prominently near scrubber; format as human-readable (not epoch) |
| Heatmap color gradient (cool-to-hot) | Universal convention: blue/green = sparse, red/orange = dense; deviating confuses users | LOW | leaflet.heat defaults to this; customize radius and blur for event data density |
| Heatmap responds to time position | The entire point of timelapse; static heatmap has no value in this context | MEDIUM | On scrubber move or play advance, recompute which events fall in the current 24-hour window |
| Toggle between heatmap mode and pin/cluster mode | Users need to return to detailed pin view for "what's actually playing"; heatmap alone can't complete discovery | LOW | Toggle button (e.g., top-right of map); animated or instant transition |
| Sidebar list syncs with time position | When scrubber is at Thursday 8 PM, list shows only events in that window; this is the expected behavior from ArcGIS, kepler.gl, and the Crime Time UI pattern | MEDIUM | Filter event list to current time window; sidebar updates on every scrubber change during drag and on play advance |
| Animation loops | After reaching 30-day end, playback loops back to start; expected from windy.com and video players | LOW | Optional loop toggle; loop by default is acceptable |
| Step forward / backward controls | Single-step navigation through time intervals; expected alongside play/pause from kepler.gl and ArcGIS time slider | LOW | Arrow buttons flanking play button; advance by one day or one 6-hour block |

### Differentiators (Competitive Advantage)

Features that make this timelapse mode genuinely useful for live music discovery, not just technically complete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Click-through from heatmap hotspot to events | "I see a hot Friday night in Halifax — show me what's on" is the entire discovery loop; heatmap without drill-down is dead-end visualization | HIGH | leaflet.heat renders to canvas and does not support native click events; requires a spatial lookup — on map click, find events near that lat/lng in the current time window, then filter sidebar or open a popup listing those events |
| 24-hour rolling window (not snapshot) | A single-moment snapshot for event data is sparse and misleading; a 24-hour window shows "what's happening in this evening" which matches how people think about going out | MEDIUM | Window size should be configurable in code (24h default); UI may show window size for clarity |
| Animation speed control | Windy.com's lack of per-user speed control is a top user complaint; even simple slow/medium/fast presets are valued | LOW | Two to three speed presets (e.g., 1x = 1 step/sec, 2x = 2 steps/sec, 4x = 4 steps/sec); store preference in localStorage |
| Heatmap intensity weighted by event count per venue | A venue with 5 events on a Friday should appear hotter than a venue with 1; naive point-per-event approach causes over-representation of data entry patterns | MEDIUM | Aggregate events by venue coordinates within the time window; pass count as intensity weight to leaflet.heat |
| Sidebar shows count and day context | "12 events this Friday evening" gives users a mental model of what the animation means; windy.com's lack of contextual labeling is a recurring user frustration | LOW | Label above sidebar list: "X events — [day] [time range]" |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem natural for a heatmap timelapse but create problems in this specific context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Heatmap as default / first view | "It looks cooler" | Event data is sparse in rural NL and PEI; a heatmap over sparse data communicates nothing and confuses users; pin clusters work everywhere | Pin/cluster view is default; heatmap is opt-in from a mode toggle |
| Per-hour time steps | More granular = more accurate | Most events have only date + rough time (evening); per-hour steps create false precision and sparsely populated windows; 6-hour or 12-hour steps match the data resolution | Use 6-hour steps: Morning / Afternoon / Evening / Night blocks |
| Real-time heatmap update as user types filter | Feels interactive | Thrashing renders on every keystroke during drag is expensive; the heatmap re-renders are not free | Debounce scrubber drag updates; update on drag end or at low frequency during drag |
| Province / location filter active during heatmap mode | Logical extension of existing filters | The heatmap conveys geography visually; applying a geo-filter while in heatmap mode creates an invisible restriction that contradicts what the map shows | During heatmap mode, suppress or reset geo filters; keep only the time filter; re-apply geo filters when switching back to pin mode |
| Custom time window size control | Power users want this | Adds significant UI complexity; most users don't understand what changing window size means; 24-hour is the right default for "going out tonight" use case | Hard-code 24-hour window in v1.1; make it a future config option if users request it |
| Heatmap-only navigation (no sidebar) | Clean fullscreen map | Removes the event list which is the payoff of clicking hotspots; heatmap alone cannot complete the discovery loop | Keep sidebar; let sidebar collapse if user prefers, but don't remove it |
| Animated heat point trails (particle effects) | Windy.com-style particle flow looks impressive | Meaningful for continuous phenomena (wind, pressure); misleading for discrete event data (a gig on Friday is not a "flow"); performance-intensive in canvas | Static heatmap that updates per time step; no trails |

---

## Feature Dependencies

```
[Heatmap Timelapse Mode]
    └──requires──> [Heatmap Layer] (leaflet.heat or equivalent)
    └──requires──> [Timeline Scrubber Component]
    └──requires──> [Time Window Filter Logic] (filter events by date/time range)
    └──requires──> [Mode Toggle] (switch between pin view and heatmap view)

[Timeline Scrubber Component]
    └──requires──> [Time Window Filter Logic]
    └──drives──> [Heatmap Layer] (recompute on time change)
    └──drives──> [Sidebar List] (filter to current window on time change)

[Play / Pause Animation]
    └──requires──> [Timeline Scrubber Component]
    └──requires──> [Step interval logic] (advance scrubber by N hours, loop)

[Click-through from Heatmap Hotspot]
    └──requires──> [Heatmap Layer] (canvas click event interception)
    └──requires──> [Spatial proximity lookup] (find events near clicked lat/lng)
    └──drives──> [Sidebar List] (filter to nearby events in current window)

[Mode Toggle]
    └──depends on──> [Existing Pin/Cluster Layer] (must re-show on toggle back)
    └──conflicts with──> [Existing Geo Filters] (must suppress or handle during heatmap mode)

[Sidebar Sync]
    └──requires──> [Time Window Filter Logic]
    └──enhances──> [Existing Sidebar] (adds time-based filter on top of existing date/province filters)
    └──depends on──> [Existing Event List Component] (extend, not replace)
```

### Dependency Notes

- **Click-through from heatmap requires custom canvas click handling:** leaflet.heat renders to a canvas element with no built-in click events. A map-level click handler must compute which events fall within a configurable radius (e.g., 30km) of the clicked point AND within the current time window. This is the most technically novel piece of the milestone.
- **Mode toggle must manage two mutually exclusive Leaflet layer groups:** The pin cluster layer group and the heatmap layer must not render simultaneously. React state controls which is mounted; dynamic imports already exist for SSR bypass and should continue to apply.
- **Sidebar sync must not break existing filters:** The existing date and province filters use nuqs URL state. Time-window filtering during heatmap mode is a separate, transient state (not URL-persisted) because the animation position is ephemeral. These two filter systems must coexist without collision.
- **Heatmap Layer depends on aggregated data shape:** The heatmap needs `[lat, lng, intensity]` tuples where intensity = event count per venue per time window. This computation runs client-side against the already-loaded event dataset; no new API endpoint is required if the full 30-day event dataset is loaded upfront.

---

## MVP Definition

### Launch With (v1.1)

Minimum viable timelapse feature — what makes the mode useful and complete.

- [ ] Mode toggle (pin/cluster view vs heatmap timelapse view) — entry point to the new feature
- [ ] Heatmap layer rendering event density for current 24-hour time window — core visualization
- [ ] Timeline scrubber covering 30-day window — user control over time position
- [ ] Play / pause animation with auto-advance (configurable step size, default 6 hours) — the "timelapse" part
- [ ] Current time position label (day + time) — context without which the animation is meaningless
- [ ] Sidebar list synced to current time window (shows events in current 24-hour window) — completes the discovery loop
- [ ] Step forward / backward buttons — fine-grained navigation
- [ ] Animation loops after reaching 30-day end — prevents dead-end playback

### Add After Validation (v1.1.x)

Features to add once the core timelapse is in users' hands.

- [ ] Click-through from heatmap hotspot to events — validates whether users actually want to drill down from the heatmap; add if interaction data shows users clicking the map
- [ ] Animation speed control (slow/medium/fast) — add when users report animation feels too fast or slow
- [ ] Sidebar event count + time context label — low effort, add if user testing shows confusion about what the sidebar is showing

### Future Consideration (v2+)

- [ ] Configurable time window size (12h, 24h, 48h) — only if users with specific use cases request it
- [ ] Keyboard shortcuts (spacebar = play/pause, arrow keys = step) — power user polish, not needed at launch
- [ ] Share / permalink to a specific time position — requires URL state for animation position; deferred

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Mode toggle (heatmap on/off) | HIGH | LOW | P1 |
| Heatmap layer with time window | HIGH | MEDIUM | P1 |
| Timeline scrubber (30-day range) | HIGH | MEDIUM | P1 |
| Play / pause animation | HIGH | LOW | P1 |
| Current time label | HIGH | LOW | P1 |
| Sidebar sync to time window | HIGH | MEDIUM | P1 |
| Step forward / backward buttons | MEDIUM | LOW | P1 |
| Animation loop | MEDIUM | LOW | P1 |
| Click-through from hotspot | HIGH | HIGH | P2 |
| Animation speed control | MEDIUM | LOW | P2 |
| Sidebar event count label | MEDIUM | LOW | P2 |
| Keyboard shortcuts | LOW | LOW | P3 |
| Permalink to time position | LOW | MEDIUM | P3 |
| Configurable window size | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch of this milestone
- P2: Should have; add when core is stable
- P3: Nice to have; future consideration

---

## Reference App Analysis

How comparable tools implement each pattern:

| Feature | windy.com | kepler.gl | ArcGIS Time Slider | Our Approach |
|---------|-----------|-----------|-------------------|--------------|
| Timeline position | Bottom bar, drag anywhere | Bottom bar, click or drag | Top or bottom, configurable | Bottom bar, horizontal scrubber |
| Play/pause | Prominent button left of timeline | Play button left of timeline | Playback controls with keyboard shortcuts | Button left of scrubber |
| Speed control | Available on Android, missing on web (user complaint) | 1x / 2x / 4x presets | 5 preset levels | 3 presets (slow/medium/fast) |
| Time step size | Hours (weather model resolution) | Any (data-driven) | Configurable | 6-hour blocks (matches event data resolution) |
| Current time display | Timestamp above timeline | Timestamp in control bar | Timestamp in slider | Human-readable day + time near scrubber |
| Sidebar/list sync | None (weather app, no list) | Panel updates on filter | List widgets sync when connected to same data source | Sidebar event list filters to current time window |
| Click-through | N/A (weather layers) | Tooltip on hover/click | Info panel on click | Map click -> spatial proximity lookup -> sidebar filter |
| Mode toggle | Layer switcher (wind / rain / etc.) | Layer panel | Layer list | Single toggle button (pins vs heatmap) |
| Loop | Yes | Yes | Configurable | Yes (default on) |

---

## Sources

- [Leaflet.TimeDimension — GitHub (socib)](https://github.com/socib/Leaflet.TimeDimension) — play/pause, scrubber, speed controls, layer integration patterns
- [Leaflet.heat — GitHub (Leaflet)](https://github.com/Leaflet/Leaflet.heat) — heatmap layer API, intensity weighting, setLatLngs for time updates
- [kepler.gl Time Playback — Official Docs](https://docs.kepler.gl/docs/user-guides/h-playback) — 1x/2x/4x speed, window selection, distribution graph UI
- [Timeline Slider — Map UI Patterns](https://mapuipatterns.com/timeline-slider/) — two-knob range vs single-knob scrubber, snapping to human-friendly values, play/pause behavior, Crime Time sidebar integration example
- [ArcGIS Timeline Widget — Experience Builder](https://developers.arcgis.com/experience-builder/guide/timeline-widget/) — timeline filtering applies to connected list widgets via shared data source
- [Animated Heatmap — Socrata / heatmap.js](https://dev.socrata.com/blog/2014/10/01/animated-heatmap.html) — frame-by-frame setLatLngs approach for animation
- [windy.com Community — Speed Control Discussions](https://community.windy.com/topic/10016/time-lapse-speed-control) — confirmed user frustration with fixed speed; validated speed control as expected feature
- [windy.com Community — Timeline Display](https://community.windy.com/topic/25149/how-to-display-the-timeline) — confirmed bottom-bar timeline as standard pattern
- [react-leaflet-heatmap-layer-v3 — npm](https://www.npmjs.com/package/react-leaflet-heatmap-layer-v3) — last published 4 years ago, React 19 compatibility unverified; direct leaflet.heat integration preferred
- [9 Data Visualization Techniques for Temporal Mapping — Map Library](https://www.maplibrary.org/1582/data-visualization-techniques-for-temporal-mapping/) — rolling window, accumulation vs snapshot distinction

---
*Feature research for: Heatmap timelapse mode, East Coast Local v1.1*
*Researched: 2026-03-14*
