# Phase 9: Source Discovery - Research

**Researched:** 2026-03-14
**Domain:** Gemini Google Search grounding + Vercel cron + Drizzle ORM staging pipeline
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | System automatically searches for new event venues/sources across Atlantic Canada cities | Gemini + google.tools.googleSearch({}) grounding; weekly cron at `/api/cron/discover` in vercel.json |
| DISC-02 | Discovered sources land in a staging table for review before being scraped | `discovered_sources` table already exists in schema with `status: 'pending'` default; domain-based unique constraint |
| DISC-03 | Approved sources can be promoted from staging to active scraping | Promotion script (`tsx src/lib/scraper/promote-source.ts <id>`) inserts into `scrape_sources`; no venue row required at staging time |
</phase_requirements>

---

## Summary

Phase 9 builds a discovery pipeline that runs on a weekly Vercel cron, calls Gemini with Google Search grounding to find candidate event venue URLs in Atlantic Canada, deduplicates against existing `scrape_sources` domains, and inserts candidates into the already-existing `discovered_sources` table with `status = 'pending'`. Nothing is auto-promoted; a separate script handles promotion.

The project already has all required infrastructure: `discovered_sources` table (Phase 6), Gemini SDK (`@ai-sdk/google` 3.0.43 / AI SDK 6.0.116), Drizzle ORM, and the Vercel cron pattern established by `/api/cron/scrape`. No new npm packages are needed.

The key risk flagged in STATE.md is unverified grounding output quality for Atlantic Canada — the research confirms the grounding mechanism is correct, but prompt engineering for small-geography venue discovery will require tuning.

**Primary recommendation:** Mirror the scrape cron pattern exactly — a new Next.js API route at `/api/cron/discover`, a dedicated `runDiscoveryJob()` function, `CRON_SECRET` auth, and a `vercel.json` entry with a weekly schedule (e.g., `0 8 * * 1`). Use `google.tools.googleSearch({})` (not the deprecated `useSearchGrounding`) via `generateText` to ground Gemini's venue search response.

---

## Standard Stack

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `@ai-sdk/google` | 3.0.43 | Gemini model + `google.tools.googleSearch` | Already installed; provides grounding tool |
| `ai` (Vercel AI SDK) | 6.0.116 | `generateText`, `Output.object` | Already installed; same pattern as extractor |
| `drizzle-orm` | 0.45.1 | Insert to `discovered_sources`, query `scrape_sources` | Already installed; project ORM |
| `zod` | 4.3.6 | Schema for Gemini structured output of discovered candidates | Already installed |

### No New Packages Required

The entire pipeline — AI call, grounding, DB writes, cron handler — uses packages already in `package.json`. Installation step: none.

---

## Architecture Patterns

### Recommended File Structure (new files only)

```
src/
├── app/api/cron/
│   └── discover/
│       ├── route.ts          # GET handler; auth + calls runDiscoveryJob()
│       └── route.test.ts     # Jest tests mirroring scrape/route.test.ts
├── lib/scraper/
│   ├── discovery-orchestrator.ts   # runDiscoveryJob() — main discovery logic
│   └── promote-source.ts           # CLI script: promotes staged source to scrape_sources
```

### Pattern 1: Gemini Google Search Grounding

**What:** Use `generateText` with `google.tools.googleSearch({})` to let Gemini search for venues and return structured results.
**When to use:** Anytime we want Gemini to use live web results — this is the correct v3.x API.

```typescript
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#google-search-tool
import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';

const { text, sources, experimental_output } = await generateText({
  model: google('gemini-2.5-flash'),
  tools: {
    google_search: google.tools.googleSearch({}),
  },
  output: Output.object({ schema: DiscoveredSourceSchema }),
  prompt: `Search for event venue websites in ${city}, ${province}, Canada...`,
});
```

**Critical note:** The tool key MUST be `"google_search"` — that is the name Gemini expects. Using any other name prevents the tool from activating.

**Critical note:** `useSearchGrounding` (old option on `google('model', { useSearchGrounding: true })`) is NOT available in `@ai-sdk/google` 3.0.43 — there is no such export. The correct API is `google.tools.googleSearch({})` passed as a tool. Verified by inspecting installed package exports.

