# Phase 18: Venue Deduplication - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

TM-created venue rows that duplicate an existing canonical venue are automatically merged, and cross-source duplicate events are eliminated as a direct consequence. Borderline cases are logged for admin review (Phase 20). This phase covers the dedup scoring module, the merge operation, inline TM integration, and a backfill script for existing duplicates.

</domain>

<decisions>
## Implementation Decisions

### Merge Operation
- Delete the duplicate venue row after reassigning its events and scrape_sources to the canonical venue
- When reassigning events, skip any that already exist on the canonical venue (the existing `events_dedup_key` unique index on `(venue_id, event_date, normalized_performer)` handles collision detection)
- Reassign scrape_sources from duplicate to canonical venue so future TM ingests land on the right venue
- Log all merges to a dedicated `merge_log` table (canonical_id, merged_id, merged_name, score, timestamp) — provides audit trail and feeds Phase 20 admin review UI

### Dedup Timing
- Run dedup inline during TM ingest — replace the existing `findOrCreateVenue()` in `ticketmaster.ts` with a fuzzy-matching version that prevents duplicates from ever being created
- Additionally provide a one-time backfill CLI script to find and merge existing duplicates from prior TM ingests
- Backfill script defaults to `--dry-run` mode (log candidates without merging); pass `--execute` to actually merge

### Signal Requirements
- Require both signals for auto-merge: name proportional distance < 0.15 AND geocoordinate proximity < 100m (already decided)
- No name-only fallback — if a venue lacks lat/lng, it cannot be matched and a new venue is created
- Geocode new TM venues on creation using the existing Google Maps Geocoding API path (same as admin venue saves) — ensures lat/lng available for future dedup matching

### Borderline Handling
- Borderline cases (name match but geo > 500m, or geo close but name differs) create a new venue AND log the near-match pair for Phase 20 admin review
- Events still get ingested — no data loss from borderline cases

### Claude's Discretion
- Name normalization strategy before Levenshtein (stripping "The", Centre/Center, ampersands, etc.)
- Dry-run output format (CLI table, JSON, or both)
- Exact merge_log table schema beyond the core fields
- Whether to use `fastest-levenshtein` or a different string distance metric if testing reveals edge cases

</decisions>

<specifics>
## Specific Ideas

- The existing `findOrCreateVenue()` uses exact ILIKE name + city match — this is the direct source of TM duplicates and the function to replace
- `fastest-levenshtein@1.0.16` already selected for edit distance (zero deps, pure JS, server-side only)
- Proportional distance threshold of 0.15 and geo thresholds of 100m/500m chosen during v1.5 roadmap planning — validate with dry-run against real data before enabling

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `findOrCreateVenue()` in `src/lib/scraper/ticketmaster.ts:118-136` — the function to replace with fuzzy matching
- `upsertEvent()` in `src/lib/scraper/normalizer.ts` — already handles event dedup via the composite unique index
- Google Maps geocoding logic in admin venue actions (`src/app/admin/venues/actions.ts`) — reuse for TM venue geocoding
- Events dedup key `(venue_id, event_date, normalized_performer)` — once venues merge, event dedup is automatic

### Established Patterns
- Drizzle ORM for all database operations — new merge_log table follows existing schema patterns
- `scrapeTicketmaster()` iterates TM events and calls `findOrCreateVenue()` per event — inline dedup hooks in here
- TM synthetic URL pattern: `ticketmaster:province:XX` — scrape_sources with this pattern are TM sources

### Integration Points
- `src/lib/scraper/ticketmaster.ts` — main integration point for inline dedup
- `src/lib/db/schema.ts` — new merge_log table definition + migration
- `scripts/` directory — backfill CLI script lives here (alongside `seed-ticketmaster.ts`)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-venue-deduplication*
*Context gathered: 2026-03-15*
