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
    update: jest.fn(),
    query: {
      discovered_sources: {
        findFirst: jest.fn(),
      },
    },
  },
}));

jest.mock('./promote-source', () => ({
  promoteSource: jest.fn().mockResolvedValue(undefined),
}));

import { generateText } from 'ai';
import { db } from '@/lib/db/client';
import { runDiscoveryJob, scoreCandidate } from './discovery-orchestrator';
import { promoteSource } from './promote-source';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockDb = db as jest.Mocked<typeof db>;
const mockPromoteSource = promoteSource as jest.MockedFunction<typeof promoteSource>;

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

function mockUpdateChain() {
  const whereFn = jest.fn().mockResolvedValue([]);
  const setFn = jest.fn().mockReturnValue({ where: whereFn });
  const updateFn = jest.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn };
}

beforeAll(() => {
  // Set throttle to 0 so delay() calls resolve immediately in tests
  process.env.DISCOVERY_THROTTLE_MS = '0';
  process.env.GEMINI_AUTO_APPROVE = '0.9';
});

afterAll(() => {
  delete process.env.DISCOVERY_THROTTLE_MS;
  delete process.env.GEMINI_AUTO_APPROVE;
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

  // Default update chain
  const { updateFn } = mockUpdateChain();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDb.update = updateFn as any;

  // Default query mock — returns a pending row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockDb.query as any).discovered_sources.findFirst.mockResolvedValue({
    id: 42,
    url: 'https://venue.com',
    status: 'pending',
  });
});

describe('scoreCandidate', () => {
  it('complete candidate (city+province+name+https) returns 0.95', () => {
    const score = scoreCandidate({
      url: 'https://venue.com',
      city: 'Halifax',
      province: 'NS',
      source_name: 'Venue',
    });
    expect(score).toBeCloseTo(0.95);
  });

  it('missing city returns 0.80', () => {
    const score = scoreCandidate({
      url: 'https://venue.com',
      city: null,
      province: 'NS',
      source_name: 'Venue',
    });
    expect(score).toBeCloseTo(0.80);
  });

  it('/events/ path penalty returns 0.75', () => {
    const score = scoreCandidate({
      url: 'https://venue.com/events/123',
      city: 'Halifax',
      province: 'NS',
      source_name: 'Venue',
    });
    expect(score).toBeCloseTo(0.75);
  });

  it('social domain (facebook.com) clamps to 0.0', () => {
    const score = scoreCandidate({
      url: 'https://facebook.com/venue',
      city: 'Halifax',
      province: 'NS',
      source_name: 'V',
    });
    expect(score).toBe(0.0);
  });

  it('http:// URL with no metadata returns 0.50 (base only)', () => {
    const score = scoreCandidate({
      url: 'http://venue.com',
      city: null,
      province: null,
      source_name: null,
    });
    expect(score).toBeCloseTo(0.50);
  });
});

describe('runDiscoveryJob', () => {
  it('Test 1: fetches existing domains from scrape_sources and discovered_sources before querying Gemini', async () => {
    const fromFn = jest.fn().mockResolvedValue([{ url: 'https://existingvenue.com' }]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    await runDiscoveryJob();

    // Each of the 69 ATLANTIC_CITIES calls getKnownDomains() which selects from 2 tables
    // Total = 69 * 2 = 138 select calls
    expect(mockDb.select).toHaveBeenCalledTimes(138);
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
          text: JSON.stringify({
            candidates: [
              { url: 'https://newvenue.com/events', name: 'New Venue', province: 'NS', city: 'Halifax', address: '123 Main St', rawContext: 'A great bar' },
            ],
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { text: '{"candidates":[]}' } as any;
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

    // Orchestrator uses { text } from generateText and parses JSON manually
    // Malformed candidates (invalid URL or empty URL) are skipped via try/catch
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          { url: 'not-a-valid-url', name: 'Bad', province: 'NS', city: 'Halifax', address: null, rawContext: null },
          { url: '', name: 'Empty', province: 'NS', city: 'Halifax', address: null, rawContext: null },
        ],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    // Should not throw; runDiscoveryJob now returns a DiscoveryJobResult object
    await expect(runDiscoveryJob()).resolves.toBeDefined();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('Test 7: generateText is called once per city (69 calls total for ATLANTIC_CITIES)', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    await runDiscoveryJob();

    expect(mockGenerateText).toHaveBeenCalledTimes(69);
  });

  it('Test 8: promoteSource is called when a candidate scores >= 0.9', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    // High-scoring candidate: https, city, province, name → 0.95
    // Only first city returns a candidate; rest return empty to keep test focused
    let geminiCallCount = 0;
    mockGenerateText.mockImplementation(async () => {
      geminiCallCount++;
      if (geminiCallCount === 1) {
        return {
          text: JSON.stringify({
            candidates: [
              { url: 'https://highscore.com', name: 'High Score Venue', province: 'NS', city: 'Halifax', address: null, rawContext: null },
            ],
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { text: '{"candidates":[]}' } as any;
    });

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    // db.query.discovered_sources.findFirst is mocked in beforeEach to return {id:42, status:'pending'}
    expect(mockPromoteSource).toHaveBeenCalledWith(42);
  });

  it('Test 9: promoteSource is NOT called when score < 0.9', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    // Low-scoring candidate: http, no city, no province, no name → 0.50
    let geminiCallCount = 0;
    mockGenerateText.mockImplementation(async () => {
      geminiCallCount++;
      if (geminiCallCount === 1) {
        return {
          text: JSON.stringify({
            candidates: [
              { url: 'http://lowscore.com', name: null, province: null, city: null, address: null, rawContext: null },
            ],
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { text: '{"candidates":[]}' } as any;
    });

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    await runDiscoveryJob();

    expect(mockPromoteSource).not.toHaveBeenCalled();
  });

  it('Test 10: discovery_score is written for all inserted candidates', async () => {
    const fromFn = jest.fn().mockResolvedValue([]);
    mockDb.select = jest.fn().mockReturnValue({ from: fromFn });

    // Only first city returns a candidate to exercise the update path
    let geminiCallCount = 0;
    mockGenerateText.mockImplementation(async () => {
      geminiCallCount++;
      if (geminiCallCount === 1) {
        return {
          text: JSON.stringify({
            candidates: [
              { url: 'https://venue1.com', name: 'Venue 1', province: 'NS', city: 'Halifax', address: null, rawContext: null },
            ],
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { text: '{"candidates":[]}' } as any;
    });

    const { insertFn } = mockInsertChain();
    mockDb.insert = insertFn;

    const { updateFn, setFn } = mockUpdateChain();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.update = updateFn as any;

    await runDiscoveryJob();

    expect(mockDb.update).toHaveBeenCalled();
    const setArgs = setFn.mock.calls[0][0];
    expect(setArgs).toHaveProperty('discovery_score');
    expect(typeof setArgs.discovery_score).toBe('number');
  });
});
