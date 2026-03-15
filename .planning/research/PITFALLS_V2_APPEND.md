
---

## v2.0 — Mass Venue Discovery: Google Maps Places API, Reddit Mining, Bulk Scaling

### Pitfall 1 (v2.0): Scrape Cron Blows the 60-Second Wall at Scale

**What goes wrong:**
`runScrapeJob()` is a single sequential loop over all enabled `scrape_sources`. At 26 sources with a 4000ms AI throttle per Gemini call plus a 1000ms HTTP throttle, worst-case runtime is already ~130 seconds — above the Vercel Hobby 60s limit. Adding dozens of auto-approved venues from Places API makes this catastrophic. The cron will time out silently: Vercel kills the function mid-run, `last_scrape_status` never updates for unprocessed sources, and the operator has no idea which venues were skipped. Vercel logs show a success response (the HTTP wrapper returned) but the scrape never completed.

**Why it happens:**
The loop was designed for ~26 curated venues monitored manually. The 4s AI throttle alone means 200 venues = 800+ seconds just in sleeps before counting HTTP fetch time or DB writes.

**How to avoid:**
Restructure as a **paginated cursor job**: `ORDER BY last_scraped_at ASC NULLS FIRST LIMIT 10` naturally prioritizes stalest sources. Each invocation processes a bounded batch and exits. Alternatively — and preferably — upgrade to Vercel Pro (300s timeout) before scaling venue count. Paginated cursor on Hobby means 200 sources takes 20+ days per full cycle, which is too slow for a daily events app.

**Warning signs:**
- `last_scraped_at` frozen for sources added after a certain point in the source list
- Vercel function duration metric consistently at 58–60s
- Many sources retain `last_scrape_status = 'pending'` for days despite cron "succeeding"

**Phase to address:**
The first phase that adds bulk venue auto-approval — before any Places API results are promoted to active scraping.

---

### Pitfall 2 (v2.0): Google Maps Places API Unexpected Cost Spike

**What goes wrong:**
The Google Maps Places API (New) bills per-request AND per-field-mask. A naive discovery loop making `Text Search` or `Nearby Search` requests per city per venue type across 4 provinces can issue hundreds of calls per run. If Place Details are also fetched for website/address (additional billed fields), costs multiply. The real risk is a bug causing a retry loop, or missing deduplication causing the same city×type query to fire on every weekly run.

**Why it happens:**
Developers treat Places API like a free internal database query. The current geocoder is paid per-request but called once per venue on first scrape. Discovery queries are wider and designed to run repeatedly — the careless pattern is re-running the same queries on every job without caching which places have already been seen.

**How to avoid:**
- Always specify an explicit `fields` parameter: `id,displayName,websiteUri,formattedAddress,location` only. Do NOT request `openingHours`, `reviews`, `photos` — these are billed at higher rates under the New API field-mask pricing model.
- Store `place_id` from the Places API response in `discovered_sources` (add a `place_id` column or store in `raw_context`). Skip any `place_id` already in the table on subsequent runs.
- Set a hard monthly billing cap in Google Cloud Console ($10–$20/month) before the first production run. An alert is not sufficient — set a hard stop.
- Rate-limit the discovery loop deliberately (500ms between requests) to prevent accidental burst billing.

**Warning signs:**
- Google Cloud billing alert fires
- `discovered_sources` growing at multiples of expected rate per run
- Same venue names appearing across multiple discovery runs (missing `place_id` dedup)

**Phase to address:**
The phase implementing Google Maps Places API discovery — billing cap and field mask must be configured before the first production run.

---

### Pitfall 3 (v2.0): Auto-Approval Flooding the Scrape Queue with Junk Venues

**What goes wrong:**
The current `scoreCandidate()` in `discovery-orchestrator.ts` gives 0.90 to any URL with a city, province, source name, and HTTPS — the minimum bar for auto-approval under the 0.8 threshold. This scoring was calibrated for Gemini-grounded Google Search results where the LLM pre-filters for venues that explicitly host public events. Google Maps Places API returns a much wider category of businesses: every bar, restaurant, hotel, and private event space in Atlantic Canada will score 0.90 and auto-approve, flooding `scrape_sources` with hundreds of venues that have no events pages.

