# Architecture Research

**Domain:** Heatmap timelapse mode — integration with existing react-leaflet split-screen app
**Researched:** 2026-03-14
**Confidence:** HIGH (based on direct codebase inspection + react-leaflet 5.x core API verification)

> This document supersedes the initial v1.0 architecture file. It retains the scraping/data-layer sections and adds a focused integration design for the v1.1 heatmap timelapse milestone.

---

## Existing Architecture (Verified from Codebase)

### Current Component Tree

```
page.tsx (HomeContent — client component)
├── <header>
├── <EventFilters>          ← nuqs: ?when, ?province
├── <MapClientWrapper>      ← dynamic import (ssr: false) → MapClient
│   └── <MapContainer>      ← react-leaflet root
│       ├── <TileLayer>     ← CartoDB Positron
│       ├── <MapBoundsTracker>   ← fires onBoundsChange on move/zoom
│       ├── <ClusterLayer>       ← MarkerClusterGroup + Marker + Popup
│       ├── <GeolocationButton>
│       └── <MapViewController> ← province fly-to, marker open-popup
└── <EventList>             ← receives visibleEvents (client-filtered)
```

### Current Data Flow

```
mount
  ↓
fetch('/api/events')               — loads ALL future events once
  ↓
allEvents (EventWithVenue[])       — held in HomeContent state
  ↓
filterByDateRange(allEvents, when) — nuqs ?when param
filterByProvince(..., province)    — nuqs ?province param
filterByBounds(..., bounds)        — map viewport (MapBoundsTracker → setBounds)
  ↓
visibleEvents                      — passed to EventList
allEvents                          — passed to MapClientWrapper (cluster layer shows all)
```

Key: the map always shows `allEvents` unfiltered (clustering handles density). The sidebar shows `visibleEvents` (date + province + viewport filtered).

### State Inventory (HomeContent)

| State | Type | Owner | How Updated |
|-------|------|-------|-------------|
| `allEvents` | `EventWithVenue[]` | `useState` | fetch on mount |
| `bounds` | `Bounds \| null` | `useState` | MapBoundsTracker callback |
| `activeTab` | `'map' \| 'list'` | `useState` | MobileTabBar |
| `loading` | `boolean` | `useState` | fetch completion |
| `highlightedVenueId` | `number \| null` | `useState` | EventList hover |
| `flyToTarget` | `FlyToTarget \| null` | `useState` | EventList click |
| `when` | `string \| null` | nuqs URL | EventFilters |
| `province` | `string \| null` | nuqs URL | EventFilters |

---

## Heatmap Timelapse Integration Design

### Overview of New Feature

The timelapse mode overlays a density heatmap on the map, controlled by a timeline scrubber. The scrubber represents a sliding 24-hour window across a 30-day range. As the window moves (manually or auto-played), the heatmap updates to show event density within that window, and the sidebar event list syncs to show only events in the window.

The existing cluster pin view is toggled off when timelapse mode is active. Both layers coexist inside the same `MapContainer` but only one is visible at a time.

### Revised Component Tree

```
page.tsx (HomeContent)
├── <header>
│   └── <ModeToggle>             ← NEW: "Map" / "Timelapse" toggle
├── <EventFilters>               ← MODIFIED: hidden in timelapse mode
├── <TimelineBar>                ← NEW: only rendered in timelapse mode
│   ├── <TimelineScrubber>       ← input[type=range] controlling timePosition
│   └── <PlayPauseButton>
├── <MapClientWrapper>           ← MODIFIED: receives mode + timeWindow props
│   └── <MapContainer>
│       ├── <TileLayer>
│       ├── <MapBoundsTracker>
│       ├── <ClusterLayer>       ← MODIFIED: hidden (display:none) in timelapse mode
│       ├── <HeatmapLayer>       ← NEW: only active in timelapse mode
│       ├── <GeolocationButton>
│       └── <MapViewController>
└── <EventList>                  ← MODIFIED: filters to timeWindow in timelapse mode
```

