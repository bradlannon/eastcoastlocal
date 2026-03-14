# Pitfalls Research

**Domain:** Local events discovery app with AI-powered web scraping (Atlantic Canada live music)
**Researched:** 2026-03-13
**Confidence:** HIGH (scraping/LLM pitfalls), MEDIUM (geocoding accuracy for Atlantic Canada specifically), HIGH (map performance)

---

## Critical Pitfalls

### Pitfall 1: Chromium Binary Blows Vercel's Function Size Limit

**What goes wrong:**
Playwright and Puppeteer require a Chromium binary (~280MB) to run. Vercel's serverless function size limit is 50MB. Deploying headless-browser scraping directly inside a Vercel function fails silently or outright at deploy time. This isn't discovered until you actually try to ship the scraper.

**Why it happens:**
Developers assume "deploy to Vercel" means the whole scraping stack can live there. The 50MB limit applies to the zipped function bundle, and Chromium's binary alone is 5× that limit. The error is not obvious until deployment or runtime.

**How to avoid:**
Choose one of two patterns early:
- Use `@sparticuz/chromium` (a Chromium build optimized for Lambda/Vercel, ~40MB compressed) — viable but tight and fragile across Vercel runtime updates.
- Or decouple scraping from Vercel entirely. Run the scraper on a separate scheduled process (GitHub Actions, Fly.io worker, Railway) and only store results in the database. The Vercel app reads from DB, never runs Chromium. This is the cleaner long-term architecture.

The decoupled approach also avoids Vercel's 10-second default timeout for hobby plans (extendable to 800s on Pro, but still a constraint for multi-source scraping runs).

**Warning signs:**
- Build error mentioning function size exceeded at deploy
- `FUNCTION_INVOCATION_TIMEOUT` errors during scrape runs
- Scrape jobs that work locally but silently do nothing in production

**Phase to address:**
Infrastructure/scraping phase (Phase 1 or 2). Lock in the execution environment before writing any scraper logic.

---

### Pitfall 2: LLM Extracts "Structured" Output but Hallucinates Dates and Times

**What goes wrong:**
The LLM returns valid JSON that passes schema validation but contains fabricated dates (e.g., guessing a start time not present on the page, constructing a date from context clues that is wrong). Events appear in the database with plausible-looking but incorrect times. Users show up at the wrong time.

**Why it happens:**
Structured output (JSON mode) constrains format, not factual accuracy. LLMs fill in missing fields rather than returning null when instructed to extract "all event details." A page that says "doors open 8pm, show starts 9pm" might have the LLM invent the date if it's listed elsewhere on the page but not in the direct event block.

**How to avoid:**
- In the extraction prompt, explicitly instruct: "If a field is not clearly present on this page, return null — do not infer or guess."
- Use schema with all date/time fields as nullable strings, not required fields.
- Post-process extracted data: reject any event where date is null; log for manual review rather than silently dropping.
- Add a sanity check: extracted event date must be in the future (relative to scrape time) and within 90 days — flag anything outside this range.
- Prefer models with strong instruction-following for structured extraction (Claude Haiku or GPT-4o-mini are good cost/accuracy tradeoffs for this use case).

**Warning signs:**
- Events appearing with times like "8:00 PM" on pages that never mention a time
- Event dates clustering on specific days not matching the source site
- Same event appearing with different times across re-scrapes

**Phase to address:**
Scraping/extraction phase. Build validation into the extraction pipeline from day one; retrofitting is painful.

---

### Pitfall 3: Token Costs Scale Unexpectedly With Full HTML Input

**What goes wrong:**
Sending raw HTML to an LLM for event extraction is expensive. A single venue page with navigation, footers, ads, and sidebars can be 50,000–100,000 tokens. At Claude Haiku pricing ($0.80/1M input tokens), that's manageable per page — but across 50 venues scraped 3× per day, costs balloon quickly. If a scraper accidentally fetches paginated listings or iterates deeply, a single run can consume $5–20 in tokens.

**Why it happens:**
HTML is verbose. Developers test with a single page and extrapolate linearly, but venue websites often include embedded scripts, tracking pixels, inline styles, and megabytes of UI framework code in the initial HTML response.

