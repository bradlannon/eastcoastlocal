# Phase 22: Schema Foundation - Research

**Researched:** 2026-03-15
**Domain:** Drizzle ORM schema migration (PostgreSQL / Neon), TypeScript schema definitions
**Confidence:** HIGH

## Summary

Phase 22 is a pure schema migration phase: add new columns to two existing tables (`discovered_sources` and `venues`) and update the code that writes to those tables. There are no new dependencies required — this project already uses Drizzle ORM with `drizzle-kit generate` + `drizzle-kit migrate` and has 7 existing migrations (0000–0006) as precedent. The changes are all additive nullable columns, which makes data-loss risk negligible.

The primary complexity is not in the migration itself but in the coupling: `promoteSource()`, `schema.test.ts`, `promote-source.test.ts`, and the admin discovery UI (`DiscoveryList.tsx`, `page.tsx`) all reference the current column set and will need coordinated updates. Test 7 in `promote-source.test.ts` explicitly asserts `address === 'Halifax, NS, Canada'` — this test must be updated to the new conditional logic.

The `url` / `domain` constraint question has been decided: Places venues with a website use the real URL (existing dedup works naturally); no-website venues get a synthetic URL (following the `ticketmaster:province:XX` pattern already in production). The `domain` column can be derived from the synthetic or real URL, so no schema change needed for it — but the logic in `promoteSource()` must handle the no-website synthetic URL case without crashing the domain derivation.

**Primary recommendation:** Edit `schema.ts` to add the 6 new columns (4 on `discovered_sources`, 1 on `venues`, with `place_types` as a dedicated text column), run `npm run db:generate` to produce migration 0007, then update `promoteSource()` and associated tests in a single coordinated wave.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- If a Places venue HAS a website, store that website URL in discovered_sources.url — existing url-based dedup catches cross-method duplicates naturally
- google_place_id gets a unique index (nullable) — one row per place_id, no duplicate staging
- Store full formatted address from Places API in a new discovered_sources.address column (e.g., "1234 Barrington St, Halifax, NS B3J 1Y9")
- Places-sourced discoveries get a separate scoring function — bypass domain-based scoring entirely
- If discovered_sources has lat/lng, carry them straight to venue on promotion — skip geocoding API call
- If lat/lng are null (Reddit, Gemini sources), geocode as today — conditional geocoding path
- Carry full Places address into venues.address on promotion (not the current "city, province, Canada" placeholder)
- Copy google_place_id to venues table during promotion
- Run scoreVenueCandidate() BEFORE promotion for Places venues — dedup at staging time since coords are available
- When dedup matches an existing venue, auto-enrich: backfill google_place_id and richer address onto the existing venue
- New discovered_sources status value: 'no_website' — separate from pending/approved/rejected
- High-confidence Places types (bar, night_club, etc.) with coordinates auto-promote as venue stubs — no admin review
- Venue stubs = venue row with coords but NO scrape_source row
- Stubs only appear on public map once they have at least one event (e.g., Ticketmaster attaches)
- Admin venue list shows visual badge/icon distinguishing stubs from active scrape venues
- If a stub later gains a website (admin adds, or future discovery), auto-create scrape_source — stub upgrades to active
- Store place_types on discovered_sources (dedicated column, not just raw_context)
- Carry place_types through to venues table — repurpose or enhance existing venue_type column

### Claude's Discretion
- Whether to make url nullable vs synthetic URL pattern (consider Ticketmaster precedent)
- Whether to make domain nullable or use placeholder
- Phone column on discovered_sources (Places returns it — low cost to add)
- google_place_id copy to venues during promotion (recommended yes)
- Exact place_types column format (JSON array vs comma-separated)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Database migration adds google_place_id, address, lat, lng to discovered_sources | Drizzle additive nullable columns — `doublePrecision` (already used for venues.lat/lng), `text` for address and google_place_id; unique nullable index on google_place_id using Drizzle `uniqueIndex().on()` with `.where(sql`...is not null`)` or a partial unique constraint |
| SCHEMA-02 | Database migration adds google_place_id to venues table | Same pattern — nullable `text` column with a nullable unique index |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 | Schema definition, query builder | Already in use — all 7 existing migrations use it |
| drizzle-kit | ^0.31.9 | Migration generation and execution | `db:generate` + `db:migrate` npm scripts already wired |
| @neondatabase/serverless | (existing) | Neon Postgres driver | Already in use, no change needed |

