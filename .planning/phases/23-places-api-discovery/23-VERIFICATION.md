---
phase: 23-places-api-discovery
verified: 2026-03-15T00:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 23: Places API Discovery Verification Report

**Phase Goal:** The system discovers hundreds of Atlantic Canada venues per week via Google Maps Places API, automatically scores and stages candidates across ~30 cities and all 4 provinces, and runs as an isolated cron endpoint that does not compete with existing discovery jobs for the 60-second timeout budget.

**Verified:** 2026-03-15
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                     | Status     | Evidence                                                                 |
|----|---------------------------------------------------------------------------|------------|--------------------------------------------------------------------------|
| 1  | scorePlacesCandidate returns 0.85 for core types and 0.70 for secondary   | VERIFIED   | lines 91–95 places-discoverer.ts; 10 scoring tests pass                 |
| 2  | isVenueRelevant filters to only the 7 allowed place types                 | VERIFIED   | lines 79–81 places-discoverer.ts; 6 filter tests pass                   |
| 3  | PLACES_CITIES contains 41 communities across all 4 Atlantic provinces     | VERIFIED   | lines 101–151: NS=15, NB=12, PEI=4, NL=10; 5 city-list tests pass      |
| 4  | promoteSource handles no_website status (venue only, no scrape_source)    | VERIFIED   | lines 24, 53–61 promote-source.ts; 4 new tests pass (Tests 5b, 12–14)  |
| 5  | searchCity calls Places API Text Search with pagination                   | VERIFIED   | lines 204–239 places-discoverer.ts; 6 searchCity tests pass             |
| 6  | Pagination follows nextPageToken until exhausted                          | VERIFIED   | do/while loop lines 215–230; pagination test with 3-page mock passes    |
| 7  | Venues already in DB by google_place_id are enriched, not re-staged       | VERIFIED   | two-step dedup lines 297–315; processPlaceResult tests pass             |
| 8  | Fuzzy name+geo dedup catches near-matches via scoreVenueCandidate         | VERIFIED   | lines 318–342; merge/review/keep_separate paths tested                  |
| 9  | Venues with websiteUri staged as pending; without as no_website           | VERIFIED   | lines 345–350; staged_pending and staged_no_website tests pass          |
| 10 | google_place_id, lat, lng, address, place_types stored on all inserts     | VERIFIED   | stageCandidate lines 371–390; field-presence tests pass                 |
| 11 | Each province has its own isolated cron endpoint                          | VERIFIED   | 4 route files exist; each calls runPlacesDiscovery with province slice  |
| 12 | vercel.json has 4 new cron entries staggered Mon-Thu, existing unchanged  | VERIFIED   | vercel.json has 6 entries: scrape+discover unchanged, NS/NB/PEI/NL added|
| 13 | Gemini discovery threshold updated from 0.8 to 0.9                       | VERIFIED   | discovery-orchestrator.ts line 20: GEMINI_AUTO_APPROVE defaults to 0.9 |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact                                                   | Expected                               | Status     | Details                                                                    |
|------------------------------------------------------------|----------------------------------------|------------|----------------------------------------------------------------------------|
| `src/lib/scraper/places-discoverer.ts`                     | Types, city list, scoring, discovery functions | VERIFIED | 498 lines; exports PlacesSearchResponse, PlaceResult, all constants, isVenueRelevant, scorePlacesCandidate, searchCity, processPlaceResult, enrichVenue, runPlacesDiscovery, DiscoveryRunResult |
| `src/lib/scraper/places-discoverer.test.ts`                | Unit tests for all behaviors           | VERIFIED   | 47 tests across 10 describe blocks; searchCity, processPlaceResult, enrichVenue, runPlacesDiscovery, pure functions all covered |
| `src/lib/scraper/promote-source.ts`                        | no_website promotion path              | VERIFIED   | Lines 24 and 53–61: dual status guard and conditional scrape_source insert |
| `src/lib/scraper/promote-source.test.ts`                   | no_website tests                       | VERIFIED   | Tests 5b, 12, 13, 14 added; 15 total tests all pass                       |
| `src/app/api/cron/discover-places-ns/route.ts`             | Nova Scotia cron endpoint              | VERIFIED   | Exports GET + maxDuration=60; calls runPlacesDiscovery(PLACES_CITIES.NS)  |
| `src/app/api/cron/discover-places-nb/route.ts`             | New Brunswick cron endpoint            | VERIFIED   | Exports GET + maxDuration=60; calls runPlacesDiscovery(PLACES_CITIES.NB)  |
| `src/app/api/cron/discover-places-pei/route.ts`            | PEI cron endpoint                      | VERIFIED   | Exports GET + maxDuration=60; calls runPlacesDiscovery(PLACES_CITIES.PEI) |
| `src/app/api/cron/discover-places-nl/route.ts`             | Newfoundland cron endpoint             | VERIFIED   | Exports GET + maxDuration=60; calls runPlacesDiscovery(PLACES_CITIES.NL)  |
| `vercel.json`                                              | 4 new cron entries Mon-Thu at 9am UTC  | VERIFIED   | 6 total entries; NS Mon, NB Tue, PEI Wed, NL Thu; existing entries intact |
| `src/lib/scraper/discovery-orchestrator.ts`                | GEMINI_AUTO_APPROVE = 0.9              | VERIFIED   | Line 20: `parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9')`           |

