import { db } from '@/lib/db/client';
import { venues, venueMergeLog, venueMergeCandidates } from '@/lib/db/schema';
import { ilike, eq, and } from 'drizzle-orm';
import { upsertEvent } from './normalizer';
import { scoreVenueCandidate, venueNameRatio } from './venue-dedup';
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
  // Fast path: exact ILIKE name + city match
  const existing = await db.query.venues.findFirst({
    where: and(ilike(venues.name, name), eq(venues.city, city)),
  });

  if (existing) return existing.id;

  // Fuzzy path: load all venues in the same city (case-insensitive city match)
  const cityVenues = await db
    .select()
    .from(venues)
    .where(ilike(venues.city, city));

  // TM venues have no geo at creation time — incoming lat/lng is always null
  const incoming = { name, lat: null as number | null, lng: null as number | null };

  // Find the best match across all city venues
  let bestDecision: ReturnType<typeof scoreVenueCandidate> | null = null;
  let bestCandidateId: number | null = null;
  let bestNameScore: number = 1;
  let bestDistanceM: number | null = null;

  for (const candidate of cityVenues) {
    const decision = scoreVenueCandidate(incoming, {
      name: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
    });

    if (decision.action === 'merge') {
      // Merge: return canonical id immediately (no new venue row created)
      const nameScore = venueNameRatio(name, candidate.name);
      await db.insert(venueMergeLog).values({
        canonical_venue_id: candidate.id,
        merged_venue_name: name,
        merged_venue_city: city,
        name_score: nameScore,
        distance_meters: null, // no geo on incoming TM venues
      });
      return candidate.id;
    }

    if (decision.action === 'review') {
      // Track the first review candidate
      if (bestDecision === null || bestDecision.action !== 'review') {
        bestDecision = decision;
        bestCandidateId = candidate.id;
        bestNameScore = venueNameRatio(name, candidate.name);
        bestDistanceM = null;
      }
    }
  }

  // Insert the new venue
  const [inserted] = await db
    .insert(venues)
    .values({ name, address, city, province })
    .returning({ id: venues.id });

  // Log review candidate if borderline case was found
  if (bestDecision?.action === 'review' && bestCandidateId !== null) {
    await db.insert(venueMergeCandidates).values({
      venue_a_id: inserted.id,
      venue_b_id: bestCandidateId,
      name_score: bestNameScore,
      distance_meters: bestDistanceM,
      reason: bestDecision.reason,
      status: 'pending',
    });
  }

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
