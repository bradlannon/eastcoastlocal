/**
 * Places API discovery engine.
 *
 * Exports TypeScript interfaces, Atlantic Canada city list, tier-based scoring,
 * venue type filtering, threshold constants, and the core discovery functions:
 * searchCity, processPlaceResult, enrichVenue, runPlacesDiscovery.
 */

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
export const GEMINI_AUTO_APPROVE = 0.9;

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
