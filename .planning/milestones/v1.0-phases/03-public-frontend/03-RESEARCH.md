# Phase 3: Public Frontend - Research

**Researched:** 2026-03-14
**Domain:** Next.js 16 App Router + react-leaflet v5 + interactive map UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Map tiles: CartoDB Positron (light) or OpenStreetMap — light theme match
- Map initial center: all Atlantic Canada, zoomed to show all four provinces
- "Near me" geolocation button overlaid bottom-right (Google Maps style)
- "No events here. Zoom out to see more" overlay when no events in visible area
- Single bold accent color for all event pins (Claude picks exact color)
- One pin per venue — popup lists all upcoming events at that venue
- Clusters zoom-to-expand on click (standard behavior)
- Pin popup content: venue name, event count, list of upcoming events (band + date), "View Details" link per event
- Desktop: split screen map left / scrollable event list right
- List syncs with map viewport — only shows events visible on the map
- Cross-highlight: hovering list card highlights corresponding pin; clicking pans to pin + opens popup
- Minimal header: "East Coast Local" branding + date chips + province dropdown
- Event count near filters: "23 events"
- Mobile: map-first on load, bottom tab bar [Map] [List], same filter controls
- Event list cards: card-style, no cover images, band name prominent, venue + city below, date/time, price if available
- Event detail page at /event/[id]: shareable URL, SEO-friendly
- Detail page: band, venue, full address, city, province, date, time; price + ticket link if available; description + cover image if available; small static mini-map for venue location; "More at [Venue]" section; missing fields simply don't render
- Back navigation preserves map state via URL params
- Date quick-filters as toggle chips: All | Today | This Weekend | This Week
- "This Weekend" = Friday 5:00 PM through end of Sunday
- Province filter dropdown: All Provinces, New Brunswick, Nova Scotia, PEI, Newfoundland & Labrador
- Selecting province auto-zooms map to that province's bounds
- "Clear filters" button when any filter is active
- Filters persist in URL query params: /?when=weekend&province=NS
- List updates in real-time as user pans/zooms (no "Search this area" button)
- All events loaded upfront, filtered client-side by visible map bounds + active filters
- Light theme throughout: white/light gray UI chrome, dark text (replaces zinc-950 dark placeholder)

### Claude's Discretion
- Exact pin accent color (bold, works on light tiles)
- Map tile provider selection (CartoDB Positron, OSM, etc.)
- Component library choice (shadcn/ui or plain Tailwind)
- Loading states and skeleton design
- Exact spacing, typography, and responsive breakpoints
- Data fetching strategy (RSC, API route, etc.)
- Map state persistence implementation (URL params vs client state)
- react-leaflet configuration and marker/cluster libraries

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-01 | User can view an interactive map centered on Atlantic Canada (NB, NS, PEI, NL) | react-leaflet v5 MapContainer with center=[47, -62], zoom=6 covers all four provinces |
| MAP-02 | Events display as pin clusters that show count when zoomed out and expand to individual pins when zoomed in | react-leaflet-cluster v4 wraps Leaflet.markercluster, React 19 + react-leaflet v5 compatible |
| MAP-03 | User can click a map pin to see event summary (band, venue, date, time) | Leaflet Popup component via react-leaflet Popup; one Marker per venue with multi-event popup |
| MAP-04 | User can browse events in a list view sorted by date | Client-side array sorted by event_date, toggled via mobile bottom tab bar |
| MAP-05 | User can filter events by date using quick filters (Today, This Weekend, This Week) | Client-side date-fns filtering; filter state in URL via nuqs or manual URLSearchParams |
| MAP-06 | User can filter events by province or city | Client-side province filter on venue.province field; province selection triggers map fitBounds |
| MAP-07 | User can use browser geolocation to center the map on their current location | navigator.geolocation in "use client" component; useMap() to flyTo user location |
| MAP-08 | User can view event detail page showing band, venue, date, time, address, and link to original source | Next.js App Router page at /event/[id] — server component fetching by ID, SSR-friendly |
| MAP-09 | Map and list views are mobile-responsive and usable on phone screens | Tailwind responsive classes; bottom tab bar for mobile toggle; map fills viewport |
| INFR-02 | App loads initial map view in under 3 seconds on broadband | All events loaded once via API route; map loads client-side via dynamic import ssr:false; CartoDB tiles cached by CDN |
</phase_requirements>