**Why it happens:**
The scoring model was designed for a Gemini discovery source that already does semantic filtering. Places API returns anything matching the search keyword — the filtering burden shifts from the discovery model to the scoring model, which was never updated to handle it.

**How to avoid:**
- Auto-approval scoring must be source-aware. Add a `discovery_method` branch in scoring: for `places_api` candidates, require additional signals — e.g., website URL contains `/events`, `/shows`, `/calendar`, or `/tickets`. Score these paths positively; score social media domains negatively.
- Raise `AUTO_APPROVE_THRESHOLD` to 0.95 for Places API sources, or disable auto-approval entirely for this source type during initial rollout.
- Consider a two-stage auto-approval: stage all Places API results as `pending`, run a lightweight Gemini validation pass ("Does this website appear to have a public events calendar? YES or NO") before promoting.
- The `discovery_method` column already exists in `discovered_sources` — use it to branch scoring logic.

**Warning signs:**
- `scrape_sources` growing by 50+ entries per discovery run
- `avg_confidence` and `last_event_count` both near 0 for recently-added sources
- `consecutive_failures` rising across newly-added sources immediately after creation

**Phase to address:**
The phase implementing Places API discovery — scoring calibration must be completed and tested before any auto-approval runs against Places API data.

---

### Pitfall 4 (v2.0): Venue Dedup Becomes an Inline Timeout Risk During Bulk Import

**What goes wrong:**
`scoreVenueCandidate()` is fast in isolation. The problem is at bulk-import scale: if Places API returns 100 new venue candidates in one discovery run, and each candidate is compared against all existing venues before promotion, that is 100 × 300 = 30,000 comparisons inline inside the already timeout-pressured cron. The current `promoteSource()` does NOT run any dedup check at all — it inserts a new venue row unconditionally. Multiple auto-approved candidates for the same physical venue will each create their own `venues` row.

**Why it happens:**
The dedup model was built for incremental Ticketmaster merges (1–2 new venues per scrape). `promoteSource()` assumes the human review step catches duplicates. With aggressive auto-approval and a bulk import source, this assumption breaks immediately.

**How to avoid:**
- Pre-fetch all existing venues once at the start of the discovery run (single query, in-memory), then compare all incoming candidates against the in-memory list. Avoid per-candidate DB round-trips.
- Add a dedup check inside `promoteSource()`: before inserting a new venue row, run `scoreVenueCandidate()` against existing venues in the same city. If the result is `merge` or `review`, do NOT create a new row — set `discovered_sources.status = 'duplicate_pending_review'` and log to `venueMergeCandidates`.
- For the initial bulk import, consider running dedup as a post-import batch step rather than inline — import all candidates first, then run a dedicated dedup pass.

**Warning signs:**
- Discovery cron timeout on runs that previously completed in under 30s
- Two venue rows in the same city with similar names in admin /venues
- `venueMergeCandidates` queue growing faster than admin can review

**Phase to address:**
Before the first bulk import from Places API — dedup architecture must be validated for batch-scale inputs, and `promoteSource()` must include a dedup guard.

---

### Pitfall 5 (v2.0): Neon Connection Behavior Under Simultaneous Cron Invocations

**What goes wrong:**
Vercel cron jobs can overlap if a previous invocation has not returned when the next schedule fires. With a 60s timeout and potentially 55–60s runtime, even a five-minute cron schedule creates overlap risk. The `neon-http` driver (correctly used in this codebase) is connection-less and avoids traditional Postgres connection pool exhaustion — but overlapping long-running query bursts can spike Neon's compute unit usage and trigger cold-start latency mid-run, causing unpredictable timeouts at arbitrary points in the scrape loop.

**Why it happens:**
Vercel does not enforce mutual exclusion on cron invocations. It fires on the schedule regardless of whether the previous invocation is still running.

**How to avoid:**
- Stagger cron schedules: scrape at `0 6 * * *`, discover at `0 8 * * *`. Never schedule two heavy crons within 60 minutes of each other.
- Implement a lightweight advisory lock: at the start of `runScrapeJob()`, attempt to upsert a `cron_locks` table row with `ON CONFLICT DO NOTHING`, bail out immediately if the insert fails. Delete the lock on completion; add a 90-minute TTL for crash recovery.
- Do NOT switch from `drizzle-orm/neon-http` to the WebSocket-mode Neon driver — HTTP is correct for Vercel serverless. WebSocket requires persistent connections.