### Supporting
None required. This phase adds columns to existing tables only.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `text` for place_types | `jsonb` array | jsonb is more type-safe for arrays but adds query complexity; text as JSON string keeps schema simple and is sufficient for Phase 22 scope |
| Nullable unique index | Postgres partial unique constraint | Partial unique constraint (`WHERE google_place_id IS NOT NULL`) is the canonical Postgres solution; Drizzle supports this via `.where(sql\`...\`)` on the index |

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended Project Structure
No new files or directories needed. All changes are within:
```
src/lib/db/schema.ts          — add new columns to two tables
src/lib/scraper/promote-source.ts  — update promoteSource() logic
src/lib/scraper/promote-source.test.ts  — update Test 7, add new tests
src/lib/db/schema.test.ts     — add new columns to expected column lists
drizzle/                      — new 0007_*.sql file generated by drizzle-kit
```

### Pattern 1: Additive Nullable Column (Drizzle)
**What:** Add a nullable column to an existing table with no default — safe for existing rows.
**When to use:** Any schema extension that must not break existing rows.
**Example:**
```typescript
// Source: existing schema.ts pattern (venues.lat / venues.lng are the precedent)
export const discovered_sources = pgTable('discovered_sources', {
  // ... existing columns ...
  lat:             doublePrecision('lat'),                  // nullable, no default
  lng:             doublePrecision('lng'),                  // nullable, no default
  address:         text('address'),                         // nullable
  google_place_id: text('google_place_id'),                 // nullable
  place_types:     text('place_types'),                     // nullable — JSON array string e.g. '["bar","night_club"]'
  phone:           text('phone'),                           // nullable (Claude's discretion — recommend yes, low cost)
});
```

### Pattern 2: Nullable Unique Index (Drizzle)
**What:** Unique constraint that allows multiple NULLs (standard SQL behavior) — one row per non-null value.
**When to use:** `google_place_id` must be unique when present but many rows will have NULL.
**Example:**
```typescript
// Source: existing schema.ts — events_dedup_key uses uniqueIndex().on()
// Postgres NULL semantics: NULLs are never equal, so multiple NULL rows satisfy UNIQUE.
// No partial WHERE needed — standard nullable unique index works correctly in Postgres.
import { uniqueIndex } from 'drizzle-orm/pg-core';

export const discovered_sources = pgTable(
  'discovered_sources',
  {
    // ... columns ...
    google_place_id: text('google_place_id'),
  },
  (table) => [
    uniqueIndex('discovered_sources_google_place_id_key').on(table.google_place_id),
  ]
);

export const venues = pgTable(
  'venues',
  {
    // ... existing columns ...
    google_place_id: text('google_place_id'),
  },
  (table) => [
    uniqueIndex('venues_google_place_id_key').on(table.google_place_id),
  ]
);
```

### Pattern 3: Conditional promoteSource() Logic
**What:** Branch on whether lat/lng are present to decide whether to geocode.
**When to use:** Promotion of Places-sourced vs. Reddit/Gemini-sourced discovered_sources.
**Example:**
```typescript
// Carry coordinates if present (Places sources); geocode later if absent (legacy sources)
const venueValues = {
  name: venueName,
  address: staged.address ?? `${city}, ${province}, Canada`.trim(),
  city,
  province,
  lat: staged.lat ?? undefined,   // undefined → Drizzle omits → DB default (null)
  lng: staged.lng ?? undefined,
  google_place_id: staged.google_place_id ?? undefined,
};
```

### Pattern 4: Synthetic URL for No-Website Venues
**What:** Use a synthetic URL as a stable identifier when no real website exists.
**When to use:** Places venues without a websiteUri field.
**Example:**
```
// Established precedent: scrape_sources already uses ticketmaster:province:XX
// Places no-website pattern: places:GOOGLE_PLACE_ID
// e.g., "places:ChIJN1t_tDeuEmsRUsoyG83frY4"
// Domain derivation: extract scheme = "places", or store domain as "places.google.com"
```

