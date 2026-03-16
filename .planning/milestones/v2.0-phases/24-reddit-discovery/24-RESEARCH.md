# Phase 24: Reddit Discovery - Research

**Researched:** 2026-03-15
**Domain:** Reddit public JSON API, Gemini structured extraction, discovered_sources pipeline
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Subreddit Targeting**
- Target all three tiers: major city subs (r/halifax, r/fredericton, r/moncton, r/saintjohn, r/charlottetown, r/stjohnsnl), province subs (r/novascotia, r/newbrunswickcanada, r/PEI, r/newfoundland), and niche music/event subs if they exist
- Configurable subreddit list as a constant, organized by province mapping
- Always check all configured subs regardless of hit rate — no skip logic for low-volume subs
- 7-day recency window on each run — only process posts created within the past week

**Reddit Data Access**
- Use Reddit public JSON API (append .json to subreddit URL) — no OAuth, no API key needed
- Fetch /new.json listing (chronological, newest first) — filter by created_utc for 7-day window
- Posts only (title + selftext body) — no comment scanning
- Track processed Reddit post IDs to avoid re-sending to Gemini on overlapping windows
- Keyword pre-filter before sending to Gemini: match posts containing venue/event terms (bar, pub, show, concert, gig, venue, music, live, theatre, etc.)

**Gemini Extraction Shape**
- Venue-focused extraction: venue_name, city, province, address (if mentioned), venue_type (bar/pub/theatre/etc)
- Also extract website URL if present in post text — gives candidate a scrapeable URL
- No event date extraction — venue discovery only, events come from scraping later
- Batch posts per subreddit into a single Gemini call — fewer API calls, Gemini sees cross-post context
- Zod schema for extraction output (array of venue candidates per batch)

**Scoring & Approval**
- Reuse existing scoreCandidate() pattern from discovery-orchestrator.ts — field-presence scoring (city +0.15, province +0.15, name +0.10)
- Auto-approve at 0.9 threshold (GEMINI_AUTO_APPROVE already set in Phase 23)
- Reddit candidates with URL that score >= 0.9 auto-approve and promote through existing pipeline
- Reddit candidates without URL staged as 'pending' for admin review (NOT 'no_website' — Reddit names too noisy for auto-stubs)

**Cron & Pipeline Wiring**
- Single cron endpoint: /api/cron/discover-reddit — iterates all configured subreddits
- Weekly cron schedule (e.g., Friday)
- discovery_method = 'reddit_gemini' (already defined in schema)
- Flows through existing discovered_sources pipeline — promoteSource(), scoreVenueCandidate() dedup

### Claude's Discretion
- Exact keyword list for pre-filtering
- Post ID storage mechanism (raw_context field, separate column, or in-memory set rebuilt from discovered_sources query)
- Rate limiting between Reddit API calls
- Gemini prompt wording for venue extraction
- Error handling per-subreddit (continue on failure)
- Whether to cap posts per subreddit (e.g., first 100 from /new.json)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REDDIT-01 | System mines Atlantic Canada subreddits for venue and event mentions | Reddit public JSON API access confirmed; /new.json listing with 7-day filter; keyword pre-filtering before Gemini |
| REDDIT-02 | System uses Gemini to extract structured venue data from Reddit posts | Existing `generateText` + `Output.object` + Zod schema pattern is the established approach; batch-per-subreddit keeps cost low |
| REDDIT-03 | System targets province-specific subreddits with configurable mapping | Subreddit constant organized by province mapping mirrors PLACES_CITIES pattern; province inferred from sub name as fallback |
| REDDIT-04 | Reddit-discovered venues flow through existing discovered_sources pipeline | scoreCandidate(), promoteSource(), scoreVenueCandidate() dedup, and status values all exist and require zero modification |
</phase_requirements>

---

## Summary

