# Feature Research

**Domain:** Event discovery platform — automatic source discovery, AI categorization, category filtering (v1.2 milestone)
**Researched:** 2026-03-14
**Confidence:** MEDIUM (source discovery approach is MEDIUM — no canonical pattern exists for local-region automated venue discovery; categorization and filtering UX are HIGH confidence from established platforms)

---

## Context: What Already Exists (Must Preserve)

This is the v1.2 milestone. The following are already built and must be integrated with, not replaced:

- AI scraping pipeline: 26 venue URLs in `scrape_sources` DB table, scraped daily via Vercel cron
- Orchestrator (`runScrapeJob`) iterates enabled sources, calls `fetchAndPreprocess` + `extractEvents` (Gemini) + `upsertEvent`
- `ExtractedEventSchema` (Zod): performer, event_date, event_time, price, ticket_link, description, cover_image_url, confidence
- Schema: `venues`, `events`, `scrape_sources` tables — no `category` field exists yet
- Map with pin clusters and heatmap timelapse mode
- Event list with date + province filters (nuqs URL state)
- Vercel Hobby constraints: 60s function timeout, no Playwright/Puppeteer

The v1.2 features must extend this pipeline, not rebuild it.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users expect from an event discovery platform that covers all event types. Missing these makes the product feel incomplete for the expanded scope.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Category filter on map and event list | Once events span music, comedy, theatre, and community, users immediately need to narrow by type; no existing discovery platform (Eventbrite, Meetup, Bandsintown) ships multi-type events without category filtering | MEDIUM | Filter chips or pills in the UI; must work in both pin/cluster view and heatmap mode; integrates with existing date/province nuqs filters |
| Defined, stable event categories | Users need predictable, human-readable labels; inconsistent LLM-generated tags create confusion | LOW | Hard-code a small taxonomy (6-10 categories); the LLM assigns from this fixed list rather than inventing labels |
| "All" / clear filter option | Users in filter-chip UIs expect a one-tap way to remove all category filters; missing this causes frustration | LOW | "All" chip that deselects others; or a clear-all X button on multi-select |
| Category visible on event cards and detail pages | Once categories exist, users expect to see them on each event; a category label without it surfacing on the event itself feels half-built | LOW | Small pill/badge on event card and detail page |
| New sources appear in the app automatically | The milestone promise is hands-off discovery; if new venues require manual seed-data edits to appear, the feature has not shipped | HIGH | Core requirement; the discovery pipeline must end with new `venues` + `scrape_sources` rows that the existing daily cron picks up without code changes |

### Differentiators (Competitive Advantage)

Features specific to this milestone that go beyond what the v1.1 app offered and differentiate from general event platforms.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-assigned categories at extraction time | Categorization happens in the same Gemini call that extracts events — no second-pass, no extra cost; category is available immediately when event is stored | MEDIUM | Extend `ExtractedEventSchema` to include a `category` enum field; update the extractor prompt to classify against a fixed list |
| Automatic venue/source discovery via targeted search queries | Atlantic Canada is a small region; a curated-but-automated approach (search queries + LLM evaluation of candidate pages) can surface new venues without crawling the open web | HIGH | Use a search API (Serper/Exa) or Google Custom Search to find candidate event pages by city; LLM evaluates whether each result is a scrapeable event source; approved candidates inserted into `scrape_sources` |
| Discovery scoped to Atlantic Canada cities | Generic web crawlers surface national/international results; scoping queries to NB/NS/PEI/NL cities prevents noise | LOW | Discovery queries parameterized by province and major cities; candidate filter rejects non-Atlantic results |
| Human review step before new sources go live | Fully automated source insertion risks adding spam, paywalled, or broken pages to the scrape queue; a "pending" state allows human approval without blocking discovery | MEDIUM | `scrape_sources.last_scrape_status = 'pending_review'` state; admin endpoint or seed-script pattern to approve; prevents bad sources from consuming Gemini quota |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Open-ended LLM-generated category tags | "Let the AI decide the categories" feels powerful and flexible | LLM hallucination produces inconsistent tags ("Live Music", "live music", "music concert", "concert") that cannot be filtered reliably; each event becomes its own category | Hard-code a fixed 8-category taxonomy passed to Gemini as an enum constraint; `generateObject` with a Zod enum enforces it at parse time |
| Crawling the full web for new venues | Seems thorough | Atlantic Canada event pages number in the thousands but quality is low; open-web crawling on Vercel Hobby (60s timeout) is not feasible; Playwright is banned by bundle size; most pages are not event sources | Targeted search-query approach: issue 3-5 search queries per city, evaluate top 10 results per query with LLM, insert only confirmed event-page URLs |
| Real-time source discovery (on every page load) | "Always fresh" | Discovery is expensive: search API calls + LLM evaluation per candidate = high cost and slow response; Vercel 60s timeout makes this impossible for any significant number of candidates | Separate cron job for discovery (weekly or on-demand), distinct from the daily scrape cron |
| User-submitted venues | Community-sourced growth looks appealing | Requires moderation, spam handling, user accounts (explicitly out of scope); venue submission by venues is already in the project out-of-scope list | Admin-seeded sources; discovery pipeline handles growth without user input |
| Subcategories or tags (e.g., "Jazz", "Celtic" under "Live Music") | More granular filtering sounds better | Increases LLM classification ambiguity dramatically; "Jazz" and "Celtic" are subjective; the app has insufficient volume at Atlantic Canada scale to make subcategories useful | Single-level taxonomy for v1.2; description field already holds detail for users who want to read it |
| Category filter as a multi-level sidebar | Desktop convention from Eventbrite | App is mobile-first map with limited screen real estate; sidebar is already used for event list | Horizontal scrollable chip row above event list; single-select initially (multi-select as v2 enhancement) |

