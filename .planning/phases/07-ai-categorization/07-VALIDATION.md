---
phase: 7
slug: ai-categorization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.6 |
| **Config file** | `jest.config.ts` (preset: ts-jest, env: node) |
| **Quick run command** | `npx jest src/lib/scraper/extractor.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | CAT-01 | unit | `npx jest src/lib/schemas/extracted-event.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | CAT-01 | unit | `npx jest src/lib/scraper/extractor.test.ts --no-coverage` | ✅ (extend) | ⬜ pending |
| 07-01-03 | 01 | 1 | CAT-01 | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ✅ (extend) | ⬜ pending |
| 07-01-04 | 01 | 1 | CAT-01 | unit | `npx jest src/lib/schemas/extracted-event.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | CAT-02 | manual | `tsx src/lib/db/backfill-categories.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/schemas/extracted-event.test.ts` — tests for `event_category` field in schema (enum validation, default behavior); covers CAT-01
- [ ] Extend `src/lib/scraper/extractor.test.ts` — add test cases asserting `event_category` is present and valid in returned events
- [ ] Extend `src/lib/scraper/normalizer.test.ts` — add test asserting `event_category` is passed to DB insert

*Existing infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backfill clears null categories | CAT-02 | Runs against production Neon DB | Run `tsx src/lib/db/backfill-categories.ts`, verify no nulls remain via db:studio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
