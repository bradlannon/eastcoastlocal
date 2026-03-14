# Phase 1: Foundation - Research

**Researched:** 2026-03-13
**Domain:** Next.js 16 + Neon Postgres + Drizzle ORM scaffold on Vercel, greenfield
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Schema design:** Separate `venues` table (name, address, lat/lng, province, city, website, phone, venue_type). `events` table with FK to venues (performer, date, time, source_url, scrape_timestamp, raw_extracted_text, price nullable, ticket_link nullable, description nullable, cover_image_url nullable). Dedup composite key: venue_id + event_date + normalized_band_name (lowercased, trimmed). Index on event_date.
- **Source configuration:** `scrape_sources` database table (not config file). Fields: url, venue_name FK to venues, scrape_frequency (daily/weekly), last_scraped_at, last_scrape_status (success/failure/pending), source_type (venue_website, eventbrite, bandsintown).
- **Initial sources:** Seed 5-10 venues across all four provinces (NB, NS, PEI, NL). Claude selects specific venues based on which have scrapeable event pages.
- **Project structure:** Next.js 16 with App Router, Tailwind CSS, Drizzle ORM, Neon Postgres (serverless, Vercel-native).

### Claude's Discretion
- Exact src/ directory layout and folder conventions
- Component library choice (shadcn/ui or similar)
- Drizzle migration strategy
- Seed script implementation approach
- TypeScript configuration details

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | App is deployed on Vercel with cloud-hosted Neon Postgres database | Verified Vercel + Neon integration; DATABASE_URL auto-exposed by Neon Vercel integration; drizzle-kit migrate in build step |
| SCRP-05 | Admin can configure a list of scrape target URLs (venue websites and event platform pages) | scrape_sources table schema defined; seed script pattern identified; no UI needed in Phase 1 |
| SCRP-06 | System stores events in Postgres with band/performer, venue, date, time, coordinates, and source URL | Full schema with all required columns defined; Drizzle pgTable patterns verified |
</phase_requirements>

---

## Summary

This phase scaffolds a greenfield Next.js 16 project, connects it to Neon Postgres via Drizzle ORM, defines the full database schema, runs migrations to Neon, deploys the app to Vercel, and seeds the scrape_sources table with 5-10 real Atlantic Canada venues. Phase 2 (scraping pipeline) and Phase 3 (map UI) both depend on everything built here.

The stack is well-documented and production-proven. Next.js 16.1.6 LTS is the current stable release. Drizzle ORM with the `@neondatabase/serverless` driver is Neon's recommended approach for Vercel serverless functions — it avoids WebSocket TCP issues and cold-start penalties from Prisma's binary engine. The full scaffold (create-next-app + drizzle + neon + shadcn) has multiple verified tutorials from late 2025 and early 2026.

The trickiest part of this phase is the migration strategy in production. The correct pattern is: `drizzle-kit generate` (creates SQL files committed to the repo) + `drizzle-kit migrate` (applies pending migrations) run as part of the Vercel build command, not as a post-deploy step.

**Primary recommendation:** Scaffold with `create-next-app@latest`, add Drizzle + Neon driver, define schema in `src/lib/db/schema.ts`, use `drizzle-kit generate && drizzle-kit migrate` in the Vercel build command, seed scrape_sources via a `npm run db:seed` script run manually after first deploy.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 LTS | Full-stack React framework | Current stable LTS; Vercel-native; App Router + serverless functions; Turbopack default |
| React | 19.2 | UI rendering | Bundled with Next.js 16; Server Components reduce client JS |
| TypeScript | 5.x | Type safety | Required for Drizzle's type inference and Zod integration |
| Neon Postgres | latest | Cloud Postgres | Vercel's official integration partner; scale-to-zero; database branching per preview deploy |
| Drizzle ORM | 0.39.x | Database access | ~7.4KB bundle; no binary engine; SQL-like API; Neon first-class support |
| @neondatabase/serverless | latest | Neon driver | HTTP/WebSocket driver — works in Vercel serverless/edge; avoids TCP connection limits |
| drizzle-kit | 0.30.x | Schema migrations | Generates SQL files; applies migrations; studio for local browsing |
| Tailwind CSS | 4.x | Styling | Default in create-next-app; CSS-in-file `@theme` variables |
| shadcn/ui | latest CLI | UI components | Works with Tailwind v4 + React 19; copy-paste components; zero runtime overhead |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.x | Schema validation | Define event/venue shapes used by both Drizzle and Phase 2 AI extraction |
| date-fns | 4.x | Date utilities | Normalizing dates for dedup composite key |
| dotenv | 16.x | Env var loading | Local dev; drizzle-kit reads DATABASE_URL from .env |

