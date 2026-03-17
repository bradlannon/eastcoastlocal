---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Event Data Quality
status: planning
stopped_at: Completed 32-01-PLAN.md
last_updated: "2026-03-17T01:16:14.206Z"
last_activity: 2026-03-16 — Roadmap created for v2.2 (4 phases, 13 requirements)
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 7
  completed_plans: 7
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Users can instantly see what events are happening near them on a map — where, when, and what type
**Current focus:** v2.2 Event Data Quality — Phase 29: Schema Foundation

## Current Position

Phase: 29 of 32 (Schema Foundation)
Plan: — of — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-16 — Roadmap created for v2.2 (4 phases, 13 requirements)

Progress: [░░░░░░░░░░] 0% (v2.2)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v2.2)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

Recent decisions affecting v2.2:
- Build order is deterministic: schema (29) → archival (30) → detection (31) → UI (32)
- Archival must be live before series detection — archived past events must be excluded from occurrence counts or false series are produced
- series-detector.ts scoped to (venue_id, normalized_performer) — unique index at schema level prevents cross-venue grouping
- COALESCE guard in upsertEvent ON CONFLICT is highest-risk integration point — must be confirmed against normalizer.ts before archival cron is scheduled
- Detection thresholds (~20% Levenshtein, min 3 occurrences in 90 days) are estimates — validate with dry-run against live events before committing
- [Phase 29-schema-foundation]: archived_at uses TIMESTAMPTZ (withTimezone: true) per ARCH-01 — avoids explicit Atlantic offset in application code
- [Phase 29-schema-foundation]: recurring_series table placed before events in schema.ts to resolve Drizzle forward-reference in series_id FK
- [Phase 29-schema-foundation]: recurrence_pattern uses .optional() not .nullable() — Gemini output omits absent fields, undefined is correct
- [Phase 30-archival]: Server component queries DB directly (not via API route) for admin list pages
- [Phase 30-archival]: No maxDuration on archive cron — fast SQL UPDATE doesn't need the 60s extension
- [Phase 30-archival]: Pre-fetch venue IDs by province (two SELECT queries) rather than subquery to avoid Drizzle subquery pitfall
- [Phase 30-archival]: archived_at omission from ON CONFLICT SET is the upsert guard — re-scraping cannot unarchive events (ARCH-04)
- [Phase 33-admin-manual-triggers]: Admin trigger route uses admin session cookie auth (verifyToken), not CRON_SECRET — cron secret stays server-only
- [Phase 33-admin-manual-triggers]: Discovery manual triggers insert discovery_runs rows matching cron route pattern so Recent Discovery Runs dashboard table updates
- [Phase 33]: Admin trigger route uses admin session cookie auth (verifyToken), not CRON_SECRET — cron secret stays server-only
- [Phase 33]: Discovery manual triggers insert discovery_runs rows matching cron route pattern so Recent Discovery Runs dashboard table updates
- [Phase 31-series-detection]: performerFuzzyRatio test spec in plan had incorrect math; tests updated to use pairs genuinely below 0.20 threshold — algorithm constants unchanged
- [Phase 31-series-detection]: detect-series cron runs at 10 6 * * * (6:10am UTC) — 10 minutes after scrape cron to avoid timeout overlap
- [Phase 31-series-detection]: backfill-series.ts calls detectAndTagSeries directly (no HTTP) — one-shot script for existing events
- [Phase 32-series-ui]: collapseSeriesEvents uses two-pass algorithm: count map first pass, ordered emit second pass — preserves input sort order
- [Phase 32-series-ui]: Teal color scheme for Recurring badge distinguishes from existing orange (category) and gray (price) badges

### Roadmap Evolution

- Phase 33 added: Admin Manual Triggers — admin UI buttons to trigger cron jobs on demand

### Tech Debt (cumulative)

From v2.1 audit (non-blocking):
- src/app/event/[id]/page.tsx line 200 still uses source_url?.includes('ticketmaster.com') for attribution — DATA-02 only scoped to EventCard, not event detail page
- 27-01-SUMMARY.md frontmatter missing requirements_completed for ADMIN-01 and ADMIN-02 — documentation gap only

### Blockers/Concerns

- Confirm whether event_date is stored as TIMESTAMP or TIMESTAMPTZ before implementing archival threshold (plain TIMESTAMP requires explicit Atlantic offset in application code)
- Confirm scrape cron has headroom for series detection pass (N DB round-trips post-upsert) — if near 60s limit, detection must be a separate dedicated cron endpoint

## Session Continuity

Last session: 2026-03-17T01:12:52.066Z
Stopped at: Completed 32-01-PLAN.md
Resume file: None
