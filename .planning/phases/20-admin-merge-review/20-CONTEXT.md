# Phase 20: Admin Merge Review - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can inspect and resolve borderline venue merge candidates that Phase 18 logged to `venue_merge_candidates` but did not auto-merge. Admin can merge a pair (reassigning events/sources and deleting the duplicate) or mark a pair as "keep separate" so it no longer appears in the review queue. This is an admin-only feature at `/admin/merge-review`.

</domain>

<decisions>
## Implementation Decisions

### Candidate list layout
- Side-by-side cards for each candidate pair — two venue cards next to each other with match metadata between them
- Each card shows: venue name, city, province, lat/lng (if available), event count, source count
- Match metadata between cards: name_score, distance_meters (if available), and reason
- Reason displayed as human-readable label (e.g. "Name match, no coordinates" not "name_match_no_geo")
- No mini map — lat/lng numbers and distance are sufficient
- Merge and Keep Separate action buttons below the card pair

### Merge action behavior
- Canonical venue chosen by highest event count — the venue with more events survives, its identity (name/address/coords) is preserved
- Inline confirmation: click "Merge" -> button changes to "Confirm merge?" with cancel. No modal
- Hard delete the duplicate venue row after reassigning its events and sources to the canonical venue (same approach as existing backfill script)
- Write to existing `venue_merge_log` table for audit trail (canonical_venue_id, merged_venue_name, merged_venue_city, name_score, distance_meters)
- Update `venue_merge_candidates` row: set status='merged' and reviewed_at timestamp

### Keep-separate workflow
- Single click, no confirmation needed (low-risk — no data changes)
- Updates `venue_merge_candidates` row: set status='kept_separate' and reviewed_at timestamp
- Permanently resolved — if the same pair is re-detected by a future TM ingest, it does NOT reappear in the queue (check existing candidates before inserting)
- Not reversible from this UI — admin can always manually merge venues through the venue edit page if they change their mind
- No undo/re-queue functionality needed

### Filtering & prioritization
- Tab filter matching discovery page pattern: Pending | Merged | Kept Separate
- Default tab: Pending (the actionable queue)
- Sort: newest first (created_at descending) within each tab
- No reason-type filter — queue expected to be small; reason visible on each card
- Pending count badge on admin nav "Merge Review" item (orange, same visual language as discovery)
- Empty state: "No pending merge candidates. Candidates appear after Ticketmaster ingests detect near-match venues."

### Claude's Discretion
- Exact card styling, spacing, and responsive behavior
- Human-readable reason label text for each of the 4 reason codes
- Admin nav placement and badge implementation
- Server action vs API route for merge/keep-separate operations
- Whether to show reviewed_at timestamp on merged/kept-separate tab items

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. All decisions align with existing admin UI patterns (discovery page tabs, venue list styling, Tailwind + server components).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `venue_merge_candidates` table (schema.ts:101): Already has venue_a_id, venue_b_id, name_score, distance_meters, reason, status, created_at, reviewed_at
- `venue_merge_log` table (schema.ts:89): Audit log for completed merges — reuse for admin-triggered merges
- `venue-dedup-backfill.ts` (scripts/): Contains merge logic (reassign events, reassign sources, delete duplicate, log) — extract into shared utility
- Discovery page (`admin/discovery/page.tsx`): Tab-based status filtering pattern with counts — reuse for pending/merged/kept_separate tabs
- `RefreshButton.tsx` (`admin/_components/`): Shared admin component
- Admin layout (`admin/layout.tsx`): Nav structure where badge count will be added

### Established Patterns
- Server components with `export const dynamic = 'force-dynamic'` for admin pages
- Server actions in co-located `actions.ts` files for mutations
- Drizzle ORM queries with joins for count aggregation
- Tab filtering via URL searchParams (same as discovery page)
- Tailwind CSS styling consistent with existing admin pages

### Integration Points
- `admin/layout.tsx`: Add "Merge Review" nav item with pending count badge
- `ticketmaster.ts:185`: Already inserts into venue_merge_candidates — needs dedup check against existing kept_separate pairs
- New route: `app/admin/merge-review/page.tsx` with `actions.ts`
- Shared merge utility extracted from `venue-dedup-backfill.ts` for reuse

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 20-admin-merge-review*
*Context gathered: 2026-03-15*
