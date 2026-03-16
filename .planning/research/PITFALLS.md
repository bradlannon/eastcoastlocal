# Pitfalls Research

**Domain:** Local events discovery app with AI-powered web scraping (Atlantic Canada live music)
**Researched:** 2026-03-13 (v1.0 scraping pitfalls) · 2026-03-14 (v1.1 heatmap timelapse pitfalls added) · 2026-03-14 (v1.2 discovery + categorization pitfalls added) · 2026-03-15 (v1.4 API integrations, multi-page scraping, rate limiting, quality metrics, auto-approve pitfalls added) · 2026-03-15 (v1.5 cross-source deduplication, venue merge, zoom-to-location, timelapse filter chips added) · 2026-03-16 (v2.2 recurring series detection and past event archival pitfalls added)
**Confidence:** HIGH (scraping/LLM pitfalls), MEDIUM (geocoding accuracy for Atlantic Canada specifically), HIGH (map performance), HIGH (heatmap/timelapse pitfalls — verified via official Leaflet.heat source, react-leaflet docs, WCAG 2.2 spec, and React memory leak empirical research), HIGH (v1.2 discovery/categorization pitfalls — verified via Vercel official docs, Gemini API pricing docs, LLM drift empirical research), HIGH (v1.4 API integration pitfalls — verified via Ticketmaster ToS, official API docs, Songkick developer portal), HIGH (v1.5 pitfalls — verified via Neon pg_trgm docs, Leaflet GitHub issues, Crunchy Data fuzzy match guide, Leaflet API reference), HIGH (v2.2 pitfalls — derived from direct analysis of existing codebase schema, upsertEvent logic, and events API, plus general recurring-event and archival patterns)

---

## v1.0 — Scraping & Map Pitfalls

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
- Same event appearing multiple times in venue popups
- Map cluster count higher than expected for a venue's actual event schedule
- Multiple entries sharing identical performer + date but different source_url

**Phase to address:**
Data model phase (before first insert). The dedup key must be designed before any events are stored.

---

### Pitfall 5: Geocoding Fails Silently for Atlantic Canadian Addresses

**What goes wrong:**
Atlantic Canadian addresses (especially rural New Brunswick and Newfoundland) frequently return `APPROXIMATE` precision from Google Maps Geocoding API, meaning the coordinates represent a postal code centroid rather than the venue's actual location. Pins cluster incorrectly (e.g., all Fredericton venues appear at the same postal code centroid). The problem is silent — no error is thrown, and the lat/lng values look legitimate.

**Why it happens:**
Google's geocoding coverage for Atlantic Canada is less precise than major urban centers. Postal codes in rural Atlantic Canada can span multiple kilometers. The Geocoding API returns a result regardless, with precision level in a separate field that most integrations ignore.

**How to avoid:**
- Check and enforce the `geometry.location_type` field in the Geocoding API response. Only accept `ROOFTOP` (exact match) or `RANGE_INTERPOLATED` (interpolated from street range) precision. Reject `GEOMETRIC_CENTER` and `APPROXIMATE`.
- For addresses that fail precision requirements, log them for manual coordinate entry rather than silently using approximate coordinates.
- Provide an admin interface to manually set lat/lng for venues where geocoding fails.

**Warning signs:**
- Multiple distinct venues sharing identical lat/lng
- Venues appearing in the center of a city rather than at their specific address
- Geocoding success rate below 85% for your source addresses

**Phase to address:**
Geocoding/venues phase. The precision filter must be in place before venues are bulk-imported.

---

### Pitfall 6: Map Performance Degrades With Many Pins

**What goes wrong:**
Rendering 500+ Leaflet markers without clustering causes the map to become unresponsive. Each marker is a DOM element. At 1,000 markers, pan and zoom interactions lag 1–3 seconds. Mobile devices become unusable at 300+ markers.

**Why it happens:**
Leaflet does not cluster markers by default. Developers prototype with 10–20 events, deploy, and only discover the performance cliff after data grows.

**How to avoid:**
- Use `react-leaflet-cluster` from day one, not after launch.
- Configure cluster radius (80px is a good default for event density at regional scale) and `chunkedLoading: true` to spread DOM insertion across frames.
- Limit the events query to a future window (e.g., next 30 days) rather than fetching all events ever stored.

