# Feature Research

**Domain:** Recurring event series detection/grouping and past event archival for an event discovery app (v2.2 milestone)
**Researched:** 2026-03-16
**Confidence:** MEDIUM — core UX patterns are well-established from comparable platforms (Eventbrite, Meetup, Google Events); detection heuristics and schema design informed by codebase analysis and domain knowledge; specific detection algorithm accuracy unverifiable without data

---

## Context: What Already Exists (Must Preserve)

This is the v2.2 milestone. The following are already built and must be integrated with, not replaced:

- **`events` table**: `id`, `venue_id`, `performer`, `normalized_performer`, `event_date`, `event_category`, `description`, `archived_at` column does NOT yet exist
- **`/api/events` route**: Currently filters `WHERE event_date >= NOW()` — live date comparison on every request; no archived_at guard
- **`event_sources` join table**: Tracks scrape/ticketmaster/manual origin per event; non-destructive upsert pattern
- **Daily scrape cron** at `/api/cron/scrape`: Runs all scrape sources daily; 60s Vercel timeout budget
- **`EventCard` component**: Renders event details including category badge; accepts `EventWithVenue` type
- **`EventWithVenue` type** in `src/types/index.ts`: Drizzle join shape plus `source_types?: string[]` — will need series fields added
- **Admin dashboard**: JWT-auth, dashboard with health stats, venue management, discovery review, merge review, discovery run metrics
- **Dedup key**: `uniqueIndex` on `(venue_id, event_date, normalized_performer)` — same-event-same-venue dedup already works

