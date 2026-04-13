# Full Test Coverage — Red/Green Characterization

**Date:** 2026-04-13
**Goal:** Establish comprehensive red/green test coverage across every feature of eastcoastlocal, and set the foundation for TDD on all future work.

## Approach

Characterization-first: for each feature, write a test that describes *current* behavior. If it passes, we have a green baseline. If it reveals a mismatch with intended behavior, log it to `docs/test-findings.md` and skip with a TODO — **no production code changes in this pass**.

Going forward, new features follow strict red/green TDD using the infrastructure this pass establishes.

## Test Architecture

```
src/**/*.test.ts              Jest — unit + integration (colocated)
src/components/**/*.test.tsx  Jest (jsdom project) — React Testing Library
e2e/public/*.spec.ts          Playwright — public site
e2e/admin/*.spec.ts           Playwright — admin site
e2e/api/*.spec.ts             Playwright — API integration (real DB)
e2e/fixtures/                 Shared auth, DB seed, mock helpers
```

**Two Jest projects:**
- `node` — lib, API route logic, server code (current default)
- `jsdom` — React components via `@testing-library/react`

**Playwright** — single project, uses real test database seeded from fixtures. External APIs (Anthropic, Gemini, Eventbrite, Ticketmaster, Reddit, Overpass) are mocked via `page.route` or injected clients. Internal APIs hit the real Next dev server against the test DB.

## Infrastructure

### Test database
- `.env.test` selects a dedicated Postgres (Neon branch preferred; local Postgres fallback documented)
- `e2e/fixtures/db.ts` — truncate + reseed between specs with deterministic fixtures (events, venues, sources, submissions)
- `playwright.config.ts` gains `globalSetup` that runs migrations and initial seed against `DATABASE_URL` from `.env.test`

### External API mocking
- `e2e/fixtures/mocks.ts` — registered on each Playwright context:
  - Anthropic / Google AI responses
  - Eventbrite, Ticketmaster, Bandsintown JSON endpoints
  - Reddit OAuth + listings
  - Overpass / Nominatim (geocoding)
- Unit tests already stub these via module mocks; keep that pattern.

### Auth helpers
- `e2e/fixtures/auth.ts` — `getAdminCookie()` (extracted from the existing admin-triggers spec), reusable across admin specs.

### Scripts (package.json)
- `test` — Jest (both projects)
- `test:unit` — Jest node project only
- `test:components` — Jest jsdom project only
- `test:e2e` — Playwright
- `test:all` — `test && test:e2e`

## Coverage Inventory

### Jest unit/integration — new files

**lib:**
- `src/lib/auth.test.ts` — JWT sign/verify, cookie parsing
- `src/lib/cron-auth.test.ts` — cron secret check
- `src/lib/rate-limit.test.ts` — window behavior
- `src/lib/affiliate.test.ts` — link transformation
- `src/lib/categories.test.ts` — category normalization
- `src/lib/province-bounds.test.ts` — bbox logic
- `src/lib/ai/model.test.ts` — model selection / client wiring

**db:**
- `src/lib/db/client.test.ts` — connection wiring (mocked)
- `src/lib/db/backfill-categories.test.ts`
- `src/lib/db/backfill-series.test.ts`

**scraper gaps:**
- `src/lib/scraper/discord-events.test.ts`
- `src/lib/scraper/facebook.test.ts`
- `src/lib/scraper/feed-discovery.test.ts`

**API routes missing `.test.ts`:**
- `src/app/api/auth/logout/route.test.ts`
- `src/app/api/health/route.test.ts`
- `src/app/api/submissions/route.test.ts` — POST validation, rate limit
- `src/app/api/admin/source-events/route.test.ts`
- `src/app/api/cron/discover-places-nb/route.test.ts`
- `src/app/api/cron/discover-places-nl/route.test.ts`
- `src/app/api/cron/discover-places-ns/route.test.ts`
- `src/app/api/cron/discover-places-pei/route.test.ts`
- `src/app/api/cron/fetch-feeds/route.test.ts`
- `src/app/api/cron/parse-newsletters/route.test.ts`