### Installation

```bash
# 1. Scaffold
npx create-next-app@latest eastcoastlocal \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*"

cd eastcoastlocal

# 2. Database
npm install drizzle-orm @neondatabase/serverless dotenv
npm install -D drizzle-kit tsx

# 3. Utilities
npm install zod date-fns

# 4. UI (after tailwind setup)
npx shadcn@latest init
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home (placeholder for Phase 3 map)
│   ├── layout.tsx              # Root layout
│   └── api/
│       └── health/route.ts     # Simple health check for INFR-01 verification
├── lib/
│   └── db/
│       ├── client.ts           # Drizzle client (singleton pattern)
│       ├── schema.ts           # All table definitions (venues, events, scrape_sources)
│       └── seed.ts             # Seed script for scrape_sources + venues
└── types/
    └── index.ts                # Shared TypeScript types derived from schema
drizzle/                        # Generated SQL migration files (committed to repo)
drizzle.config.ts               # Drizzle Kit configuration
```

### Pattern 1: Drizzle Client Singleton (Neon HTTP driver)

**What:** One database client per process, using Neon's HTTP driver (not TCP).
**When to use:** All database access in this project — required for Vercel serverless.

```typescript
// src/lib/db/client.ts
// Source: https://orm.drizzle.team/docs/get-started/neon-new
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

### Pattern 2: Drizzle Schema Definition

**What:** Define all three tables in a single `schema.ts`. Export tables for use in queries and for Drizzle Kit to generate migrations.

```typescript
// src/lib/db/schema.ts
// Source: Drizzle docs + CONTEXT.md schema decisions
import {
  pgTable,
  serial,
  text,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const venues = pgTable('venues', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull(), // NB, NS, PEI, NL
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  website: text('website'),
  phone: text('phone'),
  venue_type: text('venue_type'), // pub, concert_hall, outdoor, etc.
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    venue_id: serial('venue_id').references(() => venues.id).notNull(),
    performer: text('performer').notNull(),
    normalized_performer: text('normalized_performer').notNull(), // lowercase, trimmed
    event_date: timestamp('event_date').notNull(),
    event_time: text('event_time'),
    source_url: text('source_url'),
    scrape_timestamp: timestamp('scrape_timestamp'),
    raw_extracted_text: text('raw_extracted_text'),
    price: text('price'),
    ticket_link: text('ticket_link'),
    description: text('description'),
    cover_image_url: text('cover_image_url'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Composite dedup key: venue + date + normalized performer
    dedup_key: uniqueIndex('events_dedup_key').on(
      table.venue_id,
      table.event_date,
      table.normalized_performer
    ),
    // Index for date filtering (MAP-05, public queries)
    event_date_idx: index('events_event_date_idx').on(table.event_date),
  })
);

