---
phase: 01-foundation
plan: 01
subsystem: database
tags: [nextjs, drizzle, neon, postgresql, typescript, tailwind, jest, ts-jest]

requires: []

provides:
  - Next.js 16.1.6 App Router project scaffolded with TypeScript and Tailwind v4
  - Drizzle ORM schema defining venues, events, scrape_sources tables with all columns
  - Composite dedup unique index on events (venue_id, event_date, normalized_performer)
  - Drizzle client singleton using Neon HTTP driver with lazy initialization
  - Migration SQL files in drizzle/ directory (0000_bouncy_vector.sql)
  - Health check endpoint at /api/health
  - TypeScript types inferred from Drizzle schema (Event, Venue, ScrapeSource, etc.)
  - Seed script with 5 real Atlantic Canada venues across all 4 provinces
  - Jest test infrastructure with schema and seed data structural tests

affects:
  - 02-scraping (imports schema.ts, uses db client, inserts events via upsert pattern)
  - 03-map-ui (queries events/venues tables, consumes TypeScript types)

tech-stack:
  added:
    - next@16.1.6
    - react@19.2.3
    - drizzle-orm@0.45.1
    - "@neondatabase/serverless@1.0.2"
    - drizzle-kit@0.31.9
    - tsx@4.21.0
    - jest@30.3.0
    - ts-jest@29.4.6
    - zod@4.3.6
    - date-fns@4.1.0
    - dotenv@17.3.1
    - tailwindcss@4.x
  patterns:
    - Drizzle schema-first with generate+migrate (not push) for production migrations
    - Neon HTTP driver for all DB access (no TCP, works in Vercel serverless)
    - Lazy Proxy-based DB client initialization to avoid module-load-time DATABASE_URL requirement
    - Seed data in separate seed-data.ts module to decouple from DB client (enables unit testing)
    - boolean() Drizzle column type for enabled field (correct Postgres boolean, not text)
    - Composite index column order: venue_id, event_date, normalized_performer (selectivity left-to-right)

key-files:
  created:
    - src/lib/db/schema.ts
    - src/lib/db/client.ts
    - src/lib/db/seed.ts
    - src/lib/db/seed-data.ts
    - src/lib/db/schema.test.ts
    - src/lib/db/seed.test.ts
    - src/types/index.ts
    - src/app/api/health/route.ts
    - drizzle.config.ts
    - jest.config.ts
    - drizzle/0000_bouncy_vector.sql
    - .env.example
  modified:
    - package.json (added db:generate, db:migrate, db:studio, db:seed, test scripts; build includes db:migrate)
    - src/app/page.tsx (replaced default with minimal "East Coast Local — Coming Soon" placeholder)
    - .gitignore (replaced .env* wildcard with specific files, added !.env.example exception)

key-decisions:
  - "Use integer() not serial() for FK columns in events and scrape_sources (serial auto-generates, integer references)"
  - "Use boolean() not text() for enabled column in scrape_sources (correct Postgres type per research recommendation)"
  - "Lazy Proxy-based DB client to avoid DATABASE_URL requirement at module load time during Next.js static analysis"
  - "Seed data in separate seed-data.ts file to allow unit testing without a DB connection"
  - "The Ship Pub (NL) seeded as venue with scrape source enabled=false — no scrapeable URL confirmed; satisfies 4-province requirement"
  - "Composite dedup index column order: venue_id first, then event_date, then normalized_performer (selectivity order per research)"

patterns-established:
  - "Pattern 1: Import seed data from seed-data.ts; tests import from seed-data.ts directly (never from seed.ts which has DB side effects)"
  - "Pattern 2: DB client accessed via Proxy — any file can import { db } without needing DATABASE_URL at module load"
  - "Pattern 3: drizzle-kit generate creates SQL migration files committed to repo; drizzle-kit migrate applied in Vercel build step"

requirements-completed:
  - INFR-01
  - SCRP-05
  - SCRP-06

duration: 10min
completed: 2026-03-14
---

# Phase 1 Plan 01: Foundation Summary

**Next.js 16.1.6 scaffold with Drizzle ORM schema (venues/events/scrape_sources), Neon HTTP client, /api/health endpoint, 5 real Atlantic Canada venues seeded, and Jest tests — project builds and tsc passes**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-14T01:25:59Z
- **Completed:** 2026-03-14T01:35:41Z
- **Tasks:** 2
- **Files modified:** 14 created, 3 modified

## Accomplishments

- Scaffolded Next.js 16.1.6 with TypeScript, Tailwind v4, App Router, src/ directory layout
- Defined complete Drizzle schema: venues (11 cols), events (15 cols, 2 indexes, FK), scrape_sources (9 cols, FK, boolean enabled)
- Seeded 5 real Atlantic Canada venues across NB, NS (x2), PEI, NL with matching scrape_sources
- 9 Jest tests pass: 3 schema structural tests + 6 seed data tests — all without a DB connection

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold project, install dependencies, define schema and database client** - `7bdb98c` (feat)
2. **Task 2: Create seed script with real venues and test infrastructure** - `6f4dd88` (feat)