**Warning signs:**
- Map interaction lag increasing as event count grows
- `window.L` error or cluster library failing to load (SSR issue — requires dynamic import)
- Users reporting "slow map" on mobile before you've noticed on desktop

**Phase to address:**
Map rendering phase. Clustering must be the default from the first map implementation.

---

## v1.1 — Heatmap & Timelapse Pitfalls

### Pitfall 7: leaflet.heat Blows Up During SSR

**What goes wrong:**
`leaflet.heat` calls `window.L` at import time. When Next.js server-renders a page that imports this library, `window` does not exist and the page crashes with a ReferenceError.

**Why it happens:**
Leaflet and its plugins are browser-only libraries. They assume a DOM environment. Next.js pages render on the server first, then hydrate on the client. Any code that touches `window` or `document` at module evaluation time will fail.

**How to avoid:**
Wrap all Leaflet-dependent components in `dynamic(() => import(...), { ssr: false })`. Keep the heatmap component in a separate file that is only ever loaded client-side.

**Warning signs:**
- `ReferenceError: window is not defined` in server logs
- Map component that works locally (no SSR in dev by default) but fails in production

**Phase to address:**
Map implementation phase (v1.1). Establish the `ssr: false` pattern once and apply it to all map components.

---

### Pitfall 8: History API Rate Limit During Timelapse Playback

**What goes wrong:**
If the timelapse time position is stored in a URL param (e.g., via `nuqs`), the browser's History API gets called on every animation frame. At 5 frames/second over a 30-day window (120 steps), this generates 600 history entries in 2 minutes. Chrome and Firefox enforce a 100 pushState calls/30 seconds limit and silently stop updating the URL, causing state desync.

**Why it happens:**
URL state is convenient for sharing and navigation. Developers apply it to all state without considering update frequency.

**How to avoid:**
Use `useState` (not `nuqs`) for time position. Only persist static filter state (date range, category) in the URL — not animation state. Document this decision to prevent future "cleanup" from reverting it.

**Warning signs:**
- URL stops updating mid-playback
- Browser console warning about History API rate limit
- Animation appears to continue but shared URL is stale

**Phase to address:**
Timelapse implementation phase (v1.1). The URL state architecture must be decided before building the scrubber.

---

## v1.2 — Discovery & Categorization Pitfalls

### Pitfall 9: Gemini Search Grounding Nondeterminism

**What goes wrong:**
Gemini with Google Search grounding produces different venue discovery results on identical prompts. The same cron run on two consecutive days finds different sets of venues. This is expected behavior, not a bug, but it violates the assumption that cron jobs are idempotent.

**Why it happens:**
Search grounding injects live search results into the LLM context. The results vary by time, personalization signals, and non-determinism in the model itself. There is no seed or determinism parameter for grounded generation.

**How to avoid:**
- Design the discovery pipeline to be additive and idempotent: discovered venues are checked against existing venues before being inserted into `discovered_sources`. Duplicate URLs are ignored, never re-inserted.
- Never treat discovery runs as authoritative. They are hints, not inventories. Manual approval gate prevents unstable runs from corrupting active sources.
- Log discovery run outcomes (venues found, duplicates skipped, approved, queued) so variance between runs is visible.

**Warning signs:**
- `discovered_sources` table growing unboundedly with repeated runs
- Venues appearing in discovery queue multiple times under slightly different names
- Discovery run metrics showing wildly different candidate counts day to day

**Phase to address:**
Discovery architecture phase. The dedup-before-insert pattern must be established before the first discovery run.

---

### Pitfall 10: LLM Category Drift Across Re-scrapes

**What goes wrong:**
An event is categorized as `live_music` on the first scrape and `community` on the second, because the LLM was given different context or the page changed. Each re-scrape overwrites the category, causing events to appear and disappear from the live music filter based on scraping randomness.

**Why it happens:**
The `upsertEvent` ON CONFLICT handler overwrites `event_category`. LLMs have non-zero variance even at temperature=0.

**How to avoid:**
- In the ON CONFLICT SET clause, use `COALESCE(existing_category, new_category)` — only update category if the existing value is null. Once a category is set, it sticks.
- Alternatively, only set category during INSERT, never during UPDATE.
- For backfill runs specifically (one-time category assignment), run separately from regular scrapes and mark events as "category_locked" to prevent future overwrites.

**Warning signs:**
- Events jumping between category filter groups between page refreshes
- Category distribution in admin changing without new events being added
- User reports of "this event disappeared from live music"

