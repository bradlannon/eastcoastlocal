# Requirements: East Coast Local

**Defined:** 2026-03-14
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v1.2 Requirements

Requirements for event discovery and categorization. Each maps to roadmap phases.

### Categorization

- [x] **CAT-01**: Events are automatically assigned a category by AI during scraping (live_music, comedy, theatre, arts, sports, festival, community, other)
- [x] **CAT-02**: Existing events in the database are backfilled with categories
- [x] **CAT-03**: Database schema includes event_category enum column on events table

### Filtering

- [ ] **FILT-01**: User can filter events by category using horizontal chip buttons
- [ ] **FILT-02**: Category filter applies to heatmap mode (heatmap only shows selected categories)
- [ ] **FILT-03**: Category filter selection is persisted in the URL and shareable

### Discovery

- [ ] **DISC-01**: System automatically searches for new event venues/sources across Atlantic Canada cities
- [ ] **DISC-02**: Discovered sources land in a staging table for review before being scraped
- [ ] **DISC-03**: Approved sources can be promoted from staging to active scraping

## Future Requirements

### Admin Tools

- **ADMIN-01**: Admin UI to manage venues and scrape sources
- **ADMIN-02**: Admin can manually add a venue/source URL
- **ADMIN-03**: Admin can review and approve/reject discovered sources in a UI

### Enhanced Discovery

- **DISC-04**: System learns from approved/rejected sources to improve discovery quality
- **DISC-05**: Discovery covers event platforms beyond venue websites (Facebook Events, community boards)

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts/authentication | Public read-only app, admin tools deferred |
| Manual event submission | Scraping/discovery only for v1.2 |
| Multi-select category filter | Single-select chips for v1.2, multi-select in future |
| Real-time discovery (user-triggered) | Discovery is a periodic cron job, not on-demand |
| Category customization by users | Fixed 8-category taxonomy enforced by AI |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | Phase 7 | Complete |
| CAT-02 | Phase 7 | Complete |
| CAT-03 | Phase 6 | Complete (2026-03-14) |
| FILT-01 | Phase 8 | Pending |
| FILT-02 | Phase 8 | Pending |
| FILT-03 | Phase 8 | Pending |
| DISC-01 | Phase 9 | Pending |
| DISC-02 | Phase 9 | Pending |
| DISC-03 | Phase 9 | Pending |

**Coverage:**
- v1.2 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — traceability populated after roadmap creation*
