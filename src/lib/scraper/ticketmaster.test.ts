import { scrapeTicketmaster, findOrCreateVenue, mapTmClassification } from './ticketmaster';
import type { ScrapeSource } from '@/types';

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn().mockResolvedValue(undefined),
  normalizePerformer: jest.fn((name: string) => name.toLowerCase()),
}));

jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      venues: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(),
  },
}));

import { upsertEvent } from './normalizer';
import { db } from '@/lib/db/client';

const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;
const mockDb = db as jest.Mocked<typeof db>;

const mockSource: ScrapeSource = {
  id: 10,
  url: 'ticketmaster:province:NB',
  venue_id: 99,
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

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureDateStr = futureDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
const futureDateTimeStr = futureDate.toISOString().slice(0, 16).replace('T', 'T'); // for dateTime field

function makeTmEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tm001',
    name: 'Rock Night at Harbour Station',
    url: 'https://www.ticketmaster.com/event/tm001',
    dates: {
      start: {
        localDate: futureDateStr,
        dateTime: `${futureDateStr}T19:00:00Z`,
        timeTBA: false,
      },
    },
    images: [
      { url: 'https://s1.ticketimg.com/4_3.jpg', ratio: '4_3' },
      { url: 'https://s1.ticketimg.com/16_9.jpg', ratio: '16_9' },
    ],
    priceRanges: [{ min: 25, max: 50, currency: 'CAD' }],
    classifications: [
      { segment: { name: 'Music' }, genre: { name: 'Rock' } },
    ],
    _embedded: {
      venues: [
        {
          name: 'Harbour Station',
          address: { line1: '99 Station St' },
          city: { name: 'Saint John' },
          state: { stateCode: 'NB' },
        },
      ],
      attractions: [{ name: 'The Trews' }],
    },
    ...overrides,
  };
}

function makeTmResponse(events: unknown[] = [makeTmEvent()]) {
  return {
    _embedded: { events },
    page: { totalPages: 1, number: 0 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETMASTER_API_KEY = 'test-tm-key';

  // Default: venue not found (triggers insert)
  (mockDb.query.venues.findFirst as jest.Mock).mockResolvedValue(null);

  // Default: insert returns a new id
  const mockReturning = jest.fn().mockResolvedValue([{ id: 101 }]);
  const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
  (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });
});

afterEach(() => {
  delete process.env.TICKETMASTER_API_KEY;
});

// ─── scrapeTicketmaster ────────────────────────────────────────────────────

describe('scrapeTicketmaster', () => {
  it('fetches TM API with correct params: countryCode=CA, stateCode from URL, size=200, date window', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('app.ticketmaster.com/discovery/v2/events.json');
    expect(calledUrl).toContain('countryCode=CA');
    expect(calledUrl).toContain('stateCode=NB');
    expect(calledUrl).toContain('size=200');
    expect(calledUrl).toContain('apikey=test-tm-key');
    expect(calledUrl).toContain('startDateTime=');
    expect(calledUrl).toContain('endDateTime=');
  });

  it('throws on non-OK HTTP response with status and stateCode in message', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(scrapeTicketmaster(mockSource)).rejects.toThrow(/429/);
    await expect(scrapeTicketmaster(mockSource)).rejects.toThrow(/NB/);
  });

  it('calls upsertEvent for each event with confidence=1.0', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([makeTmEvent(), makeTmEvent({ id: 'tm002', url: 'https://www.ticketmaster.com/event/tm002' })]),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledTimes(2);
    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ confidence: 1.0 }),
      expect.any(String)
    );
  });

  it('passes event.url as sourceUrl (3rd arg) for attribution — PLAT-03', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Object),
      'https://www.ticketmaster.com/event/tm001'
    );
  });

  it('passes event.url as ticket_link in ExtractedEvent — PLAT-03', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ ticket_link: 'https://www.ticketmaster.com/event/tm001' }),
      expect.any(String)
    );
  });

  it('skips events with no embedded venue', async () => {
    const eventNoVenue = {
      ...makeTmEvent(),
      _embedded: { attractions: [{ name: 'Some Artist' }] }, // no venues key
    };
    const eventWithVenueEmptyArray = {
      ...makeTmEvent({ id: 'tm002' }),
      _embedded: { venues: [] },
    };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([eventNoVenue, eventWithVenueEmptyArray]),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });

  it('prefers attractions[0].name as performer, falls back to event.name', async () => {
    const eventWithAttraction = makeTmEvent();
    const eventWithoutAttraction = {
      ...makeTmEvent({ id: 'tm002' }),
      _embedded: {
        venues: [makeTmEvent()._embedded!.venues![0]],
        // no attractions
      },
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([eventWithAttraction, eventWithoutAttraction]),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    const calls = mockUpsertEvent.mock.calls;
    expect((calls[0][1] as { performer: string }).performer).toBe('The Trews');
    expect((calls[1][1] as { performer: string }).performer).toBe('Rock Night at Harbour Station');
  });

  it('extracts time from dateTime ISO string (slice 11:16)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ event_time: '19:00' }),
      expect.any(String)
    );
  });

  it('sets event_time to null when timeTBA is true', async () => {
    const timeTbaEvent = {
      ...makeTmEvent(),
      dates: { start: { localDate: futureDateStr, dateTime: `${futureDateStr}T19:00:00Z`, timeTBA: true } },
    };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([timeTbaEvent]),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ event_time: null }),
      expect.any(String)
    );
  });

  it('formats price as "$X+" from priceRanges[0].min', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ price: '$25+' }),
      expect.any(String)
    );
  });

  it('sets price to null when priceRanges is absent', async () => {
    const eventNoPrice = { ...makeTmEvent() };
    delete (eventNoPrice as Record<string, unknown>).priceRanges;

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([eventNoPrice]),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ price: null }),
      expect.any(String)
    );
  });

  it('picks 16:9 ratio image when available, falls back to first image', async () => {
    // With 16_9 image (default makeTmEvent has it)
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ cover_image_url: 'https://s1.ticketimg.com/16_9.jpg' }),
      expect.any(String)
    );

    jest.clearAllMocks();
    (mockDb.query.venues.findFirst as jest.Mock).mockResolvedValue(null);
    const mockReturning = jest.fn().mockResolvedValue([{ id: 101 }]);
    const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
    (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

    // Without 16_9 image — should fall back to first
    const eventNo169 = {
      ...makeTmEvent(),
      images: [
        { url: 'https://s1.ticketimg.com/4_3.jpg', ratio: '4_3' },
        { url: 'https://s1.ticketimg.com/3_2.jpg', ratio: '3_2' },
      ],
    };
    const mockFetch2 = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => makeTmResponse([eventNo169]),
    });
    global.fetch = mockFetch2 as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ cover_image_url: 'https://s1.ticketimg.com/4_3.jpg' }),
      expect.any(String)
    );
  });

  it('handles empty events array gracefully (no upsertEvent calls)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { events: [] }, page: { totalPages: 0, number: 0 } }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });

  it('handles response with no _embedded key gracefully', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ page: { totalPages: 0, number: 0 } }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeTicketmaster(mockSource);

    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });
});

