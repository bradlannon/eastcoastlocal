# Phase 6: Category Schema - Research

**Researched:** 2026-03-14
**Domain:** Drizzle ORM schema migration — pgEnum on events table + discovered_sources staging table
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fixed 8-value enum: live_music, comedy, theatre, arts, sports, festival, community, other
- Friendly display labels: live_music → "Live Music", theatre → "Theatre", etc.
- Each category gets both a distinct color AND a small icon (for chips and badges)
- Default category for ambiguous events: "community" (not "other")
- Taxonomy enforced via z.enum() in extraction schema — LLM cannot produce out-of-taxonomy values
- discovered_sources staging table must include: status (pending/approved/rejected), source URL, domain, and discovery metadata
- Domain-based dedup to prevent rediscovering existing venues

### Claude's Discretion
- discovered_sources table column design
- pgEnum implementation details (export to avoid drizzle bug #5174)
- Backfill script approach
- Category color and icon assignments
- Migration file naming

### Deferred Ideas (OUT OF SCOPE)
- Zoom-to-location button on event cards (backlog from v1.1)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAT-03 | Database schema includes event_category enum column on events table | Drizzle pgEnum export pattern, text column alternative, migration generation workflow — all documented below |
</phase_requirements>

---

## Summary

Phase 6 is an additive schema migration with no application logic changes. It adds two things to the Neon Postgres database: an `event_category` column on the `events` table, and a new `discovered_sources` staging table. Both are prerequisites for every other v1.2 phase (CAT-01, CAT-02, DISC-01, DISC-02, DISC-03 all gate on this). The phase ships independently and is low-risk — additive DDL on Postgres is safe, and the new column is nullable so existing rows are unaffected.

The primary decision is pgEnum vs plain text for the category column. The project already documented Drizzle bug #5174 (pgEnum not exported is silently omitted from migration SQL) as a known risk. Research confirms this bug is still open as of January 2026 and affects drizzle-orm 0.45.1 (the installed version). The workaround — `export const categoryEnum = pgEnum(...)` — is trivial and confirmed effective. Both approaches (pgEnum with export, plain text) are viable; the recommendation is pgEnum with export because it gives Postgres-level constraint enforcement, which is worth the one-line export requirement.

The `discovered_sources` table design is Claude's discretion. The architecture research documents an exact schema with all required columns. The backfill script is a deliverable of this phase — it runs immediately after migration, before the feature is announced, to ensure existing events have categories when Phase 8 (category filter UI) launches.

**Primary recommendation:** Use `export const eventCategoryEnum = pgEnum(...)` for the column type. Generate the migration with `drizzle-kit generate`, verify the SQL contains the CREATE TYPE statement before running `drizzle-kit migrate`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | Schema definition, type inference | Already in production; `pgTable`, `pgEnum`, `text`, `serial`, `timestamp` all used |
| drizzle-kit | 0.31.9 (installed) | Migration generation and apply | `db:generate` + `db:migrate` already wired in package.json |
| @neondatabase/serverless | 1.0.2 (installed) | Neon Postgres connection | Already in production |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.21.x (installed) | Run TypeScript scripts directly | Backfill script: `tsx src/lib/db/backfill-categories.ts` |
| dotenv | 17.x (installed) | Load DATABASE_URL for scripts | Already used in seed.ts — same pattern for backfill |
| zod | 4.3.6 (installed) | Validate category values in extraction schema | Phase 7 concern but the enum values defined here must match |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pgEnum` with export | Plain `text` column | Text is simpler (no export requirement, no Drizzle bug risk), but loses Postgres-level constraint enforcement. Either works. pgEnum is slightly more correct semantically — Postgres will reject invalid values at the DB layer. |
| `pgEnum` with export | `text` with CHECK constraint | Equivalent safety to pgEnum, but Drizzle doesn't generate CHECK constraints in the same ergonomic way. pgEnum is cleaner in Drizzle. |

**Installation:** No new packages required. All tooling already installed.

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are:

```
src/lib/db/
├── schema.ts          ← ADD: pgEnum definition + event_category column + discovered_sources table
├── schema.test.ts     ← UPDATE: add assertions for new columns
├── backfill-categories.ts  ← NEW: one-time script, run immediately post-deploy
drizzle/
├── 0000_bouncy_vector.sql  ← existing
└── 0001_*.sql              ← NEW: generated by drizzle-kit generate
```

### Pattern 1: pgEnum with Mandatory Export

**What:** Define the category enum as an exported const at the top of schema.ts, then reference it in the column definition.

**When to use:** Always when using pgEnum in Drizzle. Bug #5174 (still open as of January 2026, confirmed in drizzle-orm 0.45.x) silently omits unexported enums from migration SQL.

**Example:**
```typescript
// Source: Drizzle ORM pgEnum docs + bug #5174 workaround
// src/lib/db/schema.ts

import {
  pgTable,
  pgEnum,   // ADD to imports
  serial,
  integer,
  text,
  timestamp,
  doublePrecision,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// MUST be exported — drizzle bug #5174: unexported enums are silently
// omitted from generated migration SQL
export const eventCategoryEnum = pgEnum('event_category', [
  'live_music',
  'comedy',
  'theatre',
  'arts',
  'sports',
  'festival',
  'community',
  'other',
]);

// Then in the events table definition:
export const events = pgTable(
  'events',
  {
    // ... existing columns unchanged ...
    event_category: eventCategoryEnum('event_category').default('community'),
  },
  (table) => [
    // ... existing indexes unchanged ...
  ]
);
```

**Why default 'community' instead of null:** CONTEXT.md locks this as "community" for ambiguous events. New events will default to community if not classified. Backfill will overwrite with real categories for existing events.

**Alternative if pgEnum causes trouble:**
```typescript
// Simpler fallback — plain text column, validated at application layer
event_category: text('event_category'),
// The z.enum() in extracted-event.ts provides equivalent constraint at extraction time
```

### Pattern 2: discovered_sources Table Design

**What:** Staging table for candidate venues found by the discovery pipeline. Required columns from CONTEXT.md: status, source URL, domain, discovery metadata.

**Example:**
```typescript
// Source: ARCHITECTURE.md design + CONTEXT.md requirements
export const discovered_sources = pgTable('discovered_sources', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  domain: text('domain').notNull(),        // extracted base domain for dedup
  source_name: text('source_name'),        // candidate venue/org name
  province: text('province'),              // NB, NS, PEI, NL
  city: text('city'),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | duplicate
  discovery_method: text('discovery_method'),          // 'gemini_grounding' | 'manual'
  raw_context: text('raw_context'),        // snippet/description from discovery source
  discovered_at: timestamp('discovered_at').defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at'),
  added_to_sources_at: timestamp('added_to_sources_at'),
});
```

**Why `domain` as a separate column:** CONTEXT.md requires domain-based dedup. Storing the normalized domain separately (e.g., `"liveattheplantation.com"` extracted from the full URL) avoids repeated URL parsing on every dedup check and allows a simple unique index.

**Optional: unique index on domain for dedup:**
```typescript
// Add to discovered_sources table definition if domain-level uniqueness is desired:
// uniqueIndex('discovered_sources_domain_key').on(table.domain)
// Trade-off: prevents the same venue being re-discovered; may be too aggressive
// (a domain could host multiple venues). Leave it non-unique; enforce in application logic.
```

### Pattern 3: Migration Generation and Verification

**What:** The established workflow for Drizzle schema changes in this project.

**When to use:** Every schema change. Always verify generated SQL before running migrate.

**Steps:**
```bash
# 1. Update src/lib/db/schema.ts
# 2. Generate migration
npm run db:generate
# 3. CRITICAL: Open drizzle/000N_*.sql and verify:
#    - CREATE TYPE "public"."event_category" AS ENUM(...) is present
#    - ALTER TABLE "events" ADD COLUMN "event_category" ... is present
#    - CREATE TABLE "discovered_sources" (...) is present
# 4. Apply migration
npm run db:migrate
# 5. Verify live in Neon (db:studio or direct query)
npm run db:studio
```

**Why verify the SQL:** Drizzle bug #5174. If `eventCategoryEnum` is not exported, the `CREATE TYPE` statement will be absent from the SQL file. Running migrate without the type definition causes a deploy-time Postgres error: `type "event_category" does not exist`.

### Pattern 4: Backfill Script

**What:** One-time script to assign a category to existing events. Runs immediately post-migration, before Phase 8 (filter UI) launches.

**When to use:** Any time a non-nullable column (or a column with business meaning) is added to a table with existing data.

**Pattern (from seed.ts):**
```typescript
// src/lib/db/backfill-categories.ts
import 'dotenv/config';
import { db } from './client';
import { events } from './schema';
import { isNull } from 'drizzle-orm';

async function backfill() {
  // Option A: Set all null categories to 'community' (default) immediately
  // This unblocks the filter UI without a Gemini call
  const result = await db
    .update(events)
    .set({ event_category: 'community' })
    .where(isNull(events.event_category))
    .returning({ id: events.id });
  console.log(`Backfilled ${result.length} events with default 'community' category`);

  // Phase 7 will then re-scrape and overwrite 'community' with real AI-assigned categories
  // via ON CONFLICT DO UPDATE SET event_category = excluded.event_category
}

backfill().catch(console.error).finally(() => process.exit(0));
```

**Run command:** `tsx src/lib/db/backfill-categories.ts`

**Important:** Phase 7 (AI extraction extension) will re-scrape all sources and overwrite the default 'community' with real Gemini-assigned categories via the `ON CONFLICT DO UPDATE` clause. The backfill here is a stopgap to ensure the filter UI has non-null data at launch.

### Anti-Patterns to Avoid

- **Forgetting to export pgEnum:** The single most likely failure point. `const eventCategoryEnum = pgEnum(...)` without `export` produces a migration file with no `CREATE TYPE` statement. Results in a Postgres error at migrate time: `type "event_category" does not exist`.
- **Running migrate before verifying SQL:** Always open the generated `.sql` file and confirm `CREATE TYPE` is present before running `db:migrate`.
- **Making event_category NOT NULL without backfill:** Adding a NOT NULL column to a table with existing rows fails with `null value violates not-null constraint` unless a DEFAULT is specified. The default 'community' handles this, but confirm it's in the migration SQL.
- **Writing directly to scrape_sources from discovery:** The `discovered_sources` table is a staging queue. Discovery writes here; scraping reads from `scrape_sources`. Never conflate them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration generation | Custom ALTER TABLE scripts | `npm run db:generate` (drizzle-kit) | Drizzle tracks schema state in `drizzle/meta/`; manual SQL diverges from tracked state and breaks future migrations |
| Category validation at DB layer | CHECK constraint via raw SQL | `pgEnum` with export | Drizzle handles CREATE TYPE and column type in one definition |
| Type-safe enum values in TypeScript | Manual union type `'live_music' \| 'comedy' \| ...` | `typeof eventCategoryEnum.enumValues[number]` or `z.infer<typeof categoryZodEnum>` | Single source of truth; adding a category updates TypeScript types automatically |
| Domain extraction for dedup | Custom URL parsing | `new URL(url).hostname` | Built-in, handles edge cases (www prefix, port numbers, etc.) |

**Key insight:** Let Drizzle generate migrations. The `drizzle/meta/` directory tracks the full schema snapshot. Any manual SQL that diverges from this snapshot causes `drizzle-kit generate` to produce incorrect diffs on future runs.

---

## Common Pitfalls

### Pitfall 1: pgEnum Not Exported (Drizzle Bug #5174)

**What goes wrong:** Migration SQL is generated without the `CREATE TYPE` statement. Running migrate produces: `ERROR: type "event_category" does not exist`.

**Why it happens:** Drizzle-kit tree-shakes unexported schema members before generating SQL. This is confirmed open behavior in drizzle-orm 0.45.1 (January 2026 — still open, reclassified from bug to "enhancement documentation").

**How to avoid:** `export const eventCategoryEnum = pgEnum(...)` — the `export` keyword is mandatory. Verify by opening the generated SQL file and confirming `CREATE TYPE "public"."event_category" AS ENUM(...)` is present before running migrate.

**Warning signs:** Generated `.sql` file contains `ALTER TABLE "events" ADD COLUMN "event_category" "event_category"` but no preceding `CREATE TYPE` statement.

### Pitfall 2: NOT NULL Column Without DEFAULT on Existing Data

**What goes wrong:** `ALTER TABLE events ADD COLUMN event_category TEXT NOT NULL` fails immediately on a table with existing rows: `null value in column "event_category" violates not-null constraint`.

**Why it happens:** Postgres cannot add a NOT NULL column without a default when rows already exist (unless the column is filled in the same transaction).

**How to avoid:** Add with `.default('community')` in the Drizzle column definition. This generates `DEFAULT 'community'::event_category` in the ALTER TABLE statement, which Postgres applies to all existing rows atomically.

**Warning signs:** Migrate fails with constraint violation error on a non-empty table.

### Pitfall 3: Meta State Divergence from Manual SQL

**What goes wrong:** Drizzle generates a migration on the next schema change that tries to re-create columns or tables already added manually, or drops things that should exist.

**Why it happens:** Drizzle-kit tracks schema state in `drizzle/meta/_journal.json` and snapshot files. Running raw SQL outside of drizzle-kit bypasses this tracking.

**How to avoid:** Never run schema-altering SQL directly against the database outside the drizzle-kit migration workflow. Use `db:generate` + `db:migrate` exclusively.

**Warning signs:** `drizzle-kit generate` produces a migration that adds columns already present in the database.

### Pitfall 4: Category Values Disagreeing Between Schema and Zod

**What goes wrong:** Phase 7 tries to use `z.enum([...])` with values that don't match the pgEnum values. LLM returns a value that's valid in Zod but not in Postgres (or vice versa).

**Why it happens:** Enum values defined twice — once in schema.ts and once in extracted-event.ts — diverge when one is updated.

**How to avoid:** Export the enum values from schema.ts and import them in extracted-event.ts:
```typescript
// schema.ts
export const EVENT_CATEGORIES = [
  'live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other'
] as const;
export const eventCategoryEnum = pgEnum('event_category', EVENT_CATEGORIES);

// extracted-event.ts (Phase 7)
import { EVENT_CATEGORIES } from '../db/schema';
event_category: z.enum(EVENT_CATEGORIES).nullable(),
```

**Warning signs:** TypeScript compiles fine but runtime inserts fail with Postgres enum constraint violations.

---

## Code Examples

Verified patterns from existing codebase and official Drizzle docs:

### Full schema.ts Changes

```typescript
// Source: existing schema.ts + Drizzle pgEnum docs + bug #5174 workaround
import {
  pgTable,
  pgEnum,          // NEW import
  serial,
  integer,
  text,
  timestamp,
  doublePrecision,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// Export enum values separately so Phase 7 can import them for z.enum()
export const EVENT_CATEGORIES = [
  'live_music',
  'comedy',
  'theatre',
  'arts',
  'sports',
  'festival',
  'community',
  'other',
] as const;

// MUST be exported — drizzle bug #5174
export const eventCategoryEnum = pgEnum('event_category', EVENT_CATEGORIES);

export const venues = pgTable('venues', {
  // ... unchanged ...
});

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    venue_id: integer('venue_id').references(() => venues.id).notNull(),
    performer: text('performer').notNull(),
    normalized_performer: text('normalized_performer').notNull(),
    event_date: timestamp('event_date').notNull(),
    event_time: text('event_time'),
    source_url: text('source_url'),
    scrape_timestamp: timestamp('scrape_timestamp'),
    raw_extracted_text: text('raw_extracted_text'),
    price: text('price'),
    ticket_link: text('ticket_link'),
    description: text('description'),
    cover_image_url: text('cover_image_url'),
    event_category: eventCategoryEnum('event_category').default('community'), // NEW
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('events_dedup_key').on(table.venue_id, table.event_date, table.normalized_performer),
    index('events_event_date_idx').on(table.event_date),
  ]
);

