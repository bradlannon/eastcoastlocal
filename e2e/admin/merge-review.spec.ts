import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin merge-review', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin/merge-review');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Merge Review' })).toBeVisible();
  });

  test('subtitle text is present', async ({ page }) => {
    await expect(page.getByText('Review and resolve borderline venue merge candidates.')).toBeVisible();
  });

  test('tab navigation renders all status tabs', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Merged/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Kept Separate/ })).toBeVisible();
  });

  test('pending tab is active by default', async ({ page }) => {
    const activeTab = page.locator('a.bg-blue-600');
    await expect(activeTab).toContainText('Pending');
  });

  test('shows candidate cards or empty state', async ({ page }) => {
    const emptyMsg = page.getByText('No pending merge candidates');
    const candidateCard = page.locator('.rounded-lg.border').first();
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    const hasCard = await candidateCard.isVisible().catch(() => false);
    expect(hasEmpty || hasCard).toBe(true);
  });

  test('merge and keep-separate controls render when candidates exist', async ({ page }) => {
    // Check if there are any pending candidates
    const emptyMsg = page.getByText('No pending merge candidates');
    const isEmpty = await emptyMsg.isVisible().catch(() => false);
    if (isEmpty) {
      // No candidates to test controls on — characterize empty state
      return;
    }
    // At least one candidate exists — check merge controls appear somewhere on page
    const mergeBtn = page.getByRole('button', { name: /Confirm merge/i });
    const keepSeparateBtn = page.getByRole('button', { name: /Keep Separate/i });
    await expect(mergeBtn.or(keepSeparateBtn)).toBeVisible();
  });

  test('merged tab renders without error', async ({ page }) => {
    await page.getByRole('link', { name: /Merged/ }).click();
    // Either a table or empty state
    const emptyMsg = page.getByText('No merged merge candidates');
    const table = page.locator('table');
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);
    expect(hasEmpty || hasTable).toBe(true);
  });
});
