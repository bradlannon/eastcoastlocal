---
phase: 12-venue-source-management
plan: "01"
subsystem: admin-venues
tags: [admin, venues, crud, geocoding, server-actions, next-app-router]
dependency_graph:
  requires: []
  provides: [venue-list-ui, venue-edit-ui, active-nav-highlighting]
  affects: [admin-layout]
tech_stack:
  added: []
  patterns: [server-component-with-client-form, useActionState, active-nav-via-usePathname]
key_files:
  created:
    - src/app/admin/venues/page.tsx
    - src/app/admin/venues/loading.tsx
    - src/app/admin/venues/actions.ts
    - src/app/admin/venues/[id]/page.tsx
    - src/app/admin/venues/[id]/VenueEditForm.tsx
    - src/app/admin/venues/[id]/loading.tsx
  modified:
    - src/app/admin/layout.tsx
decisions:
  - "Server component page passes venue data as props to a separate VenueEditForm client component — avoids mixing async server-fetch logic with useActionState"
  - "Admin layout converted to client component to use usePathname for active link detection — simplest approach for nav highlighting"
  - "Geocoding failure on update is non-fatal: saves venue with lat/lng null and logs a warning — preserves data integrity over silently failing saves"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-15"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
---

# Phase 12 Plan 01: Venue List and Edit UI Summary

**One-liner:** Venue list table with Drizzle LEFT JOIN source counts and venue edit form with geocoding-on-save using useActionState and server actions.

## What Was Built

**Task 1 — Venue list page, loading skeleton, active nav:**
- `/admin/venues` server page queries all venues LEFT JOINed to scrape_sources for source counts, ordered by name
- Loading skeleton with 5 animate-pulse rows matching the table layout
- Admin layout updated to `'use client'` using `usePathname()` — active link gets `font-semibold text-gray-900`, inactive links use `text-gray-600`
- Dashboard link uses exact match (`pathname === '/admin'`), other nav links use `startsWith`

**Task 2 — Venue detail/edit page and server action:**
- `/admin/venues/[id]` server page fetches venue by ID, calls `notFound()` for missing venues
- `VenueEditForm` client component uses `useActionState(updateVenue, {})` to display inline validation errors
- `updateVenue` server action: validates all fields, geocodes `${address}, ${city}, ${province}, Canada`, updates DB — geocoding failure is non-fatal (saves with null lat/lng)
- Province dropdown restricted to NB / NS / PEI / NL
- "Scrape Sources" section placeholder below edit form for Plan 02

## Decisions Made

1. **Server/client split for detail page:** Server component fetches venue data and renders breadcrumb/heading, passes venue as props to a `VenueEditForm` client component. This cleanly separates async DB access from `useActionState` form state.

2. **Layout as client component:** Converting `AdminLayout` to `'use client'` is the simplest way to access `usePathname()`. The layout has no async data needs, so there is no cost to this approach.

3. **Geocoding failure is non-fatal:** If `geocodeAddress` returns null, the venue is still saved with `lat`/`lng` set to null and a console warning is logged. This prevents a failed Google Maps API call from blocking an admin save.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- src/app/admin/venues/page.tsx: FOUND
- src/app/admin/venues/loading.tsx: FOUND
- src/app/admin/venues/actions.ts: FOUND
- src/app/admin/venues/[id]/page.tsx: FOUND
- src/app/admin/venues/[id]/VenueEditForm.tsx: FOUND
- src/app/admin/venues/[id]/loading.tsx: FOUND
- src/app/admin/layout.tsx (modified): FOUND

### Commits Exist
- 577eff2: feat(12-01): venue list page with source counts and active nav highlighting
- 5ef3caf: feat(12-01): venue detail/edit page with updateVenue server action and geocoding

## Self-Check: PASSED
