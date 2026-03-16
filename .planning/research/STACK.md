# Stack Research

**Domain:** Event data quality — recurring series detection/grouping and past event archival
**Researched:** 2026-03-16
**Confidence:** HIGH (schema patterns) / MEDIUM (rrule applicability) / HIGH (archival approach)

---

## Context: What Already Exists (Do Not Re-research)

This is an additive milestone on top of a validated stack:

- Next.js 16.1.6, React 19, TypeScript 5
- Neon Postgres + Drizzle ORM 0.45.1 + drizzle-kit 0.31.9
- Tailwind CSS v4 (no component library — plain Tailwind throughout)
- date-fns 4.x for date arithmetic
- 7 Vercel cron endpoints already in vercel.json
- nuqs 2.x for URL filter state
- zod 4.x for validation

The new features require: schema additions (two columns on `events`), one new cron endpoint, and minimal UI changes (series badge + collapse in event list).

---

## Recommended Stack

### Core Technologies (Additions Only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Drizzle ORM | 0.45.1 (existing) | Schema additions for series_id + archived_at | No new dependency — self-referential nullable FK is supported via standalone `foreignKey` operator |
| date-fns | 4.x (existing) | Date comparison in archival cron logic | `isBefore(event_date, new Date())` covers archival threshold without additional packages |
| Vercel cron | existing infra | Daily archival sweep via new `/api/cron/archive` route | Follows established pattern; add one entry to vercel.json |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-collapsible | ^1.1.12 | Accessible expand/collapse for series grouping in event list UI | Only if animated collapse UI is needed for the public event list; skip if series grouping is admin-only or plain HTML suffices |

### Libraries to Explicitly NOT Add

| Library | Why Not | What to Use Instead |
|---------|---------|---------------------|
| rrule (npm) | RRULE format is for generating future occurrences from a rule string. This project detects patterns from scraped discrete events — rrule solves the wrong problem. Also: last published 2+ years ago (v2.8.1). | Plain SQL grouping on (venue_id, normalized_performer) with date-fns interval arithmetic to detect weekly/bi-weekly regularity |
| pg_rrule / postgres-rrule | PostgreSQL extension not available on Neon serverless without custom setup | Not needed; detection is application-layer logic only |
| shadcn/ui | No component library used anywhere in the project. Adding shadcn/ui for one collapsible would pull in Radix + class-variance-authority + tailwind-merge and impose a component convention decision on the rest of the codebase. | @radix-ui/react-collapsible directly, or plain `<details>`/`<summary>` HTML |
| Separate archive table | Overkill for this scale. Atlantic Canada event volume is low (thousands of rows). The separate-table pattern optimizes for millions of rows where dead data causes index bloat. | `archived_at` timestamp column on `events` |

---

## Schema Pattern Decisions

### Recurring Series: `series_id` (not RRULE, not parent_event_id)

**Recommendation: Add `series_id` integer column (nullable, self-referential FK) to `events`.**

Three patterns exist for recurring events:

| Pattern | Description | Verdict for This Project |
|---------|-------------|--------------------------|
| RRULE string | Store recurrence rule; generate occurrences at query time | Wrong fit — events arrive as discrete scraped rows, not generated from a rule |
| parent_event_id | Each occurrence references the first occurrence as "parent" | Creates asymmetry: the parent row is both an event AND a grouping anchor; complicates queries and deletes |
| series_id | All occurrences share the same series identifier (value = id of the anchor occurrence) | Cleanest — series grouping is independent of any individual occurrence |

For this project, `series_id` as a self-referential FK back to the `events` table is the pragmatic choice:

- No new table needed (a separate `series` table would be empty metadata — this project needs no series-level name or description beyond what the occurrence rows already carry)
- All occurrences of a series share the same `series_id` value (the `id` of the earliest known occurrence serves as the anchor)
- Detection logic: group events by `(venue_id, normalized_performer)`, check if inter-event intervals are regular (weekly = 7 days +/- 1, bi-weekly = 14 days +/- 1), assign matching `series_id` to the cluster
- Query pattern: `WHERE series_id IS NOT NULL` surfaces series members; `series_id IS NULL` surfaces one-off events; `GROUP BY series_id` collapses a series to show count