**Phase to address:**
Categorization phase (v1.2). The COALESCE pattern must be in the initial upsert implementation.

---

## v1.4 — API Integration, Rate Limiting & Quality Pitfalls

### Pitfall 11: Ticketmaster Rate Limits During Batch Discovery

**What goes wrong:**
Ticketmaster Discovery API enforces 5,000 requests/day on the developer plan. A naive batch that queries every province + category combination can exhaust the daily budget in a single cron run, leaving subsequent runs with 429 errors for the rest of the day.

**Why it happens:**
Batch queries feel free because each individual request is fast. Developers don't account for pagination — a single province query returning 200 results at page size 20 is actually 10 API calls.

**How to avoid:**
- Use max page size (200 results/request) to minimize round-trips.
- Track total API calls per run and abort if approaching a daily budget threshold.
- Cache Ticketmaster results for the day — don't re-query if a run already succeeded today.

**Warning signs:**
- 429 HTTP errors in scrape logs after 10am on high-activity days
- Ticketmaster-sourced events missing for entire days at a time
- `consecutive_failures` counter climbing for Ticketmaster source rows

**Phase to address:**
Ticketmaster integration phase (v1.4). Rate limit accounting must be built before going to production.

---

### Pitfall 12: JSON-LD Fast Path Silently Returns Stale Events

**What goes wrong:**
The JSON-LD path bypasses Gemini entirely and returns `confidence=1.0`. This is correct when the structured data is accurate — but some venue websites embed JSON-LD once during page build and never update it, meaning the JSON-LD contains events from six months ago while the actual page content shows current events. The fast path returns confidently wrong data.

**Why it happens:**
JSON-LD is trusted as authoritative because it is structured. But venue websites are often static or poorly maintained, and structured data is more likely to be stale than visible page content.

**How to avoid:**
- If JSON-LD events have dates more than 14 days in the past, fall through to Gemini extraction rather than trusting the stale structured data.
- Log when JSON-LD path is taken vs. Gemini path, so stale-JSON-LD sources can be identified and disabled.

**Warning signs:**
- A source consistently returning past events via the JSON-LD path
- Event dates from JSON-LD clustering on historical dates
- `avg_confidence=1.0` sources with zero future events

**Phase to address:**
JSON-LD extraction phase (v1.4). Add the staleness check before deploying the fast path.

---

## v1.5 — Cross-Source Deduplication & Venue Merge Pitfalls

### Pitfall 13: Venue Merge False Positives Corrupt Event Attribution

**What goes wrong:**
Two distinct venues with similar names (e.g., "The Dock" in Fredericton and "The Dock" in Moncton) get merged because name similarity score exceeds the threshold. After merge, all events from both venues are attributed to one venue at one location. Users in Moncton see events listed at a Fredericton venue. The corruption is invisible until a user complains.

**Why it happens:**
Atlantic Canada has generic venue name reuse across cities. Name similarity alone is insufficient. Geo distance is necessary but can be unavailable if one venue lacks coordinates.

**How to avoid:**
- Require both name AND geo signals to exceed thresholds before auto-merging (two-signal gate).
- When geo is unavailable for one venue, route to admin review rather than auto-merging.
- Log all merges in `venue_merge_log` so rollback is possible.
- Test merge logic with Atlantic Canada venue name corpus specifically — include "The [noun]" patterns.

**Warning signs:**
- Venues in different cities appearing merged
- Events appearing at wrong city after a scrape run
- `venue_merge_candidates` queue growing with candidates that have missing geo data

**Phase to address:**
Venue dedup phase (v1.5). The two-signal gate must be the first merge implementation, not a later refinement.

---

### Pitfall 14: event_sources Orphaned After Event Deletion

**What goes wrong:**
An event is deleted (manually or via a future archival process). The corresponding `event_sources` rows are not deleted if the FK is not configured with ON DELETE CASCADE. The orphaned rows silently persist and cause confusion in source attribution queries, or trigger FK violations if the event ID is ever reused.

**Why it happens:**
`event_sources` is a join table. Developers assume deleting the parent event cleans up join rows, but Postgres does not do this without explicit CASCADE configuration.

**How to avoid:**
- Add `ON DELETE CASCADE` to the `event_sources.event_id` FK. This ensures join rows are cleaned up automatically when events are removed.
- Verify cascade behavior in schema tests, not just in the ORM definition.