### Anti-Patterns to Avoid
- **Adding NOT NULL columns without defaults:** Will fail in Postgres if existing rows exist. Always add nullable or with a default.
- **Hand-editing SQL migration files:** Drizzle generates migration files — edit schema.ts, then run `db:generate`. Do not edit generated `.sql` files after the fact.
- **Using `db:push` instead of `db:generate` + `db:migrate`:** This project uses the migration file workflow, not push-based. `db:push` would bypass the migration journal.
- **Forgetting to update `schema.test.ts`:** The schema test explicitly enumerates expected columns for each table. It will fail after the schema change if not updated.
- **Forgetting Test 7 in `promote-source.test.ts`:** This test asserts `address === 'Halifax, NS, Canada'`. After updating `promoteSource()` to use `staged.address` when present, the test must cover both branches (address present → use it; address absent → construct placeholder).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | Raw SQL ALTER TABLE script | `drizzle-kit generate` | Keeps migration journal consistent; handles index creation, type mapping, breakpoints |
| Unique-nullable constraint | Custom application-level dedup check | Postgres nullable unique index | Database enforces at write time; race-condition safe |
| Column type for coordinates | Custom decimal type | `doublePrecision` (already used for venues.lat/lng) | Consistent with existing schema; sufficient precision for GPS coords |

**Key insight:** The project already has the exact patterns needed — `venues.lat`/`venues.lng` as nullable `doublePrecision` are the template for `discovered_sources.lat`/`discovered_sources.lng`. Copy the pattern, don't invent a new one.

## Common Pitfalls

### Pitfall 1: Nullable Unique Index on Drizzle — Table Signature Change
**What goes wrong:** Adding an index to a table that previously had no index block (like `discovered_sources`) requires wrapping the table in the two-argument form `pgTable('name', columns, (table) => [...])`. If only the column is added without the index block, the constraint is missing.
**Why it happens:** `discovered_sources` currently has no index block in schema.ts — only columns. Adding an index requires changing the function call signature.
**How to avoid:** Add both the column AND the index block in the same schema.ts edit. Check the generated SQL to confirm the `CREATE UNIQUE INDEX` statement appears.
**Warning signs:** Migration runs without error but `\d discovered_sources` in psql shows no unique index on `google_place_id`.

### Pitfall 2: venues Table Already Has Index Block — Requires Append
**What goes wrong:** `venues` currently has no index block either. Same issue as above.
**Why it happens:** Neither `venues` nor `discovered_sources` have the third-argument table callback today.
**How to avoid:** Use the array form for indexes: `(table) => [ uniqueIndex(...).on(table.google_place_id) ]`.

### Pitfall 3: promoteSource() Status Guard Blocks no_website Rows
**What goes wrong:** Current `promoteSource()` throws if `staged.status !== 'pending'`. If the caller passes a `no_website` stub for promotion (to create a venue stub row), it will throw.
**Why it happens:** The status guard is hardcoded to `'pending'`.
**How to avoid:** Phase 22 scope is schema + `promoteSource()` update. The status guard should be updated to allow `'no_website'` as a valid promotion status, OR a separate `promoteStub()` path is used. Decide in PLAN.md.
**Warning signs:** `promoteSource called for no_website source` throwing `not pending` error in Phase 23 testing.

### Pitfall 4: schema.test.ts Will Fail After Schema Change
**What goes wrong:** `schema.test.ts` has hardcoded expected column arrays for `venues` and `discovered_sources`. Adding new columns to the schema without updating this test causes test failures.
**Why it happens:** The test uses `expect(columns).toContain(col)` for a fixed list — new columns do NOT break the test, but if the intent is to enumerate ALL columns, the list becomes stale. Current tests only check that listed columns exist (`toContain`), so new columns don't break them. But the test should be updated to document the new expected columns for future maintenance.
**How to avoid:** Add the new columns to the expected arrays in `schema.test.ts`.

