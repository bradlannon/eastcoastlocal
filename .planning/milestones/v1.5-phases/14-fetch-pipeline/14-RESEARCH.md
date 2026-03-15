# Phase 14: Fetch Pipeline - Research

**Researched:** 2026-03-15
**Domain:** HTTP fetch pipeline — pagination, per-domain rate limiting, retry/backoff, JSON-LD structured data extraction
**Confidence:** HIGH — based on direct codebase inspection + verified prior research documents

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCRP-01 | Scraper follows pagination links on venue websites up to a configurable page limit | `fetchAndPreprocess` extended with multi-page loop; `max_pages` column added to `scrape_sources`; next-URL detected via `rel="next"` and aria-label selectors; hard cap at 3 pages in code |
| SCRP-02 | Per-domain rate limiting prevents sources from being blocked during scrape runs | `Map<domain, lastRequestTime>` per-domain throttle in `fetcher.ts`; inter-source HTTP delay in `orchestrator.ts` via `HTTP_THROTTLE_MS` env var; NOT global delays — concurrent different domains allowed |
| SCRP-03 | Failed scrape requests are retried with exponential backoff | `fetchWithRetry()` wrapper in `fetcher.ts`; 2 retries; delays of 1s then 2s; handles 429/503 explicitly; Retry-After header respected; throws original error after exhausting retries |
| PLAT-04 | System extracts events from Google Events JSON-LD structured data on venue pages before calling Gemini | New `json-ld.ts` module; `fetchAndPreprocess` returns `{ text, rawHtml }` instead of `string`; orchestrator tries JSON-LD first, short-circuits to skip Gemini if events found; `confidence = 1.0` for JSON-LD events |
</phase_requirements>

---

## Summary

Phase 14 improves the reliability and coverage of the existing scraping pipeline by adding three independent fetch-layer capabilities — multi-page following, per-domain rate limiting with retry/backoff, and JSON-LD structured data extraction — plus a required schema migration to support them.

The current `fetcher.ts` is a single-page, no-retry, no-delay HTTP fetch. `orchestrator.ts` has AI throttle delays between sources but no HTTP throttle. There is no pagination logic anywhere. Events on page 2 or 3 of a venue website are silently dropped. There is no retry on transient failures. Gemini is called for every venue page regardless of whether the page has structured event data that could be parsed deterministically.

All four requirements are addressed by modifying two existing files (`fetcher.ts`, `orchestrator.ts`), creating two new files (`json-ld.ts`, `schema migration`), and adding one column to `scrape_sources`. No new npm packages are needed. The schema migration is the prerequisite for the `max_pages` column; the rest is pure logic. The JSON-LD pre-pass depends on `fetcher.ts` returning `{ text, rawHtml }` — so multi-page changes and the return type change must land before or alongside `json-ld.ts`.

**Primary recommendation:** Implement in wave order — (1) schema migration + rate limiting + retry, (2) multi-page loop with updated return type, (3) JSON-LD extraction that consumes `rawHtml`.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cheerio` | 1.x | HTML parsing for pagination link detection and JSON-LD `<script>` block extraction | Already in production for HTML preprocessing; no new dep |
| `drizzle-orm` | 0.39.x | Schema migration (new `max_pages` column) and metric writes | Existing ORM for all DB access |
| Native `fetch` | Node.js built-in | HTTP requests with `AbortSignal.timeout` | Already used in `fetcher.ts`; no axios/got needed |

**Installation:** No new packages required.

---

## Architecture Patterns

### Current State of `fetcher.ts`

```typescript
// Current signature — returns string only
export async function fetchAndPreprocess(url: string): Promise<string>
```

Current behavior: fetches one page, returns cleaned text up to 15,000 chars. No retry. No delay between pages. No raw HTML preserved.

### Target State of `fetcher.ts`

```typescript
// New signature — returns both cleaned text and raw HTML
export async function fetchAndPreprocess(
  url: string,
  options?: { maxPages?: number }
): Promise<{ text: string; rawHtml: string }>
```

The `rawHtml` return value is only needed for JSON-LD parsing, and only the first page needs it (JSON-LD event schemas appear on page 1).

### Pattern 1: Retry with Exponential Backoff

Wrap the base `fetch` call in `fetchWithRetry`. Retry on transient HTTP status (429, 503) and on network errors. Cap at 2 retries with delays of 1s then 2s. Respect `Retry-After` header if present.

```typescript
// Source: ARCHITECTURE.md verified pattern
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(1000 * Math.pow(2, attempt - 1)); // 1s, 2s
    }
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EastCoastLocal/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status === 429 || resp.status === 503) {
        if (attempt < retries) continue; // retry on rate-limit/unavailable
      }
      return resp;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}