**Warning signs:**
- `event_sources` row count exceeding `events` count by an unexplainable margin
- Queries joining `event_sources` to `events` returning rows with null event fields
- Source attribution showing events that no longer exist in the UI

**Phase to address:**
Schema design phase (v1.5 or earlier). FK cascade must be set at schema creation, not retrofitted.

---

## v2.2 — Recurring Series Detection & Past Event Archival Pitfalls

### Pitfall 15: False Positive Series Grouping (Different Events, Similar Names)

**What goes wrong:**
Two distinct recurring events at different venues — "Open Mic Night" at The Levee and "Open Mic Night" at Plan B — get grouped into the same series because the matching logic uses performer/name similarity without scoping to venue. Users see a series that appears to bounce between venues with no pattern. Worse: a "Jazz Night" at a Halifax bar and a "Jazz Night" at a PEI concert hall appear grouped as a single series, making the series map pin ambiguous.

**Why it happens:**
The first instinct for series detection is "find events with the same name." This is correct within a venue but wrong across the entire events table. The existing dedup key is (venue_id + event_date + normalized_performer), but series detection without a venue scope constraint crosses that boundary.

**How to avoid:**
Series membership must be scoped to (venue_id + normalized name pattern). Never group events across different venues into the same series. The series detection query should always partition by venue_id first.

**Warning signs:**
- A series containing events at more than one venue
- Series member count exceeding the number of weeks the venue has been active
- Map pins for a series spanning geographically distant locations

**Phase to address:**
Series detection schema phase. The venue_id scope constraint must be in the data model, not just enforced in application logic.

---

### Pitfall 16: Series Breaking on Minor Name Variations

**What goes wrong:**
A venue runs "Open Mic Night" every Tuesday. In April the name briefly appears as "Open Mic Nite" (typo on their website) or "Open Mic Night — Special Edition" (one-off description change). The series detection logic splits this into two or three separate series, breaking the grouping. The grouped UI shows a gap or creates a spurious second series for the same event.

**Why it happens:**
Exact string matching on `normalized_performer` is brittle. The existing normalization (lowercase, strip punctuation, collapse spaces) handles trivial variations but not typos or appended descriptions.

**How to avoid:**
- Apply edit-distance tolerance when matching series members. A threshold of ~20% Levenshtein distance (relative to string length) catches "Nite" vs "Night" and appended suffixes while avoiding false merges.
- The project already has `fastest-levenshtein` installed (used for venue dedup) — reuse it.
- Establish a canonical `series_name` column that is set once at series creation and not overwritten by subsequent events with slightly different names.
- Do not re-derive series membership from the current event name on every scrape. Membership is write-once: once an event is assigned to a series, only manual admin action changes that assignment.

**Warning signs:**
- Series appearing to reset or restart for the same weekly event
- Multiple series at the same venue with similar names and overlapping date ranges
- Admin seeing two "Jazz Night" series at the same venue that are clearly the same event

**Phase to address:**
Series detection logic phase. Fuzzy name matching must be the initial implementation — starting with exact match and "fixing later" requires a data migration.

---

### Pitfall 17: Archival Race with Active Scraping

**What goes wrong:**
The archival cron runs at midnight and marks last night's events as `archived_at = NOW()`. At the same moment, the scrape cron starts and re-discovers those same events (the venue website still lists them as future events, but the event date was yesterday). The scrape calls `upsertEvent`, which hits ON CONFLICT DO UPDATE and clears the `archived_at` flag. The event is unarchived. This can create a permanent oscillation where the same event is archived and unarchived daily.

**Why it happens:**
`upsertEvent`'s ON CONFLICT DO UPDATE unconditionally sets fields including updated_at. If `archived_at` is stored on the `events` row, any update clears it unless the upsert explicitly preserves it. The scraper has no knowledge of archival state.

**How to avoid:**
Two options:
1. **Preserve archived_at in upsert**: In the ON CONFLICT SET clause, use `COALESCE(events.archived_at, NULL)` — i.e., never touch archived_at during an upsert. Archived events stay archived even if re-scraped.
2. **Archive by date window, not by flag**: The events API already filters `WHERE event_date >= NOW()`. If archival is purely API-layer filtering (not a DB flag), there is no race — past events are excluded from the API automatically, and the scraper can still upsert them without conflict.