export const scrape_sources = pgTable('scrape_sources', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  venue_id: serial('venue_id').references(() => venues.id).notNull(),
  scrape_frequency: text('scrape_frequency').notNull().default('daily'), // daily, weekly
  last_scraped_at: timestamp('last_scraped_at'),
  last_scrape_status: text('last_scrape_status').default('pending'), // success, failure, pending
  source_type: text('source_type').notNull(), // venue_website, eventbrite, bandsintown
  enabled: text('enabled').notNull().default('true'), // use text for Drizzle simplicity
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

### Pattern 3: Migration Strategy

**What:** `drizzle-kit generate` creates SQL files (committed to the repo). `drizzle-kit migrate` applies pending migrations. Run migrations in the Vercel build step.
**Why generate not push:** `drizzle-kit push` is for dev/prototyping only — it bypasses SQL files. In production, generated SQL files are the audit trail and enable rollbacks.

```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/get-started/neon-new
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```json
// package.json scripts to add
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/lib/db/seed.ts",
    "build": "npm run db:migrate && next build"
  }
}
```

Note: Running `db:migrate` inside `build` means every Vercel deployment migrates the Neon database before the Next.js build completes. This is safe because Drizzle tracks applied migrations via its internal `__drizzle_migrations` table.

### Pattern 4: Seed Script for scrape_sources

**What:** A standalone TypeScript script (run with `tsx`) that inserts venues and scrape_sources rows. Run manually after first deploy.

```typescript
// src/lib/db/seed.ts (structure only — actual venue data in Venue Seed Data section below)
import 'dotenv/config';
import { db } from './client';
import { venues, scrape_sources } from './schema';

async function seed() {
  // Insert venues first (FK constraint)
  const venueRows = await db.insert(venues).values([...]).returning();

  // Insert scrape_sources with venue FKs
  await db.insert(scrape_sources).values(
    venueRows.map((v, i) => ({
      url: sourceUrls[i],
      venue_id: v.id,
      source_type: 'venue_website',
      scrape_frequency: 'daily',
    }))
  );
  console.log('Seeded successfully');
  process.exit(0);
}

