---
phase: 8
slug: category-filter-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npm test -- --testPathPattern=filter-utils` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=filter-utils`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | FILT-01 | unit | `npm test -- --testPathPattern=filter-utils` | ❌ W0 (extend existing) | ⬜ pending |
| 08-01-02 | 01 | 1 | FILT-01, FILT-02, FILT-03 | unit + manual | `npm test -- --testPathPattern=filter-utils` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | FILT-01 | manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add `filterByCategory` tests to `src/lib/filter-utils.test.ts` — covers FILT-01, FILT-02
- [ ] Extend `makeEvent` helper in `filter-utils.test.ts` to support `event_category` override

*No new test file needed — extend existing `filter-utils.test.ts`*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chip row renders with All + 8 categories | FILT-01 | Visual UI component | Open app, verify chip row appears in filter bar |
| Category chip filters map pins and sidebar | FILT-01 | Client-side DOM interaction | Click a category chip, verify map pins and sidebar update |
| Heatmap respects category filter | FILT-02 | Visual map layer | Select category, switch to heatmap mode, verify intensity matches |
| URL `?category=` param persists | FILT-03 | Browser URL bar | Select category, copy URL, open in new tab, verify same filter |
| Category badge on event cards | FILT-01 | Visual UI element | Verify colored badge appears on event cards |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
