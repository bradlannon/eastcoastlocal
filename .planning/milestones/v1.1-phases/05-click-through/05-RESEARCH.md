# Phase 5: Click-Through - Research

**Researched:** 2026-03-14
**Domain:** Leaflet invisible interaction layer + react-leaflet Popup + spatial proximity lookup
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Show a popup on the map at the clicked location (reuse existing VenuePopup pattern)
- Popup shows only events within the current 24-hour time window — consistent with what the heatmap is displaying
- Clicking a hotspot while playing auto-pauses playback — consistent with how drag auto-pauses
- When multiple venues are within the click radius, popup shows all of them
- Events grouped by venue in the popup (Venue A: events, Venue B: events) — not a flat list
- Reuse existing VenuePopup component structure for each venue group
- leaflet.heat has no click events — needs invisible CircleMarker layer

### Claude's Discretion
- Click target radius (fixed pixel vs zoom-dependent)
- Invisible CircleMarker styling (must be truly invisible — no fill, no stroke)
- How the multi-venue popup is styled compared to existing single-venue VenuePopup
- Spatial proximity algorithm for finding nearby venues

### Deferred Ideas (OUT OF SCOPE)
- Zoom-to-location button on event cards — noted for roadmap backlog
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HEAT-03 | User can click a heatmap hotspot to see the specific events at that location | Invisible CircleMarker layer over heatmap canvas intercepts clicks; spatial proximity query finds nearby venues; react-leaflet Popup renders grouped events |
</phase_requirements>

---

## Summary

Phase 5 implements the one remaining heatmap requirement: click-through from hotspot to events. The core challenge is already well-understood from prior research — leaflet.heat renders to a flat canvas with no spatial index, so a click on the canvas cannot identify which heat point was clicked. The solution is a parallel invisible layer of `CircleMarker` elements (one per venue in the current time window) that sit on top of the canvas, intercept click events, perform a spatial proximity query against the time-windowed event dataset, and open a react-leaflet `Popup` showing the results.

All the building blocks exist in the codebase. `computeVenueHeatPoints` already computes per-venue lat/lng for the current time window. `filterByTimeWindow` filters to the 24-hour window. `VenuePopup` renders the event list for a single venue. `handleScrubStart` (already wired) provides the auto-pause pattern. The new component `HeatmapClickLayer` mounts alongside `HeatmapLayer` inside `MapContainer`, receives `allEvents` + `timePosition`, and is the only new component this phase requires.

The popup content for multi-venue clicks needs a thin wrapper (`HeatmapPopup`) that renders one `VenuePopup` per matched venue with a venue name header separator. No new state needs to be lifted to `HomeContent` — the click auto-pause reuses the existing `onScrubStart` callback already threaded through to `MapClient`.

**Primary recommendation:** Build `HeatmapClickLayer` as a react-leaflet component using `useMap()` + a Leaflet map-level click handler (not per-CircleMarker handlers) to keep the invisible marker count irrelevant to event-listener count.

---

## Standard Stack

### Core — Already Installed
| Library | Version in Use | Purpose | Notes |
|---------|---------------|---------|-------|
| react-leaflet | v5 (inferred from `useLayerLifecycle` in PITFALLS.md) | `CircleMarker`, `Popup` JSX components | No new install |
| leaflet | Current | `L.latLng`, `distanceTo` for proximity math | No new install |
| date-fns | Current | `format` for popup date display | Already used in VenuePopup |

### No New Dependencies
This phase requires zero new npm packages. All required capabilities are available:
- `CircleMarker` — in react-leaflet
- `Popup` — in react-leaflet
- `useMap()` — in react-leaflet (for map-level click handler approach)
- `L.latLng().distanceTo()` — in leaflet (Haversine distance, meters)
- `filterByTimeWindow`, `computeVenueHeatPoints` — in `@/lib/timelapse-utils`

---

## Architecture Patterns

### New Component: HeatmapClickLayer

A react-leaflet component placed as a sibling of `HeatmapLayer` inside `MapContainer` in `MapClient.tsx`. Only renders when `mapMode === 'timelapse'`.

**Props:**
```typescript
interface HeatmapClickLayerProps {
  allEvents: EventWithVenue[];      // full unfiltered dataset
  timePosition: number;             // 0-1 scrubber position
  referenceDate: Date;              // same ref date used in page.tsx
  onPause: () => void;              // reuses onScrubStart callback
}
```