**Warning signs:**
- Neon compute unit alerts firing mid-day (should not happen with daily crons unless there is overlap)
- Cron logs showing two discovery jobs starting within minutes of each other
- "Connection timeout" errors appearing during cron runs

**Phase to address:**
Before increasing cron frequency or adding any new cron routes — schedule staggering is a pre-requisite.

---

### Pitfall 6 (v2.0): Reddit Mining Produces Hallucinated Venue URLs

**What goes wrong:**
Reddit threads mention venue names without canonical URLs. When Gemini mines `r/halifax` or `r/fredericton` threads, it may invent URLs for venues it recognizes from training data — producing valid-looking but wrong URLs (e.g. `https://thesomethingbar.com` when the real site is `https://thesomethingpub.ca`). These hallucinated URLs score well under `scoreCandidate()` (they have city, province, name, HTTPS) and will auto-approve. The resulting `scrape_sources` entry will 404 immediately, burning `consecutive_failures`.

**Why it happens:**
Gemini is asked to produce structured output (URL + name + location) from unstructured text that may contain no URL at all. The existing Gemini + Google Search grounding in `discovery-orchestrator.ts` mitigates this because Google Search results provide real URLs as grounding documents. Reddit mining without search grounding is fundamentally different: the input is user-written text, not search result snippets with verified URLs.

**How to avoid:**
- Include a mandatory constraint in the Gemini prompt: "Only include a URL if it appears verbatim in the post or comments. Do not infer, construct, or guess URLs."
- After Gemini returns Reddit-sourced candidates, verify each URL with a lightweight HTTP HEAD request before staging. A URL returning 404, 5xx, or connection refused should be rejected immediately.
- Set `AUTO_APPROVE_THRESHOLD` to 1.1 (effectively disabled) for `discovery_method = 'reddit_mining'` — all Reddit-sourced candidates require manual admin review.
- Treat Reddit mining as "venue name extraction" phase, not "URL discovery" phase: extract venue names from Reddit, then use Places API or Google Search to find the canonical URL separately.

**Warning signs:**
- High 404 rate on newly-staged Reddit-sourced URLs in the discovery review queue
- `consecutive_failures` jumping to 3+ immediately after creation for Reddit-sourced sources
- Venue name in DB does not match any content found at the promoted URL

**Phase to address:**
The phase implementing Reddit mining — URL verification must be in the pipeline before staging, and auto-approval must be disabled for this source type.

---

### Pitfall 7 (v2.0): promoteSource() Creates Duplicate Venues Without a Dedup Check

**What goes wrong:**
`promoteSource()` inserts a new venue row unconditionally. It does not check whether a venue with matching name and city already exists in the `venues` table. If the same venue is discovered by both Google Maps Places API and Reddit mining across two separate discovery runs, and both candidates auto-approve, two separate venue rows are created for the same physical location. Events accumulate against different venue IDs. The map shows two pins within meters of each other for the same bar.

**Why it happens:**
With 26 curated venues and human review, duplicate promotion was effectively impossible. With multiple automated discovery sources (Gemini, Places API, Reddit) running on different schedules, the same venue will be discovered multiple times. The URL-level dedup in `discovered_sources` (unique on `url`) prevents the same URL being staged twice, but does NOT prevent two differently-URLed entries for the same physical venue.

**How to avoid:**
- Add a pre-promotion dedup check to `promoteSource()`: query `venues` filtered by `city = staged.city`, run `scoreVenueCandidate()` against the results, and if any comparison returns `merge` or `review`, do NOT insert a new venue row. Set `discovered_sources.status = 'duplicate_pending_review'` and insert a `venueMergeCandidates` row pointing to the existing venue.
- The `discovered_sources.domain` field prevents duplicate URL staging — but domain dedup alone is insufficient for multi-source discovery.

**Warning signs:**
- `venues` table growing faster than `discovered_sources` approvals
- Admin sees two adjacent map pins for known single-venue locations
- `venueMergeCandidates` growing at a rate proportional to discovery volume

**Phase to address:**
The phase wiring auto-approval into `promoteSource()` — the dedup guard must be in place before any bulk auto-promotion runs.

---