**How to avoid:**
- Strip HTML to text/markdown before sending to LLM: remove `<script>`, `<style>`, nav, footer, and sidebar elements. A library like `mozilla/readability` or simple regex stripping reduces token count 10–25×.
- Target the specific section of the page known to contain events (e.g., main content div) if the source structure is consistent.
- Use prompt caching: prepend a static system prompt that stays cached across all scrape calls (Anthropic caches prompt prefixes, reducing cost 50–90% on the static portion).
- Set a hard per-page token budget in the prompt: "The text you receive will be under 5,000 tokens. If it exceeds this, the input was not properly preprocessed."
- Log token usage per scrape run from day one. Alert when a single run exceeds a threshold (e.g., $1).

**Warning signs:**
- LLM API costs rising faster than source count
- Token counts per page unexpectedly high (>10k tokens for a simple event listing)
- Scraper calls that take 20+ seconds (often sign of large context)

**Phase to address:**
Scraping/extraction phase. Design token-budget discipline into the first working scraper before adding more sources.

---

### Pitfall 4: Duplicate Events From Multiple Sources With No Deduplication

**What goes wrong:**
The same show appears in the database 3–5 times: once from the venue's own website, once from Eventbrite, once from Bandsintown, and potentially again from a regional events site. Users see repeated entries for the same event on the map and in the list. The map clusters become misleading (one venue shows "5 events" when it's really one show listed five times).

**Why it happens:**
Aggregating from multiple sources is the explicit goal, but deduplication is not automatic. Each source uses different identifiers, slightly different venue name spellings, and sometimes different event titles (e.g., "The Trews - Live!" vs. "The Trews").

**How to avoid:**
- Design a deduplication key at schema design time: composite of (normalized venue name, normalized event date, normalized artist/band name). Normalize means: lowercase, strip punctuation, trim whitespace.
- Before inserting a scraped event, query for existing records matching the dedup key. If found, update rather than insert.
- Track `source_url` per event — if the same event is ingested from three sources, store all source URLs but display only once.
- Fuzzy matching (Levenshtein distance on artist + venue + date) catches near-misses, but start simple with exact-match normalization — it catches 80% of duplicates with 10% of the complexity.

**Warning signs:**
- Map showing multiple pins at the exact same lat/lng
- Same artist appearing multiple times in the event list for the same date
- Database row count growing faster than expected source count × average events per source

**Phase to address:**
Data storage/schema phase. Deduplication logic must be in place before ingesting from a second source. Retrofitting deduplication onto an existing dataset is painful.

---

### Pitfall 5: Geocoding Venue Addresses Fails or Returns Wrong Location

