# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- ✅ **v1.3 Admin Tools** — Phases 10-13 (shipped 2026-03-15)
- ✅ **v1.4 More Scrapers** — Phases 14-17 (shipped 2026-03-15)
- 🔄 **v1.5 Event Dedup & UX Polish** — Phases 18-21 (in progress)

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

### v1.5 Event Dedup & UX Polish (Phases 18-21)

- [x] **Phase 18: Venue Deduplication** — Two-signal fuzzy merge of TM-created duplicate venue rows; cross-source event dedup falls out automatically (completed 2026-03-15)
- [x] **Phase 19: UX Polish & Source Attribution** — Zoom-to-location on event cards, category chips in timelapse mode, and event source tracking join table (completed 2026-03-15)
- [x] **Phase 20: Admin Merge Review** — Admin UI for surfacing and resolving borderline venue merge candidates logged in Phase 18
 (completed 2026-03-15)
- [x] **Phase 21: Tech Debt Cleanup** — COALESCE fix for ticket_link, orphaned export removal, eventCount badge accuracy (gap closure) (completed 2026-03-15)
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
**Plans**: 2/2 plans complete

### Phase 15: Scrape Quality Metrics
**Goal**: Admins can see the health of each scrape source at a glance — how many events it yields, how often it fails, and whether it needs attention
**Depends on**: Phase 14 (schema columns, instrumented fetcher)
**Requirements**: SCRP-04
**Success Criteria** (what must be TRUE):
  1. The admin source list shows event count, average confidence, and consecutive failure count for each source
  2. Sources with 3 or more consecutive failures are visually flagged in the admin UI
  3. Metric values update after each scrape run without manual intervention
**Plans**: 1/1 plans complete

### Phase 16: Ticketmaster Integration
**Goal**: Major Atlantic Canada ticketed events from Scotiabank Centre, Avenir Centre, and other large venues appear on the map, sourced from Ticketmaster's Discovery API
**Depends on**: Phase 14 (stable, instrumented pipeline), Phase 15 (quality metrics capture TM source health from day one)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. Events from large Atlantic Canada venues appear on the map daily, sourced from Ticketmaster
  2. Ticketmaster events display "via Ticketmaster" attribution and link back to the TM event page
  3. A Ticketmaster event for a venue that already exists in the database is matched to that venue rather than creating a duplicate
  4. A Ticketmaster event for a venue not yet in the database results in a new venue being auto-created with geocoding
**Plans**: 2/2 plans complete

### Phase 17: Auto-Approve Discovery
**Goal**: High-confidence discovered venue sources are promoted to active scraping automatically, reducing the admin review queue without introducing noise into the pipeline
**Depends on**: Phase 14 (discovery_score schema column added in Phase 14 migration)
**Requirements**: DISC-05, DISC-06
**Success Criteria** (what must be TRUE):
  1. After a discovery run, candidates scoring 0.8 or higher are promoted to active scrape sources without any admin action
  2. Auto-approved sources appear in the admin discovery UI with a distinct label (e.g., "auto-approved") so they are identifiable
  3. An admin can revoke an auto-approved source from the admin UI, returning it to a reviewable state or disabling it
**Plans**: 2/2 plans complete

### Phase 18: Venue Deduplication
**Goal**: TM-created venue rows that duplicate an existing canonical venue are automatically merged, and cross-source duplicate events are eliminated as a direct consequence
**Depends on**: Phase 17 (stable TM pipeline producing venue rows to deduplicate)
**Requirements**: DEDUP-01, DEDUP-02, DEDUP-03
**Success Criteria** (what must be TRUE):
  1. After a Ticketmaster ingest, a TM-created venue with the same name and location as an existing venue is merged into the canonical row — no duplicate venue pin appears on the map
  2. The same event appearing from both a TM ingest and a venue website scrape shows as a single event, not two identical entries
  3. Merge candidates that match on name but not geo (or geo but not name) are written to a review log and not auto-merged
  4. A dry-run mode logs all merge candidates with scores without executing any merges, enabling threshold validation before enabling production auto-merge
**Plans**: 2 plans
Plans:
- [ ] 18-01-PLAN.md — TDD: venue-dedup scoring module with full test coverage
- [ ] 18-02-PLAN.md — Integration: wire dedup into TM pipeline, schema migration, dry-run CLI

### Phase 19: UX Polish & Source Attribution
**Goal**: Users can navigate directly from event cards to venue locations on the map, category filters are accessible in timelapse mode, and the system records which source each event was discovered from
**Depends on**: Phase 18 (clean venue data makes source tracking meaningful; frontend features are independent but ship together for coherent UX release)
**Requirements**: UX-01, UX-02, ATTR-01, ATTR-02
**Success Criteria** (what must be TRUE):
  1. Clicking "Show on map" on any event card smoothly animates the map to the venue location at zoom level 15 with the venue marker highlighted
  2. Category filter chips are visible and interactive while the heatmap timelapse is playing — selecting a chip filters both the heatmap intensity and the event list sidebar
  3. Each event row in the database records the source(s) it was seen from in an event_sources join table — queryable by source_type and source_id
  4. When a cross-source event match occurs and the existing row has no ticket link, the incoming ticket link is applied non-destructively
**Plans**: 2 plans
Plans:
- [ ] 19-01-PLAN.md — Frontend UX: map-pin icon on EventCard, CategoryChipsRow in timelapse overlay
- [ ] 19-02-PLAN.md — Backend: event_sources join table, upsertEvent source tracking, COALESCE source_url

### Phase 20: Admin Merge Review
**Goal**: Admin can inspect and resolve borderline venue merge candidates that Phase 18 logged but did not auto-merge, preventing permanent data gaps from under-merging
**Depends on**: Phase 18 (borderline case log must exist and contain real production data before designing the review UI)
**Requirements**: DEDUP-04
**Success Criteria** (what must be TRUE):
  1. Admin can see a list of near-match venue pairs queued for review, showing name, address, and coordinates side by side
  2. Admin can merge a pair with one click — the duplicate venue's events and sources are reassigned to the canonical venue and the duplicate row is removed
  3. Admin can mark a pair as "keep separate" so it no longer appears in the review queue
**Plans**: 2 plans
Plans:
- [ ] 20-01-PLAN.md — Backend: merge utility, server actions, ticketmaster dedup guard
- [ ] 20-02-PLAN.md — Frontend: merge review page UI, admin nav badge

### Phase 21: Tech Debt Cleanup
**Goal**: Close the ATTR-02 integration gap (ticket_link COALESCE), remove orphaned exports, and fix cosmetic eventCount badge — clearing all tech debt from v1.5 audit
**Depends on**: Phase 19 (normalizer.ts COALESCE fix), Phase 18 (orphaned findBestMatch export)
**Requirements**: ATTR-02
**Gap Closure:** Closes gaps from v1.5 audit
**Success Criteria** (what must be TRUE):
  1. `normalizer.ts` uses COALESCE for `ticket_link` the same way `source_url` already does — a scraper upsert with null ticket_link does not overwrite an existing TM link
  2. The orphaned `findBestMatch` export in the venue dedup module is removed (ticketmaster.ts has its own inline implementation)
  3. `CategoryChipsRow` eventCount badge reflects the map-wide category count, not the bounds-clipped sidebar count
**Plans**: 1 plan
Plans:
- [ ] 21-01-PLAN.md — Gap closure: ticket_link COALESCE, findBestMatch removal, eventCount badge fix

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
| 21. Tech Debt Cleanup | 1/1 | Complete    | 2026-03-15 | — |
