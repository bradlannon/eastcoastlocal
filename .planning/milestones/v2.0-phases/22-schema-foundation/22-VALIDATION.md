---
phase: 22
slug: schema-foundation
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (ts-jest preset) |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npm test -- schema promote-source --no-coverage` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- schema promote-source --no-coverage`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | SCHEMA-01 | unit | `npm test -- schema.test --no-coverage` | ✅ (needs update) | ✅ pass |
| 22-01-02 | 01 | 1 | SCHEMA-01 | smoke | `npm run db:migrate` | ✅ | ✅ pass |
| 22-01-03 | 01 | 1 | SCHEMA-02 | unit | `npm test -- schema.test --no-coverage` | ✅ (needs update) | ✅ pass |
| 22-01-04 | 01 | 1 | SCHEMA-01/02 | unit | `npm test -- promote-source.test --no-coverage` | ✅ (needs update + new tests) | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Tests need updates, not new files:
- [x] `src/lib/db/schema.test.ts` — add new columns to expected arrays for `venues` and `discovered_sources`
- [x] `src/lib/scraper/promote-source.test.ts` — update Test 7 for conditional address; add tests for lat/lng/google_place_id carry-through

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration runs on Neon Postgres | SCHEMA-01/02 | Live DB verification | Run `npm run db:migrate` against Neon instance, verify no errors |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