## v2.0 — Technical Debt Patterns (additions)

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sequential scrape loop with sleeps | Simple to reason about | Times out at scale; silent partial-runs with no recovery | Never for >50 sources — must be replaced before v2.0 bulk venue add |
| scoreCandidate() ignoring discovery_method | Single function | Calibrated for Gemini grounding only; false-positives on Places API data | Never once Places API is a discovery source |
| promoteSource() skipping dedup check | Promotion logic stays simple | Duplicate venues at scale corrupt the map and event data | Acceptable with manual-review-only; unacceptable with auto-approval |
| place_id stored as JSON in raw_context TEXT | No schema migration needed | Cannot be indexed; makes dedup queries expensive | Acceptable for MVP; add structured column before bulk re-discovery |
| Auto-approval threshold as single env var | One tunable parameter | Cannot calibrate differently for Places API vs. Gemini discovery | Never once multiple discovery sources exist |

---

## v2.0 — Integration Gotchas (additions)

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Maps Places API (New) | Fetching all fields with no field mask | Always specify explicit `fields` — `id,displayName,websiteUri,formattedAddress,location` only; New API bills per-field |
| Google Maps Places API (New) | Using Legacy Places API endpoints (`maps/api/place/nearbysearch/json`) | Use New Places API (`places/v1/places:searchNearby`) — legacy is in maintenance mode |
| Google Maps Places API (New) | Re-querying same city/type combination on every discovery run | Cache results by `place_id`; skip any `place_id` already in `discovered_sources` |
| Google Maps Places API (New) | Treating Places API coordinates as geocode-quality location data | Places API `location` is sufficient for dedup proximity check; re-geocode final venue address via existing `geocodeAddress()` |
| Reddit API | Fetching Reddit HTML directly via `fetch()` | Reddit blocks server-side HTML scraping; use the JSON API (`reddit.com/r/subreddit/new.json`) or official Reddit API OAuth2 |
| Reddit API | Not handling 429 Retry-After | Reddit enforces rate limits strictly; 429 includes `Retry-After` header; must be respected |
| Gemini for Reddit mining | Expecting model to cite real URLs from user-generated text | Reddit posts rarely contain venue URLs; treat as name/location extraction; verify URLs separately |
| Vercel Cron scheduling | Running scrape and discover on same schedule | Stagger by at least 60 minutes to prevent simultaneous DB load and rate limit contention |

---

## v2.0 — Performance Traps (additions)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential scrape loop with no batching | Cron times out; last N sources never scraped | Cursor-based batching: `ORDER BY last_scraped_at ASC NULLS FIRST LIMIT 10` | ~50 sources on Hobby (60s); ~150 on Pro (300s) |
| Per-candidate venue dedup DB query (load all venues for each) | Discovery cron slow; latency grows with venue count | Pre-fetch all venues once before loop; compare in-memory | ~100 venues |
| Bulk auto-approving 100+ venues in a single discovery run | Scrape queue balloons; next cron run times out immediately | Rate-limit auto-approvals per run (e.g. max 20 per discovery job) | First bulk Places API run |
| knownDomains Set rebuilt from full DB scan each discovery run | Discovery startup latency grows | Acceptable up to ~10k rows; index `discovered_sources.domain` if needed | ~10,000 discovered_sources rows |

---

## v2.0 — "Looks Done But Isn't" Checklist (additions)

- [ ] **Places API field mask**: Confirmed only `id,displayName,websiteUri,formattedAddress,location` requested — not wildcard or default field set
- [ ] **place_id dedup**: A venue returned by two different Places API queries (e.g. "bars in Halifax" and "concert venues in Halifax") creates only one `discovered_sources` row
- [ ] **Auto-approval per source type**: `AUTO_APPROVE_THRESHOLD` or equivalent logic is source-type-aware; Places API candidates do not auto-approve at the same threshold as Gemini-grounded results
- [ ] **promoteSource() dedup guard**: Two candidates for the same physical venue → second promotion returns `duplicate_pending_review`, not a new venue row
- [ ] **Reddit URL verification**: HTTP HEAD check confirmed in pipeline before staging; 0 hallucinated URLs in staging run
- [ ] **Auto-approval disabled for reddit_mining**: `discovered_sources` with `discovery_method = 'reddit_mining'` never auto-approve — confirmed in discovery orchestrator logic
- [ ] **Google Cloud billing cap**: Hard monthly cap confirmed in Google Cloud Console before first test Places API request
- [ ] **Cron schedules non-overlapping**: Scrape and discover cron schedules verified staggered by 60+ min in `vercel.json`
- [ ] **Scrape timing at scale**: Benchmarked with 100 mock sources; confirmed cursor or batch limit prevents timeout

