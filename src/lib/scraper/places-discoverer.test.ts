// Mock db client before importing places-discoverer (which imports db)
jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      discovered_sources: { findFirst: jest.fn() },
      venues: { findFirst: jest.fn() },
    },
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

// Mock venue-dedup
jest.mock('./venue-dedup', () => ({
  scoreVenueCandidate: jest.fn(),
}));

// Mock promote-source
jest.mock('./promote-source', () => ({
  promoteSource: jest.fn(),
}));

import {
  PLACES_CITIES,
  VENUE_PLACE_TYPES,
  CORE_VENUE_TYPES,
  SECONDARY_VENUE_TYPES,
  PLACES_AUTO_APPROVE,
  GEMINI_AUTO_APPROVE,
  isVenueRelevant,
  scorePlacesCandidate,
  searchCity,
  processPlaceResult,
  enrichVenue,
  runPlacesDiscovery,
} from './places-discoverer';
import { db } from '@/lib/db/client';
import { scoreVenueCandidate } from './venue-dedup';
import { promoteSource } from './promote-source';

// Typed mock accessors
const mockDb = db as unknown as {
  query: {
    discovered_sources: { findFirst: jest.Mock };
    venues: { findFirst: jest.Mock };
  };
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};
const mockScoreVenueCandidate = scoreVenueCandidate as jest.Mock;
const mockPromoteSource = promoteSource as jest.Mock;

// ---------------------------------------------------------------------------
// searchCity tests
// ---------------------------------------------------------------------------

describe('searchCity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-key', PLACES_THROTTLE_MS: '0' };
    jest.spyOn(global, 'fetch').mockImplementation(jest.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('calls Places API with correct URL, headers, and textQuery', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          { id: 'place1', displayName: { text: 'The Seahorse', languageCode: 'en' }, types: ['bar'] },
        ],
      }),
    } as Response);

    await searchCity('Halifax', 'NS');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect((opts.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key');
    expect((opts.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('nextPageToken');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.textQuery).toContain('Halifax');
    expect(body.textQuery).toContain('NS');
  });

  it('follows nextPageToken through multiple pages and stops when absent', async () => {
    const mockFetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{ id: 'p1', displayName: { text: 'Bar One', languageCode: 'en' }, types: ['bar'] }],
          nextPageToken: 'token-page-2',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{ id: 'p2', displayName: { text: 'Bar Two', languageCode: 'en' }, types: ['bar'] }],
          nextPageToken: 'token-page-3',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{ id: 'p3', displayName: { text: 'Bar Three', languageCode: 'en' }, types: ['bar'] }],
          // no nextPageToken — stop
        }),
      } as Response);

    const results = await searchCity('Halifax', 'NS');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(3);

    // Second call should have pageToken in body
    const body2 = JSON.parse((mockFetch.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body2.pageToken).toBe('token-page-2');

    const body3 = JSON.parse((mockFetch.mock.calls[2] as [string, RequestInit])[1].body as string);
    expect(body3.pageToken).toBe('token-page-3');
  });

  it('filters out non-venue types (restaurant, grocery_store)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          { id: 'p1', displayName: { text: 'Bar One', languageCode: 'en' }, types: ['bar'] },
          { id: 'p2', displayName: { text: 'Grocery Store', languageCode: 'en' }, types: ['grocery_store', 'food'] },
          { id: 'p3', displayName: { text: 'Restaurant', languageCode: 'en' }, types: ['restaurant', 'food'] },
          { id: 'p4', displayName: { text: 'Concert Hall', languageCode: 'en' }, types: ['concert_hall'] },
        ],
      }),
    } as Response);

    const results = await searchCity('Halifax', 'NS');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id)).toEqual(['p1', 'p4']);
  });

  it('throws on non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as Response);

    await expect(searchCity('Halifax', 'NS')).rejects.toThrow(/403/);
  });

  it('applies throttle delay between pages', async () => {
    process.env.PLACES_THROTTLE_MS = '100';

    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [], nextPageToken: 'tok' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [] }),
      } as Response);

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await searchCity('Halifax', 'NS');

    // setTimeout called at least once with 100ms delay between pages
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
    setTimeoutSpy.mockRestore();
  });

  it('returns empty array when places is undefined in response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const results = await searchCity('Halifax', 'NS');
    expect(results).toEqual([]);
  });
});

