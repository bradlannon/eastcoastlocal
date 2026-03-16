/**
 * Places API discovery engine.
 *
 * Exports TypeScript interfaces, Atlantic Canada city list, tier-based scoring,
 * venue type filtering, threshold constants, and the core discovery functions:
 * searchCity, processPlaceResult, enrichVenue, runPlacesDiscovery.
 */
import { db } from '@/lib/db/client';
import { venues, discovered_sources } from '@/lib/db/schema';
import { eq, inArray, and, gte } from 'drizzle-orm';
import { scoreVenueCandidate } from './venue-dedup';
import { promoteSource } from './promote-source';

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface PlacesSearchResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
}

export interface PlaceResult {
  id: string;
  displayName: { text: string; languageCode: string };
  websiteUri?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
}

// ---------------------------------------------------------------------------
// Venue type constants
// ---------------------------------------------------------------------------

/** All place types considered relevant for venue discovery. */
export const VENUE_PLACE_TYPES = new Set<string>([
  'bar',
  'night_club',
  'concert_hall',
  'performing_arts_theater',
  'comedy_club',
  'community_center',
  'stadium',
]);

/** Core venue types — score 0.85, auto-approved above PLACES_AUTO_APPROVE threshold. */
export const CORE_VENUE_TYPES = new Set<string>([
  'bar',
  'night_club',
  'concert_hall',
  'performing_arts_theater',
  'comedy_club',
]);

/** Secondary venue types — score 0.70, routed to admin review queue. */
export const SECONDARY_VENUE_TYPES = new Set<string>([
  'community_center',
  'stadium',
]);

// ---------------------------------------------------------------------------
// Auto-approve threshold constants
// ---------------------------------------------------------------------------

/** Places API candidates with score >= this value are auto-approved. */
export const PLACES_AUTO_APPROVE = 0.8;

/** Gemini+Search candidates with score >= this value are auto-approved. */
export const GEMINI_AUTO_APPROVE = parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9');

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one of the provided place types is in VENUE_PLACE_TYPES.
 */
export function isVenueRelevant(types: string[]): boolean {
  return types.some((t) => VENUE_PLACE_TYPES.has(t));
}

/**
 * Returns a tier-based score for a Places API candidate.
 * - 0.85 if any type is in CORE_VENUE_TYPES
 * - 0.70 if any type is in SECONDARY_VENUE_TYPES
 * - 0 otherwise
 *
 * Core takes precedence over secondary when both are present.
 */
export function scorePlacesCandidate(types: string[]): number {
  if (types.some((t) => CORE_VENUE_TYPES.has(t))) return 0.85;
  if (types.some((t) => SECONDARY_VENUE_TYPES.has(t))) return 0.70;
  return 0;
}

// ---------------------------------------------------------------------------
// Atlantic Canada city list (2,000+ population)
// ---------------------------------------------------------------------------