Phase 24 adds a Reddit mining channel alongside the existing Gemini+Search and Google Places discovery paths. The implementation is narrow: one new cron route, one new lib module (`reddit-discoverer.ts`), and a new entry in `vercel.json`. Everything downstream — scoring, dedup, promotion, admin UI, status values — is already in place from Phases 22 and 23.

The Reddit public JSON API (append `.json` to any subreddit URL) is confirmed to work for unauthenticated reads of public subreddits as of 2026, provided a descriptive `User-Agent` header is sent. Without a custom User-Agent, requests receive aggressive 429 rate limiting; with one, they succeed. Rate limits for unauthenticated access are approximately 10 requests per minute — low enough that inserting a short delay between subreddit fetches (e.g., 1–2 seconds) is sufficient for the ~10 targeted subreddits. The 100-post-per-page default is adequate for weekly cadence on Atlantic Canada subs.

Post ID deduplication is best handled by querying `discovered_sources` for existing `raw_context` values containing the Reddit post ID (or by storing post IDs in `raw_context` with a predictable prefix like `reddit:t3_abc123`). This avoids schema changes and fits the established `raw_context` field usage. A synthetic URL of the form `reddit:{post_id}` can serve as the `url` column value for Reddit candidates that have no extracted website URL, enabling idempotency via the existing unique constraint.

**Primary recommendation:** Create `src/lib/scraper/reddit-discoverer.ts` mirroring the structure of `places-discoverer.ts`, expose it through a single `/api/cron/discover-reddit` route, and add a Friday 9am UTC schedule to `vercel.json`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch` | Node built-in | HTTP requests to Reddit JSON API | Already used for Places API in places-discoverer.ts |
| `@ai-sdk/google` | ^3.0.43 (installed) | Gemini structured extraction | Project standard; `generateText` + `Output.object` pattern established |
| `ai` | ^6.0.116 (installed) | `generateText`, `Output` | Project standard |
| `zod` | ^4.3.6 (installed) | Extraction schema validation | Project standard; used in discovery-orchestrator.ts CandidateSchema |
| `drizzle-orm` | ^0.45.1 (installed) | DB insert/query | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new libraries | — | — | All dependencies already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch + .json append | PRAW (Python Reddit wrapper) | Project is TypeScript/Next.js; PRAW is Python-only |
| Native fetch + .json append | snoowrap npm package | Adds OAuth complexity and external dep; public JSON is sufficient for read-only |
| In-process User-Agent string | No header | Reddit returns 429 without a custom User-Agent |

**Installation:**
```bash
# No new packages required — all dependencies already installed
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/scraper/
│   ├── reddit-discoverer.ts        # NEW: core Reddit mining module
│   └── reddit-discoverer.test.ts   # NEW: unit tests
├── app/api/cron/
│   └── discover-reddit/
│       └── route.ts                # NEW: cron endpoint
vercel.json                         # MODIFY: add weekly schedule
```

### Pattern 1: Subreddit Constant Organized by Province
**What:** Mirror the `PLACES_CITIES` record structure — keyed by province, value is array of subreddit names with their province label.
**When to use:** Allows iterating all subreddits in one loop while carrying province context for Gemini and discovered_sources insertion.

```typescript
// Mirror of PLACES_CITIES pattern from places-discoverer.ts
export const REDDIT_SUBREDDITS: Record<string, Array<{ subreddit: string; province: string }>> = {
  NS: [
    { subreddit: 'halifax', province: 'NS' },
    { subreddit: 'novascotia', province: 'NS' },
  ],
  NB: [
    { subreddit: 'fredericton', province: 'NB' },
    { subreddit: 'moncton', province: 'NB' },
    { subreddit: 'saintjohn', province: 'NB' },
    { subreddit: 'newbrunswickcanada', province: 'NB' },
  ],
  PEI: [
    { subreddit: 'charlottetown', province: 'PEI' },
    { subreddit: 'PEI', province: 'PEI' },
  ],
  NL: [
    { subreddit: 'stjohnsnl', province: 'NL' },
    { subreddit: 'newfoundland', province: 'NL' },
  ],
};