Option 2 is simpler and avoids the race entirely. The `archived_at` flag is only needed if archived events must be recoverable in the admin UI, or if archival logic goes beyond simple date comparison.

**Warning signs:**
- Past events re-appearing on the map after the scrape cron runs
- `archived_at` being repeatedly set and cleared in the events table
- Archival cron and scrape cron scheduled at overlapping times

**Phase to address:**
Archival schema phase. The archival strategy (flag vs. date-filter) must be chosen before implementing either the archival cron or modifying the upsert.

---

### Pitfall 18: Timezone Errors in "Past" Determination

**What goes wrong:**
The events API filters `WHERE event_date >= NOW()`. Postgres `NOW()` returns UTC. Event dates are stored as timestamps — if they are stored as UTC midnight (e.g., a 7pm Atlantic event stored as `2026-03-17 00:00:00+00`), an event happening tonight at 7pm AST will be filtered out at 8pm UTC (3pm AST) — four hours before the event starts. Users see tonight's events disappear from the map in the afternoon.

A second problem: an archival cron running at `00:00 UTC` is `20:00 AST` the day before. Events from "tomorrow" in Atlantic time get archived as "past" when midnight UTC arrives.

**Why it happens:**
Atlantic Canada is UTC-4 (ADT) or UTC-5 (AST) depending on the season. Event times are colloquially expressed in local time. Venues list "8pm Saturday" not "01:00 UTC Sunday." The LLM extracts "8pm" and the scraper stores it without timezone conversion.

**How to avoid:**
- Store event dates as `TIMESTAMPTZ` (timestamp with time zone). When constructing the event_date in `upsertEvent`, assume Atlantic time (America/Halifax) if no timezone is provided. Use `date-fns-tz` or native `Intl` to convert before storing.
- In the archival cron and API filter, compare against Atlantic midnight, not UTC midnight. Use `AT TIME ZONE 'America/Halifax'` in Postgres queries, or compute the correct UTC offset in application code before querying.
- Treat event_time as the authoritative time; event_date without event_time should be treated as "all day" (include until end of day in Atlantic time).

**Warning signs:**
- Events disappearing from the map 4–5 hours before they actually occur
- Archival cron archiving tomorrow's events late in the current day
- Events with `event_time = '8:00 PM'` being filtered out at 3pm Atlantic time

**Phase to address:**
Archival cron phase and events API phase. Both the storage convention and the query filter must use consistent timezone handling — fixing one without the other creates new bugs.

---

### Pitfall 19: Orphaned event_sources After Archival

**What goes wrong:**
If archival is implemented by deleting past events (hard delete) rather than flagging them, the corresponding `event_sources` rows become orphaned — unless `ON DELETE CASCADE` is configured. In the current schema, `event_sources.event_id` references `events.id` but the cascade behavior is not explicitly set (Drizzle ORM defaults to RESTRICT). A hard delete of an archived event will fail with a FK violation, or succeed only if `event_sources` rows are manually deleted first.

A softer version: if archival uses `archived_at` flag (soft delete), `event_sources` rows persist alongside archived events, which is fine — but queries that join events to event_sources must consistently filter `WHERE events.archived_at IS NULL` to avoid returning source data for archived events.

**Why it happens:**
Schema design did not anticipate archival. The FK was set for insert-time dedup, not delete-time cascade.

**How to avoid:**
- Prefer soft delete (archived_at flag) over hard delete for events — this avoids the cascade problem entirely and preserves audit history.
- If hard delete is needed, add `ON DELETE CASCADE` to `event_sources.event_id` FK before implementing archival.
- Verify that the events API, admin queries, and any future series-grouping queries all consistently filter on `archived_at IS NULL`.

**Warning signs:**
- FK violation errors when attempting to delete events
- event_sources count not decreasing after archival
- Admin queries returning source attribution for events that no longer appear in the public UI

**Phase to address:**
Archival schema phase. Decide soft vs. hard delete before writing any archival logic. If soft delete: add `archived_at` column and update all queries. If hard delete: add cascade to FK first.

---

### Pitfall 20: Map UI Confusion With Series Grouping

**What goes wrong:**
Series grouping is implemented in the data layer but the map pin UI is not updated to reflect it. Each individual series occurrence still shows as a separate event in the popup. Users see "Open Mic Night" listed 8 times in a venue popup. The series is technically grouped in the database but invisible to users.

