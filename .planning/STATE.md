---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Roadmap ready, awaiting plan-phase
stopped_at: Completed 28-tests-and-validation 28-02-PLAN.md
last_updated: "2026-03-16T15:23:10.854Z"
last_activity: 2026-03-16 — Roadmap created for v2.1
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
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
- [Phase 26-data-fixes]: Used supplementary query pattern (2 DB round-trips + Map merge) instead of LEFT JOIN in events API to avoid row duplication from Drizzle's select-all with multiple source rows
- [Phase 26-data-fixes]: Removed anchor link from Ticketmaster attribution badge; badge visibility decoupled from source_url, driven by source_type enum
- [Phase 26-data-fixes]: Insert venueMergeCandidates row (status=merged) before calling performVenueMerge to obtain valid candidateId
- [Phase 26-data-fixes]: phone column removed from venues and discovered_sources; migration generated via drizzle-kit
- [Phase 27-admin-config]: Extracted isActionableTab helper for DRY condition reuse across 5 JSX locations in DiscoveryList
- [Phase 27-admin-config]: GEMINI_AUTO_APPROVE uses parseFloat env pattern matching discovery-orchestrator.ts and reddit-discoverer.ts
- [Phase 28-tests-and-validation]: Thenable mock pattern: Object.assign(Promise.resolve(value), { limit: jest.fn() }) for db.select chain
- [Phase 28-tests-and-validation]: All 21 VALIDATION.md files finalized retroactively — per-task statuses set to pass since all phases shipped

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

Last session: 2026-03-16T15:18:51.294Z
Stopped at: Completed 28-tests-and-validation 28-02-PLAN.md
Resume file: None
