---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: More Scrapers
status: planning
stopped_at: Completed 17-01-PLAN.md
last_updated: "2026-03-15T07:54:04.727Z"
last_activity: 2026-03-15 — Phase 15 complete (SCRP-04 satisfied)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 7
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v1.4 — Phase 16: Ticketmaster Integration

## Current Position

Phase: 16 — Ticketmaster Integration
Plan: —
Status: Ready to plan
Last activity: 2026-03-15 — Phase 15 complete (SCRP-04 satisfied)

Progress: [█████░░░░░] 50% (2/4 phases complete)

## v1.4 Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Fetch Pipeline | SCRP-01, SCRP-02, SCRP-03, PLAT-04 | Complete |
| 15 | Scrape Quality Metrics | SCRP-04 | Complete |
| 16 | Ticketmaster Integration | PLAT-01, PLAT-02, PLAT-03 | Not started |
| 17 | Auto-Approve Discovery | DISC-05, DISC-06 | Not started |

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v1.4)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 14-fetch-pipeline P01 | 6 | 2 tasks | 9 files |
| Phase 14-fetch-pipeline P02 | 2m | 1 tasks | 1 files |
| Phase 15-scrape-quality-metrics P01 | 25 | 2 tasks | 7 files |
| Phase 16-ticketmaster-integration P01 | 4m | 2 tasks | 3 files |
| Phase 16-ticketmaster-integration P02 | 94s | 2 tasks | 6 files |
| Phase 17-auto-approve-discovery P01 | 3min | 1 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- [v1.2] Source type auto-detected from URL substring (eventbrite/bandsintown/venue_website fallback)
- [v1.2] Gemini + Google Search grounding for discovery — reuses existing AI SDK integration
- [v1.3] Auto-geocode venues on save — reuse existing Google Maps API
- [v1.3] promoteSource() reused for admin approve — no duplication of promotion logic
- [v1.4] Songkick excluded — commercial API ($500+/month), confirmed 2026-03-15
- [v1.4] Multi-page hard cap at 3 pages in code (not config) — Vercel 60s timeout constraint
- [v1.4] Per-domain rate limiting via Map<domain, lastRequestTime> — not global delays
- [v1.4] JSON-LD as fast-path before Gemini (short-circuit — never merge both for same source)
- [v1.4] Auto-approve threshold at 0.8 — starting recommendation, calibrate after first run
- [v1.4] TM synthetic URL pattern: ticketmaster:province:NB (precedent from eventbrite:org:12345)
- [Phase 14-fetch-pipeline]: rawHtml captured before cheerio.load() mutation to preserve script tags for JSON-LD extraction
- [Phase 14-fetch-pipeline]: fetchWithRetry retries only 429/503 (transient); 404 throws immediately to avoid wasting time on permanently blocked URLs
- [Phase 14-fetch-pipeline]: Multi-page hard cap of 3 enforced in code (Math.min(maxPages, 3)) not just config — Vercel timeout constraint
- [Phase 14-fetch-pipeline]: AI throttle scoped to Gemini branch only — no delay on JSON-LD fast path since no AI API call made
- [Phase 14-fetch-pipeline]: HTTP_THROTTLE_MS (default 1000ms) applied between ALL venue_website sources after each upsert loop
- [Phase 15-scrape-quality-metrics]: Metric vars initialized as null before source_type branches — eventbrite/bandsintown always write null for event-specific metrics
- [Phase 15-scrape-quality-metrics]: consecutive_failures reset to 0 on success; sql`col + 1` atomic increment on failure — avoids read-modify-write race
- [Phase 15-scrape-quality-metrics]: Failure path omits last_event_count and avg_confidence from .set() to preserve last known values across failures
- [Phase 16-ticketmaster-integration]: mapTmClassification and findOrCreateVenue exported as named exports for direct unit testability
- [Phase 16-ticketmaster-integration]: Seed script uses Promise.all for parallel venue inserts then queries back IDs to handle onConflictDoNothing case
- [Phase 16-02]: TM metrics (last_event_count, avg_confidence) remain null — handler returns void, consistent with eventbrite/bandsintown
- [Phase 17-auto-approve-discovery]: Social domain penalty set to -1.0 (not -0.50) to guarantee Math.clamp(0) for any score combination
- [Phase 17-auto-approve-discovery]: AUTO_APPROVE_THRESHOLD reads from env var at module load (default 0.8) — configurable without code deploy
- [Phase 17-auto-approve-discovery]: discovery_score nullable — null means not yet scored (pre-Phase 17 rows)

### Pending Todos

- Zoom-to-location button on event cards (backlog from v1.1)
- Category chip UI hidden in timelapse mode — UX improvement (tech debt from v1.2)
- After Phase 16 first run: review TM venue name matching edge cases, merge any duplicate venues
- After Phase 17 first discovery run: check auto-approve rate (target 10-30%); calibrate threshold if needed

### Blockers/Concerns

- Vercel Fluid Compute maxDuration (300s) must be confirmed enabled in project settings before multi-page changes go to production
- JSON-LD coverage audit (26 existing sources) recommended before Phase 14 work is scoped — expected 3-6 sources have JSON-LD
- TM Atlantic Canada event volume unknown until first manual API call — may need pagination on TM results

## Session Continuity

Last session: 2026-03-15T07:54:04.723Z
Stopped at: Completed 17-01-PLAN.md
Resume file: None
Next action: `/gsd:plan-phase 16`