## Summary

Phase 3 builds the public-facing interactive map and event discovery UI on Next.js 16 App Router. The core technical challenge is that Leaflet/react-leaflet require browser DOM APIs incompatible with server-side rendering — the solution is well-established: wrap the entire map component in `next/dynamic` with `ssr: false`. This is the universal pattern for Next.js + Leaflet and has been confirmed working on Next.js 15/16 App Router.

The stack is: **react-leaflet v5** for the map (already decided in project state), **react-leaflet-cluster v4** for marker clustering (updated Nov 2025, explicitly supports React 19 + react-leaflet v5), and **nuqs** for type-safe URL search params management. The data layer uses an existing API Route Handler at `/api/events` that returns all upcoming events joined with venue data — all filtering and viewport-based list sync happens client-side.

The event detail page at `/event/[id]` is a standard Next.js App Router server component that can fetch directly from the DB via the existing Drizzle client — no additional API needed. The map on the detail page is a small static embed (using Leaflet with a single non-interactive marker) or a simple iframe, not a full interactive map.

**Primary recommendation:** Use `next/dynamic` with `ssr:false` for the map component, react-leaflet-cluster v4 for clustering, nuqs for URL state, and a single `/api/events` Route Handler returning all upcoming events with venue data joined.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-leaflet | 5.0.x | React bindings for Leaflet interactive maps | Decided in project state; official React wrapper for Leaflet |
| leaflet | 1.9.x | Map engine (peer dep of react-leaflet) | Industry standard open-source map library |
| react-leaflet-cluster | 4.0.0 | Marker clustering via Leaflet.markercluster | Explicitly supports React 19 + react-leaflet v5 as of Nov 2025; best-maintained cluster wrapper |
| nuqs | >=2.x | Type-safe URL search params as React state | Eliminates manual URLSearchParams boilerplate; works with Next.js App Router >=14.2 including v16 |
| date-fns | 4.x | Date filtering (Today/Weekend/Week logic) | Already installed; handles timezone-safe date math |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| leaflet-defaulticon-compatibility | latest | Fix broken default marker icons with webpack | Required — Next.js webpack breaks Leaflet's icon URL detection |
| @types/leaflet | latest | TypeScript types for Leaflet | Required for TS; import from `'react-leaflet'` for react-leaflet types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-leaflet-cluster | react-leaflet-markercluster (yuzhva) | yuzhva's has v5.0.0-rc.0 (release candidate only); akursat's is stable v4.0.0 |
| nuqs | Manual URLSearchParams + useRouter | Manual approach is error-prone, lacks type safety; nuqs is 1.7KB gzipped |
| CartoDB Positron tiles | OpenStreetMap standard | Both free; CartoDB Positron is lighter/cleaner for light theme; OSM is busier |
| API Route for events | Direct RSC DB fetch | Map component is client-side; needs API to fetch from client; Route Handler is correct pattern |

**Installation:**
```bash
npm install react-leaflet react-leaflet-cluster leaflet leaflet-defaulticon-compatibility nuqs
npm install -D @types/leaflet
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx                    # Server component shell — passes searchParams to MapPage
│   ├── event/
│   │   └── [id]/
│   │       └── page.tsx            # Event detail — server component, direct DB fetch
│   └── api/
│       └── events/
│           └── route.ts            # GET — returns all upcoming events + venue data
├── components/
│   ├── map/
│   │   ├── MapClient.tsx           # "use client" — dynamic-imported, owns all map logic
│   │   ├── MapWrapper.tsx          # Thin shell — next/dynamic with ssr:false
│   │   ├── ClusterLayer.tsx        # MarkerClusterGroup + Marker children
│   │   ├── VenuePopup.tsx          # Popup listing events at a venue
│   │   ├── MapBoundsTracker.tsx    # useMapEvents moveend → updates visible bounds state
│   │   └── GeolocationButton.tsx  # "Near me" button — calls navigator.geolocation
│   ├── events/
│   │   ├── EventList.tsx           # Scrollable list, accepts filtered events array
│   │   ├── EventCard.tsx           # Individual card: band, venue, date, price
│   │   └── EventFilters.tsx        # Date chips + province dropdown
│   └── layout/
│       ├── AppHeader.tsx           # Branding + filters + event count
│       └── MobileTabBar.tsx        # [Map] [List] bottom tabs
└── lib/
    ├── events-api.ts               # Client-side fetch wrapper for /api/events
    ├── filter-utils.ts             # Pure functions: filterByDate, filterByProvince, filterByBounds
    └── province-bounds.ts          # Atlantic Canada province lat/lng bounds constants
```

