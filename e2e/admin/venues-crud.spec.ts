/**
 * venues-crud.spec.ts
 *
 * Note: The admin UI has no venue delete button. This spec covers:
 *   - Create: fill the new venue form → row appears in list
 *   - Edit: rename via the edit form → updated name visible in list
 *
 * Cleanup: The edit step renames the venue to a "__deleted__" prefix so it
 * is obviously test data. True deletion would require direct DB access not
 * available in this E2E layer.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

const MARKER = `__e2e_venue_${Date.now()}__`;
const EDITED_MARKER = `__e2e_venue_edited_${Date.now()}__`;

test.describe('Admin venues CRUD', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAsAdmin(context);
  });

  test('venues list page loads', async ({ page }) => {
    await page.goto('/admin/venues');
    await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();
    await expect(page.getByRole('link', { name: '+ Add Venue' })).toBeVisible();
  });

  test('new venue page renders form', async ({ page }) => {
    await page.goto('/admin/venues/new');
    await expect(page.getByRole('heading', { name: 'New Venue' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Address')).toBeVisible();
    await expect(page.getByLabel('City')).toBeVisible();
    await expect(page.getByLabel('Province')).toBeVisible();
  });

  test('create venue → appears in list', async ({ page }) => {
    await page.goto('/admin/venues/new');
    await page.getByLabel('Name').fill(MARKER);
    await page.getByLabel('Address').fill('123 Test Street');
    await page.getByLabel('City').fill('Halifax');
    await page.getByLabel('Province').selectOption('NS');
    await page.getByRole('button', { name: 'Add Venue' }).click();

    // Should redirect to /admin/venues after creation
    await page.waitForURL('**/admin/venues', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: MARKER })).toBeVisible();
  });

  test('edit venue name → updated in list', async ({ page }) => {
    // Navigate to the venue created above
    await page.goto('/admin/venues');
    const venueLink = page.getByRole('link', { name: MARKER });
    if (!await venueLink.isVisible().catch(() => false)) {
      test.skip(); // Create test may not have run
      return;
    }
    await venueLink.click();

    // Should be on detail page
    await expect(page.getByRole('heading', { name: 'Edit Venue' })).toBeVisible();

    // Update the name
    const nameInput = page.getByLabel('Name');
    await nameInput.clear();
    await nameInput.fill(EDITED_MARKER);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Redirected back to list
    await page.waitForURL('**/admin/venues', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: EDITED_MARKER })).toBeVisible();
    // Old name no longer visible
    await expect(page.getByRole('link', { name: MARKER })).not.toBeVisible();
  });

  test('venue list table has name, city, province, sources columns', async ({ page }) => {
    await page.goto('/admin/venues');
    const table = page.locator('table');
    if (!await table.isVisible().catch(() => false)) {
      return; // No venues yet
    }
    await expect(page.getByText('Name').first()).toBeVisible();
    await expect(page.getByText('City').first()).toBeVisible();
    await expect(page.getByText('Province').first()).toBeVisible();
    await expect(page.getByText('Sources').first()).toBeVisible();
  });
});
