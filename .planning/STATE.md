---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Tech Debt Cleanup
status: roadmap_ready
stopped_at: Roadmap created — ready to plan Phase 26
last_updated: "2026-03-16T14:00:00.000Z"
last_activity: "2026-03-16 — Roadmap created for v2.1 (Phases 26-28)"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v2.1 Tech Debt Cleanup — Phase 26 next

## Current Position

Phase: 26 (Data Fixes) — not started
Plan: —
Status: Roadmap ready, awaiting plan-phase
Last activity: 2026-03-16 — Roadmap created for v2.1

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

### Tech Debt (cumulative)

From v1.5:
- venue-dedup-backfill.ts --execute mode does not use performVenueMerge (FK violation risk) → DATA-01 (Phase 26)
- 2 ticketmaster.test.ts unit tests broken (incomplete .limit() mock) → TEST-01 (Phase 28)
- EventCard attribution uses source_url string-match instead of event_sources.source_type → DATA-02 (Phase 26)

From v2.0:
- phone column on discovered_sources and venues never populated by any discoverer → DATA-03 (Phase 26)
- GEMINI_AUTO_APPROVE hardcoded in places-discoverer; not env-overridable like Gemini/Reddit copies → ADMIN-02 (Phase 27)
- no_website tab missing from /admin/discovery — stubs invisible to admin → ADMIN-01 (Phase 27)
- Nyquist VALIDATION.md files all draft across 12 phases → TEST-02 (Phase 28)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-16
Stopped at: Roadmap created for v2.1 — next step is plan-phase 26
Resume file: None
