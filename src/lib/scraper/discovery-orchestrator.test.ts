// Mock modules before importing anything that uses them
jest.mock('@ai-sdk/google', () => ({
  google: Object.assign(
    jest.fn().mockReturnValue('mocked-model'),
    {
      tools: {
        googleSearch: jest.fn().mockReturnValue({ type: 'provider-defined-tool' }),
      },
    }
  ),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: {
    object: jest.fn().mockReturnValue('mocked-output-schema'),
  },
}));

jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

import { generateText } from 'ai';
import { db } from '@/lib/db/client';
import { runDiscoveryJob } from './discovery-orchestrator';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockDb = db as jest.Mocked<typeof db>;

// Helpers to build mock db chain
function mockSelectChain(rows: Array<{ url: string }>) {
  const fromFn = jest.fn().mockResolvedValue(rows);
  const selectFn = jest.fn().mockReturnValue({ from: fromFn });
  return { selectFn, fromFn };
}

function mockInsertChain() {
  const onConflictDoNothingFn = jest.fn().mockResolvedValue([]);
  const valuesFn = jest.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingFn });
  const insertFn = jest.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, onConflictDoNothingFn };
}

beforeAll(() => {
  // Set throttle to 0 so delay() calls resolve immediately in tests
  process.env.DISCOVERY_THROTTLE_MS = '0';
});

afterAll(() => {
  delete process.env.DISCOVERY_THROTTLE_MS;
});

beforeEach(() => {
  jest.clearAllMocks();

  // By default, no existing sources and no staged
  const { selectFn: selectFn1 } = mockSelectChain([]);
  mockDb.select = selectFn1;

  // Default generateText returns empty candidates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGenerateText.mockResolvedValue({ experimental_output: { candidates: [] } } as any);

  // Default insert chain
  const { insertFn } = mockInsertChain();
  mockDb.insert = insertFn;
});

describe('runDiscoveryJob', () => {
  it('Test 1: fetches existing domains from scrape_sources and discovered_sources before querying Gemini', async () => {
    const fromFn1 = jest.fn().mockResolvedValue([{ url: 'https://existingvenue.com' }]);
    const fromFn2 = jest.fn().mockResolvedValue([{ url: 'https://stagedsource.com' }]);
    let callCount = 0;
    mockDb.select = jest.fn().mockImplementation(() => ({
      from: callCount++ === 0 ? fromFn1 : fromFn2,
    }));

    await runDiscoveryJob();

    // Should query two tables before calling Gemini
    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it('Test 2: candidates with domains already in scrape_sources are skipped', async () => {
    const fromFn1 = jest.fn().mockResolvedValue([{ url: 'https://knownvenue.com/events' }]);
    const fromFn2 = jest.fn().mockResolvedValue([]);
    let callCount = 0;
    mockDb.select = jest.fn().mockImplementation(() => ({
      from: callCount++ === 0 ? fromFn1 : fromFn2,
    }));

    // Gemini returns the same domain that's already in scrape_sources
    mockGenerateText.mockResolvedValue({
      experimental_output: {
        candidates: [
          { url: 'https://knownvenue.com', name: 'Known Venue', province: 'NS', city: 'Halifax', rawContext: null },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('Test 3: candidates with domains already in discovered_sources are skipped', async () => {
    const fromFn1 = jest.fn().mockResolvedValue([]);
    const fromFn2 = jest.fn().mockResolvedValue([{ url: 'https://stagedsource.com/events' }]);
    let callCount = 0;
    mockDb.select = jest.fn().mockImplementation(() => ({
      from: callCount++ === 0 ? fromFn1 : fromFn2,
    }));

    mockGenerateText.mockResolvedValue({
      experimental_output: {
        candidates: [
          { url: 'https://stagedsource.com', name: 'Staged', province: 'NB', city: 'Moncton', rawContext: null },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('Test 4: aggregator domains are filtered out (eventbrite, bandsintown, facebook, ticketmaster)', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    mockGenerateText.mockResolvedValue({
      experimental_output: {
        candidates: [
          { url: 'https://eventbrite.com/e/event-123', name: 'Event', province: 'NS', city: 'Halifax', rawContext: null },
          { url: 'https://bandsintown.com/e/123', name: 'Band', province: 'NS', city: 'Halifax', rawContext: null },
          { url: 'https://facebook.com/events/venue', name: 'FB', province: 'NS', city: 'Halifax', rawContext: null },
          { url: 'https://ticketmaster.com/event', name: 'TM', province: 'NS', city: 'Halifax', rawContext: null },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('Test 5: valid new candidates are inserted with status=pending and discovery_method=gemini_google_search', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    // Only return candidates on the first city (Halifax) to keep test fast
    let geminiCallCount = 0;
    mockGenerateText.mockImplementation(async () => {
      geminiCallCount++;
      if (geminiCallCount === 1) {
        return {
          experimental_output: {
            candidates: [
              { url: 'https://newvenue.com/events', name: 'New Venue', province: 'NS', city: 'Halifax', rawContext: 'A great bar' },
            ],
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { experimental_output: { candidates: [] } } as any;
    });

    const { insertFn, valuesFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    expect(mockDb.insert).toHaveBeenCalled();
    const insertedValues = valuesFn.mock.calls[0][0];
    expect(insertedValues.url).toBe('https://newvenue.com/events');
    expect(insertedValues.status).toBe('pending');
    expect(insertedValues.discovery_method).toBe('gemini_google_search');
    expect(insertedValues.domain).toBe('newvenue.com');
  });

  it('Test 6: malformed URLs from Gemini are skipped without DB error', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    mockGenerateText.mockResolvedValue({
      experimental_output: {
        candidates: [
          { url: 'not-a-valid-url', name: 'Bad', province: 'NS', city: 'Halifax', rawContext: null },
          { url: '', name: 'Empty', province: 'NS', city: 'Halifax', rawContext: null },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    // Should not throw
    await expect(runDiscoveryJob()).resolves.toBeUndefined();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('Test 7: generateText is called once per city (6 calls total for ATLANTIC_CITIES)', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    await runDiscoveryJob();

    expect(mockGenerateText).toHaveBeenCalledTimes(6);
  });
});
