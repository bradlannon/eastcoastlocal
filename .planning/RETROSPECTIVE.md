# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.5 — Event Dedup & UX Polish

**Shipped:** 2026-03-15
**Phases:** 8 | **Plans:** 14

### What Was Built
- Two-signal venue deduplication scoring module (name similarity + geocoordinate proximity) with dry-run backfill CLI
- Ticketmaster Discovery API integration for all 4 Atlantic Canada provinces with venue find-or-create and attribution
- Event source tracking join table (event_sources) recording which scrapers discovered each event
- Non-destructive cross-source conflict resolution via COALESCE for source_url and ticket_link
- Admin merge review UI with side-by-side venue comparison, inline merge confirmation, and keep-separate
- Map-pin flyTo icon on event cards, category filter chips in timelapse overlay
- Auto-approve pipeline for high-confidence discovered sources with admin revoke capability
- Scrape quality metrics (event count, confidence, failure rate) on admin dashboard
- Tech debt cleanup phase closing ATTR-02 gap, orphaned export, and eventCount badge bug

### What Worked
- Pure-function dedup scoring module (venue-dedup.ts) with zero DB imports — testable, composable, reusable
- Milestone audit between Phase 20 and Phase 21 caught 3 concrete gaps (ticket_link COALESCE, findBestMatch orphan, eventCount badge) — Phase 21 closed all of them cleanly
- Integration checker validated all 5 E2E flows and caught the backfill script FK violation risk
- Two-signal merge gate was deliberately conservative — TM inline merge is unreachable by design (null geo), forcing admin review for all TM venue matches
- discuss-phase context sessions for Phases 19 and 20 captured complex UI decisions (timelapse overlay layout, merge confirmation flow) before planning

### What Was Inefficient
- SUMMARY frontmatter `requirements_completed` still inconsistently populated — ATTR-01 and ATTR-02 missing from their respective SUMMARYs despite being verified in VERIFICATION.md
- Nyquist VALIDATION.md files created for all 8 phases but none progressed past draft — same pattern as previous milestones
- Phase 18 was already archived to milestones/v1.5-phases/ before v1.5 completion — caused find-phase lookup issues during audit
- Backfill script written before performVenueMerge was extracted — duplicate merge logic with missing event_sources FK cleanup
- 2 ticketmaster.test.ts unit tests left broken (incomplete .limit() mock) — test infrastructure debt accumulated

### Patterns Established
- `scoreVenueCandidate` per-candidate scoring (not batch `findBestMatch`) — retains candidate.id for audit log insertion
- `COALESCE(${events.column}, ${incoming})` pattern for non-destructive upsert — first value wins
- Drizzle `alias()` for self-join in merge review — clean pattern for side-by-side FK comparison
- `useState(confirmingId)` for inline merge confirmation — no modal, no redirect, single-click with cancel
- AsyncLayout + ClientNavLinks pattern — server component fetches badge count, client component handles interactivity

### Key Lessons
1. Milestone audit as a gate before completion catches real integration gaps — Phase 21 was created specifically from audit findings
2. Pure-function modules with zero DB imports make scoring/matching logic fully testable and composable
3. Conservative dedup thresholds + admin review path is safer than aggressive auto-merge — let data accumulate before tuning
4. Backfill scripts should reuse the canonical utility (performVenueMerge) rather than reimplementing — extracted utilities must be adopted retroactively
5. Integration checker at milestone level validates cross-phase wiring that individual phase verifiers miss

### Cost Observations
- Model mix: orchestrator on opus, executor/verifier/researcher/planner/checker on sonnet
- 2 days from Phase 14 start to all 8 phases shipped
- Notable: Phase 21 (tech debt cleanup) was the fastest phase — 3 targeted fixes, no research needed, 1 plan

---

## Milestone: v1.3 — Admin Tools

**Shipped:** 2026-03-15
**Phases:** 4 | **Plans:** 6

### What Was Built
- JWT auth with Edge-compatible middleware protecting all /admin routes
- Admin dashboard with live stat cards (venues, sources, discoveries, last scrape) and per-source health table
- Full venue CRUD with auto-geocoding and scrape source management (add/toggle)
- Discovery review UI with tab filtering, inline expansion, one-click approve, and reject with reason

