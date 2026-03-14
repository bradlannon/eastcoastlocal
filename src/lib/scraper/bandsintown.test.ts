import { scrapeBandsintown } from './bandsintown';
import type { ScrapeSource } from '@/types';

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn().mockResolvedValue(undefined),
  normalizePerformer: jest.fn((name: string) => name.toLowerCase()),
}));

import { upsertEvent } from './normalizer';

const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;

const mockSource: ScrapeSource = {
  id: 2,
  url: 'bandsintown:artist:The+Trews',
  venue_id: 55,
  scrape_frequency: 'daily',
  last_scraped_at: null,
  last_scrape_status: 'pending',
  source_type: 'bandsintown',
  enabled: true,
  created_at: new Date(),
};

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureDatetime = futureDate.toISOString().replace('.000Z', '');

const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const pastDatetime = pastDate.toISOString().replace('.000Z', '');

const mockBandsintownResponse = [
  {
    id: 'bit001',
    datetime: futureDatetime,
    url: 'https://www.bandsintown.com/e/bit001',
    description: 'Great show in Moncton!',
    venue: {
      name: 'Moncton Arena',
      city: 'Moncton',
      region: 'New Brunswick',
      country: 'Canada',
    },
    offers: [
      { type: 'Tickets', url: 'https://tickets.example.com/trews-moncton', status: 'available' },
    ],
  },
  {
    id: 'bit002',
    datetime: futureDatetime,
    url: 'https://www.bandsintown.com/e/bit002',
    description: null,
    venue: {
      name: 'Halifax Casino',
      city: 'Halifax',
      region: 'Nova Scotia',
      country: 'Canada',
    },
    offers: [],
  },
  {
    id: 'bit003',
    datetime: futureDatetime,
    url: 'https://www.bandsintown.com/e/bit003',
    description: null,
    venue: {
      name: 'Toronto Venue',
      city: 'Toronto',
      region: 'Ontario', // NOT Atlantic Canada — should be filtered out
      country: 'Canada',
    },
    offers: [],
  },
  {
    id: 'bit004',
    datetime: pastDatetime, // past event — should be skipped
    url: 'https://www.bandsintown.com/e/bit004',
    description: null,
    venue: {
      name: 'Charlottetown Club',
      city: 'Charlottetown',
      region: 'Prince Edward Island',
      country: 'Canada',
    },
    offers: [],
  },
  {
    id: 'bit005',
    datetime: futureDatetime,
    url: 'https://www.bandsintown.com/e/bit005',
    description: null,
    venue: {
      name: 'St. Johns Bar',
      city: "St. John's",
      region: 'NL', // short code for Newfoundland and Labrador
      country: 'Canada',
    },
    offers: [],
  },
  {
    id: 'bit006',
    datetime: futureDatetime,
    url: 'https://www.bandsintown.com/e/bit006',
    description: null,
    venue: {
      name: 'PEI Venue',
      city: 'Charlottetown',
      region: 'PE', // short code for PEI
      country: 'Canada',
    },
    offers: [],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BANDSINTOWN_APP_ID = 'test-app-id';
});

afterEach(() => {
  delete process.env.BANDSINTOWN_APP_ID;
});

describe('scrapeBandsintown', () => {
  it('fetches from artists endpoint with app_id in URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBandsintownResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeBandsintown(mockSource);

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('rest.bandsintown.com/artists/');
    expect(calledUrl).toContain('app_id=test-app-id');
    expect(calledUrl).toContain('date=upcoming');
  });

  it('filters to Atlantic Canada provinces only', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBandsintownResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeBandsintown(mockSource);

    // Ontario event (bit003) should be excluded
    // Past PEI event (bit004) should be excluded
    // NB (bit001), NS (bit002), NL/short (bit005), PE/short (bit006) should all pass Atlantic filter
    // but bit004 is past, so 4 total: bit001, bit002, bit005, bit006
    expect(mockUpsertEvent).toHaveBeenCalledTimes(4);
  });

  it('skips past events', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBandsintownResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeBandsintown(mockSource);

    // bit004 is in Atlantic Canada (PEI) but is in the past — should be skipped
    const calledSourceUrls = mockUpsertEvent.mock.calls.map((c) => (c as unknown[])[2]);
    expect(calledSourceUrls).not.toContain('https://www.bandsintown.com/e/bit004');
  });

  it('maps event fields correctly including offer URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBandsintownResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeBandsintown(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        performer: 'The Trews',
        event_date: futureDatetime.slice(0, 10),
        event_time: futureDatetime.slice(11, 16),
        price: null,
        ticket_link: 'https://tickets.example.com/trews-moncton',
        description: 'Great show in Moncton!',
        cover_image_url: null,
        confidence: 1.0,
      }),
      'https://www.bandsintown.com/e/bit001'
    );
  });

  it('falls back to event URL when no offers', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBandsintownResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeBandsintown(mockSource);

    // bit002 has empty offers array — should use event.url
    expect(mockUpsertEvent).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        ticket_link: 'https://www.bandsintown.com/e/bit002',
      }),
      'https://www.bandsintown.com/e/bit002'
    );
  });

  it('throws on non-OK HTTP response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(scrapeBandsintown(mockSource)).rejects.toThrow();
  });
});
