// Set throttle env vars before module load so constants are initialized to 0
process.env.SCRAPE_THROTTLE_MS = '0';
process.env.HTTP_THROTTLE_MS = '0';
process.env.SCRAPE_STALE_HOURS = '4';

// Mock modules before importing anything that uses them
jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      scrape_sources: { findMany: jest.fn() },
      venues: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    update: jest.fn(),
  },
}));

jest.mock('./fetcher', () => ({
  fetchAndPreprocess: jest.fn(),
}));

jest.mock('./extractor', () => ({
  extractEvents: jest.fn(),
}));

jest.mock('./json-ld', () => ({
  extractJsonLdEvents: jest.fn(),
}));

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn(),
}));

jest.mock('./geocoder', () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock('./eventbrite', () => ({
  scrapeEventbrite: jest.fn(),
}));

jest.mock('./bandsintown', () => ({
  scrapeBandsintown: jest.fn(),
}));

jest.mock('./ticketmaster', () => ({
  scrapeTicketmaster: jest.fn(),
}));

import { db } from '@/lib/db/client';
import { fetchAndPreprocess } from './fetcher';
import { extractEvents } from './extractor';
import { extractJsonLdEvents } from './json-ld';
import { upsertEvent } from './normalizer';
import { geocodeAddress } from './geocoder';
import { scrapeEventbrite } from './eventbrite';
import { scrapeBandsintown } from './bandsintown';
import { scrapeTicketmaster } from './ticketmaster';
import { runScrapeJob, runScrapeForProvince } from './orchestrator';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

const mockDb = db as jest.Mocked<typeof db>;
const mockFetchAndPreprocess = fetchAndPreprocess as jest.MockedFunction<typeof fetchAndPreprocess>;
const mockExtractEvents = extractEvents as jest.MockedFunction<typeof extractEvents>;
const mockExtractJsonLdEvents = extractJsonLdEvents as jest.MockedFunction<typeof extractJsonLdEvents>;
const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;
const mockGeocodeAddress = geocodeAddress as jest.MockedFunction<typeof geocodeAddress>;
const mockScrapeEventbrite = scrapeEventbrite as jest.MockedFunction<typeof scrapeEventbrite>;
const mockScrapeBandsintown = scrapeBandsintown as jest.MockedFunction<typeof scrapeBandsintown>;
const mockScrapeTicketmaster = scrapeTicketmaster as jest.MockedFunction<typeof scrapeTicketmaster>;

// Helper to build db.update mock chain
function mockUpdateChain() {
  const whereFn = jest.fn().mockResolvedValue([]);
  const setFn = jest.fn().mockReturnValue({ where: whereFn });
  const updateFn = jest.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn };
}

const mockVenue = {
  id: 10,
  name: 'Test Venue',
  address: '123 Main St',
  city: 'Moncton',
  province: 'NB',
  lat: 46.0878,
  lng: -64.7782,
  website: 'https://testvenue.com',
  venue_type: 'pub',
  google_place_id: null,
  created_at: new Date(),
};

const mockVenueWebsiteSource = {
  id: 1,
  url: 'https://testvenue.com/events',
  venue_id: 10,
  scrape_frequency: 'daily',
  last_scraped_at: null,
  last_scrape_status: 'pending',
  source_type: 'venue_website',
  enabled: true,
  max_pages: 1,
  last_event_count: null,
  avg_confidence: null,
  consecutive_failures: 0,
  total_scrapes: 0,
  total_events_extracted: 0,
  created_at: new Date(),
};

const mockEventbriteSource = {
  id: 2,
  url: 'eventbrite:org:12345',
  venue_id: 10,
  scrape_frequency: 'daily',
  last_scraped_at: null,
  last_scrape_status: 'pending',
  source_type: 'eventbrite',
  enabled: true,
  max_pages: 1,
  last_event_count: null,
  avg_confidence: null,
  consecutive_failures: 0,
  total_scrapes: 0,
  total_events_extracted: 0,
  created_at: new Date(),
};

const mockBandsinTownSource = {
  id: 3,
  url: 'bandsintown:artist:testband',
  venue_id: 10,
  scrape_frequency: 'daily',
  last_scraped_at: null,
  last_scrape_status: 'pending',
  source_type: 'bandsintown',
  enabled: true,
  max_pages: 1,
  last_event_count: null,
  avg_confidence: null,
  consecutive_failures: 0,
  total_scrapes: 0,
  total_events_extracted: 0,
  created_at: new Date(),
};

