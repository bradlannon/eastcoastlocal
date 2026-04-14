import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin archived events', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/archived');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Archived Events' })).toBeVisible();
  });

  test('subtitle text is present', async ({ page }) => {
    await expect(page.getByText('Past events that have been automatically archived by the cron job.')).toBeVisible();
  });

  test('shows table or empty state', async ({ page }) => {
    const table = page.locator('table');
    const emptyMsg = page.getByText('No archived events yet.');
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('table headers present when rows exist', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return;
    }
    await expect(page.getByText('Performer').first()).toBeVisible();
    await expect(page.getByText('Venue').first()).toBeVisible();
    await expect(page.getByText('Event Date').first()).toBeVisible();
    await expect(page.getByText('Archived At').first()).toBeVisible();
  });

  test('pagination controls render when multiple pages exist', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return;
    }
    // Pagination section shows "Page X of Y"
    const paginationText = page.getByText(/Page \d+ of \d+/);
    const hasPagination = await paginationText.isVisible().catch(() => false);
    if (hasPagination) {
      await expect(page.getByRole('link', { name: 'Next' }).or(page.getByText('Next'))).toBeVisible();
    }
  });

  test('page query param is accepted for pagination', async ({ page }) => {
    await page.goto('/admin/archived?page=1');
    await expect(page.getByRole('heading', { name: 'Archived Events' })).toBeVisible();
  });
});
