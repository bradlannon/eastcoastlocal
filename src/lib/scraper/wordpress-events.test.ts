jest.mock('./ticketmaster', () => ({
  findOrCreateVenue: jest.fn(),
}));

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn(),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import {
  fetchAllWpEventFeeds,
  WP_EVENT_FEEDS,
  type WpEventFeed,
  type FeedResult,
} from './wordpress-events';

const mockFindOrCreateVenue = findOrCreateVenue as jest.MockedFunction<typeof findOrCreateVenue>;
const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreateVenue.mockResolvedValue(42);
  mockUpsertEvent.mockResolvedValue(undefined);
});

describe('WP_EVENT_FEEDS registry', () => {
  it('has entries for all expected feeds', () => {
    const ids = WP_EVENT_FEEDS.map((f) => f.id);
    expect(ids).toContain('tourism-ns');
    expect(ids).toContain('halifax-events');
    expect(ids).toContain('destination-stj');
    expect(ids).toContain('theatre-ns');
    expect(ids).toContain('dalhousie');
    expect(ids).toContain('tourism-pei');
    expect(ids).toContain('downtown-moncton');
    expect(ids).toContain('unb');
  });

  it('every feed has required fields', () => {
    for (const feed of WP_EVENT_FEEDS) {
      expect(feed.id).toBeTruthy();
      expect(feed.name).toBeTruthy();
      expect(feed.url).toMatch(/^https?:\/\//);
      expect(['tribe', 'wp-event', 'drupal-json', 'livewhale', 'rss']).toContain(feed.type);
      expect(feed.province).toMatch(/^(NS|NB|PEI|NL)$/);
    }
  });
});

describe('fetchAllWpEventFeeds — Tribe feed', () => {
  const tribeResponse = {
    events: [
      {
        id: 1,
        url: 'https://example.com/event/1',
        title: 'Jazz Night',
        description: '<p>Great music</p>',
        start_date: '2027-06-15 20:00:00',
        end_date: '2027-06-15 23:00:00',
        cost: '$15',
        website: 'https://tickets.example.com/1',
        venue: {
          venue: 'The Carleton',
          address: '1685 Argyle St',
          city: 'Halifax',
          province: 'Nova Scotia',
          country: 'Canada',
          zip: 'B3J 2B3',
        },
        categories: [{ name: 'Music', slug: 'music' }],
        image: { url: 'https://example.com/img.jpg' },
      },
    ],
    total: 1,
    total_pages: 1,
  };

  it('fetches events and upserts them', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => tribeResponse,
    });

    const results = await fetchAllWpEventFeeds(['tourism-ns']);

    expect(results).toHaveLength(1);
    expect(results[0].eventsFound).toBe(1);
    expect(results[0].eventsUpserted).toBe(1);
    expect(mockFindOrCreateVenue).toHaveBeenCalledWith(
      'The Carleton',
      'Halifax',
      'NS',
      '1685 Argyle St'
    );
    expect(mockUpsertEvent).toHaveBeenCalledTimes(1);
    const extractedArg = mockUpsertEvent.mock.calls[0][1];
    expect(extractedArg.performer).toBe('Jazz Night');
    expect(extractedArg.event_date).toBe('2027-06-15');
    expect(extractedArg.event_time).toBe('20:00');
    expect(extractedArg.price).toBe('$15');
    expect(extractedArg.event_category).toBe('live_music');
    expect(extractedArg.confidence).toBe(1.0);
  });

  it('skips past events', async () => {
    const pastEvent = {
      ...tribeResponse,
      events: [
        { ...tribeResponse.events[0], start_date: '2020-01-01 19:00:00' },
      ],
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => pastEvent });

    const results = await fetchAllWpEventFeeds(['tourism-ns']);

    expect(results[0].eventsUpserted).toBe(0);
    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });

  it('skips events with no venue', async () => {
    const noVenue = {
      ...tribeResponse,
      events: [{ ...tribeResponse.events[0], venue: { venue: '' } }],
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => noVenue });

    const results = await fetchAllWpEventFeeds(['tourism-ns']);

    expect(results[0].eventsUpserted).toBe(0);
  });

  it('strips HTML from title and description', async () => {
    const htmlEvent = {
      ...tribeResponse,
      events: [
        {
          ...tribeResponse.events[0],
          title: '<b>Jazz &amp; Blues</b>',
          description: '<p>Come enjoy <em>great</em> music!</p>',
        },
      ],
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => htmlEvent });

    await fetchAllWpEventFeeds(['tourism-ns']);

    const extractedArg = mockUpsertEvent.mock.calls[0][1];
    expect(extractedArg.performer).toBe('Jazz & Blues');
    expect(extractedArg.description).toBe('Come enjoy great music!');
  });
});

