---
phase: 23
slug: places-api-discovery
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npx jest src/lib/scraper/places-discoverer.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/scraper/places-discoverer.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | PLACES-01 | unit | `npx jest places-discoverer.test.ts -t "searchCity"` | N/A | ✅ pass |
| 23-01-02 | 01 | 1 | PLACES-02 | unit | `npx jest places-discoverer.test.ts -t "isVenueRelevant"` | N/A | ✅ pass |
| 23-01-03 | 01 | 1 | PLACES-03 | unit | `npx jest places-discoverer.test.ts -t "throttle"` | N/A | ✅ pass |
| 23-01-04 | 01 | 1 | PLACES-04 | unit | `npx jest places-discoverer.test.ts -t "dedup"` | N/A | ✅ pass |
| 23-01-05 | 01 | 1 | PLACES-05 | unit | `npx jest places-discoverer.test.ts -t "websiteUri"` | N/A | ✅ pass |
| 23-01-06 | 01 | 1 | PLACES-06 | unit | `npx jest places-discoverer.test.ts -t "no.website"` | N/A | ✅ pass |
| 23-01-07 | 01 | 1 | PLACES-07 | unit | `npx jest places-discoverer.test.ts -t "google_place_id"` | N/A | ✅ pass |
| 23-02-01 | 02 | 1 | GEO-01 | unit | `npx jest places-discoverer.test.ts -t "PLACES_CITIES"` | N/A | ✅ pass |
| 23-02-02 | 02 | 1 | GEO-02 | unit | `npx jest discover-places-ns/route.test.ts` | N/A | ✅ pass |
| 23-02-03 | 02 | 1 | GEO-03 | manual | inspect vercel.json | N/A | ✅ pass |
| 23-03-01 | 03 | 1 | SCORE-01 | unit | `npx jest places-discoverer.test.ts -t "scorePlacesCandidate"` | N/A | ✅ pass |
| 23-03-02 | 03 | 1 | SCORE-02 | unit | `npx jest discovery-orchestrator.test.ts -t "auto-approve"` | existing (update) | ✅ pass |
| 23-03-03 | 03 | 1 | SCORE-03 | unit | `npx jest places-discoverer.test.ts -t "discovery_method"` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/scraper/places-discoverer.test.ts` — stubs for PLACES-01 through PLACES-07, GEO-01, SCORE-01, SCORE-03
- [x] `src/app/api/cron/discover-places-ns/route.test.ts` — covers GEO-02
- [x] `src/app/api/cron/discover-places-nb/route.test.ts` — same pattern
- [x] `src/app/api/cron/discover-places-pei/route.test.ts` — same pattern
- [x] `src/app/api/cron/discover-places-nl/route.test.ts` — same pattern

*(SCORE-02 uses existing `discovery-orchestrator.test.ts` but tests must be updated when threshold changes from 0.8 to 0.9)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini discover cron schedule unchanged | GEO-03 | Config inspection, not runtime behavior | Inspect `vercel.json` — existing Gemini cron schedule must be unchanged |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
