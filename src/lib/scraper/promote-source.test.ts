import 'dotenv/config';
import { promoteSource } from './promote-source';

// Mock dotenv/config (no-op)
jest.mock('dotenv/config', () => ({}));

// Mock the db client
jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      discovered_sources: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

// Import the mocked db
import { db } from '@/lib/db/client';

// Helper to build mock discovered_source objects
function makeMockSource(overrides: Partial<{
  id: number;
  url: string;
  domain: string;
  source_name: string | null;
  province: string | null;
  city: string | null;
  status: string;
  discovery_method: string | null;
  raw_context: string | null;
  discovered_at: Date;
  reviewed_at: Date | null;
  added_to_sources_at: Date | null;
}> = {}) {
  return {
    id: 1,
    url: 'https://example.com/events',
    domain: 'example.com',
    source_name: 'Example Venue',
    province: 'NS',
    city: 'Halifax',
    status: 'pending',
    discovery_method: 'gemini',
    raw_context: null,
    discovered_at: new Date('2026-01-01'),
    reviewed_at: null,
    added_to_sources_at: null,
    ...overrides,
  };
}

const mockDb = db as {
  query: {
    discovered_sources: {
      findFirst: jest.Mock;
    };
  };
  insert: jest.Mock;
  update: jest.Mock;
};

describe('promoteSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Test 1: creates a venue row from staged source_name, city, province', async () => {
    const source = makeMockSource();
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    // insert for venues returns venue id
    const venueInsertMock = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 42 }]) };
    // insert for scrape_sources returns nothing meaningful
    const scrapeSourceInsertMock = { values: jest.fn().mockResolvedValue([]) };
    mockDb.insert
      .mockReturnValueOnce(venueInsertMock)
      .mockReturnValueOnce(scrapeSourceInsertMock);

    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
    mockDb.update.mockReturnValue(updateMock);

    await promoteSource(1);

    // Verify venue insert was called with correct data
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    const venueValues = venueInsertMock.values.mock.calls[0][0];
    expect(venueValues.name).toBe('Example Venue');
    expect(venueValues.city).toBe('Halifax');
    expect(venueValues.province).toBe('NS');
  });

  it('Test 2: inserts into scrape_sources with the new venue_id, source_type=venue_website, enabled=true', async () => {
    const source = makeMockSource();
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    const venueInsertMock = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 99 }]) };
    const scrapeSourceInsertMock = { values: jest.fn().mockResolvedValue([]) };
    mockDb.insert
      .mockReturnValueOnce(venueInsertMock)
      .mockReturnValueOnce(scrapeSourceInsertMock);

    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
    mockDb.update.mockReturnValue(updateMock);

    await promoteSource(1);

    const scrapeSourceValues = scrapeSourceInsertMock.values.mock.calls[0][0];
    expect(scrapeSourceValues.venue_id).toBe(99);
    expect(scrapeSourceValues.source_type).toBe('venue_website');
    expect(scrapeSourceValues.enabled).toBe(true);
    expect(scrapeSourceValues.url).toBe('https://example.com/events');
  });

  it('Test 3: updates discovered_sources status to approved with timestamps', async () => {
    const source = makeMockSource();
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    const venueInsertMock = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 7 }]) };
    const scrapeSourceInsertMock = { values: jest.fn().mockResolvedValue([]) };
    mockDb.insert
      .mockReturnValueOnce(venueInsertMock)
      .mockReturnValueOnce(scrapeSourceInsertMock);

    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
    mockDb.update.mockReturnValue(updateMock);

    const before = new Date();
    await promoteSource(1);
    const after = new Date();

    const setArgs = updateMock.set.mock.calls[0][0];
    expect(setArgs.status).toBe('approved');
    expect(setArgs.reviewed_at).toBeInstanceOf(Date);
    expect(setArgs.added_to_sources_at).toBeInstanceOf(Date);
    expect(setArgs.reviewed_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(setArgs.reviewed_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('Test 4: throws if discovered source ID does not exist', async () => {
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(undefined);

    await expect(promoteSource(999)).rejects.toThrow(/not found/i);
  });

  it('Test 5: throws if discovered source status is not pending', async () => {
    const source = makeMockSource({ status: 'approved' });
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    await expect(promoteSource(1)).rejects.toThrow(/not pending/i);
  });

  it('Test 6: when source_name is null, venue name falls back to domain', async () => {
    const source = makeMockSource({ source_name: null });
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    const venueInsertMock = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 5 }]) };
    const scrapeSourceInsertMock = { values: jest.fn().mockResolvedValue([]) };
    mockDb.insert
      .mockReturnValueOnce(venueInsertMock)
      .mockReturnValueOnce(scrapeSourceInsertMock);

    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
    mockDb.update.mockReturnValue(updateMock);

    await promoteSource(1);

    const venueValues = venueInsertMock.values.mock.calls[0][0];
    expect(venueValues.name).toBe('example.com');
  });

  it('Test 7: venue address is constructed as "city, province, Canada"', async () => {
    const source = makeMockSource();
    mockDb.query.discovered_sources.findFirst.mockResolvedValue(source);

    const venueInsertMock = { values: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 3 }]) };
    const scrapeSourceInsertMock = { values: jest.fn().mockResolvedValue([]) };
    mockDb.insert
      .mockReturnValueOnce(venueInsertMock)
      .mockReturnValueOnce(scrapeSourceInsertMock);

    const updateMock = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) };
    mockDb.update.mockReturnValue(updateMock);

    await promoteSource(1);

    const venueValues = venueInsertMock.values.mock.calls[0][0];
    expect(venueValues.address).toBe('Halifax, NS, Canada');
  });
});
