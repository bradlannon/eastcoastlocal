---
phase: 16-ticketmaster-integration
verified: 2026-03-15T00:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 16: Ticketmaster Integration Verification Report

**Phase Goal:** Major Atlantic Canada ticketed events from Scotiabank Centre, Avenir Centre, and other large venues appear on the map, sourced from Ticketmaster's Discovery API
**Verified:** 2026-03-15
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `scrapeTicketmaster()` fetches events from TM Discovery API filtered by stateCode parsed from synthetic URL | VERIFIED | `ticketmaster.ts` line 46 parses stateCode; line 53-64 builds params with countryCode=CA, stateCode, size=200, date window; 12 tests in `scrapeTicketmaster` describe block cover all param behavior |
| 2  | `findOrCreateVenue()` matches existing venues by ILIKE name + exact city, or inserts a new venue row | VERIFIED | `ticketmaster.ts` lines 124-135; uses `and(ilike(venues.name, name), eq(venues.city, city))`; 2 unit tests (match existing, create new) both verified |
| 3  | `mapTmClassification()` maps TM segment/genre to the 8-category enum | VERIFIED | `ticketmaster.ts` lines 140-157; 12 unit tests cover Music, Sports, Arts+comedy, Arts+theatre, Arts+theater, Arts+other, Family, Miscellaneous, Film, unknown, empty array |
| 4  | Every `upsertEvent()` call passes `event.url` as sourceUrl for attribution | VERIFIED | `ticketmaster.ts` line 112: `upsertEvent(venueId, extracted, event.url)`; dedicated test at line 158-172 verifies 3rd argument is the TM event URL |
| 5  | Seed script creates 4 placeholder venues and 4 scrape_sources rows (one per Atlantic province) | VERIFIED | `scripts/seed-ticketmaster.ts` lines 20-65; NB/NS/PE/NL venues + matching scrape_sources; `onConflictDoNothing()` on both inserts; `require.main === module` guard |
| 6  | Orchestrator dispatches to `scrapeTicketmaster` when source_type is 'ticketmaster' | VERIFIED | `orchestrator.ts` lines 119-122; import at line 11; Test 11 in orchestrator.test.ts verifies `scrapeTicketmaster` called with source |
| 7  | TM events on the map show 'via Ticketmaster' attribution linking to the TM event page | VERIFIED | `EventCard.tsx` lines 69-82; conditional on `ev.source_url?.includes('ticketmaster.com')`; renders `<a href={ev.source_url}>via Ticketmaster</a>` |
| 8  | TM events on the detail page show 'via Ticketmaster' attribution | VERIFIED | `event/[id]/page.tsx` lines 199-212; conditional on `event.source_url?.includes('ticketmaster.com')`; renders attribution paragraph with link |
| 9  | Admin source management recognizes 'ticketmaster' as a source type label | VERIFIED | `SourceManagement.tsx` line 23: `ticketmaster: 'Ticketmaster'` in SOURCE_TYPE_LABELS; badge color `bg-blue-100 text-blue-800` at line 34 |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/scraper/ticketmaster.ts` | TM Discovery API handler with venue find-or-create and category mapping | VERIFIED | 157 lines; exports `scrapeTicketmaster`, `findOrCreateVenue`, `mapTmClassification`; no stubs |
| `src/lib/scraper/ticketmaster.test.ts` | Unit tests covering API fetch, venue matching, category mapping, attribution | VERIFIED | 457 lines; 28 tests across 3 describe blocks; min_lines 100 exceeded |
| `scripts/seed-ticketmaster.ts` | One-time seed script for 4 TM placeholder venues + scrape_sources rows | VERIFIED | 87 lines; 4 NB/NS/PE/NL venues; 4 scrape_sources; `onConflictDoNothing()`; idempotent |
| `src/lib/scraper/orchestrator.ts` | Ticketmaster dispatch branch in scrape job loop | VERIFIED | `scrapeTicketmaster` imported line 11; dispatched at line 119-122 with log |
| `src/components/events/EventCard.tsx` | Attribution rendering for TM-sourced events | VERIFIED | `ticketmaster.com` check at line 70; `via Ticketmaster` link rendered conditionally |
| `src/app/event/[id]/page.tsx` | Attribution rendering on event detail page | VERIFIED | `ticketmaster.com` check at line 200; attribution paragraph with link at lines 199-212 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/scraper/ticketmaster.ts` | `src/lib/scraper/normalizer.ts` | `upsertEvent(venueId, extracted, sourceUrl)` | VERIFIED | Line 112: `await upsertEvent(venueId, extracted, event.url)` — all 3 args present |
| `src/lib/scraper/ticketmaster.ts` | `src/lib/db/schema.ts` | venues table ILIKE query | VERIFIED | Line 125: `and(ilike(venues.name, name), eq(venues.city, city))` — exact pattern |
| `src/lib/scraper/orchestrator.ts` | `src/lib/scraper/ticketmaster.ts` | import and call `scrapeTicketmaster(source)` | VERIFIED | Import line 11; dispatch line 120: `await scrapeTicketmaster(source)` |
| `src/components/events/EventCard.tsx` | `events.source_url` | `ticketmaster.com` check for attribution display | VERIFIED | Line 70: `ev.source_url?.includes('ticketmaster.com')` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PLAT-01 | 16-01, 16-02 | System scrapes Atlantic Canada events from Ticketmaster Discovery API filtered by province | SATISFIED | `scrapeTicketmaster()` parses province stateCode from synthetic URL; orchestrator dispatches for `source_type='ticketmaster'`; 4 province scrape_sources seeded |
| PLAT-02 | 16-01 | Ticketmaster events are matched to existing venues or new venues are auto-created with geocoding | SATISFIED | `findOrCreateVenue()` queries ILIKE name + exact city; inserts new venue with null lat/lng (geocoded on first orchestrator scrape run per existing geocoder logic in orchestrator.ts lines 63-72) |
| PLAT-03 | 16-01, 16-02 | Ticketmaster attribution is displayed on events sourced from their API (per ToS) | SATISFIED | `event.url` passed as `ticket_link` (ExtractedEvent) AND as `sourceUrl` (3rd arg to `upsertEvent`); `via Ticketmaster` link displayed on EventCard and event detail page when `source_url` contains `ticketmaster.com` |

