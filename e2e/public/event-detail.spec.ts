/**
 * Task 6.5 — Event detail page.
 *
 * Scrapes a real event ID from the home list, navigates to /event/<id>, and
 * asserts structural elements: performer h1, venue name, optional affiliate
 * link. Also asserts that /event/non-existent-id returns 404.
 *
 * Does NOT call seedMinimal / truncateAll.
 */
import { test, expect } from '@playwright/test';
import { mockExternalApis } from '../fixtures/mocks';

test.describe('Event detail page', () => {
  test('navigating to a real event ID shows performer name, venue, and back link', async ({ page }) => {
    await mockExternalApis(page);
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });

    // Wait for the list panel to render event links (desktop layout)
    await page.waitForSelector('a[href^="/event/"]', { timeout: 20_000 });

    const firstEventLink = page.locator('a[href^="/event/"]').first();
    const href = await firstEventLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/event\/\d+/);

    // Navigate to the event detail page
    await page.goto(href!);

    // Performer name should appear in the h1
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 15_000 });
    const h1Text = await h1.textContent();
    expect(h1Text?.trim().length).toBeGreaterThan(0);

    // Venue name should appear in the <p> below the h1
    const venue = page.locator('p.text-lg.text-gray-600').first();
    await expect(venue).toBeVisible({ timeout: 5_000 });
    expect((await venue.textContent())?.trim().length).toBeGreaterThan(0);

    // Back link should point to '/'
    const backLink = page.locator('a', { hasText: 'Back to map' });
    await expect(backLink).toBeVisible();
    const backHref = await backLink.getAttribute('href');
    expect(backHref).toMatch(/^\//);
  });

  test('affiliate / ticket link is an external anchor when present', async ({ page }) => {
    await mockExternalApis(page);
    await page.goto('/');
    await page.waitForSelector('a[href^="/event/"]', { timeout: 30_000 });

    const href = await page.locator('a[href^="/event/"]').first().getAttribute('href');
    if (!href) return;

    await page.goto(href);
    await page.waitForSelector('h1', { timeout: 15_000 });

    // CTA button is an <a> with target="_blank" when ticket/source URL exists
    const ctaLink = page.locator('a[target="_blank"]').first();
    const ctaCount = await ctaLink.count();
    if (ctaCount === 0) {
      // No ticket URL for this event — structural check passes vacuously
      return;
    }
    const ctaHref = await ctaLink.getAttribute('href');
    // Affiliate links must be external URLs
    expect(ctaHref).toMatch(/^https?:\/\//);
  });

  test('/event/non-existent-id returns a 404 page', async ({ page }) => {
    await mockExternalApis(page);
    const response = await page.goto('/event/non-existent-id');
    // Next.js notFound() results in a 404 status code
    expect(response?.status()).toBe(404);
  });

  test('/event/99999999 (very large unlikely ID) returns 404', async ({ page }) => {
    await mockExternalApis(page);
    const response = await page.goto('/event/99999999');
    expect(response?.status()).toBe(404);
  });
});