### Pattern 2: Cron Route Handler (mirrors existing scrape cron)

```typescript
// Source: Pattern from src/app/api/cron/scrape/route.ts
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await runDiscoveryJob();
    return Response.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

### Pattern 3: Weekly Vercel Cron Entry

```json
// vercel.json — add alongside existing scrape cron
{
  "crons": [
    { "path": "/api/cron/scrape", "schedule": "0 6 * * *" },
    { "path": "/api/cron/discover", "schedule": "0 8 * * 1" }
  ]
}
```

`0 8 * * 1` = every Monday at 08:00 UTC. Valid on Hobby plan (runs once per week = less than once per day limit).

**Vercel Hobby plan cron constraint:** Only one execution per day maximum. A weekly schedule (`0 8 * * 1`) is valid. A daily schedule would conflict with the scrape cron and risk hitting the single daily invocation constraint per route. Source: Vercel docs (verified 2026-03-14).

### Pattern 4: Domain-Based Deduplication

The `scrape_sources` table has a `url` column with a unique constraint. Dedup strategy: extract the hostname from each candidate URL and compare against all existing `scrape_sources` URLs and existing `discovered_sources` URLs.

```typescript
import { scrape_sources, discovered_sources } from '@/lib/db/schema';

// Fetch all existing domains
const existing = await db.select({ url: scrape_sources.url }).from(scrape_sources);
const staged = await db.select({ url: discovered_sources.url }).from(discovered_sources);

const knownDomains = new Set([
  ...existing.map(r => new URL(r.url).hostname),
  ...staged.map(r => new URL(r.url).hostname),
]);

// Filter candidates
const newCandidates = candidates.filter(c => {
  try {
    return !knownDomains.has(new URL(c.url).hostname);
  } catch {
    return false; // skip malformed URLs
  }
});
```

### Pattern 5: Staging Insert

```typescript
// discovered_sources.url has a UNIQUE constraint — use onConflictDoNothing
await db
  .insert(discovered_sources)
  .values({
    url: candidate.url,
    domain: new URL(candidate.url).hostname,
    source_name: candidate.name ?? null,
    province: candidate.province ?? null,
    city: candidate.city ?? null,
    status: 'pending',
    discovery_method: 'gemini_google_search',
    raw_context: candidate.rawContext ?? null,
  })
  .onConflictDoNothing();
