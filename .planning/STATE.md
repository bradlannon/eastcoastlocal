---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Event Dedup & UX Polish
status: completed
stopped_at: Completed 18-02-PLAN.md — TM pipeline integration and backfill CLI
last_updated: "2026-03-15T15:44:13.043Z"
last_activity: "2026-03-15 — Plan 18-01 executed: venue dedup scoring module"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 7
  completed_plans: 7
  percent: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** Phase 18 — Venue Deduplication

## Current Position

Phase: 18 — Venue Deduplication (in progress)
Plan: 01 complete — scoring module built
Status: Plan 18-01 complete; ready for Plan 18-02 (TM pipeline integration)
Last activity: 2026-03-15 — Plan 18-01 executed: venue dedup scoring module

Progress: [█░░░░░░░░░] ~14% (1 of ~7 v1.5 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v1.5)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 18. Venue Deduplication | 1 | 3 min | 3 min |
| 19. UX Polish & Source Attribution | — | — | — |
| 20. Admin Merge Review | — | — | — |

*Updated after each plan completion*
| Phase 18-venue-deduplication P02 | 4 | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- [v1.4] Ticketmaster venue find-or-create uses ILIKE name matching — creates duplicates for name variants; Phase 18 resolves this
- [v1.4] TM synthetic URL pattern: ticketmaster:province:NB
- [v1.4] JSON-LD short-circuits Gemini — confidence=1.0 events never go through AI
- [v1.5] Roadmap: coarse granularity → 3 phases (18-20); venue dedup is prerequisite for event dedup and admin review UI
- [v1.5] Two-signal merge gate confirmed: name similarity (proportional distance < 0.15) AND geocoordinate proximity (< 100m) required for auto-merge
- [v1.5] Borderline cases (name match but geo > 500m, or geo close but name differs) logged without acting — surfaced in Phase 20 admin UI
- [v1.5] `fastest-levenshtein@1.0.16` selected for edit-distance scoring; zero dependencies, pure JS, server-side only
- [Phase 18-venue-deduplication]: Test fixtures must satisfy the 0.15 name ratio — 'Scotiabank Centre Halifax' vs 'Scotiabank Centre' (0.32) does not qualify; 'Scotiabank Center' vs 'Scotiabank Centre' (0.118) does
- [Phase 18-venue-deduplication]: scoreVenueCandidate hasGeo requires BOTH incoming AND candidate to have coordinates for the geo signal to activate
- [Phase 18-venue-deduplication]: TM inline merge is unreachable by design: incoming lat/lng is always null for TM venues at creation time so scoreVenueCandidate routes to review:name_match_no_geo
- [Phase 18-venue-deduplication]: findOrCreateVenue uses scoreVenueCandidate per-candidate (not findBestMatch) to retain candidate.id for audit log insertion

### Pending Todos

- Phase 18: Run dry-run mode against real TM venue names in production DB to validate 0.15 name ratio and 100m/500m geo thresholds before enabling auto-merge
- Phase 18: Decide merge operation strategy — delete duplicate row vs. `merged_into_venue_id` nullable FK (deletion simpler but irreversible; FK auditable)
- Phase 19: Confirm map ref access pattern — React context vs. restructuring sidebar components as children of `<MapContainer>`
- Phase 20: Schedule after Phase 18 has run in production — need real borderline case volume to understand review UI requirements

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-15T15:44:13.039Z
Stopped at: Completed 18-02-PLAN.md — TM pipeline integration and backfill CLI
Resume file: None