### New State Added to HomeContent

| State | Type | Why Here |
|-------|------|----------|
| `mapMode` | `'cluster' \| 'timelapse'` | Controls which layer + UI branch renders |
| `timePosition` | `number` (0–1 float) | Normalized scrubber position; drives time window |
| `isPlaying` | `boolean` | Auto-advance animation on/off |

`timePosition` is a normalized float (0 = start of 30-day window, 1 = end). The actual timestamp is derived as:

```typescript
// lib/timelapse-utils.ts
export const TIMELAPSE_WINDOW_DAYS = 30;
export const TIMELAPSE_WINDOW_HOURS = 24;

export function positionToTimestamp(position: number, now: Date): Date {
  const rangeMs = TIMELAPSE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + position * rangeMs);
}

export function filterByTimeWindow(
  events: EventWithVenue[],
  centerMs: number,
  windowHours: number
): EventWithVenue[] {
  const halfMs = (windowHours / 2) * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = new Date(e.events.event_date).getTime();
    return t >= centerMs - halfMs && t <= centerMs + halfMs;
  });
}
```

**Do not put `timePosition` or `isPlaying` in the URL.** nuqs is the right tool for shareable persistent state (filters, province). Timelapse is ephemeral UI state — using URL for it would cause excessive history entries during playback and break the back button. Keep it in `useState`.

### Heatmap Layer Integration

#### Library Recommendation: Custom hook wrapping `leaflet.heat` directly

The existing wrapper packages (`react-leaflet-heatmap-layer`, `react-leaflet-heatmap-layer-v3`) target react-leaflet v3/v4 and have peer dependency conflicts with React 19 and react-leaflet 5.x. They are also unmaintained forks with low adoption.

The correct approach for react-leaflet 5.x is a custom component using `useMap` + `useEffect`:

```typescript
// components/map/HeatmapLayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';

// leaflet.heat augments L with L.heatLayer
// Import is side-effectful — must be inside the SSR-bypassed bundle
import 'leaflet.heat';

interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number; // 0–1
}

interface HeatmapLayerProps {
  points: HeatPoint[];
  visible: boolean;
}

export default function HeatmapLayer({ points, visible }: HeatmapLayerProps) {
  const map = useMap();
  const heatRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    // @ts-expect-error leaflet.heat augments L at runtime
    heatRef.current = L.heatLayer([], {
      radius: 35,
      blur: 20,
      maxZoom: 12,
      gradient: { 0.2: '#3b82f6', 0.5: '#f59e0b', 0.8: '#ef4444' },
    });

    return () => {
      heatRef.current?.remove();
      heatRef.current = null;
    };
  }, [map]); // only create/destroy once

  useEffect(() => {
    if (!heatRef.current) return;
    if (!visible) {
      heatRef.current.remove();
      return;
    }
    const latlngs = points.map((p) => [p.lat, p.lng, p.intensity] as [number, number, number]);
    heatRef.current.setLatLngs(latlngs);
    if (!map.hasLayer(heatRef.current)) {
      heatRef.current.addTo(map);
    }
    heatRef.current.redraw();
  }, [map, points, visible]);

  return null;
}
```

The `leaflet.heat` package (npm: `leaflet.heat`) is a stable ~4KB plugin from the Leaflet organization. It does not have React dependencies — it's a pure Leaflet plugin. Add `@types/leaflet.heat` (or write a local declaration) for TypeScript. Total install: `npm install leaflet.heat`.

`HeatmapLayer` must remain inside the SSR-bypassed `MapClient` component (already `'use client'` and loaded via `dynamic(..., { ssr: false })`), so `leaflet.heat`'s `window` dependency is safe.

#### Heatmap Point Computation

Heatmap points are derived client-side from `allEvents` filtered to the current time window. No new API endpoint is needed.

