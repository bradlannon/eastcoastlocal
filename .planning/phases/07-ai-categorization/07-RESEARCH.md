# Phase 7: AI Categorization - Research

**Researched:** 2026-03-14
**Domain:** Vercel AI SDK (generateText + Output.object), Zod v4, event extraction pipeline modification
**Confidence:** HIGH

---

## Summary

Phase 7 adds AI-powered event categorization to the existing Gemini extraction pipeline. The work is
tightly scoped: modify the extractor prompt and Zod schema to have Gemini assign a category from the
fixed 8-value taxonomy during extraction, wire that category into the normalizer's upsert call, and
run the already-written backfill script to cover historical events.

The infrastructure is already in place. Phase 6 shipped `EVENT_CATEGORIES` as an exported `const`
array, the `event_category` column on the events table (with a `'community'` default), and
`backfill-categories.ts`. Phase 7's job is to make the extractor populate that column with
AI-assigned values instead of relying on the default.

The second requirement — accepting all event types, not just live music — requires relaxing the
extractor's filtering rules (the prompt currently rejects non-music events) and updating the
`performer` field concept to cover presenters, troupes, teams, and organizers across event types.

**Primary recommendation:** Extend `ExtractedEventSchema` with an `event_category` field using
`z.enum(EVENT_CATEGORIES)` with a `.default('other')` fallback, update the prompt to instruct
Gemini to assign a category from the fixed list, and pass `event_category` through the normalizer
into the upsert. No new npm packages are required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAT-01 | Events are automatically assigned a category by AI during scraping (live_music, comedy, theatre, arts, sports, festival, community, other) | Gemini already produces structured output via `Output.object`; adding `event_category` field to `ExtractedEventSchema` with `z.enum(EVENT_CATEGORIES).default('other')` enforces valid values at parse time |
| CAT-02 | Existing events in the database are backfilled with categories | `backfill-categories.ts` already sets nulls to `'community'`; after Phase 7 deploys the real AI-assigned backfill should re-run the categorizer across all existing events, or simply run the existing script to clear nulls |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.0.116 | `generateText` + `Output.object` for structured Gemini output | Already powering the extractor; proven pattern in codebase |
| `@ai-sdk/google` | 3.0.43 | Gemini model provider | Already configured; `google('gemini-2.5-flash')` in use |
| `zod` | 4.3.6 | Schema validation + `z.enum()` for taxonomy enforcement | Already used in `ExtractedEventSchema`; z.enum rejects out-of-taxonomy values |
| `drizzle-orm` | 0.45.1 | `db.update()` for backfill | Already in use; `isNull()` helper used in backfill script |

### No New Dependencies

This phase requires zero new npm packages. All required tooling is already installed and working.

---

## Architecture Patterns

### Existing Pipeline (understand before modifying)

```
orchestrator.ts
  → fetchAndPreprocess(url)           // fetcher.ts — cheerio HTML → plain text
  → extractEvents(pageText, url)      // extractor.ts — Gemini LLM → ExtractedEvent[]
  → upsertEvent(venueId, event, url)  // normalizer.ts — writes to DB
```

### Pattern 1: Extend ExtractedEventSchema

Add `event_category` to the Zod schema in `src/lib/schemas/extracted-event.ts`.

**What:** Import `EVENT_CATEGORIES` from the schema module, add the field with `z.enum()` and a
safe default.

**When to use:** The `Output.object({ schema })` call in `generateText` feeds this schema directly
to Gemini. Gemini must produce a value in the enum or the output will be coerced/rejected.

**Pattern:**
```typescript
// src/lib/schemas/extracted-event.ts
import { z } from 'zod';
import { EVENT_CATEGORIES } from '@/lib/db/schema';

export const ExtractedEventSchema = z.object({
  events: z.array(
    z.object({
      performer: z.string().nullable(),
      event_date: z.string().nullable(),
      event_time: z.string().nullable(),
      price: z.string().nullable(),
      ticket_link: z.string().url().nullable(),
      description: z.string().nullable(),
      cover_image_url: z.string().url().nullable(),
      confidence: z.number().min(0).max(1),
      event_category: z.enum(EVENT_CATEGORIES).default('other'),
    })
  ),
});
```

Note: `z.enum(EVENT_CATEGORIES)` works correctly with Zod v4 as verified — `live_music` parses
successfully, invalid values are rejected with `invalid_value` error. The `.default('other')`
ensures the field always has a value even if Gemini omits it.

### Pattern 2: Update the Extractor Prompt

Two changes to `src/lib/scraper/extractor.ts`:

1. **Broaden from live music to all events.** Remove the live-music-only restriction from the
   prompt. Ask Gemini to extract all upcoming public events.