### Pattern 1: Dynamic Map Import (SSR Bypass)
**What:** Wrap the entire Leaflet map in next/dynamic with ssr:false to prevent server-side window errors
**When to use:** Always — Leaflet requires DOM APIs; this is non-negotiable for Next.js

```typescript
// Source: https://xxlsteve.net/blog/react-leaflet-on-next-15/
// src/components/map/MapWrapper.tsx
import dynamic from 'next/dynamic';

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />,
});

export default MapClient;
```

```typescript
// src/components/map/MapClient.tsx
'use client';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import 'leaflet-defaulticon-compatibility';
import { MapContainer, TileLayer } from 'react-leaflet';
// ... rest of map
```

### Pattern 2: Viewport-Synced Event List
**What:** Track map bounds in React state; filter events array on every moveend/zoomend
**When to use:** The list-map sync requirement (list shows only visible events)

```typescript
// Source: react-leaflet.js.org/docs/api-map/ + useMapEvents hook
// src/components/map/MapBoundsTracker.tsx
'use client';
import { useMapEvents } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';

interface Props {
  onBoundsChange: (bounds: LatLngBounds) => void;
}

export function MapBoundsTracker({ onBoundsChange }: Props) {
  useMapEvents({
    moveend: (e) => onBoundsChange(e.target.getBounds()),
    zoomend: (e) => onBoundsChange(e.target.getBounds()),
  });
  return null;
}
```

### Pattern 3: URL Filter State with nuqs
**What:** Encode active filters in URL query params; use nuqs hook for type-safe access
**When to use:** All filter state — shareable URLs, back-nav preservation

```typescript
// Source: https://nuqs.dev
// In layout.tsx — wrap once at root
import { NuqsAdapter } from 'nuqs/adapters/next/app';
export default function RootLayout({ children }) {
  return <html><body><NuqsAdapter>{children}</NuqsAdapter></body></html>;
}

// In EventFilters.tsx
'use client';
import { useQueryState } from 'nuqs';

export function EventFilters() {
  const [when, setWhen] = useQueryState('when'); // 'today' | 'weekend' | 'week' | null
  const [province, setProvince] = useQueryState('province'); // 'NB' | 'NS' | 'PEI' | 'NL' | null
  // ...
}
```

### Pattern 4: One-Pin-Per-Venue with Multi-Event Popup
**What:** Group events by venue_id; render one Marker per venue with a Popup listing all events
**When to use:** Always — this is the required UX (not one pin per event)

```typescript
// Group events by venue
const venueMap = new Map<number, { venue: Venue; events: EventWithVenue[] }>();
events.forEach((event) => {
  if (!venueMap.has(event.venue_id)) {
    venueMap.set(event.venue_id, { venue: event.venue, events: [] });
  }
  venueMap.get(event.venue_id)!.events.push(event);
});
```

### Pattern 5: Province Bounds Auto-Zoom
**What:** When province filter selected, call map.fitBounds() with pre-defined province bounds
**When to use:** Province dropdown onChange

