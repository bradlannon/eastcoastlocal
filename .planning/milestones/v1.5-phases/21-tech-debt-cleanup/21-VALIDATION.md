---
phase: 21
slug: tech-debt-cleanup
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `jest.config.ts` (repo root) |
| **Quick run command** | `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/venue-dedup.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/scraper/normalizer.test.ts src/lib/scraper/venue-dedup.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | ATTR-02 | unit | `npx jest src/lib/scraper/normalizer.test.ts --no-coverage` | ✅ (add test) | ✅ pass |
| 21-01-02 | 01 | 1 | (tech debt) | unit | `npx jest src/lib/scraper/venue-dedup.test.ts --no-coverage` | ✅ (update) | ✅ pass |
| 21-01-03 | 01 | 1 | (tech debt) | manual | Visual: badge count stable on map pan in timelapse mode | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Add ticket_link COALESCE test to `src/lib/scraper/normalizer.test.ts` — covers ATTR-02 (mirrors existing source_url COALESCE test)

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CategoryChipsRow eventCount badge shows map-wide count | UX-02 (cosmetic) | UI behavior requires visual confirmation of badge stability during map pan | 1. Open timelapse mode 2. Select a category chip 3. Pan the map 4. Verify badge count does not change |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