---

## Recommended Event Category Taxonomy

Based on existing venue types in the dataset (pubs, concert halls, theatres, breweries) and the milestone goal of expanding beyond live music:

| Category | What It Covers | Example Venues in Dataset |
|----------|----------------|---------------------------|
| `live_music` | Bands, solo performers, open mic, acoustic sets | All current 26 venues |
| `comedy` | Stand-up, improv, sketch comedy nights | Capitol Theatre, Imperial Theatre |
| `theatre` | Plays, musicals, dramatic performances | Harbourfront Theatre, Arts & Culture Centres |
| `arts` | Gallery openings, spoken word, poetry, literary events | Arts & Culture Centres |
| `sports` | Sporting events at entertainment venues | Stadiums, arenas (future sources) |
| `festival` | Multi-day or multi-act festivals, outdoor events | Summer festival sources (future) |
| `community` | Fundraisers, markets, cultural celebrations, trivia | Breweries, food halls |
| `other` | Catch-all for events that don't fit above categories | Any venue |

**Rationale:** 8 categories is the upper limit before chip rows require horizontal scroll on mobile. The `other` category prevents LLM refusals or hallucinations when an event genuinely doesn't fit. `live_music` remains distinct because it covers the existing dataset and is the most common category in the region.

---

## Feature Dependencies

```
[AI Event Categorization]
    └──requires──> [Extended ExtractedEventSchema] (add category enum field)
    └──requires──> [Updated extractor prompt] (include fixed category list)
    └──requires──> [DB migration] (add category column to events table)
    └──drives──> [Category Filter UI] (categories only filterable once stored)

[Category Filter UI]
    └──requires──> [AI Event Categorization] (no categories to filter without it)
    └──requires──> [DB migration] (category column must exist)
    └──integrates with──> [Existing nuqs date/province filters] (must coexist)
    └──drives──> [Category visible on event cards] (surface stored category in UI)

[Automatic Source Discovery]
    └──requires──> [Search API integration] (Serper or Google Custom Search)
    └──requires──> [LLM candidate evaluator] (new Gemini call: "is this an event page?")
    └──requires──> [Venue geocoder] (already exists in geocoder.ts)
    └──requires──> [scrape_sources insert logic] (write approved candidates to DB)
    └──drives──> [Existing daily scrape cron] (new sources are picked up automatically)

[Existing daily scrape cron]
    └──depends on──> [scrape_sources table] (reads enabled sources)
    └──unchanged by──> [Source Discovery] (discovery writes rows; scrape reads them)

[Category visible on event cards / detail pages]
    └──requires──> [AI Event Categorization] (category must be stored on events)
    └──requires──> [DB migration] (category column)
```

### Dependency Notes

- **DB migration must precede all other work:** Adding `category` to the `events` table (nullable, text/enum) is a prerequisite for storing categories, filtering on them, and displaying them. The migration is low-risk (additive, nullable column).
- **ExtractedEventSchema extension is a single-file change:** Adding `category: z.enum([...]).nullable()` to the Zod schema and updating the extractor prompt is the core of AI categorization. The existing `generateText` + `Output.object` pattern supports this without architectural changes.
- **Source discovery is an independent cron, not the scrape cron:** Mixing discovery logic into `runScrapeJob` would couple two unrelated concerns and risk timeouts. Discovery runs on a separate schedule (weekly is sufficient) and writes `scrape_sources` rows; the daily cron then picks them up.
- **Category filter must not break existing nuqs filters:** Date and province filters are URL-persisted via nuqs. Category filter should also use nuqs (consistent pattern) but as an independent param. No conflict if implemented as separate `category` query param.

---

## MVP Definition

### Launch With (v1.2)

Minimum viable feature set — what makes this milestone shippable and valuable.

- [ ] DB migration: add `category` column to `events` table (nullable text, no constraint initially)
- [ ] Extended `ExtractedEventSchema` with `category` enum field (8 categories + null)
- [ ] Updated extractor prompt instructing Gemini to assign category from fixed list
- [ ] Category filter UI: horizontal chip row above event list, "All" chip default, single-select
- [ ] Category filter applies to both event list and map pins (hide pins for filtered-out categories)
- [ ] Category pill/badge on event cards and event detail pages
- [ ] Automatic source discovery cron: search queries per Atlantic Canada city, LLM candidate evaluation, insert approved sources with `pending_review` status
- [ ] Admin approval mechanism for discovered sources (minimal — a script or DB flag flip is acceptable for v1.2)

