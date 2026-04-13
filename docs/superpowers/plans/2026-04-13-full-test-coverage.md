# Full Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish comprehensive red/green characterization test coverage across every feature of eastcoastlocal, with infrastructure for strict TDD on all future work.

**Architecture:** Two-project Jest setup (node + jsdom) for unit/component tests; Playwright with auto-started dev server, real test DB, and mocked external APIs for E2E and API integration. Characterization-only — no production code changes in this pass; mismatches go to `docs/test-findings.md`.

**Tech Stack:** Jest 30, ts-jest, @testing-library/react, Playwright 1.58, Next.js 16, Drizzle ORM, Neon Postgres, jose (JWT).

**Spec:** `docs/superpowers/specs/2026-04-13-full-test-coverage-design.md`

---

## Conventions

**Every task follows red/green/commit:**
1. Write failing test.
2. Run — confirm fails (missing file, wrong selector, etc).
3. Adjust test until it passes against current behavior (characterization), OR if behavior looks wrong, log to `docs/test-findings.md` and `.skip` the test.
4. Run — confirm pass (or skip).
5. Commit with conventional message.

**No production source file is modified in this pass.** If a test cannot be made green without touching src/, log and skip.

**Commit granularity:** one commit per task in this plan.

---

## Phase 1 — Infrastructure

### Task 1.1: Split Jest into node + jsdom projects

**Files:**
- Modify: `jest.config.ts`
- Create: `jest.setup.jsdom.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm i -D jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Replace `jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testMatch: ['<rootDir>/src/**/*.test.ts'],
    },
    {
      displayName: 'jsdom',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      setupFilesAfterEach: ['<rootDir>/jest.setup.jsdom.ts'],
    },
  ],
};

export default config;
```

- [ ] **Step 3: Create `jest.setup.jsdom.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Verify existing suite still passes**

Run: `npm test`
Expected: all existing tests pass under `node` project.

- [ ] **Step 5: Commit**

```bash
git add jest.config.ts jest.setup.jsdom.ts package.json package-lock.json
git commit -m "test: split jest into node and jsdom projects"
```

### Task 1.2: Add test scripts to package.json

**Files:** Modify `package.json`

- [ ] **Step 1: Add scripts**

Replace the `"test"` script block with:
```json
"test": "jest",
"test:unit": "jest --selectProjects node",
"test:components": "jest --selectProjects jsdom",
"test:e2e": "playwright test",
"test:all": "npm test && npm run test:e2e"
```

- [ ] **Step 2: Verify**

Run: `npm run test:unit`
Expected: node project runs.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test: add unit/component/e2e script aliases"
```

### Task 1.3: Test database configuration

**Files:**
- Create: `.env.test.example`
- Create: `docs/testing.md`

- [ ] **Step 1: Create `.env.test.example`**

```bash
# Copy to .env.test and fill in
DATABASE_URL=postgresql://localhost:5432/eastcoastlocal_test
JWT_SECRET=test-secret-do-not-use-in-prod-minimum-32-chars
CRON_SECRET=test-cron-secret
BASE_URL=http://localhost:3002
# External API mocks — leave empty in test
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 2: Create `docs/testing.md`**

```markdown
# Testing Guide

## Layers
- **Jest node** — `src/**/*.test.ts`: pure functions, API route handlers, server lib
- **Jest jsdom** — `src/**/*.test.tsx`: React components with RTL
- **Playwright** — `e2e/**/*.spec.ts`: API integration, admin flows, public flows

## Setup
1. Copy `.env.test.example` → `.env.test`, point `DATABASE_URL` to a dedicated test DB (Neon branch recommended).
2. `npm run db:migrate` with `DATABASE_URL` from `.env.test`.
3. `npm run test:all`.

## External APIs
Mocked in all tests. Never hits Anthropic/Gemini/Eventbrite/Ticketmaster/Reddit/Overpass.

## Red/Green Discipline
See `docs/superpowers/specs/2026-04-13-full-test-coverage-design.md`. Mismatches go to `docs/test-findings.md`; do not fix source in this pass.

## Adding a test
1. Colocate Jest tests next to the source file.
2. Playwright specs live in `e2e/{public,admin,api}/`.
3. Use helpers from `e2e/fixtures/{auth,db,mocks}.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add .env.test.example docs/testing.md
git commit -m "test: document test db setup and conventions"
```

### Task 1.4: Findings log

**Files:** Create `docs/test-findings.md`

- [ ] **Step 1: Create skeleton**

```markdown
# Test Findings

Characterization-test mismatches logged during the full-coverage pass.
Each entry: date · test file · test name · expected · actual · suspected cause.

