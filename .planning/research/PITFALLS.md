# Pitfalls Research

**Domain:** Local events discovery app with AI-powered web scraping (Atlantic Canada live music)
**Researched:** 2026-03-13 (v1.0 scraping pitfalls) · 2026-03-14 (v1.1 heatmap timelapse pitfalls added)
**Confidence:** HIGH (scraping/LLM pitfalls), MEDIUM (geocoding accuracy for Atlantic Canada specifically), HIGH (map performance), HIGH (heatmap/timelapse pitfalls — verified via official Leaflet.heat source, react-leaflet docs, WCAG 2.2 spec, and React memory leak empirical research)

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

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ignoring robots.txt and ToS | Legal liability; PIPEDA data compliance; breach of contract | Always check and respect `robots.txt`; use official APIs where available |
| Storing LLM API keys without rotation plan | Key leakage exposes billing to abuse | Use Vercel env vars; never commit keys; set spend alerts |
| No rate limiting on outbound scraper requests | IP ban risk; could be construed as DoS | Enforce minimum 2-second delay per domain; honor `Crawl-delay` |
| No validation of LLM output before DB insert | Malformed strings breaking queries or display | Validate all extracted fields against schema; reject null dates |

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

---
*Pitfalls research for: East Coast Local — v1.0 scraping/map + v1.1 heatmap timelapse addition*
*Researched: 2026-03-13 (v1.0) · 2026-03-14 (v1.1)*