```typescript
// In HomeContent or a useMemo hook
const heatPoints = useMemo(() => {
  if (mapMode !== 'timelapse') return [];
  const center = positionToTimestamp(timePosition, referenceDate);
  const windowed = filterByTimeWindow(allEvents, center.getTime(), TIMELAPSE_WINDOW_HOURS);
  return computeVenueHeatPoints(windowed); // groups by venue, intensity = event count normalized
}, [mapMode, timePosition, allEvents]);
```

Intensity normalizes event count at a venue to 0–1 relative to the busiest venue in the current window. This avoids single-event venues dominating the heatmap.

#### Click-Through from Heatmap

`leaflet.heat` does not support click events on individual heat points — it renders to a canvas. Click-through requires a secondary transparent marker layer:

- When timelapse mode is active, render invisible `<CircleMarker>` components at each venue position (radius 20px, `opacity: 0`, `fillOpacity: 0`).
- These markers receive click events and open a popup with the venue's events in the current time window.
- This is a separate `<HeatmapClickLayer>` component with its own marker list derived from the same `heatPoints` array.

### Timeline Scrubber Component

```
<TimelineBar>                        — fixed/sticky bar above the map
├── <PlayPauseButton>                — toggles isPlaying
├── <input type="range" />           — timePosition (0–1), step 0.001
└── <TimeLabel>                      — displays current window as "Sat Mar 14 · 8pm–8pm"
```

**Placement:** Positioned as an overlay anchored to the bottom of the map panel, inside the map's `relative` div (already `z-[1000]` capable). This mirrors how weather apps like windy.tv position the timeline. It should NOT be inside `MapContainer` (not a Leaflet component) — it lives in the `MapClient` sibling wrapper div.

**Auto-play:** Use `setInterval` (not `requestAnimationFrame`) for the advance tick. A 200ms interval advancing `timePosition` by 0.005 per tick gives a ~40-second full playback at 30 days. Store the interval ref in `useRef`. Start/stop in `useEffect` gated on `isPlaying`.

```typescript
// In HomeContent
const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  if (isPlaying) {
    playRef.current = setInterval(() => {
      setTimePosition((p) => {
        if (p >= 1) { setIsPlaying(false); return 1; }
        return Math.min(p + 0.005, 1);
      });
    }, 200);
  }
  return () => {
    if (playRef.current) clearInterval(playRef.current);
  };
}, [isPlaying]);
```

### Mode Toggle

A toggle button ("Map" / "Timelapse") lives in the header or just above the filter bar. It sets `mapMode`. On toggle to timelapse:

1. `EventFilters` is hidden (timelapse has its own time dimension; the date chips would conflict).
2. `TimelineBar` appears.
3. `ClusterLayer` receives `visible={false}` (or is conditionally not rendered).
4. `HeatmapLayer` receives `visible={true}`.

On toggle back to cluster mode:

1. `TimelineBar` unmounts.
2. `isPlaying` resets to false.
3. `timePosition` resets to 0.
4. Normal filter bar reappears.

### Sidebar List Filtering by Time Window

In timelapse mode, `visibleEvents` (currently: date + province + viewport filtered) is replaced by time-window filtered events:

```typescript
// HomeContent filter chain (mode-aware)
const sidebarEvents = useMemo(() => {
  if (mapMode === 'timelapse') {
    const center = positionToTimestamp(timePosition, referenceDate);
    const windowed = filterByTimeWindow(allEvents, center.getTime(), TIMELAPSE_WINDOW_HOURS);
    return filterByBounds(windowed, bounds); // still filter by viewport
  }
  // Normal cluster mode
  const dateFiltered = filterByDateRange(allEvents, when);
  const provinceFiltered = filterByProvince(dateFiltered, province);
  return filterByBounds(provinceFiltered, bounds);
}, [mapMode, timePosition, allEvents, when, province, bounds]);
```

`EventList` receives `sidebarEvents` regardless of mode. No changes needed inside `EventList` itself.

---

