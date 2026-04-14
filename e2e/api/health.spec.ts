import { test, expect } from '@playwright/test';

test.describe('GET /api/health', () => {
  test('returns 200 with ok shape', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Route returns { status: 'ok', db: 'connected' }
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('db');
  });
});
