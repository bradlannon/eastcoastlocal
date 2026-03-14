# Roadmap: East Coast Local

## Overview

Three phases with a strict dependency chain: stand up the project infrastructure and database schema first, build the scraping pipeline that populates it with real geocoded events second, then build the public-facing map and browse interface that turns those events into something people can use. Nothing in Phase 3 is buildable without Phase 2; Phase 2 schema decisions are expensive to change after data exists. The order is non-negotiable.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffold, Neon Postgres schema, Vercel deployment, configurable source list
- [ ] **Phase 2: Data Pipeline** - AI scraping, extraction, geocoding, deduplication, cron automation, platform API integration
- [ ] **Phase 3: Public Frontend** - Interactive map with clustering, event list, detail pages, filters, geolocation, mobile-responsive UI

## Phase Details

### Phase 1: Foundation
**Goal**: The project exists on Vercel with a live database, working migrations, and a configured list of scrape sources ready to receive data
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, SCRP-05, SCRP-06
**Success Criteria** (what must be TRUE):
  1. The app deploys to Vercel and returns a valid response at its public URL
  2. Neon Postgres database is connected and all migrations run without error
  3. The `events`, `venues`, and `scrape_sources` tables exist with the correct schema (composite dedup key, geocoordinate columns on venues, event_date index)
  4. An admin can add a scrape source URL to the `scrape_sources` table and it persists
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js 16 project with Drizzle schema, DB client, seed script, and tests
- [x] 01-02-PLAN.md — Deploy to Vercel, connect Neon Postgres, verify end-to-end

### Phase 2: Data Pipeline
**Goal**: The system automatically scrapes configured venue URLs on a schedule, extracts real Atlantic Canada events via LLM, geocodes venues, deduplicates across sources, and stores validated events in the database — hands-off
**Depends on**: Phase 1
**Requirements**: SCRP-01, SCRP-02, SCRP-03, SCRP-04, SCRP-07, SCRP-08, SCRP-09, SCRP-10
**Success Criteria** (what must be TRUE):
  1. Real events from at least 5 Atlantic Canada venue URLs appear in the database after a scrape run
  2. Events with missing or null dates are rejected and not stored
  3. Venues are geocoded once at import time and coordinates are cached on the venue record (not re-geocoded on each scrape)
  4. Scraping the same source twice does not create duplicate events (composite key deduplication via upsert)
  5. A Vercel cron job runs the full scrape pipeline daily without manual intervention
**Plans:** 2/3 plans executed

Plans:
- [ ] 02-01-PLAN.md — Core pipeline modules: fetcher, extractor (Gemini LLM), normalizer, geocoder with tests
- [ ] 02-02-PLAN.md — Eventbrite and Bandsintown API integration clients with tests
- [ ] 02-03-PLAN.md — Orchestrator, cron route, vercel.json config, end-to-end verification

### Phase 3: Public Frontend
**Goal**: Anyone can open the app, see live music events across Atlantic Canada on an interactive map, browse by date and location, and get to an event detail page with enough information to decide whether to go
**Depends on**: Phase 2
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08, MAP-09, INFR-02
**Success Criteria** (what must be TRUE):
  1. User can open the app and see a map centered on Atlantic Canada with event pins that cluster when zoomed out and expand to individual pins when zoomed in
  2. User can click a map pin and see event summary (band, venue, date, time) without leaving the map
  3. User can switch to a list view and filter events by Today, This Weekend, and This Week
  4. User can filter events by province or city and the map and list both update accordingly
  5. User can view an event detail page showing band, venue, full address, date, time, and a link to the original source
  6. The map loads and is interactive in under 3 seconds on broadband; all views are usable on a phone screen
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete    | 2026-03-14 |
| 2. Data Pipeline | 2/3 | In Progress|  |
| 3. Public Frontend | 0/TBD | Not started | - |