### Pitfall 5: promote-source.test.ts Test 7 Hardcoded Address
**What goes wrong:** Test 7 asserts `venueValues.address === 'Halifax, NS, Canada'`. After updating `promoteSource()` to prefer `staged.address` when present, this test's mock source (which has no `address` field) will still pass — but only if the fallback logic is implemented correctly. If `staged.address` is `undefined` (not mocked), the conditional branch must fall through to the placeholder.
**Why it happens:** The mock source factory (`makeMockSource`) does not include `address`, `lat`, `lng`, or `google_place_id` fields. When `promoteSource()` reads `staged.address`, it gets `undefined`, and the fallback must produce the old placeholder.
**How to avoid:** Update `makeMockSource` to include the new fields (all null/undefined by default), add a new test case where `staged.address` is set and assert it flows to `venueValues.address`.

## Code Examples

Verified patterns from official sources:

### Adding Nullable Columns to Discovered Sources
```typescript
// Source: src/lib/db/schema.ts (existing venues.lat/lng as template)
export const discovered_sources = pgTable(
  'discovered_sources',
  {
    id:              serial('id').primaryKey(),
    url:             text('url').notNull().unique(),
    domain:          text('domain').notNull(),
    source_name:     text('source_name'),
    province:        text('province'),
    city:            text('city'),
    status:          text('status').notNull().default('pending'),
    discovery_method: text('discovery_method'),
    raw_context:     text('raw_context'),
    discovery_score: doublePrecision('discovery_score'),
    discovered_at:   timestamp('discovered_at').defaultNow().notNull(),
    reviewed_at:     timestamp('reviewed_at'),
    added_to_sources_at: timestamp('added_to_sources_at'),
    // NEW Phase 22 columns:
    lat:             doublePrecision('lat'),
    lng:             doublePrecision('lng'),
    address:         text('address'),
    google_place_id: text('google_place_id'),
    place_types:     text('place_types'),   // JSON array string: '["bar","night_club"]'
    phone:           text('phone'),          // optional (Claude's discretion)
  },
  (table) => [
    uniqueIndex('discovered_sources_google_place_id_key').on(table.google_place_id),
  ]
);
```

### Adding google_place_id to Venues
```typescript
// Source: src/lib/db/schema.ts (existing venues table)
export const venues = pgTable(
  'venues',
  {
    id:           serial('id').primaryKey(),
    name:         text('name').notNull(),
    address:      text('address').notNull(),
    city:         text('city').notNull(),
    province:     text('province').notNull(),
    lat:          doublePrecision('lat'),
    lng:          doublePrecision('lng'),
    website:      text('website'),
    phone:        text('phone'),
    venue_type:   text('venue_type'),
    created_at:   timestamp('created_at').defaultNow().notNull(),
    // NEW Phase 22 column:
    google_place_id: text('google_place_id'),
  },
  (table) => [
    uniqueIndex('venues_google_place_id_key').on(table.google_place_id),
  ]
);
```

### Migration Generation Command
```bash
# After editing schema.ts:
npm run db:generate
# Inspect the generated drizzle/0007_*.sql to confirm:
#   ALTER TABLE "discovered_sources" ADD COLUMN "lat" double precision;
#   ALTER TABLE "discovered_sources" ADD COLUMN "lng" double precision;
#   ALTER TABLE "discovered_sources" ADD COLUMN "address" text;
#   ALTER TABLE "discovered_sources" ADD COLUMN "google_place_id" text;
#   ALTER TABLE "discovered_sources" ADD COLUMN "place_types" text;
#   ALTER TABLE "venues" ADD COLUMN "google_place_id" text;
#   CREATE UNIQUE INDEX "discovered_sources_google_place_id_key" ON "discovered_sources" ("google_place_id");
#   CREATE UNIQUE INDEX "venues_google_place_id_key" ON "venues" ("google_place_id");

# Then apply:
npm run db:migrate
```