### Jest component tests — new (jsdom)

`src/components/**/*.test.tsx` covering each component under:
- `components/events/` — EventCard, EventList, filter bar, tab switcher
- `components/map/` — MapView, marker/cluster rendering (with leaflet mocked), popups
- `components/timelapse/` — TimelapsePlayer, controls
- `components/layout/` — shell, nav, mobile bottom bar

(Exact file list enumerated in the plan; components will be inventoried during planning.)

### Playwright E2E — new specs

**Public (`e2e/public/`):**
- `home-map.spec.ts` — map loads, markers render, cluster counts sum
- `home-list.spec.ts` — list tab, pagination, card content
- `filters.spec.ts` — category, date range, province, search; nuqs URL state persistence; shareable URL round-trip
- `mobile.spec.ts` — long-press opens list, tap zoom, cluster → list switch (matches recent commits)
- `event-detail.spec.ts` — `/event/[id]`, affiliate link, missing event 404
- `popups.spec.ts` — click toggles, multiple popups open, Details link
- `timelapse.spec.ts` — player controls, date scrubbing

**Admin (`e2e/admin/`):**
- `login.spec.ts` — success, wrong password, redirect
- `dashboard.spec.ts` — stats cards, source health
- `admin-triggers.spec.ts` — **existing, keep**
- `submissions.spec.ts` — approve, reject, queue empty state
- `discovery.spec.ts` — candidate review, approve/reject, filter
- `merge-review.spec.ts` — merge two venues, cancel
- `rejected.spec.ts` — list, restore
- `archived.spec.ts` — list, filter
- `venues-crud.spec.ts` — create, edit, delete
- `events-crud.spec.ts` — create, edit, delete
- `settings.spec.ts` — load + persist
- `logout.spec.ts` — clears cookie, redirects

**API (`e2e/api/`):**
- `events.spec.ts` — filter params, pagination, shape
- `submissions.spec.ts` — POST happy + validation + rate limit (real)
- `auth.spec.ts` — logout clears cookie
- `admin-guard.spec.ts` — 401 without cookie on all `/api/admin/*`
- `cron-guard.spec.ts` — 401 without secret on all `/api/cron/*`
- `health.spec.ts` — 200 + shape

## Red/Green Discipline

1. Write test from current observed behavior.
2. Run → expect green.
3. If red:
   - Selector/setup issue → fix the test.
   - Actual behavior differs from what feature should do → append to `docs/test-findings.md` with: file, test name, expected, actual, suspected cause. Mark the test `.skip` with a TODO pointing to the findings entry.
4. No production code changes in this pass.

## Deliverables

- All test files above
- `jest.config.ts` updated with two projects
- `playwright.config.ts` with `webServer` + `globalSetup`
- `e2e/fixtures/{auth,db,mocks}.ts`
- `.env.test.example`
- `docs/testing.md` — run, DB setup, conventions, how to add a new test
- `docs/test-findings.md` — living doc of characterization mismatches
- `package.json` scripts

## Out of Scope

- Fixing bugs surfaced by characterization (tracked in findings, addressed separately)
- Visual regression / screenshot testing
- Load / performance testing
- Mutation testing
- CI pipeline wiring (easy follow-up once suites are green)

## Execution Strategy

Implementation is divided into phases to keep each commit reviewable and each suite green before expanding:

1. **Infrastructure** — Jest projects, Playwright config, fixtures, `.env.test`, docs scaffolding
2. **Jest unit gaps** — lib + API route unit tests
3. **Jest component tests** — RTL + jsdom
4. **Playwright API** — API integration
5. **Playwright admin** — admin flows
6. **Playwright public** — public flows
7. **Docs + scripts + findings cleanup**

Each phase ends with `test:all` fully green (or documented skips).
