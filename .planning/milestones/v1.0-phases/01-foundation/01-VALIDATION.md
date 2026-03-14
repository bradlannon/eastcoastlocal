---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 01-01-01 | 01 | 1 | INFR-01 | smoke | `curl -f $VERCEL_URL/api/health` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFR-01 | integration | `npm run db:migrate` exits 0 | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SCRP-05 | integration | `npx jest src/lib/db/seed.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | SCRP-06 | integration | `npx jest src/lib/db/schema.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.ts` + `jest.setup.ts` — Jest configured for Next.js + TypeScript
- [ ] `src/lib/db/schema.test.ts` — verifies all three tables exist with correct columns
- [ ] `src/lib/db/seed.test.ts` — verifies seed inserts rows into scrape_sources and venues
- [ ] Framework install: `npm install -D jest @types/jest ts-jest jest-environment-node`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App returns 200 at public Vercel URL | INFR-01 | Requires deployed environment | `curl -f https://$VERCEL_URL/api/health` — confirm `{"status":"ok","db":"connected"}` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