describe('PLACES_CITIES', () => {
  it('has all 4 Atlantic provinces as keys', () => {
    expect(PLACES_CITIES).toHaveProperty('NS');
    expect(PLACES_CITIES).toHaveProperty('NB');
    expect(PLACES_CITIES).toHaveProperty('PEI');
    expect(PLACES_CITIES).toHaveProperty('NL');
  });

  it('NS has ~15 entries all with province=NS', () => {
    expect(PLACES_CITIES.NS.length).toBeGreaterThanOrEqual(14);
    for (const entry of PLACES_CITIES.NS) {
      expect(entry.province).toBe('NS');
      expect(typeof entry.city).toBe('string');
    }
  });

  it('NB has ~12 entries all with province=NB', () => {
    expect(PLACES_CITIES.NB.length).toBeGreaterThanOrEqual(11);
    for (const entry of PLACES_CITIES.NB) {
      expect(entry.province).toBe('NB');
    }
  });

  it('PEI has ~4 entries all with province=PEI', () => {
    expect(PLACES_CITIES.PEI.length).toBeGreaterThanOrEqual(4);
    for (const entry of PLACES_CITIES.PEI) {
      expect(entry.province).toBe('PEI');
    }
  });

  it('NL has ~10 entries all with province=NL', () => {
    expect(PLACES_CITIES.NL.length).toBeGreaterThanOrEqual(9);
    for (const entry of PLACES_CITIES.NL) {
      expect(entry.province).toBe('NL');
    }
  });

  it('total entries >= 40', () => {
    const total =
      PLACES_CITIES.NS.length +
      PLACES_CITIES.NB.length +
      PLACES_CITIES.PEI.length +
      PLACES_CITIES.NL.length;
    expect(total).toBeGreaterThanOrEqual(40);
  });
});

describe('VENUE_PLACE_TYPES', () => {
  it('contains exactly 7 allowed types', () => {
    expect(VENUE_PLACE_TYPES.size).toBe(7);
  });

  it('contains bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium', () => {
    expect(VENUE_PLACE_TYPES.has('bar')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('night_club')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('concert_hall')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('performing_arts_theater')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('comedy_club')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('community_center')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('stadium')).toBe(true);
  });
});

describe('CORE_VENUE_TYPES', () => {
  it('contains 5 core types', () => {
    expect(CORE_VENUE_TYPES.size).toBe(5);
    expect(CORE_VENUE_TYPES.has('bar')).toBe(true);
    expect(CORE_VENUE_TYPES.has('night_club')).toBe(true);
    expect(CORE_VENUE_TYPES.has('concert_hall')).toBe(true);
    expect(CORE_VENUE_TYPES.has('performing_arts_theater')).toBe(true);
    expect(CORE_VENUE_TYPES.has('comedy_club')).toBe(true);
  });
});

describe('SECONDARY_VENUE_TYPES', () => {
  it('contains 2 secondary types', () => {
    expect(SECONDARY_VENUE_TYPES.size).toBe(2);
    expect(SECONDARY_VENUE_TYPES.has('community_center')).toBe(true);
    expect(SECONDARY_VENUE_TYPES.has('stadium')).toBe(true);
  });
});

describe('threshold constants', () => {
  it('PLACES_AUTO_APPROVE equals 0.8', () => {
    expect(PLACES_AUTO_APPROVE).toBe(0.8);
  });

  it('GEMINI_AUTO_APPROVE equals 0.9', () => {
    expect(GEMINI_AUTO_APPROVE).toBe(0.9);
  });
});

describe('isVenueRelevant', () => {
  it('returns true for bar and restaurant (bar is in allowed types)', () => {
    expect(isVenueRelevant(['bar', 'restaurant'])).toBe(true);
  });

  it('returns false for restaurant and food only', () => {
    expect(isVenueRelevant(['restaurant', 'food'])).toBe(false);
  });

  it('returns true for community_center', () => {
    expect(isVenueRelevant(['community_center'])).toBe(true);
  });

  it('returns true for night_club', () => {
    expect(isVenueRelevant(['night_club'])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isVenueRelevant([])).toBe(false);
  });

  it('returns true for concert_hall mixed with other types', () => {
    expect(isVenueRelevant(['food', 'concert_hall', 'establishment'])).toBe(true);
  });
});