A second UI pitfall: the series collapse UI on the event list works correctly, but the map pin cluster count inflates because it counts individual events, not series. A venue running 12 weekly events shows "12 events" in the cluster bubble even though it is conceptually 2 series (Open Mic + Jazz Night). Users interpret this as 12 distinct shows.

A third pitfall: the heatmap timelapse counts individual event instances, not series. A venue running a weekly recurring event appears as 4 heat pulses per month instead of 1 ongoing series. The heatmap misrepresents the venue's "activity level" vs. one-off events.

**Why it happens:**
Series grouping touches the data model but the rendering layer has three separate event consumers: map pins, event list, and heatmap. Developers implement series grouping for one consumer and ship, forgetting the others.

**How to avoid:**
- Before starting series UI work, enumerate all event consumers: map pin popups, cluster count badges, event list (sidebar + browse), heatmap intensity, and any future consumers.
- Decide upfront whether clusters count series or instances — document the decision.
- For the heatmap, series grouping likely means each venue gets one heat point per active series, not one point per event occurrence. Implement this explicitly.
- Write a checklist of all event-rendering surfaces and verify series awareness before marking the feature complete.

**Warning signs:**
- Venue popups listing the same recurring event multiple times
- Cluster count badges inconsistent with the event list count for the same venue
- Heatmap showing spikes for venues with many recurring events vs. one-off events

**Phase to address:**
Series UI phase. The rendering contract (series vs. instance) must be defined before building any UI, not derived from the data shape after the fact.

---

### Pitfall 21: Series Over-Detection on Generic Performer Names

**What goes wrong:**
The Gemini extractor is instructed to extract the performer name. For recurring community events, the performer is often the event itself: "Open Mic Night," "Trivia Night," "Jazz Sessions," "Ladies' Night." These generic names appear at dozens of venues. The series detection algorithm finds 40 "Open Mic Night" events across 40 venues and, if not properly scoped to venue, groups them into a mega-series spanning the entire Atlantic region.

A second form: even within a venue, Gemini may extract "Various Artists" or "Local Artists" as the performer for multiple distinct one-off shows. Series detection groups these into a false series, making unrelated shows appear to be a recurring event.

**Why it happens:**
The `normalized_performer` field is designed for dedup within a venue (same performer, same venue, same date = duplicate). Using it for cross-event series detection without additional constraints is a category error — dedup and series detection have different semantics.

**How to avoid:**
- Series detection should require at least 3 occurrences within a rolling 90-day window at the same venue before creating a series record. One-off and two-time events should not be grouped.
- Add a minimum temporal regularity check: occurrences should be roughly evenly spaced (weekly ± 3 days, or monthly ± 7 days) to qualify as a series. Random occurrences of the same name should not qualify.
- Exclude performers from series detection that are known generic placeholders: "Various Artists," "Local Artists," "TBD," "TBA." Maintain a configurable blocklist.

**Warning signs:**
- Series records containing events at multiple venues
- Series with member counts exceeding 52 (more than a year of weekly events) for a new venue
- Series records created for events labeled "Various Artists" or "TBD"

**Phase to address:**
Series detection logic phase. The minimum-occurrence threshold and regularity check must be part of the initial detection algorithm.

---

### Pitfall 22: Archival Cron Timeout Within Vercel's 60s Limit

**What goes wrong:**
The archival cron issues a bulk UPDATE setting `archived_at` on all past events. If the events table has grown to tens of thousands of rows (after months of scraping), the UPDATE takes 10–30 seconds on a cold Neon serverless connection. Combined with the scrape cron that may share the same Vercel function invocation budget, the archival cron times out at 60 seconds. The `archived_at` values are set partially — some events archived, some not — leaving an inconsistent state.

**Why it happens:**
Vercel's 60s timeout is a hard wall. Bulk DB operations scale with row count. The daily scrape cron already uses most of the 60s budget on an average run.

**How to avoid:**
- Give archival its own dedicated cron endpoint (separate Vercel function route) with its own 60s budget, isolated from the scrape cron.
- The archival query should be simple and indexed: `UPDATE events SET archived_at = NOW() WHERE event_date < NOW() AND archived_at IS NULL`. An index on `event_date` already exists (`events_event_date_idx`). This query on a properly indexed table should complete in under 1 second even for 50k rows on Neon.
- Verify archival query execution time in a staging environment before adding it to the cron schedule.
- If soft delete is implemented as a date-window filter in the API (not a DB flag), the archival cron is unnecessary entirely — eliminating this pitfall.