```

### Pattern 6: Promotion Script

Mirror `backfill-categories.ts` pattern — a standalone `tsx`-runnable script.

```typescript
// src/lib/scraper/promote-source.ts
// Usage: tsx src/lib/scraper/promote-source.ts <discovered_source_id>
import 'dotenv/config';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources, venues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const id = parseInt(process.argv[2], 10);
// 1. Fetch the staged source
// 2. Insert a minimal venue row (or require venue_id as arg)
// 3. Insert into scrape_sources with source_type='venue_website', enabled=true
// 4. Update discovered_sources.status = 'approved', added_to_sources_at = now()
```

**Design decision:** `scrape_sources` requires a `venue_id` foreign key. Promotion therefore needs either a venue row to exist, or the script accepts a venue_id. The simplest approach: the promoter creates a bare-minimum venue row from the staged `source_name` / `city` / `province` (with `lat`/`lng` left null — geocoding happens on first scrape per the orchestrator pattern), then inserts into `scrape_sources`.

### Anti-Patterns to Avoid

- **Auto-promotion:** Never automatically move a discovered source to `scrape_sources`. Status must stay `pending` until a human promotes it. This is the core of DISC-02.
- **Re-querying on URL equality alone:** Two URLs with the same domain but different paths (e.g., `/events` vs `/`) should be treated as the same venue. Deduplicate on hostname, not full URL.
- **Calling `useSearchGrounding`:** This option does not exist in the installed `@ai-sdk/google` 3.0.43 package. Use `google.tools.googleSearch({})` as a tool.
- **Storing all provinces in one Gemini call:** The grounding context window is more reliable when queries are city-specific. Run one call per city, not one call for all of Atlantic Canada.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web search for venues | Custom HTTP calls to Google Search API | `google.tools.googleSearch({})` in `generateText` | SDK handles auth, rate limits, grounding metadata |
| JSON parsing of Gemini output | Manual regex/string parsing | `Output.object({ schema })` in `generateText` | Already proven in extractor; Zod validation included |
| URL validation | Custom regex | `new URL(str)` + try/catch | Native, handles edge cases |
| Cron scheduling | External cron service | Vercel `vercel.json` crons | Already used for scrape; no extra infrastructure |
| DB deduplication | Application-level queries only | `onConflictDoNothing()` in Drizzle | Race-condition safe at DB level |

---

## Common Pitfalls

### Pitfall 1: Vercel Hobby Cron Once-Per-Day Limit

**What goes wrong:** Adding a cron expression like `0 */6 * * *` (every 6 hours) causes deploy failure with "Hobby accounts are limited to daily cron jobs."
**Why it happens:** Hobby plan enforces a minimum interval of once per day.
**How to avoid:** Use `0 8 * * 1` (weekly on Mondays). The phase spec says "weekly" — this is compliant.
**Warning signs:** Vercel deploy error mentioning cron frequency.

### Pitfall 2: `useSearchGrounding` Does Not Exist in Installed Version

**What goes wrong:** Using `google('gemini-2.5-flash', { useSearchGrounding: true })` throws a TypeScript error or silently ignores the option.
**Why it happens:** The installed `@ai-sdk/google` 3.0.43 does not export `useSearchGrounding`. The correct surface is `google.tools.googleSearch({})`.
**How to avoid:** Always use `tools: { google_search: google.tools.googleSearch({}) }` in `generateText`.
**Warning signs:** TypeScript error on the options object, or Gemini response lacks grounding metadata.

### Pitfall 3: Grounding Output Quality for Small Geographies

**What goes wrong:** Gemini returns tourist websites, regional news, or event aggregators (e.g., eventbrite.ca) instead of venue websites.
**Why it happens:** "Atlantic Canada" is a small geographic market with limited indexing. Gemini's search grounding may surface non-venue results.
**How to avoid:** Prompt specifically for venue websites (bars, pubs, theatres, concert halls) with events pages. Filter output: reject URLs containing known aggregator domains (eventbrite.com, bandsintown.com, facebook.com). Use city-level queries.
**Warning signs:** Discovered candidates are all eventbrite listings.

### Pitfall 4: `scrape_sources` Venue FK Requirement on Promotion

**What goes wrong:** Promotion script fails with FK violation because `scrape_sources.venue_id` is NOT NULL.
**Why it happens:** `scrape_sources` was designed to link to an existing `venues` row; `discovered_sources` has no such FK.
**How to avoid:** Promotion script must create a `venues` row first (with `lat`/`lng` null), then use its ID when inserting into `scrape_sources`. Geocoding happens on first orchestrator run.
**Warning signs:** Drizzle FK constraint error during promotion.

### Pitfall 5: Malformed URLs from Gemini

**What goes wrong:** Gemini returns relative paths, bare domains without scheme, or non-URL strings.
**Why it happens:** LLM output validation is essential — even with `Output.object`, string fields are unconstrained.
**How to avoid:** Wrap every candidate URL in `try { new URL(u) } catch { skip }` before DB insert. Add `z.string().url()` to the Zod schema for candidate URLs.
**Warning signs:** DB insert errors on malformed URL strings.

---

## Code Examples

### Discovery Orchestrator Skeleton

```typescript
// src/lib/scraper/discovery-orchestrator.ts
// Source: patterns from orchestrator.ts + extractor.ts + ai-sdk docs
import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources } from '@/lib/db/schema';

const ATLANTIC_CITIES: Array<{ city: string; province: string }> = [
  { city: 'Halifax', province: 'NS' },
  { city: 'Moncton', province: 'NB' },
  { city: 'Fredericton', province: 'NB' },
  { city: 'Saint John', province: 'NB' },
  { city: 'Charlottetown', province: 'PEI' },
  { city: "St. John's", province: 'NL' },
];

const CandidateSchema = z.object({
  candidates: z.array(z.object({
    url: z.string().url(),
    name: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
    rawContext: z.string().nullable(),
  })),
});

