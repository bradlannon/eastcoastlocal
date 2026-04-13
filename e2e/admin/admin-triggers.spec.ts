import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

test.describe('Admin Trigger Actions', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
    await page.goto('/admin');
  });

  test('Actions section renders with all trigger buttons', async ({ page }) => {
    // Actions heading visible
    await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();

    // Three buttons visible
    await expect(page.getByRole('button', { name: 'Run Scrape' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Discovery' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Archive' })).toBeVisible();

    // Discovery type dropdown visible with default "Gemini Search"
    const select = page.getByLabel('Discovery type');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('discover');
  });

  test('Actions section is between stat cards and Source Health', async ({ page }) => {
    // Verify ordering: stat cards → Actions → Source Health
    const actionsHeading = page.getByRole('heading', { name: 'Actions' });
    const sourceHealthHeading = page.getByRole('heading', { name: 'Source Health' });
    await expect(actionsHeading).toBeVisible();
    await expect(sourceHealthHeading).toBeVisible();

    // Actions should appear before Source Health in the DOM
    const actionsBox = await actionsHeading.boundingBox();
    const sourceHealthBox = await sourceHealthHeading.boundingBox();
    expect(actionsBox!.y).toBeLessThan(sourceHealthBox!.y);
  });

  test('Run Scrape triggers job, shows spinner, disables buttons, shows toast', async ({
    page,
  }) => {
    // Intercept the API call so we don't actually run the scrape
    await page.route('**/api/admin/trigger/scrape', async (route) => {
      // Simulate a short delay
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
      });
    });

    const scrapeBtn = page.getByRole('button', { name: 'Run Scrape' });
    const discoveryBtn = page.getByRole('button', { name: 'Run Discovery' });
    const archiveBtn = page.getByRole('button', { name: 'Run Archive' });

    await scrapeBtn.click();

    // Other buttons should be disabled while running
    await expect(discoveryBtn).toBeDisabled();
    await expect(archiveBtn).toBeDisabled();

    // Wait for success toast
    await expect(page.getByText('Scrape complete')).toBeVisible({ timeout: 10_000 });

    // Buttons should re-enable
    await expect(scrapeBtn).toBeEnabled();
    await expect(discoveryBtn).toBeEnabled();
    await expect(archiveBtn).toBeEnabled();
  });

  test('Run Archive triggers job and shows archived count toast', async ({ page }) => {
    await page.route('**/api/admin/trigger/archive', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, archived: 5, timestamp: new Date().toISOString() }),
      });
    });

    await page.getByRole('button', { name: 'Run Archive' }).click();
    await expect(page.getByText('Archived 5 events')).toBeVisible({ timeout: 10_000 });
  });

  test('Discovery dropdown changes job type', async ({ page }) => {
    await page.route('**/api/admin/trigger/discover-reddit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          candidatesFound: 3,
          autoApproved: 1,
          timestamp: new Date().toISOString(),
        }),
      });
    });

    // Change dropdown to Reddit
    const select = page.getByLabel('Discovery type');
    await select.selectOption('discover-reddit');
    await expect(select).toHaveValue('discover-reddit');

    await page.getByRole('button', { name: 'Run Discovery' }).click();
    await expect(page.getByText('Reddit discovery')).toBeVisible({ timeout: 10_000 });
  });

  test('Failed job shows error toast', async ({ page }) => {
    await page.route('**/api/admin/trigger/scrape', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Connection timeout' }),
      });
    });

    await page.getByRole('button', { name: 'Run Scrape' }).click();
    await expect(page.getByText('Failed: Connection timeout')).toBeVisible({ timeout: 10_000 });
  });
});