const mockTicketmasterSource = {
  id: 4,
  url: 'ticketmaster:province:NB',
  venue_id: 10,
  scrape_frequency: 'daily',
  last_scraped_at: null,
  last_scrape_status: 'pending',
  source_type: 'ticketmaster',
  enabled: true,
  max_pages: 1,
  last_event_count: null,
  avg_confidence: null,
  consecutive_failures: 0,
  total_scrapes: 0,
  total_events_extracted: 0,
  created_at: new Date(),
};

const mockExtractedEvents: ExtractedEvent[] = [
  { performer: 'Band A', event_date: '2026-04-01', event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.9, event_category: 'other' },
  { performer: 'Band B', event_date: '2026-04-02', event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.8, event_category: 'other' },
  { performer: 'Band C', event_date: '2026-04-03', event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.7, event_category: 'other' },
];

beforeEach(() => {
  jest.clearAllMocks();

  // Default: no JSON-LD events (force Gemini path)
  mockExtractJsonLdEvents.mockReturnValue([]);

  // Default: extract returns mock events
  mockExtractEvents.mockResolvedValue(mockExtractedEvents);

  // Default: fetch returns text + html
  mockFetchAndPreprocess.mockResolvedValue({
    text: '<html>events page</html>',
    rawHtml: '<html>events page</html>',
  });

  // Default: upsert succeeds
  mockUpsertEvent.mockResolvedValue(undefined);

  // Default: geocode returns null (venue already has coords)
  mockGeocodeAddress.mockResolvedValue(null);

  // Default: eventbrite/bandsintown/ticketmaster succeed
  mockScrapeEventbrite.mockResolvedValue(undefined);
  mockScrapeBandsintown.mockResolvedValue(undefined);
  mockScrapeTicketmaster.mockResolvedValue(undefined);

  // Default: venues.findMany returns mock venue for NB
  (mockDb.query.venues.findMany as jest.MockedFunction<typeof mockDb.query.venues.findMany>).mockResolvedValue([mockVenue]);

  // Default: scrape_sources.findMany returns venue_website source
  (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([mockVenueWebsiteSource]);

  // Default: db.update chain
  const { updateFn } = mockUpdateChain();
  mockDb.update = updateFn;
});

describe('runScrapeForProvince — metric writes on success (venue_website)', () => {
  it('Test 1: sets last_event_count to extracted event count on success', async () => {
    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.last_event_count).toBe(3); // mockExtractedEvents.length
  });

  it('Test 2: sets avg_confidence to mean of extracted confidence values on success', async () => {
    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    // (0.9 + 0.8 + 0.7) / 3 = 0.8
    expect(setCall.avg_confidence).toBeCloseTo(0.8, 5);
  });

  it('Test 3: resets consecutive_failures to 0 on success', async () => {
    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.consecutive_failures).toBe(0);
  });

  it('Test 4: increments total_scrapes via sql expression on success', async () => {
    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    // sql`total_scrapes + 1` produces a SQL expression object
    expect(setCall.total_scrapes).toBeDefined();
    // Check it's a SQL expression (not a plain number)
    const str = JSON.stringify(setCall.total_scrapes);
    expect(str).toContain('total_scrapes');
  });

  it('Test 5: increments total_events_extracted by event count on success', async () => {
    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    const str = JSON.stringify(setCall.total_events_extracted);
    expect(str).toContain('total_events_extracted');
    // The value 3 should appear in the SQL expression (3 events extracted)
    expect(str).toContain('3');
  });
});

describe('runScrapeForProvince — metric writes on failure', () => {
  it('Test 6: increments consecutive_failures via sql expression on failure', async () => {
    mockFetchAndPreprocess.mockRejectedValue(new Error('Network error'));

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    const str = JSON.stringify(setCall.consecutive_failures);
    expect(str).toContain('consecutive_failures');
  });

  it('Test 7: does NOT include last_event_count or avg_confidence in failure write', async () => {
    mockFetchAndPreprocess.mockRejectedValue(new Error('Network error'));

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.last_event_count).toBeUndefined();
    expect(setCall.avg_confidence).toBeUndefined();
  });

  it('Test 8: still increments total_scrapes on failure', async () => {
    mockFetchAndPreprocess.mockRejectedValue(new Error('Network error'));

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    const str = JSON.stringify(setCall.total_scrapes);
    expect(str).toContain('total_scrapes');
  });
});

