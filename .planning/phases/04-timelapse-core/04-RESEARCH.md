# Phase 4: Timelapse Core - Research

**Researched:** 2026-03-14
**Domain:** leaflet.heat heatmap layer, React animation loop patterns, timeline scrubber UI, mode-aware filter chain
**Confidence:** HIGH — all findings drawn from direct codebase inspection + prior project research files (ARCHITECTURE.md, PITFALLS.md, STACK.md) which were verified against official sources

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Heatmap library:** `leaflet.heat` via custom `useMap()` component (no wrapper packages)
- **Scrubber placement:** Bottom of map panel, semi-transparent frosted glass overlay (like windy.tv)
- **Heatmap color:** Blue-to-red classic gradient; single event creates a visible warm spot; radius scales with zoom
- **Cluster visibility:** Pin clusters hidden in heatmap mode — clean heatmap only
- **Mode toggle:** Floating icon button top-right on map (consistent with GeolocationButton pattern)
- **Time blocks:** 6-hour blocks (Morning/Afternoon/Evening/Night); ~1s per step (setInterval at ~1000ms)
- **Playback behavior:** Stops at end, does not loop; dragging scrubber auto-pauses
- **Time position state:** React `useState` only — NEVER nuqs (History API rate-limit concern)
- **Heatmap update method:** `setLatLngs()` for smooth updates (no layer re-creation)
- **Province filters:** Still apply in heatmap mode (heatmap shows only filtered province events)
- **Scrubber element:** Native `<input type="range">` (WCAG 2.5.7 accessibility requirement)

### Claude's Discretion

- Exact frosted glass CSS approach (backdrop-blur, opacity)
- Exact icon for heatmap toggle button
- Layout of elements within the scrubber bar (date left, play center, count right, or similar)
- Transition animation when entering/exiting heatmap mode

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HEAT-01 | User can see a heatmap overlay on the map showing event density by location | HeatmapLayer.tsx using leaflet.heat 0.2.0 via custom useMap() hook; heatPoints computed via useMemo in HomeContent |
| HEAT-02 | Heatmap intensity reflects the number of events at each venue within the current time window | computeVenueHeatPoints() normalizes event count per venue to 0–1 intensity; passed as [lat,lng,intensity][] to HeatmapLayer |
| HEAT-04 | Heatmap updates smoothly in-place as the time position changes (no flicker) | setLatLngs() reuses existing canvas element; no layer teardown on each scrub tick |
| TIME-01 | User can drag a scrubber bar to move through a 30-day window of events | Native input[type=range] controlling timePosition (0–1 normalized float); 120 steps (30 days × 4 blocks/day) |
| TIME-02 | Each scrubber position shows events within a 24-hour rolling window | filterByTimeWindow() applies ±12h window around positionToTimestamp(timePosition); sidebarEvents and heatPoints both derived from same windowedEvents |
| TIME-03 | User can see the current date/time label showing what window is displayed | TimelineBar displays formatted date + 6-hour block name ("Fri Mar 14 — Evening") derived from positionToTimestamp() |
| TIME-04 | User can play/pause to auto-advance the scrubber through time | setInterval at 1000ms advances timePosition by 1/120 per step; stored in useRef; cleared in useEffect cleanup |
| MODE-01 | User can toggle between pin/cluster view and heatmap timelapse view | ModeToggle button sets mapMode state in HomeContent; ClusterLayer conditionally rendered; HeatmapLayer conditionally active |
| MODE-02 | Event list sidebar updates to show only events within the current 24-hour time window | sidebarEvents computed via mode-aware useMemo in HomeContent; EventList receives sidebarEvents unchanged |
| MODE-03 | Map viewport (zoom/pan) is preserved when switching between modes | Single MapContainer instance — never unmount/remount; only layer visibility changes |
</phase_requirements>

---

## Summary

Phase 4 builds the complete heatmap timelapse mode on top of the existing v1.0 map foundation. All decisions are locked. The implementation adds one new npm package (`leaflet.heat`), five new source files, and modifies three existing files. No new API endpoints, database changes, or server infrastructure are required — all time-window filtering is client-side.