Drizzle schema implementation (add to existing `events` table definition):

```typescript
// In events table columns:
series_id: integer('series_id'),

// In events table constraints array (standalone foreignKey required for self-reference in Drizzle):
foreignKey({
  columns: [table.series_id],
  foreignColumns: [table.id],
})
```

The detection cron sets `series_id` on matched occurrences in a bulk `UPDATE`. No per-event logic at scrape time — detection runs as a separate daily pass after scraping.

### Archival: `archived_at` Timestamp (not boolean, not hard delete)

**Recommendation: Add `archived_at timestamp` (nullable) to `events`.**

- `archived_at IS NOT NULL` = archived; `archived_at IS NULL` = active
- Timestamp over boolean: you get audit history (when was it archived?) and the column doubles as flag + metadata in one
- Hard delete is ruled out: it loses the dedup anchor. Future scrapes of the same event would re-import it because the `(venue_id, event_date, normalized_performer)` unique index would no longer exist
- The existing `/api/events` route already filters `WHERE event_date >= NOW()` — in practice this already excludes past events from the map. The `archived_at` column enables a distinct "archived" state visible to admins without changing the public route's behavior
- Admin visibility: query `WHERE archived_at IS NOT NULL ORDER BY archived_at DESC` for an archived events admin view

Archival threshold: events more than 24 hours past their `event_date`. This gives grace for events that run late or span midnight.

---

## Cron Pattern for Archival

**Add one entry to vercel.json — total becomes 8 cron entries:**

```json
{
  "path": "/api/cron/archive",
  "schedule": "0 7 * * *"
}
```

7:00 AM UTC (3:00 AM ADT / 3:30 AM NDT) — low-traffic window, after the daily scrape at 6:00 AM UTC. Runs after scrape so newly scraped past-dated events (e.g., a venue website that has not removed old listings) get archived on the same day they are ingested.

The route runs a single Drizzle `UPDATE`:

```typescript
await db
  .update(events)
  .set({ archived_at: new Date() })
  .where(
    and(
      lt(events.event_date, subDays(new Date(), 1)),
      isNull(events.archived_at)
    )
  );
```

This is idempotent, safe to re-run, and completes in milliseconds on Neon for thousands of rows. No function timeout concern.

The existing `/api/events` route needs one additional `isNull(events.archived_at)` condition in the WHERE clause. The current `gte(events.event_date, new Date())` already does the same work for the public map, but the explicit `archived_at` filter is needed once an admin "archived events" view is built.

---

## UI Pattern for Series Grouping

**Recommendation: Plain HTML `<details>`/`<summary>` for the first pass.**

The project has no component library. The choice is:

1. **Plain HTML `<details>`/`<summary>`** — zero dependencies, keyboard-accessible, browser-native. Sufficient for "show all X upcoming dates for this series" toggle on an event card.
2. **`@radix-ui/react-collapsible` 1.1.12** — adds CSS animation control, React-managed open/closed state, WAI-ARIA. Worth adding if animated expand/collapse with controlled state is required (e.g., syncing collapse state with URL params or parent state).

Given the project's pattern of avoiding component libraries and the simplicity of the use case (a "Weekly" badge + collapsed list of future dates), plain `<details>`/`<summary>` avoids any new dependency. Add `@radix-ui/react-collapsible` only if animation or controlled state becomes a real requirement after the first pass.

The series label ("Weekly" or "Bi-weekly") can be derived at query time by computing median interval between ordered `event_date` values within the series group, then passed as a prop to the event card component.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `series_id` self-referential FK on `events` | Separate `event_series` table | Use a separate table when series need their own metadata (name, description, RRULE text) independent of any occurrence — not needed here |
| `archived_at` timestamp on `events` | Hard delete past events | Never: hard delete loses dedup anchors; future scrapes re-import the same events |
| `archived_at` timestamp on `events` | Boolean `is_archived` flag | Timestamp is strictly better — same query semantics (`IS NOT NULL`), adds audit trail for free |
| `archived_at` timestamp on `events` | Separate archive table | Use separate table if active events table grows past ~100K rows and index bloat becomes measurable on Neon |
| Daily archival cron | Archive at query time (API filter only) | If no admin "archived events" view is needed, `event_date >= NOW()` in the API already excludes past events with zero schema change — `archived_at` is needed only when admins need to inspect the archived state distinctly |
| Plain `<details>`/`<summary>` | @radix-ui/react-collapsible | Use Radix when animated open/close or React-controlled state is required |