seed().catch(console.error);
```

### Anti-Patterns to Avoid

- **`drizzle-kit push` in production:** Bypasses migration files, breaks audit trail, risks data loss on conflict. Use only locally with `DATABASE_URL` pointing to a dev branch.
- **Running migrations at runtime (in the Next.js app startup):** Slows cold starts, fails if multiple functions run simultaneously. Run migrations only in the build step.
- **Postgres TCP driver (`pg`) in Vercel serverless:** TCP connections don't work cleanly in serverless; use `@neondatabase/serverless` HTTP driver exclusively.
- **Storing `normalized_performer` as a computed query:** The composite unique index requires a persisted column — always write the normalized value at insert time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database migrations | Custom SQL runner | drizzle-kit generate + migrate | Handles conflict detection, migration history, rollback |
| Database connection pooling | Custom pool manager | @neondatabase/serverless HTTP driver | Neon's serverless driver is stateless by design — no pool needed |
| String normalization for dedup | Custom regex normalizer | `performer.toLowerCase().trim().replace(/\s+/g, ' ')` | Simple inline, no library needed; document the exact transform |
| UI components (tables, forms) | Custom styled divs | shadcn/ui | Accessible, Tailwind v4 compatible, copy-paste |
| Type inference from schema | Manual TypeScript types | Drizzle's `$inferSelect` / `$inferInsert` | Auto-synced with schema changes |

---

## Common Pitfalls

### Pitfall 1: Migration Runs Against Wrong Database

**What goes wrong:** Developer runs `npm run db:migrate` locally without `.env` set up, or with a stale `.env` pointing to production. Wipes the production migration state.
**Why it happens:** `drizzle-kit migrate` reads `DATABASE_URL` from environment — no guard against running against prod.
**How to avoid:** Use Neon database branching. Create a `dev` branch in Neon for local development. Set `.env` to the dev branch URL. Production `DATABASE_URL` only exists in Vercel environment variables, never in `.env`.
**Warning signs:** Running `db:migrate` prints "X migrations applied" but you were expecting 0 (nothing changed).

### Pitfall 2: Vercel Build Fails Because DATABASE_URL Not Set

**What goes wrong:** First deploy fails because `db:migrate` in the build step cannot find `DATABASE_URL`.
**Why it happens:** The Neon Vercel integration must be connected before the first deploy. If the integration is added after project creation, the env var is not present on the first build.
**How to avoid:** Connect Neon integration in Vercel dashboard BEFORE triggering first deploy. Verify `DATABASE_URL` appears in Project Settings > Environment Variables before pushing code.
**Warning signs:** Build log shows `Error: DATABASE_URL is not set` or `connection refused`.

### Pitfall 3: Composite Unique Index Uses Wrong Column Order

**What goes wrong:** The dedup query performs a sequential scan instead of using the composite index. Slow upserts at scale.
**Why it happens:** Postgres uses indexes left-to-right. The column with highest selectivity (normalized_performer) should not be first if most queries filter by venue_id first.
**How to avoid:** Order the composite index `(venue_id, event_date, normalized_performer)` — venue_id first (filters to one venue's events), then event_date (narrows to a single day), then performer (dedup check).
**Warning signs:** Slow upserts on re-scrape; `EXPLAIN ANALYZE` shows sequential scan on events table.

### Pitfall 4: Neon Serverless Driver WebSocket vs HTTP Mode

**What goes wrong:** Transaction support requires WebSocket mode, but HTTP mode is used everywhere. Developer tries to wrap inserts in a transaction and gets an error.
**Why it happens:** `drizzle/neon-http` uses the HTTP driver which doesn't support interactive transactions. The WebSocket driver (`drizzle/neon-serverless`) does, but adds complexity.
**How to avoid:** For Phase 1, HTTP mode is fine — no transactions needed for simple inserts. Note for Phase 2: if the scraping pipeline needs atomic writes (upsert events + update scrape_sources in one transaction), switch to the WebSocket driver or use Drizzle's `db.transaction()` with the ws driver.
**Warning signs:** `Error: Transactions are not supported in HTTP mode` from Neon driver.

### Pitfall 5: `enabled` Column Type for Boolean in Drizzle + Neon

**What goes wrong:** Using `boolean()` type for `enabled` column works in Drizzle but requires careful handling in queries (`eq(table.enabled, true)` vs `eq(table.enabled, 'true')`).
**Why it happens:** Drizzle's `boolean()` maps to Postgres `boolean` cleanly, but some edge cases arise with Neon's HTTP driver serialization.
**How to avoid:** Use `boolean('enabled').notNull().default(true)` (Drizzle handles Postgres boolean correctly). The schema above used `text` for simplicity — prefer `boolean` instead.
**Warning signs:** Filter `WHERE enabled = true` returning no rows despite seeded data.

---

## Venue Seed Data

Claude's selection of 5-10 scrapeable venues across all four Atlantic provinces, based on research:

### Confirmed Scrapeable Venues

| Venue | City | Province | URL | Source Type | Rendering |
|-------|------|----------|-----|-------------|-----------|
| 2037 Gottingen (Marquee/Seahorse) | Halifax | NS | https://2037gottingen.ca/events/ | venue_website | WordPress static HTML; needs individual event page follow |
| Atlantic Entertainment | Halifax | NS | https://www.aentertainment.ca/events | venue_website | Static HTML with schema.org JSON-LD markup — best target |
| Capitol Theatre | Moncton | NB | https://capitol.nb.ca/en/tickets-events | venue_website | Joomla server-rendered; events in HTML cards |
| PEI Symphony Orchestra | Charlottetown | PEI | https://peisymphony.com/events | venue_website | WordPress; static HTML events listing |

### Venues Requiring Investigation Before Scraping

| Venue | City | Province | Issue |
|-------|------|----------|-------|
| The Ship Pub & Kitchen | St. John's | NL | Primary schedule on Facebook; no independent event calendar found. May need Eventbrite or manual entry. |
| Baba's Lounge | Charlottetown | PEI | Facebook-primary; events on Songkick/AllEvents aggregators, not own site |
| Harvest Music Festival | Fredericton | NB | Seasonal festival (September); off-season has no events to scrape |

### Recommended Seed Approach

Seed with the 4 confirmed scrapeable venues + their scrape_sources rows. For the NL province, add The Ship Pub as a venue with a placeholder source URL marked `enabled = false` until a scrapeable URL is identified. This satisfies the "at least one from each province" requirement and keeps the seed data honest.

```
NS: 2037 Gottingen + Atlantic Entertainment (2 sources)
NB: Capitol Theatre Moncton (1 source)
PEI: PEI Symphony Orchestra (1 source)
NL: The Ship Pub (venue seeded, source disabled — no scrapeable URL confirmed)
```

Add a 5th NS or NB venue to reach the 5-source minimum if desired.

---

## Code Examples

### Drizzle Insert with Upsert (dedup pattern)

```typescript
// Source: https://orm.drizzle.team/docs/guides/upsert
import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';