**Internal flow:**
1. Derive `timeWindowedEvents = filterByTimeWindow(allEvents, centerMs, 24)` via `useMemo`
2. Group by venue into `Map<venueId, {venue, events[]}>` (same pattern as ClusterLayer)
3. Attach a single map-level click handler via `map.on('click', handler)` in `useEffect`
4. On click: compute distance from click lat/lng to each venue in the time-windowed set; collect venues within radius threshold
5. If matches found: set a state variable `{latlng, venues[]}` to trigger Popup render
6. Call `onPause()` to auto-pause playback

### Popup Render Strategy: Map-Level Click vs Per-Marker Click

Two valid approaches exist:

**Option A: Map-level click handler (recommended)**
```typescript
// Source: Leaflet official docs — map.on('click', e => { e.latlng })
useEffect(() => {
  const handler = (e: L.LeafletMouseEvent) => {
    const nearby = findNearbyVenues(e.latlng, venueGroups, radiusMeters);
    if (nearby.length > 0) {
      setClickState({ latlng: e.latlng, venues: nearby });
      onPause();
    }
  };
  map.on('click', handler);
  return () => { map.off('click', handler); };
}, [map, venueGroups, onPause]);
```
- Pro: One event listener regardless of venue count
- Pro: Handles the "click anywhere near a hotspot" UX correctly
- Con: Fires on every map click including empty ocean — guard with `if (nearby.length > 0)`

**Option B: Invisible CircleMarker per venue (as noted in CONTEXT.md)**
```typescript
// React-leaflet CircleMarker with opacity: 0 and fillOpacity: 0
<CircleMarker
  center={[venue.lat, venue.lng]}
  radius={clickRadiusPx}
  pathOptions={{ opacity: 0, fillOpacity: 0 }}
  eventHandlers={{ click: (e) => handleVenueClick(e, venue) }}
/>
```
- Pro: Native per-element click targeting
- Pro: Click radius visually corresponds to rendered area
- Con: For overlapping venues, only the topmost marker receives the click — requires extra proximity query anyway

**Decision: Use Option A (map-level click).** The map-level handler is simpler, more robust for multi-venue overlap (the explicit decision from CONTEXT.md), and avoids invisible DOM element management. The spatial proximity search is O(n) over ~50-200 Atlantic Canada venues — negligible cost.

### Spatial Proximity Algorithm

Use `L.latLng(clickLat, clickLng).distanceTo(L.latLng(venueLat, venueLng))` which implements Haversine distance and returns meters. This is the correct approach for geographic coordinates.

**Radius threshold — Claude's discretion recommendation:**

A fixed geographic radius of **2km** is appropriate for the Atlantic Canada dataset density. Cities like Halifax and Moncton have venue clusters; 2km captures co-located venues without merging distinct neighborhoods. This is a simpler mental model than pixel-based radius (which changes with zoom).

For comparison:
- 500m: Too tight for rural venues with imprecise geocoding
- 2km: Catches co-located venues, still distinguishes downtown from suburb
- 5km: Merges distinct districts in Halifax

```typescript
// Source: Leaflet official docs — LatLng.distanceTo
const CLICK_RADIUS_METERS = 2000;

function findNearbyVenues(
  clickLatLng: L.LatLng,
  venueGroups: Map<number, { venue: Venue; events: EventWithVenue[] }>,
  radiusMeters: number
): Array<{ venue: Venue; events: EventWithVenue[] }> {
  const results: Array<{ venue: Venue; events: EventWithVenue[] }> = [];
  for (const group of venueGroups.values()) {
    const { lat, lng } = group.venue;
    if (lat == null || lng == null) continue;
    const dist = clickLatLng.distanceTo(L.latLng(lat as number, lng as number));
    if (dist <= radiusMeters) results.push(group);
  }
  return results;
}
```

### New Component: HeatmapPopup

A thin wrapper to render multi-venue popup content. Reuses `VenuePopup` directly for each venue group.

```typescript
interface HeatmapPopupProps {
  venues: Array<{ venue: Venue; events: EventWithVenue[] }>;
}

export default function HeatmapPopup({ venues }: HeatmapPopupProps) {
  if (venues.length === 1) {
    // Single venue: identical to existing VenuePopup — no header needed
    return <VenuePopup venue={venues[0].venue} events={venues[0].events} />;
  }
  return (
    <div className="min-w-[220px] max-w-[280px] space-y-3">
      {venues.map(({ venue, events }) => (
        <div key={venue.id}>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            {venue.name}
          </div>
          <VenuePopup venue={venue} events={events} />
        </div>
      ))}
    </div>
  );
}
```

### Popup Positioning with react-leaflet