Neither `archived_at` nor `series_id` exist on the `events` table yet. Both are new columns for v2.2.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a well-functioning event discovery app. Missing these = product feels incomplete or stale.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Past events hidden from default view | Users expect only upcoming events when browsing; seeing October gigs in March is disorienting and erodes trust in the app | LOW | `/api/events` already has `gte(event_date, now())`. Archival replaces this live comparison with a stable `archived_at IS NULL` gate, making archival auditable and reversible. |
| "Recurring" or "Weekly" badge on event cards | Apps like Meetup, Eventbrite, and Google Events all surface recurrence signals visually; users expect to see at a glance that "Open Mic Night" happens every week, not just once | LOW | Badge is pure UI — conditional render when `series_id IS NOT NULL`. Requires `series_id` FK to exist on the event row. No badge logic needed beyond null-check. |
| Recurring series collapsed to next occurrence in list | Eventbrite and Meetup both show one card per series (the next upcoming date) rather than flooding the list with 8 identical entries for the same weekly open mic | MEDIUM | Collapse logic lives in the API query layer: `DISTINCT ON (COALESCE(series_id, id::text))` ordered by `event_date ASC` gives one row per series. Without collapse, a weekly event at a popular venue produces 8 map pins and 8 list entries, crowding out other events. |
| Archived events excluded from public API | All public-facing views (map, list, heatmap) implicitly expect active/upcoming data; stale events pollute every view simultaneously | LOW | Change `/api/events` `WHERE` clause from `gte(event_date, now())` to `AND archived_at IS NULL`. Both guards are valid during transition. `archived_at` is the authoritative state machine gate. |
| Admin can see archived events | Admins need to audit what got archived to catch false positives — e.g., a recurring event that ran for months and is now paused, or an event that was archived too aggressively | LOW | A filtered tab in the admin events view (or a "show archived" toggle). Does not require a separate page — existing admin patterns (DiscoveryList tab model) apply directly. |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline and add measurable value given East Coast Local's specific context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic series detection from scraped data | Most event aggregators require the organizer to explicitly mark an event as recurring (Eventbrite, Meetup). Auto-detection from scraped titles and date patterns means zero manual curation — the system figures out "Open Mic Every Wednesday" from the data | MEDIUM | Two complementary signals: (1) **Title keyword heuristic** — if `performer` or `description` contains "every", "weekly", "open mic", "trivia night", "bingo", "karaoke night", "comedy night", the event is a recurrence candidate; (2) **Temporal pattern** — same `normalized_performer` at same `venue_id` appearing on multiple same-weekday dates across scrape runs. Running both increases recall. This runs as a post-scrape enrichment step in the daily cron, not at extraction time. |
| "Next occurrence" contextual label on series cards | Show "Recurring — Next: Wed Mar 18" rather than a bare date, making recurring events feel like a living schedule rather than a one-off listing | LOW | Derived at render time from `series_id` + `event_date` ordering. Requires `recurrence_cadence` stored per series (weekly, biweekly, monthly). No extra DB query needed — cadence is on the `event_series` row fetched via JOIN. |
| Map pin de-duplication for recurring series | A venue with a weekly recurring event would otherwise produce 8 pins in the cluster view, making that venue appear 8x more prominent than a venue with one event. Series grouping lets the map show one pin per venue with a popup saying "Open Mic Night — every Wednesday (8 upcoming)" | MEDIUM | Pin de-duplication per venue already works via Leaflet clusters. The enhancement is in the popup content: group events by `series_id` within the venue popup, show one series row instead of N occurrence rows. |
| Admin series management override | Admin can manually tag an event as part of a series, edit the cadence, or split a wrongly-detected series | MEDIUM | Needed for edge cases: a venue runs "Open Mic Night" monthly, not weekly; two different performers share the same stage name. Lower priority than detection itself — can ship after auto-detection is validated. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create more problems than they solve in this context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Store all future occurrences at scrape time | "Complete history" — scraper sees "Open Mic every Wednesday through December" and wants to persist all 30 future dates | Produces dozens of identical rows; bloats the events table; the dedup key (venue + date + performer) would block duplicates on re-scrape anyway; most future occurrences will never be viewed | Store only dates that appear on the venue website. Let the venue website be the source of truth for which occurrences have been published. The scraper already does this correctly — do not change it. |
| RRULE-based recurrence generation | iCalendar RRULE format is the standard for recurring events; used by Google Calendar, Eventbrite internals, schema.org Schedule type | This app is a discovery tool, not a calendar app. RRULE requires knowing the exact recurrence rule upfront — venue websites don't expose RRULE. Detection heuristics are better than pretending you know the exact rule. `postgres-rrule` extension is also incompatible with Neon serverless | Store `recurrence_cadence` as a simple enum (weekly, biweekly, monthly) or text field. No extension needed. Cadence is advisory, not generative. |
| Public "past events" tab | Users who missed an event might want to see what played recently | Creates a browsing surface for stale data; increases cognitive load; heatmap + timelapse already shows past density; not aligned with the "what's happening now/soon" core value; explicitly out of scope per PROJECT.md | Keep archived events in admin only. Public interface stays future-focused. |
| Hard delete of past events | Simpler than archival — just `DELETE WHERE event_date < now() - interval` on a cron | Destroys the cross-source dedup anchor: if an event is deleted and re-scraped from a new source, it reappears as a duplicate. Also destroys the `event_sources` audit trail. | Soft-delete via `archived_at` timestamp. Archived rows stay in the DB; public API excludes them via `WHERE archived_at IS NULL`. Admin can query them. Dedup key still prevents re-insertion. |
| Real-time series detection on event insert | Run detection as each event is inserted during scraping | O(n) lookback query per insertion adds latency inside the 60s Vercel cron timeout. Detection failures would block event persistence. | Run series detection as a separate post-scrape enrichment step in the daily cron, after all events are inserted. Two-phase: insert first, enrich second. |
| "Recurring events only" filter chip in public UI | Filter to show only recurring events on the map and list | Adds a UI filter element for a subset of events that may be sparse at launch; creates pressure to have high detection accuracy before the filter is worth surfacing; could confuse users if detection has false negatives | Surface recurrence passively via badges on existing cards. Add the filter chip in a later milestone once series detection coverage and accuracy are confirmed by admin review. |
| Archiving events immediately at midnight | Run the archive cron at exactly midnight so events are archived the moment they end | Race condition: an event that ended at 11:58 PM gets archived at midnight before some users finish viewing it; also catches events that list 9 PM but often run until 1 AM | Use a grace period: archive events where `event_date < NOW() - INTERVAL '2 hours'`. Events 2+ hours past their start time are safely archiveable. Adjust interval based on typical event duration patterns. |

---

## Feature Dependencies

```
[event_series table (new)]
    └──required by──> [series_id FK on events table]
    └──holds──> [recurrence_cadence, canonical_title, first_seen_at, venue_id]

[series_id nullable FK on events (new column)]
    └──requires──> [event_series table exists]
    └──enables──> [Recurring badge on EventCard]
    └──enables──> [Collapse to next occurrence in list view]
    └──enables──> [Map popup: "every Wednesday" label]
    └──enables──> [Admin series management UI]

[Series detection enrichment step (new cron logic)]
    └──requires──> [event_series table]
    └──requires──> [series_id column on events]
    └──runs after──> [daily scrape cron inserts events]
    └──uses──> [normalized_performer (existing) + venue_id (existing) + event_date (existing)]
    └──populates──> [series_id on events rows]
    └──creates──> [event_series rows on first detection]

[archived_at column on events (new column)]
    └──independent of──> [series_id / event_series]
    └──enables──> [Archive cron step]
    └──enables──> [archived_at IS NULL filter in /api/events]
    └──enables──> [Admin archived events view]

[Archive cron step (new or appended to existing cron)]
    └──requires──> [archived_at column]
    └──runs as──> [separate /api/cron/archive endpoint OR appended to /api/cron/scrape]
    └──sets──> [archived_at = NOW() WHERE event_date < NOW() - INTERVAL '2 hours' AND archived_at IS NULL]

[EventCard badge (UI change)]
    └──requires──> [series_id surfaced in EventWithVenue type]
    └──requires──> [/api/events to JOIN event_series and return recurrence_cadence]

[List view collapse (query change)]
    └──requires──> [series_id populated on events rows]
    └──changes──> [/api/events query: DISTINCT ON series or application-layer dedup]
```