```

### Pattern 2: Per-Domain Rate Limiting

Use a `Map<domain, lastRequestTime>` tracked in module scope. Before each request, compute the elapsed time since the last request to that domain and wait if under the minimum gap.

```typescript
// Source: ARCHITECTURE.md verified pattern
const domainLastRequest = new Map<string, number>();
const DOMAIN_MIN_GAP_MS = 2000; // 2s base + 500ms jitter

async function applyDomainRateLimit(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const last = domainLastRequest.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  const gap = DOMAIN_MIN_GAP_MS + Math.random() * 500; // ±500ms jitter
  if (elapsed < gap) {
    await delay(gap - elapsed);
  }
  domainLastRequest.set(domain, Date.now());
}
```

This allows concurrent requests to different domains while enforcing a per-domain gap. The inter-source `HTTP_THROTTLE_MS` in `orchestrator.ts` (1000ms default, env configurable) provides a secondary backstop between source iterations.

### Pattern 3: Multi-Page Loop with Hard Cap

```typescript
// Source: ARCHITECTURE.md verified pattern
export async function fetchAndPreprocess(
  url: string,
  options?: { maxPages?: number }
): Promise<{ text: string; rawHtml: string }> {
  const maxPages = Math.min(options?.maxPages ?? 1, 3); // hard cap at 3 — Vercel timeout constraint
  let allText = '';
  let firstHtml = '';
  let currentUrl: string | null = url;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    if (pageCount > 0) await delay(500); // 500ms between pages within same source
    const { html, text } = await fetchPage(currentUrl); // fetchPage uses fetchWithRetry internally
    if (pageCount === 0) firstHtml = html;
    allText += text;
    currentUrl = detectNextPageUrl(html, currentUrl);
    pageCount++;
  }

  return {
    text: allText.slice(0, 15_000),
    rawHtml: firstHtml,
  };
}
```

Next-page URL detection uses cheerio:

```typescript
function detectNextPageUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const nextLink = $(
    'a[rel="next"], ' +
    'a[aria-label*="next" i], ' +
    'a.pagination-next, ' +
    'li.next > a'
  ).first();
  const href = nextLink.attr('href');
  if (!href) return null;
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}
```

### Pattern 4: JSON-LD Fast Path (PLAT-04)

New `src/lib/scraper/json-ld.ts` module. Called from orchestrator before `extractEvents`. Short-circuits Gemini call if any events are found.

```typescript
// Source: ARCHITECTURE.md verified pattern
export function extractJsonLdEvents(html: string): ExtractedEvent[] {
  const $ = cheerio.load(html);
  const events: ExtractedEvent[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Event') {
          events.push(mapSchemaOrgEvent(item));
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });

  return events;
}
```

The orchestrator's `venue_website` path becomes:

```typescript
const { text, rawHtml } = await fetchAndPreprocess(source.url, { maxPages: source.max_pages });
const jsonLdEvents = extractJsonLdEvents(rawHtml);

