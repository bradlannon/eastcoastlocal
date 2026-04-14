/**
 * POST /api/submissions
 *
 * Cleanup strategy: we use a unique marker in the `performer` field
 * (`__e2e_sub_<timestamp>__`).  The submissions route does not expose a
 * DELETE endpoint, so cleanup is handled by the test DB being ephemeral.
 * Tests that write to the DB are marked with a comment so a future cleanup
 * hook can query community_submissions WHERE performer LIKE '__e2e_sub_%'.
 */
import { test, expect } from '@playwright/test';

const FUTURE_DATE = '2027-06-15'; // always in the future relative to 2026-04-13

function makeMarker(): string {
  return `__e2e_sub_${Date.now()}__`;
}

function validBody(marker: string) {
  return {
    performer: marker,
    venue_name: 'Test Venue E2E',
    city: 'Halifax',
    province: 'NS',
    event_date: FUTURE_DATE,
    event_time: '8:00 PM',
    event_category: 'live_music',
    price: 'Free',
    link: 'https://example.com/e2e-test',
    description: 'E2E test submission — safe to delete',
  };
}

test.describe('POST /api/submissions', () => {
  test('valid body returns 200 with { success: true }', async ({ request }) => {
    const marker = makeMarker();
    const res = await request.post('/api/submissions', { data: validBody(marker) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    // Cleanup note: row with performer=marker remains in community_submissions.
    // Delete via: DELETE FROM community_submissions WHERE performer = '<marker>'
  });

  test('missing required field (performer) returns 400', async ({ request }) => {
    const body = validBody(makeMarker());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { performer: _removed, ...withoutPerformer } = body;
    const res = await request.post('/api/submissions', { data: withoutPerformer });
    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody).toHaveProperty('error');
  });

  test('missing required field (venue_name) returns 400', async ({ request }) => {
    const body = validBody(makeMarker());
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { venue_name: _removed, ...withoutVenue } = body;
    const res = await request.post('/api/submissions', { data: withoutVenue });
    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody).toHaveProperty('error');
  });

  test('invalid province returns 400', async ({ request }) => {
    const res = await request.post('/api/submissions', {
      data: { ...validBody(makeMarker()), province: 'ON' },
    });
    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody).toHaveProperty('error');
  });

  test('past event_date returns 400', async ({ request }) => {
    const res = await request.post('/api/submissions', {
      data: { ...validBody(makeMarker()), event_date: '2020-01-01' },
    });
    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody).toHaveProperty('error');
  });

  test('invalid link URL returns 400', async ({ request }) => {
    const res = await request.post('/api/submissions', {
      data: { ...validBody(makeMarker()), link: 'not-a-url' },
    });
    expect(res.status()).toBe(400);
    const resBody = await res.json();
    expect(resBody).toHaveProperty('error');
  });

  test('honeypot field filled returns silent 200 (bot suppression)', async ({ request }) => {
    const res = await request.post('/api/submissions', {
      data: { ...validBody(makeMarker()), website: 'http://spam.example.com' },
    });
    // Route returns success silently without writing to DB
    expect(res.status()).toBe(200);
    const resBody = await res.json();
    expect(resBody).toEqual({ success: true });
  });

  test('repeated posts from same IP trigger 429 after limit', async ({ request }) => {
    // Rate limit: 5 per hour per IP.  Send 6 with the same X-Forwarded-For
    // so the in-memory store accumulates them within this test worker.
    const ip = `127.${Math.floor(Math.random() * 255)}.e2e.rate`;
    let lastRes: Awaited<ReturnType<typeof request.post>> | null = null;
    for (let i = 0; i < 6; i++) {
      lastRes = await request.post('/api/submissions', {
        data: validBody(makeMarker()),
        headers: { 'x-forwarded-for': ip },
      });
    }
    // The 6th request should hit the limit
    expect(lastRes!.status()).toBe(429);
    const resBody = await lastRes!.json();
    expect(resBody).toHaveProperty('error');
  });
});
