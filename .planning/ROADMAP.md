# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- ✅ **v1.3 Admin Tools** — Phases 10-13 (shipped 2026-03-15)
- ✅ **v1.4 More Scrapers** — Phases 14-17 (shipped 2026-03-15)
- ✅ **v1.5 Event Dedup & UX Polish** — Phases 18-21 (shipped 2026-03-15)
- 🚧 **v2.0 Mass Venue Discovery** — Phases 22-25 (in progress)

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

### v2.0 Mass Venue Discovery (In Progress)

**Milestone Goal:** Scale venue coverage from ~26 curated venues to hundreds across Atlantic Canada via Google Maps Places API bulk discovery, Reddit mining, expanded geographic coverage, and aggressive auto-approval.

- [x] **Phase 22: Schema Foundation** - Migrate schema to support google_place_id and pre-geocoded coordinates across the discovery pipeline (completed 2026-03-16)
- [x] **Phase 23: Places API Discovery** - Build and wire the Places API discoverer with expanded city coverage, per-method scoring, and production cron scheduling (completed 2026-03-16)
- [ ] **Phase 24: Reddit Discovery** - Add Reddit subreddit mining as a supplemental discovery channel with Gemini extraction
- [ ] **Phase 25: Admin Scale Tooling** - Reduce admin review friction with batch approve, discovery run metrics, and dashboard summary

## Phase Details

### Phase 22: Schema Foundation
**Goal**: The database schema supports structured discovery data — pre-geocoded coordinates, google_place_id, and address — so that Places API candidates can flow through the pipeline without redundant geocoding calls
**Depends on**: Phase 21
**Requirements**: SCHEMA-01, SCHEMA-02
**Success Criteria** (what must be TRUE):
  1. discovered_sources rows can store address, lat, lng, and google_place_id without a workaround
  2. venues rows have a google_place_id column available for dedup anchoring
  3. Migration runs cleanly against the Neon Postgres instance with no data loss to existing rows
  4. Existing pipeline (insert, promote, score) continues to work after migration
**Plans:** 2/2 plans complete
Plans:
- [ ] 22-01-PLAN.md — Add columns and indexes to schema, generate and apply migration 0007
- [ ] 22-02-PLAN.md — Update promoteSource() to carry structured data through to venues

### Phase 23: Places API Discovery
**Goal**: The system discovers hundreds of Atlantic Canada venues per week via Google Maps Places API, automatically scores and stages candidates across ~30 cities and all 4 provinces, and runs as an isolated cron endpoint that does not compete with existing discovery jobs for the 60-second timeout budget
**Depends on**: Phase 22
**Requirements**: PLACES-01, PLACES-02, PLACES-03, PLACES-04, PLACES-05, PLACES-06, PLACES-07, GEO-01, GEO-02, GEO-03, SCORE-01, SCORE-02, SCORE-03
**Success Criteria** (what must be TRUE):
  1. Running the Places discovery cron produces staged candidates in discovered_sources covering cities across all 4 Atlantic provinces
  2. Only venue-relevant place types (bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium) appear as candidates
  3. Venues already in the database are not re-staged as duplicates
  4. Venues without a website are staged with status no_website rather than discarded
  5. Places candidates auto-approve at 0.8 threshold; Reddit-sourced candidates use 0.9; each discovery channel runs on its own cron schedule within the 60-second limit
**Plans:** 3/3 plans complete
Plans:
- [ ] 23-01-PLAN.md — Types, city list, scoring/filtering functions, promoteSource no_website update
- [ ] 23-02-PLAN.md — Core discoverer: searchCity, pagination, dedup, staging, runPlacesDiscovery
- [ ] 23-03-PLAN.md — 4 province cron endpoints, vercel.json schedules, Gemini threshold update

### Phase 24: Reddit Discovery
**Goal**: The system supplements Places API coverage by mining Atlantic Canada subreddits for venue and event mentions, extracting structured data via Gemini, and flowing candidates through the existing discovered_sources pipeline
**Depends on**: Phase 23
**Requirements**: REDDIT-01, REDDIT-02, REDDIT-03, REDDIT-04
**Success Criteria** (what must be TRUE):
  1. Running the Reddit discovery cron produces staged candidates sourced from Atlantic Canada subreddits
  2. Extracted candidates include structured venue name and location data derived from post text via Gemini
  3. Reddit candidates are tagged with discovery_method = reddit_gemini and flow through the existing staging pipeline
  4. Province-specific subreddits are configurable and each maps to the correct province
**Plans:** 1/2 plans executed
Plans:
- [ ] 24-01-PLAN.md — Core reddit-discoverer module with TDD tests
- [ ] 24-02-PLAN.md — Cron endpoint and vercel.json schedule

### Phase 25: Admin Scale Tooling
**Goal**: Admin can process a high volume of staged discovery candidates efficiently — batch-approving multiple candidates at once, and seeing discovery run health at a glance on the dashboard
**Depends on**: Phase 22
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Admin can select multiple discovered sources via checkboxes and approve them in a single action
  2. Each discovery run logs candidate counts (found, auto-approved, queued for review, errors)
  3. Admin dashboard shows a summary of the most recent discovery run without navigating to a separate page
**Plans**: TBD

## Progress

**Execution Order:** 22 → 23 → 24 → 25 (Phase 25 depends only on Phase 22; can execute after Phase 22 completes if Phase 23/24 are in flight)

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
| 23. Places API Discovery | 3/3 | Complete    | 2026-03-16 | - |
| 24. Reddit Discovery | 1/2 | In Progress|  | - |
| 25. Admin Scale Tooling | v2.0 | 0/TBD | Not started | - |