describe('scorePlacesCandidate', () => {
  it('returns 0.85 for bar', () => {
    expect(scorePlacesCandidate(['bar'])).toBe(0.85);
  });

  it('returns 0.85 for night_club and bar', () => {
    expect(scorePlacesCandidate(['night_club', 'bar'])).toBe(0.85);
  });

  it('returns 0.85 for concert_hall', () => {
    expect(scorePlacesCandidate(['concert_hall'])).toBe(0.85);
  });

  it('returns 0.85 for performing_arts_theater', () => {
    expect(scorePlacesCandidate(['performing_arts_theater'])).toBe(0.85);
  });

  it('returns 0.85 for comedy_club', () => {
    expect(scorePlacesCandidate(['comedy_club'])).toBe(0.85);
  });

  it('returns 0.70 for community_center', () => {
    expect(scorePlacesCandidate(['community_center'])).toBe(0.70);
  });

  it('returns 0.70 for stadium', () => {
    expect(scorePlacesCandidate(['stadium'])).toBe(0.70);
  });

  it('returns 0 for irrelevant types', () => {
    expect(scorePlacesCandidate(['restaurant', 'food'])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(scorePlacesCandidate([])).toBe(0);
  });

  it('prefers core (0.85) over secondary when both present', () => {
    expect(scorePlacesCandidate(['community_center', 'bar'])).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// Test helpers for Task 2
// ---------------------------------------------------------------------------

function makePlaceResult(overrides: Partial<{
  id: string;
  displayName: { text: string; languageCode: string };
  websiteUri: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
}> = {}) {
  return {
    id: 'ChIJtest123',
    displayName: { text: 'The Test Bar', languageCode: 'en' },
    websiteUri: 'https://testbar.ca',
    formattedAddress: '123 Test St, Halifax, NS B3H 1A1',
    location: { latitude: 44.6488, longitude: -63.5752 },
    types: ['bar'],
    ...overrides,
  };
}

function makeVenueRow(overrides: Partial<{
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  province: string;
}> = {}) {
  return {
    id: 1,
    name: 'The Test Bar',
    lat: 44.6488,
    lng: -63.5752,
    google_place_id: null,
    province: 'NS',
    ...overrides,
  };
}

// Helper to set up a chain of .from().where() mocks for db.select()
function makeSelectMock(returnValue: unknown[]) {
  const whereMock = jest.fn().mockResolvedValue(returnValue);
  const fromMock = jest.fn().mockReturnValue({ where: whereMock });
  mockDb.select.mockReturnValueOnce({ from: fromMock });
  return { fromMock, whereMock };
}

// Helper to set up insert mock that supports .values().onConflictDoNothing()
function makeInsertMock(returnValue?: unknown) {
  const onConflictMock = jest.fn().mockResolvedValue(returnValue ?? [{ id: 99 }]);
  const valuesMock = jest.fn().mockReturnValue({ onConflictDoNothing: onConflictMock });
  const returning = jest.fn().mockResolvedValue(returnValue ?? [{ id: 99 }]);
  const valuesWithReturning = jest.fn().mockReturnValue({ onConflictDoNothing: onConflictMock, returning });
  mockDb.insert.mockReturnValueOnce({ values: valuesWithReturning });
  return { valuesMock: valuesWithReturning, onConflictMock, returning };
}

// Helper to set up update mock
function makeUpdateMock() {
  const whereMock = jest.fn().mockResolvedValue([]);
  const setMock = jest.fn().mockReturnValue({ where: whereMock });
  mockDb.update.mockReturnValueOnce({ set: setMock });
  return { setMock, whereMock };
}

// ---------------------------------------------------------------------------
// processPlaceResult tests
// ---------------------------------------------------------------------------

describe('processPlaceResult', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-key', PLACES_THROTTLE_MS: '0' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns enriched when google_place_id matches existing discovered_source', async () => {
    // discovered_sources match -> skip (return 'skipped')
    const existingStaged = { id: 5, google_place_id: 'ChIJtest123' };
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(existingStaged);

    const place = makePlaceResult();
    const result = await processPlaceResult(place, 'NS', 'Halifax', []);
    expect(result).toBe('skipped');
  });

  it('returns enriched when google_place_id matches existing venue, calls enrichVenue', async () => {
    // No discovered_source match
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    // Venue match by google_place_id
    mockDb.query.venues.findFirst.mockResolvedValueOnce({ id: 10, name: 'Test Bar', google_place_id: 'ChIJtest123' });

    // enrichVenue calls db.update
    const updateMock = makeUpdateMock();

    const place = makePlaceResult();
    const result = await processPlaceResult(place, 'NS', 'Halifax', []);
    expect(result).toBe('enriched');
    expect(updateMock.setMock).toHaveBeenCalled();
  });

  it('returns enriched when fuzzy match returns merge, calls enrichVenue', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);
    // No google_place_id match in venues

    const provinceVenues = [makeVenueRow({ id: 20, name: 'The Test Bar' })];
    mockScoreVenueCandidate.mockReturnValueOnce({ action: 'merge' });

    // enrichVenue calls db.update
    const updateMock = makeUpdateMock();

    const place = makePlaceResult();
    const result = await processPlaceResult(place, 'NS', 'Halifax', provinceVenues);
    expect(result).toBe('enriched');
    expect(mockScoreVenueCandidate).toHaveBeenCalledWith(
      { name: 'The Test Bar', lat: 44.6488, lng: -63.5752 },
      { name: 'The Test Bar', lat: 44.6488, lng: -63.5752 }
    );
    expect(updateMock.setMock).toHaveBeenCalled();
  });

  it('returns staged_review when fuzzy match returns review, stages as pending with raw_context', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);

    const provinceVenues = [makeVenueRow({ id: 30, name: 'Near Match Bar' })];
    mockScoreVenueCandidate.mockReturnValueOnce({ action: 'review', reason: 'name_match_no_geo' });

    // Insert into discovered_sources
    const { valuesMock, onConflictMock } = makeInsertMock();

    const place = makePlaceResult();
    const result = await processPlaceResult(place, 'NS', 'Halifax', provinceVenues);
    expect(result).toBe('staged_review');

    const insertArgs = valuesMock.mock.calls[0][0];
    expect(insertArgs.status).toBe('pending');
    expect(insertArgs.raw_context).toContain('Near Match Bar');
    expect(insertArgs.discovery_method).toBe('google_places');
  });

  it('returns staged_pending for no match with websiteUri', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);
    mockScoreVenueCandidate.mockReturnValue({ action: 'keep_separate' });

    const { valuesMock } = makeInsertMock();

    const place = makePlaceResult({ websiteUri: 'https://testbar.ca', types: ['bar'] });
    const result = await processPlaceResult(place, 'NS', 'Halifax', [makeVenueRow()]);
    expect(result).toBe('staged_pending');

    const insertArgs = valuesMock.mock.calls[0][0];
    expect(insertArgs.status).toBe('pending');
    expect(insertArgs.url).toBe('https://testbar.ca');
    expect(insertArgs.domain).toBe('testbar.ca');
    expect(insertArgs.discovery_method).toBe('google_places');
    expect(insertArgs.google_place_id).toBe('ChIJtest123');
    expect(insertArgs.lat).toBe(44.6488);
    expect(insertArgs.lng).toBe(-63.5752);
    expect(insertArgs.address).toBe('123 Test St, Halifax, NS B3H 1A1');
    expect(insertArgs.place_types).toBe(JSON.stringify(['bar']));
  });

  it('returns staged_no_website for no match without websiteUri, uses synthetic URL and google-places domain', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);
    mockScoreVenueCandidate.mockReturnValue({ action: 'keep_separate' });

    const { valuesMock } = makeInsertMock();

    const place = makePlaceResult({ websiteUri: undefined, types: ['bar'] });
    const result = await processPlaceResult(place, 'NS', 'Halifax', [makeVenueRow()]);
    expect(result).toBe('staged_no_website');

    const insertArgs = valuesMock.mock.calls[0][0];
    expect(insertArgs.status).toBe('no_website');
    expect(insertArgs.url).toBe('places:ChIJtest123');
    expect(insertArgs.domain).toBe('google-places');
    expect(insertArgs.google_place_id).toBe('ChIJtest123');
  });

  it('sets discovery_method=google_places and google_place_id on all inserts', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);
    mockScoreVenueCandidate.mockReturnValue({ action: 'keep_separate' });

    const { valuesMock } = makeInsertMock();

    const place = makePlaceResult();
    await processPlaceResult(place, 'NS', 'Halifax', [makeVenueRow()]);

    const insertArgs = valuesMock.mock.calls[0][0];
    expect(insertArgs.discovery_method).toBe('google_places');
    expect(insertArgs.google_place_id).toBe('ChIJtest123');
  });

  it('sets discovery_score from scorePlacesCandidate', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.venues.findFirst.mockResolvedValueOnce(undefined);
    mockScoreVenueCandidate.mockReturnValue({ action: 'keep_separate' });

    const { valuesMock } = makeInsertMock();

    const place = makePlaceResult({ types: ['bar'] }); // bar = 0.85
    await processPlaceResult(place, 'NS', 'Halifax', [makeVenueRow()]);

    const insertArgs = valuesMock.mock.calls[0][0];
    expect(insertArgs.discovery_score).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// enrichVenue tests
// ---------------------------------------------------------------------------

describe('enrichVenue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls db.update to backfill google_place_id and address on venue', async () => {
    const updateMock = makeUpdateMock();
    const place = makePlaceResult();
    await enrichVenue(10, place);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const setArgs = updateMock.setMock.mock.calls[0][0];
    expect(setArgs.google_place_id).toBe('ChIJtest123');
    expect(setArgs.address).toBe('123 Test St, Halifax, NS B3H 1A1');
  });
});

