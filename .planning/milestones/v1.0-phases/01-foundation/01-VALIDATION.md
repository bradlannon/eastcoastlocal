---
phase: 1
slug: foundation
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (needs Wave 0 install) |
| **Config file** | jest.config.ts (Wave 0 creates) |
| **Quick run command** | `npx jest --testPathPattern=src/lib/db --passWithNoTests` |
| **Full suite command** | `npx jest --passWithNoTests` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=src/lib/db --passWithNoTests`
- **After every plan wave:** Run `npx jest --passWithNoTests`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INFR-01 | smoke | `curl -f $VERCEL_URL/api/health` | N/A | ✅ pass |
| 01-01-02 | 01 | 1 | INFR-01 | integration | `npm run db:migrate` exits 0 | N/A | ✅ pass |
| 01-01-03 | 01 | 1 | SCRP-05 | integration | `npx jest src/lib/db/seed.test.ts` | N/A | ✅ pass |
| 01-01-04 | 01 | 1 | SCRP-06 | integration | `npx jest src/lib/db/schema.test.ts` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `jest.config.ts` + `jest.setup.ts` — Jest configured for Next.js + TypeScript
- [x] `src/lib/db/schema.test.ts` — verifies all three tables exist with correct columns
- [x] `src/lib/db/seed.test.ts` — verifies seed inserts rows into scrape_sources and venues
- [x] Framework install: `npm install -D jest @types/jest ts-jest jest-environment-node`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App returns 200 at public Vercel URL | INFR-01 | Requires deployed environment | `curl -f https://$VERCEL_URL/api/health` — confirm `{"status":"ok","db":"connected"}` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
