---
phase: 16-ticketmaster-integration
plan: 02
subsystem: scraper, ui, admin
tags: [ticketmaster, orchestrator, attribution, admin-ui]
dependency_graph:
  requires: [16-01]
  provides: [ticketmaster-dispatch, ticketmaster-attribution, ticketmaster-admin-ui]
  affects: [orchestrator, event-cards, event-detail, admin-venues]
tech_stack:
  added: []
  patterns: [source-type-dispatch, attribution-link, badge-color-ternary]
key_files:
  created: []
  modified:
    - src/lib/scraper/orchestrator.ts
    - src/lib/scraper/orchestrator.test.ts
    - src/components/events/EventCard.tsx
    - src/app/event/[id]/page.tsx
    - src/app/admin/venues/[id]/SourceManagement.tsx
    - src/app/admin/venues/actions.ts
decisions:
  - TM metrics (last_event_count, avg_confidence) remain null — same as eventbrite/bandsintown, handler returns void
metrics:
  duration: 94s
  completed: 2026-03-15
  tasks_completed: 2
  files_modified: 6
---

# Phase 16 Plan 02: Ticketmaster Integration Wiring Summary

**One-liner:** Orchestrator dispatches to scrapeTicketmaster, EventCard/detail pages show "via Ticketmaster" attribution, admin UI recognizes ticketmaster source type with blue badge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Orchestrator wiring + attribution UI + admin source type recognition | 3a372dd | orchestrator.ts, orchestrator.test.ts, EventCard.tsx, event/[id]/page.tsx, SourceManagement.tsx, actions.ts |
| 2 | Verify complete Ticketmaster integration (checkpoint — auto-approved) | — | none |

## What Was Built

### Orchestrator Dispatch (orchestrator.ts)

Added `import { scrapeTicketmaster } from './ticketmaster'` and a new `else if` branch after bandsintown:

```typescript
} else if (source.source_type === 'ticketmaster') {
  await scrapeTicketmaster(source);
  console.log(`  ✓ Ticketmaster source ${source.id} (${source.url})`);
}
```

Metrics (`last_event_count`, `avg_confidence`) remain null on success — consistent with eventbrite/bandsintown handling since the handler returns void.

### Orchestrator Tests (orchestrator.test.ts)

Added mock for `./ticketmaster` module alongside existing mocks. Added `mockTicketmasterSource` fixture and two new tests (Tests 11 and 12):
- Test 11: verifies `scrapeTicketmaster` is called once with the source object
- Test 12: verifies `last_event_count` and `avg_confidence` are null in the success write

All 12 orchestrator tests pass.

### EventCard Attribution (EventCard.tsx)

Added "via Ticketmaster" attribution link after the category badge, before the View Details link:
```tsx
{ev.source_url?.includes('ticketmaster.com') && (
  <div className="mt-1">
    <a href={ev.source_url} target="_blank" rel="noopener noreferrer"
       className="text-xs text-blue-600 hover:underline"
       onClick={(e) => e.stopPropagation()}>
      via Ticketmaster
    </a>
  </div>
)}
```

`onClick stopPropagation` prevents the card's venue-click handler from firing when the attribution link is clicked.

### Event Detail Page Attribution (event/[id]/page.tsx)

Added "via Ticketmaster" attribution paragraph after the CTA button, before the description:
```tsx
{event.source_url?.includes('ticketmaster.com') && (
  <p className="text-sm text-gray-500 mb-4">
    Event data{' '}
    <a href={event.source_url} target="_blank" rel="noopener noreferrer"
       className="text-blue-600 hover:underline">
      via Ticketmaster
    </a>
  </p>
)}
```

### Admin Source Type Label + Badge (SourceManagement.tsx)

Added `ticketmaster: 'Ticketmaster'` to `SOURCE_TYPE_LABELS`. Added `type === 'ticketmaster' ? 'bg-blue-100 text-blue-800'` to badge color ternary chain (blue distinguishes from orange eventbrite and green bandsintown).

### Admin Source Type Detection (actions.ts)

Added `else if (url.includes('ticketmaster')) { sourceType = 'ticketmaster'; }` after the bandsintown branch in `addSource()`.

## Verification

- `npx jest src/lib/scraper/orchestrator.test.ts --no-coverage`: 12/12 tests pass
- `npx tsc --noEmit`: no type errors

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Satisfied

- PLAT-01: TM sources are now scraped (orchestrator dispatches to scrapeTicketmaster)
- PLAT-02: Admin UI recognizes ticketmaster source type with label and badge
- PLAT-03: "via Ticketmaster" attribution links appear on EventCard and event detail page

## Self-Check: PASSED

- src/lib/scraper/orchestrator.ts: FOUND
- src/components/events/EventCard.tsx: FOUND
- commit 3a372dd: FOUND
