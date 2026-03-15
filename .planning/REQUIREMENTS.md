# Requirements: East Coast Local

**Defined:** 2026-03-15
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v1.5 Requirements

Requirements for event/venue deduplication, source attribution, and UX polish. Each maps to roadmap phases.

### Deduplication

- [x] **DEDUP-01**: System auto-detects and merges duplicate venues using name similarity + geocoordinate proximity after Ticketmaster ingest
- [x] **DEDUP-02**: Cross-source duplicate events are prevented when the same event appears from multiple sources for the same venue
- [x] **DEDUP-03**: Borderline venue merge candidates (name match but uncertain geo, or vice versa) are logged for admin review
- [x] **DEDUP-04**: Admin can view near-match venue pairs with side-by-side comparison and merge or keep separate

### Source Attribution

- [x] **ATTR-01**: System tracks which sources each event was discovered from via an event_sources join table
- [x] **ATTR-02**: On cross-source conflict, ticket link is updated non-destructively if existing event has none

### UX Polish

- [x] **UX-01**: User can click "Show on map" on an event card to animate the map to the venue location
- [x] **UX-02**: Category filter chips are visible and interactive in timelapse mode

## v1.4 Requirements (Complete)

<details>
<summary>All 10 requirements complete</summary>

### Platform Integrations

- [x] **PLAT-01**: System scrapes Atlantic Canada events from Ticketmaster Discovery API filtered by province
- [x] **PLAT-02**: Ticketmaster events are matched to existing venues or new venues are auto-created with geocoding
- [x] **PLAT-03**: Ticketmaster attribution is displayed on events sourced from their API (per ToS)
- [x] **PLAT-04**: System extracts events from Google Events JSON-LD structured data on venue pages before calling Gemini

### Scraping Pipeline

- [x] **SCRP-01**: Scraper follows pagination links on venue websites up to a configurable page limit
- [x] **SCRP-02**: Per-domain rate limiting prevents sources from being blocked during scrape runs
- [x] **SCRP-03**: Failed scrape requests are retried with exponential backoff
- [x] **SCRP-04**: Admin dashboard displays per-source quality metrics (event count, confidence, failure rate)

### Discovery Automation

- [x] **DISC-05**: High-confidence discovered sources are auto-approved using multiple signals (LLM confidence + test extraction + future events)
- [x] **DISC-06**: Auto-approved sources are visible in admin UI and can be revoked

</details>

## v1.3 Requirements (Complete)

<details>
<summary>All 13 requirements complete</summary>

### Authentication

- [x] **AUTH-01**: Admin routes are protected behind a login gate — unauthenticated users cannot access /admin pages
- [x] **AUTH-02**: Admin can log in with a configured email/password credential

### Venue Management

- [x] **VENUE-01**: Admin can view a list of all venues with name, province, and source count
- [x] **VENUE-02**: Admin can add a new venue with name, address, city, province
- [x] **VENUE-03**: Admin can edit an existing venue's details
- [x] **VENUE-04**: Admin can add a scrape source URL to a venue (creates scrape_sources row)
- [x] **VENUE-05**: Admin can enable/disable a scrape source without deleting it

### Discovery Review

- [x] **DISC-01**: Admin can view a list of discovered sources filtered by status (pending/approved/rejected)
- [x] **DISC-02**: Admin can approve a discovered source — promoting it to a venue + scrape source (replaces CLI)
- [x] **DISC-03**: Admin can reject a discovered source with an optional reason
- [x] **DISC-04**: Admin can see the raw_context and discovery_method for each candidate to inform decisions

### Dashboard

- [x] **DASH-01**: Admin dashboard shows summary stats: total venues, active sources, pending discoveries, last scrape time
- [x] **DASH-02**: Admin can see per-source scrape status (last success, last error, enabled/disabled)

</details>

## Future Requirements

### Enhanced Discovery

- **DISC-07**: System learns from approved/rejected sources to improve discovery quality
- **DISC-08**: Discovery covers Facebook Events (deferred — requires headless browser, blocked by Vercel Hobby)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fully automated venue merge with no review path | False positives corrupt data permanently; two-signal gate + admin review for borderline cases is safer |
| Fuzzy event matching independent of venue | Without resolved venue_id, title similarity produces false positives across different venues |
| Real-time dedup during user requests | Fuzzy matching is O(n²); run in daily cron, not on request |
| Animated flyTo on scroll/hover | Constant flyTo calls during scroll are jarring and break mobile UX; explicit button click only |
| Zoom level above 16 on flyTo | CartoDB Positron tiles lose legibility; zoom 15 provides venue context |
| Songkick integration | Commercial API only ($500+/month partnership required) |
| Facebook Events | Requires headless browser; blocked by Vercel Hobby 50MB limit |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEDUP-01 | Phase 18 | Complete |
| DEDUP-02 | Phase 18 | Complete |
| DEDUP-03 | Phase 18 | Complete |
| DEDUP-04 | Phase 20 | Complete |
| ATTR-01 | Phase 19 | Complete |
| ATTR-02 | Phase 21 | Complete |
| UX-01 | Phase 19 | Complete |
| UX-02 | Phase 19 | Complete |

**Coverage:**
- v1.5 requirements: 8 total
- Mapped to phases: 8 (ATTR-02 reassigned to Phase 21 for gap closure)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after v1.5 roadmap created*