## System Overview: With Timelapse Mode Added

```
┌─────────────────────────────────────────────────────────────────┐
│                      page.tsx (HomeContent)                      │
│                                                                   │
│  State: allEvents, bounds, mapMode, timePosition, isPlaying,     │
│         highlightedVenueId, flyToTarget, when, province (nuqs)   │
│                                                                   │
│  ┌──────────────┐    ┌────────────────────────────────────┐      │
│  │  ModeToggle  │    │         EventFilters               │      │
│  │ cluster|heat │    │  (hidden in timelapse mode)        │      │
│  └──────────────┘    └────────────────────────────────────┘      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │   TimelineBar (only in timelapse mode)                   │    │
│  │   PlayPause · Scrubber (0–1) · TimeLabel                 │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────┐  ┌─────────────────────────┐  │
│  │  MapClientWrapper            │  │  EventList               │  │
│  │  (dynamic, ssr:false)        │  │  (sidebarEvents)         │  │
│  │                              │  │                          │  │
│  │  ┌──────────────────────┐    │  │  cluster mode:           │  │
│  │  │  MapContainer        │    │  │    date+province+bounds  │  │
│  │  │  ├ TileLayer         │    │  │  timelapse mode:         │  │
│  │  │  ├ MapBoundsTracker  │    │  │    time window + bounds  │  │
│  │  │  ├ ClusterLayer      │    │  └─────────────────────────┘  │
│  │  │  │  (hidden in heat) │    │                               │
│  │  │  ├ HeatmapLayer      │    │                               │
│  │  │  │  (hidden in clust)│    │                               │
│  │  │  ├ HeatmapClickLayer │    │                               │
│  │  │  ├ GeolocationButton │    │                               │
│  │  │  └ MapViewController │    │                               │
│  │  └──────────────────────┘    │                               │
│  │  ┌──────────────────────┐    │                               │
│  │  │  TimelineBar overlay │    │                               │
│  │  │  (inside map div,    │    │                               │
│  │  │   z-index above map) │    │                               │
│  │  └──────────────────────┘    │                               │
│  └──────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown: New vs Modified

### New Components

| Component | File | Responsibility |
|-----------|------|---------------|
| `HeatmapLayer` | `components/map/HeatmapLayer.tsx` | Wraps `leaflet.heat` imperatively; accepts `points[]` + `visible` |
| `HeatmapClickLayer` | `components/map/HeatmapClickLayer.tsx` | Invisible CircleMarkers at venue positions for click events |
| `TimelineBar` | `components/timelapse/TimelineBar.tsx` | Scrubber + play/pause + time label; receives `timePosition` + setters |
| `ModeToggle` | `components/layout/ModeToggle.tsx` | Button switching `mapMode` between `'cluster'` and `'timelapse'` |
| `timelapse-utils.ts` | `lib/timelapse-utils.ts` | Pure functions: position→timestamp, filterByTimeWindow, computeVenueHeatPoints |

### Modified Components

| Component | Change |
|-----------|--------|
| `MapClient.tsx` | Add `mapMode`, `heatPoints`, `timeWindow` props; render `HeatmapLayer` and `HeatmapClickLayer` conditionally; render `ClusterLayer` only in cluster mode; accept and render `TimelineBar` overlay in timelapse mode |
| `MapClientWrapper.tsx` | Pass through new props (`mapMode`, `heatPoints`) |
| `page.tsx` (HomeContent) | Add `mapMode`, `timePosition`, `isPlaying` state; add play interval; compute `heatPoints` via `useMemo`; compute `sidebarEvents` with mode-aware filter chain; render `ModeToggle` and `TimelineBar`; conditionally render `EventFilters` |
| `EventFilters.tsx` | Accept `hidden` prop or be conditionally rendered by parent (no internal changes required) |

### Unchanged Components

| Component | Why Unchanged |
|-----------|--------------|
| `EventList.tsx` | Already accepts any `EventWithVenue[]`; no changes needed |
| `EventCard.tsx` | No changes needed |
| `MapBoundsTracker.tsx` | Works in both modes |
| `MapViewController.tsx` | Works in both modes |
| `ClusterLayer.tsx` | No changes needed — parent conditionally renders it |
| `MobileTabBar.tsx` | No changes needed |
| `/api/events` route | No new endpoint required — all filtering is client-side |
| DB schema | No changes required |

---

## Data Flow: Timelapse Mode

```
allEvents (already loaded on mount — no new fetch)
    ↓
