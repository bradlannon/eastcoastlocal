---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Tech Debt Cleanup
status: defining_requirements
stopped_at: Defining requirements for v2.1
last_updated: "2026-03-16T14:00:00.000Z"
last_activity: "2026-03-16 — Milestone v2.1 started"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v2.1 Tech Debt Cleanup — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-16 — Milestone v2.1 started

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

### Tech Debt (cumulative)

From v1.5:
- venue-dedup-backfill.ts --execute mode does not use performVenueMerge (FK violation risk)
- 2 ticketmaster.test.ts unit tests broken (incomplete .limit() mock)
- EventCard attribution uses source_url string-match instead of event_sources.source_type

From v2.0:
- phone column on discovered_sources and venues never populated by any discoverer
- GEMINI_AUTO_APPROVE hardcoded in places-discoverer; not env-overridable like Gemini/Reddit copies
- no_website tab missing from /admin/discovery — stubs invisible to admin
- Nyquist VALIDATION.md files all draft across 12 phases

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-16
Stopped at: Defining requirements for v2.1
Resume file: None