The highest-risk item is SSR build safety. `leaflet.heat` calls `window` at module evaluation time and will break `next build` if imported at module top level. The first task of this phase must be to install and wire `HeatmapLayer.tsx` with a dynamic import guard, then verify `next build` passes before any animation logic is written. All subsequent work is gated on that build passing.

The second risk is the animation loop memory leak. The `setInterval` ref must live in a `useRef`, cleanup must run in `useEffect` return, and Leaflet's `map.removeLayer()` must be called in `HeatmapLayer`'s cleanup. These are not optional polish items — skipping them causes ghost layers and CPU drain on mode toggle.

The existing codebase is already well-structured for this work. `HomeContent` already owns all state and passes derived data down; adding `mapMode`, `timePosition`, and `isPlaying` follows the same pattern. The `GeolocationButton` component provides the exact floating button pattern to reuse for `ModeToggle`. The `filterByBounds`, `filterByProvince`, and `filterByDateRange` chain has a clear extension point for the mode-aware branch.

**Primary recommendation:** Build in strict dependency order — pure utils first, HeatmapLayer + SSR verification second, UI components third, HomeContent wiring fourth, prop threading last. Do not skip ahead.

---

## Standard Stack

### Core (already installed — no new installs except leaflet.heat)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-leaflet | 5.0.0 | Map base; provides `useMap()` hook | Already in use; `useMap()` is the only correct way to access the Leaflet map instance from a React component inside `MapContainer` |
| leaflet | 1.9.4 | Leaflet peer dep; `leaflet.heat` patches `L` | Already installed; do NOT upgrade to 2.x |
| date-fns | 4.x | Timestamp math for time window calculation | Already installed; use for positionToTimestamp formatting and filterByTimeWindow logic |
| Tailwind CSS | 4.x | Scrubber overlay styling, frosted glass | Already in project globals.css |

### New Install Required

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| leaflet.heat | 0.2.0 | Canvas heatmap layer | Official Leaflet-org plugin; `setLatLngs()` updates canvas in-place without DOM re-creation; confirmed compatible with leaflet 1.9.x |
| @types/leaflet.heat | 0.2.5 | TypeScript types for L.HeatLayer | Published 2025-09-03; declares `L.HeatLayer` on Leaflet namespace; dev dep only |

**Installation:**
```bash
npm install leaflet.heat
npm install -D @types/leaflet.heat
```

No other new packages needed. Native `<input type="range">` for scrubber (no scrubber library), `setInterval` for animation loop (no animation library), `Array.filter` for time windowing (no data processing library).

### What NOT to Use

| Avoid | Why |
|-------|-----|
| `react-leaflet-heatmap-layer-v3` | Peer dep `react-leaflet@^3.0.0` — incompatible with v5 |
| `react-leaflet-heat-layer` | Published July 2024, thin wrapper adds dependency risk for a 10-line integration |
| `react-leaflet-heatmap-layer` | Published 2022, targets react-leaflet v3 |
| `requestAnimationFrame` for play loop | 60fps → 60 React re-renders/sec; heatmap redraw overhead causes jank; `setInterval` at 1000ms is correct |
| Custom div scrubber | Keyboard inaccessible; fails WCAG 2.5.7; native range input styles with Tailwind |
| nuqs for timePosition | History API rate-limit at ~100 pushState/30s; animation fires every 1000ms for 120 steps; confirmed in nuqs source |

---

## Architecture Patterns

### New File Locations