timePosition (0–1 float from scrubber or interval)
    ↓
positionToTimestamp(timePosition, referenceDate)
    → centerTimestamp: Date
    ↓
filterByTimeWindow(allEvents, centerTimestamp.getTime(), 24h)
    → windowedEvents: EventWithVenue[]
    ↓
    ├─→ computeVenueHeatPoints(windowedEvents)
    │       → heatPoints: { lat, lng, intensity }[]
    │       → passed to HeatmapLayer (updates setLatLngs + redraw)
    │       → passed to HeatmapClickLayer (invisible markers for clicks)
    │
    └─→ filterByBounds(windowedEvents, bounds)
            → sidebarEvents
            → passed to EventList
```

The `referenceDate` is captured once on mount (`useRef(new Date())`). This anchors the 30-day window relative to when the user loaded the page, preventing drift if the component re-renders.

---

## Architectural Patterns

### Pattern 1: Imperative Leaflet Plugin Wrapping

**What:** For vanilla Leaflet plugins that have no react-leaflet wrapper, use `useMap()` + `useEffect()` inside a component that renders `null`. Create the layer in a mount effect, update it in a data-change effect, destroy in cleanup.

**When to use:** Any third-party Leaflet plugin — `leaflet.heat`, `leaflet-velocity`, etc.

**Trade-offs:** More boilerplate than a packaged wrapper, but zero dependency risk and full control over update behavior. The existing codebase already does this pattern in `MapBoundsTracker` and `MapViewController`.

**Example:** See `HeatmapLayer.tsx` snippet above.

### Pattern 2: Mode-Aware Conditional Rendering Inside MapContainer

**What:** Render both `ClusterLayer` and `HeatmapLayer` inside `MapContainer`, but control which is active via a `visible` prop or conditional rendering. Do not unmount/remount `MapContainer` to switch modes — that destroys the map instance and resets zoom/pan.

**When to use:** Any feature that needs to switch between two map visualization modes.

**Trade-offs:** Both layers exist in the component tree simultaneously, so both receive prop updates. The inactive layer should early-return its update effect to avoid unnecessary Leaflet operations.

### Pattern 3: Client-Side Time Windowing (No New API Endpoint)

**What:** All 30 days of events are already fetched in `allEvents` on mount. Time windowing is a `useMemo` filter — no new server round-trip needed.

**When to use:** When the total dataset fits comfortably in memory. The current Atlantic Canada dataset is small (hundreds to a few thousand events). A 30-day window at full load is well within browser memory limits.

**Trade-offs:** If the dataset grows to tens of thousands of events, this approach will cause UI lag during scrubbing. At that scale, add a server-side endpoint `GET /api/events?from=...&to=...` for time-windowed queries. This is not needed for v1.1.

### Pattern 4: Scrubber Position as Normalized Float

**What:** Represent time position as a 0–1 float rather than an actual timestamp or millisecond offset. The `input[type=range]` maps directly to this float. All timestamp math is derived from this float + a fixed reference date.

**When to use:** Any scrubber/slider controlling a time dimension.

**Trade-offs:** Decouples the UI control from time domain specifics. Makes it easy to change the window size or range without touching the scrubber component. Slightly harder to reason about when debugging (log `positionToTimestamp(pos)` not `pos`).

---

## Anti-Patterns

### Anti-Pattern 1: Putting `timePosition` in the URL

**What people do:** Use nuqs to store the scrubber position in `?t=0.42`.
**Why it's wrong:** During auto-play, position updates 5 times per second. History API calls at that rate hit browser rate limits (Chrome limits to ~100 pushState calls per 30 seconds). nuqs's `throttleMs` mitigates this partially but the URL becomes polluted and the back button behaves unexpectedly.
**Do this instead:** Keep `timePosition` in `useState`. Only share things in the URL that make sense to bookmark or share — the time position at the moment of sharing is not meaningful.

### Anti-Pattern 2: Unmounting MapContainer to Switch Modes

**What people do:** Conditionally render `<ClusterMapContainer>` vs `<HeatmapMapContainer>` based on mode.
**Why it's wrong:** Destroys and recreates the Leaflet map instance on every toggle. The map resets to initial zoom/center, all event listeners are lost, and there's a flash of unstyled content.
**Do this instead:** One `MapContainer`, two layers inside it, one visible at a time.

### Anti-Pattern 3: Fetching a New API Endpoint for Time-Windowed Data

**What people do:** Add `GET /api/events?from=...&to=...` and hit it on every scrubber move.
**Why it's wrong:** During scrubbing or playback, time position changes tens of times per second. Each change would trigger a network request. The scrubber would feel laggy and server load would spike.
**Do this instead:** Load all data once, filter client-side with `filterByTimeWindow`.

### Anti-Pattern 4: Using `requestAnimationFrame` for the Play Loop

**What people do:** Drive the timelapse animation with `requestAnimationFrame` for smooth 60fps updates.
**Why it's wrong:** At 60fps, React state updates (`setTimePosition`) would fire 60 times per second. Each update re-renders `HomeContent`, recomputes `heatPoints` via `useMemo`, and calls `setLatLngs` + `redraw` on the heat layer. This causes heavy CPU usage and jank.
**Do this instead:** `setInterval` at 200ms (5fps). The heatmap is a density visualization — 5fps playback is smooth enough and reduces CPU by 12x.

### Anti-Pattern 5: Computing Heat Points Inside HeatmapLayer

**What people do:** Pass all events to `HeatmapLayer` and let it filter + compute internally.
**Why it's wrong:** `HeatmapLayer` is a Leaflet-layer component inside `MapContainer`. It should not own filtering logic. Placing business logic inside map components makes them harder to test and creates tight coupling.
**Do this instead:** Compute `heatPoints` in `HomeContent` via `useMemo`. Pass the already-computed `{ lat, lng, intensity }[]` array to `HeatmapLayer`. The layer is dumb — it only calls Leaflet APIs.

---

## Build Order for Timelapse Milestone

Dependencies flow strictly downward — each item can only start when the items above it are done.

```
1. lib/timelapse-utils.ts
   Pure functions. No dependencies. Build and test first.
   Covers: positionToTimestamp, filterByTimeWindow, computeVenueHeatPoints

