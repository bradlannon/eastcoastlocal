/**
 * Task 6.3 — Filter bar: category chips, date chips, search, Clear.
 *
 * Asserts URL query-param behaviour without depending on specific event data.
 * Province and bbox filters are not wired in the public filter bar (they are
 * internal/map-driven only), so we skip those.
 *
 * Does NOT call seedMinimal / truncateAll.
 */
import { test, expect } from '@playwright/test';
import { mockExternalApis } from '../fixtures/mocks';

test.describe('Event filters', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
    await page.goto('/');
    // Wait for the filter bar to appear (not the loading skeleton)
    await page.waitForSelector('button:text("All Types")', { timeout: 30_000 });
  });

  test('clicking a category chip adds ?category= to the URL', async ({ page }) => {
    // The category buttons are rendered after "All Types".
    // Click the first non-"All Types" category button.
    const categoryButtons = page.locator('button').filter({
      hasNotText: /^All Types$|^All$|^Today$|^This Weekend$|^This Week$|^Next 30 Days$|\+ Submit Event|Clear/,
    });
    const firstCat = categoryButtons.first();
    if ((await firstCat.count()) === 0) return; // no category buttons visible

    await firstCat.click();
    await expect(page).toHaveURL(/[?&]category=/, { timeout: 5_000 });
  });

  test('category filter persists on page reload', async ({ page }) => {
    const categoryButtons = page.locator('button').filter({
      hasNotText: /^All Types$|^All$|^Today$|^This Weekend$|^This Week$|^Next 30 Days$|\+ Submit Event|Clear/,
    });
    const firstCat = categoryButtons.first();
    if ((await firstCat.count()) === 0) return;

    await firstCat.click();
    const url = page.url();
    expect(url).toMatch(/[?&]category=/);

    // Reload and verify param remains
    await page.reload();
    await page.waitForSelector('button:text("All Types")', { timeout: 30_000 });
    await expect(page).toHaveURL(/[?&]category=/, { timeout: 5_000 });
  });

  test('Clear button removes category and when params', async ({ page }) => {
    // Set a category filter first
    const categoryButtons = page.locator('button').filter({
      hasNotText: /^All Types$|^All$|^Today$|^This Weekend$|^This Week$|^Next 30 Days$|\+ Submit Event|Clear/,
    });
    const firstCat = categoryButtons.first();
    if ((await firstCat.count()) === 0) return;

    await firstCat.click();
    await expect(page).toHaveURL(/[?&]category=/, { timeout: 5_000 });

    // The Clear button appears when hasFilters is true
    const clearBtn = page.locator('button:text("Clear")');
    await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    await clearBtn.click();

    // URL should no longer contain category or when
    await expect(page).not.toHaveURL(/[?&]category=/, { timeout: 5_000 });
    await expect(page).not.toHaveURL(/[?&]when=/, { timeout: 5_000 });
  });

  test('clicking a date chip adds ?when= to the URL', async ({ page }) => {
    // Date chips: Today, This Weekend, This Week, Next 30 Days
    const todayBtn = page.locator('button:text("Today")');
    await expect(todayBtn).toBeVisible({ timeout: 10_000 });
    await todayBtn.click();
    await expect(page).toHaveURL(/[?&]when=today/, { timeout: 5_000 });
  });

  test('All date chip clears ?when= from URL', async ({ page }) => {
    const todayBtn = page.locator('button:text("Today")');
    await todayBtn.click();
    await expect(page).toHaveURL(/[?&]when=today/, { timeout: 5_000 });

    const allBtn = page.locator('button:text("All")').first();
    await allBtn.click();
    await expect(page).not.toHaveURL(/[?&]when=/, { timeout: 5_000 });
  });

  test('typing in search input adds ?q= to the URL', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('jazz');
    await expect(page).toHaveURL(/[?&]q=jazz/, { timeout: 5_000 });
  });

  test('clearing the search input removes ?q= from URL', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('jazz');
    await expect(page).toHaveURL(/[?&]q=jazz/, { timeout: 5_000 });

    await searchInput.fill('');
    await expect(page).not.toHaveURL(/[?&]q=/, { timeout: 5_000 });
  });
});
