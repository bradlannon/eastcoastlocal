# Requirements: East Coast Local

**Defined:** 2026-03-15
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v1.3 Requirements

Requirements for admin tools. Each maps to roadmap phases.

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
- [ ] **DISC-02**: Admin can approve a discovered source — promoting it to a venue + scrape source (replaces CLI)
- [ ] **DISC-03**: Admin can reject a discovered source with an optional reason
- [x] **DISC-04**: Admin can see the raw_context and discovery_method for each candidate to inform decisions

### Dashboard

- [x] **DASH-01**: Admin dashboard shows summary stats: total venues, active sources, pending discoveries, last scrape time
- [x] **DASH-02**: Admin can see per-source scrape status (last success, last error, enabled/disabled)

## Future Requirements

### Enhanced Discovery

- **DISC-05**: System learns from approved/rejected sources to improve discovery quality
- **DISC-06**: Discovery covers event platforms beyond venue websites (Facebook Events, community boards)

### UX Polish

- **UX-01**: Zoom-to-location button on event cards
- **UX-02**: Category filter chips visible in timelapse mode

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user admin with roles | Single operator — one admin credential sufficient for current scale |
| OAuth/social login | Password auth is simpler; admin is one person |
| Bulk import/export | Manual venue management sufficient at 26-venue scale |
| Real-time scrape monitoring | Dashboard with last-run status is sufficient; no WebSocket needed |
| Public-facing user accounts | App remains public read-only |
| Event editing in admin | Events are scraped, not manually managed |

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
| DISC-02 | Phase 13 | Pending |
| DISC-03 | Phase 13 | Pending |
| DISC-04 | Phase 13 | Complete |

**Coverage:**
- v1.3 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 — traceability filled in after roadmap creation*
