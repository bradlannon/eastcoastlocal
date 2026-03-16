---
phase: 9
slug: source-discovery
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-14
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 with ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest src/app/api/cron/discover` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/app/api/cron/discover`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | DISC-01 | unit | `npx jest src/app/api/cron/discover/route.test.ts` | N/A | ✅ pass |
| 09-01-02 | 01 | 1 | DISC-01, DISC-02 | unit | `npx jest src/lib/scraper/discovery-orchestrator.test.ts` | N/A | ✅ pass |
| 09-01-03 | 01 | 1 | DISC-03 | unit | `npx jest src/lib/scraper/promote-source.test.ts` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/app/api/cron/discover/route.test.ts` — cron auth + job invocation (DISC-01)
- [x] `src/lib/scraper/discovery-orchestrator.test.ts` — dedup + staging insert (DISC-01, DISC-02)
- [x] `src/lib/scraper/promote-source.test.ts` — promotion flow + venue creation (DISC-03)

*All three test files must mock `@ai-sdk/google` and `drizzle-orm`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini returns real venue URLs via grounding | DISC-01 | Requires live API call | Run `tsx src/lib/scraper/discover-sources.ts` for Halifax, inspect results |
| Weekly cron triggers on Vercel | DISC-01 | Vercel infrastructure | Check Vercel dashboard after deploy |
| Promoted source appears in next scrape | DISC-03 | End-to-end flow | Promote a source, trigger scrape cron, verify events extracted |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
