/**
 * Task 6.6 — Click-toggle popups (commit 5c0de2d).
 *
 * Clicking a marker opens a popup with a "Details" link.
 * Multiple popups can be open simultaneously — clicking a second marker does
 * NOT close the first (autoClose={false}, closeOnClick={false}).
 *
 * Uses the Leaflet popup selector: .leaflet-popup-content
 *
 * Skips gracefully if fewer than 2 markers are visible (empty/thin dataset).
 *
 * Does NOT call seedMinimal / truncateAll.
 */
import { test, expect } from '@playwright/test';
import { mockExternalApis } from '../fixtures/mocks';

test.describe('Map popups', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
    // Use a wide viewport so the map occupies full width and all markers show.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    // Small pause to let tiles + markers settle
    await page.waitForTimeout(1_000);
  });

  test('clicking first marker opens a popup with a Details link', async ({ page }) => {
    const markers = page.locator('.leaflet-marker-icon');
    const markerCount = await markers.count();
    if (markerCount === 0) {
      test.skip(true, 'No markers in dataset — skipping popup test');
      return;
    }

    await markers.first().click();

    // Leaflet renders popup content in .leaflet-popup-content
    const popupContent = page.locator('.leaflet-popup-content');
    await expect(popupContent.first()).toBeVisible({ timeout: 5_000 });

    // VenuePopup renders a "Details" link for each event
    const detailsLink = popupContent.first().locator('a', { hasText: 'Details' });
    await expect(detailsLink.first()).toBeVisible({ timeout: 3_000 });

    // Details link should point to /event/<id>
    const href = await detailsLink.first().getAttribute('href');
    expect(href).toMatch(/^\/event\/\d+/);
  });

  test('clicking two markers leaves both popups open simultaneously (commit 5c0de2d)', async ({ page }) => {
    const markers = page.locator('.leaflet-marker-icon');
    const markerCount = await markers.count();

    if (markerCount < 2) {
      test.skip(true, 'Fewer than 2 markers in dataset — skipping multi-popup test');
      return;
    }

    // Click first marker
    await markers.nth(0).click();
    await expect(page.locator('.leaflet-popup-content').first()).toBeVisible({ timeout: 5_000 });

    // Click second marker — should open a second popup without closing the first
    await markers.nth(1).click();

    // Both popups should be visible
    const popups = page.locator('.leaflet-popup-content');
    const popupCount = await popups.count();
    expect(popupCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < Math.min(popupCount, 2); i++) {
      await expect(popups.nth(i)).toBeVisible();
    }
  });

  test('clicking a marker twice (toggle) closes the popup', async ({ page }) => {
    const markers = page.locator('.leaflet-marker-icon');
    if ((await markers.count()) === 0) {
      test.skip(true, 'No markers in dataset — skipping toggle test');
      return;
    }

    // Open
    await markers.first().click();
    await expect(page.locator('.leaflet-popup-content').first()).toBeVisible({ timeout: 5_000 });

    // Close (click same marker again — ClusterLayer toggles popup on second click)
    await markers.first().click();
    await expect(page.locator('.leaflet-popup-content')).toHaveCount(0, { timeout: 5_000 });
  });
});