---

## v2.0 — Recovery Strategies (additions)

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Scrape cron silent partial runs | MEDIUM | Query `scrape_sources` for `last_scraped_at` outliers; add cursor pagination before re-enabling auto-approval |
| Google Cloud billing spike | LOW–HIGH (depends on spend cap) | Set spend cap immediately; audit `discovered_sources` for runaway insertion loop; disable Places API key until root cause found |
| Flood of junk auto-approved venues | MEDIUM | Bulk-disable all `scrape_sources` added in the offending time window; delete corresponding `venues` rows; recalibrate scoring threshold |
| Duplicate venue rows from parallel discovery | MEDIUM | Run dedup pass across all venues in same city using `scoreVenueCandidate()`; queue borderline cases for admin merge review |
| Reddit-sourced hallucinated URLs | LOW | Run HTTP HEAD check against all `discovery_method = 'reddit_mining'` entries; bulk-reject entries returning 404/timeout |
| Neon connection overlap | LOW | Kill overlapping invocations; stagger schedules; add advisory lock |

---

## v2.0 — Pitfall-to-Phase Mapping (additions)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Scrape cron 60s timeout at scale | Phase: Scrape execution refactor (before bulk venue add) | Benchmark with 100 mock sources; cursor or batch limit confirmed |
| Google Maps Places API cost spike | Phase: Places API discovery implementation | Billing cap set; field mask verified; place_id dedup tested end-to-end |
| Auto-approval flooding scrape queue | Phase: Places API scoring calibration | Auto-approval disabled or threshold raised for places_api; scrape failure rate monitored after first run |
| Venue dedup at bulk-import scale | Phase: Bulk import architecture | In-memory dedup pre-fetch confirmed; promoteSource() dedup guard unit-tested |
| Neon connection overlap | Phase: Cron scheduling | Cron schedules staggered 60+ min; Neon dashboard shows no concurrent compute spikes |
| Reddit URL hallucination | Phase: Reddit mining implementation | HTTP HEAD verification confirmed in pipeline; auto-approval disabled for reddit_mining |
| promoteSource() duplicate venues | Phase: Auto-approval pipeline wiring | Unit test: two candidates for same physical venue → second returns duplicate_pending_review |
| Google Cloud billing without spend cap | Pre-requisite before ANY paid API call in v2.0 | Hard monthly cap confirmed in Google Cloud Console |

---

**v2.0 Sources:**
- Codebase analysis: `orchestrator.ts` (sequential loop, AI_THROTTLE_MS=4000ms, HTTP_THROTTLE_MS=1000ms), `discovery-orchestrator.ts` (scoreCandidate scoring model, AUTO_APPROVE_THRESHOLD=0.8), `venue-dedup.ts` (two-signal gate, MERGE_GEO_METERS=100), `promote-source.ts` (unconditional venue insert), `geocoder.ts` (APPROXIMATE precision rejection)
- Schema analysis: `schema.ts` (`discovered_sources.discovery_method`, `venueMergeCandidates`, event dedup uniqueIndex), `client.ts` (neon-http driver confirmed)
- Platform constraints: Vercel Hobby 60s `maxDuration` (confirmed in `/src/app/api/cron/scrape/route.ts` and `discover/route.ts`); Neon HTTP driver; no persistent processes
- Google Maps Places API (New): field-mask billing — `id,displayName,websiteUri,formattedAddress,location` = Basic Data tier; `openingHours`, `reviews` = Advanced/Preferred tiers billed separately
- Reddit API: JSON API available at `reddit.com/r/[subreddit]/new.json`; 429 Retry-After enforcement; HTML scraping blocked server-side
- Gemini structured output behavior: `Output.object` without Google Search grounding produces hallucinated values for fields not present in source text; grounding with search results mitigates URL hallucination

---
*v2.0 pitfalls added: 2026-03-15 — mass venue discovery, Google Maps Places API, Reddit mining, bulk scaling on Vercel Hobby + Neon Postgres*
