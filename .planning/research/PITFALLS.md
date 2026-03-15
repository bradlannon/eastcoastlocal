# Pitfalls Research

**Domain:** Local events discovery app with AI-powered web scraping (Atlantic Canada live music)
**Researched:** 2026-03-13 (v1.0 scraping pitfalls) · 2026-03-14 (v1.1 heatmap timelapse pitfalls added) · 2026-03-14 (v1.2 discovery + categorization pitfalls added) · 2026-03-15 (v1.4 API integrations, multi-page scraping, rate limiting, quality metrics, auto-approve pitfalls added) · 2026-03-15 (v1.5 cross-source deduplication, venue merge, zoom-to-location, timelapse filter chips added)
**Confidence:** HIGH (scraping/LLM pitfalls), MEDIUM (geocoding accuracy for Atlantic Canada specifically), HIGH (map performance), HIGH (heatmap/timelapse pitfalls — verified via official Leaflet.heat source, react-leaflet docs, WCAG 2.2 spec, and React memory leak empirical research), HIGH (v1.2 discovery/categorization pitfalls — verified via Vercel official docs, Gemini API pricing docs, LLM drift empirical research), HIGH (v1.4 API integration pitfalls — verified via Ticketmaster ToS, official API docs, Songkick developer portal), HIGH (v1.5 pitfalls — verified via Neon pg_trgm docs, Leaflet GitHub issues, Crunchy Data fuzzy match guide, Leaflet API reference)

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

## v1.1 — Heatmap Timelapse Pitfalls

### Pitfall 8: Leaflet.heat Has No Built-in Click-Through Support

**What goes wrong:**
The "click-through from heatmap hotspots to events" feature gets built by attaching click handlers to the HeatLayer — which silently does nothing. Leaflet.heat renders all points onto a flat canvas and has no spatial index of what was drawn where. There is no way to ask it "what points are under this click?" The canvas pixels carry no metadata.

**Why it happens:**
Developers assume the heatmap layer behaves like a marker layer where each rendered element is a Leaflet object with event support. The API looks similar (you add lat/lng points), so the assumption feels reasonable. The limitation is not prominently documented — it only surfaces in GitHub issue #61 on the Leaflet/Leaflet.heat repo titled "Clickable/hoverable points?" which has been open and unresolved since the project began.

**How to avoid:**
Implement click-through via a parallel spatial lookup, not via the heatmap layer itself. On map click: take the click lat/lng, query the same event dataset that feeds the current time window, filter events within a radius threshold (e.g., ~20km), and show results. A simple distance calculation over the already-filtered time-windowed point set is sufficient for the Atlantic Canada dataset size. Do not attach any `on('click', ...)` handler to the HeatLayer.

**Warning signs:**
- A `heatLayer.on('click', handler)` call exists in the codebase — this will never fire
- Click on the map in heatmap mode produces no response

**Phase to address:**
Phase implementing heatmap interaction and hotspot click-through. Design the click data flow (spatial lookup, not layer event) before writing any click handler code.

---

### Pitfall 9: Animation Loop Memory Leak on Mode Toggle or Unmount

**What goes wrong:**
When the user toggles back to pin/cluster view (or navigates away), the `requestAnimationFrame` loop driving the timelapse continues running in the background, calling `setLatLngs()` on a layer that may have been removed. Over repeated toggle cycles, memory climbs and the CPU stays busy. If the user re-enters heatmap mode, two competing loops run simultaneously — the heatmap flickers or advances at double speed.

**Why it happens:**
The rAF frame ID is stored in a local `useEffect` closure variable. Because `useEffect` cleanup runs asynchronously, the next rAF frame is scheduled before cleanup executes. The frame ID captured at cleanup time may already be stale. An empirical study of 500 React repos found 86% had at least one missing-cleanup pattern; rAF loops leaked ~8 KB per mount/unmount cycle.

**How to avoid:**
- Store the frame ID in a `useRef`, never in a local variable, so the cleanup function always cancels the correct ID.
- Use `useLayoutEffect` (not `useEffect`) for continuous animation loops — it runs cleanup synchronously before the next effect.
- Gate the recursive rAF call behind a cancelled ref: `if (!cancelledRef.current) frameId.current = requestAnimationFrame(tick)`.
- Verify cleanup works: open DevTools Memory, take a heap snapshot, toggle modes 10 times, take another snapshot. Heap should not climb.

**Warning signs:**
- CPU remains elevated after switching to cluster view
- Memory climbs across repeated mode toggles
- `Cannot read properties of undefined (reading 'setLatLngs')` errors in console after toggling — the loop ran after the layer was removed

**Phase to address:**
Phase implementing the play/pause animation loop. Write the cleanup before writing the animation body.

---

### Pitfall 10: Leaflet.heat Plugin Breaks SSR — Even With Existing `dynamic()` Bypass

**What goes wrong:**
The project already bypasses SSR for the map component using `dynamic(() => import('./Map'), { ssr: false })`. Adding Leaflet.heat inside a child component of that dynamic import — without its own import guard — can still throw `window is not defined` at `next build` time. Next.js statically analyzes imports during bundling; if `leaflet.heat` is imported at module top level anywhere in the tree, it evaluates before the SSR guard applies.

**Why it happens:**
The `ssr: false` guard applies to the component render boundary, not to static module evaluation. Leaflet plugins call `window`, `document`, and the `L` global at module evaluation time. In `next dev`, the server is more forgiving; in `next build`, static analysis touches these imports and throws. This means a feature that "works in dev" fails in production build.

**How to avoid:**
- Never `import 'leaflet.heat'` at the top of any file. Import it inside a `useEffect` with `await import('leaflet.heat')`, or keep the entire HeatLayer component in its own file loaded via a second `dynamic(() => import('./HeatLayer'), { ssr: false })` boundary nested inside the already-dynamic Map component.
- Test with `next build && next start` immediately after setting up the HeatLayer component — before writing any animation logic.

**Warning signs:**
- `ReferenceError: window is not defined` during `next build`
- Error stack traces into a Leaflet plugin file
- Feature works in `next dev` but build fails — classic dev/prod SSR gap

**Phase to address:**
First task of the HeatLayer component setup phase. Gate all subsequent heatmap work on a passing `next build`.

---

### Pitfall 11: `setLatLngs()` Redraws Block the Main Thread During Animation

**What goes wrong:**
Calling `heatLayer.setLatLngs(points)` on every animation tick redraws the entire canvas on the main thread. With per-frame array filtering (scanning all events to find those in the current time window), the main thread is doing O(n) work every 16 ms. On mobile, where the JS thread also handles touch events, the scrubber stutters and map panning becomes unresponsive during playback.

**Why it happens:**
- Developers drive animation with `setInterval` instead of `requestAnimationFrame`. `setInterval` fires on its own clock without coordinating with the browser's paint cycle, causing redraws at arbitrary mid-paint times.
- Per-frame filtering is the obvious implementation: `events.filter(e => e.timestamp >= windowStart && e.timestamp < windowEnd)` inside the animation tick. Simple, but O(n) every frame.

**How to avoid:**
- Drive animation from a single top-level `requestAnimationFrame` loop. Never use `setInterval` for animation.
- Pre-bucket events by time window at data load time (e.g., a `Map<hourIndex, LatLng[]>` keyed by hour). The per-frame operation becomes an O(1) lookup: `buckets.get(currentHour)`.
- On scrubber drag, debounce the `setLatLngs` call — update the time label and position instantly but defer the canvas redraw 16–32 ms.
- Verify: Chrome DevTools Performance panel should show rAF callbacks completing in under 16 ms. If they exceed that, the scrubber will lag.

**Warning signs:**
- `setInterval` appears anywhere in animation code
- Scrubber thumb lags behind finger/cursor during drag
- DevTools Performance shows long rAF tasks (yellow bars > 16 ms)

**Phase to address:**
Phase implementing timeline scrubber and play/pause logic. Benchmark redraw time in isolation before wiring to any UI.

---

### Pitfall 12: Timeline Scrubber Inaccessible to Keyboard and Screen Readers

**What goes wrong:**
A custom `<div>`-based scrubber with drag handlers is built. It looks complete and passes visual review. It fails entirely for keyboard users (no Tab stop, no arrow key stepping) and screen reader users (no announced current time value, no role). WCAG 2.2 SC 2.5.7 (Dragging Movements, Level AA, current standard since October 2023) explicitly requires that any drag interaction have a single-pointer non-drag alternative — a click-to-seek or numeric input.

**Why it happens:**
Drag interactions feel naturally implemented as custom pointer event handlers on `div` elements. The keyboard and screen reader requirements are not visible during mouse-only testing and are commonly deferred as "polish." They are not polish — they are architecture.

**How to avoid:**
- Build the scrubber on an HTML `<input type="range">` element. It ships with full keyboard support (arrow keys, Home, End, PageUp/PageDown), Tab stop, and screen reader announcements for free.
- Style the native range input with CSS to match the windy.tv-inspired aesthetic rather than replacing it with a `div`.
- Add `aria-label="Timeline position"` and update `aria-valuetext` with a human-readable string (e.g., "March 14, 8:00 PM").
- The Play/Pause button must be a `<button>` with an `aria-label` that updates dynamically: "Play timelapse" / "Pause timelapse".
- Test keyboard-only: Tab reaches the scrubber, arrow keys advance/retreat time, Space toggles play.

**Warning signs:**
- Scrubber is a `div` or `span` with `onMouseDown`/`onTouchStart` handlers
- No `role="slider"`, `aria-valuenow`, or `aria-valuetext` in the DOM
- Keyboard Tab key skips over the scrubber entirely

**Phase to address:**
Phase building the timeline scrubber UI component. Accessibility is not a post-launch fix — build it right the first time.

---

### Pitfall 13: State Desync Between Heatmap Time Window and Event Sidebar

**What goes wrong:**
The heatmap shows events for time window T, but the sidebar still lists events from the previous nuqs-persisted filter state. The user sees a hotspot on the map but finds no matching events in the sidebar. Or the sidebar shows events that are not visible in the current heatmap window. The two data sources diverge because animation time is local state that changes multiple times per second, while the sidebar reads URL-persisted state.

**Why it happens:**
The project uses nuqs for URL state (date filter, location filter). The natural instinct is to write the current heatmap time to nuqs — it's the existing pattern. But nuqs is rate-limited by the browser (URL updates are throttled), and nuqs itself applies debouncing. During playback, the animation advances faster than URL state can keep up. The sidebar, reading from nuqs, lags behind.

**How to avoid:**
- Treat heatmap time position as transient local state: a `useRef` for the raw animation position, a `useState` for the committed displayed value.
- Lift the current time window into a shared context or lightweight atom (Zustand or React context) that both the HeatLayer and the sidebar read from synchronously. Do not use nuqs for this.
- Throttle sidebar re-renders during playback: update sidebar event list at most every 250 ms, not every animation frame.
- Only write to nuqs (URL) when the user pauses or finishes dragging the scrubber. This preserves shareability without rate-limit issues.
- Never replace nuqs for the existing date/location filter state — add the time window atom alongside it.

**Warning signs:**
- Sidebar event count stays constant while heatmap changes during playback
- URL query string flickering visibly during playback
- nuqs console warnings about excessive URL update frequency

**Phase to address:**
Phase wiring the sidebar to the heatmap time window. Define state ownership (nuqs vs. local atom) before writing any sidebar data fetching.

---

### Pitfall 14: Heatmap Layer Not Removed on Mode Toggle, Leaving a Ghost Layer

**What goes wrong:**
When the user switches back to pin/cluster view, the heatmap canvas remains registered in Leaflet's internal layer registry. The cluster pins render on top visually, but the heat layer still receives map events. Click handlers fire from both layers. On repeated toggles, multiple ghost heat layers accumulate. Leaflet holds references to all of them, preventing garbage collection.

