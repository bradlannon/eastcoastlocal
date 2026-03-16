# Phase 33: Admin Manual Triggers - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can trigger any existing cron job (scrape, discover, archive) on demand from the admin dashboard without waiting for scheduled runs. No new cron jobs, no new data pipelines — just UI buttons that invoke existing functions.

</domain>

<decisions>
## Implementation Decisions

### Trigger placement
- Buttons live on the admin dashboard page (/admin)
- New "Actions" section below the stat cards, above the Source Health table
- 3 button groups: "Run Scrape", "Run Discovery" (dropdown for sub-types), "Run Archive"
- Discovery dropdown options: Gemini Search, Reddit, Places NS, Places NB, Places PEI, Places NL

### Feedback and status
- Inline spinner on the clicked button while running
- Result toast/banner showing outcome (e.g., "Scrape complete — 142 events processed" or "Failed: timeout")
- Dashboard stats refresh automatically after a successful trigger
- If request takes >30s, show subtle warning: "Still running... (Vercel timeout at 60s)"
- If timeout occurs, show "Job may still be running on the server" rather than a hard error

### Concurrency guards
- No server-side locking — allow parallel runs (endpoints are idempotent)
- Client-side disable: button disabled with spinner while awaiting response (prevents double-click)
- No guard against cron+manual overlap — upsert dedup and archive idempotency handle it

### Auth path
- Claude's Discretion — pick the best approach based on existing admin API patterns (admin JWT proxy vs direct cron call)

### Claude's Discretion
- Auth path implementation (admin API proxy vs direct cron endpoint call)
- Exact button styling and dropdown component choice
- Toast/banner implementation details
- Dashboard auto-refresh mechanism after trigger completes

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching existing admin dashboard patterns.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/admin/page.tsx`: Dashboard with stat cards and tables — trigger buttons go below stat cards
- `src/app/admin/_components/RefreshButton.tsx`: Existing client component for dashboard refresh — pattern for client interactivity in server component page
- Cron route handlers: All follow identical pattern (CRON_SECRET Bearer auth → call function → return JSON)
- `src/lib/archiver.ts` (`archivePastEvents`), `src/lib/scraper/orchestrator.ts` (`runScrapeJob`): Direct function imports available

### Established Patterns
- Cron endpoints: GET with `Bearer ${CRON_SECRET}` auth, return `{ success, timestamp }` or `{ success, error }`
- Admin pages: server components with client component islands (RefreshButton, NavLinks)
- Dashboard stat cards: `bg-white rounded-lg shadow-sm border p-6` styling
- Discovery runs table already shows per-method results (Google Places, Gemini Search, Reddit)

### Integration Points
- `src/app/admin/page.tsx` — add Actions section with trigger buttons
- New client component for trigger button group (needs fetch + state management)
- Existing cron functions can be called directly from a server action or API route

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-admin-manual-triggers*
*Context gathered: 2026-03-16*
