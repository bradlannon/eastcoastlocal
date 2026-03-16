# Phase 22: Schema Foundation - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the database schema to support Google Maps Places API data across the discovery pipeline. Add google_place_id, pre-geocoded coordinates, address, and place_types to discovered_sources. Add google_place_id to venues. Update promoteSource() to carry structured data through. Handle no-website venues as stubs.

</domain>

<decisions>
## Implementation Decisions

### URL Constraint Handling
- Claude's discretion on whether to make url nullable or use synthetic placeholder (like Ticketmaster's `ticketmaster:province:XX` pattern)
- Claude's discretion on dedup key strategy (google_place_id unique index for Places sources)
- Claude's discretion on domain column handling for no-website venues
- If a Places venue HAS a website, store that website URL in discovered_sources.url — existing url-based dedup catches cross-method duplicates naturally
- google_place_id gets a unique index (nullable) — one row per place_id, no duplicate staging
- Store full formatted address from Places API in a new discovered_sources.address column (e.g., "1234 Barrington St, Halifax, NS B3J 1Y9")
- Places-sourced discoveries get a separate scoring function — bypass domain-based scoring entirely

### Promote with Coordinates
- If discovered_sources has lat/lng, carry them straight to venue on promotion — skip geocoding API call
- If lat/lng are null (Reddit, Gemini sources), geocode as today — conditional geocoding path
- Carry full Places address into venues.address on promotion (not the current "city, province, Canada" placeholder)
- Copy google_place_id to venues table during promotion
- Run scoreVenueCandidate() BEFORE promotion for Places venues — dedup at staging time since coords are available
- When dedup matches an existing venue, auto-enrich: backfill google_place_id and richer address onto the existing venue

### No-Website Venue Status
- New discovered_sources status value: 'no_website' — separate from pending/approved/rejected
- High-confidence Places types (bar, night_club, etc.) with coordinates auto-promote as venue stubs — no admin review
- Venue stubs = venue row with coords but NO scrape_source row
- Stubs only appear on public map once they have at least one event (e.g., Ticketmaster attaches)
- Admin venue list shows visual badge/icon distinguishing stubs from active scrape venues
- If a stub later gains a website (admin adds, or future discovery), auto-create scrape_source — stub upgrades to active
- Store place_types on discovered_sources (dedicated column, not just raw_context)
- Carry place_types through to venues table — repurpose or enhance existing venue_type column

### Claude's Discretion
- Whether to make url nullable vs synthetic URL pattern (consider Ticketmaster precedent)
- Whether to make domain nullable or use placeholder
- Phone column on discovered_sources (Places returns it — low cost to add)
- google_place_id copy to venues during promotion (recommended yes)
- Exact place_types column format (JSON array vs comma-separated)

</decisions>

<specifics>
## Specific Ideas

- Ticketmaster already uses synthetic URL pattern (`ticketmaster:province:XX`) — established precedent for non-web discovery sources
- User wants Places address data flowing through the full pipeline (not just for discovery, but enriching venue display)
- Enriching existing venues on dedup match is important — existing 26 venues should gain google_place_id and better addresses as Places discovers them

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db/schema.ts`: All table definitions — venues has lat/lng (nullable doublePrecision), discovered_sources lacks them
- `src/lib/scraper/promote-source.ts`: promoteSource() — creates venue + scrape_source from discovered_source. Currently hardcodes address as "city, province, Canada"
- `src/lib/scraper/venue-dedup.ts`: scoreVenueCandidate() — two-signal gate (name ratio < 0.15 AND geo < 100m). Already handles merge/review/keep_separate decisions

### Established Patterns
- Drizzle ORM with `drizzle-kit generate` workflow — 7 migrations (0000-0006) in drizzle/ directory
- `db:generate` + `db:migrate` npm scripts
- Nullable columns with sensible defaults for backward compatibility
- Ticketmaster synthetic URL pattern: `ticketmaster:province:XX` as scrape_sources.url

### Integration Points
- discovered_sources → promoteSource() → venues + scrape_sources: primary data flow that needs updating
- scoreVenueCandidate() needs to be callable at staging time (currently only used in merge pipeline)
- venues.venue_type (text, currently unused/minimal) — candidate for place_types storage
- Admin discovery UI filters by status — new 'no_website' status needs filter chip

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-schema-foundation*
*Context gathered: 2026-03-15*
