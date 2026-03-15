# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Cumulative Quality

| Milestone | Tests | LOC | Files |
|-----------|-------|-----|-------|
| v1.0 | 77 | 3,521 | 105 |
| v1.2 | 95+ | 6,172 | 132 |

### Top Lessons (Verified Across Milestones)

1. Lock UI decisions in discuss-phase before planning — prevents rework
2. Plan checker catches context compliance gaps before execution
3. Leaflet requires defensive React patterns (refs, listener cleanup, dynamic imports)
4. SUMMARY.md frontmatter population is unreliable across milestones — 3-source cross-reference compensates
5. Schema-first gating prevents downstream churn in multi-phase milestones