## Files Created/Modified

- `src/lib/db/schema.ts` - All three table definitions with composite dedup index and FK relationships
- `src/lib/db/client.ts` - Drizzle client singleton with Proxy-based lazy initialization
- `src/lib/db/seed-data.ts` - Pure data module: 5 venues and 5 scrape sources, no DB imports
- `src/lib/db/seed.ts` - Executable seed script (tsx); imports from seed-data.ts, re-exports for test access
- `src/lib/db/schema.test.ts` - Structural tests verifying all three table column definitions
- `src/lib/db/seed.test.ts` - Seed data tests: province coverage, required fields, Ship Pub disabled
- `src/types/index.ts` - TypeScript types inferred from schema via InferSelectModel/InferInsertModel
- `src/app/api/health/route.ts` - GET /api/health with db.execute(SELECT 1) connectivity check
- `drizzle.config.ts` - Drizzle Kit config: out ./drizzle, schema ./src/lib/db/schema.ts, dialect postgresql
- `jest.config.ts` - ts-jest preset, node environment, @/ alias mapping
- `drizzle/0000_bouncy_vector.sql` - Generated migration: CREATE TABLE for all 3 tables with indexes
- `package.json` - Added db:generate, db:migrate, db:studio, db:seed, test scripts; build runs db:migrate

## Decisions Made

- Used `integer()` not `serial()` for FK columns — serial auto-generates values, integer references existing
- Used `boolean()` not `text()` for enabled column — correct Postgres type per research
- Lazy Proxy-based DB client — avoids throwing during Next.js build static page analysis
- Seed data split into separate `seed-data.ts` — allows test imports without triggering DB connection
- Ship Pub (NL) seeded with `enabled: false` — Facebook-primary, no scrapeable URL confirmed
- Composite index order: `(venue_id, event_date, normalized_performer)` — selectivity left-to-right

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Next.js build failure caused by module-level DB connection attempt**
- **Found during:** Task 2 (post-task build verification)
- **Issue:** `neon(process.env.DATABASE_URL!)` at module level throws when DATABASE_URL is absent. Next.js static page analysis imports all route modules — including health route — which triggered the error during `next build` even without DATABASE_URL.
- **Fix:** Replaced direct DB export with a Proxy that lazily calls `createDb()` on first property access. The error is deferred to actual query time, not module import time.
- **Files modified:** `src/lib/db/client.ts`
- **Verification:** `npx next build` completes cleanly; `/api/health` listed as dynamic route; `tsc --noEmit` passes; all 9 Jest tests pass
- **Committed in:** `6f4dd88` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed seed.test.ts failing due to transitive DB connection import**
- **Found during:** Task 2 (first Jest run)
- **Issue:** `seed.test.ts` imported from `seed.ts`, which imported from `client.ts`, which triggered `neon()` at module load — failing without DATABASE_URL.
- **Fix:** Extracted all seed data constants to `seed-data.ts` (no DB imports). Tests import from `seed-data.ts` directly. `seed.ts` re-exports from `seed-data.ts` for backward compatibility.
- **Files modified:** `src/lib/db/seed-data.ts` (created), `src/lib/db/seed.ts` (refactored), `src/lib/db/seed.test.ts` (updated import)
- **Verification:** All 9 Jest tests pass without DATABASE_URL
- **Committed in:** `6f4dd88` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs)
**Impact on plan:** Both fixes necessary for tests and build to work without a live DB. No scope creep. The seed data module split is an improvement over the original design — cleaner separation of concerns.

## Issues Encountered

- `create-next-app` refused to scaffold into the directory because `.planning/` existed. Scaffolded into `/tmp/ecl-scaffold` then `rsync`'d files over.
- `.gitignore` had `.env*` wildcard which blocked adding `.env.example`. Fixed to use specific filenames with `!.env.example` exception.
- dev dependency esbuild vulnerability (moderate) in drizzle-kit via `@esbuild-kit/esm-loader`. Dev-only tool, not a runtime concern; `npm audit fix --force` would downgrade drizzle-kit to a breaking version. Left in place, documented here.

## User Setup Required

None — no external service configuration required for this plan.

The seed script (`npm run db:seed`) and migrations (`npm run db:migrate`) require a `DATABASE_URL` to run. These are post-deploy steps documented in `.env.example`.

## Next Phase Readiness

- Schema, client, types, and migration files ready for Phase 2 scraping pipeline to import
- Seed script ready to run against production Neon database after first deploy
- Health endpoint ready for INFR-01 smoke test post-deploy
- Phase 2 can begin immediately: schema provides all required tables; composite index ready for upsert dedup pattern

---
*Phase: 01-foundation*
*Completed: 2026-03-14*