```
src/
├── components/
│   ├── map/
│   │   ├── HeatmapLayer.tsx        # NEW: useMap() + leaflet.heat imperative wrapper
│   │   └── ModeToggle.tsx          # NEW: floating icon button, top-right of map
│   ├── timelapse/
│   │   └── TimelineBar.tsx         # NEW: scrubber overlay + play/pause + time label
│   └── [events/, layout/ unchanged]
└── lib/
    └── timelapse-utils.ts          # NEW: pure functions (no deps, fully testable)
```

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/app/page.tsx` (HomeContent) | Add `mapMode`, `timePosition`, `isPlaying` state; setInterval play loop; heatPoints useMemo; mode-aware sidebarEvents; render ModeToggle + TimelineBar |
| `src/components/map/MapClient.tsx` | Accept `mapMode`, `heatPoints`, `onModeToggle` props; render HeatmapLayer; conditionally hide ClusterLayer; position TimelineBar overlay inside map div |
| `src/components/map/MapClientWrapper.tsx` | Thread new props through to MapClient |

### Unchanged Files (no modifications needed)

`EventList.tsx`, `EventCard.tsx`, `ClusterLayer.tsx`, `MapBoundsTracker.tsx`, `MapViewController.tsx`, `MobileTabBar.tsx`, `/api/events` route, DB schema.

---

### Pattern 1: Imperative Leaflet Plugin Wrapping (useMap + useEffect)

**What:** For Leaflet plugins without a react-leaflet wrapper, create the layer imperatively in `useEffect`, update it in a second `useEffect` keyed on data props, and destroy it in the cleanup.

**When to use:** Any vanilla Leaflet plugin — `leaflet.heat`, `leaflet-velocity`, etc.

**Verified source:** react-leaflet Core Architecture docs — https://react-leaflet.js.org/docs/core-architecture/

```typescript
// src/components/map/HeatmapLayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number; // 0–1
}

interface HeatmapLayerProps {
  points: HeatPoint[];
  visible: boolean;
  radiusByZoom?: boolean;
}

