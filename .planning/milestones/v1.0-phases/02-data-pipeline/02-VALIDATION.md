---
phase: 2
slug: data-pipeline
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x with ts-jest (already installed) |
| **Config file** | jest.config.ts (exists) |
| **Quick run command** | `npm test -- --testPathPattern=scraper --passWithNoTests` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=scraper --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SCRP-01 | unit | `npm test -- --testPathPattern=fetcher` | N/A | ✅ pass |
| 02-01-02 | 01 | 1 | SCRP-03 | unit | `npm test -- --testPathPattern=fetcher` | N/A | ✅ pass |
| 02-01-03 | 01 | 1 | SCRP-02 | unit | `npm test -- --testPathPattern=extractor` | N/A | ✅ pass |
| 02-01-04 | 01 | 1 | SCRP-04 | unit | `npm test -- --testPathPattern=normalizer` | N/A | ✅ pass |
| 02-01-05 | 01 | 1 | SCRP-08 | unit | `npm test -- --testPathPattern=geocoder` | N/A | ✅ pass |
| 02-01-06 | 01 | 1 | SCRP-07 | integration | `npm test -- --testPathPattern=upsert` | N/A | ✅ pass |
| 02-01-07 | 01 | 1 | SCRP-09 | unit | `npm test -- --testPathPattern=cron` | N/A | ✅ pass |
| 02-01-08 | 01 | 1 | SCRP-10 | unit | `npm test -- --testPathPattern=eventbrite\|bandsintown` | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/scraper/fetcher.test.ts` — covers SCRP-01, SCRP-03 (mock fetch, test cheerio stripping)
- [x] `src/lib/scraper/extractor.test.ts` — covers SCRP-02, SCRP-04 (mock AI SDK generateText)
- [x] `src/lib/scraper/normalizer.test.ts` — covers SCRP-04 (normalizePerformer, date rejection, past-event filtering)
- [x] `src/lib/scraper/geocoder.test.ts` — covers SCRP-08 (mock fetch to Maps API)
- [x] `src/lib/scraper/eventbrite.test.ts` — covers SCRP-10 Eventbrite adapter
- [x] `src/lib/scraper/bandsintown.test.ts` — covers SCRP-10 Bandsintown adapter
- [x] `src/app/api/cron/scrape/route.test.ts` — covers SCRP-09 (401 without secret, 200 with)

*LLM tests mock the `ai` package — no actual Gemini API calls in CI.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real events appear from live venue URLs | SCRP-01, SCRP-02 | Requires live scrape against real sites | Run `npm run scrape` locally with DATABASE_URL set, verify events in DB |
| Vercel cron triggers daily | SCRP-09 | Requires deployed environment + 24h wait | Check Vercel dashboard cron logs after deploy |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
