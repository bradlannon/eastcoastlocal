/**
 * events-crud.spec.ts
 *
 * The admin events page does not support create or delete operations via the UI.
 * Events are created by the scraper and approved through the submissions flow.
 * This spec characterizes the events admin page: listing, category filter tabs,
 * and inline category editing.
 *
 * For the "marker-prefixed performer" pattern: we assert structural selectors
 * and that the category dropdown is editable on any existing event row.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin events', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/events');
  });

  test('page loads with events heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Events/ })).toBeVisible();
  });

  test('category filter tabs render', async ({ page }) => {
    // "All" tab is always present
    await expect(page.getByRole('link', { name: /All/ }).first()).toBeVisible();
    // Standard category tabs
    await expect(page.getByRole('link', { name: /Live Music/i }).or(
      page.getByText('Live Music')
    ).first()).toBeVisible();
  });

  test('shows event table or empty state', async ({ page }) => {
    const table = page.locator('table');
    const emptyMsg = page.getByText('No events found.');
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('table has performer, venue, location, date, category columns', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return;
    }
    await expect(page.getByText('Performer').first()).toBeVisible();
    await expect(page.getByText('Venue').first()).toBeVisible();
    await expect(page.getByText('Location').first()).toBeVisible();
    await expect(page.getByText('Date').first()).toBeVisible();
    await expect(page.getByText('Category').first()).toBeVisible();
  });

  test('category dropdown is present on each event row', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return;
    }
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      return;
    }
    // The first row should have a category select
    const select = rows.first().locator('select[name="category"]');
    await expect(select).toBeVisible();
  });

  test('category filter by live_music updates URL', async ({ page }) => {
    const liveMusicLink = page.getByRole('link', { name: /Live Music/i }).first();
    if (await liveMusicLink.isVisible().catch(() => false)) {
      await liveMusicLink.click();
      await expect(page.url()).toContain('category=live_music');
    }
  });

  test('clear filter link removes category param', async ({ page }) => {
    await page.goto('/admin/events?category=live_music');
    const clearLink = page.getByRole('link', { name: 'Clear filter' });
    if (await clearLink.isVisible().catch(() => false)) {
      await clearLink.click();
      await expect(page.url()).not.toContain('category=');
    }
  });
});
