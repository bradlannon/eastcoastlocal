---
phase: 19
slug: ux-polish-source-attribution
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 with ts-jest |
| **Config file** | jest.config.ts (root) |
| **Quick run command** | `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/ticketmaster.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/ticketmaster.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | UX-01 | manual | N/A — React component, no jsdom | N/A | ✅ pass |
| 19-01-02 | 01 | 1 | UX-02 | manual | N/A — React component, no jsdom | N/A | ✅ pass |
| 19-02-01 | 02 | 1 | ATTR-01 | unit | `npx jest src/lib/db/schema.test.ts --no-coverage` | N/A | ✅ pass |
| 19-02-02 | 02 | 1 | ATTR-01 | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | N/A | ✅ pass |
| 19-02-03 | 02 | 1 | ATTR-01 | unit | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` | N/A | ✅ pass |
| 19-02-04 | 02 | 1 | ATTR-02 | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/scraper/normalizer.test.ts` — extend with event_sources insert tests (ATTR-01), COALESCE source_url tests (ATTR-02), update mock chain for `.returning({ id: events.id })`
- [x] `src/lib/scraper/ticketmaster.test.ts` — extend with test asserting upsertEvent called with source_type='ticketmaster' (ATTR-01)

*Existing infrastructure covers UX-01/UX-02 via manual browser verification (no jsdom/React Testing Library setup).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EventCard renders map-pin icon and flyTo works on click | UX-01 | No jsdom setup; React component with Leaflet map integration | 1. Load app 2. Click any event card 3. Verify map animates to venue at zoom 15 4. Verify marker popup opens |
| CategoryChipsRow visible in timelapse mode, filters heatmap live | UX-02 | No jsdom setup; React component with nuqs URL state | 1. Switch to timelapse mode 2. Verify category chips visible below TimelineBar 3. Click a category chip 4. Verify heatmap intensity changes 5. Verify sidebar filters 6. Verify playback continues |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