### Dependency Notes

- **`event_series` table before `series_id` FK:** Migration order must create the parent table before adding the FK column to `events`. Drizzle migration will handle ordering if schemas are defined correctly.
- **`archived_at` is fully independent of series detection:** These two features share no schema dependencies. They can be built and shipped in any order within v2.2. Archival is simpler and lower risk — good candidate to ship first.
- **Collapse in list requires `series_id` to be populated:** The "one card per series" query is impossible until the detection enrichment has run and set `series_id` on existing events. Plan for a one-time backfill run after the migration.
- **Archive cron and scrape cron should coordinate:** Archive step should run after the scrape inserts new events, not before — otherwise a newly-scraped event for today could be archived before the scrape completes.
- **`EventWithVenue` type needs extension:** Add `series_id?: number | null` and `recurrence_cadence?: string | null` to the type and the API response shape. The existing supplementary query pattern (used for `source_types`) can be reused to fetch series data.

---

## MVP Definition

### Launch With (v1 of this milestone — v2.2)

Minimum viable scope that delivers meaningful value and keeps data fresh.

- [ ] `archived_at` nullable timestamp column on `events` table (migration)
- [ ] `/api/cron/archive` endpoint (or archive step in existing `/api/cron/scrape`): sets `archived_at = NOW()` where `event_date < NOW() - INTERVAL '2 hours' AND archived_at IS NULL`
- [ ] `/api/events` query updated: `AND archived_at IS NULL` added to WHERE clause — makes archival the authoritative gate
- [ ] `event_series` table with `id`, `canonical_title`, `venue_id`, `recurrence_cadence` (text: weekly/biweekly/monthly), `first_seen_at`, `created_at` (migration)
- [ ] `series_id` nullable integer FK on `events` referencing `event_series.id` (migration)
- [ ] Series detection enrichment function: groups events by `normalized_performer + venue_id + day-of-week`, creates `event_series` rows, sets `series_id` on matched events
- [ ] Title keyword heuristic detection: if `performer` contains recurrence keywords ("every", "weekly", "open mic", "trivia", "bingo", "karaoke"), flag as series candidate regardless of temporal pattern
- [ ] Detection runs as post-scrape step in the daily cron (after all events inserted)
- [ ] One-time backfill run of series detection against all existing events
- [ ] "Recurring" badge on `EventCard` when `series_id IS NOT NULL`
- [ ] List view collapse: show only the next upcoming occurrence per series (not all future dates)
- [ ] Admin archived events tab: events where `archived_at IS NOT NULL`, sorted by event_date desc

### Add After Validation (v1.x)

- [ ] "Next: Wed Mar 18 — then every Wed" enhanced label on series cards — trigger: once series detection accuracy is confirmed by admin review of detected series
- [ ] Map popup enhancement: "Open Mic Night — every Wednesday (5 upcoming)" — trigger: once series coverage is meaningful
- [ ] Admin series management UI: view all detected series, edit cadence, manually merge/split occurrences — trigger: when false-positive series detections are reported

### Future Consideration (v2+)

- [ ] "Recurring events only" filter chip in public UI — defer until series coverage is broad enough to be useful (needs >50% of expected recurring events detected)
- [ ] Series confidence score with admin review queue for low-confidence detections — defer until detection volume is large enough to need triage
- [ ] Hard purge of events archived > 90 days — defer; storage costs at Atlantic Canada scale are negligible; keep rows for dedup anchor integrity

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `archived_at` column + archive cron | HIGH — keeps public UI fresh automatically | LOW — one column, one WHERE clause, one cron step | P1 |
| `archived_at IS NULL` in `/api/events` | HIGH — authoritative gate on stale data | LOW — one WHERE clause change | P1 |
| `event_series` table + `series_id` FK | HIGH — foundation for all series features | LOW — two schema objects, one migration | P1 |
| Series detection (temporal pattern) | HIGH — core value of the milestone | MEDIUM — enrichment query + grouping logic | P1 |
| Series detection (title keywords) | MEDIUM — catches explicit recurrence signals | LOW — regex/keyword match on existing text | P1 |
| Recurring badge on EventCard | MEDIUM — visual trust signal; sets expectation | LOW — conditional badge in existing card | P1 |
| List view collapse to next occurrence | HIGH — prevents weekly events flooding list/map | MEDIUM — query-layer GROUP BY or app dedup | P1 |
| Admin archived events tab | MEDIUM — admin visibility; catch false positives | LOW — filter tab in existing admin pattern | P2 |
| Map popup "every Wednesday" label | MEDIUM — contextual discovery value | LOW — string addition once series_id exists | P2 |
| Admin series management UI | LOW at launch — needed once FP rate known | MEDIUM — new admin page with merge/split | P3 |

