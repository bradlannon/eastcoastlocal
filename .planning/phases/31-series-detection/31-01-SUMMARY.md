---
phase: 31-series-detection
plan: "01"
subsystem: series-detection
tags: [tdd, algorithm, levenshtein, series-detection, performer-clustering]
dependency_graph:
  requires:
    - src/lib/db/schema.ts (recurring_series table, events.series_id FK)
    - fastest-levenshtein@1.0.16
    - src/lib/db/client.ts (db instance)
  provides:
    - src/lib/series-detector.ts (detectAndTagSeries, all helper functions)
    - src/lib/series-detector.test.ts (25 unit tests)
  affects:
    - src/app/api/cron/detect-series/route.ts (31-02 — will import detectAndTagSeries)
    - src/lib/db/backfill-series.ts (31-02 — will import detectAndTagSeries)
tech_stack:
  added: []
  patterns:
    - Greedy Levenshtein clustering with most-frequent-variant representative (Pitfall 2 from research)
    - Proportional Levenshtein ratio: distance(a,b)/max(len(a),len(b))
    - Weekday frequency counting via getDay() — no date-fns required
    - isNull(events.archived_at) guard on all event reads and writes
key_files:
  created:
    - src/lib/series-detector.ts
    - src/lib/series-detector.test.ts
  modified: []
decisions:
  - Test cases in plan spec had incorrect math (performerFuzzyRatio pairs given as < 0.20 threshold were actually 0.43 and 0.25); tests updated to use pairs that genuinely fall below the 0.20 threshold while preserving all behavioral intent
  - clusterPerformers compares new names against existing cluster representatives only (greedy); representative reassigned to most-frequent variant post-clustering
  - recurrence_pattern signal left as false stub — field not on events table; keyword bypass covers the primary use case
metrics:
  duration_seconds: 223
  completed_date: "2026-03-17"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
requirements_completed: [SER-02, SER-03, SER-04]
---

# Phase 31 Plan 01: Series Detection Algorithm Summary

**One-liner:** Series detection library with fuzzy performer clustering (20% Levenshtein), weekday regularity scoring, keyword bypass heuristic, and safe Drizzle upsert + tag pattern.

## What Was Built

`src/lib/series-detector.ts` — the core detection algorithm as a testable pure library with one async integration function.

### Exported functions and constants

| Export | Type | Description |
|--------|------|-------------|
| `SERIES_LEVENSHTEIN_THRESHOLD` | const (0.20) | Proportional edit-distance threshold for performer clustering |
| `SERIES_MIN_OCCURRENCES` | const (3) | Minimum events on same weekday to qualify as a series |
| `SERIES_WINDOW_DAYS` | const (90) | Look-back and look-ahead window for event selection |
| `RECURRENCE_KEYWORDS` | const array | "every", "weekly", "open mic", "trivia", "bingo", "karaoke", "open stage", "jam night", "quiz night" |
| `performerFuzzyRatio(a, b)` | function | distance(a,b)/max(len) — handles empty strings |
| `hasRecurrenceKeyword(text)` | function | Case-insensitive scan against RECURRENCE_KEYWORDS |
| `isWeekdayRegular(dates)` | function | True if any weekday appears >= MIN_OCCURRENCES times |
| `clusterPerformers(names)` | function | Greedy Levenshtein clustering; representative = most-frequent variant |
| `detectAndTagSeries()` | async function | Full detection pass: query → cluster → signal → upsert → tag |

### detectAndTagSeries() behavior

1. SELECT non-archived events (`isNull(archived_at)`) within 90-day window (past + future)
2. Group by `venue_id`
3. For each venue: cluster `normalized_performer` names via `clusterPerformers()`
4. For each cluster: apply three independent signals:
   - **Weekday regularity**: `isWeekdayRegular(dates)` — requires MIN_OCCURRENCES (3)
   - **Keyword heuristic**: `hasRecurrenceKeyword(performer || description)` — 1 occurrence sufficient
   - **Recurrence pattern**: stubbed false — `recurrence_pattern` not stored on events table
5. If any signal fires: upsert `recurring_series` row (venue_id, representative) via `ON CONFLICT DO UPDATE updated_at`
6. Batch UPDATE `events.series_id` with `isNull(archived_at)` guard
7. Return `{ seriesUpserted, eventsTagged }`

## Test Coverage

25 unit tests across 5 describe blocks:

| Describe | Tests | Coverage |
|----------|-------|----------|
| performerFuzzyRatio | 4 | Threshold below, threshold above, empty strings, valid cluster pair |
| hasRecurrenceKeyword | 9 | All 7 required keywords + John Smith Band false + empty false |
| isWeekdayRegular | 5 | 4 Tuesdays, mixed weekdays with 3 Mondays, 2 Fridays, empty, 5 unique weekdays |
| clusterPerformers | 4 | Cluster 3 variants, 2 separate clusters, most-frequent representative, single performer |
| constants | 3 | Threshold, MIN_OCCURRENCES, RECURRENCE_KEYWORDS contents |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect math in plan test spec for performerFuzzyRatio**
- **Found during:** RED phase (test failures after writing tests exactly as specified)
- **Issue:** Plan spec listed two test cases for performerFuzzyRatio as "returns below 0.20":
  - `performerFuzzyRatio("open mic night", "open mic")` → actual: 6/14 = 0.43 (NOT below 0.20)
  - `performerFuzzyRatio("trivia night", "trivia nite")` → actual: 3/12 = 0.25 (NOT below 0.20)
  - `clusterPerformers(["open mic night", "open mic", "open mic nite"])` → cluster test also failed since none of these pairs are within 0.20 of each other
- **Fix:** Updated tests to use pairs that genuinely fall below the 0.20 threshold:
  - `("open mic night", "open mic nights")` → 1/15 = 0.067
  - `("trivia night", "trivia nght")` → 1/12 = 0.083
  - `clusterPerformers(["open mic night", "open mic nights", "open mic nightly"])` — all within threshold
  - Representative test: "open mic nights" (3 occurrences) beats "open mic night" (1 occurrence)
- **Behavioral impact:** Zero — the algorithm constants and functional logic are unchanged; only test examples were corrected to be mathematically sound
- **Files modified:** `src/lib/series-detector.test.ts`
- **Commits:** f600775 (RED), 290c90f (GREEN with fix)

## Self-Check: PASSED

- FOUND: src/lib/series-detector.ts
- FOUND: src/lib/series-detector.test.ts
- FOUND: commit f600775 (test RED phase)
- FOUND: commit 290c90f (feat GREEN phase)
