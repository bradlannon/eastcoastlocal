# Requirements: East Coast Local

**Defined:** 2026-03-15
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v2.0 Requirements

Requirements for Mass Venue Discovery milestone. Each maps to roadmap phases.

### Places API Discovery

- [x] **PLACES-01**: System discovers venues via Google Maps Places API Text Search across configured cities
- [x] **PLACES-02**: System filters Places results by venue-relevant place types (bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium)
- [x] **PLACES-03**: System respects Places API rate limits with configurable throttle
- [x] **PLACES-04**: System deduplicates Places-discovered venues against existing venues before staging
- [x] **PLACES-05**: System extracts website URLs from Places results for scrape source promotion
- [x] **PLACES-06**: System creates no-website venue stubs with coordinates for venues without websiteUri
- [x] **PLACES-07**: System stores google_place_id on discovered sources and venues for cross-source dedup

### Geographic Expansion

- [x] **GEO-01**: System covers ~30 population centers across all 4 Atlantic provinces
- [x] **GEO-02**: Discovery jobs run as chunked crons (per-province or per-region) to stay within 60s timeout
- [x] **GEO-03**: Each discovery channel (Places, Gemini, Reddit) runs on its own cron schedule

### Reddit Mining

- [x] **REDDIT-01**: System mines Atlantic Canada subreddits for venue and event mentions
- [x] **REDDIT-02**: System uses Gemini to extract structured venue data from Reddit posts
- [x] **REDDIT-03**: System targets province-specific subreddits with configurable mapping
- [x] **REDDIT-04**: Reddit-discovered venues flow through existing discovered_sources pipeline

### Auto-Approval & Scoring

- [x] **SCORE-01**: System uses Places-specific scoring with higher auto-approve confidence (structured data bonus)
- [x] **SCORE-02**: System uses higher threshold for Reddit-sourced venues (lower data quality)
- [x] **SCORE-03**: System tracks discovery_method on all discovered sources for per-method scoring

### Admin Tooling

- [ ] **ADMIN-01**: Admin can batch-approve multiple discovered sources in one action
- [ ] **ADMIN-02**: System logs discovery run metrics (candidates found, auto-approved, queued, errors)
- [ ] **ADMIN-03**: Admin dashboard shows last discovery run summary with counts

### Schema

- [x] **SCHEMA-01**: Database migration adds google_place_id, address, lat, lng to discovered_sources
- [x] **SCHEMA-02**: Database migration adds google_place_id to venues table

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### User Engagement

- **USER-01**: User can suggest a venue via simple form (queued for admin review)
- **USER-02**: User can subscribe to venue notifications

### Additional Sources

- **SRC-01**: Facebook Events integration (requires headless browser — blocked by Vercel 50MB limit)
- **SRC-02**: Instagram venue mining for events posted as stories/reels

## Out of Scope

| Feature | Reason |
|---------|--------|
| Facebook Events scraping | Requires headless browser (Playwright/Puppeteer), exceeds Vercel Hobby 50MB function size limit |
| Real-time user-triggered discovery | Expensive LLM + API calls on user requests, open to abuse; discovery remains cron-only |
| Fully automated bulk import with zero review path | Google Maps returns non-event businesses; type filtering reduces but doesn't eliminate false positives |
| Storing raw Reddit post text | Large, legally ambiguous (Reddit TOS), unnecessary — store extracted structured data only |
| Geocoding Reddit venues during discovery | Reddit-extracted names are noisy; geocode only after promotion to venues table |
| Scraping venues without websites | No-website stubs are stored for Ticketmaster coverage but cannot be scraped |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 22 | Complete |
| SCHEMA-02 | Phase 22 | Complete |
| PLACES-01 | Phase 23 | Complete |
| PLACES-02 | Phase 23 | Complete |
| PLACES-03 | Phase 23 | Complete |
| PLACES-04 | Phase 23 | Complete |
| PLACES-05 | Phase 23 | Complete |
| PLACES-06 | Phase 23 | Complete |
| PLACES-07 | Phase 23 | Complete |
| GEO-01 | Phase 23 | Complete |
| GEO-02 | Phase 23 | Complete |
| GEO-03 | Phase 23 | Complete |
| SCORE-01 | Phase 23 | Complete |
| SCORE-02 | Phase 23 | Complete |
| SCORE-03 | Phase 23 | Complete |
| REDDIT-01 | Phase 24 | Complete |
| REDDIT-02 | Phase 24 | Complete |
| REDDIT-03 | Phase 24 | Complete |
| REDDIT-04 | Phase 24 | Complete |
| ADMIN-01 | Phase 25 | Pending |
| ADMIN-02 | Phase 25 | Pending |
| ADMIN-03 | Phase 25 | Pending |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
