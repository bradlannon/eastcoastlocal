# Phase 19: UX Polish & Source Attribution - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate directly from event cards to venue locations on the map, category filters are accessible in timelapse mode, and the system records which source each event was discovered from via a join table. Event dedup across sources uses the join table to track multi-source provenance.

</domain>

<decisions>
## Implementation Decisions

### Show on map (zoom-to-location)
- Keep whole-card click behavior — clicking the event card (except links) triggers flyTo to venue at zoom 15
- Add a subtle map-pin icon on each card as a visual affordance (placement at Claude's discretion)
- In timelapse mode, flyTo still fires — centers map on venue even though there's no marker popup
- On mobile, keep auto-switch to map tab on card tap (existing behavior)

### Category chips in timelapse
- Show category chip row below the TimelineBar — slim dedicated row, always visible in timelapse mode
- Category chips only — province dropdown is NOT shown in timelapse (map viewport constrains geography)
- Event count badge visible alongside category chips in timelapse
- Selecting a category during playback does NOT pause — heatmap and sidebar update live

### Event source tracking (event_sources join table)
- Schema: event_id (FK), scrape_source_id (nullable FK to scrape_sources), source_type enum ('scrape'|'ticketmaster'|'manual')
- Include first_seen_at and last_seen_at timestamps per source record
- Source attribution is backend/admin data only — not surfaced to public users
- Keep existing source_url column on events table — don't migrate or drop it. Join table adds multi-source tracking alongside it
- Existing TM attribution link on EventCard continues to derive from source_url as-is

### Source conflict resolution
- Auto-fill source_url if empty when a second source provides a ticket link — non-destructive, never overwrites existing links
- Only auto-fill ticket links (source_url) — no enrichment of other fields (price, time, description)
- Cross-source event matching key: same venue_id + performer + event_date (reuses existing dedup logic)
- Performer name matching: case-insensitive + trim whitespace. No fuzzy matching — exact normalized strings only

### Claude's Discretion
- Map-pin icon design, size, and exact placement on EventCard
- Category chip row styling and spacing below TimelineBar
- event_sources migration strategy (Drizzle migration approach)
- Whether to backfill event_sources for existing events from scrape run data

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. All decisions align with existing patterns (orange accent color, chip styling, Drizzle schema-as-code).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MapViewController.tsx`: FlyToTarget interface + flyTo effect already implemented — just needs map-pin icon on EventCard
- `EventFilters.tsx`: Category chip rendering with orange active styling — extract into reusable component for timelapse mode
- `EventCard.tsx`: Already has onClickVenue handler wired to whole-card click
- `filterByCategory()` in filter-utils: Already applied in timelapse filter chain (page.tsx line 88)
- `fastest-levenshtein` (from Phase 18): Available but NOT needed — performer matching is exact normalized strings

### Established Patterns
- Drizzle ORM schema-as-code with pgTable/pgEnum definitions in `src/lib/db/schema.ts`
- nuqs for URL-persisted filter state (category already syncs via `?category=`)
- Category filter already works in timelapse via URL param — just not visible in UI

### Integration Points
- `page.tsx` line 177: Conditional rendering hides EventFilters in timelapse — needs to show category chips instead
- `EventCard.tsx`: Add map-pin icon, no behavior changes needed
- `schema.ts`: New event_sources table definition alongside existing scrape_sources
- Scraper orchestrator (`orchestrator.ts`): Insert into event_sources when creating/finding events
- Ticketmaster scraper (`ticketmaster.ts`): Insert into event_sources for TM-sourced events

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-ux-polish-source-attribution*
*Context gathered: 2026-03-15*