---

## Key Link Verification

| From                                          | To                                         | Via                              | Status  | Details                                                                 |
|-----------------------------------------------|--------------------------------------------|----------------------------------|---------|-------------------------------------------------------------------------|
| `places-discoverer.ts`                        | `https://places.googleapis.com/v1/places:searchText` | native fetch POST       | WIRED   | Line 176; correct URL, headers (X-Goog-Api-Key, X-Goog-FieldMask, Content-Type) |
| `places-discoverer.ts`                        | `venue-dedup.ts`                           | import scoreVenueCandidate       | WIRED   | Line 11 import; used at line 325 in fuzzy dedup loop                   |
| `places-discoverer.ts`                        | `schema.ts (discovered_sources)`           | drizzle db.insert                | WIRED   | Line 371: `db.insert(discovered_sources).values({...})` with onConflictDoNothing |
| `discover-places-ns/route.ts`                 | `places-discoverer.ts`                     | import runPlacesDiscovery, PLACES_CITIES | WIRED | Line 1 import; line 11 calls runPlacesDiscovery(PLACES_CITIES.NS)   |
| `vercel.json`                                 | `discover-places-{ns,nb,pei,nl}`           | cron path config                 | WIRED   | All 4 paths present with staggered Mon-Thu 9am UTC schedules           |
| `places-discoverer.ts`                        | `promote-source.ts`                        | import promoteSource             | WIRED   | Line 12 import; called at line 483 in auto-approve loop                |
| `discover-places-ns/route.ts`                 | CRON_SECRET auth                           | Bearer token check               | WIRED   | Line 7: `authHeader !== \`Bearer \${process.env.CRON_SECRET}\``        |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                    | Status    | Evidence                                                              |
|-------------|-------------|--------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------|
| PLACES-01   | 23-02       | System discovers venues via Google Maps Places API Text Search                 | SATISFIED | searchCity() calls POST places:searchText; 6 tests pass              |
| PLACES-02   | 23-01       | System filters by 7 venue-relevant place types                                 | SATISFIED | VENUE_PLACE_TYPES Set with 7 types; isVenueRelevant() in searchCity  |
| PLACES-03   | 23-02       | System respects Places API rate limits with configurable throttle              | SATISFIED | PLACES_THROTTLE_MS env var; delay() between pages and between cities |
| PLACES-04   | 23-02       | System deduplicates before staging                                             | SATISFIED | Two-step dedup: google_place_id fast-path then fuzzy name+geo        |
| PLACES-05   | 23-02       | System extracts website URLs from Places results                               | SATISFIED | place.websiteUri used as url; staged as pending for scraping         |
| PLACES-06   | 23-01, 23-02| System creates no-website venue stubs with coordinates                         | SATISFIED | no_website status; synthetic URL places:{id}; lat/lng/address stored |
| PLACES-07   | 23-02       | System stores google_place_id for cross-source dedup                           | SATISFIED | google_place_id on all stageCandidate inserts; enrichVenue backfills  |
| GEO-01      | 23-01       | System covers ~30 population centers across all 4 Atlantic provinces           | SATISFIED | PLACES_CITIES: 41 communities (NS=15, NB=12, PEI=4, NL=10)          |
| GEO-02      | 23-03       | Discovery runs as chunked crons to stay within 60s timeout                     | SATISFIED | 4 separate per-province endpoints each with maxDuration=60            |
| GEO-03      | 23-03       | Each discovery channel runs on its own cron schedule                           | SATISFIED | Places crons Mon-Thu 9am; Gemini cron Mon 8am; scrape cron daily 6am |
| SCORE-01    | 23-01       | System uses Places-specific scoring with structured data bonus                 | SATISFIED | scorePlacesCandidate: 0.85 core, 0.70 secondary; auto-approve at 0.8 |
| SCORE-02    | 23-03       | System uses higher threshold for Gemini-sourced venues                         | SATISFIED | GEMINI_AUTO_APPROVE = 0.9 in discovery-orchestrator.ts               |
| SCORE-03    | 23-01, 23-02| System tracks discovery_method on all discovered sources                       | SATISFIED | discovery_method='google_places' on all Places inserts               |