// ---------------------------------------------------------------------------
// runPlacesDiscovery tests
// ---------------------------------------------------------------------------

describe('runPlacesDiscovery', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-key', PLACES_THROTTLE_MS: '0' };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    } as Response);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('loads province venues once before processing cities', async () => {
    // Mock select for venues query (load province venues)
    const whereMock = jest.fn().mockResolvedValue([]);
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });

    // Mock select for auto-approve query
    // (second call returns empty)
    mockDb.select
      .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }) // provinces query
      .mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }); // auto-approve

    const result = await runPlacesDiscovery([
      { city: 'Halifax', province: 'NS' },
      { city: 'Dartmouth', province: 'NS' },
    ]);

    expect(result.citiesSearched).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('catches per-city errors without aborting the run', async () => {
    // Make fetch fail for all cities
    jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) } as Response);

    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
    });

    const result = await runPlacesDiscovery([
      { city: 'Halifax', province: 'NS' },
      { city: 'Dartmouth', province: 'NS' },
    ]);

    expect(result.errors).toBe(1);
    expect(result.citiesSearched).toBe(2);
  });

  it('fires promoteSource for pending records scoring >= PLACES_AUTO_APPROVE', async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }), // province venues
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { id: 101, discovery_score: 0.85, status: 'pending', discovery_method: 'google_places' },
            { id: 102, discovery_score: 0.85, status: 'pending', discovery_method: 'google_places' },
          ]),
        }), // auto-approve candidates
      });

    mockPromoteSource.mockResolvedValue(undefined);

    const result = await runPlacesDiscovery([{ city: 'Halifax', province: 'NS' }]);

    expect(mockPromoteSource).toHaveBeenCalledTimes(2);
    expect(result.autoApproved).toBe(2);
  });

  it('returns DiscoveryRunResult with all expected fields', async () => {
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
    });

    const result = await runPlacesDiscovery([{ city: 'Halifax', province: 'NS' }]);

    expect(result).toHaveProperty('citiesSearched');
    expect(result).toHaveProperty('candidatesFound');
    expect(result).toHaveProperty('enriched');
    expect(result).toHaveProperty('stagedPending');
    expect(result).toHaveProperty('stagedNoWebsite');
    expect(result).toHaveProperty('autoApproved');
    expect(result).toHaveProperty('errors');
  });
});
