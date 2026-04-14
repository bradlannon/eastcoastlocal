import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin rejected events', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/rejected');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Rejected Events/ })).toBeVisible();
  });

  test('total count label is present', async ({ page }) => {
    // The heading contains "X total" as a span
    await expect(page.getByText(/total/)).toBeVisible();
  });

  test('reason filter cards render', async ({ page }) => {
    // The "All" filter card is always present
    const allCard = page.locator('a[href="/admin/rejected"]').filter({ hasText: 'All' });
    await expect(allCard).toBeVisible();
  });

  test('shows rejection list table or empty state', async ({ page }) => {
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No rejected events yet/);
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('table has performer, venue, reason columns', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return; // Empty state — skip column check
    }
    await expect(page.getByText('Performer').first()).toBeVisible();
    await expect(page.getByText('Venue').first()).toBeVisible();
    await expect(page.getByText('Reason').first()).toBeVisible();
  });

  test('restore/approve control present in action column when rows exist', async ({ page }) => {
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return;
    }
    // The actions column header text is not labeled but rows contain action buttons
    // RejectedList has "Approve" buttons for restore — look for any such button
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      return;
    }
    // At least one action button should be present in the rows
    const actionBtns = page.getByRole('button').filter({ hasText: /Approve|Restore|Dismiss/i });
    await expect(actionBtns.first()).toBeVisible();
  });

  test('reason filter links navigate to filtered view', async ({ page }) => {
    // Find the first non-"All" reason filter card (if any)
    const reasonCards = page.locator('a[href*="?reason="]');
    const count = await reasonCards.count();
    if (count === 0) {
      return; // No reason breakdowns yet
    }
    await reasonCards.first().click();
    await expect(page.url()).toContain('?reason=');
    // After filtering, a "Clear filter" link should appear
    await expect(page.getByRole('link', { name: 'Clear filter' })).toBeVisible();
  });
});
