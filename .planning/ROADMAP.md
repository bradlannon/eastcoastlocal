# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- ✅ **v1.3 Admin Tools** — Phases 10-13 (shipped 2026-03-15)
- ✅ **v1.4 More Scrapers** — Phases 14-17 (shipped 2026-03-15)
- ✅ **v1.5 Event Dedup & UX Polish** — Phases 18-21 (shipped 2026-03-15)
- ✅ **v2.0 Mass Venue Discovery** — Phases 22-25 (shipped 2026-03-16)
- **v2.1 Tech Debt Cleanup** — Phases 26-28 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 2: Data Pipeline (3/3 plans) — completed 2026-03-14
- [x] Phase 3: Public Frontend (3/3 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v1.1 Heatmap Timelapse (Phases 4-5) — SHIPPED 2026-03-14</summary>

- [x] Phase 4: Timelapse Core (4 plans) — completed 2026-03-14
- [x] Phase 5: Click-Through (2 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v1.2 Event Discovery (Phases 6-9) — SHIPPED 2026-03-15</summary>

- [x] Phase 6: Category Schema (1/1 plans) — completed 2026-03-14
- [x] Phase 7: AI Categorization (2/2 plans) — completed 2026-03-14
- [x] Phase 8: Category Filter UI (1/1 plans) — completed 2026-03-14
- [x] Phase 9: Source Discovery (2/2 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v1.3 Admin Tools (Phases 10-13) — SHIPPED 2026-03-15</summary>

- [x] Phase 10: Admin Auth (1/1 plans) — completed 2026-03-15
- [x] Phase 11: Admin Dashboard (1/1 plans) — completed 2026-03-15
- [x] Phase 12: Venue & Source Management (2/2 plans) — completed 2026-03-15
- [x] Phase 13: Discovery Review (2/2 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v1.4 More Scrapers (Phases 14-17) — SHIPPED 2026-03-15</summary>

- [x] Phase 14: Fetch Pipeline (2/2 plans) — completed 2026-03-15
- [x] Phase 15: Scrape Quality Metrics (1/1 plans) — completed 2026-03-15
- [x] Phase 16: Ticketmaster Integration (2/2 plans) — completed 2026-03-15
- [x] Phase 17: Auto-Approve Discovery (2/2 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v1.5 Event Dedup & UX Polish (Phases 18-21) — SHIPPED 2026-03-15</summary>

- [x] Phase 18: Venue Deduplication (2/2 plans) — completed 2026-03-15
- [x] Phase 19: UX Polish & Source Attribution (2/2 plans) — completed 2026-03-15
- [x] Phase 20: Admin Merge Review (2/2 plans) — completed 2026-03-15
- [x] Phase 21: Tech Debt Cleanup (1/1 plans) — completed 2026-03-15

</details>

<details>
<summary>✅ v2.0 Mass Venue Discovery (Phases 22-25) — SHIPPED 2026-03-16</summary>

- [x] Phase 22: Schema Foundation (2/2 plans) — completed 2026-03-16
- [x] Phase 23: Places API Discovery (3/3 plans) — completed 2026-03-16
- [x] Phase 24: Reddit Discovery (2/2 plans) — completed 2026-03-16
- [x] Phase 25: Admin Scale Tooling (3/3 plans) — completed 2026-03-16

</details>

**v2.1 Tech Debt Cleanup (Phases 26-28)**

- [ ] **Phase 26: Data Fixes** - Fix FK violation risk in dedup backfill, EventCard attribution, and remove dead phone column
- [ ] **Phase 27: Admin & Config** - Add no_website tab to discovery admin and make GEMINI_AUTO_APPROVE env-overridable
- [ ] **Phase 28: Tests & Validation** - Fix broken Ticketmaster unit tests and finalize Nyquist VALIDATION.md files

## Phase Details

### Phase 26: Data Fixes
**Goal**: Data integrity risks eliminated and attribution logic uses correct source data
**Depends on**: Nothing (data layer fixes are independent)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Running venue-dedup-backfill.ts --execute no longer risks FK violations — merged events/sources are re-parented before the duplicate venue is deleted
  2. EventCard attribution badge derives from event_sources.source_type column, not a string-match on source_url
  3. The phone column is absent from discovered_sources and venues tables — schema migration applied, no references remain in application code
**Plans:** 1/2 plans executed

Plans:
- [ ] 26-01-PLAN.md — Fix dedup backfill FK risk and drop phone column
- [ ] 26-02-PLAN.md — Fix EventCard attribution to use source_type

### Phase 27: Admin & Config
**Goal**: Admin can see all discovered venue stubs and configure auto-approve thresholds without code changes
**Depends on**: Phase 26
**Requirements**: ADMIN-01, ADMIN-02
**Success Criteria** (what must be TRUE):
  1. Admin navigating to /admin/discovery sees a "No Website" tab listing Places API venue stubs with no_website status
  2. The no_website tab shows the correct count of stubs and supports approve/reject actions
  3. GEMINI_AUTO_APPROVE threshold in places-discoverer reads from an environment variable with the existing hardcoded value as the fallback default
**Plans**: TBD

### Phase 28: Tests & Validation
**Goal**: Test suite passes cleanly and all Nyquist validation files reflect actual implementation
**Depends on**: Phase 27
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Running the test suite produces zero failures in ticketmaster.test.ts — the .limit() mock chain resolves correctly
  2. All 12 Nyquist VALIDATION.md files are finalized (not draft) with accurate pass/fail assessments
  3. CI test run exits with code 0 — no skipped or broken tests remain in the Ticketmaster test file
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-14 |
| 3. Public Frontend | v1.0 | 3/3 | Complete | 2026-03-14 |
| 4. Timelapse Core | v1.1 | 4/4 | Complete | 2026-03-14 |
| 5. Click-Through | v1.1 | 2/2 | Complete | 2026-03-14 |
| 6. Category Schema | v1.2 | 1/1 | Complete | 2026-03-14 |
| 7. AI Categorization | v1.2 | 2/2 | Complete | 2026-03-14 |
| 8. Category Filter UI | v1.2 | 1/1 | Complete | 2026-03-14 |
| 9. Source Discovery | v1.2 | 2/2 | Complete | 2026-03-15 |
| 10. Admin Auth | v1.3 | 1/1 | Complete | 2026-03-15 |
| 11. Admin Dashboard | v1.3 | 1/1 | Complete | 2026-03-15 |
| 12. Venue & Source Management | v1.3 | 2/2 | Complete | 2026-03-15 |
| 13. Discovery Review | v1.3 | 2/2 | Complete | 2026-03-15 |
| 14. Fetch Pipeline | v1.4 | 2/2 | Complete | 2026-03-15 |
| 15. Scrape Quality Metrics | v1.4 | 1/1 | Complete | 2026-03-15 |
| 16. Ticketmaster Integration | v1.4 | 2/2 | Complete | 2026-03-15 |
| 17. Auto-Approve Discovery | v1.4 | 2/2 | Complete | 2026-03-15 |
| 18. Venue Deduplication | v1.5 | 2/2 | Complete | 2026-03-15 |
| 19. UX Polish & Source Attribution | v1.5 | 2/2 | Complete | 2026-03-15 |
| 20. Admin Merge Review | v1.5 | 2/2 | Complete | 2026-03-15 |
| 21. Tech Debt Cleanup | v1.5 | 1/1 | Complete | 2026-03-15 |
| 22. Schema Foundation | v2.0 | 2/2 | Complete | 2026-03-16 |
| 23. Places API Discovery | v2.0 | 3/3 | Complete | 2026-03-16 |
| 24. Reddit Discovery | v2.0 | 2/2 | Complete | 2026-03-16 |
| 25. Admin Scale Tooling | v2.0 | 3/3 | Complete | 2026-03-16 |
| 26. Data Fixes | 1/2 | In Progress|  | - |
| 27. Admin & Config | v2.1 | 0/? | Not started | - |
| 28. Tests & Validation | v2.1 | 0/? | Not started | - |