export const scrape_sources = pgTable('scrape_sources', {
  // ... unchanged ...
});

// NEW: staging table for discovery pipeline
export const discovered_sources = pgTable('discovered_sources', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  domain: text('domain').notNull(),
  source_name: text('source_name'),
  province: text('province'),
  city: text('city'),
  status: text('status').notNull().default('pending'),
  discovery_method: text('discovery_method'),
  raw_context: text('raw_context'),
  discovered_at: timestamp('discovered_at').defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at'),
  added_to_sources_at: timestamp('added_to_sources_at'),
});
```

### Expected Generated Migration SQL (verify this appears)

```sql
-- Generated by drizzle-kit generate
CREATE TYPE "public"."event_category" AS ENUM(
  'live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other'
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "event_category" "event_category" DEFAULT 'community';
--> statement-breakpoint
CREATE TABLE "discovered_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "domain" text NOT NULL,
  "source_name" text,
  "province" text,
  "city" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "discovery_method" text,
  "raw_context" text,
  "discovered_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp,
  "added_to_sources_at" timestamp,
  CONSTRAINT "discovered_sources_url_unique" UNIQUE("url")
);
```

### Updated schema.test.ts

```typescript
// Source: existing schema.test.ts pattern
import { venues, events, scrape_sources, discovered_sources, eventCategoryEnum } from './schema';

