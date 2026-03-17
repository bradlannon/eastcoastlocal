# Requirements: East Coast Local

**Defined:** 2026-03-16
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v2.2 Requirements

Requirements for event data quality. Each maps to roadmap phases.

### Archival

- [x] **ARCH-01**: Events past their date are soft-archived via archived_at timestamp (not deleted)
- [x] **ARCH-02**: Daily cron archives past events using Atlantic timezone threshold
- [x] **ARCH-03**: Events API excludes archived events from public map and list
- [x] **ARCH-04**: Re-scraping an archived event does not unarchive it (COALESCE guard in upsert)
- [x] **ARCH-05**: Admin can view archived events in a dedicated tab

### Series Detection

- [x] **SER-01**: recurring_series table stores series metadata scoped to (venue_id, normalized_performer)
- [x] **SER-02**: Post-scrape enrichment detects recurring patterns (same performer + venue + regular weekday interval)
- [x] **SER-03**: Keyword heuristic detects explicit recurrence signals ("every", "weekly", "open mic", etc.)
- [x] **SER-04**: Fuzzy name matching (~20% Levenshtein) groups minor name variations into same series
- [ ] **SER-05**: Gemini extraction includes optional recurrence_pattern hint from page content
- [ ] **SER-06**: Existing events backfilled with series detection on first run

### Series UI

- [ ] **UI-01**: EventCard shows "Recurring" badge when event belongs to a series
- [ ] **UI-02**: Event list collapses recurring series to next occurrence with occurrence count

## Future Requirements

None — focused data quality milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hard delete of past events | Destroys dedup anchors; future scrapes re-import same events |
| RRULE-based recurrence generation | Wrong tool for scraped discrete events; rrule npm package abandoned |
| "Recurring events only" filter chip | Wait until series coverage is broad enough to be useful |
| Series confidence score + admin review queue | Defer until detection volume needs triage |
| Hard purge of events archived > 90 days | Storage costs at Atlantic Canada scale are negligible |
| Public "past events" tab | Heatmap covers historical density use cases |
| Admin series management UI (merge/split) | Defer until detection accuracy is validated |
| Real-time series detection on event insert | O(n) per insert; use post-scrape enrichment pass instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 29 | Complete |
| ARCH-02 | Phase 30 | Complete |
| ARCH-03 | Phase 30 | Complete |
| ARCH-04 | Phase 30 | Complete |
| ARCH-05 | Phase 30 | Complete |
| SER-01 | Phase 29 | Complete |
| SER-02 | Phase 31 | Complete |
| SER-03 | Phase 31 | Complete |
| SER-04 | Phase 31 | Complete |
| SER-05 | Phase 31 | Pending |
| SER-06 | Phase 31 | Pending |
| UI-01 | Phase 32 | Pending |
| UI-02 | Phase 32 | Pending |

**Coverage:**
- v2.2 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after roadmap creation*
