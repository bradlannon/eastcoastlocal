import { db } from '@/lib/db/client';
import { venues } from '@/lib/db/schema';
import { ilike, eq, and } from 'drizzle-orm';
import { upsertEvent } from './normalizer';
import type { ScrapeSource } from '@/types';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// ─── TM API types ─────────────────────────────────────────────────────────

interface TmEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: {
      localDate: string;
      dateTime?: string;
      timeTBA?: boolean;
    };
  };
  images?: Array<{ url: string; ratio?: string; width?: number }>;
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
  }>;
  _embedded?: {
    venues?: Array<{
      name: string;
      address?: { line1?: string };
      city?: { name?: string };
      state?: { stateCode?: string };
    }>;
    attractions?: Array<{ name: string }>;
  };
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages: number; number: number };
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function scrapeTicketmaster(source: ScrapeSource): Promise<void> {
  const stateCode = source.url.replace('ticketmaster:province:', '');
  const apiKey = process.env.TICKETMASTER_API_KEY ?? '';

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 30);

  const params = new URLSearchParams({
    apikey: apiKey,
    countryCode: 'CA',
    stateCode,
    startDateTime: today.toISOString().slice(0, 10) + 'T00:00:00Z',
    endDateTime: endDate.toISOString().slice(0, 10) + 'T23:59:59Z',
    size: '200',
  });

  const response = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
  );

  if (!response.ok) {
    throw new Error(
      `Ticketmaster API error: ${response.status} ${response.statusText} for stateCode=${stateCode}`
    );
  }

  const data = (await response.json()) as TmResponse;
  const tmEvents = data._embedded?.events ?? [];

  for (const event of tmEvents) {
    const tmVenue = event._embedded?.venues?.[0];
    if (!tmVenue) continue;

    const venueName = tmVenue.name;
    const city = tmVenue.city?.name ?? '';
    const province = tmVenue.state?.stateCode ?? stateCode;
    const address = tmVenue.address?.line1 ?? `${city}, ${province}`;

    const venueId = await findOrCreateVenue(venueName, city, province, address);

    const timeTba = event.dates.start.timeTBA ?? false;
    const eventTime = timeTba
      ? null
      : (event.dates.start.dateTime?.slice(11, 16) ?? null);

    const performer = event._embedded?.attractions?.[0]?.name ?? event.name;

    const bestImage = event.images?.find(i => i.ratio === '16_9') ?? event.images?.[0];

    const price =
      event.priceRanges?.[0]?.min != null
        ? `$${event.priceRanges[0].min}+`
        : null;

    const extracted: ExtractedEvent = {
      performer,
      event_date: event.dates.start.localDate,
      event_time: eventTime,
      price,
      ticket_link: event.url,
      description: null,
      cover_image_url: bestImage?.url ?? null,
      confidence: 1.0,
      event_category: mapTmClassification(event.classifications ?? []),
    };

    await upsertEvent(venueId, extracted, event.url);
  }
}

// ─── Venue find-or-create ─────────────────────────────────────────────────

export async function findOrCreateVenue(
  name: string,
  city: string,
  province: string,
  address: string
): Promise<number> {
  const existing = await db.query.venues.findFirst({
    where: and(ilike(venues.name, name), eq(venues.city, city)),
  });

  if (existing) return existing.id;

  const [inserted] = await db
    .insert(venues)
    .values({ name, address, city, province })
    .returning({ id: venues.id });

  return inserted.id;
}

// ─── Category mapping ─────────────────────────────────────────────────────

export function mapTmClassification(
  classifications: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
): ExtractedEvent['event_category'] {
  const segment = classifications[0]?.segment?.name?.toLowerCase() ?? '';
  const genre = classifications[0]?.genre?.name?.toLowerCase() ?? '';

  if (segment === 'music') return 'live_music';
  if (segment === 'sports') return 'sports';
  if (segment === 'arts & theatre') {
    if (genre.includes('comedy')) return 'comedy';
    if (genre.includes('theatre') || genre.includes('theater')) return 'theatre';
    return 'arts';
  }
  if (segment === 'film') return 'arts';
  if (segment === 'family') return 'community';
  if (segment === 'miscellaneous') return 'community';
  return 'other';
}
