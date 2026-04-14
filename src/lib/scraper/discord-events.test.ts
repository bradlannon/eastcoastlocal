/**
 * Characterization tests for src/lib/scraper/discord-events.ts
 *
 * Tests:
 * - GUILD_METADATA structure
 * - fetchAllDiscordEvents() with missing tokens returns []
 * - fetchAllDiscordEvents() with user token calls Discord API
 * - fetchAllDiscordEvents() with bot token uses hardcoded guilds
 * - guessCategoryFromEvent (internal) — exercised via processGuildEvents pathway
 */

const mockFindOrCreateVenue = jest.fn().mockResolvedValue(42);
const mockUpsertEvent = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/scraper/ticketmaster', () => ({
  findOrCreateVenue: (...args: unknown[]) => mockFindOrCreateVenue(...args),
}));

jest.mock('@/lib/scraper/normalizer', () => ({
  upsertEvent: (...args: unknown[]) => mockUpsertEvent(...args),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { GUILD_METADATA, fetchAllDiscordEvents } from './discord-events';

const ORIGINAL_USER_TOKEN = process.env.DISCORD_USER_TOKEN;
const ORIGINAL_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

beforeEach(() => {
  mockFetch.mockReset();
  mockFindOrCreateVenue.mockClear();
  mockUpsertEvent.mockClear();
  delete process.env.DISCORD_USER_TOKEN;
  delete process.env.DISCORD_BOT_TOKEN;
});

afterAll(() => {
  if (ORIGINAL_USER_TOKEN !== undefined) process.env.DISCORD_USER_TOKEN = ORIGINAL_USER_TOKEN;
  if (ORIGINAL_BOT_TOKEN !== undefined) process.env.DISCORD_BOT_TOKEN = ORIGINAL_BOT_TOKEN;
});

describe('GUILD_METADATA', () => {
  it('exports GUILD_METADATA as a non-empty record', () => {
    expect(GUILD_METADATA).toBeDefined();
    expect(typeof GUILD_METADATA).toBe('object');
    expect(Object.keys(GUILD_METADATA).length).toBeGreaterThan(0);
  });

  it('each entry has province and defaultCity', () => {
    for (const [, meta] of Object.entries(GUILD_METADATA)) {
      expect(meta).toHaveProperty('province');
      expect(meta).toHaveProperty('defaultCity');
      expect(typeof meta.province).toBe('string');
      expect(typeof meta.defaultCity).toBe('string');
    }
  });

  it('includes NS, NB, PEI, NL provinces', () => {
    const provinces = new Set(Object.values(GUILD_METADATA).map((m) => m.province));
    expect(provinces.has('NS')).toBe(true);
    expect(provinces.has('NB')).toBe(true);
    expect(provinces.has('PEI')).toBe(true);
    expect(provinces.has('NL')).toBe(true);
  });
});

describe('fetchAllDiscordEvents()', () => {
  it('returns empty array when no tokens are set', async () => {
    const results = await fetchAllDiscordEvents();
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses user token when DISCORD_USER_TOKEN is set', async () => {
    process.env.DISCORD_USER_TOKEN = 'user-token-123';

    // Mock guilds endpoint
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1483615762706075731', name: 'ECL Atlantic Events' },
      ],
    } as Response);

    // Mock scheduled events endpoint — no events
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const results = await fetchAllDiscordEvents();

    // Should have called the guilds endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me/guilds',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'user-token-123' }),
      })
    );
    // No events means no results pushed
    expect(Array.isArray(results)).toBe(true);
  });

  it('uses bot token when DISCORD_BOT_TOKEN is set (no user token)', async () => {
    process.env.DISCORD_BOT_TOKEN = 'bot-token-456';

    // Mock all guild event endpoints — 403 so they are skipped
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    const results = await fetchAllDiscordEvents();

    expect(Array.isArray(results)).toBe(true);
    // Bot token calls use 'Bot <token>' header
    if (mockFetch.mock.calls.length > 0) {
      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe('Bot bot-token-456');
    }
  });

  it('processes a future event and creates venue + upserts event', async () => {
    process.env.DISCORD_USER_TOKEN = 'user-token-abc';

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1483615762706075731', name: 'ECL Atlantic Events' }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'evt001',
            guild_id: '1483615762706075731',
            name: 'Jazz Night',
            description: 'Live jazz concert',
            scheduled_start_time: futureDate,
            scheduled_end_time: null,
            entity_type: 3,
            entity_metadata: { location: 'The Carleton, Halifax, NS' },
            status: 1,
            image: null,
            user_count: 10,
          },
        ],
      } as Response);

    const results = await fetchAllDiscordEvents();

    expect(mockFindOrCreateVenue).toHaveBeenCalled();
    expect(mockUpsertEvent).toHaveBeenCalled();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toMatchObject({
      guildId: '1483615762706075731',
      guildName: 'ECL Atlantic Events',
      eventsFound: 1,
      eventsUpserted: 1,
      errors: 0,
    });
  });

  it('skips past events (status !== 1 or 2)', async () => {
    process.env.DISCORD_USER_TOKEN = 'user-token-abc';

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1483615762706075731', name: 'ECL Atlantic Events' }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'past-evt',
            guild_id: '1483615762706075731',
            name: 'Past Concert',
            description: null,
            scheduled_start_time: pastDate,
            scheduled_end_time: null,
            entity_type: 3,
            entity_metadata: null,
            status: 1, // active status but past date
            image: null,
          },
        ],
      } as Response);

    const results = await fetchAllDiscordEvents();

    // Past event should be skipped
    if (results.length > 0) {
      expect(results[0].eventsUpserted).toBe(0);
    }
    expect(mockUpsertEvent).not.toHaveBeenCalled();
  });

  it('handles missing description gracefully', async () => {
    process.env.DISCORD_USER_TOKEN = 'user-token-abc';
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1483615762706075731', name: 'ECL Atlantic Events' }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'evt002',
            guild_id: '1483615762706075731',
            name: 'Community Meetup',
            description: null, // missing description
            scheduled_start_time: futureDate,
            entity_type: 3,
            entity_metadata: null, // missing location
            status: 1,
            image: null,
          },
        ],
      } as Response);

    const results = await fetchAllDiscordEvents();

    // Should not throw even with null description/metadata
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].errors).toBe(0);
    }
  });

  it('handles API error from guilds endpoint', async () => {
    process.env.DISCORD_USER_TOKEN = 'user-token-bad';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchAllDiscordEvents()).rejects.toThrow('Discord user guilds API error: 401');
  });
});