2. **Instruct Gemini to assign a category.** The prompt must list the 8 allowed values and instruct
   Gemini to pick the best fit. Keep the list inline in the prompt so it is always current.

**The `performer` field concept must generalize.** For non-music events, `performer` should capture
the act, troupe, team, artist, organizer, or event title — whatever identifies the event. The field
name stays `performer` (no DB migration needed) but the prompt description changes.

**Updated prompt approach:**
```typescript
prompt: `Today's date is ${today}.

You are extracting upcoming public events from the following web page content scraped from: ${sourceUrl}

Extract all UPCOMING events (after today: ${today}). For each event return:
- performer: the main act, performer, team, troupe, organizer, or event title (null if unclear)
- event_date: the date in YYYY-MM-DD format (null if unclear — NEVER guess)
- event_time: the time (e.g. "8:00 PM") or null if not mentioned
- price: ticket price or null if not mentioned
- ticket_link: URL to buy tickets or null if not mentioned
- description: brief description of the event or null
- cover_image_url: URL of event image or null
- confidence: your confidence 0.0–1.0 that this is a real upcoming public event
- event_category: one of live_music | comedy | theatre | arts | sports | festival | community | other

Category guidance:
- live_music: concerts, bands, solo artists performing live
- comedy: stand-up, improv, open mic comedy nights
- theatre: plays, musicals, dramatic productions
- arts: art shows, gallery openings, craft fairs, exhibitions
- sports: athletic events, games, races, tournaments
- festival: multi-day or multi-act events celebrating food, culture, music, etc.
- community: farmers markets, fundraisers, town halls, charity events, meetups
- other: anything that does not fit the above

Rules:
- Include ALL event types — not just live music
- If you cannot determine the date with certainty, set event_date to null
- Skip events that have already passed (before ${today})
- Set confidence to 0 if you are unsure the event is real

Page content:
${pageText}`
```

### Pattern 3: Pass event_category Through the Normalizer

`src/lib/scraper/normalizer.ts` `upsertEvent` currently ignores `event_category`. It must be added
to both the `.values({})` block and the `.onConflictDoUpdate({ set: {} })` block.

```typescript
// In values({...}) block:
event_category: extracted.event_category ?? 'other',

// In onConflictDoUpdate set:{...} block:
event_category: extracted.event_category ?? 'other',
```

The `onConflictDoUpdate` update is important: when a re-scrape finds an existing event, the
category may improve (first scrape returns `'other'`, second scrape has more context and returns
`'live_music'`).

### Pattern 4: Backfill for CAT-02

Two backfill strategies to consider:

**Option A — Simple null-clear (already written):**
Run the existing `backfill-categories.ts` script which sets all null `event_category` values to
`'community'`. This satisfies "no null categories remain" but does not use AI.

**Option B — AI re-categorization of all historical events:**
A separate backfill script that fetches all events (batched), calls Gemini to classify the
event name + description, and updates the category. This gives AI-assigned categories for existing
data but is expensive and slow (N Gemini calls).

**Decision:** The STATE.md says "Backfill: Run immediately after Phase 7 deploys — not a deferred
task" and references `backfill-categories.ts`. The existing simple script already satisfies CAT-02's
requirement ("no null categories remain"). Option A is the correct approach. The requirement is
coverage, not AI coverage of historical data.

### Anti-Patterns to Avoid

- **Adding `event_category` to the extractor filter logic:** Do not filter out events based on
  category. The category is metadata, not a quality signal. Confidence and date remain the filters.
- **Hardcoding category strings inline instead of using `EVENT_CATEGORIES`:** Always import the
  const array so future taxonomy changes propagate automatically.
- **Omitting `event_category` from the `onConflictDoUpdate` set:** Re-scrapes would never update a
  wrongly-categorized event.
- **Making `event_category` required (no default) in the Zod schema:** Gemini can silently omit
  optional fields; a `.default('other')` is safer than requiring the field and risking parse failure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taxonomy enforcement | Custom string validation | `z.enum(EVENT_CATEGORIES)` | Zod rejects invalid values at parse time; no additional code needed |
| Gemini structured output | Manual JSON parsing | `Output.object({ schema })` + `experimental_output` | Already proven in extractor; handles parsing + retries |
| Category display metadata | Inline strings per component | `CATEGORY_META` from `src/lib/categories.ts` | Phase 6 already created this; Phase 8 will consume it |
| Backfill DB writes | Custom update loop | Drizzle `db.update().where(isNull(...))` | Already written in `backfill-categories.ts` |

**Key insight:** The extraction pipeline's `Output.object` pattern already handles structured
output, validation, and retries for Gemini. Adding one field to the schema is the only change
required — no new infrastructure needed.

---

## Common Pitfalls

### Pitfall 1: Gemini Occasionally Omits Optional Fields

