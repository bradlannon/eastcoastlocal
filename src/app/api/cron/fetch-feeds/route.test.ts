/**
 * Characterization tests for src/app/api/cron/fetch-feeds/route.ts
 *
 * GET /api/cron/fetch-feeds:
 * - 401 without valid CRON_SECRET bearer token
 * - 200 with valid token, calls fetchAllWpEventFeeds + fetchAllDiscordEvents concurrently
 * - 500 when orchestrators throw
 * - Response aggregates totals from both feed and discord results
 */

const CRON_SECRET = 'test-cron-secret-feeds';

const mockFetchAllWpEventFeeds = jest.fn();
const mockFetchAllDiscordEvents = jest.fn();

jest.mock('@/lib/scraper/wordpress-events', () => ({
  fetchAllWpEventFeeds: (...args: unknown[]) => mockFetchAllWpEventFeeds(...args),
}));

jest.mock('@/lib/scraper/discord-events', () => ({
  fetchAllDiscordEvents: (...args: unknown[]) => mockFetchAllDiscordEvents(...args),
}));

import { GET } from './route';

const MOCK_FEED_RESULTS = [
  { name: 'Feed A', eventsFound: 5, eventsUpserted: 4, errors: 0 },
  { name: 'Feed B', eventsFound: 3, eventsUpserted: 3, errors: 0 },
];

const MOCK_DISCORD_RESULTS = [
  { guildId: 'g1', guildName: 'Guild A', eventsFound: 2, eventsUpserted: 2, errors: 0 },
];

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockFetchAllWpEventFeeds.mockReset();
  mockFetchAllDiscordEvents.mockReset();
  mockFetchAllWpEventFeeds.mockResolvedValue(MOCK_FEED_RESULTS);
  mockFetchAllDiscordEvents.mockResolvedValue(MOCK_DISCORD_RESULTS);
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/fetch-feeds', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  }) as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/cron/fetch-feeds', () => {
  describe('authentication', () => {
    it('returns 401 without authorization header', async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong bearer token', async () => {
      const res = await GET(makeRequest('Bearer wrong-token'));
      expect(res.status).toBe(401);
    });

    it('returns 401 without Bearer prefix', async () => {
      const res = await GET(makeRequest(CRON_SECRET));
      expect(res.status).toBe(401);
    });

    it('does not call feed/discord fetchers when unauthorized', async () => {
      await GET(makeRequest());
      expect(mockFetchAllWpEventFeeds).not.toHaveBeenCalled();
      expect(mockFetchAllDiscordEvents).not.toHaveBeenCalled();
    });
  });

  describe('with valid auth', () => {
    const auth = () => `Bearer ${CRON_SECRET}`;

    it('returns 200 with success:true', async () => {
      const res = await GET(makeRequest(auth()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('calls fetchAllWpEventFeeds', async () => {
      await GET(makeRequest(auth()));
      expect(mockFetchAllWpEventFeeds).toHaveBeenCalledTimes(1);
    });

    it('calls fetchAllDiscordEvents', async () => {
      await GET(makeRequest(auth()));
      expect(mockFetchAllDiscordEvents).toHaveBeenCalledTimes(1);
    });

    it('returns feeds count equal to number of feed results', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.feeds).toBe(2); // 2 feed results
    });

    it('aggregates total eventsFound from feed + discord', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      // Feed total: 5+3=8, Discord total: 2 → total: 10
      expect(body.eventsFound).toBe(10);
    });

    it('aggregates total eventsUpserted', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      // Feed: 4+3=7, Discord: 2 → total: 9
      expect(body.eventsUpserted).toBe(9);
    });

    it('includes results array in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('includes discord info when discord results exist', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.discord).toBeDefined();
      expect(body.discord.guilds).toBe(1);
    });

    it('omits discord key when no discord results', async () => {
      mockFetchAllDiscordEvents.mockResolvedValue([]);
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.discord).toBeUndefined();
    });

    it('includes timestamp in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('error handling', () => {
    it('returns 500 when fetchAllWpEventFeeds throws', async () => {
      mockFetchAllWpEventFeeds.mockRejectedValue(new Error('Feed fetch failed'));

      const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Feed fetch failed');
    });

    it('returns 500 when fetchAllDiscordEvents throws', async () => {
      mockFetchAllDiscordEvents.mockRejectedValue(new Error('Discord error'));

      const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
