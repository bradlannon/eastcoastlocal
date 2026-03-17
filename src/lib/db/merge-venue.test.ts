/**
 * Unit tests for performVenueMerge.
 *
 * Strategy: mock the `db` client. Each DB call in the implementation is a chainable
 * Drizzle query builder. We track call order and arguments via jest mocks.
 */

import { performVenueMerge } from './merge-venue';

// ─── Mocks ────────────────────────────────────────────────────────────────

jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  events: Symbol('events'),
  event_sources: Symbol('event_sources'),
  scrape_sources: Symbol('scrape_sources'),
  venues: Symbol('venues'),
  venueMergeLog: Symbol('venueMergeLog'),
  venueMergeCandidates: Symbol('venueMergeCandidates'),
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ __eq: true, col, val })),
  inArray: jest.fn((col, vals) => ({ __inArray: true, col, vals })),
  and: jest.fn((...args) => ({ __and: true, args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: true, strings, values }),
    { raw: jest.fn((s: string) => ({ __sqlRaw: true, s })) }
  ),
}));

import { db } from '@/lib/db/client';

const mockDb = db as unknown as {
  select: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  insert: jest.Mock;
};

// ─── Chain builder helpers ─────────────────────────────────────────────────

/**
 * Build a Drizzle-style chainable query builder that resolves to `resolveValue`.
 * All builder methods (from, where, set, values, returning, limit) return `this`.
 * The chain itself is thenable so `await chain` resolves to `resolveValue`.
 */
function makeSelectChain(rows: unknown[]) {
  let result: unknown = rows;
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    // Make it awaitable
    then: (resolve: (v: unknown) => void, _reject?: (e: unknown) => void) => {
      resolve(result);
      return Promise.resolve(result);
    },
    catch: (fn: (e: unknown) => void) => { void fn; return chain; },
    finally: (fn: () => void) => { fn(); return chain; },
    _setResult: (v: unknown) => { result = v; },
  };
  return chain;
}

function makeUpdateChain(throwOnWhere?: Error) {
  const chain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation(() => {
      if (throwOnWhere) throw throwOnWhere;
      return chain;
    }),
    then: (resolve: (v: unknown) => void) => { resolve(undefined); return Promise.resolve(undefined); },
    catch: (fn: (e: unknown) => void) => { void fn; return chain; },
    finally: (fn: () => void) => { fn(); return chain; },
  };
  return chain;
}

function makeDeleteChain() {
  const chain = {
    where: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => { resolve(undefined); return Promise.resolve(undefined); },
    catch: (fn: (e: unknown) => void) => { void fn; return chain; },
    finally: (fn: () => void) => { fn(); return chain; },
  };
  return chain;
}

function makeInsertChain(returnVal?: unknown) {
  const chain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => {
      resolve(returnVal ?? undefined);
      return Promise.resolve(returnVal ?? undefined);
    },
    catch: (fn: (e: unknown) => void) => { void fn; return chain; },
    finally: (fn: () => void) => { fn(); return chain; },
  };
  return chain;
}

// ─── Base opts ────────────────────────────────────────────────────────────

