# Phase 23: Places API Discovery - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Google Maps Places API discovery pipeline: an isolated per-province cron system that discovers venue candidates across ~50+ Atlantic Canada communities (2k+ population), scores them with a place-type-based tier system, deduplicates against existing venues, stages new candidates for auto-approval or admin review, and creates no-website venue stubs. Also updates existing Gemini discovery threshold from 0.8 to 0.9.

</domain>

<decisions>
## Implementation Decisions

### City List & Cron Chunking
- One cron endpoint per province: `/api/cron/discover-places-ns`, `-nb`, `-pei`, `-nl`
- Each province runs on its own weekly schedule, staggered (e.g., NS Monday, NB Tuesday, etc.)
- City list includes all communities 2k+ population (~50+ total across 4 provinces)
- City list hardcoded as a constant object in the Places discoverer file, organized by province
- Each province endpoint calls the shared discoverer with its city list

### Search Query Strategy
- Use Places API Text Search (New) method
- Single broad query per city: "bars nightclubs live music venues in {city} {province}"
- Filter results by place_types in code after response (bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium)
- Follow all pagination (nextPageToken) until exhausted — don't cap pages
- Essential fields only in X-Goog-FieldMask: places.id, places.displayName, places.websiteUri, places.formattedAddress, places.location, places.types
- No phone field in initial request (schema has the column from Phase 22, can add later)

### Places Scoring Design
- Simple tier-based scoring, NOT multi-signal weighted
- Core types (bar, night_club, concert_hall, performing_arts_theater, comedy_club) = 0.85 → auto-approve at 0.8 threshold
- Secondary types (community_center, stadium) = 0.70 → admin review queue
- New `scorePlacesCandidate()` function, separate from existing `scoreCandidate()`
- Update existing Gemini discovery threshold to 0.9 in this phase (SCORE-02 requirement)
- Per-method threshold constants: PLACES_AUTO_APPROVE = 0.8, GEMINI_AUTO_APPROVE = 0.9

### Dedup Staging Behavior
- google_place_id exact match as fast-path dedup: if venue already has same place_id, skip staging entirely and enrich
- Then fall through to scoreVenueCandidate() name+geo check for venues without place_id match
- Dedup scope: same province only (not all venues)
- On MERGE decision: skip discovered_sources insert, auto-enrich existing venue (backfill google_place_id, richer address), log enrichment
- On REVIEW decision: stage as 'pending' with near-match context in raw_context field, admin decides
- On KEEP_SEPARATE: stage normally as new candidate

### Claude's Discretion
- Exact query string wording for Text Search (as long as it targets venue types in a city)
- Rate limiting / throttle implementation between API calls (p-limit or sequential)
- Error handling per-city (continue on failure, retry logic)
- Synthetic URL pattern for no-website venues (follow Ticketmaster precedent: `places:{google_place_id}`)
- Domain column value for no-website venues
- Logging verbosity and format for discovery runs

</decisions>

<specifics>
## Specific Ideas

- Existing Gemini discovery covers 6 cities — Places discovery is the "mass expansion" to ~50+ communities
- Per-province cron isolation means PEI (smallest, ~4 cities) won't block NS (largest, ~15 cities) if one fails
- Enriching existing 26 venues with google_place_id on first run is a key win — anchors them for future dedup
- The 0.8/0.9 threshold split reflects that Places structured data is inherently higher quality than Gemini+Search text extraction

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/scraper/discovery-orchestrator.ts`: `runDiscoveryJob()` and `scoreCandidate()` — pattern for cron-triggered discovery with auto-approval. New Places discoverer follows same shape.
- `src/lib/scraper/venue-dedup.ts`: `scoreVenueCandidate()` — ready to wire into staging pipeline. Two-signal gate (name ratio < 0.15 AND geo < 100m).
- `src/lib/scraper/promote-source.ts`: `promoteSource()` — already carries lat/lng/address/google_place_id/place_types from Phase 22 updates.
- `src/lib/scraper/geocoder.ts`: `geocodeAddress()` — existing Google Maps API pattern with `GOOGLE_MAPS_API_KEY` env var.
- `src/app/api/cron/discover/route.ts`: Cron endpoint pattern — Bearer token auth, maxDuration=60, JSON response.

### Established Patterns
- Cron auth via `CRON_SECRET` Bearer token
- `maxDuration = 60` on all cron routes (Vercel Hobby plan)
- Drizzle ORM for all DB operations
- discovered_sources status values: pending, approved, rejected, no_website
- discovery_method values: gemini_google_search, google_places, reddit_gemini
- Ticketmaster synthetic URL pattern: `ticketmaster:province:XX`

### Integration Points
- discovered_sources → promoteSource() → venues + scrape_sources: primary data flow (Phase 22 updated)
- scoreVenueCandidate() needs to be called BEFORE insert into discovered_sources (staging-time dedup)
- Existing cron/discover endpoint stays unchanged — Places gets its own 4 endpoints
- GOOGLE_MAPS_API_KEY env var — same key needs Places API (New) enabled in GCP Console
- Admin discovery UI filters by status — 'no_website' status already planned from Phase 22 context

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-places-api-discovery*
*Context gathered: 2026-03-15*
