---
phase: 12-venue-source-management
plan: "02"
subsystem: admin-venues
tags: [admin, venues, crud, scrape-sources, geocoding, server-actions, next-app-router, useActionState]

dependency_graph:
  requires:
    - phase: 12-01
      provides: "venue list and edit UI, updateVenue server action, VenueEditForm client component"
  provides:
    - venue-create-ui
    - scrape-source-add-ui
    - scrape-source-toggle-ui
  affects: [admin-venues, scraper-pipeline]

tech-stack:
  added: []
  patterns: [server-component-with-client-form, useActionState, revalidatePath-then-redirect, source-type-auto-detection]

key-files:
  created:
    - src/app/admin/venues/new/page.tsx
    - src/app/admin/venues/[id]/SourceManagement.tsx
  modified:
    - src/app/admin/venues/actions.ts
    - src/app/admin/venues/[id]/page.tsx

key-decisions:
  - "New venue page is a self-contained client component (not reusing VenueEditForm) — fields differ (no id hidden input, no defaultValues from DB) so a separate component is simpler and avoids mode prop complexity"
  - "addSource and toggleSource call revalidatePath then redirect — ensures Next.js cache is purged before the redirect lands on the refreshed page"
  - "Source type auto-detected from URL substring match (eventbrite/bandsintown) with venue_website as fallback — no external API call needed"
  - "Duplicate URL error detected by catching DB error message containing 'unique' or 'duplicate' — avoids an extra SELECT before INSERT"

patterns-established:
  - "Source toggle pattern: query current state → flip → revalidatePath → redirect (single round-trip with no client JS)"
  - "Inline add form in server-rendered list: SourceManagement client component receives pre-fetched sources as props, add form uses useActionState for inline error display"

requirements-completed: [VENUE-02, VENUE-04, VENUE-05]

duration: 2min
completed: "2026-03-15"
---

# Phase 12 Plan 02: Venue Creation and Scrape Source Management Summary

**Add venue form at /admin/venues/new with geocoding, plus scrape source list with add/toggle on the venue detail page using server actions and useActionState.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T03:03:34Z
- **Completed:** 2026-03-15T03:05:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `createVenue` server action validates fields, geocodes the address, inserts to DB, redirects to venue list
- New venue page at `/admin/venues/new` with breadcrumb, card styling, and province dropdown matching the edit form
- `addSource` action auto-detects source type from URL domain and prevents duplicate URLs with a user-friendly error
- `toggleSource` action flips enabled state and revalidates cache before redirect
- `SourceManagement` client component shows source list with type badges, toggle buttons, and inline add form with error display
- Venue detail page replaced placeholder with live source management UI

## Task Commits

1. **Task 1: Add venue page and createVenue server action** - `b4fd230` (feat)
2. **Task 2: Source management on venue detail page with add and toggle actions** - `9103fcb` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/app/admin/venues/new/page.tsx` - Client component with create venue form, breadcrumb, and province select
- `src/app/admin/venues/[id]/SourceManagement.tsx` - Client component with source list (type badges, toggle forms) and add-source form using useActionState
- `src/app/admin/venues/actions.ts` - Added createVenue, addSource, toggleSource server actions
- `src/app/admin/venues/[id]/page.tsx` - Queries scrape_sources, passes to SourceManagement; removed placeholder

## Decisions Made

1. **Separate new venue page (no VenueEditForm reuse):** The create form has no hidden id field and no pre-populated defaultValues. A mode prop on VenueEditForm would require non-trivial refactoring without clear benefit — a separate client component is simpler and follows plan guidance.

2. **revalidatePath before redirect in addSource/toggleSource:** Ensures the Next.js cache is cleared before the redirect lands so the refreshed page shows the latest data.

3. **Source type from URL substring:** `eventbrite` and `bandsintown` substrings match the known platform domains. Falls back to `venue_website`. No external lookup needed.

4. **Duplicate URL caught from DB error message:** Avoids an extra round-trip SELECT before INSERT. The unique constraint on `scrape_sources.url` guarantees integrity at the DB level.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Venue CRUD is complete: list, create, edit, source management all implemented
- Phase 13 can use `scrape_sources` rows as the starting point for the scraper pipeline

---
*Phase: 12-venue-source-management*
*Completed: 2026-03-15*