A react-leaflet `<Popup>` is positioned by wrapping a `<Marker>` at the click lat/lng, or via `<Popup position={latlng}>` directly (react-leaflet v3+ supports `position` prop on `Popup` without a parent `Marker`).

```typescript
// Source: react-leaflet docs — Popup component
// Popup with explicit position (no parent marker needed)
{clickState && (
  <Popup
    position={clickState.latlng}
    onClose={() => setClickState(null)}
  >
    <HeatmapPopup venues={clickState.venues} />
  </Popup>
)}
```

This is cleaner than the `<Marker><Popup>` pattern used in ClusterLayer because there is no permanent marker to display — only the popup at the click point.

### Recommended Project Structure

No new directories required. Files to create:

```
src/
├── components/
│   └── map/
│       ├── HeatmapClickLayer.tsx    # NEW — invisible click layer + proximity logic
│       └── HeatmapPopup.tsx         # NEW — multi-venue popup content component
```

Files to modify:
- `src/components/map/MapClient.tsx` — add `<HeatmapClickLayer>` alongside `<HeatmapLayer>`
- `src/components/map/MapClientWrapper.tsx` — thread `allEvents` + `onScrubStart` (likely already threaded)
- `src/app/page.tsx` — confirm `referenceDate` is passed through (currently a `useRef` local to `HomeContent`)

### Integration with MapClient

Inside `MapClient.tsx`, add `HeatmapClickLayer` alongside the existing `HeatmapLayer` in the `mapMode === 'timelapse'` block:

```typescript
{mapMode === 'timelapse' && (
  <>
    <HeatmapLayer points={heatPoints ?? []} visible={true} />
    <HeatmapClickLayer
      allEvents={events}
      timePosition={timePosition ?? 0}
      referenceDate={referenceDate}  // needs to be passed as prop (currently useRef in page.tsx)
      onPause={onScrubStart ?? (() => {})}
    />
  </>
)}
```

**Note on `referenceDate`:** Currently `referenceDate` is a `useRef` local to `HomeContent` in `page.tsx`. It needs to be threaded as a prop (as a `Date` value, not the ref itself) down to `HeatmapClickLayer`. Since it never changes after mount, this adds one prop to `MapClientWrapper` and `MapClient` interfaces.

### Anti-Patterns to Avoid