---

## Installation

No new production dependencies are required for the core schema + archival approach.

If animated series collapse UI is needed:

```bash
npm install @radix-ui/react-collapsible
```

No other new packages. All detection and archival logic reuses existing Drizzle, date-fns, and Vercel cron infrastructure.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @radix-ui/react-collapsible@1.1.12 | React 19.2.3 | Radix primitives are React 19 compatible; a React 19.2 animation replay edge case exists (GitHub issue #3778) but is not a functional blocker |
| drizzle-orm@0.45.1 | Neon serverless@1.0.2 | Existing validated combination; self-referential FK uses standalone `foreignKey` operator, no new ORM features needed |
| date-fns@4.x | TypeScript 5 | Existing validated; `subDays`, `isBefore`, `differenceInDays` cover all archival and detection date math |

---

## Stack Patterns by Variant

**If series grouping is public-facing (event list shows collapsed series):**
- Add `series_id` FK to schema + Drizzle migration
- Derive `series_occurrence_count` in API query
- Badge renders on EventCard; plain `<details>` for collapse
- No new npm packages (or add @radix-ui/react-collapsible if animation needed)

**If series grouping is admin-only:**
- Same schema addition
- No UI library change; admin table uses plain Tailwind already
- Simpler — no collapse needed, just display series_id in admin events table

**If archival requires no distinct admin view (just keep existing date filter working):**
- Skip `archived_at` column entirely
- The existing `WHERE event_date >= NOW()` in `/api/events` already excludes past events
- Add `archived_at` only when admin needs a distinct "archived events" page

---

## Sources

- [Self Referencing Foreign Key in Drizzle ORM](https://gebna.gg/blog/self-referencing-foreign-key-typescript-drizzle-orm) — Drizzle self-referential FK pattern (MEDIUM confidence — community blog, consistent with Drizzle official docs)
- [Drizzle ORM Relations v2](https://orm.drizzle.team/docs/relations-v2) — official Drizzle docs on FK and relation patterns (HIGH confidence)
- [Again and Again! Managing Recurring Events In a Data Model](https://www.red-gate.com/blog/again-and-again-managing-recurring-events-in-a-data-model/) — series_id vs parent_event_id tradeoffs (MEDIUM confidence)
- [Soft deletion with PostgreSQL — Evil Martians](https://evilmartians.com/chronicles/soft-deletion-with-postgresql-but-with-logic-on-the-database) — timestamp vs boolean for soft delete/archival (HIGH confidence)
- [Soft Deletion Probably Isn't Worth It — brandur.org](https://brandur.org/soft-deletion) — when separate archive table is warranted vs in-table column (HIGH confidence)
- [rrule npm package](https://www.npmjs.com/package/rrule) — confirmed v2.8.1, last published 2+ years ago; ruled out (HIGH confidence on non-fit)
- [@radix-ui/react-collapsible npm](https://www.npmjs.com/package/@radix-ui/react-collapsible) — confirmed v1.1.12 (HIGH confidence)
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) — cron schedule format, Hobby plan constraints (HIGH confidence)
- [Calendar Recurring Events: Best Database Storage Method](https://www.codegenes.net/blog/calendar-recurring-repeating-events-best-storage-method/) — storage method comparison (MEDIUM confidence)
- Codebase analysis (direct reads) — `schema.ts`, `vercel.json`, `package.json`, `/api/events/route.ts` — confirmed existing patterns and constraints, HIGH confidence

---
*Stack research for: East Coast Local v2.2 — recurring series detection/grouping + past event archival*
*Researched: 2026-03-16*
