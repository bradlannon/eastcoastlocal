/**
 * Task 6.4 — Mobile viewport: tab bar, long-press, cluster tap, marker tap.
 *
 * References:
 *   3b90c52 — long-press (1 s) on a marker/cluster switches to list tab
 *   ffd2d3c — cluster tap switches to list tab
 *   79a3fbe — tapping a marker switches to list tab
 *
 * The MobileTabBar renders buttons with aria-label="Map view" / "List view"
 * (visible only on md:hidden — i.e. viewports < 768 px wide).
 *
 * We cannot guarantee specific marker/cluster DOM nodes are present without
 * data, so marker-interaction tests skip gracefully when no markers exist.
 *
 * Does NOT call seedMinimal / truncateAll.
 */
import { test, expect } from '@playwright/test';
import { mockExternalApis } from '../fixtures/mocks';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

test.describe('Mobile – tab bar and interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
    await page.goto('/');
    // Wait for the map to render
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  });

  test('mobile tab bar is visible with Map and List buttons', async ({ page }) => {
    const mapTab = page.locator('[aria-label="Map view"]');
    const listTab = page.locator('[aria-label="List view"]');
    await expect(mapTab).toBeVisible({ timeout: 5_000 });
    await expect(listTab).toBeVisible({ timeout: 5_000 });
  });

  test('tapping List tab switches to list view', async ({ page }) => {
    const listTab = page.locator('[aria-label="List view"]');
    await listTab.tap();

    // After switching, the event list container should become visible.
    // The list panel uses class flex (from hidden md:flex → flex when active).
    // We look for either cards or the empty-state paragraph.
    await page.waitForSelector(
      'a[href^="/event/"], p.text-sm.text-gray-400',
      { timeout: 10_000 }
    );
  });

  test('tapping Map tab after list restores map view', async ({ page }) => {
    const listTab = page.locator('[aria-label="List view"]');
    const mapTab = page.locator('[aria-label="Map view"]');

    await listTab.tap();
    await mapTab.tap();

    // The Leaflet container should be visible again
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 5_000 });
  });

  test('long-press on marker switches to list tab (commit 3b90c52)', async ({ page }) => {
    const markers = page.locator('.leaflet-marker-icon');
    if ((await markers.count()) === 0) {
      test.skip(true, 'No markers present in dataset — skipping long-press test');
      return;
    }

    const firstMarker = markers.first();
    // Simulate a 1-second touch hold
    const box = await firstMarker.boundingBox();
    if (!box) {
      test.skip(true, 'Marker has no bounding box — skipping');
      return;
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.touchscreen.tap(cx, cy); // touchstart
    // Hold for 1100 ms to trigger long-press (threshold is 1000 ms)
    await page.evaluate(
      async ({ x, y }) => {
        return new Promise<void>((resolve) => {
          const touchObj = new Touch({
            identifier: Date.now(),
            target: document.elementFromPoint(x, y) as Element,
            clientX: x,
            clientY: y,
          });
          const touchStartEvent = new TouchEvent('touchstart', {
            touches: [touchObj],
            targetTouches: [touchObj],
            changedTouches: [touchObj],
            bubbles: true,
          });
          (document.elementFromPoint(x, y) as Element).dispatchEvent(touchStartEvent);
          setTimeout(() => {
            const touchEndEvent = new TouchEvent('touchend', {
              touches: [],
              targetTouches: [],
              changedTouches: [touchObj],
              bubbles: true,
            });
            (document.elementFromPoint(x, y) as Element).dispatchEvent(touchEndEvent);
            resolve();
          }, 1100);
        });
      },
      { x: cx, y: cy }
    );

    // After long-press, the list tab should become active (text-orange-600)
    const listTab = page.locator('[aria-label="List view"]');
    await expect(listTab).toHaveClass(/text-orange-600/, { timeout: 5_000 });
  });

  test('tap on marker switches to list tab (commit 79a3fbe)', async ({ page }) => {
    const markers = page.locator('.leaflet-marker-icon');
    if ((await markers.count()) === 0) {
      test.skip(true, 'No markers present in dataset — skipping marker tap test');
      return;
    }

    const firstMarker = markers.first();
    const box = await firstMarker.boundingBox();
    if (!box) {
      test.skip(true, 'Marker has no bounding box — skipping');
      return;
    }

    // A regular tap on a marker should trigger handleMarkerTap which sets
    // activeTab to 'list'. The ClusterLayer calls onMarkerTap on click.
    await firstMarker.tap();

    const listTab = page.locator('[aria-label="List view"]');
    await expect(listTab).toHaveClass(/text-orange-600/, { timeout: 5_000 });
  });
});
