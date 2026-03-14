# Phase 3: Public Frontend - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Interactive map and event discovery UI for live music across Atlantic Canada. Users can see events on a map with clustered pins, browse a synced event list, filter by date and province, view event detail pages, and use geolocation to find events near them. Mobile-responsive with map/list toggle. No user accounts, no event submission, no search — public read-only discovery.

</domain>

<decisions>
## Implementation Decisions

### Map tiles & style
- Light/standard map tiles (CartoDB light or OpenStreetMap) — matches the light theme
- Map initially centered on all Atlantic Canada, zoomed to show all four provinces
- "Near me" geolocation button overlaid on the map (bottom-right, Google Maps style)
- Subtle message overlay when no events in visible area: "No events here. Zoom out to see more"

### Pin behavior
- Single bold accent color for all event pins (Claude picks the exact color)
- One pin per venue — popup lists all upcoming events at that venue
- Clusters zoom-to-expand on click (standard behavior)
- Pin click opens a map popup with: venue name, event count, list of upcoming events (band + date), "View Details" link per event

### Layout — desktop
- Split screen: map on left, scrollable event list on right
- List syncs with map viewport — only shows events visible on the map
- Cross-highlight: hovering a list card highlights the corresponding map pin; clicking pans map to pin and opens popup
- Minimal header: "East Coast Local" branding + filter controls (date chips + province dropdown)
- Event count displayed near filters: "23 events"

### Layout — mobile
- Map-first on load, with bottom tab bar to toggle between Map and List views
- Same filter controls in header, adapted for mobile width
- Bottom tab bar: [Map] [List] — fixed, thumb-friendly

### Event list cards
- Card-style entries (not compact rows): band name prominent, venue + city below, date/time, price if available
- No cover images in list cards — keep them clean and fast

### Event detail page
- Full page at /event/[id] — shareable URL, good for SEO
- Shows: band/performer name, venue name, full address, city, province, date, time
- Price and ticket link shown if available (prominent "View on [source] →" button)
- Description and cover image shown if available
- Small static mini map showing venue location
- "More at [Venue]" section at bottom with other upcoming events at same venue
- Clean collapse: missing optional fields simply don't render (no placeholders, no "N/A")
- Back navigation preserves map state (zoom, position, filters) via URL params

### Filtering
- Date quick-filters as toggle chips: All (default) | Today | This Weekend | This Week
- "This Weekend" = Friday 5:00 PM through end of Sunday
- Province filter as dropdown: All Provinces, New Brunswick, Nova Scotia, PEI, Newfoundland & Labrador
- Selecting a province auto-zooms the map to that province's bounds; "All Provinces" zooms back out
- "Clear filters" button/link appears when any filter is active
- Filters persist in URL query params: /?when=weekend&province=NS — shareable, bookmarkable, preserves state on back nav
- Default load state: all upcoming events, no filters, full Atlantic Canada view
- Friendly empty state when filters return zero results: "No events [filter description]. Try [suggestion]."

### List-map sync
- List updates in real-time as user pans/zooms the map (no "Search this area" button)
- All events loaded upfront, filtered client-side by visible map bounds + active filters

### Theme
- Light theme throughout: white/light gray UI chrome, dark text
- Replaces current zinc-950 dark placeholder

### Claude's Discretion
- Exact pin accent color choice (bold, works on light tiles)
- Map tile provider selection (CartoDB Positron, OSM, etc.)
- Component library choice (shadcn/ui or plain Tailwind)
- Loading states and skeleton design
- Exact spacing, typography, and responsive breakpoints
- Data fetching strategy (RSC, API route, etc.)
- Map state persistence implementation (URL params vs client state)
- react-leaflet configuration and marker/cluster libraries

</decisions>

<specifics>
## Specific Ideas

- Split screen layout like Airbnb's map + list view
- Pin popups listing multiple events per venue (not one pin per event)
- Cross-highlight between list and map like property listing sites
- "View on [source]" as the primary CTA on detail pages — the app is a discovery tool, not a ticketing platform
- Weekend definition includes Friday evening (5pm+) for live music context

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db/schema.ts`: Full Drizzle schema — events have performer, event_date, event_time, price, ticket_link, description, cover_image_url, source_url; venues have lat, lng, city, province, address, name
- `src/lib/db/client.ts`: Lazy Proxy-based Neon HTTP client — import `db` for queries
- `src/types/index.ts`: TypeScript types via InferSelectModel/InferInsertModel
- Tailwind CSS 4 already configured
- Geist font family already set up in layout.tsx

### Established Patterns
- Next.js 16 App Router
- Drizzle ORM for all DB operations
- Lazy DB client initialization (defers DATABASE_URL to query time)
- date-fns available for date formatting/manipulation

### Integration Points
- No map library installed yet — need to add react-leaflet + leaflet
- No UI component library installed — need to decide (shadcn/ui or plain Tailwind)
- Current page.tsx is placeholder ("Coming Soon") — will be replaced with map/list view
- layout.tsx metadata needs updating from "Create Next App" to "East Coast Local"
- API routes at /api/ — may need event data endpoint for client-side fetching

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-public-frontend*
*Context gathered: 2026-03-14*
