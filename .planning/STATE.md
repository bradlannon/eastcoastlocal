---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: More Scrapers
status: roadmapped
stopped_at: Roadmap created — ready to plan Phase 14
last_updated: "2026-03-15"
last_activity: "2026-03-15 — v1.4 roadmap created (4 phases, 10 requirements mapped)"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v1.4 — Phase 14: Fetch Pipeline

## Current Position

Phase: 14 — Fetch Pipeline (not started)
Plan: —
Status: Ready to plan
Last activity: 2026-03-15 — v1.4 roadmap created

Progress: [░░░░░░░░░░] 0% (0/4 phases complete)

## v1.4 Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Fetch Pipeline | SCRP-01, SCRP-02, SCRP-03, PLAT-04 | Not started |
| 15 | Scrape Quality Metrics | SCRP-04 | Not started |
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

Last session: 2026-03-15
Stopped at: Roadmap created — ready to plan Phase 14
Resume file: None
Next action: `/gsd:plan-phase 14`
