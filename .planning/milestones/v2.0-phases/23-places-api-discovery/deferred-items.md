# Deferred Items — Phase 23

## Pre-existing TypeScript Errors (Out of Scope)

Found during 23-03 execution. These are pre-existing test mock objects missing `google_place_id` field (added in Phase 22 schema changes). Not caused by this plan's changes.

Files affected:
- src/app/api/events/route.test.ts (lines 42, 63)
- src/lib/filter-utils.test.ts (line 42)
- src/lib/scraper/orchestrator.test.ts (line 200)
- src/lib/timelapse-utils.test.ts (lines 50, 324)

Fix: Add `google_place_id: null` to each venue mock object in these test files.