**What goes wrong:** When a Zod schema field has `.nullable()` or `.default()`, Gemini sometimes
omits it from the JSON output. The AI SDK's `experimental_output` applies the schema, so a missing
field with a `.default()` will be set to the default value. A missing field without a default will
be `undefined`.

**How to avoid:** Always use `.default('other')` (not just `.optional()` or `.nullable()`) for
`event_category`. Verified: Zod v4 `.default()` fills missing values correctly.

**Warning signs:** `event_category` is `undefined` in extracted events — means `.default()` was not
set or the schema was not applied to output parsing.

### Pitfall 2: Extractor Filter Logic Rejects Non-Music Events

**What goes wrong:** The current extractor has no explicit filter for event type in the post-
processing code (it only filters on `performer`, `event_date`, and `confidence`). However, the
current PROMPT says "Only include LIVE music events" — so Gemini itself will skip non-music events.
If only the prompt is updated but an old cached version of the function is used, all event types
will appear to work but only during testing.

**How to avoid:** Update the prompt and immediately test against a known non-music venue URL (e.g.,
a comedy club or theatre).

**Warning signs:** Comedy/theatre events never appear in extraction output despite the prompt change.

### Pitfall 3: normalizer.ts upsertEvent Has No event_category Parameter

**What goes wrong:** If `event_category` is added to `ExtractedEventSchema` but not passed through
`upsertEvent`, the DB column retains its `'community'` default. No error is thrown — data silently
goes wrong.

**How to avoid:** Update the `ExtractedEvent` type (derived from `ExtractedEventSchema`) and then
follow the TypeScript compiler errors to find all call sites that need updating. The type inference
means updating the schema automatically surfac es the gap.

**Warning signs:** All events in DB have `event_category = 'community'` after re-scraping.

### Pitfall 4: Bandsintown and Eventbrite Scrapers Also Call upsertEvent

**What goes wrong:** `bandsintown.ts` and `eventbrite.ts` call `upsertEvent` directly, constructing
`ExtractedEvent` objects manually. If `event_category` becomes required in `ExtractedEvent`, those
files will get TypeScript errors. If it has a default in the type, they silently pass `undefined`.

**How to avoid:** When adding `event_category` to `ExtractedEvent`, check that Bandsintown and
Eventbrite event objects either:
- Hard-code a reasonable category (e.g., Bandsintown → `'live_music'` since it is a music platform)
- Or accept `'other'` as default

The type check will surface this automatically — make sure the build passes.

**Warning signs:** TypeScript compilation errors in `bandsintown.ts` or `eventbrite.ts`.

### Pitfall 5: Backfill Sets ALL Existing Events to 'community'

**What goes wrong:** `backfill-categories.ts` sets all null `event_category` values to
`'community'`. This is intentionally a placeholder, not an AI-assigned category. After Phase 7,
newly scraped events will get real AI categories, but historical events will show `'community'`.

**How to avoid:** This is accepted behavior per the STATE.md decisions. The success criteria only
require "no null categories remain at feature launch" — not that all historical events have accurate
categories. Document this trade-off clearly.

---

## Code Examples

### Verified Pattern: Zod enum with const array (Zod v4)

```typescript
// Confirmed working with installed zod@4.3.6
import { EVENT_CATEGORIES } from '@/lib/db/schema';
import { z } from 'zod';

// Works: z.enum() accepts the const array directly
const schema = z.enum(EVENT_CATEGORIES).default('other');

schema.parse('live_music');   // → 'live_music'
schema.parse('invalid');      // → throws ZodError (invalid_value)
schema.parse(undefined);      // → 'other' (default)
```

### Verified Pattern: generateText + Output.object (ai@6.0.116)

```typescript
// Pattern already in use in extractor.ts — confirmed working
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';

const { experimental_output } = await generateText({
  model: google('gemini-2.5-flash'),
  output: Output.object({ schema: MyZodSchema }),
  prompt: `...`,
});

// experimental_output is validated against MyZodSchema
const events = experimental_output?.events ?? [];
```

### Verified Pattern: Drizzle backfill with isNull

```typescript
// Already implemented in src/lib/db/backfill-categories.ts
import { isNull } from 'drizzle-orm';

const result = await db
  .update(events)
  .set({ event_category: 'community' })
  .where(isNull(events.event_category))
  .returning({ id: events.id });
```

### Files to Modify (with change summary)