export async function runDiscoveryJob(): Promise<void> {
  // 1. Fetch known domains for dedup
  const existingSources = await db.select({ url: scrape_sources.url }).from(scrape_sources);
  const existingStaged = await db.select({ url: discovered_sources.url }).from(discovered_sources);
  const knownDomains = new Set([
    ...existingSources.map(r => { try { return new URL(r.url).hostname; } catch { return ''; } }),
    ...existingStaged.map(r => { try { return new URL(r.url).hostname; } catch { return ''; } }),
  ].filter(Boolean));

  let totalInserted = 0;

  for (const { city, province } of ATLANTIC_CITIES) {
    const { experimental_output } = await generateText({
      model: google('gemini-2.5-flash'),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      output: Output.object({ schema: CandidateSchema }),
      prompt: `Search for event venue websites in ${city}, ${province}, Canada.
Find bars, pubs, theatres, concert halls, and community centres that host public events.
Return their official website URLs (not Eventbrite/Facebook/Bandsintown pages).
For each venue return: url, name, province ("${province}"), city ("${city}"), and a brief rawContext.`,
    });

    const candidates = experimental_output?.candidates ?? [];

    for (const candidate of candidates) {
      let hostname: string;
      try { hostname = new URL(candidate.url).hostname; } catch { continue; }
      if (knownDomains.has(hostname)) continue;

      // Skip known aggregators
      if (['eventbrite.com', 'bandsintown.com', 'facebook.com', 'ticketmaster.com']
        .some(agg => hostname.includes(agg))) continue;

      await db.insert(discovered_sources).values({
        url: candidate.url,
        domain: hostname,
        source_name: candidate.name ?? null,
        province: candidate.province ?? null,
        city: candidate.city ?? null,
        status: 'pending',
        discovery_method: 'gemini_google_search',
        raw_context: candidate.rawContext ?? null,
      }).onConflictDoNothing();

      knownDomains.add(hostname); // prevent duplicate within same run
      totalInserted++;
    }
  }

  console.log(`Discovery complete: ${totalInserted} new candidates staged`);
}
```

### Promotion Script Skeleton

```typescript
// src/lib/scraper/promote-source.ts
// Usage: tsx src/lib/scraper/promote-source.ts <discovered_source_id>
import 'dotenv/config';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources, venues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function promoteSource(discoveredId: number): Promise<void> {
  const staged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.id, discoveredId),
  });
  if (!staged) throw new Error(`No discovered source with id=${discoveredId}`);
  if (staged.status !== 'pending') throw new Error(`Source is not pending (status=${staged.status})`);

  // 1. Create a bare venue row (lat/lng null — geocoded on first scrape)
  const [venue] = await db.insert(venues).values({
    name: staged.source_name ?? staged.domain,
    address: `${staged.city ?? ''}, ${staged.province ?? ''}, Canada`.trim(),
    city: staged.city ?? '',
    province: staged.province ?? '',
  }).returning({ id: venues.id });

  // 2. Add to active scrape queue
  await db.insert(scrape_sources).values({
    url: staged.url,
    venue_id: venue.id,
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  });

  // 3. Mark staged as approved
  await db.update(discovered_sources)
    .set({ status: 'approved', reviewed_at: new Date(), added_to_sources_at: new Date() })
    .where(eq(discovered_sources.id, discoveredId));

  console.log(`Promoted ${staged.url} → venue.id=${venue.id}`);
}

