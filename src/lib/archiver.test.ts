import { getStartOfTodayInTimezone, archivePastEvents } from './archiver';

// Mock the DB client
jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

// Mock schema
jest.mock('@/lib/db/schema', () => ({
  events: {
    archived_at: 'archived_at',
    event_date: 'event_date',
    venue_id: 'venue_id',
    id: 'id',
  },
  venues: {
    id: 'id',
    province: 'province',
  },
}));

import { db } from '@/lib/db/client';

describe('getStartOfTodayInTimezone', () => {
  beforeEach(() => {
    // Use fake timers to control Date.now() and new Date()
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a Date representing start of day in America/Halifax (UTC-3 during ADT)', () => {
    // Set system time to 2026-03-17T10:00:00Z
    // Halifax is UTC-3 during ADT (mid-March = ADT = UTC-3)
    // So local time in Halifax = 2026-03-17T07:00:00 (10:00 - 3h)
    // Start of that day = 2026-03-17T00:00:00 Halifax = 2026-03-17T03:00:00Z
    jest.setSystemTime(new Date('2026-03-17T10:00:00Z'));

    const result = getStartOfTodayInTimezone('America/Halifax');

    expect(result).toBeInstanceOf(Date);
    // Should be UTC midnight Halifax time — 3am UTC (ADT = UTC-3)
    expect(result.getUTCHours()).toBe(3);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('returns a Date representing start of day in America/St_Johns (UTC-2:30 during NDT)', () => {
    // Set system time to 2026-03-17T10:00:00Z
    // St. Johns is UTC-2:30 during NDT (mid-March)
    // So local time in St. Johns = 2026-03-17T07:30:00 (10:00 - 2h30m)
    // Start of that day = 2026-03-17T00:00:00 St. Johns = 2026-03-17T02:30:00Z
    jest.setSystemTime(new Date('2026-03-17T10:00:00Z'));

    const result = getStartOfTodayInTimezone('America/St_Johns');

    expect(result).toBeInstanceOf(Date);
    // Should be UTC midnight St. Johns time — 2:30am UTC (NDT = UTC-2:30)
    expect(result.getUTCHours()).toBe(2);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('returns a date with zero seconds and milliseconds', () => {
    jest.setSystemTime(new Date('2026-03-17T10:00:00Z'));
    const result = getStartOfTodayInTimezone('America/Halifax');
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});

describe('archivePastEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns total count of archived events', async () => {
    const mockDb = db as unknown as {
      select: jest.Mock;
      update: jest.Mock;
    };

    // Mock: db.select().from(venues).where() → venue ID lists
    const mockWhere = jest.fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // Halifax provinces (NS, NB, PEI)
      .mockResolvedValueOnce([{ id: 3 }]);             // NL
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    // Mock: db.update(events).set().where().returning() → archived rows
    const mockReturning = jest.fn()
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }]) // Halifax: 2 archived
      .mockResolvedValueOnce([{ id: 12 }]);              // NL: 1 archived
    const mockUpdateWhere = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
    mockDb.update.mockReturnValue({ set: mockSet });

    const result = await archivePastEvents();

    expect(result.total).toBe(3);
    expect(result.halifax).toBe(2);
    expect(result.nl).toBe(1);
  });

  it('calls db.update twice (one per timezone bucket)', async () => {
    const mockDb = db as unknown as {
      select: jest.Mock;
      update: jest.Mock;
    };

    const mockWhere = jest.fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }]);
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const mockReturning = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const mockUpdateWhere = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
    mockDb.update.mockReturnValue({ set: mockSet });

    await archivePastEvents();

    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('returns zero counts when no venues found', async () => {
    const mockDb = db as unknown as {
      select: jest.Mock;
      update: jest.Mock;
    };

    const mockWhere = jest.fn()
      .mockResolvedValueOnce([]) // no Halifax venues
      .mockResolvedValueOnce([]); // no NL venues
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    mockDb.select.mockReturnValue({ from: mockFrom });

    const mockReturning = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const mockUpdateWhere = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
    mockDb.update.mockReturnValue({ set: mockSet });

    const result = await archivePastEvents();

    expect(result.total).toBe(0);
    expect(result.halifax).toBe(0);
    expect(result.nl).toBe(0);
  });
});
