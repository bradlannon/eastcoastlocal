# Requirements: East Coast Local

**Defined:** 2026-03-16
**Core Value:** Users can instantly see what events are happening near them on a map — where, when, and what type

## v2.1 Requirements

Requirements for tech debt cleanup. Each maps to roadmap phases.

### Data Integrity

- [ ] **DATA-01**: venue-dedup-backfill.ts --execute mode uses performVenueMerge to avoid FK violations
- [ ] **DATA-02**: EventCard attribution uses event_sources.source_type instead of source_url string-match
- [ ] **DATA-03**: phone column removed from discovered_sources and venues (never populated by any discoverer)

### Admin & Config

- [ ] **ADMIN-01**: /admin/discovery shows no_website tab for Places API venue stubs
- [ ] **ADMIN-02**: GEMINI_AUTO_APPROVE threshold in places-discoverer is env-overridable

### Tests & Validation

- [ ] **TEST-01**: 2 broken ticketmaster.test.ts unit tests fixed (incomplete .limit() mock)
- [ ] **TEST-02**: Nyquist VALIDATION.md files finalized across 12 phases

## Future Requirements

None — this is a cleanup milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New data sources or integrations | Cleanup only — no new features |
| UI redesign or new pages | Only fixing missing no_website tab |
| Performance optimization | No performance issues identified |
| New AI provider integrations | Claude toggle already shipped separately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 26 | Pending |
| DATA-02 | Phase 26 | Pending |
| DATA-03 | Phase 26 | Pending |
| ADMIN-01 | Phase 27 | Pending |
| ADMIN-02 | Phase 27 | Pending |
| TEST-01 | Phase 28 | Pending |
| TEST-02 | Phase 28 | Pending |

**Coverage:**
- v2.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after roadmap creation*
