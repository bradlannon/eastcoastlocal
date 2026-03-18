/**
 * Rewrites outbound ticket URLs with affiliate/referral parameters.
 *
 * Supported platforms:
 * - Eventbrite: ?aff=eastcoastlocal
 * - Ticketmaster: via Impact Radius (future — needs enrollment)
 * - Bandsintown: ?came_from=eastcoastlocal&app_id=...
 *
 * For platforms without an affiliate program, the URL is returned unchanged
 * with a utm_source tag where possible.
 */

const EVENTBRITE_AFF_ID = process.env.EVENTBRITE_AFF_ID || 'eastcoastlocal';
const BANDSINTOWN_APP_ID = process.env.BANDSINTOWN_APP_ID || '';

export function toAffiliateUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname.replace(/^www\./, '');

  // Eventbrite — ?aff= parameter
  if (host.includes('eventbrite.')) {
    if (!parsed.searchParams.has('aff')) {
      parsed.searchParams.set('aff', EVENTBRITE_AFF_ID);
    }
    return parsed.toString();
  }

  // Ticketmaster — Impact Radius affiliate link
  // When enrolled, set TICKETMASTER_AFF_URL env var to your tracking domain.
  // For now, just add utm tracking so clicks are attributable.
  if (host.includes('ticketmaster.')) {
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', 'eastcoastlocal');
      parsed.searchParams.set('utm_medium', 'referral');
    }
    return parsed.toString();
  }

  // Bandsintown
  if (host.includes('bandsintown.com')) {
    if (!parsed.searchParams.has('came_from')) {
      parsed.searchParams.set('came_from', 'eastcoastlocal');
      if (BANDSINTOWN_APP_ID) {
        parsed.searchParams.set('app_id', BANDSINTOWN_APP_ID);
      }
    }
    return parsed.toString();
  }

  // All other URLs — add utm_source for tracking
  if (!parsed.searchParams.has('utm_source')) {
    parsed.searchParams.set('utm_source', 'eastcoastlocal');
  }
  return parsed.toString();
}
