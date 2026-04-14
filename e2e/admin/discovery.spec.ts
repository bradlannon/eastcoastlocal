import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin discovery', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/discovery');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Discovery Review' })).toBeVisible();
  });

  test('tab navigation renders all status tabs', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Approved/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Rejected/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /No Website/ })).toBeVisible();
  });

  test('pending tab is active by default', async ({ page }) => {
    // The active tab has bg-blue-600 class
    const activeTab = page.locator('a.bg-blue-600');
    await expect(activeTab).toContainText('Pending');
  });

  test('shows table or empty state for pending candidates', async ({ page }) => {
    const table = page.locator('table');
    const emptyMsg = page.getByText('No pending candidates');
    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('table headers render when candidates exist', async ({ page }) => {
    const table = page.locator('table');
    if (await table.isVisible().catch(() => false)) {
      await expect(page.getByText('Name').first()).toBeVisible();
      await expect(page.getByText('URL').first()).toBeVisible();
      await expect(page.getByText('Province').first()).toBeVisible();
    }
  });

  test('approve control renders on pending row expand', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      // No candidates — skip interaction assertions
      return;
    }
    // Click the first row to expand it
    await rows.first().click();
    // Approve button should appear in the expanded detail panel
    const approveBtn = page.getByRole('button', { name: /Approve/i });
    await expect(approveBtn).toBeVisible();
  });

  test('reject control renders on pending row expand', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      return;
    }
    await rows.first().click();
    const rejectBtn = page.getByRole('button', { name: /Reject/i });
    await expect(rejectBtn).toBeVisible();
  });

  test('approved tab shows revoke control on row expand', async ({ page }) => {
    await page.getByRole('link', { name: /Approved/ }).click();
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      return;
    }
    await rows.first().click();
    const revokeBtn = page.getByRole('button', { name: /Revoke/i });
    await expect(revokeBtn).toBeVisible();
  });
});