| Date | Test | Name | Expected | Actual | Cause |
|------|------|------|----------|--------|-------|
```

- [ ] **Step 2: Commit**

```bash
git add docs/test-findings.md
git commit -m "test: seed findings log"
```

### Task 1.5: Playwright config — webServer + globalSetup

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/global-setup.ts`

- [ ] **Step 1: Create `e2e/global-setup.ts`**

```ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Ensure migrations are applied against DATABASE_URL
  execSync('npm run db:migrate', { stdio: 'inherit', env: process.env });
}
```

- [ ] **Step 2: Replace `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(file: string) {
  try {
    const content = readFileSync(resolve(__dirname, file), 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* noop */ }
}
loadEnv('.env.test');
loadEnv('.env');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3002',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'PORT=3002 npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

- [ ] **Step 3: Verify existing spec still runs**

Run: `npm run test:e2e -- admin-triggers`
Expected: `admin-triggers.spec.ts` passes with the auto-started dev server.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/global-setup.ts
git commit -m "test: playwright auto-start dev server and run migrations"
```

### Task 1.6: Shared fixtures — auth

**Files:** Create `e2e/fixtures/auth.ts`

- [ ] **Step 1: Write fixture**

```ts
import type { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';

export async function signAdminJwt(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function loginAsAdmin(context: BrowserContext) {
  const token = await signAdminJwt();
  await context.addCookies([
    { name: 'admin_session', value: token, domain: 'localhost', path: '/' },
  ]);
}
```

- [ ] **Step 2: Refactor `e2e/admin-triggers.spec.ts` to use fixture**

Replace the inline `getAdminCookie` + `beforeEach` cookie-setting block with:
```ts
import { loginAsAdmin } from './fixtures/auth';

test.beforeEach(async ({ page, context }) => {
  await loginAsAdmin(context);
  await page.goto('/admin');
});
```

- [ ] **Step 3: Move spec into subdir**

```bash
mkdir -p e2e/admin && git mv e2e/admin-triggers.spec.ts e2e/admin/admin-triggers.spec.ts
```

- [ ] **Step 4: Run**

Run: `npm run test:e2e -- admin-triggers`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/
git commit -m "test: extract shared admin auth fixture"
```

### Task 1.7: Shared fixtures — DB seed + mocks

**Files:**
- Create: `e2e/fixtures/db.ts`
- Create: `e2e/fixtures/mocks.ts`

- [ ] **Step 1: Write `e2e/fixtures/db.ts`**

```ts
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      ${schema.events},
      ${schema.venues},
      ${schema.sources},
      ${schema.submissions},
      ${schema.discoveryCandidates}
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedMinimal() {
  await truncateAll();
  const [venue] = await db.insert(schema.venues).values({
    name: 'Test Venue',
    address: '123 Test St, Halifax, NS',
    lat: 44.6488,
    lng: -63.5752,
    province: 'NS',
  }).returning();

  await db.insert(schema.events).values([{
    title: 'Test Event',
    venueId: venue.id,
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 90_000_000),
    category: 'music',
    sourceUrl: 'https://example.com/e/1',
    status: 'approved',
  }]);
}
```

> Note: exact column names may differ — confirm against `src/lib/db/schema.ts` when implementing; adjust fields to match.

- [ ] **Step 2: Write `e2e/fixtures/mocks.ts`**

```ts
import type { Page } from '@playwright/test';

export async function mockExternalApis(page: Page) {
  await page.route('**/api.anthropic.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":[{"text":"mock"}]}' }));
  await page.route('**/generativelanguage.googleapis.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"candidates":[]}' }));
  await page.route('**/eventbriteapi.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' }));
  await page.route('**/app.ticketmaster.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"_embedded":{"events":[]}}' }));
  await page.route('**/bandsintown.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/reddit.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"children":[]}}' }));
  await page.route('**/overpass-api.de/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"elements":[]}' }));
  await page.route('**/nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/
git commit -m "test: shared db seed and external-api mock fixtures"
```

---

## Phase 2 — Jest Unit Gaps

**Pattern — API route handler test (reference):**

```ts
// src/app/api/health/route.test.ts
import { GET } from './route';

describe('GET /api/health', () => {
  it('returns 200 and ok shape', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
  });
});
```

**Pattern — lib unit (reference):**

```ts
// src/lib/auth.test.ts
import { signAdminCookie, verifyAdminCookie } from './auth';

