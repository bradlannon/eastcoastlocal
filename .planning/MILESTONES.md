# Milestones

## v2.1 Tech Debt Cleanup (Shipped: 2026-03-16)

**Phases completed:** 3 phases, 5 plans
**Timeline:** 3 days (2026-03-13 → 2026-03-16)
**Stats:** 15,293 LOC TypeScript, 57 files changed, +3,390 / -499 lines

**Key accomplishments:**
- FK-safe venue dedup backfill — refactored to use performVenueMerge, eliminating FK violation risk in --execute mode
- EventCard attribution driven by source_type enum via supplementary query pattern, replacing brittle URL string-matching
- Dead phone column removed from venues and discovered_sources tables (migration 0010)
- No Website tab added to /admin/discovery for Places API venue stubs with approve/reject actions
- GEMINI_AUTO_APPROVE threshold made env-overridable in places-discoverer
- Test suite restored to green — fixed .limit() mock chain in ticketmaster.test.ts (33/33 passing)
- All 21 Nyquist VALIDATION.md files finalized across milestones v1.0-v2.0

---

## v2.0 Mass Venue Discovery (Shipped: 2026-03-16)

**Phases completed:** 4 phases, 10 plans
**Timeline:** ~12 hours (2026-03-15 → 2026-03-16)
**Stats:** 14,697 LOC TypeScript, 57 files changed, +9,364 lines

**Key accomplishments:**
- Database schema extended with google_place_id, coordinates, and address columns for structured discovery data across discovered_sources and venues
- Google Maps Places API discoverer scanning 41 communities across all 4 Atlantic provinces with per-province cron isolation (Mon-Thu)
- Reddit subreddit mining via Gemini extraction covering 10 Atlantic Canada subreddits with keyword pre-filtering and post ID dedup
- Two-step venue deduplication (google_place_id fast-path + fuzzy name+geo scoring) preventing re-staging of known venues
- Admin batch approve with checkbox selection, Promise.allSettled resilience, and discovery run metrics logging to discovery_runs table
- Dashboard "Last Discovery" stat card and "Recent Discovery Runs" table for at-a-glance pipeline health

---

## v1.5 Event Dedup & UX Polish (Shipped: 2026-03-15)

**Phases completed:** 8 phases, 14 plans
**Timeline:** 2 days (2026-03-13 → 2026-03-15)
**Stats:** 11,774 LOC TypeScript, 114 files changed, +18,635 lines

**Key accomplishments:**
- Two-signal venue deduplication (name similarity + geocoordinate proximity) with dry-run validation and admin merge review UI
- Ticketmaster Discovery API integration sourcing major Atlantic Canada ticketed events with "via Ticketmaster" attribution
- Event source tracking via event_sources join table — every event records which scrapers discovered it
- Non-destructive cross-source conflict resolution using COALESCE for source_url and ticket_link
- UX polish: map-pin flyTo on event cards, category filter chips in timelapse mode
- Auto-approve pipeline for high-confidence discovered sources with admin revoke capability
- Scrape quality metrics (event count, confidence, failure rate) visible in admin dashboard

---

## v1.3 Admin Tools (Shipped: 2026-03-15)

**Phases completed:** 4 phases, 6 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v1.2 Event Discovery (Shipped: 2026-03-15)

**Phases completed:** 4 phases, 6 plans
**Timeline:** 1 day (2026-03-14 → 2026-03-15)
**Stats:** 6,172 LOC TypeScript, 27 files changed, 1,525 lines added

**Key accomplishments:**
- 8-value event category taxonomy (pgEnum + Drizzle migration) with discovered_sources staging table and backfill script
- AI-powered event categorization via Gemini — broadened extractor beyond live music to comedy, theatre, arts, sports, festival, community events
- Category filter chip UI with URL persistence via nuqs, category badges on event cards and detail pages
- Automated source discovery pipeline using Gemini + Google Search grounding across 6 Atlantic Canada cities
- Weekly Vercel cron for discovery with domain deduplication against existing sources
- CLI-based source promotion from staging to active scrape pipeline

---

## v1.1 Heatmap Timelapse (Shipped: 2026-03-14)

**Phases completed:** 2 phases, 6 plans
**Timeline:** 1 day (2026-03-14)
**Stats:** 5,108 LOC TypeScript, 48 tests, 10 new/modified files, 1,179 lines added

**Key accomplishments:**
- Pure timelapse utility functions with 48 unit tests (time windowing, venue heat points, 6-hour block naming, Haversine spatial proximity)
- HeatmapLayer component with leaflet.heat integration, dynamic intensity scaling for sparse data, and blue-to-red gradient
- TimelineBar scrubber with frosted glass overlay, play/pause animation at ~1s/step, 24-hour rolling window across 30 days
- Mode toggle between pin clusters and heatmap timelapse with viewport preservation and province filter support
- Click-through from heatmap hotspots with multi-venue grouped popups filtered to current time window
- Toggleable venue pins in heatmap mode synced to current 24-hour time window

---

## v1.0 MVP (Shipped: 2026-03-14)

**Phases completed:** 3 phases, 8 plans
**Timeline:** 2 days (2026-03-13 → 2026-03-14)
**Stats:** 3,521 LOC TypeScript, 77 tests, 105 files

**Key accomplishments:**
- Next.js 16 project on Vercel with Neon Postgres, Drizzle ORM, and 5 seeded Atlantic Canada venues
- AI-powered scraping pipeline using Gemini LLM with confidence scoring, geocoding, and composite key deduplication
- Eventbrite and Bandsintown API integrations with Atlantic Canada region filtering
- Daily automated cron scraping with per-source error isolation
- Interactive Leaflet map with clustered venue pins, split-screen layout, and real-time viewport-synced event list
- Date/province filters with URL persistence, geolocation, cross-highlight, and shareable event detail pages

---

