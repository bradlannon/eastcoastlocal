/**
 * Admin route authorization guard tests.
 *
 * Every /api/admin/* endpoint must:
 *   - Return 401 when no admin_session cookie is present
 *   - Return a non-401 response when a valid admin_session cookie is present
 *
 * Enumerated routes (from src/app/api/admin/):
 *   GET  /api/admin/archived            — paginated archived events list
 *   GET  /api/admin/source-events       — events by source (requires ?sourceId=)
 *   POST /api/admin/trigger/[job]       — trigger a background job (requires valid job name)
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

// ---------------------------------------------------------------------------
// Unauthenticated guard — should return 401 for all admin routes
// ---------------------------------------------------------------------------
test.describe('Admin routes — unauthenticated → 401', () => {
  const getRoutes: string[] = [
    '/api/admin/archived',
    '/api/admin/source-events?sourceId=1',
  ];

  for (const route of getRoutes) {
    test(`GET ${route} returns 401 without cookie`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(401);
    });
  }

  // Trigger jobs are POST — test one representative job name
  test('POST /api/admin/trigger/archive returns 401 without cookie', async ({ request }) => {
    const res = await request.post('/api/admin/trigger/archive');
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/trigger/scrape returns 401 without cookie', async ({ request }) => {
    const res = await request.post('/api/admin/trigger/scrape');
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/trigger/discover returns 401 without cookie', async ({ request }) => {
    const res = await request.post('/api/admin/trigger/discover');
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Authenticated guard — should return non-401 for all admin routes
// ---------------------------------------------------------------------------
test.describe('Admin routes — authenticated → non-401', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('GET /api/admin/archived returns 200 with valid session', async ({ request }) => {
    const res = await request.get('/api/admin/archived');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Shape: { events: [], page: 1, totalPages: 0, total: 0 }
    expect(body).toHaveProperty('events');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body).toHaveProperty('total');
  });

  test('GET /api/admin/source-events with missing sourceId returns 400 (auth passed)', async ({
    request,
  }) => {
    // Missing sourceId should give 400, not 401 — confirming auth was accepted
    const res = await request.get('/api/admin/source-events');
    expect(res.status()).toBe(400);
  });

  test('GET /api/admin/source-events?sourceId=0 returns non-401', async ({ request }) => {
    // sourceId=0 is not a real source but auth should pass (expect 200 with empty events)
    const res = await request.get('/api/admin/source-events?sourceId=0');
    // 200 with empty array, or 400 if validation rejects 0 — either is fine; not 401
    expect(res.status()).not.toBe(401);
  });

  test('POST /api/admin/trigger/unknown-job returns 400 (auth passed)', async ({ request }) => {
    // Unknown job → 400 from default switch case; proves auth cookie was accepted
    const res = await request.post('/api/admin/trigger/unknown-e2e-job');
    expect(res.status()).toBe(400);
    expect(res.status()).not.toBe(401);
  });
});