describe('auth', () => {
  beforeAll(() => { process.env.JWT_SECRET = 'x'.repeat(32); });

  it('round-trips admin cookie', async () => {
    const token = await signAdminCookie();
    const session = await verifyAdminCookie(token);
    expect(session?.role).toBe('admin');
  });

  it('rejects tampered token', async () => {
    await expect(verifyAdminCookie('bad.jwt.here')).resolves.toBeNull();
  });
});
```

For each task below: read the source file, enumerate public exports / exported branches, write at minimum one test per branch, run, commit.

### Task 2.1 – `src/lib/auth.test.ts`
- [ ] Cover: sign, verify-valid, verify-tampered, verify-expired, cookie parsing helper if present.
- [ ] Commit: `test: characterize lib/auth`

### Task 2.2 – `src/lib/cron-auth.test.ts`
- [ ] Cover: accepts correct bearer, rejects wrong, rejects missing, rejects when `CRON_SECRET` unset.
- [ ] Commit: `test: characterize lib/cron-auth`

### Task 2.3 – `src/lib/rate-limit.test.ts`
- [ ] Cover: allows under limit, blocks over limit, resets after window, distinct keys isolated. Use fake timers.
- [ ] Commit: `test: characterize lib/rate-limit`

### Task 2.4 – `src/lib/affiliate.test.ts`
- [ ] Cover: each supported URL transformation, pass-through for unsupported domains.
- [ ] Commit: `test: characterize lib/affiliate`

### Task 2.5 – `src/lib/categories.test.ts`
- [ ] Cover: each category normalization mapping, unknown → default.
- [ ] Commit: `test: characterize lib/categories`

### Task 2.6 – `src/lib/province-bounds.test.ts`
- [ ] Cover: known provinces return bbox; point-in-province helper if present.
- [ ] Commit: `test: characterize lib/province-bounds`

### Task 2.7 – `src/lib/ai/model.test.ts`
- [ ] Cover: default model selection, environment override, client construction.
- [ ] Commit: `test: characterize lib/ai/model`

### Task 2.8 – `src/lib/db/client.test.ts`
- [ ] Cover: singleton export exists, uses `DATABASE_URL`. Mock `@neondatabase/serverless`.
- [ ] Commit: `test: characterize lib/db/client`

### Task 2.9 – `src/lib/db/backfill-categories.test.ts`
- [ ] Cover: picks events with null/legacy category, writes normalized value, idempotent.
- [ ] Commit: `test: characterize db/backfill-categories`

### Task 2.10 – `src/lib/db/backfill-series.test.ts`
- [ ] Cover: groups matching events by series key, writes series id.
- [ ] Commit: `test: characterize db/backfill-series`

### Task 2.11 – `src/lib/scraper/discord-events.test.ts`
- [ ] Cover: parse Discord event JSON → ExtractedEvent, missing fields handled.
- [ ] Commit: `test: characterize scraper/discord-events`

### Task 2.12 – `src/lib/scraper/facebook.test.ts`
- [ ] Cover: parse FB event HTML/JSON-LD path, absent data returns empty.
- [ ] Commit: `test: characterize scraper/facebook`

### Task 2.13 – `src/lib/scraper/feed-discovery.test.ts`
- [ ] Cover: extract feed URLs from HTML `<link rel="alternate">`, dedupe, prioritize.
- [ ] Commit: `test: characterize scraper/feed-discovery`

### Task 2.14 – `src/app/api/auth/logout/route.test.ts`
- [ ] Cover: clears `admin_session` cookie, returns redirect or 200.
- [ ] Commit: `test: characterize api/auth/logout`

### Task 2.15 – `src/app/api/health/route.test.ts`
- [ ] Cover: 200 + ok shape.
- [ ] Commit: `test: characterize api/health`

### Task 2.16 – `src/app/api/submissions/route.test.ts`
- [ ] Cover: POST valid → 200, POST invalid → 400 with zod errors, rate-limit (mock), persists via mocked db.
- [ ] Commit: `test: characterize api/submissions`

### Task 2.17 – `src/app/api/admin/source-events/route.test.ts`
- [ ] Cover: requires admin cookie (401 without), returns shape with cookie.
- [ ] Commit: `test: characterize api/admin/source-events`

### Task 2.18 – Cron route tests (4 province discover + fetch-feeds + parse-newsletters)

One task per route, same pattern:
- [ ] Files:
  - `src/app/api/cron/discover-places-nb/route.test.ts`
  - `src/app/api/cron/discover-places-nl/route.test.ts`
  - `src/app/api/cron/discover-places-ns/route.test.ts`
  - `src/app/api/cron/discover-places-pei/route.test.ts`
  - `src/app/api/cron/fetch-feeds/route.test.ts`
  - `src/app/api/cron/parse-newsletters/route.test.ts`
- [ ] Cover each: 401 without `CRON_SECRET`, 200 with, calls the orchestrator/worker (mocked).
- [ ] Commit per file: `test: characterize cron/<name>`

---

## Phase 3 — Jest Component Tests (jsdom)

**Pattern — component test (reference):**

```tsx
// src/components/events/EventCard.test.tsx
import { render, screen } from '@testing-library/react';
import { EventCard } from './EventCard';

