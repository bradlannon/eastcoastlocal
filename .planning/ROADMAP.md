# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- 🚧 **v1.2 Event Discovery** — Phases 6-9 (in progress)

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

### 🚧 v1.2 Event Discovery (In Progress)

**Milestone Goal:** Automatically discover new event sources across Atlantic Canada, expand beyond live music to all event types, and let users filter by category.

- [ ] **Phase 6: Category Schema** - DB migration that gates all v1.2 work
- [x] **Phase 7: AI Categorization** - Extend extraction to classify events; backfill existing data (completed 2026-03-14)
- [ ] **Phase 8: Category Filter UI** - Let users filter map and list by event category
- [ ] **Phase 9: Source Discovery** - Automatically find and stage new event venues

## Phase Details

### Phase 6: Category Schema
**Goal**: The database has the schema v1.2 requires — events carry a category column and a staging table exists for discovered sources
**Depends on**: Phase 5 (v1.1 complete)
**Requirements**: CAT-03
**Success Criteria** (what must be TRUE):
  1. The `events` table has an `event_category` column accepting the 8-value taxonomy (live_music, comedy, theatre, arts, sports, festival, community, other)
  2. The `discovered_sources` staging table exists with status, domain, and source URL columns
  3. Drizzle migration files exist and have been applied to the production Neon database without breaking existing data
  4. A backfill script exists and is ready to run immediately after the next phase ships categories
**Plans:** 1 plan
Plans:
- [~] 06-01-PLAN.md — Schema migration: pgEnum + event_category column + discovered_sources table + backfill script (awaiting human verification)

### Phase 7: AI Categorization
**Goal**: Every event — new and existing — carries an AI-assigned category from the fixed taxonomy
**Depends on**: Phase 6
**Requirements**: CAT-01, CAT-02
**Success Criteria** (what must be TRUE):
  1. Newly scraped events have a non-null `event_category` value drawn from the 8-value taxonomy
  2. The extractor accepts all event types (not just live music) — comedy, theatre, festivals, community events are extracted
  3. All existing events in the database have been backfilled with a category (no null categories remain at feature launch)
  4. Category values are constrained by `z.enum()` — the LLM cannot produce values outside the taxonomy
**Plans:** 2/2 plans complete
Plans:
- [ ] 07-01-PLAN.md — Wire event_category into extraction pipeline: schema, prompt, normalizer, third-party scrapers
- [ ] 07-02-PLAN.md — Run backfill script and verify no null categories remain

### Phase 8: Category Filter UI
**Goal**: Users can filter the map and event list by event category using chip buttons, with filter state persisted in the URL
**Depends on**: Phase 7
**Requirements**: FILT-01, FILT-02, FILT-03
**Success Criteria** (what must be TRUE):
  1. A horizontal chip row appears in the filter UI with "All" plus one chip per category; selecting a chip filters both the map pins and the event sidebar to matching events only
  2. Switching to heatmap mode with a category selected shows only events of that category in the heatmap intensity
  3. The selected category is preserved in the URL as a `?category=` parameter — copying and sharing the URL reproduces the same filtered view
  4. A category badge is visible on event cards and event detail pages
**Plans:** 1 plan
Plans:
- [ ] 08-01-PLAN.md — Filter function + chip UI + category badges + URL persistence

### Phase 9: Source Discovery
**Goal**: The system automatically finds new Atlantic Canada event venues on a weekly schedule and stages them for review before any scraping occurs
**Depends on**: Phase 6
**Requirements**: DISC-01, DISC-02, DISC-03
**Success Criteria** (what must be TRUE):
  1. A weekly discovery cron runs independently of the daily scrape cron and populates `discovered_sources` with candidate venue URLs it found via Gemini + Google Search grounding
  2. Discovered sources land in the staging table with `pending` status — no new source is automatically added to the active scrape queue
  3. Domain-based deduplication prevents already-configured venues from appearing as new candidates
  4. A promotion mechanism (script or endpoint) moves an approved staged source into `scrape_sources` so it will be scraped on the next cron run
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-14 |
| 3. Public Frontend | v1.0 | 3/3 | Complete | 2026-03-14 |
| 4. Timelapse Core | v1.1 | 4/4 | Complete | 2026-03-14 |
| 5. Click-Through | v1.1 | 2/2 | Complete | 2026-03-14 |
| 6. Category Schema | v1.2 | 0/1 | In Progress (checkpoint) | - |
| 7. AI Categorization | 2/2 | Complete   | 2026-03-14 | - |
| 8. Category Filter UI | v1.2 | 0/1 | Not started | - |
| 9. Source Discovery | v1.2 | 0/TBD | Not started | - |
