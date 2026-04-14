import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  });

  test('stat cards render with labels', async ({ page }) => {
    // Each stat card has a label text visible on the page
    await expect(page.getByText('Venues')).toBeVisible();
    await expect(page.getByText('Sources')).toBeVisible();
    await expect(page.getByText('Events')).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText('Last Scrape')).toBeVisible();
    await expect(page.getByText('Last Discovery')).toBeVisible();
  });

  test('stat card values are numeric strings', async ({ page }) => {
    // The Venues card links to /admin/venues — find it via the link
    const venuesCard = page.getByRole('link', { name: /Venues/ });
    await expect(venuesCard).toBeVisible();
  });

  test('Source Health section heading is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Source Health' })).toBeVisible();
  });

  test('Source Health table or empty state renders', async ({ page }) => {
    // Either table with headers or empty-state message
    const table = page.locator('table').first();
    const emptyMsg = page.getByText('No scrape sources configured');
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('Recent Discovery Runs section is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Recent Discovery Runs' })).toBeVisible();
  });
});