**Priority key:**
- P1: Must have for v2.2 launch
- P2: Should have, add when P1 is working
- P3: Nice to have, future milestone

---

## Competitor Feature Analysis

| Feature | Eventbrite | Meetup | Google Events | Our Approach |
|---------|------------|--------|---------------|--------------|
| Recurring event grouping | Parent event + child date instances; one listing with date picker | Single "recurring event" with all dates; RSVP per occurrence | `EventSeries` / `superEvent` schema.org structured data; Knowledge Panel shows series | `event_series` table as grouping anchor; `series_id` FK on events; auto-detected from scraped data — no organizer action needed |
| Recurrence display | "Select date" dropdown on event page | "Recurring — every [cadence]" badge; next date prominent | "Weekly event" in search results | "Recurring" badge on EventCard; collapse list to next occurrence |
| Who marks recurrence | Organizer at event creation (explicit) | Organizer at event creation (explicit) | Structured data markup by organizer | Automatic detection from scrape data — zero manual curation |
| Past event handling | Hidden from search by default; organizer sees archive | Visible on group page but de-emphasized | Removed from featured results; `eventStatus` schema field | `archived_at` soft-delete; excluded from public API; admin-only view |
| Admin/organizer archive visibility | Full organizer dashboard with all history | Group admin sees full event history | N/A (organizer manages own site) | Admin events tab filtered by `archived_at IS NOT NULL` |

---

## Existing Schema Integration Points

Direct integration points identified from `src/lib/db/schema.ts` and `src/app/api/events/route.ts`:

- **`events` table**: Add `archived_at` (nullable timestamp, default null) and `series_id` (nullable integer FK to `event_series.id`). Both nullable — zero backfill required at migration time.
- **`/api/events` route**: Currently `WHERE gte(events.event_date, new Date())`. Change to also include `isNull(events.archived_at)` using Drizzle's `isNull()` operator. Both guards complement each other.
- **`normalized_performer` column**: Already exists on `events` — the temporal series detection pattern uses `normalized_performer + venue_id + day-of-week` directly, no new columns needed.
- **`event_date` column**: Use `EXTRACT(DOW FROM event_date)` in PostgreSQL (or equivalent Drizzle `sql` tagged template) to group by day-of-week for temporal pattern detection.
- **`EventWithVenue` type** (`src/types/index.ts`): Add `series_id?: number | null` and `recurrence_cadence?: string | null`. The existing supplementary query pattern for `source_types` (two-round-trip + Map merge) can be reused to fetch series data without JOIN row duplication.
- **Daily cron** (`/api/cron/scrape`): Series detection enrichment appended after all event inserts complete, or a separate `/api/cron/enrich-series` endpoint. Separate endpoint is cleaner for timeout isolation.

---

## Sources

- [Eventbrite: Create and manage multiple date or recurring events](https://www.eventbrite.com/help/en-us/articles/256014/create-and-manage-multiple-date-or-recurring-events/)
- [Eventbrite: New recurring event experience](https://www.eventbrite.com/help/en-us/articles/692566/create-a-recurring-or-timed-entry-event-in-eventbrites-new-recurring-event-experience/)
- [Meetup: Creating a repeating event](https://help.meetup.com/hc/en-us/articles/39795590048781-Creating-a-repeating-event)
- [Again and Again! Managing Recurring Events in a Data Model — Red Gate](https://www.red-gate.com/blog/again-and-again-managing-recurring-events-in-a-data-model/)
- [Recurring Events and PostgreSQL — Thoughtbot](https://thoughtbot.com/blog/recurring-events-and-postgresql)
- [Creating a Soft Delete Archive Table with PostgreSQL — Meroxa/Medium](https://medium.com/meroxa/creating-a-soft-delete-archive-table-with-postgresql-70ba2eb6baf3)
- [The challenges of soft delete — atlas9](https://atlas9.dev/blog/soft-delete.html)
- [Events, occurrences, and series — The Events Calendar API Handbook](https://docs.theeventscalendar.com/apis/custom-tables/events/)
- [schema.org Schedule type](https://schema.org/Schedule)
- [Hacker News: Recurring events database schema discussion](https://news.ycombinator.com/item?id=18477975)
- Codebase analysis: `src/lib/db/schema.ts`, `src/app/api/events/route.ts`, `src/types/index.ts`, `.planning/PROJECT.md` — HIGH confidence

---

*Feature research for: East Coast Local v2.2 — Recurring Event Series Detection and Past Event Archival*
*Researched: 2026-03-16*