const id = parseInt(process.argv[2] ?? '', 10);
if (isNaN(id)) { console.error('Usage: tsx promote-source.ts <id>'); process.exit(1); }
promoteSource(id).catch(console.error).finally(() => process.exit(0));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useSearchGrounding: true` on model options | `google.tools.googleSearch({})` as a named tool | AI SDK v3+ / @ai-sdk/google 3.x | Breaking change — old option silently ignored or type errors |
| Separate grounding-only API | `generateText` with `Output.object` + search tool simultaneously | AI SDK 6.x | Can extract structured data AND use grounding in one call |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 with ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest src/app/api/cron/discover` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | Discovery cron route returns 401 without token | unit | `npx jest src/app/api/cron/discover/route.test.ts -t "401"` | ❌ Wave 0 |
| DISC-01 | Discovery cron route calls runDiscoveryJob with valid token | unit | `npx jest src/app/api/cron/discover/route.test.ts -t "calls runDiscoveryJob"` | ❌ Wave 0 |
| DISC-01 | runDiscoveryJob fetches known domains before querying | unit | `npx jest src/lib/scraper/discovery-orchestrator.test.ts -t "dedup"` | ❌ Wave 0 |
| DISC-02 | Candidates inserted with status='pending' | unit | `npx jest src/lib/scraper/discovery-orchestrator.test.ts -t "pending"` | ❌ Wave 0 |
| DISC-02 | Known domain skipped (not re-inserted) | unit | `npx jest src/lib/scraper/discovery-orchestrator.test.ts -t "known domain"` | ❌ Wave 0 |
| DISC-03 | Promotion script updates status to 'approved' | unit | `npx jest src/lib/scraper/promote-source.test.ts` | ❌ Wave 0 |
| DISC-03 | Promotion script creates venue row | unit | `npx jest src/lib/scraper/promote-source.test.ts -t "venue"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/app/api/cron/discover`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/cron/discover/route.test.ts` — covers DISC-01 (cron auth + job invocation)
- [ ] `src/lib/scraper/discovery-orchestrator.test.ts` — covers DISC-01 + DISC-02 (dedup, staging insert)
- [ ] `src/lib/scraper/promote-source.test.ts` — covers DISC-03 (promotion flow, venue creation)

All three test files must mock `@ai-sdk/google` and `drizzle-orm` (same pattern as `scrape/route.test.ts` which mocks the orchestrator).

---

## Open Questions

1. **Gemini grounding output quality for Atlantic Canada**
   - What we know: The `google.tools.googleSearch({})` mechanism is confirmed working in the installed SDK version.
   - What's unclear: Whether Gemini finds real venue websites vs. noise (aggregators, tourism sites) for small Atlantic Canada cities. STATE.md explicitly flags this as unverified.
   - Recommendation: Test one city (Halifax) manually with `tsx` before wiring up full multi-city orchestrator. Accept some noise — the staging review step exists precisely for this.

2. **Gemini rate limits during multi-city discovery**
   - What we know: The scrape orchestrator uses `SCRAPE_THROTTLE_MS` (default 4000ms). Free tier is 20 req/day.
   - What's unclear: Whether 6 city-specific grounding calls per weekly run will hit paid-tier rate limits.
   - Recommendation: Add a delay between city queries (same `delay()` helper already in `orchestrator.ts`). Document in env vars as `DISCOVERY_THROTTLE_MS`.

3. **`Output.object` compatibility with grounding tools**
   - What we know: The AI SDK 6.x docs show `generateText` with `tools:` and `output:` used together. The extractor uses `Output.object` without tools.
   - What's unclear: Whether `Output.object` and `google.tools.googleSearch` interact correctly in practice (the model must use search AND return JSON).
   - Recommendation: If structured output conflicts with tool use, fall back to parsing `text` response with Zod manually, or use a two-step flow (grounding call → structured extraction call on the result).

---

## Sources

### Primary (HIGH confidence)
- Installed `@ai-sdk/google` 3.0.43 package inspection — confirmed `google.tools.googleSearch` is the correct API; `useSearchGrounding` does not exist
- `src/lib/db/schema.ts` — `discovered_sources` table schema verified
- `src/app/api/cron/scrape/route.ts` + `vercel.json` — existing cron pattern
- Vercel cron docs (`vercel.com/docs/cron-jobs/usage-and-pricing`) — Hobby plan: once per day max, weekly valid
- AI SDK official docs (`ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai`) — `google.tools.googleSearch({})` usage confirmed

### Secondary (MEDIUM confidence)
- AI SDK `generateText` with simultaneous `Output.object` + grounding tools — documented as supported in AI SDK 6 but not locally verified in this project
- Multi-city query approach — inferred from grounding quality concerns, not benchmarked

### Tertiary (LOW confidence)
- Gemini grounding output quality for Atlantic Canada small-market discovery — completely unverified, flagged in STATE.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are installed; API surface verified by inspecting node_modules
- Architecture: HIGH — mirrors proven patterns already in codebase
- Pitfalls: HIGH — `useSearchGrounding` absence verified by direct inspection; Vercel limits from official docs
- Grounding output quality: LOW — unverified for this geography

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable AI SDK, but `@ai-sdk/google` evolves quickly — reverify if upgraded)
