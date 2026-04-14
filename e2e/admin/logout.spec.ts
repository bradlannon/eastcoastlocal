import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin logout', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin');
  });

  test('logout button is present in nav', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('clicking logout redirects to /admin/login', async ({ page }) => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/admin/login', { timeout: 10_000 });
    expect(page.url()).toContain('/admin/login');
  });

  test('after logout, cookie is cleared', async ({ page, context }) => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/admin/login', { timeout: 10_000 });

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'admin_session');
    expect(sessionCookie).toBeUndefined();
  });

  test('after logout, navigating to /admin redirects to /admin/login', async ({ page }) => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/admin/login', { timeout: 10_000 });

    // Try to navigate to /admin without a session
    await page.goto('/admin');
    // Should be redirected back to login
    await expect(page.url()).toContain('/admin/login');
  });

  test('login page is accessible after logout', async ({ page }) => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/admin/login', { timeout: 10_000 });

    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});
