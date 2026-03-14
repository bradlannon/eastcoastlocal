---
phase: 02-data-pipeline
plan: "01"
subsystem: scraper-pipeline
tags: [scraping, llm, geocoding, dedup, tdd, cheerio, ai-sdk]
dependency_graph:
  requires: []
  provides: [fetcher, extractor, normalizer, geocoder, extracted-event-schema]
  affects: [02-03-orchestrator]
tech_stack:
  added: [ai@6, "@ai-sdk/google@3", cheerio]
  patterns: [AI-SDK-6-generateText-Output.object, upsert-dedup, TDD-red-green]
key_files:
  created:
    - src/lib/schemas/extracted-event.ts
    - src/lib/scraper/fetcher.ts
    - src/lib/scraper/extractor.ts
    - src/lib/scraper/normalizer.ts
    - src/lib/scraper/geocoder.ts
    - src/lib/scraper/fetcher.test.ts
    - src/lib/scraper/extractor.test.ts
    - src/lib/scraper/normalizer.test.ts
    - src/lib/scraper/geocoder.test.ts
  modified:
    - package.json
decisions:
  - "normalizePerformer removes non-alphanumeric chars without space replacement (AC/DC -> acdc)"
  - "geocodeAddress rejects APPROXIMATE precision but accepts ROOFTOP and RANGE_INTERPOLATED"
  - "extractEvents uses generateText + Output.object pattern (AI SDK 6), not generateObject"
  - "upsertEvent targets composite dedup key: venue_id + event_date + normalized_performer"
metrics:
  duration: "5m 6s"
  completed_date: "2026-03-14"
  tasks_completed: 2
  files_created: 9
  files_modified: 1
  tests_passing: 43
---

# Phase 2 Plan 01: Core Scraping Pipeline Modules Summary

HTML fetch/preprocess, Gemini LLM extraction via AI SDK 6, performer normalization, upsert deduplication, and Google Maps geocoding — all with unit tests and zero real API calls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extraction schema, fetcher, extractor + tests | ab41a3a | extracted-event.ts, fetcher.ts, extractor.ts, *.test.ts |
| 2 | Normalizer, geocoder + tests | 30617be | normalizer.ts, geocoder.ts, *.test.ts |
| fix | TypeScript cast fix in normalizer.test.ts | ed4f145 | normalizer.test.ts |

## What Was Built

Five independently testable pipeline modules:

1. **`src/lib/schemas/extracted-event.ts`** — Zod schema for LLM extraction output. Array of events with performer, event_date, event_time, price, ticket_link, description, cover_image_url, confidence (0–1).

2. **`src/lib/scraper/fetcher.ts`** — `fetchAndPreprocess(url)`: fetches HTML, strips script/style/nav/footer/header/aside/ad elements via cheerio, extracts main content, detects bot-blocking (short pages, Cloudflare "Just a moment" strings), collapses whitespace, limits to 15k chars.

3. **`src/lib/scraper/extractor.ts`** — `extractEvents(pageText, sourceUrl)`: calls Gemini 2.5 Flash via AI SDK 6 `generateText + Output.object` pattern. Post-filters: null performer, null event_date, confidence < 0.5, past dates.

4. **`src/lib/scraper/normalizer.ts`** — `normalizePerformer(name)`: lowercase, remove non-alphanumeric except spaces, collapse spaces. `upsertEvent(venueId, extracted, sourceUrl)`: drizzle insert with `onConflictDoUpdate` targeting the composite dedup index.

5. **`src/lib/scraper/geocoder.ts`** — `geocodeAddress(address)`: calls Google Maps REST API with `region=ca&components=country:CA`. Returns `{lat, lng}` for ROOFTOP/RANGE_INTERPOLATED precision, `null` for APPROXIMATE or no results.

## Test Coverage

43 tests passing across 6 test suites (includes existing bandsintown and eventbrite tests from plan 02-02):

- `fetcher.test.ts`: 9 tests — script/style/nav stripping, bot detection, whitespace collapse, 15k limit
- `extractor.test.ts`: 6 tests — null date/performer filtering, confidence filter, past date filter
- `normalizer.test.ts`: 10 tests — normalizePerformer variants, upsertEvent field mapping, dedup target
- `geocoder.test.ts`: 7 tests — ROOFTOP returns coords, APPROXIMATE returns null, ZERO_RESULTS returns null, URL params

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cheerio not installed**
- Found during: Task 1 (fetcher implementation)
- Issue: `cheerio` not in package.json but required by fetcher.ts
- Fix: `npm install cheerio`
- Files modified: package.json, package-lock.json
- Commit: ab41a3a

**2. [Rule 1 - Bug] normalizePerformer regex replaced special chars with space**
- Found during: Task 2 GREEN phase
- Issue: `AC/DC` produced `"ac dc"` instead of `"acdc"` — regex was replacing `/` with space rather than removing it
- Fix: Changed regex to remove non-alphanumeric chars with empty string `''` instead of `' '`
- Files modified: normalizer.ts
- Commit: 30617be

**3. [Rule 1 - Bug] TypeScript TS2352 cast errors in normalizer.test.ts**
- Found during: verification (`npx tsc --noEmit`)
- Issue: `db as { insert: jest.MockedFunction<typeof db.insert> }` failed because types don't overlap sufficiently
- Fix: Used `db as unknown as { insert: jest.Mock }` double-cast pattern
- Files modified: normalizer.test.ts
- Commit: ed4f145

## Verification Results

- `npm test -- --testPathPattern=scraper`: 43 passed, 0 failed
- `npx tsc --noEmit`: no errors
- `npx next build`: compiled successfully

## Self-Check: PASSED
