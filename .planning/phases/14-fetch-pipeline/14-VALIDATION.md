---
phase: 14
slug: fetch-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.x + ts-jest 29.x |
| **Config file** | jest.config.ts |
| **Quick run command** | `npx jest --testPathPattern=fetcher\|json-ld\|orchestrator` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=fetcher\|json-ld\|orchestrator`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SCRP-02 | unit | `npx jest fetcher` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | SCRP-03 | unit | `npx jest fetcher` | ✅ | ⬜ pending |
| 14-01-03 | 01 | 1 | PLAT-04 | unit | `npx jest json-ld` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | SCRP-01 | unit | `npx jest orchestrator` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | SCRP-02 | integration | `npx jest orchestrator` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/scraper/json-ld.test.ts` — stubs for JSON-LD extraction (PLAT-04)
- [ ] Update `src/lib/scraper/fetcher.test.ts` — tests for new return type `{ text, rawHtml }`

*Existing jest infrastructure covers all other requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-domain delay visible in logs | SCRP-02 | Log output verification | Run scrape cron, check console for domain delay messages |
| Multi-page events appear in DB | SCRP-01 | Requires live venue with paginated events | Configure a test source with max_pages=3, run scrape, verify event count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