### What Worked
- discuss-phase locked all UI decisions (layout, nav, interactions) upfront — zero rework across 4 phases
- Phase 11 dashboard linked to future pages (/admin/venues, /admin/discovery) before they existed — seamless integration when Phases 12-13 built them
- Reusing existing `promoteSource()` function for the approve action avoided code duplication
- Single-wave plans (1-2 tasks each) kept executor context tight — all 6 plans completed successfully on first attempt
- Active nav highlighting added in Phase 12 carried forward naturally to Phase 13

### What Was Inefficient
- SUMMARY.md `requirements_completed` frontmatter still inconsistently populated — VENUE-01 and VENUE-03 missing from 12-01-SUMMARY despite being verified
- Env var setup for admin auth required manual Vercel dashboard configuration + empty commit to trigger redeploy — could document this in CLAUDE.md
- Research disabled for all phases (config setting) — worked fine for a straightforward admin CRUD milestone but may miss edge cases in more complex work

### Patterns Established
- `useActionState` + server actions for all admin forms — consistent pattern across login, venue edit, venue create, source add, reject
- Server component pages + small client component islands (RefreshButton, VenueEditForm, SourceManagement, DiscoveryList) — clean separation
- `revalidatePath` + `redirect` for mutation feedback — consistent across all admin actions
- SQL CASE expression for custom sort order (failures first in health table)
- Auto-detect source type from URL domain — simple heuristic, no user input needed

### Key Lessons
1. Admin CRUD is well-suited to minimal planning — clear requirements, established patterns, no ambiguous UX decisions
2. Linking to future pages early (dashboard → venues/discovery) creates natural integration points
3. Single admin credential with SHA-256 + jose JWT is sufficient and Edge-compatible — avoid overengineering auth for single-operator tools

### Cost Observations
- Model mix: orchestrator on opus, executor/verifier/checker/planner on sonnet
- ~2 hours from Phase 10 start to all 4 phases shipped
- Notable: discuss-phase took longest per phase (~5 min interactive), execution averaged ~4 min per plan

---

## Milestone: v1.2 — Event Discovery

**Shipped:** 2026-03-15
**Phases:** 4 | **Plans:** 6

### What Was Built
- 8-value event category taxonomy with pgEnum, Drizzle migration, and CATEGORY_META display constants
- AI-powered event categorization — Gemini extractor broadened to all event types with per-category prompt guidance
- Category filter chip UI with nuqs URL persistence, badges on event cards and detail pages
- Automated source discovery using Gemini + Google Search grounding across 6 Atlantic Canada cities
- Weekly discovery cron with domain deduplication and aggregator filtering
- CLI-based source promotion from discovered_sources staging to active scrape pipeline

### What Worked
- Schema-first approach (Phase 6 as hard gate) meant Phases 7-9 all built on stable foundations — no schema changes mid-milestone
- Parallel execution of Phase 9's two plans (discovery + promotion) saved time with no conflicts
- z.enum(EVENT_CATEGORIES) in Zod schema caught invalid categories at parse time — no bad data reached the DB
- Reusing existing Gemini + Vercel AI SDK patterns for discovery meant zero new dependencies added
- Integration checker caught the timelapse-mode category chip gap before it could surprise users

### What Was Inefficient
- SUMMARY.md frontmatter `requirements_completed` was empty for Phase 8 plans — same issue as v1.0, still not consistently populated by executors
- Nyquist VALIDATION.md never updated to compliant — all 4 phases show `nyquist_compliant: false` despite having validation files
- Phase 6 and 7 VERIFICATIONs stuck at `human_needed` — human verification items (Neon DB inspection, live Gemini quality) accumulated without a clear resolution path
- ROADMAP.md plan checkboxes and progress table got out of sync with actual completion state — some plans showed `[ ]` despite having SUMMARYs

### Patterns Established
- `z.enum(EVENT_CATEGORIES).default('other')` pattern for AI-assigned fields — provides type safety + sensible fallback when LLM omits field
- `onConflictDoNothing()` for staging table inserts — domain-level dedup without error handling complexity
- `google.tools.googleSearch({})` for Gemini grounding — search results as structured AI input, not raw web scraping
- Bearer auth pattern for cron routes — `CRON_SECRET` check mirrored across scrape and discover endpoints

### Key Lessons
1. Schema-first gating works well for multi-phase milestones — all downstream phases had stable types to import
2. SUMMARY frontmatter population remains unreliable — the 3-source cross-reference in milestone audit works around it, but executor agents should be more consistent
3. Category filter chips hidden in timelapse mode is a design gap worth catching earlier — integration checker at milestone level was the right safety net

