# Requirements: East Coast Local

**Defined:** 2026-03-15
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v1.4 Requirements

Requirements for more scrapers, pipeline improvements, and discovery automation. Each maps to roadmap phases.

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
- [ ] **DISC-06**: Auto-approved sources are visible in admin UI and can be revoked

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

### UX Polish

- **UX-01**: Zoom-to-location button on event cards
- **UX-02**: Category filter chips visible in timelapse mode

## Out of Scope

| Feature | Reason |
|---------|--------|
| Songkick integration | Commercial API only ($500+/month partnership required) |
| Facebook Events | Requires headless browser; blocked by Vercel Hobby 50MB limit |
| Multi-user admin with roles | Single operator — one admin credential sufficient for current scale |
| Event editing in admin | Events are scraped, not manually managed |
| Real-time scrape monitoring | Dashboard with last-run status is sufficient; no WebSocket needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 10 | Complete |
| AUTH-02 | Phase 10 | Complete |
| DASH-01 | Phase 11 | Complete |
| DASH-02 | Phase 11 | Complete |
| VENUE-01 | Phase 12 | Complete |
| VENUE-02 | Phase 12 | Complete |
| VENUE-03 | Phase 12 | Complete |
| VENUE-04 | Phase 12 | Complete |
| VENUE-05 | Phase 12 | Complete |
| DISC-01 | Phase 13 | Complete |
| DISC-02 | Phase 13 | Complete |
| DISC-03 | Phase 13 | Complete |
| DISC-04 | Phase 13 | Complete |
| PLAT-01 | Phase 16 | Complete |
| PLAT-02 | Phase 16 | Complete |
| PLAT-03 | Phase 16 | Complete |
| PLAT-04 | Phase 14 | Complete |
| SCRP-01 | Phase 14 | Complete |
| SCRP-02 | Phase 14 | Complete |
| SCRP-03 | Phase 14 | Complete |
| SCRP-04 | Phase 15 | Complete |
| DISC-05 | Phase 17 | Complete |
| DISC-06 | Phase 17 | Pending |

**Coverage:**
- v1.4 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after v1.4 roadmap created*