All 13 required IDs from PLAN frontmatter verified. No orphaned requirements for Phase 23 in REQUIREMENTS.md.

---

## Anti-Patterns Found

None. All phase 23 files scanned:

- No TODO/FIXME/PLACEHOLDER comments in implementation files
- No empty return stubs (return null, return {}, return [])
- No console.log-only handlers
- The word "placeholder" in promote-source.ts line 35 is a comment describing the fallback address construction strategy, not a stub

---

## Test Suite Results

All 77 tests across 3 suites pass (verified by running jest):

- `places-discoverer.test.ts` — 47 tests: searchCity (6), PLACES_CITIES (5), constants/sets (4), isVenueRelevant (6), scorePlacesCandidate (10), processPlaceResult (8), enrichVenue (1), runPlacesDiscovery (4), threshold constants (2), VENUE_PLACE_TYPES (2)
- `promote-source.test.ts` — 15 tests: all original tests plus 4 new no_website path tests
- `discovery-orchestrator.test.ts` — 15 tests: threshold updated to 0.9, env var renamed to GEMINI_AUTO_APPROVE

---

## Human Verification Required

None. All goal-critical behaviors are verifiable programmatically via:

- Unit tests with mocked fetch and db
- Direct code inspection of HTTP calls, field assignments, conditional logic

The only live behavior (actual Places API calling, Vercel cron execution) requires production deployment and a real GOOGLE_MAPS_API_KEY. This is noted as a prerequisite in the deferred-items.md, not a gap — the code is correct and the infrastructure is wired.

---

## Commit Audit

All commits documented in SUMMARYs verified in git log:

| Commit  | Plan  | Description                                      |
|---------|-------|--------------------------------------------------|
| d0a0745 | 23-01 | Create places-discoverer types, city list, scoring |
| 8f20d66 | 23-01 | Update promoteSource for no_website status        |
| ca448a1 | 23-02 | Implement searchCity with pagination              |
| d709f66 | 23-02 | Implement dedup, staging, enrichment, runPlacesDiscovery |
| a4270d5 | 23-03 | Create 4 province Places discovery cron endpoints |
| 77208d0 | 23-03 | Update Gemini auto-approve threshold to 0.9       |

---

## Phase Goal Assessment

The phase goal is fully achieved:

1. **"discovers hundreds of Atlantic Canada venues per week"** — runPlacesDiscovery() calls the Places API per city across 41 communities in all 4 provinces. At ~5–20 results per city, the system can surface 200–800 candidates per weekly run.

2. **"automatically scores and stages candidates"** — scorePlacesCandidate() assigns 0.85 (core) or 0.70 (secondary) scores; auto-approve fires promoteSource() for records scoring >= 0.8; no_website stubs bypass scraping.

3. **"isolated cron endpoint that does not compete for the 60-second timeout budget"** — 4 separate per-province endpoints (NS/NB/PEI/NL) each capped at maxDuration=60; staggered Mon-Thu at 9am UTC; the existing Gemini discover cron runs Mon 8am independently.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