### Cost Observations
- Model mix: orchestrator on opus, executor/verifier/integration-checker on sonnet
- 1 day from milestone start to shipped
- Notable: 2-plan parallel wave in Phase 9 completed in ~5 minutes wall-clock time

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-14
**Phases:** 3 | **Plans:** 8

### What Was Built
- Full-stack live music discovery app for Atlantic Canada
- AI-powered scraping pipeline (Gemini LLM + Eventbrite/Bandsintown APIs)
- Interactive Leaflet map with clustered venue pins and split-screen event list
- Date/province filters with URL persistence, geolocation, and event detail pages
- Daily automated cron scraping with deduplication and geocoding

### What Worked
- Phase dependency chain (infra → pipeline → frontend) enforced clean separation — no circular dependencies
- TDD for filter utilities caught edge cases early (weekend boundary logic, null coordinate handling)
- discuss-phase context gathering locked in UI decisions before planning — zero rework on layout/interaction design
- Plan checker caught missing click-to-pan behavior before execution — saved a rework cycle
- All 21 requirements traced end-to-end with no orphans

### What Was Inefficient
- Two runtime bugs (MapBoundsTracker infinite loop, MapViewController popup stack overflow) only caught during human-verify checkpoint — unit tests couldn't cover Leaflet interaction patterns
- SUMMARY.md frontmatter `requirements_completed` was inconsistently populated — some plans listed them, others didn't, making the 3-source cross-reference partial
- Nyquist VALIDATION.md frontmatter was never updated to `nyquist_compliant: true` after execution — sign-off step missed

### Patterns Established
- `useRef` for stabilizing callbacks passed to Leaflet event handlers (prevents re-registration loops)
- Remove event listeners before triggering actions that re-fire those events (openPopup → moveend → openPopup)
- `MapClientWrapper` pattern: separate `'use client'` file for `next/dynamic({ ssr: false })` to avoid SSR issues in Server Component imports
- nuqs `useQueryState` for filter URL persistence — simpler than manual URLSearchParams + router.push

### Key Lessons
1. Leaflet + React requires defensive coding: stabilize callbacks with refs, remove listeners before side-effect actions, and always use dynamic imports with ssr:false
2. discuss-phase is high-value for UI phases — locking layout, interaction, and filter behavior upfront prevented all scope creep during execution
3. Plan checker verification loop pays for itself — the click-to-pan blocker would have been a mid-execution deviation without it

### Cost Observations
- Model mix: orchestrator on opus, researcher/executor/checker on sonnet
- 2 days from project init to shipped milestone
- Notable: 3-wave sequential execution kept plans small (2-3 tasks each) and executor context manageable

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 8 | First milestone — established discuss→plan→execute→verify loop |
| v1.2 | 4 | 6 | Schema-first gating; parallel plan execution; integration checker at milestone level |
| v1.3 | 4 | 6 | Research disabled; single-wave plans; admin CRUD patterns established |
| v1.5 | 8 | 14 | Milestone audit as completion gate; gap-closure phase from audit findings; pure-function scoring modules |

### Cumulative Quality

| Milestone | Tests | LOC | Files |
|-----------|-------|-----|-------|
| v1.0 | 77 | 3,521 | 105 |
| v1.2 | 95+ | 6,172 | 132 |
| v1.3 | 95+ | 7,983 | 153 |
| v1.5 | 269+ | 11,774 | 219 |

### Top Lessons (Verified Across Milestones)

1. Lock UI decisions in discuss-phase before planning — prevents rework
2. Plan checker catches context compliance gaps before execution
3. Leaflet requires defensive React patterns (refs, listener cleanup, dynamic imports)
4. SUMMARY.md frontmatter population is unreliable across milestones — 3-source cross-reference compensates
5. Schema-first gating prevents downstream churn in multi-phase milestones
6. Admin CRUD phases benefit from skipping research — patterns are well-established, discussion captures all needed decisions
7. Milestone audit as a gate before completion catches real integration gaps — creates targeted cleanup phases
8. Pure-function modules (zero DB imports) make scoring/matching logic fully testable and composable
9. Backfill scripts must adopt canonical utilities — duplicate logic diverges as the utility evolves
