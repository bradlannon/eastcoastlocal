# Phase 11: Admin Dashboard - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator landing page that shows system health at a glance: summary stat cards (total venues, active sources, pending discoveries, last scrape time) and a per-source scrape health table. Read-only — no editing or management actions (those are Phase 12 and 13).

</domain>

<decisions>
## Implementation Decisions

### Dashboard layout
- Stat cards in a horizontal row at the top (4 cards: Total Venues, Active Sources, Pending Discoveries, Last Scrape)
- Source health table directly below with its own "Source Health" heading
- Stat cards are clickable: Venues links to /admin/venues (Phase 12), Pending Discoveries links to /admin/discovery (Phase 13) — links ready even before those pages exist
- Top nav bar gets Dashboard / Venues / Discovery links (extending existing admin layout)

### Health indicators
- Color-coded badges: green for success, red for failure, gray for pending
- "Unhealthy" = last_scrape_status is 'failure' (simple, matches existing data)
- Timestamps shown as relative time ("2 hours ago", "3 days ago")
- Last Scrape stat card turns amber if most recent scrape across all sources is >24h ago (stale cron signal)

### Source table detail
- Columns: Venue name, Source URL (truncated, full on hover), Status badge + last scraped relative time
- No enabled/disabled column, but disabled sources are shown with muted/gray styling
- Default sort: failures first, then pending, then success — puts problems at the top
- Rows are read-only, no click actions (venue management comes in Phase 12)

### Data freshness
- Server-rendered on each visit (no client-side polling)
- Small "Data as of [time]" text near the heading
- Subtle refresh button (icon) that calls router.refresh() — spins while reloading
- Server component for the page, small client component for the refresh button
- loading.tsx with simple skeleton placeholders (gray cards + table rows) for initial load

### Claude's Discretion
- Exact card styling (shadows, borders, padding)
- Table row styling and hover states
- Skeleton placeholder design
- Error state if database query fails
- Responsive breakpoints for mobile admin access

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Admin layout (src/app/admin/layout.tsx): Top nav with "East Coast Local Admin" branding and logout form — will be extended with nav links
- Admin placeholder page (src/app/admin/page.tsx): Currently "Coming soon" — will be replaced with dashboard
- Drizzle schema (src/lib/db/schema.ts): venues, scrape_sources, discovered_sources tables with all needed fields

### Established Patterns
- Tailwind CSS for all styling (no component library)
- Light theme throughout the app
- Next.js App Router with server components as default
- Drizzle ORM for database queries (innerJoin pattern established)

### Integration Points
- Admin auth middleware already protects /admin routes (Phase 10)
- Database connection via Neon HTTP driver (existing pattern)
- Nav links will point to /admin/venues and /admin/discovery (Phases 12-13)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Dashboard should be clean and scannable, consistent with the existing light-theme admin layout.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-admin-dashboard*
*Context gathered: 2026-03-14*