// Flat list for single-endpoint iteration
export const ALL_REDDIT_SUBREDDITS = Object.values(REDDIT_SUBREDDITS).flat();
```

### Pattern 2: Reddit JSON API Fetch
**What:** Native fetch to `https://www.reddit.com/r/{sub}/new.json?limit=100` with a descriptive User-Agent. Filter response by `created_utc` for 7-day recency window.
**When to use:** Every subreddit fetch in the main loop.

```typescript
// Source: https://til.simonwillison.net/reddit/scraping-reddit-json
const REDDIT_USER_AGENT = 'eastcoastlocal/1.0 (atlantic canada venue discovery)';
const SEVEN_DAYS_AGO_SECONDS = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

interface RedditPost {
  id: string;      // e.g. "8xwlg"
  name: string;    // fullname e.g. "t3_8xwlg"
  title: string;
  selftext: string;
  created_utc: number; // epoch seconds UTC
  url: string;
}

interface RedditListingResponse {
  data: {
    children: Array<{ kind: string; data: RedditPost }>;
    after: string | null;
  };
}

async function fetchSubredditPosts(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`;
  const response = await fetch(url, {
    headers: { 'User-Agent': REDDIT_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Reddit API error for r/${subreddit}: ${response.status}`);
  }

  const data = await response.json() as RedditListingResponse;
  return data.data.children
    .filter((c) => c.kind === 't3')  // posts only
    .map((c) => c.data)
    .filter((p) => p.created_utc >= SEVEN_DAYS_AGO_SECONDS);
}
```

### Pattern 3: Keyword Pre-Filter
**What:** Filter posts by presence of venue/event keywords before sending to Gemini, reducing cost.
**When to use:** Applied to every post after fetching from Reddit, before batching for Gemini.

```typescript
// Claude's discretion — recommended keyword list
const VENUE_KEYWORDS = [
  'bar', 'pub', 'show', 'concert', 'gig', 'venue', 'music', 'live',
  'theatre', 'theater', 'club', 'lounge', 'brewery', 'tavern', 'hall',
  'performance', 'festival', 'stage', 'band', 'playing at', 'performing at',
];

function matchesVenueKeywords(post: RedditPost): boolean {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  return VENUE_KEYWORDS.some((kw) => text.includes(kw));
}
```

### Pattern 4: Gemini Batch Extraction
**What:** Send all keyword-matching posts for a subreddit as a single batch to Gemini. Use the same `generateText` + `Output.object` + Zod schema pattern established in `discovery-orchestrator.ts`.
**When to use:** Once per subreddit, after keyword pre-filter.

```typescript
// Mirrors CandidateSchema in discovery-orchestrator.ts
// Source: existing src/lib/scraper/discovery-orchestrator.ts pattern
const RedditCandidateSchema = z.object({
  candidates: z.array(
    z.object({
      venue_name: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      address: z.string().nullable(),
      venue_type: z.string().nullable(),
      website_url: z.string().url().nullable().optional(),
    })
  ),
});

// Usage: batch all keyword-matched posts from one subreddit
const postsText = filteredPosts
  .map((p, i) => `--- Post ${i + 1} ---\nTitle: ${p.title}\n${p.selftext}`)
  .join('\n\n');

const { experimental_output } = await generateText({
  model: google('gemini-2.5-flash'),
  output: Output.object({ schema: RedditCandidateSchema }),
  prompt: `Extract venue mentions from these Reddit posts from r/${subreddit} (Atlantic Canada).
For each distinct venue or bar mentioned, extract: venue_name, city, province (NS/NB/PEI/NL),
address (if mentioned), venue_type (bar/pub/theatre/club/etc), and website_url (if present in post text).
Only extract real venues — ignore event aggregators, Facebook events, or Eventbrite links.
Province hint from subreddit mapping: ${provinceHint}.

${postsText}`,
});
```

### Pattern 5: Post ID Dedup via raw_context Prefix
**What:** Store `reddit:t3_{postId}` as a prefix in `raw_context`. Before sending to Gemini, query `discovered_sources` for rows where `raw_context` LIKE `reddit:t3_{postId}%` to skip already-processed posts. For candidates without an extracted website URL, use `reddit:t3_{postId}` as the `url` column value to satisfy the unique constraint and enable idempotent re-runs.
**When to use:** Dedup check before Gemini call and during insert.

```typescript
// Query existing processed post IDs at run start (once)
const existingRedditRows = await db
  .select({ raw_context: discovered_sources.raw_context })
  .from(discovered_sources)
  .where(like(discovered_sources.raw_context, 'reddit:t3_%'));

const processedPostIds = new Set(
  existingRedditRows
    .map((r) => r.raw_context?.split(':')[2]) // extract post ID from "reddit:t3_abc"
    .filter(Boolean) as string[]
);

// Before processing a post:
if (processedPostIds.has(post.id)) continue;

// For candidates without extracted URL:
const candidateUrl = candidate.website_url ?? `reddit:t3_${post.id}`;
```

### Pattern 6: Cron Route (mirrors discover-places-ns/route.ts exactly)
**What:** Single GET handler with CRON_SECRET Bearer auth, maxDuration = 60, calls the runner and returns JSON.
**When to use:** The only route needed — single endpoint iterates all subreddits.

```typescript
// src/app/api/cron/discover-reddit/route.ts
import { runRedditDiscovery, ALL_REDDIT_SUBREDDITS } from '@/lib/scraper/reddit-discoverer';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRedditDiscovery(ALL_REDDIT_SUBREDDITS);
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Reddit discovery failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

### Pattern 7: vercel.json Schedule Addition
**What:** Add Friday 9am UTC schedule alongside existing Mon-Thu Places cron entries.
**When to use:** Single addition to existing crons array.

```json
{
  "path": "/api/cron/discover-reddit",
  "schedule": "0 9 * * 5"
}
```

### Anti-Patterns to Avoid
- **Missing User-Agent header:** Reddit returns 429 for requests with no custom User-Agent. Always set `User-Agent: eastcoastlocal/1.0 (atlantic canada venue discovery)`.
- **Storing raw post text in discovered_sources:** REQUIREMENTS.md explicitly lists "Storing raw Reddit post text" as out of scope. Only store extracted structured data and the post ID reference in raw_context.
- **Treating no-URL Reddit candidates as 'no_website':** CONTEXT.md explicitly excludes this — Reddit names are too noisy for auto-stubs. Candidates without an extracted website URL go to `status = 'pending'` for admin review.
- **Using `like()` on every post individually:** Query all processed post IDs once at run start and hold in a Set; don't hit the DB per-post.
- **Sending Gemini a single giant batch across all subreddits:** Batch per-subreddit so province context is tight and Gemini errors are isolated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Venue scoring | Custom scoring logic | `scoreCandidate()` from discovery-orchestrator.ts | Already accounts for city/province/name/https/aggregator penalties |
| Source promotion | Custom venue + scrape_source creation | `promoteSource()` from promote-source.ts | Handles lat/lng, google_place_id, address, status guard, scrape_sources insert skip for no_website |
| Dedup at insert | Custom dedup query | `onConflictDoNothing()` on `discovered_sources.url` | Unique index on url handles idempotency |
| DB insert pattern | Ad-hoc inserts | Established `.insert().values().onConflictDoNothing()` chain | Consistent with all other discovery paths |
| Auto-approve threshold | Hardcoded 0.9 | `parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9')` | Already configurable via env; matches Phase 23 decision |

**Key insight:** The entire scoring, dedup, promotion, and admin UI pipeline is already built. This phase is purely a new data source that feeds the existing funnel.

---

## Common Pitfalls

### Pitfall 1: 429 from Reddit Without User-Agent
**What goes wrong:** `fetch()` to `reddit.com/r/sub/new.json` returns `{"message":"Too Many Requests","error":429}` immediately.
**Why it happens:** Reddit rate-limits requests without a custom User-Agent very aggressively.
**How to avoid:** Set `User-Agent` header on every request: `'eastcoastlocal/1.0 (atlantic canada venue discovery)'`.
**Warning signs:** Non-200 status code on first fetch attempt.

### Pitfall 2: Exceeding 60s Vercel Timeout
**What goes wrong:** cron function times out mid-run with ~10 subreddits + 10 Gemini calls + DB writes.
**Why it happens:** 60 seconds is tight if each Gemini call takes 3-6 seconds.
**How to avoid:** Keep inter-subreddit delay short (1s is enough for unauthenticated rate limiting). Monitor actual run time in logs. If approaching timeout, reduce posts per subreddit (cap at 50 instead of 100) or split into two cron endpoints.
**Warning signs:** Vercel logs showing function timeout errors on Friday runs.

### Pitfall 3: Gemini Returns No Candidates on Sparse Subs
**What goes wrong:** Smaller subs (r/PEI, r/charlottetown) have few posts matching keywords — Gemini call is made with empty input.
**Why it happens:** Low post volume on small Atlantic Canada subs; all posts filtered by keyword pre-filter.
**How to avoid:** Skip the Gemini call entirely if `filteredPosts.length === 0` for a subreddit.
**Warning signs:** Gemini called with empty post text, wasting API quota.

### Pitfall 4: Duplicate Candidates Across Subreddit Overlap
**What goes wrong:** The same venue is mentioned in both r/halifax and r/novascotia within the same week.
**Why it happens:** Province subs overlap with city subs geographically.
**How to avoid:** The `onConflictDoNothing()` on `discovered_sources.url` handles this for candidates with extracted website URLs. For no-URL candidates, the synthetic `reddit:t3_{postId}` URL is unique per post so a duplicate venue mention in a different post won't be caught — accept this as low risk given the admin review path for no-URL candidates.
**Warning signs:** Admin queue showing visually identical venue names from different subreddits.

### Pitfall 5: Gemini Hallucinating Province from Province Hint
**What goes wrong:** Gemini uses the province hint from subreddit mapping even when the post text clearly mentions a different province.
**Why it happens:** Prompt says "province hint from subreddit mapping" — Gemini may anchor on this even for off-topic posts.
**How to avoid:** Frame the hint as a fallback in the prompt: "Extract province from post text if mentioned; otherwise default to {provinceHint}." Accept some noise — admin review catches mismatches.
**Warning signs:** Candidates from r/novascotia with province=NB or PEI in extracted data.

### Pitfall 6: 'reddit_gemini' discovery_method Already in Schema
**What goes wrong:** Developer attempts to add migration for new discovery_method value.
**Why it happens:** Confusion about whether `discovery_method` is a Postgres enum or free text.
**How to avoid:** `discovery_method` is a plain `text` column (no enum constraint) — inserting `'reddit_gemini'` requires no migration. Confirmed in schema.ts line 154: `discovery_method: text('discovery_method')`.
**Warning signs:** Any migration file created for this field.

---

## Code Examples

### Full discovered_sources Insert for Reddit Candidate
```typescript
// Source: mirrors stageCandidate() in places-discoverer.ts
// For a candidate WITH extracted website URL:
await db
  .insert(discovered_sources)
  .values({
    url: candidate.website_url,                        // extracted from post text
    domain: new URL(candidate.website_url).hostname,
    source_name: candidate.venue_name ?? null,
    province: candidate.province ?? provinceHint,
    city: candidate.city ?? null,
    status: 'pending',
    discovery_method: 'reddit_gemini',
    raw_context: `reddit:t3_${post.id}`,               // post ID reference for dedup
    discovery_score: score,
  })
  .onConflictDoNothing();

// For a candidate WITHOUT extracted website URL:
await db
  .insert(discovered_sources)
  .values({
    url: `reddit:t3_${post.id}`,                       // synthetic URL for uniqueness
    domain: `reddit-${subreddit}`,                     // descriptive domain label
    source_name: candidate.venue_name ?? null,
    province: candidate.province ?? provinceHint,
    city: candidate.city ?? null,
    status: 'pending',                                 // NOT 'no_website' — per CONTEXT.md decision
    discovery_method: 'reddit_gemini',
    raw_context: `reddit:t3_${post.id}`,
    discovery_score: score,
  })
  .onConflictDoNothing();
```

### scoreCandidate Adapter for Reddit Candidates
```typescript
// scoreCandidate() expects { url, city, province, source_name }
// Reddit candidates map directly:
const score = scoreCandidate({
  url: candidate.website_url ?? `reddit:t3_${post.id}`,
  city: candidate.city ?? null,
  province: candidate.province ?? provinceHint,
  source_name: candidate.venue_name ?? null,
});
// Note: synthetic reddit: URLs don't start with https:// so they miss the +0.05 bonus
// and don't trigger the social domain -1.0 penalty — both correct behaviors
```

### Run Result Type (mirrors DiscoveryRunResult)
```typescript
export interface RedditDiscoveryRunResult {
  subredditsChecked: number;
  postsScanned: number;
  postsFiltered: number;       // matched keywords
  candidatesFound: number;     // Gemini extracted
  staged: number;
  autoApproved: number;
  errors: number;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OAuth required for Reddit API | Public .json endpoints still work without OAuth for read-only access | Ongoing — confirmed 2026 | No credentials needed for this use case |
| AUTO_APPROVE_THRESHOLD env var | GEMINI_AUTO_APPROVE env var | Phase 23 | Use GEMINI_AUTO_APPROVE, already set at 0.9 |
| Separate scoring per discovery path | scoreCandidate() shared across gemini_google_search and reddit_gemini | Phase 22/23 | No new scoring code needed |

**Deprecated/outdated:**
- `AUTO_APPROVE_THRESHOLD`: Renamed to `GEMINI_AUTO_APPROVE` in Phase 23. Do not reference the old name.

---

## Open Questions

1. **Niche music/event subreddits for Atlantic Canada**
   - What we know: CONTEXT.md says to include niche music/event subs "if they exist"
   - What's unclear: r/AtlanticCanadaMusic, r/halifaxmusic, etc. are not confirmed to exist or have meaningful volume
   - Recommendation: Start with the 10 confirmed subs (city + province tier). Planner should add a task to spot-check niche subs — if found with meaningful volume, add to constant in the same wave.

2. **Rate limit headroom with 10 subreddits**
   - What we know: Unauthenticated Reddit API allows ~10 requests/minute; 1s delay between fetches yields ~60 fetches in 60 seconds
   - What's unclear: Whether Vercel's egress IP shares rate limit quota across concurrent functions
   - Recommendation: Use a 1.5s delay between subreddit fetches. With 10 subs that is 15 seconds of throttle, well within the 60s budget and the rate limit.

3. **drizzle `like()` operator availability**
   - What we know: Project uses drizzle-orm ^0.45.1; standard operators (eq, and, gte, inArray) are confirmed used
   - What's unclear: Whether `like()` from drizzle-orm is imported and working — no existing usage in codebase
   - Recommendation: Use `sql`` template or filter in JS instead if `like()` causes issues. Alternative: query all `raw_context` values starting with `reddit:` and filter in-memory (volume is small — likely < 1000 rows at this stage).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 with ts-jest |
| Config file | `jest.config.ts` (rootDir) |
| Quick run command | `npx jest src/lib/scraper/reddit-discoverer.test.ts --no-coverage` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REDDIT-01 | fetchSubredditPosts returns posts within 7-day window, excludes older posts | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "fetchSubredditPosts" --no-coverage` | Wave 0 |
| REDDIT-01 | keyword pre-filter matches venue terms, skips non-venue posts | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "matchesVenueKeywords" --no-coverage` | Wave 0 |
| REDDIT-01 | subreddits with no keyword-matched posts skip Gemini call | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "skips Gemini when no posts match keywords" --no-coverage` | Wave 0 |
| REDDIT-02 | Gemini extraction produces candidates with venue_name, city, province | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "Gemini extraction" --no-coverage` | Wave 0 |
| REDDIT-02 | candidates with URL are inserted with status=pending and discovery_method=reddit_gemini | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "stages candidate with URL" --no-coverage` | Wave 0 |
| REDDIT-02 | candidates without URL staged with synthetic reddit:t3_ URL and status=pending | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "stages candidate without URL" --no-coverage` | Wave 0 |
| REDDIT-03 | REDDIT_SUBREDDITS constant has entries for all 4 provinces | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "REDDIT_SUBREDDITS" --no-coverage` | Wave 0 |
| REDDIT-03 | province hint passes from subreddit mapping to discovered_sources row | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "province hint" --no-coverage` | Wave 0 |
| REDDIT-04 | high-scoring candidate (>= 0.9) triggers promoteSource call | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "auto-approve" --no-coverage` | Wave 0 |
| REDDIT-04 | low-scoring candidate does not call promoteSource | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "does not auto-approve" --no-coverage` | Wave 0 |
| REDDIT-04 | cron route returns 401 with wrong CRON_SECRET | unit | `npx jest src/app/api/cron/discover-reddit/route.test.ts --no-coverage` | Wave 0 |
| REDDIT-04 | cron route returns 200 and calls runRedditDiscovery with correct token | unit | `npx jest src/app/api/cron/discover-reddit/route.test.ts --no-coverage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/lib/scraper/reddit-discoverer.test.ts --no-coverage`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/scraper/reddit-discoverer.ts` — main module (created in wave 1)
- [ ] `src/lib/scraper/reddit-discoverer.test.ts` — unit tests covering all req behaviors above
- [ ] `src/app/api/cron/discover-reddit/route.ts` — cron endpoint
- [ ] `src/app/api/cron/discover-reddit/route.test.ts` — auth + success + error tests mirroring discover/route.test.ts

---

## Sources

### Primary (HIGH confidence)
- Existing codebase — `src/lib/scraper/discovery-orchestrator.ts`, `places-discoverer.ts`, `promote-source.ts`, `schema.ts`: direct code inspection, all patterns confirmed
- `https://github.com/reddit-archive/reddit/wiki/JSON` — official Reddit JSON structure documentation; confirmed `id`, `name`, `title`, `selftext`, `created_utc` field names
- `https://til.simonwillison.net/reddit/scraping-reddit-json` — confirmed: public .json endpoints work without OAuth when custom User-Agent is set; 429 without User-Agent

### Secondary (MEDIUM confidence)
- Multiple WebSearch sources confirming ~10 req/min unauthenticated rate limit and User-Agent requirement (cross-verified with Simon Willison article)
- `https://github.com/0anxt/reddit-json-scraper` — "No authentication required" confirmed for public subreddits (2025 GitHub activity)

### Tertiary (LOW confidence)
- Subreddit subscriber counts (r/halifax ~135k) from search snippet — directional only, not formally verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all libraries confirmed installed and used
- Architecture: HIGH — mirrors established Places discoverer pattern exactly; all integration points confirmed in live code
- Reddit API access: MEDIUM-HIGH — confirmed working from authoritative sources; exact rate limit number (10/min) is approximate but conservative design accommodates it
- Pitfalls: HIGH — derived from direct code inspection and documented Reddit API behavior

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (Reddit JSON API is stable; library versions pinned in package.json)
