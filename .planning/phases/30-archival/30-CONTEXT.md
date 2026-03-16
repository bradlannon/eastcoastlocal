# Phase 30: Archival - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Past events disappear from the public map and list automatically each day, without destroying dedup anchors or unarchiving events that get re-scraped. Delivers ARCH-02, ARCH-03, ARCH-04, ARCH-05.

</domain>

<decisions>
## Implementation Decisions

### Archival threshold
- Archive events whose event_date has passed the end of the calendar day in the venue's province timezone
- Per-province timezone: America/Halifax for NS, NB, PEI; America/St_Johns for NL
- Cron joins events→venues to get province column for timezone selection
- event_date stored values treated as UTC — compare against "start of today in province timezone, converted to UTC"

### Cron scheduling
- New dedicated endpoint at /api/cron/archive (not part of existing scrape cron)
- Runs at 7am UTC (after the 6am UTC scrape cron completes)
- Add to vercel.json cron configuration
- CRON_SECRET authorization check matching existing cron endpoint pattern
- Console logging only (count of events archived) — no new database table for archive run history

### Admin archived events tab
- New "Archived" nav tab in admin UI at /admin/archived
- Essential info per row: performer, venue name, event date, archived_at date
- Read-only — no manual unarchive action
- No search or filtering — simple paginated list sorted by archived_at descending
- Pagination for the list (archived events grow over time)

### API filter strategy
- Replace current gte(event_date, new Date()) in /api/events with archived_at IS NULL
- Cron is the single source of truth for what's archived — no redundant date filter
- Acceptable if past events briefly show when cron hasn't run yet (cosmetic, not data integrity)
- Separate /api/admin/archived endpoint for the admin tab (not a query param on /api/events)

### COALESCE guard for re-scraping
- upsertEvent ON CONFLICT clause must preserve existing archived_at via COALESCE
- Re-scraping an already-archived event leaves archived_at unchanged
- Pattern: `archived_at: sql\`COALESCE(${events.archived_at}, ${events.archived_at})\`` (no-op — simply don't include archived_at in the SET clause)

### Claude's Discretion
- Pagination implementation (cursor vs offset)
- Admin archived tab styling and layout details
- Exact console log format for cron results
- Error handling patterns for the cron endpoint

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching existing codebase patterns.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/api/events/route.ts`: Current public events endpoint — needs archived_at IS NULL filter added
- `normalizer.ts` `upsertEvent()`: ON CONFLICT clause needs COALESCE guard for archived_at
- `NavLinks.tsx`: Admin nav component — add Archived link
- `vercel.json`: Cron configuration — add archive endpoint
- `schema.ts`: archived_at column already exists (TIMESTAMPTZ), venues.province column available for timezone lookup

### Established Patterns
- Cron endpoints: `/api/cron/*` with CRON_SECRET auth check
- Drizzle ORM queries with innerJoin for events→venues
- Supplementary query pattern for enriching event data (used in /api/events)
- Admin pages: server components in `/app/admin/*` with shared layout

### Integration Points
- `vercel.json` crons array — add new archive entry
- Admin layout nav — add Archived tab
- `/api/events/route.ts` — change WHERE clause from date filter to archived_at IS NULL
- `normalizer.ts` upsertEvent — add COALESCE guard for archived_at in ON CONFLICT SET

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-archival*
*Context gathered: 2026-03-16*