describe('fetchAllWpEventFeeds — LiveWhale feed', () => {
  const liveWhaleEvents = [
    {
      id: 100,
      title: 'Guest Lecture: AI Ethics',
      description: 'A talk on AI',
      date_utc: '2027-09-15 14:00:00',
      location: 'Student Union Building, Halifax',
      url: 'https://events.dal.ca/event/100',
      event_types: ['lecture'],
    },
  ];

  it('fetches and upserts LiveWhale events', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => liveWhaleEvents });

    const results = await fetchAllWpEventFeeds(['dalhousie']);

    expect(results).toHaveLength(1);
    expect(results[0].eventsUpserted).toBe(1);
    expect(mockFindOrCreateVenue).toHaveBeenCalledWith(
      'Student Union Building',
      'Halifax',
      'NS',
      'Student Union Building, Halifax'
    );
  });
});

describe('fetchAllWpEventFeeds — RSS feed', () => {
  const rssXml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>UNB Events</title>
<item><title>Jazz Concert</title><link>https://unb.ca/event/1</link><description>Live jazz at the SUB</description><pubDate>Fri, 15 Jun 2027 20:00:00 GMT</pubDate></item>
<item><title>Old Event</title><link>https://unb.ca/event/2</link><description>Past</description><pubDate>Mon, 01 Jan 2020 10:00:00 GMT</pubDate></item>
</channel></rss>`;

  it('parses RSS items and skips past events', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => rssXml, json: async () => ({}) });

    const results = await fetchAllWpEventFeeds(['unb']);

    expect(results).toHaveLength(1);
    expect(results[0].eventsFound).toBe(2);
    expect(results[0].eventsUpserted).toBe(1); // past event skipped
    expect(mockFindOrCreateVenue).toHaveBeenCalledWith(
      'University of New Brunswick',
      'Fredericton',
      'NB',
      'University of New Brunswick, Fredericton'
    );
    const extracted = mockUpsertEvent.mock.calls[0][1];
    expect(extracted.performer).toBe('Jazz Concert');
    expect(extracted.event_date).toBe('2027-06-15');
  });
});

describe('fetchAllWpEventFeeds — error handling', () => {
  it('returns error result when a feed HTTP request fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const results = await fetchAllWpEventFeeds(['tourism-ns']);

    expect(results).toHaveLength(1);
    expect(results[0].errors).toBe(1);
    expect(results[0].eventsUpserted).toBe(0);
  });

  it('handles individual event errors without stopping the feed', async () => {
    const twoEvents = {
      events: [
        {
          id: 1,
          url: 'https://example.com/1',
          title: 'Event 1',
          description: '',
          start_date: '2027-06-15 20:00:00',
          end_date: '2027-06-15 23:00:00',
          cost: '',
          website: '',
          venue: { venue: 'Venue A', address: '', city: 'Halifax', province: 'NS', country: 'CA', zip: '' },
          categories: [],
          image: false,
        },
        {
          id: 2,
          url: 'https://example.com/2',
          title: 'Event 2',
          description: '',
          start_date: '2027-06-16 20:00:00',
          end_date: '2027-06-16 23:00:00',
          cost: '',
          website: '',
          venue: { venue: 'Venue B', address: '', city: 'Halifax', province: 'NS', country: 'CA', zip: '' },
          categories: [],
          image: false,
        },
      ],
      total: 2,
      total_pages: 1,
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => twoEvents });
    mockFindOrCreateVenue
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(42);

    const results = await fetchAllWpEventFeeds(['tourism-ns']);

    expect(results[0].errors).toBe(1);
    expect(results[0].eventsUpserted).toBe(1);
  });

  it('runs all feeds concurrently and collects results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], total: 0, total_pages: 0 }),
    });

    // Fetch all feeds (they'll all return empty)
    const results = await fetchAllWpEventFeeds();

    expect(results.length).toBe(WP_EVENT_FEEDS.length);
  });
});

describe('fetchAllWpEventFeeds — filtering by feedIds', () => {
  it('only fetches specified feeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], total: 0, total_pages: 0 }),
    });

    const results = await fetchAllWpEventFeeds(['tourism-ns', 'dalhousie']);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.feedId)).toEqual(['tourism-ns', 'dalhousie']);
  });
});