export const PLACES_CITIES: Record<string, Array<{ city: string; province: string }>> = {
  NS: [
    { city: 'Halifax', province: 'NS' },
    { city: 'Dartmouth', province: 'NS' },
    { city: 'Sydney', province: 'NS' },
    { city: 'Truro', province: 'NS' },
    { city: 'New Glasgow', province: 'NS' },
    { city: 'Glace Bay', province: 'NS' },
    { city: 'Kentville', province: 'NS' },
    { city: 'Amherst', province: 'NS' },
    { city: 'Bridgewater', province: 'NS' },
    { city: 'Yarmouth', province: 'NS' },
    { city: 'Antigonish', province: 'NS' },
    { city: 'Wolfville', province: 'NS' },
    { city: 'Stellarton', province: 'NS' },
    { city: 'New Waterford', province: 'NS' },
    { city: 'Lower Sackville', province: 'NS' },
  ],
  NB: [
    { city: 'Moncton', province: 'NB' },
    { city: 'Saint John', province: 'NB' },
    { city: 'Fredericton', province: 'NB' },
    { city: 'Dieppe', province: 'NB' },
    { city: 'Riverview', province: 'NB' },
    { city: 'Miramichi', province: 'NB' },
    { city: 'Edmundston', province: 'NB' },
    { city: 'Bathurst', province: 'NB' },
    { city: 'Campbellton', province: 'NB' },
    { city: 'Oromocto', province: 'NB' },
    { city: 'Grand Falls', province: 'NB' },
    { city: 'Woodstock', province: 'NB' },
  ],
  PEI: [
    { city: 'Charlottetown', province: 'PEI' },
    { city: 'Summerside', province: 'PEI' },
    { city: 'Stratford', province: 'PEI' },
    { city: 'Cornwall', province: 'PEI' },
  ],
  NL: [
    { city: "St. John's", province: 'NL' },
    { city: 'Mount Pearl', province: 'NL' },
    { city: 'Corner Brook', province: 'NL' },
    { city: 'Conception Bay South', province: 'NL' },
    { city: 'Paradise', province: 'NL' },
    { city: 'Grand Falls-Windsor', province: 'NL' },
    { city: 'Gander', province: 'NL' },
    { city: 'Happy Valley-Goose Bay', province: 'NL' },
    { city: 'Stephenville', province: 'NL' },
    { city: 'Labrador City', province: 'NL' },
  ],
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.id,places.displayName,places.websiteUri,places.formattedAddress,places.location,places.types,nextPageToken';

/**
 * Simple delay helper — pauses execution for `ms` milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs to the Places API Text Search endpoint and returns the parsed response.
 * Throws on non-2xx status.
 */
async function fetchPlacesPage(
  body: Record<string, unknown>
): Promise<PlacesSearchResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const response = await fetch(PLACES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey ?? '',
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Places API error: ${response.status} — ${text.slice(0, 200)}`
    );
  }

  return response.json() as Promise<PlacesSearchResponse>;
}

// ---------------------------------------------------------------------------
// searchCity
// ---------------------------------------------------------------------------

/**
 * Searches the Places API for venue-relevant places in a city and returns
 * filtered results. Follows nextPageToken pagination until exhausted.
 */
export async function searchCity(
  city: string,
  province: string
): Promise<PlaceResult[]> {
  const throttleMs = parseInt(process.env.PLACES_THROTTLE_MS ?? '500', 10);
  const textQuery = `bars nightclubs live music venues in ${city} ${province}`;

  const all: PlaceResult[] = [];
  let pageToken: string | undefined = undefined;
  let isFirstPage = true;

  do {
    if (!isFirstPage) {
      await delay(throttleMs);
    }
    isFirstPage = false;

    const body: Record<string, unknown> = { textQuery };
    if (pageToken) {
      body.pageToken = pageToken;
    }

    const data = await fetchPlacesPage(body);
    const places = data.places ?? [];
    all.push(...places);
    pageToken = data.nextPageToken;
  } while (pageToken);

  const filtered = all.filter((p) => isVenueRelevant(p.types ?? []));

  console.log(
    `Places: ${city} ${province} — ${all.length} raw, ${filtered.length} venue-relevant`
  );

  return filtered;
}

// ---------------------------------------------------------------------------
// VenueRow type (subset of schema.venues needed for dedup)
// ---------------------------------------------------------------------------

export interface VenueRow {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  province: string;
}

// ---------------------------------------------------------------------------
// enrichVenue
// ---------------------------------------------------------------------------

/**
 * Backfills google_place_id and address on an existing venue row from a
 * Places API result. Only updates if the data is richer (non-null).
 */
export async function enrichVenue(venueId: number, place: PlaceResult): Promise<void> {
  await db
    .update(venues)
    .set({
      ...(place.id ? { google_place_id: place.id } : {}),
      ...(place.formattedAddress ? { address: place.formattedAddress } : {}),
      ...(place.location ? { lat: place.location.latitude, lng: place.location.longitude } : {}),
    })
    .where(eq(venues.id, venueId));

  console.log(`Enriched venue ${venueId} with Places data (${place.id})`);
}

// ---------------------------------------------------------------------------
// processPlaceResult
// ---------------------------------------------------------------------------

export type ProcessResult =
  | 'enriched'
  | 'staged_pending'
  | 'staged_no_website'
  | 'staged_review'
  | 'skipped';

/**
 * Handles a single Places API result: deduplicates against existing venues,
 * stages new candidates, and enriches existing venues with Places data.
 */
export async function processPlaceResult(
  place: PlaceResult,
  province: string,
  city: string,
  provinceVenues: VenueRow[]
): Promise<ProcessResult> {
  // Step 1 — google_place_id fast-path
  // Check discovered_sources first — if already staged, skip
  const existingStaged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.google_place_id, place.id),
  });
  if (existingStaged) {
    return 'skipped';
  }

  // Check venues by google_place_id
  const existingVenue = await db.query.venues.findFirst({
    where: and(
      eq(venues.google_place_id, place.id),
      eq(venues.province, province)
    ),
  });
  if (existingVenue) {
    await enrichVenue(existingVenue.id, place);
    return 'enriched';
  }

  // Step 2 — fuzzy dedup against province venues
  const incoming = {
    name: place.displayName.text,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
  };

  for (const candidate of provinceVenues) {
    const decision = scoreVenueCandidate(incoming, {
      name: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
    });

    if (decision.action === 'merge') {
      await enrichVenue(candidate.id, place);
      return 'enriched';
    }

    if (decision.action === 'review') {
      // Stage as pending with near-match context
      await stageCandidate(place, province, city, 'pending', `near-match: ${candidate.name}`);
      return 'staged_review';
    }
    // keep_separate: continue loop
  }

  // Step 3 — no match; stage based on websiteUri presence
  if (place.websiteUri) {
    await stageCandidate(place, province, city, 'pending', null);
    return 'staged_pending';
  } else {
    await stageCandidate(place, province, city, 'no_website', null);
    return 'staged_no_website';
  }
}

/**
 * Inserts a place into discovered_sources with all required fields.
 * Uses onConflictDoNothing for idempotency (url unique constraint).
 */
async function stageCandidate(
  place: PlaceResult,
  province: string,
  city: string,
  status: 'pending' | 'no_website',
  rawContext: string | null
): Promise<void> {
  const url = place.websiteUri ?? `places:${place.id}`;
  const domain = place.websiteUri
    ? new URL(place.websiteUri).hostname
    : 'google-places';
  const discoveryScore = scorePlacesCandidate(place.types ?? []);

  await db
    .insert(discovered_sources)
    .values({
      url,
      domain,
      source_name: place.displayName.text,
      province,
      city,
      status,
      discovery_method: 'google_places',
      google_place_id: place.id,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      address: place.formattedAddress ?? null,
      place_types: place.types ? JSON.stringify(place.types) : null,
      discovery_score: discoveryScore,
      raw_context: rawContext,
    })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// runPlacesDiscovery
// ---------------------------------------------------------------------------

export interface DiscoveryRunResult {
  citiesSearched: number;
  candidatesFound: number;
  enriched: number;
  stagedPending: number;
  stagedNoWebsite: number;
  autoApproved: number;
  errors: number;
}

/**
 * Main orchestrator: searches each city, deduplicates, and stages candidates.
 * Per-city errors are caught and logged; execution continues to next city.
 * After all cities, runs auto-approve for pending records scoring >= PLACES_AUTO_APPROVE.
 */
export async function runPlacesDiscovery(
  cities: Array<{ city: string; province: string }>
): Promise<DiscoveryRunResult> {
  const throttleMs = parseInt(process.env.PLACES_THROTTLE_MS ?? '500', 10);

  const result: DiscoveryRunResult = {
    citiesSearched: 0,
    candidatesFound: 0,
    enriched: 0,
    stagedPending: 0,
    stagedNoWebsite: 0,
    autoApproved: 0,
    errors: 0,
  };

  // Load province venues once upfront (all distinct provinces)
  const distinctProvinces = [...new Set(cities.map((c) => c.province))];
  const provinceVenues = await db
    .select({
      id: venues.id,
      name: venues.name,
      lat: venues.lat,
      lng: venues.lng,
      google_place_id: venues.google_place_id,
      province: venues.province,
    })
    .from(venues)
    .where(inArray(venues.province, distinctProvinces));

  // Process each city
  for (let i = 0; i < cities.length; i++) {
    const { city, province } = cities[i];

    if (i > 0) {
      await delay(throttleMs);
    }

    result.citiesSearched++;

    try {
      const places = await searchCity(city, province);
      result.candidatesFound += places.length;

      const venuesForProvince = provinceVenues.filter((v) => v.province === province);

      for (const place of places) {
        const outcome = await processPlaceResult(place, province, city, venuesForProvince);
        if (outcome === 'enriched') result.enriched++;
        else if (outcome === 'staged_pending' || outcome === 'staged_review') result.stagedPending++;
        else if (outcome === 'staged_no_website') result.stagedNoWebsite++;
        // 'skipped' increments nothing
      }
    } catch (err) {
      result.errors++;
      console.error(`Places discovery error for ${city} ${province}:`, err);
    }
  }

  // Auto-approve: query pending google_places records scoring >= threshold
  const autoApproveCandidates = await db
    .select({ id: discovered_sources.id })
    .from(discovered_sources)
    .where(
      and(
        eq(discovered_sources.status, 'pending'),
        eq(discovered_sources.discovery_method, 'google_places'),
        gte(discovered_sources.discovery_score, PLACES_AUTO_APPROVE)
      )
    );

  for (const candidate of autoApproveCandidates) {
    try {
      await promoteSource(candidate.id);
      result.autoApproved++;
    } catch (err) {
      console.error(`Auto-approve failed for discovered_source ${candidate.id}:`, err);
    }
  }

  console.log(
    `Places discovery complete: ${result.citiesSearched} cities, ${result.candidatesFound} candidates, ` +
    `${result.enriched} enriched, ${result.stagedPending} pending, ${result.stagedNoWebsite} stubs, ` +
    `${result.autoApproved} auto-approved, ${result.errors} errors`
  );

  return result;
}