2. HeatmapLayer.tsx
   Depends on: leaflet.heat npm install, timelapse-utils (for HeatPoint type)
   Can be developed in isolation with hardcoded test points.
   No UI, no state — just a Leaflet layer wrapper.

3. TimelineBar.tsx + ModeToggle.tsx
   Depends on: nothing (pure UI, receives props/callbacks)
   Build with hardcoded/stubbed props first.

4. HeatmapClickLayer.tsx
   Depends on: react-leaflet CircleMarker (already installed)
   Thin component — invisible markers at venue coordinates.

5. HomeContent wiring (page.tsx)
   Depends on: all of the above
   Add mapMode, timePosition, isPlaying state.
   Wire ModeToggle → mapMode.
   Wire TimelineBar ↔ timePosition, isPlaying.
   Wire heatPoints useMemo.
   Wire sidebarEvents mode-aware filter chain.
   Pass new props to MapClientWrapper.

6. MapClient.tsx + MapClientWrapper.tsx prop threading
   Depends on: HomeContent wiring complete
   Add mapMode, heatPoints, timeWindow props.
   Conditionally render ClusterLayer / HeatmapLayer / HeatmapClickLayer.
   Position TimelineBar overlay inside the map div.

7. Integration testing
   Test: mode toggle shows/hides correct UI
   Test: scrubber updates heatmap and sidebar simultaneously
   Test: auto-play advances, stops at end
   Test: heatmap click opens correct popup
   Test: mobile tab bar still works in both modes
