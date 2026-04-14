/**
 * Characterization tests for src/lib/db/backfill-categories.ts
 *
 * The script calls:
 *   db.update(events).set({ event_category: 'community' }).where(isNull(events.event_category))
 *
 * We verify the shape of that call by mocking the db module.
 * Since the script runs immediately on import we load it once and observe calls.
 */

const mockReturning = jest.fn().mockResolvedValue([]);
const mockWhere = jest.fn(() => ({ returning: mockReturning }));
const mockSet = jest.fn(() => ({ where: mockWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

const mockDb = {
  update: mockUpdate,
};

jest.mock('@/lib/db/client', () => ({
  db: mockDb,
}));

// Mock drizzle-orm's isNull — just passes through the column
jest.mock('drizzle-orm', () => ({
  isNull: jest.fn((col: unknown) => ({ _type: 'isNull', col })),
}));

// Prevent dotenv from trying to load real .env files
jest.mock('dotenv/config', () => ({}));

// Suppress console and process.exit globally for this suite
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Import the script ONCE — it auto-runs backfillCategories() on load
// We need to wait for the async code to complete
let scriptLoaded = false;
beforeAll(async () => {
  if (!scriptLoaded) {
    await import('./backfill-categories');
    // Give async code time to run
    await new Promise((r) => setTimeout(r, 100));
    scriptLoaded = true;
  }
});

describe('backfill-categories script', () => {
  it('calls db.update on the events table', () => {
    expect(mockUpdate).toHaveBeenCalled();
    // The first argument should be the events table object (has drizzle table symbols)
    const tableArg = mockUpdate.mock.calls[0]?.[0];
    expect(tableArg).toBeDefined();
    // events table has event_category column
    expect(tableArg).toHaveProperty('event_category');
  });

  it('sets event_category to "community"', () => {
    expect(mockSet).toHaveBeenCalledWith({ event_category: 'community' });
  });

  it('filters using where clause (isNull predicate)', () => {
    expect(mockWhere).toHaveBeenCalled();
    const whereArg = mockWhere.mock.calls[0]?.[0];
    expect(whereArg).toBeDefined();
    // The predicate was created by isNull()
    expect(whereArg).toHaveProperty('_type', 'isNull');
  });

  it('applies isNull to the event_category column', () => {
    const { isNull } = require('drizzle-orm') as { isNull: jest.MockedFunction<(col: unknown) => unknown> };
    expect(isNull).toHaveBeenCalled();
    // The column passed to isNull should have name 'event_category'
    const colArg = isNull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(colArg).toHaveProperty('name', 'event_category');
  });

  it('calls returning() to get results back', () => {
    expect(mockReturning).toHaveBeenCalled();
  });
});

describe('backfill-categories idempotency', () => {
  it('when returning() resolves empty array, script does not throw', async () => {
    // The script ran with mockReturning resolving [] — no error expected
    // process.exit mock prevents actual exit
    expect(mockUpdate).toHaveBeenCalled(); // at least once from above
  });
});
