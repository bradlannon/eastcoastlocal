/**
 * Characterization tests for src/lib/affiliate.ts
 */

import { toAffiliateUrl } from './affiliate';

describe('toAffiliateUrl — Eventbrite', () => {
  it('adds ?aff=eastcoastlocal to an eventbrite.com URL', () => {
    const result = toAffiliateUrl('https://www.eventbrite.com/e/some-event-12345');
    const url = new URL(result);
    expect(url.searchParams.get('aff')).toBe('eastcoastlocal');
  });

  it('does not double-add aff if already present', () => {
    const result = toAffiliateUrl('https://www.eventbrite.com/e/event?aff=existing');
    const url = new URL(result);
    expect(url.searchParams.get('aff')).toBe('existing');
  });

  it('handles eventbrite.ca subdomain', () => {
    const result = toAffiliateUrl('https://www.eventbrite.ca/e/event-123');
    const url = new URL(result);
    expect(url.searchParams.get('aff')).toBe('eastcoastlocal');
  });
});

describe('toAffiliateUrl — Ticketmaster', () => {
  it('adds utm_source and utm_medium to a ticketmaster URL', () => {
    const result = toAffiliateUrl('https://www.ticketmaster.com/event/123');
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('eastcoastlocal');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
  });

  it('does not overwrite existing utm_source on ticketmaster', () => {
    const result = toAffiliateUrl('https://www.ticketmaster.com/event/123?utm_source=other');
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('other');
  });
});

describe('toAffiliateUrl — Bandsintown', () => {
  it('adds came_from=eastcoastlocal to a bandsintown.com URL', () => {
    const result = toAffiliateUrl('https://www.bandsintown.com/e/123');
    const url = new URL(result);
    expect(url.searchParams.get('came_from')).toBe('eastcoastlocal');
  });

  it('does not overwrite existing came_from on bandsintown', () => {
    const result = toAffiliateUrl('https://www.bandsintown.com/e/123?came_from=other');
    const url = new URL(result);
    expect(url.searchParams.get('came_from')).toBe('other');
  });

  it('does not add app_id when BANDSINTOWN_APP_ID env var is unset', () => {
    delete process.env.BANDSINTOWN_APP_ID;
    const result = toAffiliateUrl('https://www.bandsintown.com/e/456');
    const url = new URL(result);
    expect(url.searchParams.has('app_id')).toBe(false);
  });
});

describe('toAffiliateUrl — other/unsupported domains', () => {
  it('adds utm_source=eastcoastlocal for unknown domains', () => {
    const result = toAffiliateUrl('https://example.com/event');
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('eastcoastlocal');
  });

  it('does not overwrite existing utm_source on unknown domains', () => {
    const result = toAffiliateUrl('https://example.com/event?utm_source=existing');
    const url = new URL(result);
    expect(url.searchParams.get('utm_source')).toBe('existing');
  });

  it('returns invalid URLs unchanged (pass-through)', () => {
    const bad = 'not-a-url';
    expect(toAffiliateUrl(bad)).toBe(bad);
  });
});
