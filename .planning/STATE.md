---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-03-PLAN.md — Phase 03 public frontend complete
last_updated: "2026-03-14T06:43:49.057Z"
last_activity: 2026-03-14 — Orchestrator, cron route, vercel.json complete; 57 tests passing
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Users can instantly see what live music is happening near them on a map — where, when, and who's playing
**Current focus:** Phase 2 — Data Pipeline

## Current Position

Phase: 2 of 3 (Data Pipeline)
Plan: 3 of 3 in current phase (awaiting human-verify checkpoint)
Status: In progress — checkpoint:human-verify Task 3
Last activity: 2026-03-14 — Orchestrator, cron route, vercel.json complete; 57 tests passing

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 10 | 2 tasks | 17 files |
| Phase 02-data-pipeline P02 | 3 | 1 tasks | 6 files |
| Phase 02-data-pipeline P01 | 306 | 2 tasks | 10 files |
| Phase 02-data-pipeline P03 | 6 | 3 tasks | 4 files |
| Phase 03-public-frontend P01 | 5 | 3 tasks | 9 files |
| Phase 03-public-frontend P02 | 15 | 2 tasks | 12 files |
| Phase 03-public-frontend P03 | 4 | 1 tasks | 9 files |
| Phase 03-public-frontend P03 | 30 | 2 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Stack: Next.js 16, Neon Postgres, Drizzle ORM, react-leaflet 5.x, Vercel AI SDK + GPT-4o mini (see research/SUMMARY.md)
- Scraping: cheerio for HTML preprocessing before LLM; never scrape Eventbrite/Bandsintown HTML — use their APIs
- Geocoding: production geocoder (OpenCage or Google Maps), NOT Nominatim; geocode once at venue creation, cache on venues table
- Deduplication: composite key (normalized venue name + event date + normalized artist name); upsert-based
- [Phase 01-foundation]: Use integer() not serial() for FK columns — serial auto-generates values, integer references existing rows
- [Phase 01-foundation]: Lazy Proxy-based DB client in client.ts — defers DATABASE_URL requirement to query time, not module import time
- [Phase 01-foundation]: Seed data in seed-data.ts separate from seed.ts — enables unit testing without DB connection
- [Phase 01-02]: Neon-Vercel integration auto-injects DATABASE_URL — no manual env var management needed
- [Phase 01-02]: Migrations run in build step (npm run db:migrate && next build) — schema is always current before first request
- [Phase 02-data-pipeline]: API source URLs use colon-separated scheme (eventbrite:org:ID, bandsintown:artist:NAME) stored in scrape_sources.url
- [Phase 02-data-pipeline]: Atlantic Canada Set filter includes full province names and short codes for Bandsintown region field robustness
- [Phase 02-01]: normalizePerformer removes non-alphanumeric chars without space replacement (AC/DC -> acdc)
- [Phase 02-01]: geocodeAddress rejects APPROXIMATE precision, accepts ROOFTOP and RANGE_INTERPOLATED
- [Phase 02-01]: extractEvents uses generateText + Output.object (AI SDK 6), not generateObject
- [Phase 02-03]: Orchestrator queries venues separately (not relational) due to Neon HTTP driver constraints
- [Phase 02-03]: Per-source try/catch in orchestrator ensures single failure never aborts full scrape run
- [Phase 02-03]: maxDuration=60 in cron route for Vercel Hobby plan (Pro allows 300)
- [Phase 02-03]: Orchestrator queries venues separately (not relational) due to Neon HTTP driver constraints with Drizzle
- [Phase 02-03]: Per-source try/catch in orchestrator ensures single failure never aborts full scrape run
- [Phase 02-03]: maxDuration=60 in cron route for Vercel Hobby plan (Pro allows 300)
- [Phase 03-public-frontend]: filterByBounds uses plain object bounds (not Leaflet LatLngBounds) for testability without Leaflet in test env
- [Phase 03-public-frontend]: MapClientWrapper exported as placeholder component from MapWrapper.tsx — will become dynamic import when MapClient.tsx is built in Plan 03-02
- [Phase 03-public-frontend]: MapClientWrapper extracted to separate file — next/dynamic with ssr:false cannot live in Server-Component-importable files
- [Phase 03-public-frontend]: Suspense boundary wrapping HomeContent required — nuqs useQueryState uses useSearchParams, which Next.js requires inside Suspense for static prerendering
- [Phase 03-public-frontend]: markersRef pattern: ClusterLayer populates Map<venueId, L.Marker> via ref callback; MapViewController reads it on moveend to call openPopup() after flyTo
- [Phase 03-public-frontend]: markersRef pattern: ClusterLayer populates Map<venueId, L.Marker> via ref callback; MapViewController reads it on moveend to call openPopup() after flyTo
- [Phase 03-public-frontend]: MapBoundsTracker stabilizes onBoundsChange via ref to prevent useMapEvents re-registration loop
- [Phase 03-public-frontend]: MapViewController removes moveend listener before openPopup() to prevent recursive call stack from popup auto-pan

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 flag: LLM extraction prompt design and geocoder selection for Atlantic Canada warrant research before planning begins
- Phase 2 flag: headless browser strategy for JS-rendered venue sites must be decided before scraper library is written (Vercel 50MB function limit rules out standard Playwright/Puppeteer)

## Session Continuity

Last session: 2026-03-14T06:39:05.774Z
Stopped at: Completed 03-03-PLAN.md — Phase 03 public frontend complete
Resume file: None
