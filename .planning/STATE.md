---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Mass Venue Discovery
status: planning
stopped_at: Phase 23 context gathered
last_updated: "2026-03-16T00:52:35.059Z"
last_activity: 2026-03-15 — v2.0 roadmap created, 22/22 requirements mapped
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v2.0 Mass Venue Discovery — Phase 22: Schema Foundation

## Current Position

Phase: 22 of 25 (Schema Foundation)
Plan: —
Status: Ready to plan
Last activity: 2026-03-15 — v2.0 roadmap created, 22/22 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

Recent decisions affecting v2.0:
- Places discovery runs as its own isolated cron endpoint (separate from Gemini+Search) to avoid 60s timeout
- Per-method auto-approve thresholds: google_places = 0.8, reddit_gemini = 0.9
- No-website Places venues staged as status=no_website rather than discarded (dedup anchors for Ticketmaster)
- Admin review for all sources remains on single /admin/discovery page (filter chip, not new page)
- [Phase 22-schema-foundation]: Placed google_place_id before created_at in venues; used nullable unique index pattern for optional dedup anchors
- [Phase 22-schema-foundation]: Conditional spread for nullable optional Drizzle insert fields: omits keys entirely for legacy nulls rather than passing explicit null
- [Phase 22-schema-foundation]: promoteSource prefers staged.address; falls back to city/province/Canada placeholder for legacy sources
- [Phase 22-schema-foundation]: Status guard (pending-only) unchanged in promoteSource; no_website promotion path deferred to Phase 23

### Tech Debt (from v1.5 audit)

- venue-dedup-backfill.ts --execute mode does not use performVenueMerge (FK violation risk)
- 2 ticketmaster.test.ts unit tests broken (incomplete .limit() mock)
- EventCard attribution uses source_url string-match instead of event_sources.source_type
- Nyquist VALIDATION.md files all draft across 8 phases

### Research Flags

- Phase 23: Verify Places API (New) is separately enabled on GCP key before implementing places-discoverer.ts
- Phase 23: Confirm X-Goog-FieldMask field names against current official docs (MEDIUM confidence)
- Phase 23: Decide p-limit necessity based on final ATLANTIC_CITIES count (threshold ~15 cities)
- Phase 24: Spot-check targeted subreddits for actual post volume before committing to all

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-16T00:52:35.053Z
Stopped at: Phase 23 context gathered
Resume file: .planning/phases/23-places-api-discovery/23-CONTEXT.md
