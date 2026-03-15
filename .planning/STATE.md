---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Event Dedup & UX Polish
status: completed
stopped_at: "Completed 21-01-PLAN.md — tech debt cleanup: ticket_link COALESCE, findBestMatch removal, eventCount fix"
last_updated: "2026-03-15T22:00:11.798Z"
last_activity: "2026-03-15 — Plan 20-02 executed: admin merge review UI with human-verify approval"
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** Phase 20 — Admin Merge Review (complete)

## Current Position

Phase: 20 — Admin Merge Review (complete)
Plan: 02 complete — admin merge review UI built and human-verified
Status: Phase 20 complete; all v1.5 plans complete
Last activity: 2026-03-15 — Plan 20-02 executed: admin merge review UI with human-verify approval

Progress: [██████████] 100% (11 of 11 v1.5 plans)

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
| Phase 19-ux-polish-source-attribution P02 | 569 | 2 tasks | 10 files |
| Phase 19-ux-polish-source-attribution P01 | 15 | 3 tasks | 3 files |
| Phase 20-admin-merge-review P01 | 5 | 2 tasks | 4 files |
| Phase 20-admin-merge-review P02 | 2 | 2 tasks | 4 files |
| Phase 21-tech-debt-cleanup P01 | 3 | 3 tasks | 5 files |

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
- [Phase 19]: Used uniqueIndex on (event_id, source_type) for event_sources — prevents TM duplicate rows since PostgreSQL NULL != NULL in unique indexes for nullable scrape_source_id
- [Phase 19]: COALESCE applied universally in upsertEvent onConflictDoUpdate — once source_url set by any source it is never overwritten
- [Phase 19-ux-polish-source-attribution]: Map-pin icon on EventCard is visual-only affordance — flyTo triggered by whole-card click, icon conditional on venue.lat/lng
- [Phase 19-ux-polish-source-attribution]: CategoryChipsRow uses nuqs useQueryState('category') directly — no prop drilling; timelapse category filter chain already reads from URL param
- [Phase 19-ux-polish-source-attribution]: Timelapse default inverted post-checkpoint: pins visible by default, heatmap toggled on demand
- [Phase 20-admin-merge-review]: event_sources rows cleaned up before deleting conflicting events (FK RESTRICT ordering)
- [Phase 20-admin-merge-review]: canonical determination in mergePair: higher event count wins; ties break to venue_a
- [Phase 20-admin-merge-review]: Ticketmaster dedup guard checks both (a,b) and (b,a) orderings before inserting candidate
- [Phase 20-admin-merge-review]: Drizzle alias() used for venue self-join (venue_a/venue_b); NavLinks extracted as client component so AdminLayout can be async server component
- [Phase 21-tech-debt-cleanup]: COALESCE applied to ticket_link in upsertEvent — keeps existing TM link when scraper produces null (ATTR-02)
- [Phase 21-tech-debt-cleanup]: findBestMatch was orphaned since Phase 18; removed cleanly with no callers in src/
- [Phase 21-tech-debt-cleanup]: eventCount badge uses mapEvents.length (pre-bounds) not sidebarEvents.length (bounds-clipped)

### Pending Todos

- Phase 18: Run dry-run mode against real TM venue names in production DB to validate 0.15 name ratio and 100m/500m geo thresholds before enabling auto-merge
- Phase 18: Decide merge operation strategy — delete duplicate row vs. `merged_into_venue_id` nullable FK (deletion simpler but irreversible; FK auditable)
- Phase 19: Confirm map ref access pattern — React context vs. restructuring sidebar components as children of `<MapContainer>`
- Phase 20: Schedule after Phase 18 has run in production — need real borderline case volume to understand review UI requirements

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-15T21:54:32.533Z
Stopped at: Completed 21-01-PLAN.md — tech debt cleanup: ticket_link COALESCE, findBestMatch removal, eventCount fix
Resume file: None
