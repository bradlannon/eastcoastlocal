/**
 * Auth routes
 * POST /api/auth/logout — clears admin_session cookie and redirects to /admin/login
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('POST /api/auth/logout', () => {
  test('clears admin_session cookie', async ({ context, request }) => {
    // Set a valid admin session cookie
    await loginAsAdmin(context);

    // Confirm cookie is set before logout
    const beforeCookies = await context.cookies();
    const sessionBefore = beforeCookies.find((c) => c.name === 'admin_session');
    expect(sessionBefore).toBeDefined();

    // Call logout — route deletes the cookie and redirects; fetch with no-redirect
    const res = await request.post('/api/auth/logout');

    // The route redirects to /admin/login (302 or 303).
    // After the redirect, admin_session should be cleared.
    const afterCookies = await context.cookies();
    const sessionAfter = afterCookies.find((c) => c.name === 'admin_session');
    // Cookie should be absent or expired (value empty / maxAge 0)
    const cleared =
      !sessionAfter ||
      sessionAfter.value === '' ||
      (sessionAfter.expires !== undefined && sessionAfter.expires <= Date.now() / 1000);
    expect(cleared).toBe(true);

    // Response should be a redirect (3xx) to /admin/login
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  });

  test('logout without session cookie still redirects', async ({ request }) => {
    // No session cookie — route should still redirect cleanly
    const res = await request.post('/api/auth/logout');
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  });
});
