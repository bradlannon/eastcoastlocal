# Deferred Items — Phase 07 AI Categorization

## Pre-existing test failure (out of scope)

**File:** `src/lib/db/seed.test.ts`
**Test:** "Seed Data Structure > source data > Facebook-only venues have their sources disabled"
**Error:** `expect(shipPubIndex).toBeGreaterThanOrEqual(0)` — 'The Ship Pub & Kitchen' not found in sourceData
**Confirmed pre-existing:** Failure reproduced on commit d0ee692 before any Task 2 changes.
**Action:** Deferred — unrelated to Phase 7 AI categorization work. Seed data test references a venue that no longer exists in seed data.