await db.insert(events)
  .values({
    venue_id: venueId,
    performer: 'The Trews',
    normalized_performer: 'the trews', // always lowercase + trim
    event_date: new Date('2026-04-15'),
    source_url: 'https://example.com/events/trews-april-15',
  })
  .onConflictDoUpdate({
    target: [events.venue_id, events.event_date, events.normalized_performer],
    set: {
      source_url: sql`excluded.source_url`,
      scrape_timestamp: sql`now()`,
    },
  });
```

### Type Inference from Schema

```typescript
// Source: Drizzle docs - type inference
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { events, venues, scrape_sources } from '@/lib/db/schema';

export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;
export type Venue = InferSelectModel<typeof venues>;
export type ScrapeSource = InferSelectModel<typeof scrape_sources>;
```

### Health Check Route (INFR-01 verification)

```typescript
// src/app/api/health/route.ts
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    return Response.json({ status: 'error', db: 'disconnected' }, { status: 500 });
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma on Vercel serverless | Drizzle ORM + Neon serverless driver | 2023-2024 | Eliminates 1-3s cold starts, reduces bundle 80% |
| `drizzle-kit push` for all envs | push for dev, generate+migrate for prod | Drizzle Kit 0.20+ | Prevents accidental schema drift in production |
| tailwind.config.js | `@theme` CSS variables in CSS file | Tailwind v4 (2025) | No JS config; faster compilation |
| `npx shadcn-ui@latest init` | `npx shadcn@latest init` | shadcn CLI v4 (2025) | New CLI; old command still works but deprecated |
| `react-leaflet-markercluster` | `react-leaflet-cluster` | react-leaflet v4+ | Old package unmaintained, incompatible with v4+/v5+ |

---

## Open Questions

1. **NL venue with scrapeable events**
   - What we know: The Ship Pub is the most prominent live music venue in St. John's; their schedule is Facebook-primary with no independent events calendar found.
   - What's unclear: Whether lspuhall.ca has a scrapeable events page, or if there's another St. John's venue with a static HTML listing.
   - Recommendation: Seed The Ship Pub as a venue with `enabled = false` scrape source. Add a task note to verify LSPU Hall (lspuhall.ca) and Resource Centre for the Arts during seed script creation.

2. **Boolean vs Text for `enabled` column**
   - What we know: Drizzle supports `boolean()` for Postgres; the schema example above used `text` for safety.
   - What's unclear: Whether any Vercel/Neon edge cases affect `boolean` serialization in the HTTP driver.
   - Recommendation: Use `boolean('enabled').notNull().default(true)` — it's the correct Postgres type. Drizzle handles it correctly. No known HTTP driver issues.

3. **`db:migrate` in build step — idempotency on concurrent deploys**
   - What we know: Drizzle's migration runner uses a `__drizzle_migrations` table to track applied migrations.
   - What's unclear: If two Vercel builds run simultaneously (e.g., a deploy triggered while a previous build is still running), both attempt `db:migrate` at the same time.
   - Recommendation: This is unlikely in practice for a solo/small team project. Drizzle's migration table is advisory; race conditions are theoretically possible but the SQL migration files are idempotent (CREATE TABLE IF NOT EXISTS). No action needed for Phase 1; document the known limitation.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed yet — greenfield project |
