/**
 * Cron route authorization guard tests.
 *
 * Every /api/cron/* endpoint must:
 *   - Return 401 when no Authorization header (or wrong secret) is provided
 *   - Return a non-401 response when `Authorization: Bearer <CRON_SECRET>` is present
 *
 * Enumerated routes (from src/app/api/cron/):
 *   /api/cron/archive
 *   /api/cron/detect-series
 *   /api/cron/discover
 *   /api/cron/discover-places-nb
 *   /api/cron/discover-places-nl
 *   /api/cron/discover-places-ns
 *   /api/cron/discover-places-pei
 *   /api/cron/discover-reddit
 *   /api/cron/fetch-feeds
 *   /api/cron/parse-newsletters
 *   /api/cron/scrape
 *
 * All cron routes use GET + `Authorization: Bearer <CRON_SECRET>` verified via verifyCronSecret().
 */
import { test, expect } from '@playwright/test';

const CRON_ROUTES = [
  '/api/cron/archive',
  '/api/cron/detect-series',
  '/api/cron/discover',
  '/api/cron/discover-places-nb',
  '/api/cron/discover-places-nl',
  '/api/cron/discover-places-ns',
  '/api/cron/discover-places-pei',
  '/api/cron/discover-reddit',
  '/api/cron/fetch-feeds',
  '/api/cron/parse-newsletters',
  '/api/cron/scrape',
] as const;

// ---------------------------------------------------------------------------
// Unauthenticated — no Authorization header → 401
// ---------------------------------------------------------------------------
test.describe('Cron routes — no auth header → 401', () => {
  for (const route of CRON_ROUTES) {
    test(`GET ${route} returns 401 without Authorization`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Wrong secret — bad bearer token → 401
// ---------------------------------------------------------------------------
test.describe('Cron routes — wrong secret → 401', () => {
  for (const route of CRON_ROUTES) {
    test(`GET ${route} returns 401 with wrong secret`, async ({ request }) => {
      const res = await request.get(route, {
        headers: { Authorization: 'Bearer __wrong_secret_e2e__' },
      });
      expect(res.status()).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Correct secret — should return non-401 (job runs against test DB)
// ---------------------------------------------------------------------------
test.describe('Cron routes — correct CRON_SECRET → non-401', () => {
  let cronSecret: string;

  test.beforeAll(() => {
    cronSecret = process.env.CRON_SECRET ?? '';
    if (!cronSecret) {
      // If CRON_SECRET is not set, skip authenticated tests gracefully
      test.skip();
    }
  });

  for (const route of CRON_ROUTES) {
    test(`GET ${route} returns non-401 with correct secret`, async ({ request }) => {
      if (!cronSecret) test.skip();
      const res = await request.get(route, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      // The cron job will execute against the test DB.
      // We only assert auth passed (not 401); job result may vary.
      expect(res.status()).not.toBe(401);
      // Should be 200 (success) or 500 (job error due to missing deps in test env)
      expect([200, 500]).toContain(res.status());
    });
  }
});