### Add After Validation (v1.2.x)

- [ ] Multi-select category filter (filter to "Live Music + Comedy" simultaneously) — add if users request it; single-select is sufficient for v1 of the filter
- [ ] Category filter in heatmap mode — heatmap currently shows all events; add category-aware heatmap filtering once category data is populated
- [ ] Confidence threshold tuning for discovery — after first discovery run, adjust search queries and LLM prompt based on false positive rate

### Future Consideration (v2+)

- [ ] Full auto-approval for high-confidence discovered sources — requires enough history to trust the evaluator
- [ ] Category subcategories (Jazz, Celtic, Folk under Live Music) — only if event volume justifies it
- [ ] Discovery coverage report in admin — shows which cities/provinces have the most/fewest sources
- [ ] User-facing "suggest a venue" form — requires moderation infrastructure

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DB migration (category column) | HIGH | LOW | P1 |
| Extended schema + prompt (AI categorization) | HIGH | LOW | P1 |
| Category filter chips UI | HIGH | MEDIUM | P1 |
| Category visible on event cards | MEDIUM | LOW | P1 |
| Category filter on map pins | HIGH | MEDIUM | P1 |
| Source discovery cron (search + LLM eval) | HIGH | HIGH | P1 |
| Admin approval for discovered sources | MEDIUM | LOW | P1 |
| Multi-select category filter | MEDIUM | MEDIUM | P2 |
| Category-aware heatmap mode | MEDIUM | MEDIUM | P2 |
| Discovery coverage reporting | LOW | MEDIUM | P3 |
| Auto-approval for high-confidence sources | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.2 launch
- P2: Should have; add when core is stable
- P3: Nice to have; future consideration

---

## Competitor Feature Analysis

How comparable platforms handle the same features:

| Feature | Eventbrite | Meetup | Bandsintown | Our Approach |
|---------|------------|--------|-------------|--------------|
| Category taxonomy | 30+ categories (too many for chip UI) | Interest-based (tech, outdoors, etc.) | Music genres only | 8 fixed categories, LLM-assigned |
| Category filter UI | Dropdown on search results page | Horizontal scroll chips on discovery | Genre chips on artist pages | Horizontal scroll chip row, persistent |
| Source discovery | Self-serve event submission by organizers | Group creation by users | Artist-claimed pages | Automated search + LLM evaluation, no user accounts needed |
| New source onboarding | Instant (self-serve) | Instant (self-serve) | Manual artist claim | Pending review state; admin approval |
| Category on event card | Icon + label | Color-coded category dot | None (genre on artist, not event) | Text pill/badge in consistent color |

---

## Sources

- [PredictHQ Event Categories](https://www.predicthq.com/intelligence/data-enrichment/event-categories) — 19 top-level categories, 200+ labels; informed the decision to use a smaller flat taxonomy for a regional app
- [Filter UI Design Best Practices — insaim.design](https://www.insaim.design/blog/filter-ui-design-best-ux-practices-and-examples) — chip-based filters, clear visual hierarchy, "Clear All" pattern
- [15 Filter UI Patterns — Bricx Labs](https://bricxlabs.com/blogs/universal-search-and-filters-ui) — horizontal scroll chips for small category sets, sidebar for 20+ options
- [Carbon Design System — Filtering Patterns](https://carbondesignsystem.com/patterns/filtering/) — multi-select filter best practices, chip display of selected filters
- [Gemini Structured Output — Google AI Docs](https://ai.google.dev/gemini-api/docs/structured-output) — JSON Schema / Zod enum constraints enforced at parse time
- [Vercel AI SDK + Gemini — generateObject pattern](https://patloeber.com/gemini-ai-sdk-cheatsheet/) — `generateObject` with Zod schema for structured extraction
- [Serper — Google Search API](https://serper.dev/) — $1/1000 queries, structured JSON results, suitable for city-scoped event page discovery
- [Exa AI Search API](https://exa.ai/) — neural search alternative to Serper; better for semantic queries like "venues with live events in Fredericton NB"
- [DEV — Tech Event Discovery Platform (real-time scraping)](https://dev.to/danishaft/how-i-built-a-tech-event-discovery-platform-with-real-time-scraping-3o4f) — confirmed: no existing platform does automatic venue discovery; all rely on curated or self-submitted sources
- [Eventbrite UX Analysis — Medium](https://medium.com/@clinagyin_8435/eventbrite-a-ux-analysis-51e11649ad09) — category selection highlighted in orange; consistent selected/unselected visual states

---
*Feature research for: East Coast Local v1.2 — Event Discovery and Categorization*
*Researched: 2026-03-14*