| File | Change |
|------|--------|
| `src/lib/schemas/extracted-event.ts` | Add `event_category: z.enum(EVENT_CATEGORIES).default('other')` |
| `src/lib/scraper/extractor.ts` | Update prompt: broaden to all event types, instruct on category assignment |
| `src/lib/scraper/normalizer.ts` | Pass `event_category` in `.values()` and `.onConflictDoUpdate({ set: {} })` |
| `src/lib/scraper/bandsintown.ts` | Add `event_category: 'live_music'` to the manual ExtractedEvent construction |
| `src/lib/scraper/eventbrite.ts` | Add `event_category` to the manual ExtractedEvent construction (inspect to confirm) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Live music only extraction | All event types, AI-classified | Phase 7 (this phase) | Broader event coverage for Atlantic Canada venues |
| No event_category field | `event_category` in schema with Gemini assignment | Phase 6 (schema), Phase 7 (population) | Category filter in Phase 8 becomes possible |
| Historical events uncategorized | Backfilled to 'community' as baseline | After Phase 7 deploys | No null categories at launch |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | `jest.config.ts` (preset: ts-jest, env: node) |
| Quick run command | `npx jest src/lib/scraper/extractor.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-01 | ExtractedEvent has event_category drawn from taxonomy | unit | `npx jest src/lib/schemas/extracted-event.test.ts --no-coverage` | Wave 0 |
| CAT-01 | extractEvents returns events with event_category set | unit | `npx jest src/lib/scraper/extractor.test.ts --no-coverage` | Exists (extend) |
| CAT-01 | upsertEvent writes event_category to DB | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | Exists (extend) |
| CAT-01 | z.enum() rejects invalid category values | unit | `npx jest src/lib/schemas/extracted-event.test.ts --no-coverage` | Wave 0 |
| CAT-02 | backfill script clears null categories | manual-only | `tsx src/lib/db/backfill-categories.ts` | Exists (no test needed) |

### Sampling Rate

- **Per task commit:** `npx jest --no-coverage` (full suite — it is fast, all unit tests)
- **Per wave merge:** `npx jest --no-coverage && npm run build`
- **Phase gate:** Full suite green + `npm run build` passes before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/schemas/extracted-event.test.ts` — tests for `event_category` field in schema (enum validation, default behavior); covers CAT-01
- [ ] Extend `src/lib/scraper/extractor.test.ts` — add test cases asserting `event_category` is present and valid in returned events
- [ ] Extend `src/lib/scraper/normalizer.test.ts` — add test asserting `event_category` is passed to DB insert

---

## Open Questions

1. **Eventbrite scraper: what category do Eventbrite events get?**
   - What we know: `eventbrite.ts` calls `upsertEvent` with a manually-constructed object; it is not AI-extracted
   - What's unclear: Whether Eventbrite events are live music only (would default to `'live_music'`) or mixed types
   - Recommendation: Read `eventbrite.ts` during planning; default to `'other'` unless the source is clearly music-only

2. **Backfill strategy: simple null-clear vs. AI re-classification of historical events**
   - What we know: `backfill-categories.ts` already written to set nulls → `'community'`; STATE.md says run it immediately post-deploy
   - What's unclear: Whether the team wants historical events AI-classified or just null-free
   - Recommendation: Use the existing simple backfill. Requirement is "no null categories" — not "AI categories for historical data"

3. **Gemini category accuracy without context**
   - What we know: Gemini gets `performer`, `description`, and source URL to classify
   - What's unclear: Quality of category assignment when event descriptions are sparse (e.g., "Open Mic Night")
   - Recommendation: Accept `'other'` as a valid fallback; do not add complexity to verify category quality

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `src/lib/scraper/extractor.ts` — current prompt and Output.object pattern
- Direct code inspection: `src/lib/schemas/extracted-event.ts` — current Zod schema structure
- Direct code inspection: `src/lib/scraper/normalizer.ts` — upsertEvent signature and DB write pattern
- Direct code inspection: `src/lib/db/schema.ts` — EVENT_CATEGORIES const array, event_category column
- Direct code inspection: `src/lib/db/backfill-categories.ts` — backfill implementation
- Runtime verification: `node -e` tests confirmed `z.enum(EVENT_CATEGORIES)` accepts valid, rejects invalid, applies default
- Runtime verification: `ai@6.0.116` exports `Output.object`, `generateText` — API confirmed present
- `.planning/phases/06-category-schema/06-01-SUMMARY.md` — Phase 6 decisions and what was shipped

### Secondary (MEDIUM confidence)

- STATE.md accumulated context — decisions from 06-01: "Export EVENT_CATEGORIES const array alongside pgEnum so Phase 7 can use z.enum(EVENT_CATEGORIES)"
- STATE.md — "Backfill: Run immediately after Phase 7 deploys — not a deferred task"

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries installed and APIs verified at runtime
- Architecture: HIGH — pipeline is fully inspected; changes are additive and minimal
- Pitfalls: HIGH — derived from direct code reading of all affected files
- Backfill strategy: HIGH — strategy is locked in STATE.md decisions

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable libraries; AI SDK versions unlikely to change)
