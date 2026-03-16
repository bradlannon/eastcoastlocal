# Phase 24: Reddit Discovery - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Supplement Places API coverage by mining Atlantic Canada subreddits for venue and event mentions, extracting structured data via Gemini, and flowing candidates through the existing discovered_sources pipeline. Single cron endpoint, weekly cadence, reuses existing scoring and approval thresholds.

</domain>

<decisions>
## Implementation Decisions

### Subreddit Targeting
- Target all three tiers: major city subs (r/halifax, r/fredericton, r/moncton, r/saintjohn, r/charlottetown, r/stjohnsnl), province subs (r/novascotia, r/newbrunswickcanada, r/PEI, r/newfoundland), and niche music/event subs if they exist
- Configurable subreddit list as a constant, organized by province mapping
- Always check all configured subs regardless of hit rate — no skip logic for low-volume subs
- 7-day recency window on each run — only process posts created within the past week

### Reddit Data Access
- Use Reddit public JSON API (append .json to subreddit URL) — no OAuth, no API key needed
- Fetch /new.json listing (chronological, newest first) — filter by created_utc for 7-day window
- Posts only (title + selftext body) — no comment scanning
- Track processed Reddit post IDs to avoid re-sending to Gemini on overlapping windows
- Keyword pre-filter before sending to Gemini: match posts containing venue/event terms (bar, pub, show, concert, gig, venue, music, live, theatre, etc.)

### Gemini Extraction Shape
- Venue-focused extraction: venue_name, city, province, address (if mentioned), venue_type (bar/pub/theatre/etc)
- Also extract website URL if present in post text — gives candidate a scrapeable URL
- No event date extraction — venue discovery only, events come from scraping later
- Batch posts per subreddit into a single Gemini call — fewer API calls, Gemini sees cross-post context
- Zod schema for extraction output (array of venue candidates per batch)

### Scoring & Approval
- Reuse existing scoreCandidate() pattern from discovery-orchestrator.ts — field-presence scoring (city +0.15, province +0.15, name +0.10)
- Auto-approve at 0.9 threshold (GEMINI_AUTO_APPROVE already set in Phase 23)
- Reddit candidates with URL that score >= 0.9 auto-approve and promote through existing pipeline
- Reddit candidates without URL staged as 'pending' for admin review (NOT 'no_website' — Reddit names too noisy for auto-stubs)

### Cron & Pipeline Wiring
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

</decisions>

<specifics>
## Specific Ideas

- Province can be inferred from subreddit mapping (r/halifax → NS) — but Gemini should still extract it from text as a cross-check
- Reddit JSON API returns 100 posts per page by default — likely sufficient for weekly window on Atlantic Canada subs
- Batching posts per subreddit into one Gemini call keeps costs low — most subs will have <20 keyword-matching posts per week
- The 0.9 threshold means only candidates with all three fields (name + city + province) auto-approve — appropriate safety level for Reddit-sourced data

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/scraper/discovery-orchestrator.ts`: `scoreCandidate()` — field-presence scoring function to reuse for Reddit candidates
- `src/lib/scraper/discovery-orchestrator.ts`: `runDiscoveryJob()` — pattern for Gemini-based discovery with auto-approval (CandidateSchema, delay(), aggregator filtering)
- `src/lib/scraper/promote-source.ts`: `promoteSource()` — handles lat/lng carry-through, google_place_id, address (Phase 22 updates)
- `src/lib/scraper/venue-dedup.ts`: `scoreVenueCandidate()` — two-signal dedup gate for staging-time dedup
- `src/lib/scraper/places-discoverer.ts`: Per-province city list constant and cron endpoint pattern

### Established Patterns
- Cron auth via `CRON_SECRET` Bearer token
- `maxDuration = 60` on all cron routes
- Gemini extraction via `@ai-sdk/google` with `generateText` + `Output.object` + Zod schema
- discovered_sources status values: pending, approved, rejected, no_website
- discovery_method values: gemini_google_search, google_places, reddit_gemini

### Integration Points
- discovered_sources table — Reddit candidates inserted with discovery_method='reddit_gemini'
- Existing admin discovery UI — Reddit candidates appear with same status filters, no UI changes needed
- GEMINI_AUTO_APPROVE threshold (0.9) — already configured in Phase 23
- vercel.json cron config — add weekly Reddit cron schedule

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-reddit-discovery*
*Context gathered: 2026-03-15*
