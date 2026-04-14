/**
 * Unit tests for venue server actions — deleteVenue guardrail.
 *
 * Mocks @/lib/db/client so no real DB is hit.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────

jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  venues: Symbol('venues'),
  events: Symbol('events'),
  scrape_sources: Symbol('scrape_sources'),
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ __eq: true, col, val })),
  count: jest.fn((col) => ({ __count: true, col })),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true, strings, values,
  })),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

import { db } from '@/lib/db/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const mockDb = db as unknown as {
  select: jest.Mock;
  delete: jest.Mock;
};

// ─── Chain helpers ────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => {
      resolve(rows);
      return Promise.resolve(rows);
    },
    catch: (_fn: unknown) => chain,
    finally: (fn: () => void) => { fn(); return chain; },
  };
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {
    where: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => {
      resolve(undefined);
      return Promise.resolve(undefined);
    },
    catch: (_fn: unknown) => chain,
    finally: (fn: () => void) => { fn(); return chain; },
  };
  return chain;
}

// ─── Import SUT after mocks ───────────────────────────────────────────────

import { deleteVenue } from './actions';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('deleteVenue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('succeeds when venue has zero events and zero scrape_sources', async () => {
    // First select: venue lookup → 1 row
    // Second select: event count → 0
    // Third select: source count → 0
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain([{ id: 42, name: 'Test Venue' }]);
      if (callCount === 2) return makeSelectChain([{ count: 0 }]);
      return makeSelectChain([{ count: 0 }]);
    });

    const deleteChain = makeDeleteChain();
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await deleteVenue('42');

    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/venues');
  });

  it('is blocked when venue has events', async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain([{ id: 42, name: 'Test Venue' }]);
      if (callCount === 2) return makeSelectChain([{ count: 3 }]); // 3 events
      return makeSelectChain([{ count: 0 }]);
    });

    const result = await deleteVenue('42');

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/event/i);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('is blocked when venue has scrape_sources', async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain([{ id: 42, name: 'Test Venue' }]);
      if (callCount === 2) return makeSelectChain([{ count: 0 }]); // 0 events
      return makeSelectChain([{ count: 2 }]); // 2 sources
    });

    const result = await deleteVenue('42');

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/source/i);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('is blocked when venue has both events and sources, and error mentions both counts', async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain([{ id: 42, name: 'Test Venue' }]);
      if (callCount === 2) return makeSelectChain([{ count: 5 }]); // 5 events
      return makeSelectChain([{ count: 3 }]); // 3 sources
    });

    const result = await deleteVenue('42');

    expect(result.success).toBe(false);
    const error = (result as { success: false; error: string }).error;
    expect(error).toMatch(/5/);
    expect(error).toMatch(/3/);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns not-found error when venue does not exist', async () => {
    mockDb.select.mockImplementation(() => makeSelectChain([])); // empty rows → venue not found

    const result = await deleteVenue('999');

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/not found/i);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns validation error for non-numeric id', async () => {
    const result = await deleteVenue('abc');

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toBeTruthy();
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