export default function HeatmapLayer({ points, visible }: HeatmapLayerProps) {
  const map = useMap();
  const heatRef = useRef<L.HeatLayer | null>(null);

  // Create once on mount, destroy on unmount
  useEffect(() => {
    // @ts-expect-error leaflet.heat augments L at runtime
    heatRef.current = L.heatLayer([], {
      radius: 35,
      blur: 20,
      maxZoom: 12,
      gradient: { 0.2: '#3b82f6', 0.5: '#f59e0b', 0.8: '#ef4444' }, // blue→amber→red
    });

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);  // CRITICAL: explicit removeLayer
        heatRef.current = null;
      }
    };
  }, [map]); // only create/destroy on map instance change

  // Update points when data changes
  useEffect(() => {
    if (!heatRef.current) return;
    if (!visible) {
      map.removeLayer(heatRef.current);
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

**Critical:** `HeatmapLayer` must live inside `MapClient.tsx` which is already inside the `dynamic(..., { ssr: false })` boundary in `MapClientWrapper.tsx`. The `import 'leaflet.heat'` at the top of `HeatmapLayer.tsx` is safe because `MapClient.tsx` itself is never server-rendered.

---

### Pattern 2: SSR Guard Verification (Gate for All Animation Work)

**What:** Run `next build && next start` immediately after wiring `HeatmapLayer.tsx` — before writing any animation or scrubber logic.

**Why:** `next dev` is more forgiving of SSR issues. `next build` statically analyzes imports and will throw `ReferenceError: window is not defined` if `leaflet.heat` is reachable outside the SSR boundary. This failure is discovered late and blocks everything.

**The gate:** No animation code, no scrubber, no HomeContent wiring — until `next build` passes with `HeatmapLayer` in place.

---

### Pattern 3: Normalized Float Time Position

**What:** Represent time as a 0–1 float, not a timestamp. 30 days × 4 blocks/day = 120 total steps. `timePosition` increments by `1/120` per play tick.

**Step calculation:**
```typescript
// src/lib/timelapse-utils.ts
export const TOTAL_DAYS = 30;
export const BLOCKS_PER_DAY = 4;      // Morning / Afternoon / Evening / Night
export const TOTAL_STEPS = TOTAL_DAYS * BLOCKS_PER_DAY;  // 120
export const BLOCK_HOURS = 24 / BLOCKS_PER_DAY;           // 6
export const STEP_SIZE = 1 / TOTAL_STEPS;                  // ~0.00833

const BLOCK_NAMES = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;

export function positionToTimestamp(position: number, referenceDate: Date): Date {
  const rangeMs = TOTAL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(referenceDate.getTime() + position * rangeMs);
}

export function positionToBlockName(position: number): string {
  const stepIndex = Math.round(position * (TOTAL_STEPS - 1));
  const blockIndex = stepIndex % BLOCKS_PER_DAY;
  return BLOCK_NAMES[blockIndex];
}

export function filterByTimeWindow(
  events: EventWithVenue[],
  centerMs: number,
  windowHours: number = 24
): EventWithVenue[] {
  const halfMs = (windowHours / 2) * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = new Date(e.events.event_date).getTime();
    return t >= centerMs - halfMs && t <= centerMs + halfMs;
  });
}

export function computeVenueHeatPoints(
  events: EventWithVenue[]
): Array<{ lat: number; lng: number; intensity: number }> {
  // Group by venue, count events
  const venueCounts = new Map<number, { lat: number; lng: number; count: number }>();
  for (const e of events) {
    const { lat, lng, id } = e.venues;
    if (lat == null || lng == null) continue;
    const existing = venueCounts.get(id);
    if (existing) {
      existing.count++;
    } else {
      venueCounts.set(id, { lat, lng, count: 1 });
    }
  }
  // Normalize intensity to 0–1 relative to busiest venue in window
  const maxCount = Math.max(1, ...Array.from(venueCounts.values()).map((v) => v.count));
  return Array.from(venueCounts.values()).map(({ lat, lng, count }) => ({
    lat,
    lng,
    intensity: Math.max(0.15, count / maxCount), // floor 0.15 so single events are visible
  }));
}
```

The `intensity` floor of `0.15` implements the "even a single event creates a visible warm spot" decision — single-event venues are not invisible.

---

### Pattern 4: setInterval Play Loop in HomeContent

**What:** The animation loop lives in HomeContent, not in any map component. It advances `timePosition` via `setTimePosition` and stops at 1.

**Key rules:**
- Interval ID in `useRef<ReturnType<typeof setInterval> | null>` — never a local variable
- `clearInterval` always runs in `useEffect` return (cleanup function)
- Auto-pause when `timePosition >= 1`
- Dragging the scrubber calls `setIsPlaying(false)` via `onScrubStart` handler

```typescript
// In HomeContent (src/app/page.tsx)
const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  if (isPlaying) {
    playRef.current = setInterval(() => {
      setTimePosition((p) => {
        if (p >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return Math.min(p + STEP_SIZE, 1);
      });
    }, 1000); // ~1s per step as decided
  }
  return () => {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
  };
}, [isPlaying]);
```

---

### Pattern 5: Mode-Aware Filter Chain (HomeContent useMemo)

**What:** `sidebarEvents` and `heatPoints` are both derived from the same `windowedEvents` in a single `useMemo`. Province filter applies in both modes (locked decision).

```typescript
// In HomeContent
const referenceDate = useRef(new Date());  // captured once on mount

const { sidebarEvents, heatPoints } = useMemo(() => {
  if (mapMode === 'timelapse') {
    const center = positionToTimestamp(timePosition, referenceDate.current);
    const timeWindowed = filterByTimeWindow(allEvents, center.getTime(), 24);
    // Province filter still applies in heatmap mode (locked decision)
    const provinceFiltered = filterByProvince(timeWindowed, province);
    return {
      sidebarEvents: filterByBounds(provinceFiltered, bounds),
      heatPoints: computeVenueHeatPoints(provinceFiltered), // not bounds-filtered for heatmap
    };
  }
  // Cluster mode: existing chain
  const dateFiltered = filterByDateRange(allEvents, when);
  const provinceFiltered = filterByProvince(dateFiltered, province);
  return {
    sidebarEvents: filterByBounds(provinceFiltered, bounds),
    heatPoints: [],
  };
}, [mapMode, timePosition, allEvents, when, province, bounds]);
```

---

### Pattern 6: ModeToggle Floating Button (inside MapClient, mirroring GeolocationButton)

**What:** A floating button positioned inside the map `div` using `absolute` positioning with `z-[1000]`. Placement: top-right, above the GeolocationButton (which sits bottom-right).

**Existing GeolocationButton pattern** (from `src/components/map/GeolocationButton.tsx`):
```
className="absolute bottom-6 right-4 z-[1000] w-10 h-10 bg-white rounded-full shadow-md ..."
```

ModeToggle follows the same pattern but positioned `top-4 right-4`.

**Note:** `ModeToggle` is NOT inside `MapContainer` (it is not a Leaflet component). It lives in the outer `div.relative` wrapper inside `MapClient.tsx`, alongside the existing "no events" overlay.

---

### Pattern 7: TimelineBar Overlay

**What:** Positioned at the bottom of the map panel as an absolute overlay, inside the same `div.relative` that wraps `MapContainer`. Not a Leaflet component — just a React div with CSS positioning.

**Layout sketch:**
```
[ Play/Pause ] [ ============================== input[range] ] [ "Sat Mar 14 • Evening" ] [ count ]
```

**Frosted glass approach (Claude's discretion):** Tailwind `backdrop-blur-md bg-white/70` on a `rounded-xl` bar with `shadow-lg`. This gives the semi-transparent overlay feel without a library.

---

### Anti-Patterns to Avoid

- **Do not unmount/remount MapContainer on mode toggle** — destroys map instance, resets zoom/pan, violates MODE-03
- **Do not put timePosition in URL** — nuqs is rate-limited; 120 pushState calls per 2-minute playback exceeds Chrome's ~100/30s limit
- **Do not attach click handler to HeatLayer** — leaflet.heat renders a flat canvas with no spatial index; click events never fire (GitHub issue #61, confirmed unresolved)
- **Do not import 'leaflet.heat' at module top level outside the SSR boundary** — `window is not defined` at `next build`
- **Do not call setLatLngs inside a rAF loop** — 60fps React re-renders; decided fix is setInterval at 1000ms
- **Do not filter events per setInterval tick inside the interval callback** — call `setTimePosition` only; filtering via useMemo in the render cycle is correct
- **Do not skip map.removeLayer() in HeatmapLayer cleanup** — ghost layers accumulate across mode toggles (react-leaflet GitHub issue #941)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyboard-accessible drag scrubber | Custom div with pointer events | Native `<input type="range">` | WCAG 2.5.7; Tab focus, arrow key stepping, screen reader value announcement — free |
| Heatmap canvas rendering | Custom canvas 2D drawing | leaflet.heat 0.2.0 | Simpleheat kernel, proper blurring, zoom-aware radius — not trivial to replicate |
| Timestamp math for 6-hour blocks | Custom hour bucketing | date-fns + positionToTimestamp() | Timezone-aware; handles DST in Atlantic time (AST/ADT) correctly |
| Normalized intensity calculation | Ad-hoc per-frame normalization | computeVenueHeatPoints() (in timelapse-utils.ts, built once) | Consistent normalization; testable without Leaflet |

---

## Common Pitfalls

### Pitfall 1: SSR Build Failure from leaflet.heat Import

**What goes wrong:** `next build` throws `ReferenceError: window is not defined` even though the project uses `dynamic(..., { ssr: false })`.

**Why it happens:** `ssr: false` guards the render boundary. It does not prevent Next.js's static import analysis from touching `import 'leaflet.heat'` if it appears at module top level in any file that is statically reachable during bundling.

**How to avoid:** Keep `HeatmapLayer.tsx` inside `MapClient.tsx`, which is already the dynamic import target in `MapClientWrapper.tsx`. The `import 'leaflet.heat'` at the top of `HeatmapLayer.tsx` is safe because `MapClient.tsx` is the SSR boundary — Next.js will not statically evaluate it during `next build`.

**Verification:** Run `next build && next start` immediately after creating `HeatmapLayer.tsx`. If it passes, proceed. If it fails with `window is not defined`, move the import inside a `useEffect(() => { import('leaflet.heat') }, [])` and re-verify.

**Warning signs:** Works in `next dev`, fails in `next build`.

---

### Pitfall 2: Animation Loop Memory Leak on Mode Toggle

**What goes wrong:** CPU stays elevated after switching from timelapse to cluster view. DevTools heap climbs across repeated toggles. Multiple competing intervals run simultaneously.

**Why it happens:** Interval ID stored in a local variable; cleanup function captures the wrong ID. Or cleanup runs but `map.removeLayer()` is not called.

**How to avoid:**
- `playRef = useRef<ReturnType<typeof setInterval> | null>(null)` in HomeContent
- `useEffect` return always calls `clearInterval(playRef.current)` and sets `playRef.current = null`
- `HeatmapLayer`'s first `useEffect` cleanup calls `map.removeLayer(heatRef.current)` and `heatRef.current = null`

**Verification:** Toggle modes 10 times. DevTools Memory heap snapshot should stabilize. Chrome DevTools Performance panel should show CPU returning to baseline after exiting timelapse mode.

---

### Pitfall 3: Sidebar Desync from Heatmap Time Window

**What goes wrong:** Heatmap updates but sidebar still shows old events, or shows events not visible in the current time window.

**Why it happens:** If `sidebarEvents` is derived from nuqs URL state (which is rate-limited and async) while `heatPoints` is derived from `timePosition` useState (sync), they diverge during playback.

**How to avoid:** Both `sidebarEvents` and `heatPoints` must be derived from the same `useMemo` keyed on `timePosition`. Single source of truth — see Pattern 5 above.

**Warning signs:** Sidebar event count stays constant during playback; sidebar shows "12 events" while heatmap is clearly at a different time window.

---

### Pitfall 4: Ghost HeatLayer After Mode Toggle

**What goes wrong:** Switching to cluster mode leaves the heatmap canvas in the DOM. Both layers receive events. Multiple canvases accumulate on repeated toggles.

**Why it happens:** React reconciliation does not touch Leaflet's internal `_layers` registry. Only explicit `map.removeLayer()` removes the layer from Leaflet.

**How to avoid:** `HeatmapLayer.tsx` first `useEffect` cleanup function calls `map.removeLayer(heatRef.current)`. Additionally, when `visible` prop turns false, call `map.removeLayer()` in the second `useEffect`.

**Verification:** Open DevTools Elements panel. Toggle to cluster mode. Verify no `<canvas>` element is present under the map container's Leaflet pane divs.

---

### Pitfall 5: Province Filter Not Applied to Heatmap

**What goes wrong:** User selects "NB" province filter, toggles to heatmap mode — heatmap still shows NS/PEI/NL events.

**Why it happens:** Province filter is a nuqs URL state in cluster mode. If `heatPoints` useMemo does not read `province`, it will show all events regardless of filter.

**How to avoid:** `computeVenueHeatPoints` is called on `provinceFiltered` events (after `filterByProvince`), not on `allEvents`. See Pattern 5 above — province filter is explicitly part of the timelapse branch. This is a locked decision.

---

## Code Examples

### timelapse-utils.ts — Complete File

Source: direct design from ARCHITECTURE.md patterns.

```typescript
// src/lib/timelapse-utils.ts
import type { EventWithVenue } from '@/types/index';

export const TOTAL_DAYS = 30;
export const BLOCKS_PER_DAY = 4;
export const TOTAL_STEPS = TOTAL_DAYS * BLOCKS_PER_DAY; // 120
export const BLOCK_HOURS = 24 / BLOCKS_PER_DAY;          // 6
export const STEP_SIZE = 1 / TOTAL_STEPS;                 // 1/120
export const WINDOW_HOURS = 24;

const BLOCK_NAMES = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export function positionToTimestamp(position: number, referenceDate: Date): Date {
  const rangeMs = TOTAL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(referenceDate.getTime() + position * rangeMs);
}

export function positionToBlockName(position: number): BlockName {
  const stepIndex = Math.round(position * (TOTAL_STEPS - 1));
  return BLOCK_NAMES[stepIndex % BLOCKS_PER_DAY];
}

export function filterByTimeWindow(
  events: EventWithVenue[],
  centerMs: number,
  windowHours: number = WINDOW_HOURS
): EventWithVenue[] {
  const halfMs = (windowHours / 2) * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = new Date(e.events.event_date).getTime();
    return t >= centerMs - halfMs && t <= centerMs + halfMs;
  });
}

export interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number; // 0–1; minimum 0.15 so single events are visible
}

export function computeVenueHeatPoints(events: EventWithVenue[]): HeatPoint[] {
  const venueCounts = new Map<number, { lat: number; lng: number; count: number }>();
  for (const e of events) {
    const { lat, lng, id } = e.venues;
    if (lat == null || lng == null) continue;
    const existing = venueCounts.get(id);
    if (existing) {
      existing.count++;
    } else {
      venueCounts.set(id, { lat: lat as number, lng: lng as number, count: 1 });
    }
  }
  const maxCount = Math.max(1, ...Array.from(venueCounts.values()).map((v) => v.count));
  return Array.from(venueCounts.values()).map(({ lat, lng, count }) => ({
    lat,
    lng,
    intensity: Math.max(0.15, count / maxCount),
  }));
}
```

### TimelineBar Component Structure

```typescript
// src/components/timelapse/TimelineBar.tsx
'use client';

interface TimelineBarProps {
  timePosition: number;           // 0–1
  isPlaying: boolean;
  currentLabel: string;           // "Sat Mar 14 • Evening"
  eventCount: number;
  onPositionChange: (pos: number) => void;
  onScrubStart: () => void;       // auto-pauses playback
  onPlayPause: () => void;
}
```

### ModeToggle Placement in MapClient

```typescript
// Inside MapClient.tsx, in the outer div.relative (NOT inside MapContainer):
<div className="relative w-full h-full">
  <MapContainer ...>
    {/* ... existing layers ... */}
    {mapMode === 'timelapse' && (
      <HeatmapLayer points={heatPoints} visible={true} />
    )}
  </MapContainer>

  {/* Existing overlays */}
  {visibleVenueCount === 0 && events.length > 0 && (/* no-events message */)}

  {/* Mode toggle: top-right floating button */}
  <ModeToggle mapMode={mapMode} onToggle={onModeToggle} />

  {/* Timeline overlay: bottom of map panel */}
  {mapMode === 'timelapse' && (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 pb-4">
      <TimelineBar ... />
    </div>
  )}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| react-leaflet heatmap wrapper packages | Direct `useMap()` + `leaflet.heat` (no wrapper) | All wrappers target react-leaflet v3/v4; v5 requires custom hook |
| rAF for animation | setInterval at 1000ms (decided) | 1fps vs 60fps — correct for this use case; avoids 60 React re-renders/sec |
| URL state for all UI state | useState for animation; nuqs for persistent filters | nuqs cannot handle 120 pushState calls per 2-minute playback |

---

## Open Questions

1. **Radius scaling with zoom**
   - What we know: Decision says "heatmap radius scales with zoom level (geographic accuracy)"
   - What's unclear: leaflet.heat has a `maxZoom` option that controls at which zoom the heatmap starts rendering individual points; the `radius` option is in pixels. Dynamic radius (geographic constant) requires a zoom event listener that updates the layer's radius option.
   - Recommendation: Start with fixed `radius: 35` and `maxZoom: 12`. Add a `map.on('zoom', ...)` handler in `HeatmapLayer`'s `useEffect` that calls `heatRef.current.setOptions({ radius: ... })` based on `map.getZoom()` if QA reveals the fixed radius looks bad at extreme zooms. Defer unless visually problematic.

2. **ClusterLayer prop vs. conditional render**
   - What we know: Cluster pins must be hidden in heatmap mode (locked decision)
   - What's unclear: Whether to pass a `visible` prop to `ClusterLayer` (and add CSS `display:none` inside it) or to conditionally render it in `MapClient.tsx`
   - Recommendation: Conditionally render `ClusterLayer` — `{mapMode === 'cluster' && <ClusterLayer .../>}`. Simpler; no internal change to `ClusterLayer.tsx` required. Unmounting `ClusterLayer` is fine because the pins are recreated from `allEvents` on remount — no expensive computation lost.

3. **Province filter interaction with TimelineBar**
   - What we know: Province filters still apply in heatmap mode; date filter (nuqs `when`) is replaced by scrubber
   - What's unclear: Whether `EventFilters.tsx` (which shows date chips) should be hidden or just the date chips hidden
   - Recommendation: Hide the entire `EventFilters` bar in heatmap mode (simpler than partial hiding). The province filter state in nuqs persists automatically — it still affects `heatPoints` because `filterByProvince` runs in the timelapse useMemo branch.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.x + ts-jest |
| Config file | `jest.config.ts` (project root) |
| Quick run command | `npx jest src/lib/timelapse-utils.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HEAT-01 | heatPoints array is non-empty when events exist in window | unit | `npx jest timelapse-utils --no-coverage` | ❌ Wave 0 |
| HEAT-02 | computeVenueHeatPoints groups by venue and normalizes intensity | unit | `npx jest timelapse-utils --no-coverage` | ❌ Wave 0 |
| HEAT-04 | setLatLngs called (not layer re-creation) | manual | Chrome DevTools: verify no canvas teardown during scrub | — |
| TIME-01 | scrubber input[type=range] present in DOM in heatmap mode | manual | Browser inspect | — |
| TIME-02 | filterByTimeWindow returns events within ±12h window | unit | `npx jest timelapse-utils --no-coverage` | ❌ Wave 0 |
| TIME-03 | positionToBlockName returns correct block for each step | unit | `npx jest timelapse-utils --no-coverage` | ❌ Wave 0 |
| TIME-04 | Play advances timePosition by STEP_SIZE per interval | unit | `npx jest timelapse-utils --no-coverage` | ❌ Wave 0 |
| MODE-01 | mapMode toggles between 'cluster' and 'timelapse' | manual | Browser: toggle button changes visible layer |  — |
| MODE-02 | sidebarEvents updates within 250ms of timePosition change | manual | Browser: watch list update during scrub | — |
| MODE-03 | Map zoom/pan preserved on mode toggle | manual | Browser: set zoom 12, toggle, verify zoom unchanged | — |

Note: `HEAT-04`, `TIME-01`, `MODE-01`, `MODE-02`, `MODE-03` are manual-only — they require a running Leaflet map instance and cannot be unit tested without significant JSDOM/canvas mocking overhead.

### Sampling Rate

- **Per task commit:** `npx jest src/lib/timelapse-utils.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage` (full suite including existing filter-utils tests)
- **Phase gate:** Full suite green + manual checklist complete before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/timelapse-utils.test.ts` — covers HEAT-01, HEAT-02, TIME-02, TIME-03, TIME-04

*(Existing test infrastructure: `jest.config.ts` present, `ts-jest` configured, `@types/jest` installed, `src/lib/filter-utils.test.ts` as pattern to follow — no framework install needed.)*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `src/components/map/MapClient.tsx`, `MapClientWrapper.tsx`, `ClusterLayer.tsx`, `GeolocationButton.tsx`, `src/app/page.tsx`, `src/lib/filter-utils.ts`, `src/types/index.ts`, `package.json`, `jest.config.ts` — current state of the implementation
- `.planning/research/ARCHITECTURE.md` — verified against react-leaflet 5.x core docs; includes exact HeatmapLayer component pattern
- `.planning/research/PITFALLS.md` — verified against Leaflet.heat GitHub Issue #61, react-leaflet GitHub Issue #941, WCAG 2.2 SC 2.5.7, nuqs source
- `.planning/research/STACK.md` — `npm info leaflet.heat` (v0.2.0, zero deps), `npm info @types/leaflet.heat` (v0.2.5, Sept 2025)
- [Leaflet.heat GitHub (Leaflet org)](https://github.com/Leaflet/Leaflet.heat) — setLatLngs API, canvas rendering, Issue #61
- [react-leaflet Core Architecture docs](https://react-leaflet.js.org/docs/core-architecture/) — useMap hook, useLayerLifecycle

### Secondary (MEDIUM confidence)

- [WCAG 2.2 SC 2.5.7 — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — confirms native range input requirement
- [react-leaflet GitHub Issue #941](https://github.com/PaulLeCam/react-leaflet/issues/941) — layer leak without explicit removeLayer

### Tertiary (LOW confidence — contextual only)

- windy.tv timeline UX as reference design — UX convention, not an API

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — leaflet.heat 0.2.0 and @types/leaflet.heat 0.2.5 verified via npm registry; all other packages already in project
- Architecture: HIGH — based on direct codebase inspection of all files being modified; component tree accurately documented
- Pitfalls: HIGH — each pitfall verified via official sources (Leaflet.heat GitHub, react-leaflet GitHub, WCAG spec, nuqs source)
- Test infrastructure: HIGH — jest.config.ts present, ts-jest configured, existing test file confirms pattern

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable libraries; leaflet.heat 0.2.0 has not been updated since 2015; react-leaflet 5.x is stable)