```

---

## Integration Points

### New Library Integration

| Library | How Integrated | Notes |
|---------|---------------|-------|
| `leaflet.heat` | Installed as npm dep; imported side-effectively inside `HeatmapLayer.tsx` | `leaflet.heat` patches `L` at import time. Must be inside the `ssr:false` dynamic import boundary. Add a `.d.ts` shim or `@types/leaflet.heat` if available. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `HomeContent` ↔ `MapClientWrapper` | Props: `mapMode`, `heatPoints`, `timeWindow` added to existing interface | `MapClientWrapper` passes through to `MapClient` |
| `HomeContent` ↔ `TimelineBar` | Props: `timePosition`, `isPlaying`, `onPositionChange`, `onPlayPause` | `TimelineBar` is outside `MapContainer` — no Leaflet context |
| `HeatmapLayer` ↔ Leaflet | Imperative: `useMap()` + `useEffect()` | Layer added/removed directly to map instance |
| `HeatmapLayer` ↔ `HeatmapClickLayer` | Sibling components sharing the same `heatPoints` prop from parent | No direct coupling between them |

### Unchanged Integration Points

| Boundary | Status |
|----------|--------|
| `/api/events` → `HomeContent` | Unchanged — same fetch, same data shape |
| `nuqs` URL state (`when`, `province`) | Unchanged — still used in cluster mode |
| `MapBoundsTracker` → `setBounds` | Unchanged — bounds still used for sidebar filtering in both modes |
| `EventList` ↔ `EventCard` | Unchanged — no mode awareness needed in list components |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (<5k events) | Client-side time window filter with useMemo — no server changes needed |
| 5k–50k events | Add `GET /api/events?from=...&to=...` endpoint; fetch only on scrubber release (not during drag), debounce 300ms |
| 50k+ events | Server-side spatial aggregation for heatmap (return pre-binned grid, not individual points); use Postgres `ST_SnapToGrid` or application-level geohash bucketing |

The current Atlantic Canada scope is unlikely to exceed 5k future events for years. Build for the current scale; the API endpoint approach is a documented escape hatch, not a v1.1 requirement.

---

## Sources

- Direct codebase inspection: `src/components/map/`, `src/app/page.tsx`, `src/app/api/events/route.ts`, `src/lib/filter-utils.ts`, `package.json` — HIGH confidence
- [React Leaflet 5.x Core Architecture](https://react-leaflet.js.org/docs/core-architecture/) — useLeafletContext, createElementHook, useLayerLifecycle — HIGH confidence
- [Leaflet.heat GitHub (Leaflet org)](https://github.com/Leaflet/Leaflet.heat) — plugin API, setLatLngs, redraw — HIGH confidence
- [Creating a React-Leaflet Custom Component Using Hooks (Medium/Trabe)](https://medium.com/trabe/creating-a-react-leaflet-custom-component-using-hooks-5b5b905d5a01) — useMap + useEffect pattern for imperative layer wrapping — MEDIUM confidence
- [nuqs GitHub (47ng/nuqs)](https://github.com/47ng/nuqs) — throttleMs, debounce, URL state management — HIGH confidence
- `react-leaflet-heat-layer` (LockBlock-dev) — inspected, targets react-leaflet v4 only, last commit July 2024, 3 commits total — LOW confidence (used as negative signal; not recommended)

---

*Architecture research for: Heatmap timelapse mode integration — East Coast Local v1.1*
*Researched: 2026-03-14*