```typescript
// src/lib/province-bounds.ts
import type { LatLngBoundsLiteral } from 'leaflet';

export const ATLANTIC_CANADA_BOUNDS: LatLngBoundsLiteral = [
  [43.0, -68.0],   // SW corner
  [55.0, -52.5],   // NE corner (includes Labrador)
];

export const PROVINCE_BOUNDS: Record<string, LatLngBoundsLiteral> = {
  NB: [[44.5, -69.0], [48.1, -63.7]],
  NS: [[43.4, -66.4], [47.0, -59.7]],
  PEI: [[45.9, -64.5], [47.1, -61.9]],
  NL: [[46.6, -59.5], [55.0, -52.5]],
};
```

### Pattern 6: Events API Route
**What:** Route Handler at `/api/events` joins events + venues, returns upcoming events as JSON
**When to use:** Client-side map component needs to fetch all data on mount

```typescript
// src/app/api/events/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';
import { eq, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db
    .select()
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(gte(events.event_date, new Date()))
    .orderBy(events.event_date);

  return NextResponse.json(rows);
}
```

### Pattern 7: Marker Icon Fix
**What:** Leaflet's default icon breaks under webpack/Next.js due to URL rewriting; use leaflet-defaulticon-compatibility
**When to use:** Import immediately after leaflet CSS in the client map component

```typescript
// Import order matters — must be after leaflet CSS
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
```

**Alternatively**, define custom icons explicitly to avoid the default icon system entirely:
```typescript
// Custom accent-colored pin using DivIcon
import L from 'leaflet';
const venueIcon = L.divIcon({
  className: '',
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#E85D26;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});
```

### Anti-Patterns to Avoid
- **Importing Leaflet at module level in a server component:** Causes "window is not defined" crash; always use `'use client'` + dynamic import wrapper
- **Putting the `useMap` hook outside a MapContainer child:** `useMap()` requires a `MapContainer` ancestor; it will throw if used in the parent
- **One Marker per event:** Creates excessive pins; the requirement is one pin per venue with multi-event popups
- **Fetching events in a server component and passing to map via props during SSR:** The map component is client-side-only; data must come via client fetch or be injected via a `<script>` data island
- **Storing map bounds in URL params:** Bounds change constantly on pan/zoom — URL becomes unreadable; store bounds in client state (React useState), store only filters in URL

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Marker clustering | Custom cluster logic | react-leaflet-cluster v4 | Supercluster-based clustering handles 10k+ markers, handles zoom levels, spiderfy on overlap |
| URL search params sync | Manual URLSearchParams + router.push | nuqs | Handles batching, back nav, Next.js router compatibility, type coercion |
| Province lat/lng bounds | Trial-and-error zoom levels | Define LatLngBoundsLiteral constants + map.fitBounds() | fitBounds auto-calculates correct zoom + center |
| Date range logic | Custom date math | date-fns (already installed) | Handles timezone edge cases, weekend boundaries, DST |
| Map viewport bounds tracking | Custom event wiring | useMapEvents hook from react-leaflet | Correct Leaflet event lifecycle; avoids stale closure pitfalls |

**Key insight:** The Leaflet ecosystem has solved every problem in this phase. The work is integration and UX, not algorithms.

## Common Pitfalls

### Pitfall 1: "window is not defined" on Map Import
**What goes wrong:** Importing react-leaflet or leaflet at module level in any file that gets server-rendered crashes Next.js build or runtime
**Why it happens:** Leaflet calls `window` and `document` during import, before React hydration
**How to avoid:** The entire map component tree must be in a `'use client'` file AND imported via `next/dynamic({ ssr: false })` from the parent page/server component
**Warning signs:** Build error "ReferenceError: window is not defined"; TypeError during SSR

### Pitfall 2: Broken Default Marker Icons
**What goes wrong:** Map renders but all markers show a broken image instead of the pin icon
**Why it happens:** Leaflet's icon URL detection uses `_getIconUrl` which webpack/Next.js rewrites, breaking the path
**How to avoid:** Import `leaflet-defaulticon-compatibility` immediately after `leaflet/dist/leaflet.css` in the map client component, OR use fully custom `L.divIcon()` markers (recommended for this project since custom accent color is required anyway)
**Warning signs:** Markers appear as broken image icons or empty boxes