All requirement IDs declared in both PLANs (PLAT-01, PLAT-02, PLAT-03) are accounted for. No orphaned requirements.

---

## Commit Verification

All commits documented in SUMMARY files exist in git history:

| Commit | Message | Plan |
|--------|---------|------|
| `057e556` | feat(16-01): TM handler with venue find-or-create, category mapping, and unit tests | 16-01 |
| `0a28a8c` | feat(16-01): seed script for TM placeholder venues and scrape_sources rows | 16-01 |
| `3a372dd` | feat(16-02): wire Ticketmaster into orchestrator, add attribution UI, update admin | 16-02 |

---

## Anti-Patterns Scan

Files scanned: `ticketmaster.ts`, `ticketmaster.test.ts`, `seed-ticketmaster.ts`, `orchestrator.ts` (dispatch section), `EventCard.tsx` (attribution section), `event/[id]/page.tsx` (attribution section), `SourceManagement.tsx`, `actions.ts`

No blockers or warnings found. Notable observations:

- `addSource()` in `actions.ts` validates URLs must start with `http://` or `https://`, which means the synthetic `ticketmaster:province:XX` URLs cannot be added via the admin form UI. This is by design — the seed script inserts them directly, and the plan documents this explicitly. Not a bug.
- `ticket_link` is set to `event.url` in the ExtractedEvent and `source_url` is also `event.url` (via the 3rd `sourceUrl` arg to `upsertEvent`). This means both the CTA button ("View on ticketmaster.com") and the "via Ticketmaster" attribution link point to the same TM event page — correct per PLAT-03.

---

## Human Verification Required

### 1. End-to-end scrape with live API key

**Test:** Set `TICKETMASTER_API_KEY` in environment, run `npx tsx scripts/seed-ticketmaster.ts` to seed sources, then trigger a scrape run. Check the map for Atlantic Canada events with "via Ticketmaster" attribution links.

**Expected:** TM events appear on the map with correct venue pins, clicking an event card shows the "via Ticketmaster" link, the event detail page also shows attribution, and the admin source management page shows "Ticketmaster" with a blue badge for seeded sources.

**Why human:** Requires a live Ticketmaster API key, seeded database, and visual inspection of rendered UI. Cannot verify programmatically that real TM events (e.g. Scotiabank Centre, Avenir Centre) surface correctly without a live API call.

---

## Gaps Summary

No gaps found. All must-haves from both plans are verified in the codebase.

The phase goal — Atlantic Canada ticketed events from large venues appearing on the map sourced from Ticketmaster's Discovery API — is architecturally complete:

1. The handler (`scrapeTicketmaster`) correctly fetches from TM Discovery API by province, creates or matches venues, and upserts events with full attribution.
2. The orchestrator routes `source_type='ticketmaster'` sources to the handler.
3. Seed data establishes the 4 province-level scrape sources needed to trigger scraping.
4. Attribution ("via Ticketmaster") appears on both the event card and event detail page for TM-sourced events, satisfying ToS.
5. The admin UI recognizes and labels the new source type.

The only remaining item is a live end-to-end test with a real API key (human verification above).

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