const baseEvent = {
  id: '1',
  title: 'Jazz Night',
  venue: { name: 'Test Venue', address: '1 Main St', lat: 0, lng: 0 },
  startsAt: new Date('2026-05-01T20:00:00Z').toISOString(),
  category: 'music',
} as const;

describe('EventCard', () => {
  it('renders title and venue', () => {
    render(<EventCard event={baseEvent as any} />);
    expect(screen.getByText('Jazz Night')).toBeInTheDocument();
    expect(screen.getByText(/Test Venue/)).toBeInTheDocument();
  });

  it('links to event detail', () => {
    render(<EventCard event={baseEvent as any} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/event/1');
  });
});
```

**Per-component tasks** (one task each, same red/green/commit pattern, props inferred from the real file):

**events/**
- [ ] Task 3.1 — `EventCard.test.tsx`: renders title/venue/time, affiliate link, category chip.
- [ ] Task 3.2 — `EventList.test.tsx`: empty state, renders N cards, pagination boundary.
- [ ] Task 3.3 — `EventFilters.test.tsx`: each filter updates URL via mocked nuqs router, clear-all resets.
- [ ] Task 3.4 — `CategoryChipsRow.test.tsx`: selected state, click fires callback.
- [ ] Task 3.5 — `SubmitEventModal.test.tsx`: open/close, zod validation on submit, POST called.

**map/** (mock `react-leaflet` + `leaflet` with `jest.mock`)
- [ ] Task 3.6 — `MapClient.test.tsx`: renders container, mounts child layers.
- [ ] Task 3.7 — `ClusterLayer.test.tsx`: passes events, cluster count equals sum of event counts (matches commit 557f5f8).
- [ ] Task 3.8 — `HeatmapLayer.test.tsx`: constructs points from events, intensity scaling.
- [ ] Task 3.9 — `HeatmapPopup.test.tsx`, `VenuePopup.test.tsx`: content, details link, close.
- [ ] Task 3.10 — `PopupController.test.tsx`: click toggles, multiple open simultaneously (matches commit 5c0de2d).
- [ ] Task 3.11 — `MapBoundsTracker.test.tsx`: publishes bounds on move.
- [ ] Task 3.12 — `MapViewController.test.tsx`: pans/zooms to prop.
- [ ] Task 3.13 — `ZoomControls.test.tsx`, `GeolocationButton.test.tsx`, `ModeToggle.test.tsx`, `BoxZoomTool.test.tsx`, `HeatmapClickLayer.test.tsx`, `MiniMap.test.tsx`, `MapRef.test.tsx`, `MapClientWrapper.test.tsx`, `MapWrapper.test.tsx` — one test file each asserting render + primary interaction.

**layout/**
- [ ] Task 3.14 — `MobileTabBar.test.tsx`: tabs render, click fires callback/router.
- [ ] Task 3.15 — `WelcomePopup.test.tsx`: shows on first visit (localStorage), dismiss persists.

**timelapse/**
- [ ] Task 3.16 — `TimelineBar.test.tsx`: scrubbing updates date, play/pause.

Each component task commits as `test: characterize components/<name>`.

---

## Phase 4 — Playwright API Integration

**Pattern — API spec (reference):**

```ts
// e2e/api/admin-guard.spec.ts
import { test, expect, request } from '@playwright/test';

const ADMIN_ENDPOINTS = [
  '/api/admin/source-events',
  '/api/admin/archived',
  '/api/admin/trigger/scrape',
];

test.describe('Admin API guard', () => {
  for (const path of ADMIN_ENDPOINTS) {
    test(`401 without cookie: ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }
});
```

- [ ] Task 4.1 — `e2e/api/health.spec.ts`: 200, shape.
- [ ] Task 4.2 — `e2e/api/events.spec.ts`: seed → GET with filters (category, province, date range, bbox, search); shape + count match seed.
- [ ] Task 4.3 — `e2e/api/submissions.spec.ts`: POST valid → 200 (row in DB), POST invalid → 400, rate-limit after N.
- [ ] Task 4.4 — `e2e/api/auth.spec.ts`: POST /api/auth/logout clears cookie.
- [ ] Task 4.5 — `e2e/api/admin-guard.spec.ts`: loop over every `/api/admin/*` route, expect 401 without cookie, 200/expected with.
- [ ] Task 4.6 — `e2e/api/cron-guard.spec.ts`: loop over every `/api/cron/*`, expect 401 without secret, 200 with. Mock external APIs so cron handlers don't hit the network.

Commit per task: `test: api e2e for <area>`.

---

## Phase 5 — Playwright Admin Flows

**Pattern — admin spec (reference):** see refactored `e2e/admin/admin-triggers.spec.ts` (uses `loginAsAdmin`).

Each spec begins with `await loginAsAdmin(context)` and seeds DB via `seedMinimal()` in `beforeEach`.

- [ ] Task 5.1 — `e2e/admin/login.spec.ts`: wrong password → error, correct → redirect to `/admin`, sets cookie.
- [ ] Task 5.2 — `e2e/admin/dashboard.spec.ts`: stat cards render, source health table present.
- [ ] Task 5.3 — `e2e/admin/submissions.spec.ts`: queue lists seeded submission, approve → moves to events, reject → disappears.
- [ ] Task 5.4 — `e2e/admin/discovery.spec.ts`: seeded candidate visible, approve/reject update status.
- [ ] Task 5.5 — `e2e/admin/merge-review.spec.ts`: two similar venues merge, cancel reverts.
- [ ] Task 5.6 — `e2e/admin/rejected.spec.ts`: rejected list, restore.
- [ ] Task 5.7 — `e2e/admin/archived.spec.ts`: archived list, filter by date.
- [ ] Task 5.8 — `e2e/admin/venues-crud.spec.ts`: create → visible in list, edit name → persists, delete → gone.
- [ ] Task 5.9 — `e2e/admin/events-crud.spec.ts`: create → visible, edit → persists, delete → gone.
- [ ] Task 5.10 — `e2e/admin/settings.spec.ts`: load page, change setting, reload, persisted.
- [ ] Task 5.11 — `e2e/admin/logout.spec.ts`: click logout → redirected to `/admin/login`, cookie cleared.

Commit per task.

---

## Phase 6 — Playwright Public Flows

Each spec calls `mockExternalApis(page)` and `seedMinimal()` in `beforeEach`.

- [ ] Task 6.1 — `e2e/public/home-map.spec.ts`: navigate `/`, map tiles render, seeded marker present, cluster count equals seeded event count.
- [ ] Task 6.2 — `e2e/public/home-list.spec.ts`: switch to list tab, card for seeded event, card count.
- [ ] Task 6.3 — `e2e/public/filters.spec.ts`: apply category filter → URL has `?category=`, reload → filter persists, clear → URL clean; date range; province; search.
- [ ] Task 6.4 — `e2e/public/mobile.spec.ts`: emulate mobile, long-press marker (1s) → list tab active; tap cluster → list tab active (commits 3b90c52, ffd2d3c, 79a3fbe).
- [ ] Task 6.5 — `e2e/public/event-detail.spec.ts`: `/event/{seededId}` renders title, venue, time, affiliate link; unknown id → 404.
- [ ] Task 6.6 — `e2e/public/popups.spec.ts`: click marker opens popup, click second marker opens a second popup (both visible), Details link navigates (commit 5c0de2d).
- [ ] Task 6.7 — `e2e/public/timelapse.spec.ts`: scrub timeline → markers filter to date range, play/pause.

Commit per task.

---

## Phase 7 — Wrap-up

### Task 7.1: Run full suite, record findings

- [ ] Run: `npm run test:all`
- [ ] For any failing/skipped test, confirm it has an entry in `docs/test-findings.md`.
- [ ] Commit any last skip markers: `test: finalize findings log`.

### Task 7.2: README pointer

- [ ] Modify `README.md`: add a "Testing" section linking to `docs/testing.md`.
- [ ] Commit: `docs: link testing guide from readme`.

### Task 7.3: Final verification

- [ ] `npm run test:unit` — green
- [ ] `npm run test:components` — green
- [ ] `npm run test:e2e` — green (skips allowed; each must have findings entry)
- [ ] `npm run lint` — green
- [ ] `npm run build` — green

No final commit needed if everything already pushed.

---

## Self-review notes

- Spec coverage: Phase 1 ↔ Infrastructure; Phase 2 ↔ Jest unit gaps; Phase 3 ↔ component tests; Phase 4 ↔ Playwright API; Phases 5–6 ↔ admin + public E2E; Phase 7 ↔ docs/findings.
- Red/green discipline documented in Conventions and reiterated in `docs/testing.md`.
- No production source modifications — enforced by findings-log-don't-fix rule.
