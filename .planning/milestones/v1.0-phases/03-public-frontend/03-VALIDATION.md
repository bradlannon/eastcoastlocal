---
phase: 3
slug: public-frontend
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest |
| **Config file** | `jest.config.ts` — `testEnvironment: 'node'`, `testMatch: ['**/*.test.ts']` |
| **Quick run command** | `npm test -- --testPathPattern=filter-utils` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=filter-utils`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | MAP-04 | unit | `npm test -- --testPathPattern=filter-utils` | N/A | ✅ pass |
| 03-01-02 | 01 | 1 | MAP-05 | unit | `npm test -- --testPathPattern=filter-utils` | N/A | ✅ pass |
| 03-01-03 | 01 | 1 | MAP-06 | unit | `npm test -- --testPathPattern=filter-utils` | N/A | ✅ pass |
| 03-02-01 | 02 | 1 | MAP-08 | unit | `npm test -- --testPathPattern=events-api` | N/A | ✅ pass |
| 03-03-01 | 03 | 2 | MAP-01 | manual-only | Visual check in browser | N/A | ✅ pass |
| 03-03-02 | 03 | 2 | MAP-02 | manual-only | Visual check in browser | N/A | ✅ pass |
| 03-03-03 | 03 | 2 | MAP-03 | manual-only | Visual check in browser | N/A | ✅ pass |
| 03-03-04 | 03 | 2 | MAP-07 | manual-only | Requires browser API | N/A | ✅ pass |
| 03-03-05 | 03 | 2 | MAP-09 | manual-only | Visual check at 375px | N/A | ✅ pass |
| 03-03-06 | 03 | 2 | INFR-02 | manual-only | DevTools Network check | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/filter-utils.test.ts` — stubs for MAP-04, MAP-05, MAP-06 filter functions
- [x] `src/app/api/events/route.test.ts` — stubs for MAP-08 API shape; mocks Drizzle db client

*Note: `jest.config.ts` currently only matches `*.test.ts` — React component tests would require `jest-environment-jsdom`, not needed for this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map centered on Atlantic Canada renders | MAP-01 | Leaflet requires browser DOM | Open app, verify map shows all 4 provinces |
| Markers cluster/expand on zoom | MAP-02 | Visual rendering | Zoom out to see clusters with count, zoom in to see individual pins |
| Pin click opens venue popup | MAP-03 | Leaflet popup interaction | Click a pin, verify popup shows band/venue/date |
| Geolocation centers map | MAP-07 | Browser Geolocation API | Click locate button, verify map pans to location |
| Mobile layout usable | MAP-09 | Responsive layout | View at 375px width, verify bottom tabs and readable cards |
| Map loads under 3s | INFR-02 | Network timing | DevTools > Network > Slow 3G disabled, measure load time |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