**Warning signs:**
- Archival cron logs showing partial completion
- `archived_at` column partially populated (some past events null, others set) after a cron run
- Vercel function timeout logs for the archival endpoint

**Phase to address:**
Archival cron phase. Dedicated endpoint isolation must be in the initial implementation plan, not added after the first timeout failure.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Series membership via repeated re-computation from name match | No schema changes needed | Re-runs on every query, results change if names change, can't be corrected without re-running | Never — membership should be write-once |
| Hard-coding "past" as `event_date < NOW()` in UTC | Simple | Events disappear 4–5 hours early in Atlantic time | Never — use Atlantic timezone from day one |
| Archival flag on events row without updating all consumers | Gets archived events out of public API | Admin queries, event_sources joins, series queries may still return archived data | Only if all consumers are immediately updated |
| Reusing scrape cron for archival | One fewer cron endpoint | Timeout risk, interleaved failures, hard to debug independently | Never — always use a dedicated endpoint |
| Detecting series from current events table without a series table | Avoids new table | Series state is ephemeral, can't store canonical name, can't admin-correct false positives | Never for production — series table is required |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Postgres timestamps | Storing event dates as `TIMESTAMP` (no timezone) from UTC-unaware extraction | Use `TIMESTAMPTZ` and convert local Atlantic time to UTC at insert time |
| Drizzle ORM upsert | ON CONFLICT DO UPDATE overwrites `archived_at` | Explicitly exclude `archived_at` from the SET clause or use COALESCE |
| Vercel cron | Running archival inside scrape cron to avoid a new endpoint | Dedicated endpoint per logical cron job — they share no timeout budget |
| event_sources FK | Drizzle FK definition without explicit ON DELETE CASCADE | Add cascade in the schema definition before any archival deletes |
| Neon serverless | Cold connection adds 500–2000ms to first query | Account for connection overhead in 60s timeout budget for archival queries |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Series detection via full table scan | Query time grows linearly with event count | Index on (venue_id, normalized_performer, event_date); never scan full table for series candidates | ~5,000 events (Atlantic Canada will reach this within 6 months of full operation) |
| Archival UPDATE without index | Slow bulk update on large events table | `event_date` index already exists — verify query planner uses it | ~10,000+ events |
| API returning archived events mixed with live events | Extra rows in payload, client filters client-side | Filter `archived_at IS NULL` in the DB query, not in the API response | Immediate — every request returns dead weight |
| Series grouping in API layer (N+1) | API response time grows with series count | Join series table in a single query, not per-event lookups | ~100 series |
| Cluster count recomputed per render | Map re-renders on every events update | Count series in the DB query, pass count to cluster | With React strict mode + dev tools |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing archived events via API to unauthorized users | Data leak of events admin deliberately removed | Archived events excluded at DB query level, not client-side |
| Admin-only series management endpoint without auth middleware | Any visitor can merge or split series | Reuse existing JWT auth middleware on all `/api/admin/*` series endpoints |
| Storing raw series candidate data (all matching event titles) | Unbounded table growth from noisy data | Series table stores canonical name + member count, not raw candidate list |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all series occurrences as separate map pins | Venue popup shows same event 8× — feels broken | Show series as single pin with "recurring" badge; expand to occurrence list on tap |
| Series badge visible in heatmap mode | Heatmap counts individual occurrences anyway — badge is misleading | In heatmap mode, count series as one heat point at venue, not N instances |
| Archiving events before they end (midnight UTC = afternoon Atlantic) | Users see tonight's event missing from the map | Archive at Atlantic midnight, not UTC midnight |
| Series grouping that hides one-off events at series-heavy venues | One-off show buried under recurring series UI | One-off events always visible; series can be collapsed but not hidden by default |
| "Recurring" badge with no recurrence pattern visible | Users don't know if next occurrence is tomorrow or next month | Badge tooltip or card section shows next upcoming occurrence date |

---

## "Looks Done But Isn't" Checklist