### Updated promoteSource() Signature (key change)
```typescript
// Source: src/lib/scraper/promote-source.ts (current)
// BEFORE: address hardcoded
const address = `${city}, ${province}, Canada`.trim();

// AFTER: prefer Places address when present
const address = staged.address ?? `${city}, ${province}, Canada`.trim();

// BEFORE: lat/lng omitted
const [venue] = await db.insert(venues).values({ name: venueName, address, city, province })

// AFTER: carry coords and google_place_id when present
const [venue] = await db.insert(venues).values({
  name: venueName,
  address,
  city,
  province,
  ...(staged.lat != null ? { lat: staged.lat } : {}),
  ...(staged.lng != null ? { lng: staged.lng } : {}),
  ...(staged.google_place_id != null ? { google_place_id: staged.google_place_id } : {}),
  ...(staged.place_types != null ? { venue_type: staged.place_types } : {}),
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `drizzle-kit push` (schema push) | `drizzle-kit generate` + `drizzle-kit migrate` (migration files) | Already established | Migration journal in `drizzle/meta/_journal.json` tracks all migrations; cannot mix approaches |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Should `domain` be made nullable for no-website venues?**
   - What we know: `domain` is `text('domain').notNull()` currently. Synthetic URL pattern `places:GOOGLE_PLACE_ID` makes extracting a domain awkward — would be `"places"` which is a misleading value.
   - What's unclear: Whether Phase 22 must handle the no-website case at all (Phase 23 is where Places discovery runs) — or just lay the schema groundwork.
   - Recommendation: Phase 22 only adds columns; no-website insertion logic lives in Phase 23. So `domain` can stay `notNull()` for now. Phase 23 will decide whether to use `"places.google.com"` as a synthetic domain or make it nullable. Document this in PLAN.md as a Phase 23 concern.

2. **`venue_type` vs. dedicated `place_types` column on `venues`?**
   - What we know: `venues.venue_type` is a nullable `text` column, described as "currently unused/minimal". CONTEXT.md says "Carry place_types through to venues table — repurpose or enhance existing venue_type column."
   - Recommendation: Reuse `venue_type` as the `place_types` storage (JSON array string). No migration needed for venues.venue_type — it already exists. The migration only needs to add `google_place_id`. Document the semantic reuse in a comment.

3. **`phone` column on `discovered_sources` — include in Phase 22?**
   - What we know: CONTEXT.md marks this as Claude's discretion. Places API returns phone numbers. Adding a nullable `phone` text column is a single line with zero risk.
   - Recommendation: Include it. The cost is one line in schema.ts and one line in the migration SQL. Omitting it means a separate migration later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest preset) |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npm test -- --testPathPattern="schema\|promote-source" --no-coverage` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | discovered_sources has lat, lng, address, google_place_id columns | unit | `npm test -- --testPathPattern="src/lib/db/schema.test" --no-coverage` | ✅ (needs update) |
| SCHEMA-01 | google_place_id unique index on discovered_sources | smoke | `npm run db:migrate` (verify no errors) | ✅ migration generated by drizzle-kit |
| SCHEMA-02 | venues has google_place_id column | unit | `npm test -- --testPathPattern="src/lib/db/schema.test" --no-coverage` | ✅ (needs update) |
| SCHEMA-01/02 | promoteSource carries lat/lng/address/google_place_id to venue | unit | `npm test -- --testPathPattern="promote-source.test" --no-coverage` | ✅ (needs update + new tests) |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern="schema\|promote-source" --no-coverage`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Tests need updates, not new files:
- `src/lib/db/schema.test.ts` — add new columns to expected arrays for `venues` and `discovered_sources`
- `src/lib/scraper/promote-source.test.ts` — update Test 7 for conditional address; add tests for lat/lng/google_place_id carry-through

## Sources

### Primary (HIGH confidence)
- Local codebase: `src/lib/db/schema.ts` — current table definitions, column types, index patterns
- Local codebase: `src/lib/scraper/promote-source.ts` — current promotion logic
- Local codebase: `drizzle/meta/_journal.json` + migration files 0000–0006 — established migration workflow
- Local codebase: `jest.config.ts`, test files — test framework and coverage

### Secondary (MEDIUM confidence)
- Drizzle ORM docs (drizzle-orm ^0.45.1 / drizzle-kit ^0.31.9) — nullable unique index pattern, `pgTable` third-argument form for indexes

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fully established, no new dependencies
- Architecture: HIGH — all patterns derived from existing codebase precedents
- Pitfalls: HIGH — all identified from reading actual code (schema.test.ts column arrays, Test 7 hardcoded address)

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain — Drizzle API and schema patterns don't change rapidly)