const baseOpts = {
  canonicalId: 1,
  duplicateId: 2,
  candidateId: 10,
  nameScore: 0.12,
  distanceMeters: 45,
  duplicateName: 'Venue B',
  duplicateCity: 'Halifax',
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('performVenueMerge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Set up default mocks for tests that don't need special conflict handling.
   * Uses mockImplementation so each call gets a fresh chain (important for inspecting
   * per-call .set() arguments).
   */
  function setupCleanMocks(dupeEvents: Array<{ id: number }> = []) {
    mockDb.select.mockReturnValue(makeSelectChain(dupeEvents));
    mockDb.update.mockImplementation(() => makeUpdateChain());
    mockDb.delete.mockImplementation(() => makeDeleteChain());
    mockDb.insert.mockImplementation(() => makeInsertChain());
  }

  it('Test 1: reassigns events from duplicate to canonical venue', async () => {
    const dupeEvents = [{ id: 100 }, { id: 101 }];
    mockDb.select.mockReturnValue(makeSelectChain(dupeEvents));
    mockDb.update.mockReturnValue(makeUpdateChain());
    mockDb.delete.mockReturnValue(makeDeleteChain());
    mockDb.insert.mockReturnValue(makeInsertChain());

    const result = await performVenueMerge(baseOpts);

    expect(result.eventsReassigned).toBe(2);
    expect(result.eventsDropped).toBe(0);

    // update called for: 2 event reassigns + 1 scrape_sources + 1 candidates = 4
    // But at minimum, there should be at least 2 calls for the event updates
    const updateCalls = mockDb.update.mock.calls;
    const { events: eventsTable } = jest.requireMock('@/lib/db/schema') as { events: unknown };
    const eventUpdateCalls = updateCalls.filter((c: unknown[]) => c[0] === eventsTable);
    expect(eventUpdateCalls).toHaveLength(2);
  });

  it('Test 2: deletes event when unique constraint would be violated', async () => {
    const dupeEvents = [{ id: 200 }];
    const uniqueError = new Error('unique constraint violation');

    mockDb.select.mockReturnValue(makeSelectChain(dupeEvents));
    mockDb.update.mockImplementation((table: unknown) => {
      const { events: eventsTable } = jest.requireMock('@/lib/db/schema') as { events: unknown };
      if (table === eventsTable) {
        return makeUpdateChain(uniqueError);
      }
      return makeUpdateChain();
    });
    mockDb.delete.mockReturnValue(makeDeleteChain());
    mockDb.insert.mockReturnValue(makeInsertChain());

    const result = await performVenueMerge(baseOpts);

    expect(result.eventsDropped).toBe(1);
    expect(result.eventsReassigned).toBe(0);
  });

  it('Test 3: deletes event_sources rows before deleting event on conflict', async () => {
    const dupeEvents = [{ id: 300 }];
    const uniqueError = new Error('duplicate key value violates unique constraint');

    mockDb.select.mockReturnValue(makeSelectChain(dupeEvents));
    mockDb.update.mockImplementation((table: unknown) => {
      const { events: eventsTable } = jest.requireMock('@/lib/db/schema') as { events: unknown };
      if (table === eventsTable) {
        return makeUpdateChain(uniqueError);
      }
      return makeUpdateChain();
    });

    const deleteOrder: string[] = [];
    mockDb.delete.mockImplementation((table: unknown) => {
      const { event_sources: eventSourcesTable, events: eventsTable } =
        jest.requireMock('@/lib/db/schema') as { event_sources: unknown; events: unknown };
      const chain = makeDeleteChain();
      // Track which table is deleted when .where() is called
      const originalWhere = chain.where;
      chain.where = jest.fn().mockImplementation((...args: unknown[]) => {
        if (table === eventSourcesTable) deleteOrder.push('event_sources');
        else if (table === eventsTable) deleteOrder.push('events');
        return originalWhere.call(chain, ...args);
      });
      return chain;
    });

    mockDb.insert.mockReturnValue(makeInsertChain());

    await performVenueMerge(baseOpts);

    // event_sources must be deleted before the event itself
    const esIdx = deleteOrder.indexOf('event_sources');
    const evtIdx = deleteOrder.indexOf('events');
    expect(esIdx).toBeGreaterThanOrEqual(0);
    expect(evtIdx).toBeGreaterThanOrEqual(0);
    expect(esIdx).toBeLessThan(evtIdx);
  });

  it('Test 4: reassigns scrape_sources from duplicate to canonical', async () => {
    setupCleanMocks();

    await performVenueMerge(baseOpts);

    const { scrape_sources: scrapeSourcesTable } = jest.requireMock('@/lib/db/schema') as {
      scrape_sources: unknown;
    };
    expect(mockDb.update).toHaveBeenCalledWith(scrapeSourcesTable);

    // Find the set() call for scrape_sources
    const updateCalls = mockDb.update.mock.calls;
    const ssCallIdx = updateCalls.findIndex((c: unknown[]) => c[0] === scrapeSourcesTable);
    expect(ssCallIdx).toBeGreaterThanOrEqual(0);

    // The chain returned for scrape_sources update — check .set() was called with correct venue_id
    const setCallsOnChain = mockDb.update.mock.results[ssCallIdx]?.value?.set?.mock?.calls;
    expect(setCallsOnChain?.[0]?.[0]).toMatchObject({ venue_id: baseOpts.canonicalId });
  });

  it('Test 5: deletes the duplicate venue row', async () => {
    setupCleanMocks();

    await performVenueMerge(baseOpts);

    const { venues: venuesTable } = jest.requireMock('@/lib/db/schema') as { venues: unknown };
    expect(mockDb.delete).toHaveBeenCalledWith(venuesTable);
  });

  it('Test 6: inserts audit row into venue_merge_log', async () => {
    setupCleanMocks();

    await performVenueMerge(baseOpts);

    const { venueMergeLog: mergeLogTable } = jest.requireMock('@/lib/db/schema') as {
      venueMergeLog: unknown;
    };
    expect(mockDb.insert).toHaveBeenCalledWith(mergeLogTable);

    // Find the values() call after insert(venueMergeLog)
    const insertCalls = mockDb.insert.mock.calls;
    const logCallIdx = insertCalls.findIndex((c: unknown[]) => c[0] === mergeLogTable);
    const valuesCall = mockDb.insert.mock.results[logCallIdx]?.value?.values?.mock?.calls?.[0]?.[0];

    expect(valuesCall).toMatchObject({
      canonical_venue_id: baseOpts.canonicalId,
      merged_venue_name: baseOpts.duplicateName,
      merged_venue_city: baseOpts.duplicateCity,
      name_score: baseOpts.nameScore,
      distance_meters: baseOpts.distanceMeters,
    });
  });

  it('Test 7: updates venue_merge_candidates status to merged with reviewed_at', async () => {
    setupCleanMocks();

    await performVenueMerge(baseOpts);

    const { venueMergeCandidates: candidatesTable } = jest.requireMock('@/lib/db/schema') as {
      venueMergeCandidates: unknown;
    };
    expect(mockDb.update).toHaveBeenCalledWith(candidatesTable);

    // Find the update call for venueMergeCandidates and check .set()
    const updateCalls = mockDb.update.mock.calls;
    const candidatesCallIdx = updateCalls.findIndex((c: unknown[]) => c[0] === candidatesTable);
    expect(candidatesCallIdx).toBeGreaterThanOrEqual(0);

    const setCallsOnChain =
      mockDb.update.mock.results[candidatesCallIdx]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(setCallsOnChain).toMatchObject({ status: 'merged' });
    expect(setCallsOnChain?.reviewed_at).toBeInstanceOf(Date);
  });
});
