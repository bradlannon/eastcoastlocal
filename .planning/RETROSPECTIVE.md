# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Cumulative Quality

| Milestone | Tests | LOC | Files |
|-----------|-------|-----|-------|
| v1.0 | 77 | 3,521 | 105 |

### Top Lessons (Verified Across Milestones)

1. Lock UI decisions in discuss-phase before planning — prevents rework
2. Plan checker catches context compliance gaps before execution
3. Leaflet requires defensive React patterns (refs, listener cleanup, dynamic imports)
