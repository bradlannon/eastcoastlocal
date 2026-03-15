# Phase 12: Venue & Source Management - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Full CRUD for venues and their scrape sources through a web UI. Admin can view all venues, add new venues, edit existing venues, add scrape source URLs to venues, and toggle sources enabled/disabled. No venue deletion. No event management.

</domain>

<decisions>
## Implementation Decisions

### Venue list layout
- Table format with columns: Name, City, Province, Source Count
- No pagination — show all venues in one list (~26 venues)
- No filtering or search — scan by eye at this scale
- "+" Add Venue" button at top right of the page, next to the heading
- Clicking a venue row navigates to /admin/venues/[id] detail page

### Add/edit venue flow
- Add venue lives on a separate page: /admin/venues/new
- Venue detail page (/admin/venues/[id]) shows an editable form with current values pre-filled — same form does both viewing and editing
- Fields: Name, Address, City, Province (dropdown with NB/NS/PEI/NL)
- Auto-geocode address on save using Google Maps Geocoding API (existing pattern from scraper)
- After saving (add or edit), redirect back to /admin/venues list

### Source management UX
- Scrape sources managed on the venue detail page, below the venue edit form
- Inline "add source" form: URL text field + "Add" button below existing sources list
- Enabled/disabled toggle next to each source — Claude's discretion on confirmation behavior
- Source type (venue_website/eventbrite/bandsintown) — Claude's discretion on auto-detect vs dropdown

### Navigation flow
- Simple breadcrumbs on detail and new pages: "Venues > The Ship Pub" or "Venues > New Venue"
- Active nav link in top bar highlighted (bold or underline) to show current section
- After save redirects to venue list

### Claude's Discretion
- Toggle confirmation behavior (instant vs confirm dialog)
- Source type detection approach (auto-detect from URL vs dropdown)
- Form validation messages and error states
- Success/error feedback after save actions
- Exact breadcrumb styling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Admin layout (src/app/admin/layout.tsx): Top nav with Dashboard/Venues/Discovery links — needs active link highlighting
- Dashboard page (src/app/admin/page.tsx): Established patterns for DB queries with Promise.all, relativeTime(), statusBadge()
- RefreshButton (src/app/admin/_components/RefreshButton.tsx): Client component pattern with router.refresh()
- Drizzle schema (src/lib/db/schema.ts): venues table (name, address, city, province, lat, lng, website, phone, venue_type), scrape_sources table (url, venue_id, enabled, source_type, scrape_frequency)
- Google Maps Geocoding: Already used in scraper for venue geocoding with ROOFTOP precision requirement

### Established Patterns
- Tailwind CSS for all styling, light theme
- Next.js App Router with server components as default, client components only where needed
- Drizzle ORM with Neon HTTP driver for database queries
- Server actions for form mutations (established in login/actions.ts)
- loading.tsx for skeleton placeholders

### Integration Points
- Dashboard stat cards already link to /admin/venues
- Top nav "Venues" link already points to /admin/venues
- Auth middleware protects all /admin routes
- GOOGLE_MAPS_API_KEY env var already configured for geocoding

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Forms should be clean and consistent with the existing admin layout.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-venue-source-management*
*Context gathered: 2026-03-14*
