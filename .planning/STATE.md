---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Mass Venue Discovery
status: executing
stopped_at: "Completed 24-02: Reddit cron endpoint (discover-reddit route + vercel.json schedule)"
last_updated: "2026-03-16T02:53:36.692Z"
last_activity: "2026-03-15 — Completed 24-01: Reddit discovery module (reddit-discoverer.ts), 16 tests pass"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v2.0 Mass Venue Discovery — Phase 22: Schema Foundation

## Current Position

Phase: 24 of 25 (Reddit Discovery) — In Progress
Plan: 1 of 2 complete
Status: Executing
Last activity: 2026-03-15 — Completed 24-01: Reddit discovery module (reddit-discoverer.ts), 16 tests pass

Progress: [█████████░] 86%

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
- [Phase 23-01]: VENUE_PLACE_TYPES restricted to 7 types; tier scoring: core=0.85 auto-approve, secondary=0.70 admin review
- [Phase 23-01]: no_website promotion creates venue-only stub, skips scrape_sources insert; status guard allows pending|no_website, throws for approved|rejected
- [Phase 23]: Synthetic URL for no_website venues is places:{google_place_id} — unique, stable, readable key for Ticketmaster dedup anchoring
- [Phase 23]: Two-step dedup: google_place_id fast-path (exact match) then fuzzy name+geo loop; staged_review counts toward stagedPending in DiscoveryRunResult
- [Phase 23-places-api-discovery]: Per-province cron isolation: each province runs as its own cron endpoint (Mon-Thu 9am UTC) to avoid 60s Vercel timeout for full Atlantic scan
- [Phase 23-places-api-discovery]: GEMINI_AUTO_APPROVE env var renamed from AUTO_APPROVE_THRESHOLD; default raised to 0.9 to distinguish from google_places threshold (0.8)
- [Phase 24-reddit-discovery]: No-URL Reddit candidates use synthetic reddit:t3_{postId} URL as status=pending (NOT no_website) — admin reviews noisy Reddit names
- [Phase 24-reddit-discovery]: Auto-approve only triggers for Reddit candidates with real website URLs at score >= 0.9 GEMINI_AUTO_APPROVE threshold
- [Phase 24-reddit-discovery]: Reddit post ID dedup via raw_context LIKE 'reddit:t3_%' query at run start — no separate column needed
- [Phase 24-reddit-discovery]: Friday 9am UTC (0 9 * * 5) schedule for Reddit discovery cron — distinct day from Places province crons (Mon-Thu)

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

Last session: 2026-03-16T02:53:36.688Z
Stopped at: Completed 24-02: Reddit cron endpoint (discover-reddit route + vercel.json schedule)
Resume file: None
