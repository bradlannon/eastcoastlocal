# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- ✅ **v1.3 Admin Tools** — Phases 10-13 (shipped 2026-03-15)
- ✅ **v1.4 More Scrapers** — Phases 14-17 (shipped 2026-03-15)
- ✅ **v1.5 Event Dedup & UX Polish** — Phases 18-21 (shipped 2026-03-15)
- ✅ **v2.0 Mass Venue Discovery** — Phases 22-25 (shipped 2026-03-16)
- ✅ **v2.1 Tech Debt Cleanup** — Phases 26-28 (shipped 2026-03-16)
- 🚧 **v2.2 Event Data Quality** — Phases 29-32 (in progress)

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

<details>
<summary>✅ v2.1 Tech Debt Cleanup (Phases 26-28) — SHIPPED 2026-03-16</summary>

- [x] Phase 26: Data Fixes (2/2 plans) — completed 2026-03-16
- [x] Phase 27: Admin & Config (1/1 plans) — completed 2026-03-16
- [x] Phase 28: Tests & Validation (2/2 plans) — completed 2026-03-16

</details>

### v2.2 Event Data Quality (In Progress)

**Milestone Goal:** Make event data trustworthy by handling recurring events as grouped series and archiving past events to keep the UI fresh.

- [x] **Phase 29: Schema Foundation** - Add archived_at and series_id columns to events; create recurring_series table (completed 2026-03-16)
- [ ] **Phase 30: Archival** - Daily cron soft-archives past events; API excludes archived events; upsert guards against unarchival
- [ ] **Phase 31: Series Detection** - Post-scrape enrichment detects recurring performers per venue; backfill existing events
- [ ] **Phase 32: Series UI** - Recurring badge on EventCard; list view collapses series to next occurrence

## Phase Details

### Phase 29: Schema Foundation
**Goal**: The database has the structural columns and table that all v2.2 features depend on — deployed non-destructively with no existing queries broken
**Depends on**: Phase 28
**Requirements**: ARCH-01, SER-01
**Success Criteria** (what must be TRUE):
  1. The events table has an archived_at nullable TIMESTAMPTZ column (default NULL, no existing rows affected)
  2. The events table has a series_id nullable FK column referencing recurring_series
  3. The recurring_series table exists with (venue_id, normalized_performer) unique index enforcing venue-scoped series at the DB level
  4. Drizzle InferSelectModel propagates archived_at and series_id to the TypeScript Event type automatically
  5. The Gemini extraction Zod schema accepts an optional recurrence_pattern hint field
**Plans:** 1/1 plans complete
Plans:
- [x] 29-01-PLAN.md — Schema additions (archived_at, series_id, recurring_series table) + Zod recurrence_pattern field

### Phase 30: Archival
**Goal**: Past events disappear from the public map and list automatically each day, without destroying dedup anchors or unarchiving events that get re-scraped
**Depends on**: Phase 29
**Requirements**: ARCH-02, ARCH-03, ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):
  1. The public map and event list show no events whose date has passed (archived_at IS NULL guard in /api/events)
  2. A daily cron at /api/cron/archive archives past events using Atlantic timezone threshold (not UTC midnight)
  3. Re-scraping an already-archived event leaves archived_at unchanged (COALESCE guard in upsertEvent ON CONFLICT clause)
  4. Admin can view a dedicated archived events tab showing all soft-archived events
**Plans:** 2 plans
Plans:
- [ ] 30-01-PLAN.md — Archive cron, public API filter, upsert guard (ARCH-02, ARCH-03, ARCH-04)
- [ ] 30-02-PLAN.md — Admin archived events tab with pagination (ARCH-05)

### Phase 31: Series Detection
**Goal**: Recurring performer-at-venue patterns are detected automatically after each scrape and tagged on event rows, with all existing events backfilled on first run
**Depends on**: Phase 30
**Requirements**: SER-02, SER-03, SER-04, SER-05, SER-06
**Success Criteria** (what must be TRUE):
  1. After a scrape completes, events for the same performer at the same venue appearing on multiple same-weekday dates are linked to a recurring_series row via series_id
  2. Events whose performer name contains explicit recurrence keywords ("every", "weekly", "open mic", "trivia", "bingo") are tagged regardless of occurrence count
  3. Minor name variations (~20% Levenshtein tolerance) are grouped into the same series rather than creating separate series
  4. Gemini extraction produces a recurrence_pattern hint that the detector uses as a signal
  5. All existing events in the database are backfilled with series_id on the first detection run
**Plans**: TBD

### Phase 32: Series UI
**Goal**: Users see a visual trust signal on recurring events and the event list collapses weekly series so the same performer does not occupy multiple rows
**Depends on**: Phase 31
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. EventCard displays a "Recurring" badge when the event's series_id is not null
  2. The event list shows one card per series (the next upcoming occurrence) rather than a separate card for every future date
  3. The collapsed series card shows how many upcoming occurrences exist in the series
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
| 26. Data Fixes | v2.1 | 2/2 | Complete | 2026-03-16 |
| 27. Admin & Config | v2.1 | 1/1 | Complete | 2026-03-16 |
| 28. Tests & Validation | v2.1 | 2/2 | Complete | 2026-03-16 |
| 29. Schema Foundation | v2.2 | 1/1 | Complete | 2026-03-16 |
| 30. Archival | v2.2 | 0/2 | Not started | - |
| 31. Series Detection | v2.2 | 0/? | Not started | - |
| 32. Series UI | v2.2 | 0/? | Not started | - |