### Pitfall 3: Map Container Height Must Be Explicit
**What goes wrong:** Map renders but is invisible (0px height)
**Why it happens:** MapContainer needs explicit height — it won't expand to fill parent automatically without CSS
**How to avoid:** Set `style={{ height: '100%' }}` or a fixed height class on both MapContainer and all ancestor divs up to the viewport
**Warning signs:** No map visible even though no errors; DevTools shows map div is 0px tall

### Pitfall 4: MapContainer Props Are Immutable
**What goes wrong:** Trying to change `center` or `zoom` props after initial render has no effect
**Why it happens:** react-leaflet passes these only to the Leaflet Map constructor; subsequent prop changes are ignored
**How to avoid:** To programmatically control the map view, use `useMap()` inside a child component and call `map.flyTo()`, `map.setView()`, or `map.fitBounds()`
**Warning signs:** Province dropdown selects a province, URL updates, but map doesn't move

### Pitfall 5: Neon HTTP Driver and Complex Joins
**What goes wrong:** Events join with venues returns unexpected structure or fails with the HTTP driver
**Why it happens:** As noted in project STATE.md, Neon HTTP driver has constraints with Drizzle relational queries; the team already solved this by querying separately
**How to avoid:** Use `.select().from(events).innerJoin(venues, eq(...))` — this is a SQL join, not a Drizzle relational query, and works with the HTTP driver. Alternatively, query events and venues separately and merge in JS (consistent with Phase 2 pattern)
**Warning signs:** Runtime error from db client; unexpected query shape

### Pitfall 6: react-leaflet-cluster CSS Not Imported
**What goes wrong:** Clusters show as plain markers without the count badge; no visual clustering
**Why it happens:** MarkerClusterGroup CSS must be explicitly imported — v4 removed automatic CSS import to prevent Next.js build issues
**How to avoid:** Import both CSS files in the map client component (not the wrapper)
**Warning signs:** Clusters render but look like plain markers without count numbers

### Pitfall 7: useMapEvents Outside MapContainer
**What goes wrong:** `useMapEvents` throws "No leaflet context" error
**Why it happens:** Hooks must be called from a component that is a descendant of `<MapContainer>`
**How to avoid:** Put `MapBoundsTracker` and `GeolocationButton` as children inside `<MapContainer>` in the JSX tree
**Warning signs:** Error at runtime: cannot read context; hooks appear to do nothing

## Code Examples

Verified patterns from official sources and current documentation:

### MapContainer Setup (Atlantic Canada)
```typescript
// Source: react-leaflet.js.org/docs/api-map/ + latitude.to for coordinates
import { MapContainer, TileLayer } from 'react-leaflet';

const ATLANTIC_CANADA_CENTER: [number, number] = [47.0, -62.0];
const INITIAL_ZOOM = 6;
const CARTO_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

<MapContainer
  center={ATLANTIC_CANADA_CENTER}
  zoom={INITIAL_ZOOM}
  style={{ height: '100%', width: '100%' }}
  scrollWheelZoom={true}
>
  <TileLayer url={CARTO_TILE_URL} attribution={CARTO_ATTRIBUTION} />
</MapContainer>
```

### Marker Cluster Group
```typescript
// Source: https://akursat.gitbook.io/marker-cluster
import MarkerClusterGroup from 'react-leaflet-cluster';

<MarkerClusterGroup chunkedLoading>
  {venueEntries.map(({ venue, events }) => (
    <Marker key={venue.id} position={[venue.lat!, venue.lng!]} icon={venueIcon}>
      <Popup>
        <VenuePopup venue={venue} events={events} />
      </Popup>
    </Marker>
  ))}
</MarkerClusterGroup>
```

### Geolocation Button (inside MapContainer)
```typescript
// Source: MDN navigator.geolocation API
'use client';
import { useMap } from 'react-leaflet';

export function GeolocationButton() {
  const map = useMap();

  const handleClick = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 12);
      },
      (err) => console.warn('Geolocation error:', err)
    );
  };

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-6 right-4 z-[1000] ..."
      aria-label="Center map on my location"
    >
      {/* location icon */}
    </button>
  );
}
```