describe('Database Schema Structure', () => {
  // ... existing tests unchanged ...

  describe('events table', () => {
    it('has all expected columns including event_category', () => {
      const columns = Object.keys(events);
      expect(columns).toContain('event_category');
      // ... existing column checks ...
    });
  });

  describe('eventCategoryEnum', () => {
    it('has exactly the 8 required values', () => {
      const values = eventCategoryEnum.enumValues;
      expect(values).toHaveLength(8);
      expect(values).toContain('live_music');
      expect(values).toContain('comedy');
      expect(values).toContain('theatre');
      expect(values).toContain('arts');
      expect(values).toContain('sports');
      expect(values).toContain('festival');
      expect(values).toContain('community');
      expect(values).toContain('other');
    });
  });

  describe('discovered_sources table', () => {
    it('has all required columns', () => {
      const columns = Object.keys(discovered_sources);
      expect(columns).toContain('url');
      expect(columns).toContain('domain');
      expect(columns).toContain('status');
      expect(columns).toContain('discovered_at');
    });
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual ALTER TABLE SQL | `drizzle-kit generate` + `drizzle-kit migrate` | Already established in this project | Drizzle tracks migration state; don't diverge |
| Separate categorization LLM call | Category field in same extraction schema | v1.2 design decision | Zero extra Gemini cost for classification |

**Deprecated/outdated:**
- Running `db:migrate` without first generating: always run `db:generate` to create the SQL file, review it, then `db:migrate` to apply it.

---

## Open Questions

1. **pgEnum default behavior with ON CONFLICT DO UPDATE**
   - What we know: `normalizer.ts` uses `ON CONFLICT DO UPDATE SET ...` for upserts. Adding `event_category` to the SET clause will backfill existing events on re-scrape.
   - What's unclear: Whether `ON CONFLICT DO UPDATE SET event_category = EXCLUDED.event_category` should be included now (in Phase 6) or deferred to Phase 7 when the extractor starts producing category values.
   - Recommendation: Leave normalizer changes to Phase 7. Phase 6 only changes the DB schema. The default 'community' backfill script handles the data gap.

2. **Domain extraction logic for discovered_sources.domain**
   - What we know: Domain is needed for dedup. `new URL(url).hostname` gives `www.liveatplantation.com`; stripping `www.` gives the base domain.
   - What's unclear: Whether to strip subdomains beyond `www` (e.g., `events.ticketmaster.com` → should remain `ticketmaster.com` to exclude the whole platform, or `events.ticketmaster.com` to be more specific?).
   - Recommendation: Use `hostname` directly (keep subdomains). Discovery pipeline will handle platform URLs separately in Phase 9.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 with ts-jest |
| Config file | `jest.config.ts` (exists at project root) |
| Quick run command | `npx jest src/lib/db/schema.test.ts --no-coverage` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-03 | events table has event_category column | unit | `npx jest src/lib/db/schema.test.ts --no-coverage` | ✅ (needs update) |
| CAT-03 | eventCategoryEnum has exactly 8 values including all required slugs | unit | `npx jest src/lib/db/schema.test.ts --no-coverage` | ✅ (needs new test block) |
| CAT-03 | discovered_sources table has required columns (url, domain, status, discovered_at) | unit | `npx jest src/lib/db/schema.test.ts --no-coverage` | ✅ (needs new test block) |
| CAT-03 | Migration SQL contains CREATE TYPE statement (manual) | manual | Open `drizzle/000N_*.sql` and verify | N/A — verify before migrate |

### Sampling Rate

- **Per task commit:** `npx jest src/lib/db/schema.test.ts --no-coverage`
- **Per wave merge:** `npx jest`
- **Phase gate:** All tests green + migration applied to Neon + `npm run db:studio` shows new columns before marking phase complete

### Wave 0 Gaps

- [ ] `src/lib/db/schema.test.ts` — update existing events test to include `event_category`; add `eventCategoryEnum` test block; add `discovered_sources` test block (file exists, needs additions — not a new file)

*(No new test files needed — all coverage is additive to the existing schema.test.ts)*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `src/lib/db/schema.ts`, `drizzle.config.ts`, `drizzle/0000_bouncy_vector.sql`, `src/lib/db/schema.test.ts`, `src/lib/db/seed.ts` — exact current schema, migration pattern, test pattern
- `package.json` — drizzle-orm@0.45.1, drizzle-kit@0.31.9, jest@30.3.0 installed versions confirmed
- `.planning/research/ARCHITECTURE.md` — v1.2 schema design for event_category and discovered_sources, verified against codebase
- `.planning/phases/06-category-schema/06-CONTEXT.md` — locked decisions and discretion areas

### Secondary (MEDIUM confidence)

- [Drizzle ORM pgEnum bug #5174](https://github.com/drizzle-team/drizzle-orm/issues/5174) — confirmed still open as of January 2026, reclassified to "enhancement/documentation" (not fixed in 0.45.x); workaround is `export const`
- `.planning/research/SUMMARY.md` — cross-references confirm pgEnum export workaround and discovered_sources rationale

### Tertiary (LOW confidence)

- None — all claims in this document are supported by codebase inspection or confirmed bug report.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling already in production; no new packages
- Architecture: HIGH — schema design verified against existing patterns; ARCHITECTURE.md provides exact column definitions
- Pitfalls: HIGH — pgEnum bug #5174 confirmed open in installed version; NOT NULL / DEFAULT pitfall is standard Postgres behavior

**Research date:** 2026-03-14
**Valid until:** Stable — schema migration patterns don't change; pgEnum bug #5174 valid until drizzle-kit releases a fix (check on upgrade)