- [ ] **Series detection:** Verify series are scoped to venue_id — run a query to confirm no series spans multiple venues
- [ ] **Archival filter:** Confirm both the public events API AND the map pin query exclude archived events — test by inserting a past event and verifying it never appears
- [ ] **Timezone handling:** Verify events happening tonight at 8pm AST are still visible at 7pm AST (not archived at UTC midnight = 8pm AST)
- [ ] **event_sources cascade:** Verify `event_sources` rows are cleaned up when events are archived/deleted — check for orphaned rows after a test archival run
- [ ] **Upsert preserves archived_at:** Confirm re-scraping an archived event does not clear `archived_at` — run upsertEvent against an archived event row and inspect the result
- [ ] **Series UI completeness:** Verify series grouping is reflected in map pin popups, cluster count badges, event list, AND heatmap — not just one of the four surfaces
- [ ] **Admin series visibility:** Confirm admin can see archived events and series history — public API exclusion must not affect admin queries
- [ ] **Series canonical name:** Confirm series name is set once at creation and not overwritten by subsequent scrapes with slightly different event names
- [ ] **Minimum occurrence threshold:** Confirm one-time and two-time events are not grouped into series — test with an event that appears exactly twice

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| False positive series grouping (wrong events grouped) | MEDIUM | Admin UI to split series: mark events as series_id = NULL, re-run detection with corrected logic |
| Archival race (archived event unarchived by scraper) | LOW | Add COALESCE guard to upsert; re-run archival cron |
| Timezone archival error (events archived too early) | LOW | Update archived_at logic to use Atlantic time; clear archived_at for events in the next 12 hours |
| Orphaned event_sources after hard-delete archival | MEDIUM | Add ON DELETE CASCADE; delete orphaned rows manually; rerun delete with cascade in place |
| Series breaking on name variation (two series for same event) | MEDIUM | Admin merge UI; update series detection to use fuzzy match; merge via DB update to unify series_id |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| False positive series grouping (Pitfall 15) | Series detection schema — add venue_id constraint before first series insert | Query: `SELECT series_id, COUNT(DISTINCT venue_id) FROM event_series_members GROUP BY series_id HAVING COUNT(DISTINCT venue_id) > 1` returns 0 rows |
| Series breaking on name variations (Pitfall 16) | Series detection logic — fuzzy match at initial implementation | Test: insert "Open Mic Night" and "Open Mic Nite" at same venue, verify same series_id assigned |
| Archival race with scraping (Pitfall 17) | Archival schema — COALESCE guard in upsertEvent before archival cron goes live | Test: scrape a manually-archived event; verify archived_at unchanged after upsert |
| Timezone "past" errors (Pitfall 18) | Events API + archival cron — Atlantic timezone at both storage and query time | Test: insert event at 8pm tonight AST; verify visible at 7pm AST, gone by 8:01pm AST |
| Orphaned event_sources (Pitfall 19) | Archival schema — soft delete decision and FK cascade | Query: `SELECT COUNT(*) FROM event_sources es LEFT JOIN events e ON es.event_id = e.id WHERE e.id IS NULL` returns 0 |
| Map UI confusion with series (Pitfall 20) | Series UI phase — enumerate all consumers before building any | Checklist: map popups, cluster badges, event list, heatmap all verified with series-grouped data |
| Series over-detection on generic names (Pitfall 21) | Series detection logic — minimum occurrence + regularity threshold | Test: insert "Various Artists" twice at same venue; verify no series created |
| Archival cron timeout (Pitfall 22) | Archival cron phase — dedicated endpoint, verify query uses event_date index | `EXPLAIN ANALYZE` on archival UPDATE confirms index scan; cron endpoint has isolated 60s budget |

---

## Sources

- Direct codebase analysis: `src/lib/db/schema.ts` (events table structure, FK definitions, dedup key), `src/lib/scraper/normalizer.ts` (upsertEvent ON CONFLICT logic), `src/app/api/events/route.ts` (API filter: `gte(events.event_date, new Date())`), `src/lib/scraper/orchestrator.ts` (cron structure, 60s budget patterns)
- Project context: `.planning/PROJECT.md` (Vercel 60s constraint, Atlantic Canada timezone, existing dedup patterns, out-of-scope decisions)
- Prior pitfall research: v1.5 section covering event_sources FK and COALESCE upsert patterns
- General knowledge: PostgreSQL CASCADE FK behavior, TIMESTAMPTZ vs TIMESTAMP semantics, Vercel serverless timeout hard limits, Neon cold-start latency characteristics

---
*Pitfalls research for: Recurring event series detection and past event archival — East Coast Local v2.2*
*Researched: 2026-03-16*