**What goes wrong:**
Venue addresses in Atlantic Canada are geocoded incorrectly or not at all. Nominatim (OpenStreetMap's free geocoder) has limited coverage of small-town Maritime addresses. A venue in Moncton, NB might resolve to a street-level match; a rural venue in Lunenburg, NS might fail to resolve or snap to the wrong location. Users see events pinned in the wrong place — or not at all.

**Why it happens:**
- Nominatim's public API explicitly prohibits production use (no uptime guarantee, blocks at >1 req/sec).
- OSM data quality is lower in small cities and rural areas than in major urban centers.
- Venue address data scraped from websites is often messy: "123 Main St, upstairs" or "The Marquee Club, Halifax" without a proper civic address.

**How to avoid:**
- Use a geocoding service with Canadian address coverage and an SLA: Google Maps Geocoding API, Positionstack, or OpenCage (all have generous free tiers for low-volume use).
- Geocode at venue ingestion time, not at event ingestion time. Store lat/lng on the Venue record. Re-geocode only when the address changes.
- Implement a geocoding confidence threshold: if the geocoder returns low confidence, flag the venue for manual coordinate entry rather than using a bad guess.
- Allow manual lat/lng override in the venue configuration — small venues often have idiosyncratic addresses that automated geocoders struggle with.
- Cache geocoding results aggressively. With ~50–200 venues total in Atlantic Canada, geocode once and store.

**Warning signs:**
- Events pinned in wrong city or province
- Geocoder returning results with `partial_match: true` (Google) or confidence < 5 (OpenCage)
- Venues resolving to the center of a city rather than a specific address
- Geocoding API calls in logs for every scrape run (should only happen on new venues)

**Phase to address:**
Data storage/venue management phase. Set up the geocoding strategy before ingesting real venue data.

---

### Pitfall 6: Stale Events Accumulating and Cluttering the Map

**What goes wrong:**
Past events are never purged. The database fills with months of historical concerts. The map shows hundreds of pins for shows that happened weeks ago. Users see stale data and lose trust. Database queries slow down as the event table grows unbounded.

**Why it happens:**
Scraping adds events, but there is no deletion or expiry logic. Developers focus on ingestion, not cleanup. "We'll add cleanup later" never happens until it's a visible problem.

**How to avoid:**
- Events have a status lifecycle: `upcoming`, `past`, `cancelled`.
- Run a nightly cleanup job that marks events with dates in the past as `past` and excludes them from all public queries.
- Permanently delete events older than 90 days (or archive to a separate table if historical data is wanted later).
- The map and event list queries must always include `WHERE event_date >= NOW()` — make this the default filter in the data access layer, not optional.
- Add a `last_seen_at` timestamp to events. If a scrape runs and the event is no longer present on the source page, mark it as removed (don't show it).

**Warning signs:**
- Map showing events from previous weeks or months
- Public queries taking noticeably longer over time (full table scan on unindexed date column)
- Database growing faster than source-count × expected events per venue

**Phase to address:**
Data storage/schema phase. Add `event_date` index and nightly cleanup job at schema design time.

---

### Pitfall 7: Scraper Blocked by Anti-Bot Measures on Target Sites

**What goes wrong:**
Venue websites and event platforms (especially Eventbrite) detect the scraper as a bot and return Cloudflare challenge pages, CAPTCHAs, or empty responses. The scraper returns HTTP 200 with a Cloudflare HTML page instead of event data. The LLM tries to extract events from a "Please enable JavaScript" message and returns null or garbage. No error is raised.

**Why it happens:**
- Many venue websites run behind Cloudflare.
- Headless browsers without stealth configuration leak `navigator.webdriver = true`, triggering detection.
- Default user agents from HTTP clients (`python-requests/2.x`, Node fetch without headers) are instantly flagged.
- Scraping at fixed intervals with identical behavior patterns triggers behavioral detection.

**How to avoid:**
- For Eventbrite and Bandsintown: use their official APIs with proper OAuth tokens, not web scraping. They have documented APIs with rate limits (Eventbrite: 1000 calls/hour, Bandsintown: per-key limits).
- For venue websites: set realistic User-Agent headers, add jitter to request timing (random 1–5 second delays between requests), and check `robots.txt` before scraping each domain.
- After fetching any page, validate the response before sending to LLM: check that expected content indicators are present (event-related keywords, expected HTML structure). If not, log a "blocked" error and skip LLM call.
- Build a source health dashboard: if a source fails to return valid events for 3+ consecutive scrape runs, flag it for review.
- Do not use headless Chrome for sources that don't require JavaScript rendering — most venue websites render event listings in static HTML. Reserve headless browser for JS-rendered sites only.

**Warning signs:**
- Extracted event count drops to zero for a previously healthy source
- LLM returning empty arrays when the page "looks" valid
- Response bodies containing "Enable JavaScript", "Checking your browser", or "Just a moment"
- Response sizes dramatically smaller than expected (Cloudflare challenge pages are ~10KB vs a real event listing at 50–200KB)

**Phase to address:**
Scraping/extraction phase. Build response validation before the LLM call from day one.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Send raw HTML to LLM without preprocessing | Simpler pipeline, no preprocessing code | Token costs 10–25× higher; slower extraction | Never — always strip HTML before sending |
| Skip deduplication for first source | Faster to ship | Retroactively deduplicating a dirty DB is painful | Only for single-source MVP with explicit plan to add before source #2 |
| Use Nominatim public API for geocoding | Free, no API key | No uptime guarantee; will get rate-limited in production | Never in production — use a real geocoding service |
| Hardcode scraping to fixed intervals | Simple to implement | Thrashes sources unnecessarily; blind to scrape failures | Acceptable for MVP; add adaptive scheduling later |
| Store all events, never delete | No cleanup logic needed | DB bloat, slow queries, stale pins on map | Never — date expiry is mandatory |
| Run headless Chromium on Vercel | All infrastructure in one place | Hits 50MB bundle limit; fragile across Vercel updates | Never — decouple scraping from Vercel |
| Skip source health monitoring | Faster initial build | Silent failures — scraper "runs" but returns nothing | MVP-acceptable with manual monitoring; automate before scale |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Eventbrite | Web-scraping the HTML listings | Use the official Eventbrite API (OAuth, 1000 req/hour). Much more reliable and legal. |
| Bandsintown | Scraping the website | Use the Bandsintown API (requires artist-name-keyed requests, not location-based). Understand the API is artist-centric, not venue-centric — queries differ. |
| Nominatim | Using the public nominatim.openstreetmap.org in production | Use OpenCage, Google Maps Geocoding, or self-hosted Nominatim. The public instance explicitly forbids production use and will block at >1 req/sec. |
| Anthropic/OpenAI | Sending full HTML page as extraction context | Always preprocess: strip scripts/styles/nav/footer, extract main content, target the relevant section. Reduces token usage 10–25×. |
| Vercel Cron | Expecting cron to handle long-running multi-source scrapes | Vercel Cron invokes a serverless function — subject to timeout limits. For scraping 50 venues, split into smaller batches or use an external worker. |
| Cloudflare-protected sites | Assuming HTTP 200 means valid content | Validate response content, not just status code. Check for expected keywords or structure before calling LLM. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| All map pins rendered as DOM elements simultaneously | Map lags or freezes on load; scrolling stutters on mobile | Use Supercluster for client-side clustering. Only render markers in the current viewport. | At ~500+ simultaneous pins without clustering |
| Querying all events without date filter | Event list/map API response grows unbounded over time | Always filter `WHERE event_date >= NOW()`. Index `event_date`. | At ~10,000 accumulated historical events |
| Geocoding on every scrape run | Geocoding API costs accumulate; scrape run slows down | Geocode once per venue, store lat/lng, only re-geocode on address change | Immediately — geocoding should never be per-scrape-run |
| LLM called synchronously during Vercel function | Timeout risk; user request hangs if LLM is slow | Scraping is always async/background, never in the request path. App reads from DB only. | On any scrape taking >10s (common) |
| Running all scrapers serially in one job | Job takes too long; hits function timeout | Batch sources into parallel groups or run per-source cron jobs | At ~20+ sources running in series |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ignoring robots.txt and ToS | Legal liability; Canada's PIPEDA applies to data collection; breach of contract with platforms | Always check and respect `robots.txt`. Use official APIs where available. Document compliance decisions. |
| Storing LLM API keys in source code or env vars without rotation plan | Key leakage exposes billing to abuse | Use environment secrets (Vercel env vars), never commit keys, set spend alerts on the LLM API account |
| No rate limiting on the scraper's outbound requests | Venues' servers get hammered; you get IP-banned; could be legally construed as DoS | Enforce minimum 2-second delay between requests to the same domain. Honor `Crawl-delay` in robots.txt. |
| No validation of LLM output before database insert | LLM could output malformed or malicious-looking strings that break queries or display | Always validate extracted fields against a schema before insert. Reject events with null dates. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "no events found" state when filters return empty | Users think the app is broken | Show explicit empty state: "No events found in this area for these dates. Try expanding your date range." |
| Map loads with all of Atlantic Canada visible by default (too zoomed out) | Pins all cluster into one blob; no useful information visible | Default map view to the user's approximate location (IP geolocation) or to the densest event area (Halifax/Moncton) |
| Event list shows events sorted by database insertion order | Users can't find what's relevant | Sort by date ascending, soonest first. Allow secondary sort by distance from map center. |
| No indication that data is scraped and may be stale | Users make plans based on incorrect data | Show "last updated" timestamp per event or per source. Add disclaimer: "Verify with venue before attending." |
| Clicking a map pin shows only basic info with no way to get more | Users want artist info, not just venue name and time | Event detail card must include: band name, venue name, date/time, and a link to the source page for tickets/confirmation. |
| Mobile map unusable because pins are too small to tap | High bounce rate on mobile | Cluster pins until zoom level where individual pins have 44px+ tap targets. Test on real mobile devices, not just browser DevTools. |

---

## "Looks Done But Isn't" Checklist

- [ ] **Scraper:** Validates response content before calling LLM — verify it detects and logs Cloudflare challenge pages.
- [ ] **Event extraction:** Returns null for missing fields rather than hallucinated values — test with a page that has no time listed.
- [ ] **Deduplication:** Second ingestion of the same event updates the existing record rather than creating a duplicate — verify with a controlled re-scrape.
- [ ] **Geocoding:** Runs at venue creation time, not on every scrape — check that the geocoding API is not called on every scrape run.
- [ ] **Past event cleanup:** Events from yesterday do not appear on the map or in the list — verify with a test event dated yesterday.
- [ ] **Map clustering:** Works on mobile — test clustering at the zoom level expected for Atlantic Canada overview (zoom ~6-7).
- [ ] **Source health:** If a source returns zero events three times in a row, an alert is triggered — verify the monitoring fires.
- [ ] **Token usage:** Logged per scrape run — verify cost per run is visible and within budget before adding more sources.
- [ ] **Vercel timeout:** Scrape job does not hit function timeout — verify against the longest realistic scrape run (all sources, full extraction).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate events already in DB | MEDIUM | Write a one-time dedup migration: identify duplicates by composite key, merge records, delete extras. Painful but recoverable. |
| Wrong geocoordinates for venues | LOW | Re-geocode all venues with a script. Data is per-venue, not per-event — few records to fix. |
| Stale events clogging DB | LOW | One-time cleanup query: `DELETE FROM events WHERE event_date < NOW() - INTERVAL '7 days'`. Add index on event_date. |
| LLM cost spike from raw HTML | LOW-MEDIUM | Add preprocessing, re-run. Past spend is gone but future runs are fixed quickly. |
| Scraper silently blocked (no events ingested for weeks) | LOW (technically) / HIGH (trust) | Add response validation to detect blockage. Re-run scraper with corrected approach. User trust damage is harder to recover. |
| Chromium on Vercel hitting bundle size limit | HIGH | Architecture change: decouple scraper from Vercel. Requires extracting scraper to separate service. Plan for this upfront. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Chromium/Vercel size limit | Phase 1: Infrastructure setup | Deploy a hello-world scraper job to confirm execution environment before writing real scrapers |
| LLM hallucinating dates/times | Phase 2: Scraping & extraction | Test extraction against a page with missing time field; confirm null returned, not invented value |
| Token cost explosion | Phase 2: Scraping & extraction | Log token usage on first 5 sources; confirm per-run cost within budget before expanding |
| Event deduplication | Phase 2: Data storage/schema | Re-scrape same source twice; confirm event count does not increase |
| Geocoding accuracy | Phase 2: Data storage/schema | Spot-check 10 venue coordinates in Google Maps; verify all within 500m of actual location |
| Stale event accumulation | Phase 2: Data storage/schema | Create a test event dated yesterday; confirm it does not appear in public queries after cleanup job runs |
| Anti-bot blocking | Phase 2: Scraping & extraction | Test each source for Cloudflare protection; confirm response validation catches blocked responses |
| Map clustering performance | Phase 3: Map UI | Load map with 500 test pins; confirm no visible lag on a mid-range mobile device |
| UX empty states and trust signals | Phase 3: Map UI | Walk through every filter combination that could return zero results; confirm explicit empty state shown |

---

## Sources

- Kadoa: [Best AI Web Scrapers of 2026](https://www.kadoa.com/blog/best-ai-web-scrapers-2026)
- Medium: [Web Scraping for AI in 2026: What Works, What's Broken](https://medium.com/@yash.dubey803at/web-scraping-for-ai-in-2026-what-works-whats-broken-and-what-it-actually-costs-e8d824d54385)
- ScrapingAnt: [Building a Web Data Quality Layer - Deduping, Canonicalization](https://scrapingant.com/blog/building-a-web-data-quality-layer-deduping-canonicalization)
- Nominatim Usage Policy: [OSM Foundation Geocoding Policy](https://operations.osmfoundation.org/policies/nominatim/)
- Vercel: [Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- Vercel: [Deploying Puppeteer with Next.js](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)
- Vercel: [Function Timeout Knowledge Base](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out)
- ZenRows: [How to Deploy Playwright on Vercel](https://www.zenrows.com/blog/playwright-vercel)
- ScrapFly: [How to Bypass Cloudflare When Web Scraping](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)
- Eventbrite: [API Terms of Use](https://www.eventbrite.com/help/en-us/articles/833731/eventbrite-api-terms-of-use/)
- Bandsintown: [API Documentation](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation)
- Medium: [Optimizing Leaflet Performance with Large Numbers of Markers](https://medium.com/@silvajohnny777/optimizing-leaflet-performance-with-a-large-number-of-markers-0dea18c2ec99)
- Parasoft: [Controlling LLM Hallucinations at Application Level](https://www.parasoft.com/blog/controlling-llm-hallucinations-application-level-best-practices/)
- Browserless: [Is Web Scraping Legal (2025)?](https://www.browserless.io/blog/is-web-scraping-legal)
- Glukhov.org: [Reduce LLM Costs: Token Optimization Strategies](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications)

---
*Pitfalls research for: Local events discovery app with AI-powered web scraping (East Coast Local)*
*Researched: 2026-03-13*
