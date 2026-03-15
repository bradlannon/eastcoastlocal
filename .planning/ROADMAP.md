# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- ✅ **v1.3 Admin Tools** — Phases 10-13 (shipped 2026-03-15)
- 🔄 **v1.4 More Scrapers** — Phases 14-17 (in progress)

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

### v1.4 More Scrapers (Phases 14-17)

- [x] **Phase 14: Fetch Pipeline** — Schema migration, rate limiting, multi-page support, retry logic, and Google JSON-LD extraction (completed 2026-03-15)
- [ ] **Phase 15: Scrape Quality Metrics** — Per-source quality tracking instrumented in orchestrator; admin dashboard visibility
- [ ] **Phase 16: Ticketmaster Integration** — Ticketmaster Discovery API pulling major Atlantic Canada ticketed events into the map
- [ ] **Phase 17: Auto-Approve Discovery** — High-confidence discovered sources promoted automatically; admin can review and revoke

## Phase Details

### Phase 14: Fetch Pipeline
**Goal**: The scraping pipeline reliably fetches all pages of a venue website, respects per-domain rate limits, retries transient failures, and extracts structured event data from JSON-LD before falling back to Gemini
**Depends on**: Phase 13 (deployed pipeline)
**Requirements**: SCRP-01, SCRP-02, SCRP-03, PLAT-04
**Success Criteria** (what must be TRUE):
  1. Venue websites with events on page 2 or 3 now produce those events in the database after a scrape run (up to a 3-page hard cap)
  2. Multiple sources on the same domain are not blocked during a scrape run — the per-domain delay is visible in orchestrator logs
  3. A source that fails with a transient HTTP error is retried automatically with exponential backoff before being logged as failed
  4. Venue pages containing schema.org Event JSON-LD produce events without a Gemini API call (visible via confidence=1.0 on extracted events)
**Plans:** 2/2 plans complete
Plans:
- [ ] 14-01-PLAN.md — Enhanced fetcher (retry, rate limit, multi-page) + JSON-LD extraction module + schema migration
- [ ] 14-02-PLAN.md — Orchestrator integration (JSON-LD fast path, multi-page wiring, HTTP throttle)

### Phase 15: Scrape Quality Metrics
**Goal**: Admins can see the health of each scrape source at a glance — how many events it yields, how often it fails, and whether it needs attention
**Depends on**: Phase 14 (schema columns, instrumented fetcher)
**Requirements**: SCRP-04
**Success Criteria** (what must be TRUE):
  1. The admin source list shows event count, average confidence, and consecutive failure count for each source
  2. Sources with 3 or more consecutive failures are visually flagged in the admin UI
  3. Metric values update after each scrape run without manual intervention
**Plans**: TBD

### Phase 16: Ticketmaster Integration
**Goal**: Major Atlantic Canada ticketed events from Scotiabank Centre, Avenir Centre, and other large venues appear on the map, sourced from Ticketmaster's Discovery API
**Depends on**: Phase 14 (stable, instrumented pipeline), Phase 15 (quality metrics capture TM source health from day one)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. Events from large Atlantic Canada venues appear on the map daily, sourced from Ticketmaster
  2. Ticketmaster events display "via Ticketmaster" attribution and link back to the TM event page
  3. A Ticketmaster event for a venue that already exists in the database is matched to that venue rather than creating a duplicate
  4. A Ticketmaster event for a venue not yet in the database results in a new venue being auto-created with geocoding
**Plans**: TBD

### Phase 17: Auto-Approve Discovery
**Goal**: High-confidence discovered venue sources are promoted to active scraping automatically, reducing the admin review queue without introducing noise into the pipeline
**Depends on**: Phase 14 (discovery_score schema column added in Phase 14 migration)
**Requirements**: DISC-05, DISC-06
**Success Criteria** (what must be TRUE):
  1. After a discovery run, candidates scoring 0.8 or higher are promoted to active scrape sources without any admin action
  2. Auto-approved sources appear in the admin discovery UI with a distinct label (e.g., "auto-approved") so they are identifiable
  3. An admin can revoke an auto-approved source from the admin UI, returning it to a reviewable state or disabling it
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
| 14. Fetch Pipeline | 2/2 | Complete   | 2026-03-15 | - |
| 15. Scrape Quality Metrics | v1.4 | 0/? | Not started | - |
| 16. Ticketmaster Integration | v1.4 | 0/? | Not started | - |
| 17. Auto-Approve Discovery | v1.4 | 0/? | Not started | - |