// ─── findOrCreateVenue ────────────────────────────────────────────────────

describe('findOrCreateVenue', () => {
  it('returns existing venue.id when ILIKE name + exact city matches', async () => {
    (mockDb.query.venues.findFirst as jest.Mock).mockResolvedValue({ id: 42 });

    const result = await findOrCreateVenue('Harbour Station', 'Saint John', 'NB', '99 Station St');

    expect(result).toBe(42);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts new venue (name, address, city, province) when no match found, returns new id', async () => {
    (mockDb.query.venues.findFirst as jest.Mock).mockResolvedValue(null);

    const mockReturning = jest.fn().mockResolvedValue([{ id: 77 }]);
    const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
    (mockDb.insert as jest.Mock).mockReturnValue({ values: mockValues });

    const result = await findOrCreateVenue('New Arena', 'Moncton', 'NB', '1 Arena Blvd');

    expect(result).toBe(77);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Arena',
        city: 'Moncton',
        province: 'NB',
        address: '1 Arena Blvd',
      })
    );
  });
});

// ─── mapTmClassification ─────────────────────────────────────────────────

describe('mapTmClassification', () => {
  it('maps Music segment to live_music', () => {
    expect(mapTmClassification([{ segment: { name: 'Music' }, genre: { name: 'Rock' } }])).toBe('live_music');
  });

  it('maps Sports segment to sports', () => {
    expect(mapTmClassification([{ segment: { name: 'Sports' }, genre: { name: 'Hockey' } }])).toBe('sports');
  });

  it('maps Arts & Theatre + comedy genre to comedy', () => {
    expect(mapTmClassification([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }])).toBe('comedy');
  });

  it('maps Arts & Theatre + theatre genre to theatre', () => {
    expect(mapTmClassification([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' } }])).toBe('theatre');
  });

  it('maps Arts & Theatre + theater genre to theatre', () => {
    expect(mapTmClassification([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theater' } }])).toBe('theatre');
  });

  it('maps Arts & Theatre + other genre to arts', () => {
    expect(mapTmClassification([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Opera' } }])).toBe('arts');
  });

  it('maps Arts & Theatre with no recognized genre to arts', () => {
    expect(mapTmClassification([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Classical' } }])).toBe('arts');
  });

  it('maps Family segment to community', () => {
    expect(mapTmClassification([{ segment: { name: 'Family' }, genre: { name: 'Family' } }])).toBe('community');
  });

  it('maps Miscellaneous segment to community', () => {
    expect(mapTmClassification([{ segment: { name: 'Miscellaneous' }, genre: {} }])).toBe('community');
  });

  it('maps Film segment to arts', () => {
    expect(mapTmClassification([{ segment: { name: 'Film' }, genre: {} }])).toBe('arts');
  });

  it('maps unknown segment to other', () => {
    expect(mapTmClassification([{ segment: { name: 'Undefined' }, genre: {} }])).toBe('other');
  });

  it('maps empty classifications array to other', () => {
    expect(mapTmClassification([])).toBe('other');
  });
});
