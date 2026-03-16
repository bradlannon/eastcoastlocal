---
phase: 24-reddit-discovery
plan: 01
subsystem: api
tags: [reddit, gemini, ai-sdk, zod, discovered-sources, venue-discovery]

# Dependency graph
requires:
  - phase: 23-places-api-discovery
    provides: scoreCandidate function, promoteSource function, discovered_sources pipeline, GEMINI_AUTO_APPROVE threshold
  - phase: 22-schema-foundation
    provides: discovered_sources table schema with discovery_method, raw_context, status columns

provides:
  - Reddit discovery module with subreddit config, fetch, keyword filter, Gemini extract, score, stage, dedup, and run orchestrator
  - REDDIT_SUBREDDITS constant (10 subs across 4 provinces)
  - ALL_REDDIT_SUBREDDITS flat array
  - fetchSubredditPosts function with 7-day window filter
  - matchesVenueKeywords pre-filter (20 venue/event terms)
  - runRedditDiscovery orchestrator with full pipeline
  - 16 unit tests covering all REDDIT-01 through REDDIT-04 behaviors

affects: [24-02-cron-endpoint, future-admin-ui, future-venue-discovery-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Reddit public JSON API access with custom User-Agent header (no OAuth)
    - Keyword pre-filter before LLM call to reduce API costs
    - Synthetic reddit:t3_{postId} URL as dedup anchor for no-URL candidates
    - Province hint fallback from subreddit mapping when Gemini extraction returns null
    - Per-subreddit try/catch with error count aggregation

key-files:
  created:
    - src/lib/scraper/reddit-discoverer.ts
    - src/lib/scraper/reddit-discoverer.test.ts
  modified: []

key-decisions:
  - "No-URL Reddit candidates use synthetic reddit:t3_{postId} URL as status=pending (NOT no_website) — admin reviews noisy Reddit names"
  - "Keyword pre-filter with 20 terms reduces Gemini API calls before extraction"
  - "Province hint from subreddit mapping is fallback when Gemini returns null province"
  - "Auto-approve only triggers for candidates with real website URLs at score >= 0.9"
  - "Post ID dedup via raw_context LIKE 'reddit:t3_%' query — no separate column needed"

patterns-established:
  - "Pattern: Batch all posts per subreddit into single Gemini call (fewer API calls, cross-post context)"
  - "Pattern: delay(1500) between subreddit fetches to respect Reddit rate limits"
  - "Pattern: onConflictDoNothing() on discovered_sources insert for idempotency"

requirements-completed: [REDDIT-01, REDDIT-02, REDDIT-03, REDDIT-04]

# Metrics
duration: 18min
completed: 2026-03-15
---

# Phase 24 Plan 01: Reddit Discovery Module Summary

**Reddit mining module for Atlantic Canada subreddits: fetch, keyword pre-filter, Gemini batch extraction, score/stage via discovered_sources pipeline, auto-approve at 0.9 threshold**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-16T02:28:54Z
- **Completed:** 2026-03-16T02:48:15Z
- **Tasks:** 1 (TDD: 2 commits — test then implement)
- **Files modified:** 2

## Accomplishments
- Built complete Reddit discovery module with 10 subreddit entries across 4 Atlantic provinces
- Implemented keyword pre-filter (20 terms) to reduce Gemini API costs before extraction
- Gemini batch extraction produces structured venue data (name, city, province, address, type, URL)
- Full pipeline: fetch -> filter -> dedup -> extract -> score -> stage -> auto-approve
- 16 unit tests pass covering all specified behaviors (REDDIT-01 through REDDIT-04)

## Task Commits

Each task was committed atomically (TDD: test first, then implement):

1. **Task 1: RED — Failing tests** - `f2cb111` (test)
2. **Task 1: GREEN — Implementation** - `438b764` (feat)

## Files Created/Modified
- `src/lib/scraper/reddit-discoverer.ts` - Full Reddit discovery module (380 lines): constants, fetch, keyword filter, Gemini extraction, orchestrator
- `src/lib/scraper/reddit-discoverer.test.ts` - 16 unit tests covering all REDDIT-01 through REDDIT-04 behaviors

## Decisions Made
- **No-URL candidate staging**: Candidates without an extracted website URL are staged with a synthetic `reddit:t3_{postId}` URL and `status=pending` (NOT `no_website`) — Reddit venue names are too noisy for auto-stub creation; admin review required
- **Province hint fallback**: When Gemini returns null province, the subreddit mapping province (e.g., `r/halifax` -> `NS`) is used as fallback in the discovered_sources row
- **Auto-approve gate**: Only candidates with a real website URL (not synthetic `reddit:` URLs) are eligible for `promoteSource()` auto-approval at `>= 0.9` threshold
- **Post ID dedup**: Processed post IDs are tracked via `raw_context LIKE 'reddit:t3_%'` query at run start — no separate column needed

## Deviations from Plan

None - plan executed exactly as written. All 15 specified behaviors implemented and tested. Tests found 16 passing (15 specified plus one additional structural test for province array lengths).

## Issues Encountered

The full test suite has 2 pre-existing failures in `ticketmaster.test.ts` (incomplete `.limit()` mock — documented in STATE.md tech debt). These are not related to this plan's changes.

## User Setup Required

None - no external service configuration required. Reddit public JSON API requires no API key. `GEMINI_AUTO_APPROVE` env var already set in Phase 23.

## Next Phase Readiness
- `reddit-discoverer.ts` is complete and tested, ready for cron endpoint wiring in Plan 02
- Plan 02 needs only a thin Next.js route handler: auth check + call `runRedditDiscovery()` + return JSON result
- No migrations needed (`discovery_method='reddit_gemini'` is plain text, `raw_context` column already exists)

---
*Phase: 24-reddit-discovery*
*Completed: 2026-03-15*
