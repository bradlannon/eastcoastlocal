/**
 * Characterization tests for src/app/api/admin/source-events/route.ts
 *
 * GET /api/admin/source-events?sourceId=N:
 * - 401 without admin_session cookie
 * - 401 with invalid token
 * - 400 with missing sourceId param
 * - 200 with valid cookie + valid sourceId → returns { events: [...] }
 */

// Mock jose to avoid ESM issues
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

// Mock verifyToken from auth
const mockVerifyToken = jest.fn();

jest.mock('@/lib/auth', () => ({
  SESSION_COOKIE_NAME: 'admin_session',
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Mock cookies()
const mockCookieGet = jest.fn();
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: (...args: unknown[]) => mockCookieGet(...args),
  }),
}));

// Mock db
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockInnerJoin = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();

// Build drizzle fluent chain
mockLimit.mockResolvedValue([]);
mockOrderBy.mockReturnValue({ limit: mockLimit });
mockWhere.mockReturnValue({ orderBy: mockOrderBy });
mockInnerJoin.mockReturnValue({ where: mockWhere });
mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
mockSelect.mockReturnValue({ from: mockFrom });

jest.mock('@/lib/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: jest.fn(),
  },
}));

// Mock drizzle-orm
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: jest.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: jest.fn((col: unknown) => ({ type: 'desc', col })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { GET } from './route';

beforeEach(() => {
  mockCookieGet.mockReset();
  mockVerifyToken.mockReset();
  mockSelect.mockClear();
  mockLimit.mockResolvedValue([]);
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
});

function makeRequest(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/admin/source-events', () => {
  describe('authentication', () => {
    it('returns 401 when no cookie is present', async () => {
      mockCookieGet.mockReturnValue(undefined);

      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=1'));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when token is invalid (verifyToken returns falsy)', async () => {
      mockCookieGet.mockReturnValue({ value: 'bad-token' });
      mockVerifyToken.mockResolvedValue(null);

      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=1'));
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is an empty string', async () => {
      mockCookieGet.mockReturnValue({ value: '' });
      // empty string is falsy — no verifyToken call needed

      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=1'));
      expect(res.status).toBe(401);
    });
  });

  describe('with valid cookie', () => {
    beforeEach(() => {
      mockCookieGet.mockReturnValue({ value: 'valid-token' });
      mockVerifyToken.mockResolvedValue({ role: 'admin' });
    });

    it('returns 400 when sourceId param is missing', async () => {
      const res = await GET(makeRequest('http://localhost/api/admin/source-events'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing sourceId');
    });

    it('returns 400 when sourceId is not a number', async () => {
      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=abc'));
      expect(res.status).toBe(400);
    });

    it('returns 200 with events array for valid sourceId', async () => {
      const mockEvents = [
        { eventId: 1, performer: 'Jazz Band', eventDate: '2026-05-01', eventTime: '20:00', category: 'live_music' },
      ];
      mockLimit.mockResolvedValue(mockEvents);

      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=5'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('events');
      expect(body.events).toEqual(mockEvents);
    });

    it('returns empty events array when no events found', async () => {
      mockLimit.mockResolvedValue([]);

      const res = await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=99'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.events).toEqual([]);
    });

    it('calls db.select() to query events', async () => {
      mockLimit.mockResolvedValue([]);

      await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=5'));
      expect(mockSelect).toHaveBeenCalled();
    });

    it('limits results to 20', async () => {
      mockLimit.mockResolvedValue([]);

      await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=5'));
      expect(mockLimit).toHaveBeenCalledWith(20);
    });

    it('passes the sourceId as a number to the query', async () => {
      const { eq } = await import('drizzle-orm');
      (eq as jest.Mock).mockClear();

      await GET(makeRequest('http://localhost/api/admin/source-events?sourceId=42'));

      // eq should have been called with sourceId value 42
      const calls = (eq as jest.Mock).mock.calls;
      const hasSourceIdCall = calls.some((call) => call[1] === 42);
      expect(hasSourceIdCall).toBe(true);
    });
  });
});
