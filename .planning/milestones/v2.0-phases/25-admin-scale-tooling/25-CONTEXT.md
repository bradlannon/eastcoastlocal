# Phase 25: Admin Scale Tooling - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce admin review friction for high-volume discovery candidates. Three capabilities: batch approve multiple candidates at once, persist discovery run metrics to a new DB table, and display run summaries on the admin dashboard. No new discovery channels or scoring changes.

</domain>

<decisions>
## Implementation Decisions

### Batch Approve UX
- Add checkbox column to discovery list table (left of Name column)
- Per-row checkboxes for individual selection
- "Select All" checkbox in table header toggles all visible rows
- "Batch Approve (N)" button appears when any rows are selected — count updates live
- Immediate execution on click — no confirmation dialog (admin made conscious selections via checkboxes)
- Batch approve only — reject stays one-at-a-time since rejection reasons are per-candidate
- Batch approve calls existing `promoteSource()` for each selected candidate (same as individual approve)
- Only visible on the "pending" tab — no batch actions on approved/rejected tabs

### Discovery Run Metrics Storage
- New `discovery_runs` DB table (requires Drizzle migration)
- Columns: id (serial PK), discovery_method (text), province (text nullable), started_at (timestamp), completed_at (timestamp), candidates_found (int), auto_approved (int), queued_pending (int), skipped_dedup (int), errors (int), error_detail (text nullable)
- All three discovery channels instrument this table: google_places (4 province endpoints), gemini_google_search (existing discovery), reddit_gemini
- One row per cron run — Places gets one row per province endpoint, Reddit gets one aggregate row (province = null), Gemini gets one row (province = null)
- Keep all history — no retention cleanup (rows are tiny, ~350/year)

### Dashboard Run Summary
- New 5th stat card: "Last Discovery" showing relative time of most recent run + success/error indicator
- "Last Discovery" card links to /admin/discovery (pending tab) on click — same pattern as existing "Pending Discoveries" card
- New "Recent Discovery Runs" section below existing Source Health table
- Shows last 10 runs across all channels, ordered by completed_at desc
- Table columns: Method, Province, Found, Approved, Pending, Errors, When (relative time)

### Claude's Discretion
- Error row visual treatment in discovery runs table (red highlight vs plain number)
- Exact "Select All" checkbox behavior when some rows are already selected (toggle all vs clear all)
- Whether batch approve uses a single server action call with array of IDs or sequential calls
- Loading/disabled state during batch approve execution

</decisions>

<specifics>
## Specific Ideas

- Batch approve is the main pain point — Places discovery can stage 50+ candidates per province, and approving one-at-a-time is tedious
- The dashboard discovery runs table gives the admin a quick health check: "Did all my crons run this week? Any errors?"
- Discovery run metrics also serve as an audit trail — how many venues were auto-approved vs queued for review

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/admin/discovery/actions.ts`: `approveCandidate()` server action — calls `promoteSource(id)`. Batch approve can reuse this or call `promoteSource()` directly in a new batch action.
- `src/app/admin/discovery/_components/DiscoveryList.tsx`: Client component with existing row expand, approve/reject forms. Checkboxes add to this component's state.
- `src/app/admin/page.tsx`: Dashboard with 4 stat cards + source health table. New stat card and discovery runs table add to this page.
- `src/lib/scraper/places-discoverer.ts`: `DiscoveryRunResult` interface with `candidatesFound`, `autoApproved`, `stagedPending`, `skippedDuplicates`, `errors`. Model for what to persist.
- `src/lib/scraper/reddit-discoverer.ts`: `RedditDiscoveryRunResult` with similar fields.

### Established Patterns
- Server actions with `revalidatePath('/admin/discovery')` for form submissions
- `useFormStatus()` for pending/disabled button states
- Drizzle ORM with `drizzle-kit generate` for schema migrations
- Dashboard queries use `Promise.all()` for parallel DB fetches
- Stat cards use `bg-white rounded-lg shadow-sm border p-6` styling
- Tables use `divide-y divide-gray-200` with `bg-gray-50` header

### Integration Points
- `DiscoveryRunResult` / `RedditDiscoveryRunResult` — add DB insert after each cron run completes
- `runDiscoveryJob()` in discovery-orchestrator.ts — needs instrumentation (currently returns void)
- `vercel.json` cron schedule — no changes needed (crons already run)
- Admin layout — no changes needed (new content goes in existing pages)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-admin-scale-tooling*
*Context gathered: 2026-03-16*