**Why it happens:**
Leaflet layers added imperatively via `map.addLayer()` must be removed imperatively via `map.removeLayer()`. React's reconciliation does not interact with Leaflet's internal `_layers` registry. If the HeatLayer component unmounts but the `useEffect` cleanup does not explicitly call `map.removeLayer(heatLayerInstance)`, the layer stays registered indefinitely. This is a documented issue in react-leaflet (GitHub issue #941).

**How to avoid:**
- In the HeatLayer component's `useEffect`, always return a cleanup function that calls `map.removeLayer(heatLayerRef.current)` followed by `heatLayerRef.current = null`.
- Alternatively, wrap the HeatLayer using react-leaflet's `useLayerLifecycle` hook from the core API — it handles `addLayer`/`removeLayer` automatically tied to the React component lifecycle.
- After toggles, inspect Leaflet's internal state in DevTools: `window.__leafletMap._layers` (attach the map instance to a window property in dev mode). Layer count should not grow with each toggle.

**Warning signs:**
- Heatmap canvas still partially visible after switching to cluster view
- Click events on the map fire handlers from both layers simultaneously
- DevTools Elements panel shows multiple canvas children under the map container after repeated toggles
- Memory does not stabilize after repeated mode switches

**Phase to address:**
Phase implementing the mode toggle between heatmap and pin/cluster view. Write and test cleanup before integrating the toggle UI.

---

## v1.2 — Discovery & Categorization Pitfalls

### Pitfall 15: Discovery Pulls Irrelevant Pages That Swamp the Scrape Queue

**What goes wrong:**
Automated discovery via search queries (e.g., "live music Halifax", "events Moncton NB") returns results that look plausible but are not scrapeable event sources: news articles about past events, Facebook pages (login-gated), social media aggregators, ticket reseller pages, and directory listings that link to venues but don't host event calendars. Every candidate URL is added to the scrape queue. The scraper runs against them, gets zero events, burns Gemini calls, and marks them as failed sources. The failed-source list grows until it is manually pruned.

**Why it happens:**
Search APIs return ranked results but have no concept of "has a structured event calendar." The search query optimization happens independently from the scraping pipeline's requirements. Discovery and ingestion are conflated — discovered URLs go directly to the scrape queue rather than a pending-review holding area.

**How to avoid:**
- Introduce a `discovery_candidates` staging table separate from `scrape_sources`. Discovered URLs land in staging and only graduate to active sources after passing a quality gate.
- Quality gate criteria: fetch the candidate URL, run a lightweight pre-screening check (does the page contain event-related keywords: "upcoming", "tickets", "show", "perform"?). If not, mark as rejected and skip the Gemini call.
- After pre-screening, run a single low-cost Gemini call: "Does this page list upcoming events with specific dates? Answer YES or NO." Use Gemini 2.0 Flash-Lite ($0.10/1M tokens) for this check, not the full extraction model.
- Set a minimum confidence threshold: if the pre-screening LLM says NO, mark the candidate as `rejected` and do not promote to active sources.
- Cap discovery batch size per run (e.g., evaluate at most 10 new candidates per daily cron cycle). This bounds discovery cost regardless of how many results the search API returns.

**Warning signs:**
- `scrape_sources` table growing rapidly with sources that always return zero events
- High Gemini call count with low event extraction yield
- Discovery cron taking significantly longer than the scraping cron

**Phase to address:**
Discovery pipeline phase. The staging table and quality gate must be designed before any discovery search queries are run in production.

---

### Pitfall 16: Duplicate Venues Discovered From Multiple Searches

**What goes wrong:**
The same venue gets added multiple times to the candidate pool — once from a "live music Halifax" query, once from "concerts Nova Scotia", once from a city events directory. Each discovery produces a slightly different URL (e.g., `venue.com/events`, `venue.com/schedule`, `venue.com/calendar`) for the same venue. Three active scrape sources point to the same venue; events are scraped three times and the dedup key (venue_id + date + performer) can catch duplicates only if all three URLs resolve to the same venue_id — which they won't if three venue records are created.

**Why it happens:**
Discovery treats each unique URL as a distinct potential source. Venue identity (same physical venue) is not checked during candidate evaluation. The existing dedup key protects against duplicate events within the same venue, but not against creating duplicate venue records that produce triple-ingestion.

**How to avoid:**
- Before inserting a discovered candidate into `discovery_candidates`, normalize the domain: extract `venue.com` from any discovered URL and check if a venue with that website domain already exists in the `venues` table. If found, link to the existing venue rather than creating a new one.
- Add a unique constraint on the `venues` table's `website` field (domain-normalized, no trailing slash, lowercase) to make duplicate venue creation a database error rather than a silent data problem.
- When evaluating multiple URLs from the same domain, keep only the highest-value URL (typically the one most resembling `/events`, `/calendar`, or `/shows`).
- Run a dedup pass on `discovery_candidates` before the quality gate: group by domain, pick the most promising URL per domain.

**Warning signs:**
- Multiple `scrape_sources` rows with the same domain in their URLs
- Events appearing with near-duplicate venue names (e.g., "The Carleton" and "Carleton Halifax")
- Database venue count growing faster than expected for the region's actual venue count

**Phase to address:**
Discovery pipeline phase. Domain-based dedup must happen at candidate insertion, not retroactively after venue records exist.

---

### Pitfall 17: AI Category Labels Are Inconsistent Across Scrape Runs

**What goes wrong:**
Gemini assigns "Live Music" to an event on Monday's scrape, then "Concert" to the same event type on Wednesday's scrape because the page content changed slightly or the model exhibited non-deterministic output. The category filter on the frontend shows both "Live Music" and "Concert" as distinct options. Users filter by "Live Music" and miss events tagged "Concert". The category taxonomy grows unbounded as the model invents new label variants ("Acoustic Music", "Singer-Songwriter", "Live Band", etc.).

**Why it happens:**
LLMs are probabilistic. Even with temperature=0, minor differences in input text, context window state, or model version updates cause label drift. Without a closed, enforced taxonomy, the model generates category labels from its own vocabulary rather than a fixed set. Empirical LLM monitoring research shows consecutive runs on the same model can yield a drift score of 0.575 due to capitalization and formatting regressions alone.

**How to avoid:**
- Define a closed category taxonomy in the extraction prompt with the exact allowed values and instruct the model to choose only from that list. Example: `["live-music", "comedy", "theatre", "festival", "community", "arts", "sports", "other"]`. Use lowercase hyphenated slugs, not display names, to make matching deterministic.
- Include few-shot examples in the prompt for each category showing what qualifies: "A band playing original songs at a pub = live-music. A stand-up comedian performing = comedy."
- Post-extraction: validate the returned category against the allowlist. If the model returns a value not in the list, map it to "other" rather than accepting the novel value.
- Store categories as slugs in the database; resolve to display names in the frontend. This means changing display names (e.g., "live-music" → "Live Music") never requires a DB migration.
- Run a periodic audit: query the distinct category values in the database and alert if any value outside the taxonomy appears.

**Warning signs:**
- `SELECT DISTINCT category FROM events` returns more than the expected number of taxonomy values
- Filter UI showing "Live Music" and "Concert" as separate options
- Category distribution shifts noticeably between weekly scrape runs without source changes

**Phase to address:**
Categorization phase. The closed taxonomy must be defined and enforced before any category data is written to production. Retrofitting a taxonomy onto inconsistently labeled data requires a full backfill.

---

### Pitfall 18: Adding Categorization as a Separate LLM Pass Doubles Gemini Call Count

**What goes wrong:**
Categorization is implemented as a second Gemini call after event extraction: first call extracts events, second call categorizes each extracted event. With 26 sources and 4-second throttle delays between AI calls, the scrape cron that previously completed in ~110 seconds now takes ~220 seconds per source batch. The job approaches the Vercel function timeout. Gemini API costs double. The throttle delay that was tuned for extraction now applies twice per source.

**Why it happens:**
It is natural to treat categorization as a separate concern and implement it as a post-processing step. The existing extraction pipeline is already working and touched; adding a new pass feels clean. The multiplicative cost on both time and API calls is not immediately obvious.

**How to avoid:**
- Add `category` as a field in the existing `ExtractedEventSchema` and include it in the same Gemini call that extracts event details. One call does extraction and categorization simultaneously.
- The extraction prompt already sends the full page text to Gemini; categorization from that same text adds only a few tokens to the output schema, not a second context ingestion.
- This approach adds near-zero marginal cost: one additional output field per event, not one additional API call per source.
- Include the category taxonomy directly in the existing extraction prompt as an additional instruction block.

**Warning signs:**
- Two separate Gemini API calls per source in the scraper code — one for extraction, one for category
- Scrape cron duration doubling after categorization is added
- Gemini API billing showing 2× the pre-categorization call count with the same source count

**Phase to address:**
Categorization phase. Design the schema extension and prompt update before writing any categorization code. Do not create a separate categorization function.

---

### Pitfall 19: Discovery Job Hits Vercel Function Timeout Under Fluid Compute

**What goes wrong:**
Discovery involves: search API calls to find candidates, fetching each candidate URL, running a pre-screening LLM call per candidate, and writing results to the database. With 20 candidates and 4-second throttle between LLM calls, the discovery job runs for 80+ seconds on the LLM calls alone, plus network time for fetches and DB writes. The discovery cron hits the Vercel function timeout and is terminated mid-run, leaving partial candidate batches — some candidates written to the DB, some not.

**Why it happens:**
The timeout constraint is misunderstood. With Fluid Compute enabled (now the default on all Vercel plans as of 2025), Hobby plan functions can run up to 300 seconds. However, if Fluid Compute is disabled, the Hobby limit is 60 seconds. The cron job in `vercel.json` currently sets `maxDuration=60` — that value was written before Fluid Compute and is now artificially conservative, but it remains the enforced limit until changed. Discovery adds substantially more work per cron invocation than scraping did.

**How to avoid:**
- Run discovery as a separate cron endpoint (`/api/cron/discover`) distinct from the scraping cron (`/api/cron/scrape`). This allows independent scheduling (discovery can run weekly, scraping daily) and independent `maxDuration` configuration.
- Update `maxDuration` on the discovery endpoint to 300 (the Hobby ceiling with Fluid Compute enabled). Confirm Fluid Compute is enabled in Vercel project settings before relying on the 300s limit.
- Cap the discovery batch per run to a fixed maximum (e.g., 10 new candidates per run) regardless of how many search results are returned. This provides a hard ceiling on run time even if candidates increase.
- Design for idempotency: if the discovery cron is interrupted mid-run, the next run should safely re-evaluate candidates that were partially processed without creating duplicate records.
- Do not run discovery and scraping in the same cron invocation — combined time will reliably exceed any reasonable timeout.

**Warning signs:**
- Discovery cron logs showing incomplete runs (some candidates written, job terminated without summary log)
- `maxDuration` export still set to 60 in the discovery route handler
- Vercel function logs showing "FUNCTION_INVOCATION_TIMEOUT" for the discovery endpoint
- The `discover` and `scrape` jobs sharing the same `/api/cron/scrape` route

**Phase to address:**
Discovery pipeline phase. Separate cron endpoint and `maxDuration` configuration must be in place before the discovery job runs in production. Do not reuse the existing scrape cron endpoint.

---

### Pitfall 20: Backfilling Categories on Existing Events Requires a Dedicated Migration

**What goes wrong:**
The `category` column is added to the `events` table via a migration. All existing events (the ~5,000+ events already in the database from v1.0/v1.1) have `category = NULL`. The category filter UI shows an empty "All categories" dropdown or produces misleading counts. Filtering by "Live Music" returns zero results until the next scrape run. The category backfill is treated as a future task and is never completed.

**Why it happens:**
Schema migrations add columns but don't populate data. The team ships the feature thinking the next scrape cron will populate categories. But the next cron only categorizes new events extracted after the code deployment — it does not retroactively categorize events that were already in the database without a `category` field.

**How to avoid:**
- Plan for a one-time backfill script as part of the categorization phase deliverable, not as a deferred task.
- The backfill script iterates existing events in batches (e.g., 50 at a time), sends each event's `performer` + `description` + `venue_type` to Gemini for classification, and updates the `category` column. Batch with delays to stay within Gemini rate limits.
- Run the backfill immediately after deploying the migration, before the feature is announced publicly.
- Add a database constraint or application-level check: the category filter UI should show a "(unclassified)" option or hide events with null category rather than silently excluding them.
- After the initial backfill, the ongoing scrape pipeline ensures new events are categorized at extraction time — no ongoing backfill needed.

**Warning signs:**
- `category` column exists in schema but `SELECT COUNT(*) FROM events WHERE category IS NULL` returns a large number after deployment
- Category filter UI showing all options but returning zero events
- No backfill script in the codebase at the time the migration is merged

**Phase to address:**
Categorization phase. Backfill script is a required deliverable for the phase that adds the `category` column. It is not optional post-launch work.

---

### Pitfall 21: Discovery Search API Has Hard Daily Query Limits That Block Production Use

**What goes wrong:**
The Google Custom Search JSON API (one natural choice for "find venues near Halifax") has a hard limit of 100 free queries per day. A discovery job that runs searches across 4 provinces with multiple query variations (e.g., "live music Halifax", "concerts Halifax", "Halifax pub events") easily burns 20–40 queries per run. At daily cron frequency, the free tier is exhausted in 2–5 days. Paid queries cost $5 per 1,000, but the API has been closed to new customers as of 2025 with a sunset date of January 2027. Alternative APIs (Tavily, SerpAPI) have their own limits and require separate API keys.

**Why it happens:**
Discovery via search is conceptually simple but the API economics are not checked before implementation. Developers assume search APIs are either free or trivially cheap. The daily limit structure (100 free, then paid) is not visible until production traffic begins. The Google Custom Search API sunset announcement is recent and easy to miss.

**How to avoid:**
- Run discovery at weekly frequency, not daily — venue discovery is not time-sensitive. Weekly runs dramatically reduce API query consumption (7× reduction).
- Pre-curate seed queries rather than running broad searches: use targeted queries like `"site:*.ca events Halifax pub"` or `"events Charlottetown PEI"` — fewer, higher-precision queries that return scrapeable venue pages rather than news articles.
- Consider curated seed lists as an alternative to live search: compile an initial list of 20–30 regional event directories and community calendars (e.g., local newspaper event listings, city.ca event pages), add them as static discovery seeds, and use the search API only for expansion beyond the seed list.
- Budget the search API explicitly: if using paid queries, set a monthly spend cap. Alert when approaching the cap.
- Use Tavily API as an alternative to Google Custom Search — 1,000 free searches per month, purpose-built for AI pipelines, and does not have the Google sunset risk.

**Warning signs:**
- Discovery job returning HTTP 429 "Quota Exceeded" from the search API
- Events listing showing no new sources despite discovery running successfully
- Search API cost line appearing on the billing dashboard for a job expected to be free

**Phase to address:**
Discovery pipeline phase. Confirm search API choice, limits, and query budget before writing the discovery cron logic. Run a manual test of the full query set to measure actual query count before automating.

---

## v1.4 — API Integrations, Multi-Page Scraping, Rate Limiting, Quality Metrics & Auto-Approve Pitfalls

### Pitfall 22: Songkick API Access Is Not Guaranteed — Application May Stall Indefinitely

**What goes wrong:**
The Songkick API requires an approved API key obtained through an application process. As of early 2026, Songkick has periodically paused new applications while making "changes and improvements to their API." The developer portal page accepts applications but processing timelines are undefined and have historically stretched to 30+ working days — or been suspended entirely with no ETA. Building the Songkick integration into the roadmap as a firm deliverable creates a hard blocker on an uncontrollable external dependency.

**Why it happens:**
Songkick is a mature platform with no public SLA on API key approvals. The API is free but gated. Developers assume approval is automatic or fast because the signup form exists. The actual status of new applications is not visible from outside; you only find out the application is stalled after weeks of silence.

**How to avoid:**
- Submit the Songkick API key application immediately when the milestone starts — do not wait until the integration phase. Processing time is outside your control.
- Treat Songkick as an optional enhancement with a fallback: if the key is not approved by the time the integration phase begins, skip Songkick and ship with Ticketmaster + Google Events. Do not hold the release.
- Check the Songkick API Google Groups forum for current status before investing any implementation time.
- If Songkick access remains unavailable, Bandsintown (already integrated as a pattern in v1.0) covers the artist-tour-dates use case. Songkick's incremental value over existing sources is limited for Atlantic Canada specifically — it indexes large touring acts, not small-venue local shows.

**Warning signs:**
- No email response from Songkick within 2 weeks of application
- Songkick API Google Groups showing recent posts about application closures
- Planning documents treating Songkick as a required deliverable rather than optional

**Phase to address:**
Apply immediately at milestone kickoff. Treat as best-effort in Phase 1 of v1.4 integration work. Build Ticketmaster and Google Events first; Songkick only if key arrives in time.

---

### Pitfall 23: Ticketmaster API Rate Limit Is 5 Requests/Second — But Daily Quota Is the Real Constraint

**What goes wrong:**
The Ticketmaster Discovery API has a default quota of 5,000 API calls per day and a rate limit of 5 requests per second. For a daily cron scraping Atlantic Canada events, the daily quota is the binding constraint, not the per-second limit. A naive implementation that paginates deeply through all Canadian events, then filters by province/city client-side, can exhaust the daily quota in a single run. When quota is exhausted, all subsequent calls return HTTP 429 for the rest of the calendar day — including any re-runs triggered by monitoring alerts.

**Why it happens:**
Developers focus on the per-second rate limit (easy to handle with throttling) and underestimate the daily quota impact of pagination. The Ticketmaster API's geographic filtering (`city`, `stateCode`, `countryCode`) reduces result sets, but Atlantic Canada's provinces require multiple queries (NB, NS, PEI, NL have separate `stateCode` values). Each province query may return multiple pages. The quota burn is non-obvious until the first full production run.

**How to avoid:**
- Use all available geographic filters in every request: `countryCode=CA`, `stateCode=NB` (or NS/PE/NL), and optionally `city=Halifax`. This reduces pages returned per query from dozens to 2–3.
- Fetch only upcoming events within a tight date window: `startDateTime=NOW` and `endDateTime=NOW+30days`. Do not paginate beyond the immediate 30-day horizon.
- Cache Ticketmaster responses aggressively. Venue details (address, lat/lng) and event metadata that doesn't change (artist, title, venue) should be cached for at least 6 hours. Only the event list itself needs daily refresh.
- Monitor daily quota consumption: log each API call to Ticketmaster with a running count. Alert when 80% of the daily quota (4,000/5,000 calls) is consumed.
- The Ticketmaster Discovery Feed is an alternative for high-volume use cases, but requires separate approval and is scoped to commercial partners. Not appropriate for this project.

**Warning signs:**
- HTTP 429 responses from Ticketmaster during the scrape cron
- Ticketmaster API call count in logs growing faster than (provinces × events_per_province)
- Cron completing but Ticketmaster events missing from DB despite known events in the region

**Phase to address:**
Phase 1 of v1.4 API integrations. Design the query strategy (geographic filters + date window + caching) before writing any Ticketmaster fetch code.

---

### Pitfall 24: Ticketmaster Terms of Service Restrict Event Data Caching and Commercial Use

**What goes wrong:**
Ticketmaster's Terms of Use state that developers "must not cache or store any Event Content other than for reasonable periods in order to provide the service you are providing." The definition of "reasonable" is intentionally vague. A developer stores Ticketmaster events in Neon Postgres indefinitely alongside scraped venue events, treating them as first-class records. If Ticketmaster data is used to attract traffic to a site that also displays ads or affiliate links, the ToS prohibition on deriving "revenues from the use or provision of the Ticketmaster API" applies. Key revocation can happen without notice.

**Why it happens:**
Developers read the API documentation (endpoints, parameters, response format) but skip the Terms of Use. The restrictions are in the legal docs, not the technical docs. "Caching for reasonable periods" is not defined, so developers assume it means "as long as needed."

**How to avoid:**
- Treat Ticketmaster data as ephemeral: store it in the database for display purposes but implement a TTL. Events fetched from Ticketmaster should be marked with `source=ticketmaster` and automatically expired/re-fetched on the next cron cycle rather than accumulated indefinitely.
- Do not present Ticketmaster events without attribution. Display "via Ticketmaster" on any event sourced from their API, linking back to the Ticketmaster event page.
- EastCoastLocal has no ads or affiliate revenue — this fits the "non-commercial" use pattern. If monetization is added in future, re-evaluate ToS compliance before using Ticketmaster data.
- Keep API keys in Vercel environment variables only. Do not commit them to git. Rotate keys immediately if suspected of leakage.

**Warning signs:**
- Ticketmaster-sourced events stored without a `source` column or TTL
- No attribution or link back to Ticketmaster on displayed events
- API key committed to git history (check with `git log -S "TICKETMASTER_API_KEY"`)

**Phase to address:**
Phase 1 of v1.4 API integrations. Data model for Ticketmaster events must include `source`, `source_event_id`, and a refresh/TTL strategy before any events are written to the database.

---

### Pitfall 25: Google Events Structured Data Is Not Present on Most Atlantic Canada Venue Sites

**What goes wrong:**
The plan assumes venue websites and event platforms expose Google Events structured data (JSON-LD `Event` schema). In practice, fewer than 20% of small-venue websites in Atlantic Canada implement structured data. Pubs, bars, and small theatres that hand-code their "shows" page or use basic WordPress sites rarely add JSON-LD. The integration that was expected to supplement or replace AI scraping for many sources instead yields data on only a handful of sources — usually the larger venues using EventBrite embed or a structured WordPress events plugin.

**Why it happens:**
Structured data is an SEO optimization, not a requirement. Small venue operators who manage their own sites are unlikely to implement it. Developers evaluate the technology (Google Event schema is well-documented) and assume adoption is widespread. They don't spot-check the actual target venues before committing to the integration.

**How to avoid:**
- Before implementing the extraction logic, manually audit the existing 26 venues: fetch each scrape source URL, look for `<script type="application/ld+json">` tags containing `"@type": "Event"`. Count how many actually have it. The number is likely 3–6.
- Set expectations accordingly: JSON-LD extraction is a high-confidence complement for venues that have it, not a replacement for Gemini-based extraction for those that don't. It should run first (cheap, zero LLM cost) and fall through to Gemini when absent.
- Design the scraper as a tiered pipeline: (1) check for JSON-LD Event schema and extract if present, (2) if not present, pass to Gemini. This reduces Gemini calls for venues that do have structured data.
- Track per-source `extraction_method` in the scrape logs to measure actual JSON-LD yield over time.

**Warning signs:**
- Assuming JSON-LD extraction will "work for most sources" without auditing the target set
- No fallback to Gemini extraction when JSON-LD is absent
- Gemini call count not decreasing after JSON-LD extraction is added (suggests JSON-LD is rarely present)

**Phase to address:**
Phase 1 of v1.4 API integrations. Audit target sites for JSON-LD coverage before writing any extraction code. Design as a tiered fallback, not a primary strategy.

---

### Pitfall 26: Multi-Page Pagination Multiplies Scrape Duration and Can Hit Vercel Timeout

**What goes wrong:**
Adding pagination support means the scraper follows "next page" links to retrieve all events from a multi-page listing. A venue with 4 pages of upcoming events now requires 4 fetches and 4 Gemini calls instead of 1. With 26 venues, if half have pagination and average 3 pages each, the scrape job goes from 26 to 52+ Gemini calls. With a 4-second throttle between calls, the job duration roughly doubles — from ~110 seconds to ~220 seconds. Combined with the existing API integrations (Ticketmaster, Songkick), the daily scrape cron becomes the longest-running function in the system and approaches the Vercel 300-second limit.

**Why it happens:**
Pagination is added to existing sources without re-evaluating the total job duration budget. Each page requires an additional fetch + LLM call + throttle delay. The additive cost is not modeled before implementation. The scrape cron's `maxDuration` was set conservatively and never revisited as new features increased job complexity.

**How to avoid:**
- Set a hard cap on pages followed per source: no more than 3 pages maximum. Events beyond page 3 are typically 2+ weeks out and will be scraped on the next cycle anyway.
- Only follow pagination if the previous page contained events within the target date window. If page 1 shows only events >30 days out, stop.
- Process paginated sources in parallel where possible: if 3 sources need pagination, fetch their pages concurrently (with per-domain rate limiting) rather than sequentially.
- After adding pagination, measure the full scrape job duration in staging before deploying. If duration exceeds 180 seconds (60% of the 300s limit), reduce the page cap or add parallelism.
- Consider splitting the scrape cron into two endpoints: one for API integrations (Ticketmaster, Songkick) and one for web scraping. This allows independent `maxDuration` tuning and prevents a slow API response from blocking all venue scraping.

**Warning signs:**
- Scrape cron duration growing proportionally to the number of paginated sources
- Vercel function logs showing jobs completing at 250+ seconds (danger zone)
- Gemini call count in logs significantly higher than source count (ratio > 2:1 signals deep pagination)

**Phase to address:**
Phase 2 of v1.4 (multi-page scraping). Set the page cap and measure duration impact before enabling pagination for all sources.

---

### Pitfall 27: Rate Limiting Logic Applied at the Wrong Scope — Per-Run Instead of Per-Domain

**What goes wrong:**
Rate limiting is implemented as a global delay: every outbound request waits 2 seconds before firing, regardless of domain. This means requests to domain-A and domain-B are unnecessarily serialized — waiting 2 seconds between them even though they could be sent simultaneously without overloading either server. The scrape job takes 2× longer than necessary. Alternatively, rate limiting is applied only globally and a source with 3 paginated pages hits the same domain 3 times in rapid succession with no per-domain throttle, triggering that site's bot detection while other domains are idle.

**Why it happens:**
Global rate limiting is the simplest implementation: one sleep/delay call before every fetch. Per-domain throttling requires tracking the last-request time per domain and coordinating concurrency — more code, more state. Developers default to simple global throttling and discover its limitations when the first multi-page source gets blocked.

**How to avoid:**
- Implement per-domain rate limiting: maintain a `Map<domain, lastRequestTime>`. Before each request, check when the last request to that domain was made; if less than the minimum interval (e.g., 2 seconds for small venues, 1 second for large platforms with explicit rate limits), wait the remainder.
- Allow concurrent requests to different domains. The limiting factor is per-domain load, not global request rate.
- Honor `Crawl-delay` from each domain's `robots.txt` — this is the site's declared preference. Respect it even if it is longer than your default delay.
- Add randomized jitter to delays (±500ms) to avoid creating a predictable request pattern that bot-detection systems recognize.
- For the Ticketmaster and Songkick APIs, use their documented rate limits (5 req/sec for Ticketmaster) as the ceiling, not the floor. Stay well below to avoid consuming quota faster than necessary.

**Warning signs:**
- Scrape duration scaling linearly with total source count instead of with max per-domain source count
- Anti-bot blocks (Cloudflare 403s, empty responses) on sources that were previously healthy
- `robots.txt` `Crawl-delay` directive present but not read or respected in the scraper

**Phase to address:**
Phase 2 of v1.4 (rate limiting). Design per-domain throttle with a `Map` before enabling multi-page scraping — the interaction between pagination and rate limiting is where most blocking occurs.

---

### Pitfall 28: Scrape Quality Metrics That Measure Output Volume Instead of Output Accuracy

**What goes wrong:**
Quality metrics are implemented as counts: events extracted per source, extraction success rate (non-null response), average events per run. These metrics look healthy even when the data is wrong. A source that returns 5 plausible-looking hallucinated events scores better than a source that returns 0 events because it correctly returned null when the page was a Cloudflare block. "Events extracted" is a proxy for quality, not a measure of it. Accuracy tracking — comparing extracted data against ground truth — is missing.

**Why it happens:**
Output counts are easy to implement (count rows inserted). Accuracy requires ground truth — knowing what the correct output should be — which requires either manual verification or a comparison baseline. Building ground-truth verification feels like extra work when the system is already scraping. It gets deferred until users complain about bad data.

**How to avoid:**
- Define quality metrics that measure confidence in addition to volume:
  - **Extraction confidence score:** Gemini returns a structured field indicating how confident it is in each extracted event (e.g., based on how complete and unambiguous the source data was). Flag low-confidence events for admin review rather than silently inserting them.
  - **Field completeness rate:** What percentage of extracted events have all required fields (performer, date, time, venue)? A high extraction rate with low completeness means the extractor is hallucinating partial records.
  - **False positive rate:** For sources previously verified as valid, what percentage of scrape runs return at least one event? A sudden drop signals a site change or block.
  - **Cross-source agreement rate:** When the same event appears in both a venue scrape and Ticketmaster, do the dates and titles match? Disagreement flags extraction errors.
- Store a `confidence_score` per scraped event. Surface low-confidence events in the admin dashboard for manual review.
- Do not build a quality dashboard that shows only green metrics — include amber (low confidence) and red (zero events for a historically active source) states.

**Warning signs:**
- Quality dashboard shows only aggregate counts (total events, total sources) with no per-event confidence signal
- No admin interface to review or override extracted event data
- Quality metrics improve as more sources are added, but user-reported data errors also increase

**Phase to address:**
Phase 3 of v1.4 (quality metrics). Define what "quality" means in the schema (confidence fields) before implementing any metrics display. Metrics that cannot be acted on are vanity metrics.

---

### Pitfall 29: Auto-Approve Threshold Tuned Too High Misses Good Sources; Too Low Approves Junk

**What goes wrong:**
Auto-approve is configured with a confidence threshold (e.g., approve sources scoring > 0.85 from the pre-screening LLM). In practice, the LLM's confidence scores are not calibrated to this threshold — the model returns 0.7–0.9 for most plausible-looking pages regardless of whether they actually host active event listings. Sources that score 0.86 and get auto-approved turn out to be venue homepages with no events calendar, empty placeholder pages, or seasonal venues closed for the winter. The admin sees a growing list of "approved" sources returning zero events.

**Why it happens:**
LLM confidence scores are not the same as classification accuracy. A score of 0.85 from Gemini's output means the model is 85% confident in its own assessment — it does not mean there is an 85% chance the source is a valid event calendar. The threshold is set based on the score range (0–1) without empirical calibration against real outcomes. The false positive rate is unknown until the system runs in production.

**How to avoid:**
- Do not treat LLM confidence scores as directly calibrated probabilities. Instead, use the score as one input among several signals.
- Require multiple positive signals for auto-approval, not just LLM confidence alone:
  1. LLM says YES (the source appears to list upcoming events)
  2. At least one event was successfully extracted from the source in a test scrape
  3. The extracted event has a date in the future (not a past event)
  4. The source URL does not match known non-event patterns (e.g., `/news/`, `/blog/`, `facebook.com`, `instagram.com`)
- Set the auto-approve threshold conservatively at launch (require all 4 signals). Monitor the false positive rate for the first month. Only loosen the threshold if false positives are consistently low.
- Auto-reject with high confidence: sources that clearly fail (no event keywords, Cloudflare block, social media login gate) should be auto-rejected without requiring admin review.
- Always show auto-approved sources in the admin dashboard with a distinct visual marker. The admin should be able to review and reverse any auto-approval. Auto-approve is a time-saver, not a trust boundary.

**Warning signs:**
- Auto-approved sources with zero events scraped in their first 2 weeks active
- Admin dashboard showing auto-approved sources without any reviewable confidence breakdown
- Confidence threshold set before any empirical measurement of score distribution on real Atlantic Canada venue URLs

**Phase to address:**
Phase 4 of v1.4 (auto-approve discovery). Implement the multi-signal approval logic and admin override UI before enabling auto-approve in production. Validate against 10–20 known-good and known-bad URLs before setting the threshold.

---

### Pitfall 30: Cross-Source Deduplication Becomes Harder When Ticketmaster Uses Its Own Event IDs

**What goes wrong:**
Ticketmaster returns events with its own stable identifiers (`id` field, e.g., `vvG1VZKS5_S0kl`). The existing deduplication key (normalized venue name + date + performer) was designed for scraped events where no external ID exists. When Ticketmaster reports "The Trews - Halifax" with its event ID and the venue's own website also lists the same show, the dedup key fails to match because venue name spellings differ ("The Casino Nova Scotia" vs. "Casino Nova Scotia") or the performer name has slight variation ("The Trews" vs. "The Trews - An Evening With..."). Two records for the same show persist in the database.

**Why it happens:**
The existing dedup strategy was designed for a single-source world and extended incrementally as sources were added. Adding a major API source (Ticketmaster) that has authoritative event identifiers but uses different naming conventions breaks the normalized-string dedup key. The mismatch is not caught in testing because test data is fabricated to match the normalization logic.

**How to avoid:**
- Add a `ticketmaster_event_id` column to the events table. When a Ticketmaster event is ingested, store its ID. On subsequent syncs, use the Ticketmaster ID as the primary dedup key for Ticketmaster-sourced events — do not rely on name normalization.
- When a scraped venue event and a Ticketmaster event are suspected duplicates (same venue, same date, overlapping artist names within edit distance 3), prefer the Ticketmaster record for official metadata (title, description, ticket URL) while retaining the scraped record's local context (venue-specific notes, door time vs. show time).
- Add a `source_event_id` column (nullable) to events that can hold any external API's stable identifier. This generalizes the pattern to Songkick and future API integrations without requiring per-source columns.
- Test deduplication with real Ticketmaster data against existing scraped events before enabling in production. Run the dedup query across the staging database and manually verify matches and non-matches.

**Warning signs:**
- Same show appearing twice in the event list after Ticketmaster integration is added
- `ticketmaster_event_id` is not in the events schema
- Dedup logic using only normalized string comparison with no external ID fallback

**Phase to address:**
Phase 1 of v1.4 (Ticketmaster integration). Extend the events schema and dedup logic before writing the first Ticketmaster fetch. This is a schema decision that affects all downstream phases.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Send raw HTML to LLM without preprocessing | Simpler pipeline | Token costs 10–25× higher; slower extraction | Never — always strip HTML before sending |
| Skip deduplication for first source | Faster to ship | Retroactively deduplicating a dirty DB is painful | Only for single-source MVP with explicit plan to add before source #2 |
| Use Nominatim public API for geocoding | Free, no API key | No uptime guarantee; will get rate-limited in production | Never in production |
| Hardcode scraping to fixed intervals | Simple to implement | Thrashes sources unnecessarily; blind to failures | Acceptable for MVP; add adaptive scheduling later |
| Store all events, never delete | No cleanup logic needed | DB bloat, slow queries, stale pins on map | Never — date expiry is mandatory |
| Run headless Chromium on Vercel | All infrastructure in one place | Hits 50MB bundle limit; fragile | Never — decouple scraping from Vercel |
| Skip source health monitoring | Faster initial build | Silent failures | MVP-acceptable with manual monitoring |
| Drive animation with `setInterval` instead of rAF | Simpler code | Frame drops, over-firing redraws, battery drain on mobile | Never — rAF is not harder |
| Use nuqs for animation time position | Consistent with existing state | Browser rate-limit errors, URL thrashing, sidebar lag | Never for high-frequency animation state |
| Build scrubber as a custom `div` slider | Full visual control | Keyboard inaccessible, fails WCAG 2.5.7 | Never — style a native `<input type="range">` |
| Top-level `import 'leaflet.heat'` instead of dynamic import | One fewer dynamic() call | SSR build failures in production | Never in Next.js |
| Filter events per-frame with `Array.filter` | Simple to read | O(n) work every 16 ms, grows with dataset | Never — pre-bucket at load time |
| Skip `map.removeLayer()` cleanup on HeatLayer unmount | Less boilerplate | Ghost layers, memory leak, duplicate event handlers | Never |
| Send discovered URLs directly to scrape queue without quality gate | Simpler pipeline | Queue fills with irrelevant sources; wastes Gemini calls | Never — staging table is mandatory |
| Open-ended category taxonomy (no fixed list) | Flexible, no upfront design | Label drift, unbounded category growth, broken filters | Never — define closed taxonomy first |
| Second LLM call for categorization after extraction | Separation of concerns | Doubles API call count, doubles scrape duration | Never — add category to extraction schema |
| Run discovery and scraping in one cron job | Single invocation | Combined timeout risk; can't tune independently | Never — separate endpoints |
| Skip category backfill for existing events | Faster to ship | Old events invisible to category filters | Never — backfill is mandatory before launch |
| Daily discovery search queries | More frequent updates | Exhausts free API quota in days | Never — weekly discovery is sufficient |
| Global rate limiting instead of per-domain | Simpler implementation | Unnecessary serialization slows scrape; per-domain pages still hit rate limits | Never — implement per-domain from the start |
| Pagination with no page cap | Gets all events | Multiplies Gemini calls; can exhaust daily budgets | Never — cap at 3 pages per source |
| Skip Ticketmaster ToS review | Faster to ship | Key revocation without notice; undefined caching violation | Never — read ToS before writing first line of integration |
| Store Ticketmaster events without source_event_id | Simpler schema | Dedup breaks; can't identify and update existing records on re-sync | Never — add source_event_id to schema before first insert |
| LLM confidence score as sole auto-approve gate | Simple threshold logic | Uncalibrated scores cause high false positive rate | Never — require multiple independent signals |
| Quality metrics as counts only (events extracted) | Easy to implement | Measures volume not accuracy; masks bad extractions | MVP-acceptable if confidence scoring is planned for v1.5 |
| Treat Songkick as a required milestone deliverable | Cleaner planning | Creates hard dependency on uncontrollable external approval | Never — mark as optional with fallback plan |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Eventbrite | Web-scraping the HTML listings | Use the official Eventbrite API (OAuth, 1000 req/hour) |
| Bandsintown | Scraping the website | Use the Bandsintown API (artist-name keyed, not venue-location based) |
| Nominatim | Using the public nominatim.openstreetmap.org in production | Use OpenCage, Google Maps Geocoding, or self-hosted Nominatim |
| Anthropic/OpenAI | Sending full HTML page as extraction context | Preprocess: strip scripts/styles/nav/footer; target main content |
| Vercel Cron | Expecting cron to handle long-running multi-source scrapes | Split into smaller batches or use an external worker |
| Cloudflare-protected sites | Assuming HTTP 200 means valid content | Validate response content, not just status code |
| Leaflet.heat + react-leaflet | Import at module top level | Dynamic `import()` inside `useEffect`, or second `dynamic()` boundary |
| Leaflet.heat + click events | Attach click handler directly to HeatLayer | Parallel spatial lookup against event dataset on map click |
| Leaflet.heat + react-leaflet v5 | Use v3 `createTileLayerComponent` patterns | Use `createElementHook` + `useLayerLifecycle` from v5 core API |
| nuqs + animation state | Write time position to URL on every animation tick | Keep in `useRef`/Zustand; only commit to nuqs on pause or scrub-end |
| HeatLayer + MapContainer | Assume React reconciliation removes the Leaflet layer | Explicitly call `map.removeLayer()` in `useEffect` cleanup |
| `next build` + Leaflet plugins | Test only in `next dev` where SSR is more forgiving | Always test `next build && next start` before considering any integration done |
| Google Custom Search JSON API | Treat as production-ready discovery tool | API closed to new customers (sunset Jan 2027); prefer Tavily or curated seeds |
| Gemini for categorization | Separate categorization API call after extraction | Add `category` field to extraction schema — one call does both |
| Vercel maxDuration | Leave at 60s for discovery job | Update to 300s and confirm Fluid Compute is enabled; separate discovery endpoint |
| Discovery → scrape_sources | Write all discovered URLs directly to scrape_sources | Stage in `discovery_candidates`, quality-gate before promotion |
| Ticketmaster Discovery API | Paginate broadly without geographic filters | Use countryCode + stateCode + date window; cache responses; monitor daily quota |
| Ticketmaster ToS | Treat event data as first-class DB records with unlimited retention | Mark source, set TTL, display attribution, link back to Ticketmaster |
| Songkick API | Treat as guaranteed integration | Apply immediately; treat as optional with fallback to Bandsintown |
| Google Events JSON-LD | Assume widespread adoption in Atlantic Canada venue sites | Audit target sites first; expect 20% coverage; build as tiered fallback before Gemini |
| Multi-page scraping | Follow all pages without a cap | Limit to 3 pages per source; stop early if events are beyond 30-day window |
| Rate limiting | Apply global per-request delay | Implement per-domain throttle with last-request-time tracking per domain |
| Auto-approve threshold | Single LLM confidence score | Require multiple independent signals: LLM YES + successful test extraction + future date |
| Cross-source deduplication | Rely on normalized string matching for API sources | Use external API's stable event ID as primary dedup key; string match as fallback |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| All map pins rendered as DOM elements simultaneously | Map lags; mobile stutters | Use Supercluster; only render markers in viewport | At ~500+ simultaneous pins without clustering |
| Querying all events without date filter | API response grows unbounded | Always filter `WHERE event_date >= NOW()`; index `event_date` | At ~10,000 accumulated historical events |
| Geocoding on every scrape run | API costs accumulate; scrape slows | Geocode once per venue; re-geocode only on address change | Immediately |
| LLM called synchronously during Vercel function | Timeout risk; request hangs | Scraping always async/background; app reads from DB only | On any scrape >10s (common) |
| Running all scrapers serially in one job | Job too long; hits timeout | Batch into parallel groups or per-source cron jobs | At ~20+ sources in series |
| `setLatLngs()` called more than once per rAF frame | Stuttery animation; high CPU | Single rAF loop as the sole caller of `setLatLngs` | Immediately on mobile |
| Per-frame `Array.filter` over full event dataset | Scrubber lag grows with event count | Pre-bucket events into time-window lookup at load | Noticeable above ~500 events |
| Sidebar re-renders every animation frame | UI flicker; React reconciliation overhead | Throttle sidebar updates to 250 ms during playback | Immediately visible in React DevTools Profiler |
| Multiple competing rAF loops after mode toggle | CPU stays high after leaving heatmap mode | Strict rAF cleanup via `useRef` + `useLayoutEffect` | After first toggle cycle |
| Fetching full event objects for heatmap points | Slow initial load; memory pressure | Fetch only lat/lng/timestamp for heatmap; fetch detail on click | Noticeable above ~1,000 events on mobile |
| Two LLM calls per source (extract + categorize) | Scrape cron 2× longer; API cost doubles | Combine categorization into extraction schema | Immediately — doubles cost from day one |
| Discovery + scraping in one cron invocation | Combined time exceeds maxDuration | Separate `/api/cron/discover` and `/api/cron/scrape` | At 10+ discovery candidates + 26 scrape sources |
| Evaluating all discovered candidates in one batch | Discovery cron times out | Cap candidates evaluated per run (e.g., 10/run) | At ~15+ candidates with 4s LLM throttle |
| Global rate limiting instead of per-domain | Scrape job takes 2× longer than necessary | Per-domain `Map<domain, lastRequestTime>` with concurrent cross-domain requests | Immediately — all sources serialized unnecessarily |
| No pagination page cap | Multi-page sources consume unbounded Gemini calls | Hard cap at 3 pages per source; stop if events are outside date window | At first source with 5+ pages of events |
| Ticketmaster requests without geographic filters | Daily quota exhausted in one run | Always pass countryCode + stateCode + startDateTime/endDateTime | On first production run without filters |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ignoring robots.txt and ToS | Legal liability; PIPEDA data compliance; breach of contract | Always check and respect `robots.txt`; use official APIs where available |
| Storing LLM API keys without rotation plan | Key leakage exposes billing to abuse | Use Vercel env vars; never commit keys; set spend alerts |
| No rate limiting on outbound scraper requests | IP ban risk; could be construed as DoS | Enforce minimum 2-second delay per domain; honor `Crawl-delay` |
| No validation of LLM output before DB insert | Malformed strings breaking queries or display | Validate all extracted fields against schema; reject null dates |
| Discovery scraping sites that block AI crawlers | Cloudflare AI crawler block; potential legal risk | Check `robots.txt` `User-agent: *` and `User-agent: GPTBot` disallow rules before fetching |
| Ticketmaster API key committed to git | Key revocation; ToS violation; potential billing abuse by third parties | Store in Vercel env vars only; audit git history for accidental commits |
| Caching Ticketmaster data beyond "reasonable" periods | ToS violation; potential key revocation without notice | Implement TTL on Ticketmaster-sourced events; re-fetch on next cron cycle |
| Auto-approving sources without admin override capability | Bad actors could submit URLs for approval (if discovery pipeline is ever exposed); approved junk inflates event counts | Auto-approve is never final without admin visibility; always expose approved sources in admin UI with revocation |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "no events found" state when filters empty | Users think app is broken | Show explicit empty state with suggestions |
| Map loads too zoomed out (all of Atlantic Canada) | Pins cluster into one blob | Default to user's approximate location or densest event area (Halifax/Moncton) |
| Event list sorted by insertion order | Users can't find relevant events | Sort by date ascending (soonest first) |
| No indication data is scraped and may be stale | Users plan based on incorrect data | Show "last updated" timestamp; "Verify with venue before attending" disclaimer |
| Clicking map pin shows only basic info | Users want more context | Event detail card: band, venue, date/time, link to source page |
| Mobile map unusable because pins too small | High bounce rate on mobile | Cluster until individual pins have 44px+ tap targets |
| No loading state while heatmap data fetches | Map appears broken | Show skeleton/spinner in map area during heatmap data load |
| Heatmap active with no events in time window | Empty map with no explanation | Overlay "No events in this time window" message |
| Play advances time but map doesn't visibly change | User thinks feature is broken | Ensure at least one visible heatmap change per play tick |
| Timeline scrubber jumps on touch tap (not drag) | Disorienting on mobile — position teleports | Distinguish tap-to-seek from drag-to-scrub; show time tooltip during drag |
| Heatmap and cluster mode both active simultaneously | Confusing visual overlap | Modes are mutually exclusive; hide cluster layer entirely in heatmap mode |
| Category filter shows "Other" as dominant category | Users can't find specific event types | Review taxonomy; common event types should be first-class categories, not "other" |
| Category filter shows too many options (10+) | Filter UI becomes overwhelming | Keep taxonomy to 6–8 categories; "other" is a catch-all |
| Events with null category invisible to category filter | Users miss real events | Show uncategorized events under "All" but exclude from specific category filters, or default to "other" |
| Ticketmaster events displayed without ticket link | Users can't act on the discovery | Always include the Ticketmaster `url` field; link "Get Tickets" to the Ticketmaster event page |
| Quality score shown to users | Confuses users; implies uncertainty about all data | Quality/confidence metrics are admin-only; public view shows only verified events |
| Auto-approved source with 0 events shown on live site | Broken-looking empty venue in the list | Auto-approved sources do a test scrape before going live; suppress in public view if no events extracted |

---

## "Looks Done But Isn't" Checklist

**v1.0 Scraping:**
- [ ] **Scraper:** Validates response content before calling LLM — detects Cloudflare challenge pages
- [ ] **Extraction:** Returns null for missing fields rather than hallucinated values — test with a page that has no time listed
- [ ] **Deduplication:** Second ingestion of the same event updates the record rather than creating a duplicate
- [ ] **Geocoding:** Runs at venue creation time only — confirm geocoding API is not called on every scrape run
- [ ] **Past event cleanup:** Events dated yesterday do not appear on map or in list after cleanup job runs
- [ ] **Map clustering:** Works on mobile — test at zoom ~6-7 for Atlantic Canada overview
- [ ] **Source health:** Zero events from a source for 3 consecutive runs triggers an alert
- [ ] **Token usage:** Logged per scrape run; cost per run visible and within budget
- [ ] **Vercel timeout:** Scrape job does not hit function timeout on a full realistic run

**v1.1 Heatmap Timelapse:**
- [ ] **SSR build:** `next build` completes without `window is not defined` errors before any other heatmap work proceeds
- [ ] **Animation cleanup:** Toggle to cluster view and back 10 times; DevTools heap must stabilize; Leaflet `_layers` count must not grow
- [ ] **Click-through:** Click a heatmap hotspot — nearby events appear; click ocean or empty area — nothing appears and no error is thrown
- [ ] **Keyboard accessibility:** Tab reaches the scrubber; arrow keys change time position; Space toggles play/pause; screen reader announces current time value
- [ ] **Mobile scrubber:** Drag scrubber on a touch device — animation tracks finger without jank; map remains pannable (touch events not fully consumed by scrubber)
- [ ] **Sidebar sync:** Advance time window manually — sidebar updates within 250 ms; no stale events visible
- [ ] **Empty time window:** Advance to a time with no events — empty state message appears; no crash or frozen UI
- [ ] **Ghost layer:** Switch to cluster mode; DevTools Elements panel must show no heatmap canvas element in the DOM

**v1.2 Discovery & Categorization:**
- [ ] **Staging table:** Discovered URLs land in `discovery_candidates`, not directly in `scrape_sources` — verify no direct insert
- [ ] **Venue dedup:** Two search queries returning the same domain result in one candidate entry, not two — check domain normalization logic
- [ ] **Quality gate:** A non-event page (e.g., a news article about a concert) is rejected before a Gemini call is made — test with a known non-event URL
- [ ] **Category taxonomy enforcement:** `SELECT DISTINCT category FROM events` returns only values in the defined taxonomy — zero novel labels
- [ ] **Combined extraction+categorization:** Scrape cron logs show one Gemini call per source, not two — verify no separate categorization call
- [ ] **Backfill complete:** `SELECT COUNT(*) FROM events WHERE category IS NULL` returns zero before the feature is announced
- [ ] **Discovery timeout:** Discovery cron completes without `FUNCTION_INVOCATION_TIMEOUT` — verify `maxDuration=300` on discovery endpoint and Fluid Compute is enabled
- [ ] **Search API budget:** Discovery job does not exhaust daily search API quota — test a full weekly discovery batch manually and count queries used
- [ ] **Separate cron endpoints:** `/api/cron/discover` and `/api/cron/scrape` are independent routes with independent `maxDuration` settings

**v1.4 API Integrations, Multi-Page, Rate Limiting, Quality Metrics, Auto-Approve:**
- [ ] **Ticketmaster schema:** Events table has `source`, `source_event_id`, and TTL field before first Ticketmaster event is inserted
- [ ] **Ticketmaster dedup:** Re-syncing Ticketmaster updates an existing record rather than inserting a duplicate — verify with a known event fetched twice
- [ ] **Ticketmaster attribution:** Every event sourced from Ticketmaster displays "via Ticketmaster" with a link to the source event page
- [ ] **Ticketmaster quota:** Daily API call count logged; alert fires before 4,000/5,000 quota is reached
- [ ] **Songkick contingency:** If no API key by integration phase start, Songkick is skipped and milestone ships without it — fallback plan documented
- [ ] **JSON-LD audit:** At least 20 of 26 existing scrape sources have been manually checked for `<script type="application/ld+json">` Event schema — coverage count documented
- [ ] **JSON-LD fallback:** Scraper falls through to Gemini extraction when JSON-LD is absent — test with a source known to have no structured data
- [ ] **Pagination cap:** No scrape source follows more than 3 pages — verify in scrape logs that page count never exceeds 3
- [ ] **Scrape duration:** Full scrape cron with pagination and API integrations completes in under 240 seconds — measure in staging before deploying
- [ ] **Per-domain rate limiting:** Two pages from the same domain are not fetched less than 2 seconds apart — verify with scrape timing logs
- [ ] **robots.txt compliance:** Crawl-delay directive read and respected for each scrape source — add to scraper initialization
- [ ] **Quality confidence field:** `confidence_score` column exists on events table and is populated by Gemini extraction
- [ ] **Admin quality view:** Low-confidence events (score < 0.7) are surfaced in admin dashboard for review — not silently accepted
- [ ] **Auto-approve multi-signal:** Auto-approved sources satisfy all 4 conditions (LLM YES + test extraction succeeded + future event date + no known junk URL pattern)
- [ ] **Auto-approve override:** Admin can see and revoke any auto-approved source from the dashboard — test revocation flow
- [ ] **False positive rate:** First 20 auto-approved sources reviewed manually after 2 weeks; false positive rate documented before adjusting threshold

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate events already in DB | MEDIUM | Write a one-time dedup migration: identify by composite key, merge, delete extras |
| Wrong geocoordinates for venues | LOW | Re-geocode all venues with a script; few records to fix |
| Stale events clogging DB | LOW | One-time cleanup query + add index on `event_date` |
| LLM cost spike from raw HTML | LOW-MEDIUM | Add preprocessing; past spend gone but future runs fixed quickly |
| Scraper silently blocked | LOW (technical) / HIGH (trust) | Add response validation; re-run with corrected approach |
| Chromium on Vercel bundle size | HIGH | Architecture change: decouple scraper to separate service |
| Ghost heatmap layer / no cleanup | LOW | Add `map.removeLayer()` to `useEffect` cleanup; verify with `_layers` inspection |
| SSR build failure from plugin import | LOW | Move plugin import inside `useEffect` dynamic import; re-run `next build` |
| Animation loop leak | MEDIUM | Refactor loop to use `useRef` for frame ID + `useLayoutEffect`; verify with repeated toggles |
| Click-through silently broken | MEDIUM | Replace layer click handler with spatial proximity query on event dataset |
| Sidebar desync | MEDIUM | Lift time window state to shared Zustand atom; rewire both consumers |
| Scrubber keyboard inaccessible | LOW | Replace `div` slider with styled `<input type="range">` + `aria-valuetext` |
| Per-frame filter performance | MEDIUM | Pre-bucket events at load; replace Array.filter with O(1) lookup; measure in Performance panel |
| Irrelevant sources in scrape queue | MEDIUM | Write a one-time script to evaluate existing `scrape_sources` for zero-event history; disable confirmed duds; add quality gate going forward |
| Inconsistent category labels in DB | HIGH | Write a one-time normalization migration: map known variants to canonical taxonomy slugs; re-run extraction for remaining nulls |
| Double LLM calls for categorization | LOW | Merge categorization into extraction schema; redeploy; no data migration needed |
| Discovery cron timeout | LOW | Reduce batch size per run; update `maxDuration`; split into separate endpoint |
| Uncategorized events after schema migration | MEDIUM | Run backfill script in batches with delay; verify zero null categories before announcing feature |
| Search API quota exhausted | LOW | Switch to weekly schedule; reduce query count per run; evaluate Tavily as alternative |
| Ticketmaster daily quota exhausted | LOW | Add geographic filters and date window; reduce pagination depth; cache responses; wait until next calendar day |
| Ticketmaster ToS violation discovered post-launch | HIGH | Immediately add TTL on stored events; add attribution; contact Ticketmaster developer support proactively |
| Songkick API not approved | LOW | Skip Songkick; ship milestone with Ticketmaster + Google Events; revisit in v1.5 |
| JSON-LD extraction yielding near-zero events | LOW | Confirm via audit; adjust implementation to treat as optional complement; ensure Gemini fallback is working |
| Scrape job timing out after pagination added | MEDIUM | Reduce page cap to 2; implement per-domain parallelism; split API and scrape crons |
| Auto-approve false positives accumulating | MEDIUM | Raise confidence threshold; add test-extraction requirement; manually disable bad sources; review and recalibrate thresholds |
| Duplicate Ticketmaster events in DB | MEDIUM | Add `source_event_id` column; write migration to deduplicate by Ticketmaster ID; update ingestion to upsert on ID |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Chromium/Vercel size limit | Phase 1: Infrastructure setup | Deploy hello-world scraper job; confirm execution environment |
| LLM hallucinating dates/times | Phase 2: Scraping & extraction | Test with page missing time field; confirm null returned, not invented |
| Token cost explosion | Phase 2: Scraping & extraction | Log token usage on first 5 sources; confirm cost within budget |
| Event deduplication | Phase 2: Data storage/schema | Re-scrape same source twice; event count must not increase |
| Geocoding accuracy | Phase 2: Data storage/schema | Spot-check 10 venue coordinates; all within 500m of actual location |
| Stale event accumulation | Phase 2: Data storage/schema | Test event dated yesterday does not appear after cleanup job |
| Anti-bot blocking | Phase 2: Scraping & extraction | Validate response detection catches Cloudflare pages |
| Map clustering performance | Phase 3: Map UI | 500 test pins; no visible lag on mid-range mobile |
| UX empty states and trust signals | Phase 3: Map UI | All zero-result filter combinations show explicit empty state |
| No click-through via HeatLayer events | Phase 4: Heatmap interaction | Click hotspot → events appear; click empty area → nothing, no error |
| Animation loop memory leak | Phase 4: Play/pause animation | Heap stable after 10 toggle cycles; rAF cleanup confirmed |
| SSR build failure from plugin import | Phase 4: HeatLayer setup (first task) | `next build` passes before any other heatmap work |
| `setLatLngs` main-thread blocking | Phase 4: Timeline scrubber | rAF callback < 16 ms; scrubber smooth at 60 fps |
| Scrubber keyboard inaccessibility | Phase 4: Timeline scrubber UI | Arrow keys control time; Tab reaches scrubber; screen reader announces value |
| Sidebar/heatmap time desync | Phase 4: Sidebar sync | Sidebar updates within 250 ms of time position change during playback |
| Ghost heatmap layer on toggle | Phase 4: Mode toggle | Elements panel shows no canvas in cluster mode; `_layers` count stable |
| Irrelevant sources flooding queue | v1.2 Phase: Discovery pipeline | Non-event URL rejected before Gemini call; staging table count stable |
| Duplicate venue discovery | v1.2 Phase: Discovery pipeline | Same domain from two searches produces one candidate; domain uniqueness enforced |
| Inconsistent AI category labels | v1.2 Phase: Categorization | `SELECT DISTINCT category FROM events` returns only taxonomy values |
| Extra Gemini call for categorization | v1.2 Phase: Categorization | Scrape logs show one call per source; API billing confirms no increase in call count |
| Discovery cron timeout | v1.2 Phase: Discovery pipeline | Discovery cron completes under 300s; separate endpoint with correct maxDuration |
| Category backfill not completed | v1.2 Phase: Categorization | Zero null categories in production before feature launch |
| Search API quota exhaustion | v1.2 Phase: Discovery pipeline | Manual test of full query set counts total queries; weekly schedule verified |
| Ticketmaster schema missing source_event_id | v1.4 Phase 1: Ticketmaster integration | Events table has `source_event_id`; dedup uses ID not name normalization |
| Ticketmaster daily quota exhaustion | v1.4 Phase 1: Ticketmaster integration | Staging run with full geographic filters measures actual call count per run |
| Ticketmaster ToS non-compliance | v1.4 Phase 1: Ticketmaster integration | Attribution visible on every Ticketmaster event; TTL enforced in DB |
| Songkick API access stall | v1.4 Phase 0: Apply immediately | Application submitted day 1; fallback plan documented |
| JSON-LD low coverage in Atlantic Canada | v1.4 Phase 1: JSON-LD extraction | Manual audit of 26 sources complete; coverage percentage documented before code is written |
| Multi-page scrape timeout | v1.4 Phase 2: Pagination | Full scrape cron with pagination measures under 240s in staging |
| Per-request global rate limiting | v1.4 Phase 2: Rate limiting | Per-domain throttle implemented; same-domain requests spaced ≥2s; cross-domain concurrent |
| Scrape quality metrics as vanity counts | v1.4 Phase 3: Quality metrics | Confidence score stored per event; low-confidence events visible in admin dashboard |
| Auto-approve false positives | v1.4 Phase 4: Auto-approve | Multi-signal gate implemented; first 20 auto-approvals reviewed manually after 2 weeks |
| Cross-source dedup failure with API events | v1.4 Phase 1: Schema design | Re-sync of same Ticketmaster event produces update not insert; verified in staging |

---

## Sources

**v1.0 Scraping:**
- Kadoa: [Best AI Web Scrapers of 2026](https://www.kadoa.com/blog/best-ai-web-scrapers-2026)
- ScrapingAnt: [Building a Web Data Quality Layer - Deduping, Canonicalization](https://scrapingant.com/blog/building-a-web-data-quality-layer-deduping-canonicalization)
- Nominatim Usage Policy: [OSM Foundation Geocoding Policy](https://operations.osmfoundation.org/policies/nominatim/)
- Vercel: [Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- Vercel: [Deploying Puppeteer with Next.js](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)
- ZenRows: [How to Bypass Cloudflare When Web Scraping](https://www.zenrows.com/blog/playwright-vercel)
- Eventbrite: [API Terms of Use](https://www.eventbrite.com/help/en-us/articles/833731/eventbrite-api-terms-of-use/)
- Bandsintown: [API Documentation](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation)

**v1.1 Heatmap Timelapse:**
- [Leaflet.heat GitHub — Issue #61: Clickable/hoverable points?](https://github.com/Leaflet/Leaflet.heat/issues/61) — confirms no built-in click event support
- [Leaflet/Leaflet.heat source: HeatLayer.js](https://github.com/Leaflet/Leaflet.heat/blob/gh-pages/src/HeatLayer.js/) — `setLatLngs` → `redraw()` implementation
- [react-leaflet GitHub — Issue #941: Heap memory build-up when MapContainer is removed](https://github.com/PaulLeCam/react-leaflet/issues/941) — confirmed layer leak on unmount
- [React-Leaflet core API docs](https://react-leaflet.js.org/docs/core-api/) — `useLayerLifecycle` hook
- [React, Leaflet, and SSR — Jan Müller](https://janmueller.dev/blog/react-leaflet/) — dynamic import pattern for Next.js
- [WCAG 2.2 SC 2.5.7 — Dragging Movements (Level AA)](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — requires non-drag alternative
- [Frontend Memory Leaks empirical study — stackinsight.dev](https://stackinsight.dev/blog/memory-leak-empirical-study/) — 86% of React repos missing cleanup; ~8 KB/cycle rAF leak
- [requestAnimationFrame vs useEffect — Jakub Arnold's Blog](https://blog.jakuba.net/request-animation-frame-and-use-effect-vs-use-layout-effect/) — `useLayoutEffect` required for synchronous rAF cleanup
- [nuqs GitHub — 47ng/nuqs](https://github.com/47ng/nuqs) — browser rate-limit on URL updates; throttle/debounce capabilities
- [Andrej Gajdos — High-Performance Map Visualizations in React](https://andrejgajdos.com/leaflet-developer-guide-to-high-performance-map-visualizations-in-react/) — React re-render cost with Leaflet layers

**v1.2 Discovery & Categorization:**
- [Vercel — Configuring Maximum Duration for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration) — Hobby plan: 300s with Fluid Compute enabled; 60s without
- [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — cron timeout limits identical to function limits; idempotency requirements
- [Gemini API Pricing — Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) — Gemini 2.5 Flash: $0.30/$2.50 per 1M tokens; 50% batch discount
- [LLM Model Drift — Handling and Detection](https://byaiteam.com/blog/2025/12/30/llm-model-drift-detect-prevent-and-mitigate-failures/) — consecutive runs on same model yield drift score 0.575 from formatting regressions
- [LLM Drift Detection — earezki.com](https://earezki.com/ai-news/2026-03-12-we-built-a-service-that-catches-llm-drift-before-your-users-do/) — 35% error rate increase on unchanged models over 6 months
- [Google Custom Search JSON API — closed to new customers](https://developers.google.com/custom-search/v1/overview) — sunset January 2027
- [Google Custom Search API Daily Limit — Expertrec](https://blog.expertrec.com/google-custom-search-api-daily-limit/) — 100 free queries/day; $5/1000 paid
- [Tavily API Pricing — Firecrawl blog comparison](https://www.firecrawl.dev/blog/best-web-search-apis) — 1,000 free searches/month; purpose-built for AI pipelines
- [Schema Migration Backfill Strategies — LogRocket](https://blog.logrocket.com/how-to-migrate-a-database-schema-at-scale/) — batched backfill to avoid production traffic impact
- [How to Solve Next.js Timeouts — Inngest Blog](https://www.inngest.com/blog/how-to-solve-nextjs-timeouts) — splitting cron jobs into smaller invocations
- [Event Data Scraping Architecture Guide — GroupBWT](https://groupbwt.com/blog/events-data-scraping/) — source quality filtering and deduplication patterns

**v1.4 API Integrations, Multi-Page, Rate Limiting, Quality Metrics, Auto-Approve:**
- [Ticketmaster Discovery API — Developer Portal](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) — rate limits (5 req/sec, 5,000/day), pagination constraints, geographic filter parameters
- [Ticketmaster Terms of Use — Developer Portal](https://developer.ticketmaster.com/support/terms-of-use/) — caching restrictions ("reasonable periods"), attribution requirements, commercial use prohibition
- [Ticketmaster FAQs — Developer Portal](https://developer.ticketmaster.com/support/faq/) — quota structure; Discovery Feed alternative for high-volume use
- [Songkick Developer Portal — Getting Started](https://www.songkick.com/developer/getting-started) — application process; API key required; access gated by approval
- [Songkick API — Access Support Article](https://support.songkick.com/hc/en-us/articles/360012423194-Access-the-Songkick-API) — "currently making changes and improvements; unable to process new applications"
- [Songkick API Google Groups](https://groups.google.com/g/songkick-api) — community discussion of key application stalls and status
- [Google Event Structured Data — Search Central](https://developers.google.com/search/docs/appearance/structured-data/event) — required/recommended fields; JSON-LD format; validation via Rich Results Test
- [Common Structured Data Pitfalls — Lumar](https://www.lumar.io/blog/best-practice/common-structured-data-pitfalls-and-how-to-avoid-them/) — midnight default time errors, syntax parsing failures, content mismatch issues
- [Web Scraping Rate Limiting — Scrape.do](https://scrape.do/blog/web-scraping-rate-limit/) — per-domain throttling; randomized delay patterns; backoff strategies
- [Avoiding IP Bans — affinco.com](https://affinco.com/avoid-ip-bans-scraping/) — user-agent rotation; session management; request pacing
- [Vercel Functions Timeout — Knowledge Base](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) — Hobby plan limits; Fluid Compute extension
- [Confidence Threshold Calibration — Conifers AI](https://www.conifers.ai/glossary/confidence-threshold-calibration) — LLM score calibration; precision-recall tradeoffs for auto-approve thresholds
- [Zero False Positives in Deep Learning — Scylla](https://www.scylla.ai/zero-false-positives-in-deep-learning-an-achievable-goal%E2%80%94but-one-that-could-easily-backfire/) — risks of over-optimization on false positive elimination
- [LLM Evaluation Metrics — Confident AI](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation) — field-level confidence scoring; hallucination detection patterns
- [Neon Postgres Connection Pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer transaction mode; connection limits per project; serverless function connection patterns



---

## v1.5 — Cross-Source Deduplication, Venue Merge, Map Interaction, and Timelapse Filter Pitfalls

### Pitfall 31: Cross-Source Event Dedup Fails Because the Same Venue Has Two Different `venue_id` Values

**What goes wrong:**
The existing dedup key is `(venue_id, event_date, normalized_performer)`. This works perfectly when both sources write to the same venue record. But Ticketmaster creates new venue records via `findOrCreateVenue()` using `ilike` on the TM-provided venue name — which often differs from the manually-entered venue name. "Casino Nova Scotia" (TM) vs. "Scotiabank Centre" or "Live! Casino Halifax" — the `ilike` match fails, a new venue row is inserted, and the same concert now has two database records at two different `venue_id` values. The composite dedup key never fires because it requires a matching `venue_id`.

**Why it happens:**
The root assumption of the dedup scheme is "same venue = same `venue_id`." This holds when all sources route through the same venue lookup — but Ticketmaster's `findOrCreateVenue()` is an exact-match `ilike` against the TM-supplied name. Atlantic Canada venue naming is inconsistent: abbreviations, "The" prefixes, branding changes, and TM-specific labels all diverge from the admin-entered canonical name. The `ilike` falls through, creates a ghost venue, and the dedup key becomes useless.

**How to avoid:**
- Add geo-proximity matching to `findOrCreateVenue()`: before creating a new venue, query for existing venues within ~250 meters of the TM-provided geocoordinates. If one is found, return its `id` rather than inserting. Geocoordinates are more stable than names.
- If geocoordinates are unavailable, fall back to trigram similarity on venue name + city: `similarity(name, $1) > 0.6 AND city = $2`. The `pg_trgm` extension is available on Neon (confirmed supported, installed in 10k+ Neon databases).
- Never rely solely on `ilike` for venue identity across sources. `ilike` requires exact case-insensitive match — it cannot catch "Scotiabank Centre" vs. "Casino Nova Scotia."
- After geo/fuzzy match, log every "matched existing venue" decision so the admin can audit false positives.

**Warning signs:**
- Two venue rows with nearly identical `lat`/`lng` values in the database
- The same physical location appearing twice in the map's cluster layer
- `findOrCreateVenue()` logs showing high insertion rate relative to TM event count (suggests matching is failing)
- Admin venue list showing entries like "Casino Nova Scotia" alongside a pre-existing "Scotiabank Centre" at the same address

**Phase to address:**
The deduplication phase (v1.5). The fix to `findOrCreateVenue()` must happen before any cross-source dedup logic is built on top of it — the venue merge is the prerequisite to all event-level dedup.

---

### Pitfall 32: Venue Merge Is Irreversible Without an Audit Trail

**What goes wrong:**
An automated venue merge incorrectly identifies two different physical venues as duplicates (e.g., two bars on the same block with similar names) and merges all events from one into the other. Events are now under the wrong venue. If the merge is a hard `UPDATE venue_id` + `DELETE` of the ghost venue, there is no way to identify which events were affected or restore the original state. The only recovery is manual inspection of every event — expensive and error-prone with hundreds of events.

**Why it happens:**
Fuzzy matching has a false positive rate. A similarity threshold of 0.6 on trigrams catches most matches but also catches legitimate near-misses. "The Marquee Club" and "The Marquee Ballroom" are different venues that would score > 0.6 on trigram similarity. When merge is automated without an audit log, false positives cause irreversible data corruption.

**How to avoid:**
- Never auto-merge with a hard `DELETE`. Instead, implement soft merge: add a `canonical_venue_id` column to the venues table. Duplicate venues point to their canonical. Events are not moved; queries JOIN through the canonical.
- Alternatively: log every merge decision to a `venue_merge_log` table (ghost_venue_id, canonical_venue_id, similarity_score, merged_at, method). If a merge is found to be wrong, the log enables reversal with a targeted `UPDATE`.
- For automated fuzzy matches above threshold but below a high-confidence threshold (e.g., 0.6–0.85), stage for admin review rather than auto-merging. Auto-merge only when similarity > 0.9 AND geocoordinates are within 50 meters.
- Surface the merge queue in the admin dashboard — same interface as discovery review — so the admin can approve or reject each proposed merge.

**Warning signs:**
- Venue merge logic uses `DELETE` without logging the deleted ID and its events
- No admin interface to review pending venue merges before they execute
- Merge threshold set to a single value without empirical testing on the actual Atlantic Canada dataset

**Phase to address:**
Venue deduplication phase (v1.5). The audit trail and admin review queue must be designed before the first automated merge runs against production data.

---

### Pitfall 33: Cross-Source Event Dedup Using Performer Name Normalization Breaks on Bands With Articles, Punctuation, and "feat."

**What goes wrong:**
The existing `normalizePerformer()` strips all non-alphanumeric characters and lowercases. This means "AC/DC" → "acdc", "Guns N' Roses" → "guns n roses", and "Dave Matthews Band feat. Tim Reynolds" → "dave matthews band feat tim reynolds". When TM returns the same act as "Dave Matthews Band" (no feat.), and the venue website lists "Dave Matthews Band feat. Tim Reynolds", the normalized forms differ and the dedup fails. Two event records appear for the same show.

**Why it happens:**
The normalization was designed for single-source dedup within one venue — it assumed the same source would describe a performer consistently. Cross-source normalization must survive variations in how different platforms format performer names. TM uses clean canonical artist names (from their Attractions entity), while scraped venue text often includes supporting acts, "featuring" clauses, and promotional suffixes.

**How to avoid:**
- Strip "feat.", "ft.", "featuring", "w/", "with", and everything after them before normalizing. The headliner is the identity; supporting acts are decorative.
- Strip common promotional suffixes: "- An Evening With...", "- Greatest Hits Tour", "- Live!", "Tour", "Live". These appear in Ticketmaster event names but not in scraped venue text.
- After normalization, use a secondary fuzzy match: if the normalized forms differ but the Levenshtein distance is <= 3 characters and the date matches exactly, treat as the same event. Levenshtein is available in PostgreSQL via `fuzzystrmatch` extension (available on Neon).
- Keep the exact `performer` string from the most authoritative source (TM > venue website > scraped text); use `normalized_performer` only for dedup, not display.

**Warning signs:**
- Same band appearing twice in the event list for the same date at the same venue
- `normalized_performer` values in the DB containing "feat", "ft", or "featuring" — these should be stripped before storage
- Levenshtein distance between TM and scraped performer for known same-show events > 5 characters

**Phase to address:**
Cross-source deduplication phase (v1.5). Extend `normalizePerformer()` with the suffix/feat stripping before any cross-source dedup runs.

---

### Pitfall 34: pg_trgm Fuzzy Match Threshold Set Too Aggressively Merges Different Venues

**What goes wrong:**
The default `pg_trgm` similarity operator threshold is 0.3 — very permissive. At 0.3, "The Vault" would match "The Vault Kitchen & Bar" would match "The Velvet Underground Bar" in the same city. Using this threshold for venue matching causes false positive merges: two completely different bars are treated as the same venue. All events from "The Velvet Underground Bar" get merged into "The Vault Kitchen & Bar."

**Why it happens:**
Developers read the pg_trgm docs, see "higher threshold = stricter", and pick a starting point. 0.3 is the documented default and is appropriate for typo-tolerant search — it is not appropriate for venue identity matching where a false positive is a data integrity violation. Short strings (< 15 characters) are especially vulnerable: trigrams derived from short strings have high overlap with unrelated strings.

**How to avoid:**
- For venue identity matching, use similarity threshold >= 0.7 for names shorter than 20 characters, and >= 0.6 for longer names. Test against the actual Atlantic Canada venue set before deploying.
- Always require city match in addition to name similarity — "The Horseshoe" in Halifax is different from "The Horseshoe" in Moncton.
- Use `word_similarity()` rather than `similarity()` when TM venue names may be substrings of the canonical name (e.g., "Scotiabank Centre" as a substring of "Halifax Scotiabank Centre").
- Validate the threshold empirically: run the fuzzy match against all existing venue pairs and manually inspect any pair with similarity > 0.5. Set the threshold just above the highest similarity of any known-different pair.

**Warning signs:**
- Fuzzy match threshold set to 0.3 or 0.4 for venue name matching (appropriate for search, not identity)
- No city equality check alongside name similarity
- Similarity threshold chosen without empirical testing against real Atlantic Canada venue names

**Phase to address:**
Venue deduplication phase (v1.5). Test thresholds against the real venue set before writing the merge logic.

---

### Pitfall 35: `flyTo` on Event Card Click Fights With Province Filter and User Panning

**What goes wrong:**
The EventCard click triggers `flyTo` via `setFlyToTarget`. Simultaneously, the user may have just changed the province filter (which calls `map.fitBounds()`) or may be in the middle of a manual pan. Two competing programmatic map movements fire in quick succession: `fitBounds` from the province change followed by `flyTo` from the card click (or vice versa). The map jerks between positions, lands at neither target, and `moveend` may not fire cleanly — leaving the popup-open handler registered on a stale marker that no longer exists at that position.

**Why it happens:**
The existing `MapViewController` already has both a province-change `fitBounds` effect and a `flyToTarget` effect, but they fire independently based on their respective `useEffect` dependency arrays. If both dependencies change in the same render cycle (user clicks a card while a province filter change is in flight), both effects run. Leaflet does not queue animations — a new `flyTo` during an active animation aborts the first without firing `moveend`.

**How to avoid:**
- Add a guard to the `flyToTarget` effect: if `map.isMoving()` returns true when `flyToTarget` changes, defer the `flyTo` by listening for the in-progress `moveend` before starting the new animation. Do not fire two Leaflet animations in the same tick.
- Clear `flyToTarget` immediately in `MapViewController` when the effect fires (not 2 seconds later from a `setTimeout` in the parent). The 2-second timeout in `handleClickVenue` is a hack that can cause re-trigger on re-render; clearing it synchronously is safer.
- The popup-open handler registered on `moveend` must be removed before a new `flyTo` starts. The existing cleanup in the `useEffect` return does this correctly — verify the cleanup fires when `flyToTarget` changes (it does, because the effect re-runs).
- On mobile, where the user may be mid-pan when they tap a card (switching from the list tab to map tab), delay the `flyTo` by one frame (`requestAnimationFrame`) to let the map settle after the tab switch renders.

**Warning signs:**
- Map visibly snapping between two locations when a card is clicked with a province filter active
- Popup failing to open after `flyTo` completes — `moveend` fired before the animation finished
- `setTimeout(() => setFlyToTarget(null), 2000)` in `handleClickVenue` — this is the existing workaround that can cause re-triggers

**Phase to address:**
Zoom-to-location phase (v1.5). Test the interaction specifically with province filter active and with the mobile tab switch before considering the feature complete.

---

### Pitfall 36: `flyTo` in Timelapse Mode Interrupts Playback Animation Without Pausing It

**What goes wrong:**
When the map is in timelapse mode and the user clicks an event card in the sidebar, `flyTo` fires. The map pans smoothly to the venue. But `isPlaying` is still `true` — the play loop continues advancing `timePosition` during the animation. The heatmap layer calls `setLatLngs()` every second while `flyTo` is animating. This causes visible jitter: the heatmap redraws mid-animation, the canvas flickers as Leaflet re-composites the canvas layer during the pan. On mobile this is particularly jarring.

**Why it happens:**
The `flyTo` on card click and the play loop are independent state machines with no coordination. `handleClickVenue` does not pause playback. The play interval fires independently of map animation state.

**How to avoid:**
- When `flyToTarget` is set (card click triggers zoom-to), pause playback: call `setIsPlaying(false)` in `handleClickVenue` if `mapMode === 'timelapse'`. The user's intent is to inspect a specific venue — playback during inspection is disruptive.
- Resume playback only on explicit user action (pressing Play), not automatically after `moveend`.
- In cluster mode, `flyTo` + popup works correctly without pausing anything, because cluster mode has no animation loop. The pause-on-flyTo logic should be conditional on `mapMode === 'timelapse'`.

**Warning signs:**
- `handleClickVenue` does not reference `isPlaying` or `setIsPlaying` — no coordination with playback state
- Heatmap flicker visible on the map during a `flyTo` animation in timelapse mode
- Play loop fires during `flyTo` (verify by logging `timePosition` changes against `flyTo` start/end timestamps)

**Phase to address:**
Zoom-to-location phase (v1.5), specifically the timelapse integration test. Verify the interaction with timelapse mode active before shipping.

---

### Pitfall 37: Category Filter Chips Rendered in Timelapse Mode Without Coordinating With TimelineBar Layout

**What goes wrong:**
The category filter chips are currently rendered only in cluster mode (the `EventFilters` component is conditionally hidden when `mapMode === 'timelapse'`). Adding filter chips to timelapse mode requires placing them somewhere visible — likely above or inside the `TimelineBar`. The `TimelineBar` is absolutely positioned at `bottom-0` of the map container. Adding filter chips above it stacks another absolutely-positioned bar, pushing the TimelineBar up and potentially overlapping the map controls (zoom buttons, geolocation button). On mobile, where the entire bottom strip is only ~100px, two stacked bars leave no usable map area.

**Why it happens:**
The `TimelineBar` was designed as a self-contained bottom overlay with no expectation of sibling UI. Adding filters as a sibling element without measuring the combined height against mobile viewports causes layout collapse.

**How to avoid:**
- Render category chips inside the `TimelineBar` component itself, not as a sibling overlay. The `TimelineBar` already has a flex row layout; add the chip strip as a wrapping flex row above the existing scrubber row. This keeps all timelapse controls in one overflow-aware container.
- The `TimelineBar` already passes `eventCount` — pipe the `category` filter state down to it as a prop, and render chips there. The `when` date filter is not relevant in timelapse mode (timeline position controls time); only `category` and `province` chips add value.
- Test on mobile (375px width): both the scrubber row and chip row must fit without overlap. Chips may need to scroll horizontally (`overflow-x: auto`, `no-scrollbar`) — the existing `EventFilters` component already uses this pattern.
- Do not duplicate the `useQueryState('category')` call inside `TimelineBar`. Read the current value from a shared hook (the existing `useEventFilters()` export from `EventFilters`) or pass it as a prop from `page.tsx` where it is already read.

**Warning signs:**
- Category chips implemented as a new absolutely-positioned element above `TimelineBar` — measure height before shipping
- `useQueryState('category')` called in more than two components — duplicate state reads are fine but duplicate setters cause race conditions
- TimelineBar height not verified on 375px viewport width with chips visible

**Phase to address:**
Category filter chips in timelapse phase (v1.5). Design the chip layout inside `TimelineBar` before writing any rendering code — measure the combined height on mobile.

---

### Pitfall 38: Province Filter Still Applies Province-Level `fitBounds` While `flyTo` Is Targeting a Specific Venue

**What goes wrong:**
In the event list, a user filters by province (NS), which triggers `map.fitBounds(PROVINCE_BOUNDS['NS'])`. They then click an event card in Halifax, which triggers `flyTo` to zoom to zoom level 15 on that specific venue. The province `fitBounds` fires on the next render cycle (because `province` state changed), zooming back out to show all of Nova Scotia — undoing the zoom-to-venue just completed. The user sees a zoom-in immediately followed by a zoom-out.

**Why it happens:**
The province effect in `MapViewController` fires whenever `province` changes. If the province is already set when the card is clicked, the province doesn't change — so this race condition only occurs when the user changes province and clicks a card in the same interaction window (e.g., via URL sharing or direct URL navigation that sets both `province` and causes an event card to be visible). However, a more subtle version occurs: the `flyToTarget` state is set, the component re-renders, and if `province` changed in the same batch, both effects trigger. React 18 batches state updates but `useEffect` runs are not synchronously ordered.

**How to avoid:**
- Add a `flyToActiveRef` to `MapViewController`: set it to `true` when a `flyToTarget` is active, clear it on `moveend`. In the province effect, if `flyToActiveRef.current === true`, skip `fitBounds` — a venue-specific zoom takes priority over a province-level zoom.
- Alternatively, clear `flyToTarget` before setting province, or set province before `flyToTarget`, with explicit ordering. But explicit ordering is fragile with async state updates — the `flyToActiveRef` guard is more robust.
- The simplest mitigation: in the province `useEffect`, add a guard that skips `fitBounds` if `flyToTarget` is currently non-null.

**Warning signs:**
- Map zooming in to a venue and then immediately zooming back out to province level
- `prevProvinceRef` comparison passing when it shouldn't (province didn't change but effect fired due to re-render)

**Phase to address:**
Zoom-to-location phase (v1.5), specifically integration testing with province filter active.

---

## v1.5 — Technical Debt Patterns (additions)

The following rows extend the Technical Debt Patterns table:

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `findOrCreateVenue()` using `ilike` name match only | Simple, no new dependencies | Ghost venues created for every TM name variant; dedup key becomes useless | Never for cross-source — add geo-proximity fallback |
| Fuzzy venue merge with hard `DELETE` | Simpler code | Irreversible false-positive merges corrupt event data | Never — use soft merge with audit log or admin review queue |
| pg_trgm threshold < 0.6 for venue identity matching | Catches more near-misses | False positives merge distinct venues | Never — validate threshold empirically against Atlantic Canada dataset |
| Strip punctuation from performer names without stripping "feat./w." clauses | Handles simple cases | "Artist feat. Guest" and "Artist" treated as different — dedup fails | Never — strip supporting-act clauses before normalization |
| `flyTo` without pausing timelapse playback | Less state coordination | Heatmap canvas flickers during pan animation | Never in timelapse mode — pause on card click |
| Category chips as sibling overlay above TimelineBar | Faster to position | Overlaps map controls on mobile; stacks unexpectedly | Never — embed chips inside TimelineBar layout |

---

## v1.5 — Integration Gotchas (additions)

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| TM `findOrCreateVenue()` | `ilike` match on TM-provided name fails for name variants | Add geo-proximity check (< 250m) as primary match; trigram name similarity as fallback |
| Venue fuzzy merge | Use default pg_trgm threshold (0.3) | Use >= 0.7 threshold + city equality + geocoordinate proximity; require all three signals |
| Performer dedup across sources | Compare `normalized_performer` directly | Strip "feat./ft./w." and promotional suffixes before normalization; fuzzy fallback on Levenshtein distance |
| `flyTo` + province filter | Both effects fire independently in `MapViewController` | Guard province `fitBounds` when `flyToTarget` is active via a `flyToActiveRef` |
| `flyTo` + timelapse playback | Card click zooms map while play loop continues | Pause playback (`setIsPlaying(false)`) on card click when in timelapse mode |
| Category chips in timelapse | Add as sibling overlay above `TimelineBar` | Embed inside `TimelineBar` component; test on 375px viewport |

---

## v1.5 — Performance Traps (additions)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fuzzy venue match via pg_trgm on every TM event ingestion | Scrape cron slows as venue table grows | Add GIN index on `venues.name` for trigram queries; geo-proximity check is O(1) with spatial index | Noticeable above ~500 venues without index |
| Levenshtein distance computed in SQL across full events table for cross-source dedup | Dedup query becomes O(n) per event | Narrow candidates first by exact date match + city, then apply Levenshtein | Breaks above ~5,000 events without pre-filtering |
| Heatmap canvas redraw during `flyTo` animation | Visual flicker on map pan | Pause play loop before `flyTo`; resume after `moveend` | Immediately visible on any device |

---

## v1.5 — "Looks Done But Isn't" Checklist (additions)

**v1.5 Deduplication and Map Interaction:**
- [ ] **Cross-source dedup:** Add a known-duplicate pair (same show from TM and venue website) to staging; confirm only one event row exists after both sources run
- [ ] **Venue geo-match:** Fetch a TM event for a venue already in the DB; confirm `findOrCreateVenue()` returns the existing ID, not a new row — verify no second venue entry appears in admin dashboard
- [ ] **Fuzzy match threshold:** Run similarity query against all existing venue pairs; document the highest similarity score among known-different venues; set threshold above this value
- [ ] **Performer normalization:** Test `normalizePerformer()` on "Artist feat. Guest" — confirm output is "artist", not "artist feat guest"
- [ ] **Venue merge audit log:** Trigger a test merge; confirm `venue_merge_log` row exists with ghost_venue_id, canonical_venue_id, and similarity_score
- [ ] **flyTo + province filter:** Set province to NS, then click an event card; confirm the map zooms to the venue and does not immediately zoom back out to province bounds
- [ ] **flyTo + timelapse:** With timelapse playing, click an event card; confirm playback pauses and map zooms to venue without heatmap flicker
- [ ] **flyTo + map.isMoving():** Click a card while a province fitBounds is in progress; confirm the venue flyTo completes without competing animations
- [ ] **Category chips in timelapse:** Enable timelapse mode on a 375px viewport; confirm chip row and scrubber row both fit without overlapping map controls or each other
- [ ] **Category filter applies to heatmap in timelapse:** Select a category chip while timelapse is active; confirm heatmap only shows heat for events in that category
- [ ] **Category chip state shared correctly:** Chips in timelapse mode read from the same `category` URL param as cluster mode — switching modes preserves selected category

---

## v1.5 — Recovery Strategies (additions)

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Ghost venues from TM name mismatch already in DB | MEDIUM | Query venue pairs within 250m geocoordinates; manually review; merge confirmed pairs; delete ghost rows after re-assigning events |
| False-positive venue merge without audit log | HIGH | Manual inspection of all events under merged venue; compare against TM source records to identify misassigned events; re-assign by performer+date |
| Performer dedup failure — duplicate events from TM and venue scrape | LOW | Run one-time dedup query: find (venue_id, event_date, performer) groups with count > 1 after applying extended normalization; merge keeping TM record |
| pg_trgm threshold too aggressive — undetected wrong merges | MEDIUM | Re-run merge query with tighter threshold; identify any over-merged pairs in merge log; reverse via log-recorded ghost_venue_id |
| `flyTo` competing with province bounds — user-visible jank | LOW | Add `flyToActiveRef` guard to province effect; deploy; no data migration needed |
| Category chips layout broken on mobile | LOW | Move chips inside TimelineBar; adjust flex layout; verify on 375px; deploy |

---

## v1.5 — Pitfall-to-Phase Mapping (additions)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Ghost venues from TM name mismatch | v1.5 Phase 1: Venue dedup | Re-ingesting a known TM event produces no new venue row |
| Irreversible venue merge | v1.5 Phase 1: Venue dedup | Merge log table exists; admin review queue wired before auto-merge runs |
| pg_trgm false positive threshold | v1.5 Phase 1: Venue dedup | Threshold validated against all existing venue pairs before deployment |
| Performer normalization across sources | v1.5 Phase 2: Event dedup | Known cross-source duplicate (TM + scrape) produces one event row |
| flyTo vs. province filter race | v1.5 Phase 3: Zoom-to-location | Click event card with province filter active; map stays zoomed to venue |
| flyTo during timelapse playback | v1.5 Phase 3: Zoom-to-location | Playback pauses on card click in timelapse mode; no heatmap flicker |
| flyTo competing animations | v1.5 Phase 3: Zoom-to-location | Two simultaneous animation triggers produce one clean animation |
| Category chips layout in timelapse | v1.5 Phase 4: Timelapse filter chips | Chips and scrubber visible on 375px without overlap |
| Category state shared across modes | v1.5 Phase 4: Timelapse filter chips | Category param preserved when toggling between cluster and timelapse |

---

**v1.5 Cross-Source Deduplication, Venue Merge, Map Interaction:**
- [Crunchy Data — Fuzzy Name Matching in PostgreSQL](https://www.crunchydata.com/blog/fuzzy-name-matching-in-postgresql) — pg_trgm threshold recommendations; word_similarity vs. similarity for substrings
- [Neon Docs — pg_trgm extension](https://neon.com/docs/extensions/pg_trgm) — confirmed available on Neon; CREATE EXTENSION activation; GIN index for performance
- [PostgreSQL Docs — F.35. pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) — similarity() vs. word_similarity(); threshold configuration
- [Insycle Blog — Data Retention When Merging Duplicates](https://blog.insycle.com/data-retention-merging-duplicates) — audit trail for merge operations; master record selection rules
- [Leaflet GitHub — Issue #3395: Implement zoom/pan options in flyTo()](https://github.com/Leaflet/Leaflet/issues/3395) — flyTo interruption behavior; map.isMoving() usage
- [Leaflet GitHub — Issue #9569: flyTo buggy when offscreen](https://github.com/Leaflet/Leaflet/issues/9569) — flyTo animation edge cases; moveend event reliability
- [Leaflet Docs — map.isMoving()](https://leafletjs.com/reference.html) — returns true during pan and zoom animations; use as animation guard
- [React-Leaflet Docs — useMapEvents hook](https://react-leaflet.js.org/docs/example-events/) — accessing Leaflet map instance inside MapContainer children
- [WinPure — Ultimate Data Deduplication Guide](https://winpure.com/data-deduplication-guide/) — cross-source dedup strategy; composite key design; fuzzy matching thresholds
- [Medium (Tilores) — How to Normalize Company Names for Deduplication](https://medium.com/tilo-tech/how-to-normalize-company-names-for-deduplication-and-matching-21e9720b30ba) — prefix/suffix stripping; "feat." clause handling; phonetic fallbacks

---
*Pitfalls research for: East Coast Local — v1.0 scraping/map + v1.1 heatmap timelapse addition + v1.2 discovery/categorization addition + v1.4 API integrations/multi-page/rate limiting/quality metrics/auto-approve addition + v1.5 cross-source deduplication/venue merge/map interaction/timelapse filter chips addition*
*Researched: 2026-03-13 (v1.0) · 2026-03-14 (v1.1) · 2026-03-14 (v1.2) · 2026-03-15 (v1.4) · 2026-03-15 (v1.5)*