### Client-Side Date Filtering with date-fns
```typescript
// Source: date-fns documentation; "This Weekend" = Fri 5pm to end of Sunday
import { isToday, isFriday, isSaturday, isSunday, isWithinInterval,
         startOfDay, endOfDay, nextSunday, set } from 'date-fns';

export function filterByDateRange(events: EventWithVenue[], when: string | null) {
  if (!when) return events;
  const now = new Date();

  if (when === 'today') {
    return events.filter(e => isToday(new Date(e.event_date)));
  }
  if (when === 'weekend') {
    // Friday 5pm through end of Sunday
    const friday5pm = (() => {
      const d = new Date();
      while (!isFriday(d)) d.setDate(d.getDate() + (isFriday(d) ? 0 : 1));
      return set(startOfDay(d), { hours: 17 });
    })();
    const sundayEnd = endOfDay(nextSunday(now));
    return events.filter(e =>
      isWithinInterval(new Date(e.event_date), { start: friday5pm, end: sundayEnd })
    );
  }
  if (when === 'week') {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    return events.filter(e =>
      isWithinInterval(new Date(e.event_date), { start: now, end: weekEnd })
    );
  }
  return events;
}
```

### Viewport Bounds Filter
```typescript
// Source: Leaflet LatLngBounds API — contains() method
import type { LatLngBounds } from 'leaflet';

export function filterByBounds(
  events: EventWithVenue[],
  bounds: LatLngBounds | null
): EventWithVenue[] {
  if (!bounds) return events;
  return events.filter(e =>
    e.venue.lat != null &&
    e.venue.lng != null &&
    bounds.contains([e.venue.lat, e.venue.lng])
  );
}
```

