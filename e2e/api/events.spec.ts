/**
 * GET /api/events — structural tests only.
 * Asserts response shape without depending on specific rows.
 */
import { test, expect } from '@playwright/test';

// Helper: assert a value is an array (may be empty)
function expectArray(val: unknown): void {
  expect(Array.isArray(val)).toBe(true);
}

test.describe('GET /api/events', () => {
  test('default response is an array', async ({ request }) => {
    const res = await request.get('/api/events');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Route returns a flat array of enriched event+venue rows
    expectArray(body);
  });

  test('each item contains expected event and venue keys', async ({ request }) => {
    const res = await request.get('/api/events');
    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    if (body.length === 0) {
      // Nothing to assert — DB may be empty; structure test passes vacuously
      return;
    }
    const first = body[0] as Record<string, unknown>;
    // Route does: { ...r, source_types: [] } where r = { events: {...}, venues: {...} }
    expect(first).toHaveProperty('events');
    expect(first).toHaveProperty('venues');
    expect(first).toHaveProperty('source_types');
    expectArray(first.source_types);

    const evt = first.events as Record<string, unknown>;
    expect(evt).toHaveProperty('id');
    expect(evt).toHaveProperty('performer');
    expect(evt).toHaveProperty('event_date');

    const venue = first.venues as Record<string, unknown>;
    expect(venue).toHaveProperty('id');
    expect(venue).toHaveProperty('name');
  });

  test('filter by category returns array', async ({ request }) => {
    const res = await request.get('/api/events?category=live_music');
    // Route currently ignores query params but must still return 200
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectArray(body);
  });

  test('filter by province returns array', async ({ request }) => {
    const res = await request.get('/api/events?province=NS');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectArray(body);
  });

  test('filter by date range returns array', async ({ request }) => {
    const from = '2026-01-01';
    const to = '2026-12-31';
    const res = await request.get(`/api/events?from=${from}&to=${to}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectArray(body);
  });

  test('filter by bbox returns array', async ({ request }) => {
    // Rough bounding box around Atlantic Canada
    const res = await request.get('/api/events?bbox=-67,43,-52,52');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectArray(body);
  });

  test('filter by q search returns array', async ({ request }) => {
    const res = await request.get('/api/events?q=music');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectArray(body);
  });
});