if (jsonLdEvents.length > 0) {
  for (const event of jsonLdEvents) {
    await upsertEvent(source.venue_id, event, source.url);
  }
  // Short-circuit — do NOT also call extractEvents()
} else {
  const extracted = await extractEvents(text, source.url);
  for (const event of extracted) {
    await upsertEvent(source.venue_id, event, source.url);
  }
}
```

### Recommended Project Structure

No new directories needed. All changes are within:

```
src/
├── lib/
│   ├── scraper/
│   │   ├── fetcher.ts          # Modified: retry, rate limit, multi-page, new return type
│   │   ├── json-ld.ts          # New: JSON-LD extraction module
│   │   ├── orchestrator.ts     # Modified: pass max_pages, destructure { text, rawHtml },
│   │   │                       #           JSON-LD fast path, HTTP throttle between sources
│   │   └── ...                 # All other files unchanged
│   └── db/
│       └── schema.ts           # Modified: max_pages column on scrape_sources
drizzle/
└── XXXX_add_max_pages.sql      # New Drizzle migration
```

### Anti-Patterns to Avoid

- **Unlimited pagination without hard cap:** Following `rel="next"` indefinitely causes Vercel timeout. Always enforce `Math.min(options.maxPages, 3)` in code, not just via config.
- **Global delay instead of per-domain:** A single global `await delay(2000)` between ALL sources serializes requests to different domains unnecessarily. Use `Map<domain, lastRequestTime>`.
- **Calling Gemini after JSON-LD succeeds:** If `jsonLdEvents.length > 0`, return immediately. Do not merge JSON-LD and Gemini results — this creates duplicate events with conflicting confidence scores.
- **Raw HTML stripped before JSON-LD parse:** The current `fetchAndPreprocess` removes `<script>` tags before returning. The JSON-LD `<script>` blocks must be captured before stripping. Solution: capture `rawHtml` before cheerio mutation, then return both.
- **Applying domain rate limit after, not before, fetch:** Track `lastRequestTime` before the request (not after) to avoid under-counting concurrent scenarios.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML pagination link detection | Custom regex for href/page number patterns | `cheerio` with `a[rel="next"]` selectors | cheerio already imported; regex fails on relative URLs, encoding edge cases |
| JSON-LD script tag extraction | String split / regex on raw HTML | `cheerio` `$('script[type="application/ld+json"]')` | Handles multiple blocks per page, malformed attributes, nested content |
| Relative URL resolution | Manual string concatenation | `new URL(href, baseUrl).toString()` | Handles relative paths, query strings, protocol-relative URLs correctly |
| Exponential backoff | Custom timer/counter | Inline `1000 * Math.pow(2, attempt - 1)` | Simple enough inline; no need for a backoff library |

---

## Common Pitfalls

### Pitfall 1: Raw HTML Lost Before JSON-LD Extraction

**What goes wrong:** Current `fetchAndPreprocess` calls `$('script, style, ...').remove()` before returning text. If `rawHtml` capture is added after this cheerio mutation, the JSON-LD `<script>` blocks are already gone.

**Why it happens:** The `html` variable is mutated in place by cheerio's `.remove()` calls. Developers assume `rawHtml` can be captured after the load-and-strip step.

**How to avoid:** Capture `rawHtml = html` immediately after `response.text()` and before `cheerio.load(html)` mutation. The `rawHtml` variable stores the unmutated string.

**Warning signs:** `extractJsonLdEvents(rawHtml)` always returns `[]` even on known JSON-LD pages.

### Pitfall 2: Multi-Page Text Exceeds 15,000 Char Limit Without Accumulation Logic

**What goes wrong:** Naive concatenation of pages produces text that's exactly 15,000 chars from page 1 alone, discarding all page 2+ content.

**Why it happens:** If page 1 already fills the budget, `slice(0, 15_000)` applied per-page means pages 2+ contribute nothing.

**How to avoid:** Accumulate all pages into `allText`, then apply `slice(0, 15_000)` once at the end. This ensures page 2 events contribute to the Gemini input when page 1 was sparse.

**Warning signs:** Multi-page fetch with `max_pages = 2` shows no improvement in extracted event count for venues with sparse page 1 listings.

### Pitfall 3: Vercel Timeout With Multi-Page Enabled Across All Sources

**What goes wrong:** Enabling `max_pages = 3` on all 26 sources triples the fetch time for each, pushing the total run from ~110s to ~220s, breaching the 60s function default (or 300s Fluid Compute limit if multiple Gemini calls each take 4s).

**Why it happens:** Developers set `max_pages = 3` globally when deploying, not per-source.

**How to avoid:** Default `max_pages = 1` in the schema (`default(1)`). Only increase `max_pages` for specific sources known to have pagination (manually inspected). The hard cap at 3 is a safety net, not a default setting.

**Warning signs:** `consecutive_failures` suddenly increases for many sources after enabling multi-page; cron logs show `FUNCTION_INVOCATION_TIMEOUT`.

### Pitfall 4: `fetchWithRetry` Retries Non-Transient Errors

**What goes wrong:** A 404 (page gone) or 403 (bot blocked permanently) gets retried 2× with delays, wasting 3+ seconds and masking the real problem.

**Why it happens:** Retry logic applies to all non-2xx responses without distinguishing transient from permanent failures.

**How to avoid:** Only retry on 429 (rate limited), 503 (temporarily unavailable), and network errors (timeout, ECONNRESET). Immediately throw on 4xx (except 429) and 5xx that aren't 503.

**Warning signs:** Sources that are bot-blocked (403) still take 15+ seconds per scrape run because of retry delays.

### Pitfall 5: Domain Rate Limit Map Lives Inside Function Scope

**What goes wrong:** If `domainLastRequest` is instantiated inside `fetchAndPreprocess` or another per-call scope, it resets on every invocation, providing no rate limiting across sources.

**Why it happens:** Developers scope the Map to the function to avoid module-level state.

**How to avoid:** Declare `domainLastRequest` at module level in `fetcher.ts`. Module-level state in Node.js serverless functions persists within a single invocation (the full cron run), which is the scope needed.

**Warning signs:** Multiple requests to the same domain arrive simultaneously in server logs despite rate limiting code being present.

### Pitfall 6: Callers of `fetchAndPreprocess` Not Updated for New Return Type

**What goes wrong:** Changing `fetchAndPreprocess` from `Promise<string>` to `Promise<{ text: string; rawHtml: string }>` breaks all existing callers that expect a string.

**Why it happens:** TypeScript will catch this at compile time, but only if `tsconfig` is strict. If the test suite doesn't cover the orchestrator call path, the breakage may not surface until runtime.

**How to avoid:** Search all imports of `fetchAndPreprocess` before changing the signature. In this codebase: only `orchestrator.ts` calls it. Update the destructuring (`const { text, rawHtml } = await fetchAndPreprocess(...)`) in the same commit as the signature change. The test for `fetcher.ts` will also need updating.

**Warning signs:** TypeScript compile error `Property 'text' does not exist on type 'string'` — actually a helpful failure mode; treat as a checklist item.

---

## Code Examples

### Schema Migration (Drizzle)

```typescript
// src/lib/db/schema.ts — add to scrape_sources table
max_pages: integer('max_pages').notNull().default(1),
```

Generate migration: `npx drizzle-kit generate` then push: `npx drizzle-kit migrate`.

Default of `1` means all existing 26 sources retain single-page behavior until explicitly updated.

### JSON-LD Field Mapping

Required schema.org Event fields (per Google Search Central docs):
- `name` — event title (maps to `performer` field in `ExtractedEvent`)
- `startDate` — ISO-8601 datetime (maps to `event_date` and `event_time`)
- `location` — Place with address

Optional but useful:
- `offers.price` / `offers.url` — maps to `price` and `ticket_link`
- `description` — maps to `description`
- `image` — maps to `cover_image_url`

```typescript
function mapSchemaOrgEvent(item: Record<string, unknown>): ExtractedEvent {
  const startDate = String(item.startDate ?? '');
  return {
    performer: extractName(item.performer ?? item.name),
    event_date: startDate.slice(0, 10) || null,          // YYYY-MM-DD
    event_time: startDate.length > 10                     // HH:MM if datetime
      ? new Date(startDate).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
      : null,
    price: extractPrice(item.offers),
    ticket_link: extractUrl(item.offers ?? item.url),
    description: String(item.description ?? '').slice(0, 500) || null,
    cover_image_url: extractImageUrl(item.image),
    confidence: 1.0,        // structured data is authoritative
    event_category: 'other', // schema.org eventType rarely maps to 8-category enum cleanly
  };
}
```

### Orchestrator Inter-Source HTTP Throttle

```typescript
// orchestrator.ts — after venue_website source completes (success or failure)
const HTTP_THROTTLE_MS = parseInt(process.env.HTTP_THROTTLE_MS ?? '1000', 10);

