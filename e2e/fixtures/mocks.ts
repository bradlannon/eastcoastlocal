import type { Page } from '@playwright/test';

export async function mockExternalApis(page: Page) {
  await page.route('**/api.anthropic.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":[{"text":"mock"}]}' }));
  await page.route('**/generativelanguage.googleapis.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"candidates":[]}' }));
  await page.route('**/eventbriteapi.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' }));
  await page.route('**/app.ticketmaster.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"_embedded":{"events":[]}}' }));
  await page.route('**/bandsintown.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/reddit.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"children":[]}}' }));
  await page.route('**/overpass-api.de/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"elements":[]}' }));
  await page.route('**/nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}