### Event Detail Page (Server Component)
```typescript
// src/app/event/[id]/page.tsx
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

export default async function EventPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const [row] = await db
    .select()
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(eq(events.id, id))
    .limit(1);

  if (!row) notFound();

  const { events: event, venues: venue } = row;
  // render...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-leaflet v2 class components | react-leaflet v5 hooks API (`useMap`, `useMapEvents`) | v3+ (2021+) | Cleaner child-component patterns; no MapEventsHandler wrapper needed |
| Manual URLSearchParams + router.push | nuqs library | ~2023 | Type safety, batching, Back nav preservation |
| Delete L.Icon.Default prototype hack | leaflet-defaulticon-compatibility plugin | 2020+ | Cleaner, no monkey-patching |
| pages/api routes | App Router Route Handlers | Next.js 13+ | Better streaming, edge runtime support |
| react-leaflet-markercluster (yuzhva) | react-leaflet-cluster (akursat) | 2024-2025 | Better React 19 + RL v5 support; stable release |

**Deprecated/outdated:**
- `L.Icon.Default.prototype._getIconUrl = undefined` hack: Still works but fragile; replaced by leaflet-defaulticon-compatibility or custom divIcon
- `pages/api/events.ts` pattern: Use `app/api/events/route.ts` Route Handler instead
- `react-leaflet v4` + `@changey/react-leaflet-markercluster`: Use react-leaflet v5 + react-leaflet-cluster v4 instead

## Open Questions

1. **Neon HTTP join query shape**
   - What we know: Phase 2 noted that Neon HTTP driver has constraints with Drizzle relational queries; team used separate queries
   - What's unclear: Whether `innerJoin` in Drizzle (SQL join, not relational API) works cleanly with Neon HTTP
   - Recommendation: Try `innerJoin` first in the `/api/events` route; if it fails, fall back to two queries and merge in JS (precedent from Phase 2)

2. **Event count in Atlantic Canada**
   - What we know: Database has seed data; real event count after scraping is unknown
   - What's unclear: Whether loading all events upfront is acceptable (~50 events? ~500?)
   - Recommendation: Load all upcoming events upfront as decided (client-side filtering); add `limit` query param later if needed

3. **Tailwind CSS 4 + Leaflet CSS conflict**
   - What we know: Tailwind CSS 4 uses a CSS-first approach with cascade layers; Leaflet CSS uses traditional selectors
   - What's unclear: Whether Tailwind's `@layer` resets conflict with Leaflet's `.leaflet-*` selectors
   - Recommendation: Import Leaflet CSS inside the `'use client'` map component (not globals.css); test for visual regressions on markers and popups

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `jest.config.ts` — `testEnvironment: 'node'`, `testMatch: ['**/*.test.ts']` |
| Quick run command | `npm test -- --testPathPattern=filter-utils` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | Map centered on Atlantic Canada renders | manual-only | Visual check in browser | N/A |
| MAP-02 | Markers cluster at zoom-out, expand at zoom-in | manual-only | Visual check in browser | N/A |
| MAP-03 | Pin click opens venue popup with events | manual-only | Visual check in browser | N/A |
| MAP-04 | List view shows events sorted by date | unit | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 |
| MAP-05 | Date filter: Today / This Weekend / This Week | unit | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 |
| MAP-06 | Province filter narrows list and zooms map | unit (filter fn) + manual (zoom) | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 |
| MAP-07 | Geolocation button centers map on user | manual-only | Requires browser API; not testable in Jest | N/A |
| MAP-08 | Event detail page renders all fields; notFound on missing | unit | `npm test -- --testPathPattern=events-api` | ❌ Wave 0 |
| MAP-09 | Mobile layout usable (bottom tab, responsive) | manual-only | Visual check at 375px viewport | N/A |
| INFR-02 | Map loads under 3 seconds on broadband | manual-only | DevTools Network throttle check | N/A |

**Note on test coverage:** UI components (map, layout, cards) are manual-only — Jest with jsdom cannot test Leaflet or visual responsiveness. The testable surface is pure utility functions: `filterByDateRange`, `filterByBounds`, `filterByProvince`, and the `/api/events` route handler (mockable).

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=filter-utils`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (57 existing + new filter tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/filter-utils.test.ts` — covers MAP-04, MAP-05, MAP-06 filter functions
- [ ] `src/app/api/events/route.test.ts` — covers MAP-08 API shape; mocks Drizzle db client

*(Note: `jest.config.ts` currently only matches `*.test.ts` — React component tests in `*.test.tsx` would require adding `tsx` to `testMatch` and configuring jest-environment-jsdom, which is not needed for this phase.)*

## Sources

### Primary (HIGH confidence)
- `react-leaflet.js.org/docs/start-installation/` — v5 peer deps, TypeScript setup
- `react-leaflet.js.org/docs/api-map/` — MapContainer, useMap, useMapEvents hooks
- `akursat.gitbook.io/marker-cluster` — react-leaflet-cluster v4 usage
- `github.com/akursat/react-leaflet-cluster` — v4.0.0 release notes, React 19 + RL v5 compat
- `nuqs.dev` (via GitHub fetch) — NuqsAdapter setup, useQueryState hook
- `carto.com/basemaps` — CartoDB Positron tile URL template

### Secondary (MEDIUM confidence)
- `xxlsteve.net/blog/react-leaflet-on-next-15/` — Next.js 15/16 App Router integration pattern, confirmed 2025
- `latitude.to/articles-by-country/ca/canada/3871/atlantic-canada` — Atlantic Canada center: 47.0, -62.0
- `nextjs.org/docs/app/api-reference/functions/use-search-params` — useSearchParams in App Router
- `github.com/ghybs/leaflet-defaulticon-compatibility` — Icon fix plugin

### Tertiary (LOW confidence)
- Multiple community blog posts (Medium, DEV.to) confirming SSR dynamic import pattern — consistent across sources, elevates confidence

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — react-leaflet v5 + react-leaflet-cluster v4 verified against official repos; nuqs verified against official docs
- Architecture: HIGH — Next.js dynamic import SSR bypass is well-documented and confirmed on Next.js 15/16
- Pitfalls: HIGH — icon issues and MapContainer immutability are documented in official react-leaflet issues; Neon constraint is from project STATE.md

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (30 days — these libraries are stable; react-leaflet-cluster v4.0.0 is a fresh stable release)