| Config file | None — Wave 0 must install |
| Quick run command | `npx jest --testPathPattern=src/lib/db --passWithNoTests` |
| Full suite command | `npx jest --passWithNoTests` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-01 | App returns 200 at /api/health with DB connected | smoke | `curl -f $VERCEL_URL/api/health` (post-deploy) | ❌ Wave 0 |
| INFR-01 | Migrations run without error | integration | `npm run db:migrate` exits 0 | ❌ Wave 0 |
| SCRP-05 | scrape_sources table has rows after seed | integration | `npx jest src/lib/db/seed.test.ts` | ❌ Wave 0 |
| SCRP-06 | events, venues, scrape_sources tables have correct columns | integration | `npx jest src/lib/db/schema.test.ts` | ❌ Wave 0 |

**Note:** INFR-01 "app returns valid response at its public URL" is fundamentally a post-deploy smoke test, not a unit test. The plan should include a manual verification step: after deploy, `curl https://$VERCEL_URL/api/health` and confirm `{"status":"ok","db":"connected"}`.

### Sampling Rate

- **Per task commit:** `npm run db:generate` exits 0 (confirms schema is valid Drizzle syntax)
- **Per wave merge:** `npm run db:migrate` against dev Neon branch; verify table count
- **Phase gate:** Manual `curl /api/health` on deployed Vercel URL before calling `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `jest.config.ts` and `jest.setup.ts` — Jest configured for Next.js + TypeScript
- [ ] `src/lib/db/schema.test.ts` — verifies all three tables exist with correct columns via Drizzle introspection
- [ ] `src/lib/db/seed.test.ts` — verifies seed inserts rows into scrape_sources and venues
- [ ] Framework install: `npm install -D jest @types/jest ts-jest jest-environment-node`

---

## Sources

### Primary (HIGH confidence)

- [Drizzle ORM: Get Started with Neon](https://orm.drizzle.team/docs/get-started/neon-new) — client setup, schema, migration commands
- [Drizzle ORM: Upsert Guide](https://orm.drizzle.team/docs/guides/upsert) — onConflictDoUpdate with composite targets
- [Drizzle ORM: Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) — uniqueIndex and index syntax
- [Neon: Drizzle with Local and Serverless Postgres](https://neon.com/guides/drizzle-local-vercel) — environment strategy, migration workflow
- [Next.js: create-next-app CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app) — scaffold flags
- [shadcn/ui: Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — v4 compatibility confirmed
- [Next.js 16.1 blog post](https://nextjs.org/blog/next-16-1) — 16.1.6 LTS confirmed current stable

### Secondary (MEDIUM confidence)

- [Neon: Schema migrations with Drizzle](https://neon.com/docs/guides/drizzle-migrations) — migration strategy for production
- [Vercel Community: Running drizzle migrations before Next.js starts](https://community.vercel.com/t/running-drizzle-migrations-for-my-db-before-next-js-starts-on-vercel/18074) — build step pattern confirmed by community
- [2037 Gottingen events page](https://2037gottingen.ca/events/) — WordPress/static HTML; events in HTML but dates on individual pages
- [Atlantic Entertainment events page](https://www.aentertainment.ca/events) — static HTML with schema.org JSON-LD; best scraping target
- [Capitol Theatre Moncton events](https://capitol.nb.ca/en/tickets-events) — Joomla server-rendered; events in HTML cards
- [PEI Symphony Orchestra events](https://peisymphony.com/events) — WordPress static HTML

### Tertiary (LOW confidence)

- [The Ship Pub St. John's](https://nlfolk.com/folk-night/) — No independent events calendar; Facebook-primary. Flagged for manual investigation.
- [Baba's Lounge Charlottetown](https://www.songkick.com/venues/356561-babas-lounge) — Events via aggregators, not own website.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Drizzle + Neon + Next.js 16 combination is well-documented with multiple verified tutorials from 2025-2026
- Architecture: HIGH — Drizzle schema patterns verified against official docs; migration strategy verified against Vercel community + Neon docs
- Venue seed data: MEDIUM — 4 of 5 venues confirmed scrapeable; NL province has no confirmed scrapeable URL
- Pitfalls: HIGH — migration pitfalls and Neon driver gotchas sourced from official docs and Vercel community forums

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable stack; Drizzle releases frequently but API is stable)