// At end of for loop, before moving to next source:
if (source.source_type === 'venue_website' && HTTP_THROTTLE_MS > 0) {
  await delay(HTTP_THROTTLE_MS);
}
```

This is separate from the per-domain rate limit in `fetcher.ts`. The orchestrator-level delay applies between source iterations; the fetcher-level rate limit applies between individual HTTP requests (including within pagination).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-page fetch only | Multi-page loop with `rel="next"` following | Phase 14 | Events on pages 2-3 now captured |
| No HTTP throttle (AI throttle only) | Per-domain `Map<domain, lastRequestTime>` + inter-source `HTTP_THROTTLE_MS` | Phase 14 | Prevents 429 responses from venue sites |
| No retry on transient failure | `fetchWithRetry` with exponential backoff | Phase 14 | Transient failures (429/503/network) auto-recover |
| All pages → Gemini | JSON-LD pre-pass → Gemini only if needed | Phase 14 | Reduces Gemini calls; confidence = 1.0 for structured data |

---

## Open Questions

1. **JSON-LD coverage among the 26 existing sources**
   - What we know: General structured data adoption is < 20% for small venues; expected 3–6 of 26 sources have it
   - What's unclear: Which specific sources have it — not audited yet
   - Recommendation: During Wave 0 or as first implementation step, run `curl -s {url} | grep 'application/ld+json'` on each of the 26 source URLs. If 0–2 have JSON-LD, the feature still ships (zero-cost no-op for those) but the Gemini call reduction will be minimal.

2. **Per-page text budget with multi-page accumulation**
   - What we know: Current limit is 15,000 chars; Gemini handles this fine
   - What's unclear: Whether 15,000 chars for 3-page accumulation is too tight (page 1 alone might hit it)
   - Recommendation: Keep the 15,000 char cap but accumulate across pages before slicing. If page 1 has sparse content (e.g., 3,000 chars), page 2 content adds up to the budget. If page 1 already fills it, the cap naturally excludes pages 2+, which is acceptable.

3. **Retry-After header handling**
   - What we know: Some servers send `Retry-After: 30` on 429; honoring it is correct but adds 30s to one source
   - What's unclear: Whether any of the 26 existing venue sources actually use Retry-After
   - Recommendation: Implement Retry-After parsing in `fetchWithRetry` but cap honored wait at 10s to avoid blowing the function timeout. Log a warning if Retry-After exceeds 10s and fall back to exponential backoff instead.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest with ts-jest (confirmed via `jest.config.ts`) |
| Config file | `/Users/brad/Apps/eastcoastlocal/jest.config.ts` |
| Quick run command | `npx jest src/lib/scraper/fetcher.test.ts src/lib/scraper/json-ld.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRP-01 | Multi-page: follows `rel="next"` and fetches page 2 | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "multi-page" --no-coverage` | Wave 0 |
| SCRP-01 | Multi-page: hard cap at 3 even if `max_pages = 5` | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "hard cap" --no-coverage` | Wave 0 |
| SCRP-01 | Multi-page: stops when no `rel="next"` link found | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "stops at last page" --no-coverage` | Wave 0 |
| SCRP-01 | `max_pages = 1` (default) fetches single page | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "single page default" --no-coverage` | ✅ (existing behavior; test update needed for new return type) |
| SCRP-02 | Per-domain delay: two requests to same domain are separated by >= 2s | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "rate limit" --no-coverage` | Wave 0 |
| SCRP-02 | Per-domain delay: requests to different domains are NOT serialized | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "different domains" --no-coverage` | Wave 0 |
| SCRP-03 | Retry on 429: second attempt succeeds, no error thrown | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "retry 429" --no-coverage` | Wave 0 |
| SCRP-03 | Retry on 503: second attempt succeeds | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "retry 503" --no-coverage` | Wave 0 |
| SCRP-03 | No retry on 404: error thrown immediately | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "no retry 404" --no-coverage` | Wave 0 |
| SCRP-03 | Exhausted retries: original error propagated | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "exhausted retries" --no-coverage` | Wave 0 |
| PLAT-04 | JSON-LD: parses single Event block → returns ExtractedEvent[] | unit | `npx jest src/lib/scraper/json-ld.test.ts -t "single event" --no-coverage` | Wave 0 |
| PLAT-04 | JSON-LD: parses multiple Event blocks from one script tag | unit | `npx jest src/lib/scraper/json-ld.test.ts -t "multiple events" --no-coverage` | Wave 0 |
| PLAT-04 | JSON-LD: returns [] when no Event type blocks present | unit | `npx jest src/lib/scraper/json-ld.test.ts -t "no events" --no-coverage` | Wave 0 |
| PLAT-04 | JSON-LD: sets confidence = 1.0 on all extracted events | unit | `npx jest src/lib/scraper/json-ld.test.ts -t "confidence" --no-coverage` | Wave 0 |
| PLAT-04 | JSON-LD: malformed JSON-LD block does not throw, returns [] | unit | `npx jest src/lib/scraper/json-ld.test.ts -t "malformed" --no-coverage` | Wave 0 |
| PLAT-04 | `rawHtml` returned by fetcher contains script tags (not stripped) | unit | `npx jest src/lib/scraper/fetcher.test.ts -t "rawHtml preserves scripts" --no-coverage` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest src/lib/scraper/fetcher.test.ts src/lib/scraper/json-ld.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/scraper/fetcher.test.ts` — existing file must be updated to: (a) expect `{ text, rawHtml }` return type, (b) cover multi-page pagination, (c) cover per-domain rate limiting, (d) cover retry/backoff. Existing single-page tests remain valid with `{ text }` destructuring.
- [ ] `src/lib/scraper/json-ld.test.ts` — new file; covers PLAT-04 extraction logic
- [ ] Drizzle migration file — `max_pages` column on `scrape_sources` (generated via `npx drizzle-kit generate`, verified with `npx drizzle-kit migrate`)

No new test framework installation needed — Jest + ts-jest already configured.

---

## Sources

### Primary (HIGH confidence)

- East Coast Local codebase direct inspection — `/src/lib/scraper/fetcher.ts`, `/src/lib/scraper/orchestrator.ts`, `/src/lib/scraper/extractor.ts`, `/src/lib/scraper/normalizer.ts`, `/src/lib/db/schema.ts`, `jest.config.ts` (2026-03-15)
- `.planning/research/ARCHITECTURE.md` — Phase 14 integration design section, verified code-level patterns for rate limiting, retry, multi-page, JSON-LD (2026-03-15)
- `.planning/research/SUMMARY.md` — v1.4 decisions and pitfall catalog (2026-03-15)
- Google Event structured data — developers.google.com/search/docs/appearance/structured-data/event (verified 2026-03-15 per SUMMARY.md) — required/optional JSON-LD properties
- schema.org/Event — full property schema for JSON-LD field mapping

### Secondary (MEDIUM confidence)

- Web scraping pagination patterns (ScrapingAnt blog) — `rel="next"`, `aria-label*="next"` selectors for next-page detection
- Exponential backoff for scraping (TheWebScraping.club Substack) — 2-retry, 1s/2s delay pattern; Retry-After header handling

### Tertiary (LOW confidence / needs runtime validation)

- **JSON-LD adoption count among the 26 sources** — Expected 3–6 based on general structured data adoption research; not verified by auditing actual source URLs. Audit recommended before sizing implementation effort.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in production; no new deps
- Architecture: HIGH — direct codebase inspection confirms extension points; code-level patterns verified in ARCHITECTURE.md
- Pitfalls: HIGH — empirically grounded in existing research + direct code inspection (raw HTML stripping issue found by reading `fetcher.ts` line 28)
- Validation: HIGH — Jest/ts-jest confirmed installed and configured; existing `fetcher.test.ts` confirms test pattern for this module

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable dependencies; no fast-moving ecosystem concerns for this phase)