- **Attaching click handler to `heatRef.current`:** `L.HeatLayer` canvas fires no click events. This will silently never fire (confirmed: leaflet.heat GitHub issue #61, open since project start, unresolved).
- **Per-frame proximity recalculation:** Do NOT run `findNearbyVenues` inside the animation loop. Only compute on user click.
- **Rendering CircleMarkers that are truly invisible but still in DOM:** If using Option A (map-level click), no CircleMarker elements are needed at all. Avoid adding DOM nodes unnecessarily.
- **Showing popup while playing:** `onPause()` must be called before setting `clickState` to avoid the time window shifting while popup is open.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geographic distance calculation | Custom lat/lng distance formula | `L.latLng().distanceTo()` | Haversine already implemented, handles edge cases at poles and antimeridian |
| Popup positioning | Custom div overlay positioned with CSS transforms | react-leaflet `<Popup position={latlng}>` | Handles map pan/zoom repositioning, z-index, close button, mobile tap-to-close |
| Event date formatting | Custom formatter | `date-fns` `format()` (already used in VenuePopup) | Already imported, consistent with existing popup |

---

## Common Pitfalls

### Pitfall 1: Click Fires But Popup Appears at Wrong Location (or Never)
**What goes wrong:** The popup position is set to the venue's lat/lng instead of the click lat/lng, causing the popup to jump away from where the user clicked. With multi-venue matches this is especially jarring — there is no single "correct" venue position.
**Why it happens:** Following the ClusterLayer pattern which uses `<Marker position={venue}>` + `<Popup>`. For click-through, the natural anchor is the click point, not the nearest venue.
**How to avoid:** Use `<Popup position={e.latlng}>` directly, not `<Marker position={venue}><Popup>`.
**Warning signs:** Popup appears offset from click point; popup jumps on re-render.

### Pitfall 2: Popup Does Not Close on Mode Switch
**What goes wrong:** User clicks a hotspot (popup opens), then switches to cluster mode. The popup HTML remains visible in the DOM because `clickState` was not cleared.
**Why it happens:** `HeatmapClickLayer` is conditionally rendered on `mapMode === 'timelapse'`. When it unmounts, react-leaflet's Popup managed by that component disappears — but only if state is properly cleaned up.
**How to avoid:** On `HeatmapClickLayer` unmount (in `useEffect` cleanup), clear `clickState` to null. Also clear on the `onClose` Popup callback. The `useEffect` cleanup that removes `map.off('click', handler)` handles the listener, but the Popup element needs explicit dismissal.
**Warning signs:** Popup visible in cluster mode after switching.

### Pitfall 3: Click Radius Too Small at Low Zoom
**What goes wrong:** A fixed geographic radius (2km) covers a large pixel area when zoomed out but a tiny area when zoomed in. Users clicking a hotspot at zoom 8 (all of Atlantic Canada visible) hit a geographically tiny click target.
**Why it happens:** The same geographic radius represents different pixel distances at different zoom levels.
**How to avoid:** At Atlantic Canada's typical usage zoom range (8-14), 2km is a reasonable click target at all zoom levels — verify empirically. If low-zoom clicks miss, increase to 5km or make radius zoom-dependent: `const metersPerPixel = 156543 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom()); const radiusMeters = TARGET_PIXELS * metersPerPixel;`
**Warning signs:** Clicks on visible hotspot return no results.

### Pitfall 4: Time Window Drift Between Click and Display
**What goes wrong:** User clicks a hotspot while playing. The auto-pause fires, but `timePosition` has already advanced one more step before the pause takes effect (async state update). The popup shows events for a slightly different time window than what the heatmap displayed at click time.
**Why it happens:** React state updates are batched and asynchronous. `setIsPlaying(false)` does not immediately halt the interval in the same synchronous frame.
**How to avoid:** Capture `timePosition` at click time (from the prop value passed to the component, which is a snapshot) and use that captured value for the popup's event filtering — not the potentially-updated state. Since `timePosition` is a prop (not state inside `HeatmapClickLayer`), the value at the moment of the click event is always available in the handler closure.
**Warning signs:** Popup shows 0 events for a visibly dense hotspot; events list does not match what heatmap showed.

### Pitfall 5: HeatmapClickLayer Map Listener Not Cleaned Up
**What goes wrong:** `HeatmapClickLayer` unmounts (mode toggle to cluster), but the `map.on('click', handler)` listener is not removed. In cluster mode, clicking the map triggers the stale handler, which attempts to filter events and set state on an unmounted component.
**Why it happens:** Missing `map.off('click', handler)` in `useEffect` cleanup.
**How to avoid:**
```typescript
useEffect(() => {
  map.on('click', handler);
  return () => { map.off('click', handler); };
}, [map, handler]);
```
Always pair `map.on` with `map.off` in cleanup.
**Warning signs:** "Warning: Can't perform a React state update on an unmounted component" in console after toggling to cluster mode and clicking the map.

---

## Code Examples

### Haversine Distance via Leaflet
```typescript
// Source: Leaflet official docs — https://leafletjs.com/reference.html#latlng-distanceto
// Returns distance in meters between two geographic points
const distanceMeters = L.latLng(clickLat, clickLng)
  .distanceTo(L.latLng(venueLat, venueLng));
```

### react-leaflet Popup with explicit position (no parent Marker)
```typescript
// Source: react-leaflet docs — https://react-leaflet.js.org/docs/api-components/#popup
// Popup positioned at click coordinates, not at a marker
import { Popup } from 'react-leaflet';

{clickState && (
  <Popup
    position={clickState.latlng}
    onClose={() => setClickState(null)}
  >
    <HeatmapPopup venues={clickState.venues} />
  </Popup>
)}
```

### Map-level click handler in react-leaflet component
```typescript
// Source: react-leaflet useMap() hook + Leaflet map event API
import { useMap } from 'react-leaflet';
import { useEffect, useCallback } from 'react';

const map = useMap();

useEffect(() => {
  const handler = (e: L.LeafletMouseEvent) => {
    // e.latlng is the geographic click position
    const nearby = findNearbyVenues(e.latlng, venueGroups, CLICK_RADIUS_METERS);
    if (nearby.length === 0) return;
    onPause();
    setClickState({ latlng: e.latlng, venues: nearby });
  };
  map.on('click', handler);
  return () => { map.off('click', handler); };
}, [map, venueGroups, onPause]);
```

### filterByTimeWindow usage for popup content
```typescript
// Source: src/lib/timelapse-utils.ts (existing, verified)
// Derive time-windowed events for popup display
const center = positionToTimestamp(timePosition, referenceDate);
const timeWindowedEvents = filterByTimeWindow(allEvents, center.getTime(), 24);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Attach click to HeatLayer | Map-level click + spatial proximity query | Mandatory: HeatLayer canvas has no click events (GitHub #61, unresolved) |
| Per-marker click handlers | Single map-level handler | Cleaner for multi-venue overlap; one listener regardless of venue count |
| `<Marker><Popup>` pattern | `<Popup position={latlng}>` | Correct for transient click-positioned popups (not persistent venue markers) |

---

## Open Questions

1. **Does `referenceDate` need threading?**
   - What we know: `referenceDate` is currently a `useRef` in `HomeContent`. `positionToTimestamp` needs it. `HeatmapClickLayer` needs to call `positionToTimestamp(timePosition, referenceDate)`.
   - What's unclear: Is `referenceDate.current` passed anywhere today? Checking `MapClientWrapper` props — it is not currently a prop.
   - Recommendation: Pass `referenceDate.current` (the `Date` value, not the ref) as a new prop `referenceDate: Date` through `MapClientWrapper` → `MapClient` → `HeatmapClickLayer`. One additional prop in two interfaces. Alternatively, `HeatmapClickLayer` could call `new Date()` on mount and hold its own ref — acceptable since `referenceDate` in `page.tsx` is also set at mount time and never changes.

2. **`onScrubStart` vs a dedicated `onPause` prop?**
   - What we know: `onScrubStart` is already threaded all the way to `MapClient` and calls `setIsPlaying(false)`. Semantically it means "pause playback."
   - Recommendation: Reuse `onScrubStart` as the pause callback — it's already available in `MapClient`, so no new prop threading is needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `jest.config.ts` (exists at project root) |
| Quick run command | `npm test -- --testPathPattern=heatmap-click` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HEAT-03 | `findNearbyVenues` returns venues within radius threshold | unit | `npm test -- --testPathPattern=heatmap-click` | Wave 0 |
| HEAT-03 | `findNearbyVenues` returns empty array for click far from all venues | unit | `npm test -- --testPathPattern=heatmap-click` | Wave 0 |
| HEAT-03 | `findNearbyVenues` returns multiple venues when both within radius | unit | `npm test -- --testPathPattern=heatmap-click` | Wave 0 |
| HEAT-03 | Click while playing auto-pauses (integration via callback) | manual | n/a — React component interaction | manual-only |
| HEAT-03 | Popup closes when switching to cluster mode | manual | n/a — mode toggle lifecycle | manual-only |

**Note on manual tests:** The interactive behaviors (auto-pause on click, popup lifecycle with mode toggle) require a running browser with Leaflet map. They are covered by the "Looks Done But Isn't" checklist item in PITFALLS.md rather than automated tests.

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=heatmap-click`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/heatmap-click.test.ts` — covers `findNearbyVenues` unit tests (HEAT-03 spatial logic)

The spatial proximity function `findNearbyVenues` is a pure function (takes data, returns data, no Leaflet dependency if extracted to `timelapse-utils.ts`). It should be extracted as a named export from either `timelapse-utils.ts` or its own utility file so it is testable without a DOM environment. This is a key architectural decision: do NOT inline the proximity logic inside the React component — extract it so it can be unit tested with Jest (node environment, no jsdom needed).

---

## Sources

### Primary (HIGH confidence)
- Leaflet official docs — `LatLng.distanceTo()`, map event API (`map.on('click')`), Leaflet reference
- react-leaflet docs — `Popup` component with `position` prop, `useMap()` hook
- Existing codebase: `src/lib/timelapse-utils.ts` — `filterByTimeWindow`, `computeVenueHeatPoints` confirmed working
- Existing codebase: `src/components/map/VenuePopup.tsx`, `ClusterLayer.tsx`, `HeatmapLayer.tsx` — patterns confirmed by direct read
- `.planning/research/PITFALLS.md` Pitfall 8 — leaflet.heat no click events, confirmed via GitHub issue #61

### Secondary (MEDIUM confidence)
- `.planning/phases/05-click-through/05-CONTEXT.md` — locked decisions, confirmed via direct read
- `.planning/phases/04-timelapse-core/04-CONTEXT.md` — established patterns, confirmed via direct read

### Tertiary (LOW confidence)
- None — all critical claims verified from codebase or official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing libraries already in use
- Architecture: HIGH — patterns (useMap, Popup, map.on/off) verified from react-leaflet docs and existing codebase
- Spatial logic: HIGH — `L.latLng().distanceTo()` is standard Leaflet Haversine, well-documented
- Pitfalls: HIGH — all pitfalls previously documented in PITFALLS.md with source citations; new pitfalls derived from codebase structure

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (react-leaflet and leaflet APIs are stable; leaflet.heat is unmaintained so no breaking changes expected)
