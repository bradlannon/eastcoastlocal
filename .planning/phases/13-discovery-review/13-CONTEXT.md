# Phase 13: Discovery Review - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Web UI for reviewing, approving, and rejecting discovered source candidates. Replaces the CLI `promoteSource()` workflow. Approving creates a venue + scrape source. Rejecting records a reason. No changes to the discovery pipeline itself.

</domain>

<decisions>
## Implementation Decisions

### Discovery list & filtering
- Status filter via tab buttons at top: Pending / Approved / Rejected
- Tab buttons show counts: "Pending (3)" / "Approved (12)" / "Rejected (5)"
- Pending tab shown by default
- Table columns: Source Name (or domain fallback), URL (truncated), City, Province
- Clicking a row expands it inline to show raw_context, discovery_method, and action buttons
- No separate detail page — everything happens on the list page

### Approve interaction
- Auto-promote on approve: reuses existing promoteSource() logic (creates venue from discovered data + scrape source, marks as approved)
- One click, no confirmation dialog — low risk since venues can be edited later via /admin/venues
- Row disappears from pending list immediately after approve, tab counts update

### Reject interaction
- Click Reject → small inline text input appears for an optional reason → click Confirm Reject
- Reason and reviewed_at timestamp saved to discovered_sources row
- Row disappears from pending list immediately after reject

### Claude's Discretion
- Inline expand animation/transition style
- Reject reason input placement and styling
- Raw context display formatting (pre-formatted text, truncation, etc.)
- Empty state when no candidates in a status tab
- Loading states during approve/reject actions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- promoteSource() (src/lib/scraper/promote-source.ts): Core approval logic — creates venue, scrape_source, updates discovered_sources status. Can be imported directly as a server action dependency
- Admin layout (src/app/admin/layout.tsx): Active nav highlighting via usePathname() already handles /admin/discovery
- Dashboard (src/app/admin/page.tsx): "Pending Discoveries" stat card already links to /admin/discovery
- Drizzle schema (src/lib/db/schema.ts): discovered_sources table with url, domain, source_name, province, city, status, discovery_method, raw_context, reviewed_at, added_to_sources_at

### Established Patterns
- Table UI with Tailwind (venue list, source health table)
- Server actions for mutations (venues/actions.ts pattern)
- useActionState for client-side form state (VenueEditForm, SourceManagement patterns)
- Tab/filter buttons could follow category chip pattern from public UI
- loading.tsx skeleton placeholders

### Integration Points
- Dashboard "Pending Discoveries" card links to /admin/discovery
- Top nav "Discovery" link already points to /admin/discovery
- After approve, new venue appears in /admin/venues list
- discovered_sources.status field: 'pending', 'approved', 'rejected' (plain text, no enum)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The review flow should feel fast since you might review several candidates in a row.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-discovery-review*
*Context gathered: 2026-03-15*