describe('runScrapeForProvince — metric writes for non-venue_website sources', () => {
  it('Test 9: eventbrite source — last_event_count is null in success write (handlers return void)', async () => {
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([mockEventbriteSource]);

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.last_event_count).toBeNull();
    expect(setCall.avg_confidence).toBeNull();
  });

  it('Test 10: bandsintown source — last_event_count is null in success write (handlers return void)', async () => {
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([mockBandsinTownSource]);

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.last_event_count).toBeNull();
    expect(setCall.avg_confidence).toBeNull();
  });

  it('Test 11: ticketmaster source — scrapeTicketmaster is called with the source', async () => {
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([mockTicketmasterSource]);

    await runScrapeForProvince('NB');

    expect(mockScrapeTicketmaster).toHaveBeenCalledTimes(1);
    expect(mockScrapeTicketmaster).toHaveBeenCalledWith(mockTicketmasterSource);
  });

  it('Test 12: ticketmaster source — last_event_count is null in success write (handler returns void)', async () => {
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([mockTicketmasterSource]);

    await runScrapeForProvince('NB');

    const setCall = (mockDb.update as jest.MockedFunction<typeof mockDb.update>).mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.last_event_count).toBeNull();
    expect(setCall.avg_confidence).toBeNull();
  });
});

describe('runScrapeForProvince — skips recently scraped sources', () => {
  it('Test 13: skips sources scraped within the stale threshold', async () => {
    const recentSource = {
      ...mockVenueWebsiteSource,
      last_scraped_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago (within 4h threshold)
    };
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([recentSource]);

    const result = await runScrapeForProvince('NB');

    expect(result.skipped).toBe(1);
    expect(result.success).toBe(0);
    expect(mockFetchAndPreprocess).not.toHaveBeenCalled();
  });

  it('Test 14: scrapes sources older than the stale threshold', async () => {
    const staleSource = {
      ...mockVenueWebsiteSource,
      last_scraped_at: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago (past 4h threshold)
    };
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([staleSource]);

    const result = await runScrapeForProvince('NB');

    expect(result.skipped).toBe(0);
    expect(result.success).toBe(1);
    expect(mockFetchAndPreprocess).toHaveBeenCalledTimes(1);
  });

  it('Test 15: scrapes sources that have never been scraped (last_scraped_at is null)', async () => {
    const result = await runScrapeForProvince('NB');

    expect(result.skipped).toBe(0);
    expect(result.success).toBe(1);
    expect(mockFetchAndPreprocess).toHaveBeenCalledTimes(1);
  });
});

describe('runScrapeForProvince — province filtering', () => {
  it('Test 16: returns empty result for province with no venues', async () => {
    (mockDb.query.venues.findMany as jest.MockedFunction<typeof mockDb.query.venues.findMany>).mockResolvedValue([]);

    const result = await runScrapeForProvince('PEI');

    expect(result.province).toBe('PEI');
    expect(result.success).toBe(0);
    expect(result.events).toBe(0);
  });

  it('Test 17: only scrapes sources matching the province venues', async () => {
    const otherProvinceSource = { ...mockVenueWebsiteSource, id: 99, venue_id: 999 };
    (mockDb.query.scrape_sources.findMany as jest.MockedFunction<typeof mockDb.query.scrape_sources.findMany>).mockResolvedValue([
      mockVenueWebsiteSource,
      otherProvinceSource,
    ]);

    const result = await runScrapeForProvince('NB');

    // Only the source with venue_id=10 (matching mockVenue.id) should be scraped
    expect(result.success).toBe(1);
    expect(mockFetchAndPreprocess).toHaveBeenCalledTimes(1);
  });
});

describe('runScrapeJob — runs all provinces concurrently', () => {
  it('Test 18: returns results for all 4 provinces', async () => {
    const results = await runScrapeJob();

    expect(results).toHaveLength(4);
    expect(results.map((r) => r.province)).toEqual(['NS', 'NB', 'PEI', 'NL']);
  });
});
