---
phase: 24
slug: reddit-discovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 with ts-jest |
| **Config file** | `jest.config.ts` (rootDir) |
| **Quick run command** | `npx jest src/lib/scraper/reddit-discoverer.test.ts --no-coverage` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/scraper/reddit-discoverer.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | REDDIT-01 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "fetchSubredditPosts" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | REDDIT-01 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "matchesVenueKeywords" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | REDDIT-01 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "skips Gemini when no posts match keywords" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | REDDIT-02 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "Gemini extraction" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | REDDIT-02 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "stages candidate with URL" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-06 | 01 | 1 | REDDIT-02 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "stages candidate without URL" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-07 | 01 | 1 | REDDIT-03 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "REDDIT_SUBREDDITS" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-08 | 01 | 1 | REDDIT-03 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "province hint" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-09 | 01 | 1 | REDDIT-04 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "auto-approve" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-01-10 | 01 | 1 | REDDIT-04 | unit | `npx jest src/lib/scraper/reddit-discoverer.test.ts -t "does not auto-approve" --no-coverage` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | REDDIT-04 | unit | `npx jest src/app/api/cron/discover-reddit/route.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 1 | REDDIT-04 | unit | `npx jest src/app/api/cron/discover-reddit/route.test.ts --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/scraper/reddit-discoverer.test.ts` — stubs for REDDIT-01, REDDIT-02, REDDIT-03, REDDIT-04
- [ ] `src/app/api/cron/discover-reddit/route.test.ts` — auth + success + error tests

*Existing infrastructure covers test framework — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reddit JSON API responds with real posts | REDDIT-01 | External API dependency | Curl `https://www.reddit.com/r/halifax/new.json?limit=5` with custom User-Agent |
| Gemini extracts meaningful venue data from real Reddit text | REDDIT-02 | LLM output non-deterministic | Run cron endpoint against live subreddit, inspect discovered_sources rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
