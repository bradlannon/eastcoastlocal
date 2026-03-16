---
phase: 25
slug: admin-scale-tooling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (existing) |
| **Config file** | jest.config.ts (existing) |
| **Quick run command** | `npm test -- --testPathPattern=actions\|discoverer\|route` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=actions|discoverer|route`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | ADMIN-02 | unit | `npm test -- --testPathPattern=discover` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | ADMIN-02 | unit | `npm test -- --testPathPattern=places-discoverer` | ✅ | ⬜ pending |
| 25-01-03 | 01 | 1 | ADMIN-02 | unit | `npm test -- --testPathPattern=discover` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 2 | ADMIN-01 | unit | `npm test -- --testPathPattern=actions` | ❌ W0 | ⬜ pending |
| 25-02-02 | 02 | 2 | ADMIN-01 | manual | visual inspection | N/A | ⬜ pending |
| 25-03-01 | 03 | 2 | ADMIN-03 | manual | visual smoke test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/admin/discovery/actions.test.ts` — stubs for ADMIN-01 (batchApproveCandidate)
- [ ] `src/app/api/cron/discover-places-ns/route.test.ts` — stubs for ADMIN-02 (cron instrumentation)
- [ ] `src/app/api/cron/discover/route.test.ts` — extend for ADMIN-02 (gemini channel instrumentation)

*Existing infrastructure covers framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checkbox selection + batch approve UI | ADMIN-01 | Client component with complex interaction state | 1. Navigate to /admin/discovery pending tab 2. Check individual rows 3. Check "Select All" 4. Click "Batch Approve (N)" 5. Verify candidates promoted |
| Dashboard discovery run summary | ADMIN-03 | Server component rendering | 1. Navigate to /admin 2. Verify "Last Discovery" stat card shows 3. Verify "Recent Discovery Runs" table shows last 10 runs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
