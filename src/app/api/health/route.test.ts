/**
 * Characterization tests for src/app/api/health/route.ts
 *
 * GET /api/health:
 * - 200 with { status: 'ok', db: 'connected' } when DB is reachable
 * - 500 with { status: 'error', db: 'disconnected' } when DB throws
 */

const mockExecute = jest.fn();

jest.mock('@/lib/db/client', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

// Mock drizzle-orm's sql tagged template literal
jest.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join(''), values }),
    { empty: () => ({ sql: '', values: [] }) }
  ),
}));

import { GET } from './route';

beforeEach(() => {
  mockExecute.mockClear();
});

describe('GET /api/health', () => {
  it('returns 200 with ok shape when DB is reachable', async () => {
    mockExecute.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', db: 'connected' });
  });

  it('returns status "ok" field', async () => {
    mockExecute.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns db "connected" field', async () => {
    mockExecute.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.db).toBe('connected');
  });

  it('returns 500 with error shape when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'error', db: 'disconnected' });
  });

  it('calls db.execute with SELECT 1', async () => {
    mockExecute.mockResolvedValue([]);
    await GET();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
