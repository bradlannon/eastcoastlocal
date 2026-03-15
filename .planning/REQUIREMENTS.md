# Requirements: East Coast Local

**Defined:** 2026-03-15
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v2.0 Requirements

Requirements for Mass Venue Discovery milestone. Each maps to roadmap phases.

### Places API Discovery

- [ ] **PLACES-01**: System discovers venues via Google Maps Places API Text Search across configured cities
- [ ] **PLACES-02**: System filters Places results by venue-relevant place types (bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium)
- [ ] **PLACES-03**: System respects Places API rate limits with configurable throttle
- [ ] **PLACES-04**: System deduplicates Places-discovered venues against existing venues before staging
- [ ] **PLACES-05**: System extracts website URLs from Places results for scrape source promotion
- [ ] **PLACES-06**: System creates no-website venue stubs with coordinates for venues without websiteUri
- [ ] **PLACES-07**: System stores google_place_id on discovered sources and venues for cross-source dedup

### Geographic Expansion

- [ ] **GEO-01**: System covers ~30 population centers across all 4 Atlantic provinces
- [ ] **GEO-02**: Discovery jobs run as chunked crons (per-province or per-region) to stay within 60s timeout
- [ ] **GEO-03**: Each discovery channel (Places, Gemini, Reddit) runs on its own cron schedule

### Reddit Mining

- [ ] **REDDIT-01**: System mines Atlantic Canada subreddits for venue and event mentions
- [ ] **REDDIT-02**: System uses Gemini to extract structured venue data from Reddit posts
- [ ] **REDDIT-03**: System targets province-specific subreddits with configurable mapping
- [ ] **REDDIT-04**: Reddit-discovered venues flow through existing discovered_sources pipeline

### Auto-Approval & Scoring

- [ ] **SCORE-01**: System uses Places-specific scoring with higher auto-approve confidence (structured data bonus)
- [ ] **SCORE-02**: System uses higher threshold for Reddit-sourced venues (lower data quality)
- [ ] **SCORE-03**: System tracks discovery_method on all discovered sources for per-method scoring

### Admin Tooling

- [ ] **ADMIN-01**: Admin can batch-approve multiple discovered sources in one action
- [ ] **ADMIN-02**: System logs discovery run metrics (candidates found, auto-approved, queued, errors)
- [ ] **ADMIN-03**: Admin dashboard shows last discovery run summary with counts

### Schema

- [ ] **SCHEMA-01**: Database migration adds google_place_id, address, lat, lng to discovered_sources
- [ ] **SCHEMA-02**: Database migration adds google_place_id to venues table

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
| SCHEMA-01 | — | Pending |
| SCHEMA-02 | — | Pending |
| PLACES-01 | — | Pending |
| PLACES-02 | — | Pending |
| PLACES-03 | — | Pending |
| PLACES-04 | — | Pending |
| PLACES-05 | — | Pending |
| PLACES-06 | — | Pending |
| PLACES-07 | — | Pending |
| GEO-01 | — | Pending |
| GEO-02 | — | Pending |
| GEO-03 | — | Pending |
| REDDIT-01 | — | Pending |
| REDDIT-02 | — | Pending |
| REDDIT-03 | — | Pending |
| REDDIT-04 | — | Pending |
| SCORE-01 | — | Pending |
| SCORE-02 | — | Pending |
| SCORE-03 | — | Pending |
| ADMIN-01 | — | Pending |
| ADMIN-02 | — | Pending |
| ADMIN-03 | — | Pending |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after initial definition*
