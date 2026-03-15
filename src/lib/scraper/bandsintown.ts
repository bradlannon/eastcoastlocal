import type { ScrapeSource } from '@/types';
import { upsertEvent } from './normalizer';

interface BandsintownVenue {
  name: string;
  city: string;
  region: string;
  country: string;
}

interface BandsintownOffer {
  type: string;
  url: string;
  status: string;
}

interface BandsintownEvent {
  id: string;
  datetime: string;
  url: string;
  description: string | null;
  venue: BandsintownVenue;
  offers: BandsintownOffer[];
}

const ATLANTIC_CANADA_REGIONS = new Set([
  'New Brunswick',
  'Nova Scotia',
  'Prince Edward Island',
  'Newfoundland and Labrador',
  'NB',
  'NS',
  'PE',
  'NL',
]);

export async function scrapeBandsintown(source: ScrapeSource): Promise<void> {
  const artistName = source.url.replace('bandsintown:artist:', '');

  const response = await fetch(
    `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events/?app_id=${process.env.BANDSINTOWN_APP_ID}&date=upcoming`
  );

  if (!response.ok) {
    throw new Error(
      `Bandsintown API error: ${response.status} ${response.statusText} for artist ${artistName}`
    );
  }

  const events = (await response.json()) as BandsintownEvent[];
  const now = new Date();
  const displayName = artistName.replace(/\+/g, ' ');

  for (const event of events) {
    // Filter to Atlantic Canada only
    if (!ATLANTIC_CANADA_REGIONS.has(event.venue.region)) {
      continue;
    }

    // Skip past events
    if (new Date(event.datetime) < now) {
      continue;
    }

    const ticketLink = event.offers?.[0]?.url ?? event.url;

    await upsertEvent(
      source.venue_id,
      {
        performer: displayName,
        event_date: event.datetime.slice(0, 10),
        event_time: event.datetime.slice(11, 16),
        price: null,
        ticket_link: ticketLink,
        description: event.description ?? null,
        cover_image_url: null,
        confidence: 1.0,
        event_category: 'live_music' as const,
      },
      event.url,
      source.id,
      'scrape'
    );
  }
}
