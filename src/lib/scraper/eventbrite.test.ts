import { scrapeEventbrite } from './eventbrite';
import type { ScrapeSource } from '@/types';

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn().mockResolvedValue(undefined),
  normalizePerformer: jest.fn((name: string) => name.toLowerCase()),
}));

import { upsertEvent } from './normalizer';

const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;

const mockSource: ScrapeSource = {
  id: 1,
  url: 'eventbrite:org:12345678',
  venue_id: 42,
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

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
const futureDateUtc = futureDate.toISOString(); // e.g. "2026-03-21T19:00:00Z"
const futureDateLocal = futureDateUtc.replace('Z', ''); // local version without Z

const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
const pastDateUtc = pastDate.toISOString();
const pastDateLocal = pastDateUtc.replace('Z', '');

const mockEventbriteResponse = {
  events: [
    {
      id: 'evt001',
      name: { text: 'The Trews Live' },
      start: {
        utc: futureDateUtc,
        local: futureDateLocal,
      },
      url: 'https://www.eventbrite.com/e/evt001',
      description: { text: 'An amazing rock concert in Halifax.' },
      logo: { url: 'https://img.eventbrite.com/logo.jpg' },
    },
    {
      id: 'evt002',
      name: { text: 'Past Concert' },
      start: {
        utc: pastDateUtc,
        local: pastDateLocal,
      },
      url: 'https://www.eventbrite.com/e/evt002',
      description: null,
      logo: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EVENTBRITE_TOKEN = 'test-token-abc';
});

afterEach(() => {
  delete process.env.EVENTBRITE_TOKEN;
});

describe('scrapeEventbrite', () => {
  it('fetches from org-scoped endpoint with Bearer token', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEventbriteResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeEventbrite(mockSource);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.eventbriteapi.com/v3/organizations/12345678/events/?status=live&expand=venue',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-abc',
        }),
      })
    );
  });

  it('calls upsertEvent with correctly mapped fields for future events', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEventbriteResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeEventbrite(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledTimes(1);
    expect(mockUpsertEvent).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        performer: 'The Trews Live',
        event_date: futureDateUtc.slice(0, 10),
        event_time: futureDateLocal.slice(11, 16),
        price: null,
        ticket_link: 'https://www.eventbrite.com/e/evt001',
        description: 'An amazing rock concert in Halifax.',
        cover_image_url: 'https://img.eventbrite.com/logo.jpg',
        confidence: 1.0,
      }),
      'https://www.eventbrite.com/e/evt001',
      1,
      'scrape'
    );
  });

  it('skips past events', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEventbriteResponse,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeEventbrite(mockSource);

    // Only one call (future event), past event skipped
    expect(mockUpsertEvent).toHaveBeenCalledTimes(1);
  });

  it('throws on non-OK HTTP response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(scrapeEventbrite(mockSource)).rejects.toThrow();
  });

  it('handles null description and logo gracefully', async () => {
    const responseWithNulls = {
      events: [
        {
          id: 'evt003',
          name: { text: 'Minimal Event' },
          start: {
            utc: futureDateUtc,
            local: futureDateLocal,
          },
          url: 'https://www.eventbrite.com/e/evt003',
          description: null,
          logo: null,
        },
      ],
    };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => responseWithNulls,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await scrapeEventbrite(mockSource);

    expect(mockUpsertEvent).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        description: null,
        cover_image_url: null,
      }),
      'https://www.eventbrite.com/e/evt003',
      1,
      'scrape'
    );
  });
});
