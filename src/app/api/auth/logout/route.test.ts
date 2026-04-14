/**
 * Characterization tests for src/app/api/auth/logout/route.ts
 *
 * POST /api/auth/logout:
 * - Deletes the admin_session cookie
 * - Returns a redirect to /admin/login
 */

// Mock jose to avoid ESM issues (auth.ts imports jose)
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

const mockDelete = jest.fn();
const mockCookieStore = { delete: mockDelete };

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue(mockCookieStore),
}));

// Track redirects
const mockRedirect = jest.fn((url: URL) => ({
  status: 302,
  headers: new Headers({ location: url.toString() }),
  _redirectUrl: url.toString(),
}));

jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    redirect: (...args: unknown[]) => mockRedirect(...args),
    json: jest.fn((body: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

import { POST } from './route';

beforeEach(() => {
  mockDelete.mockClear();
  mockRedirect.mockClear();
});

describe('POST /api/auth/logout', () => {
  function makeRequest(url = 'http://localhost/api/auth/logout') {
    return new Request(url, { method: 'POST' }) as unknown as Parameters<typeof POST>[0];
  }

  it('deletes the admin_session cookie', async () => {
    await POST(makeRequest());
    expect(mockDelete).toHaveBeenCalledWith('admin_session');
  });

  it('redirects to /admin/login on the same host', async () => {
    await POST(makeRequest('http://myhost.example.com/api/auth/logout'));
    expect(mockRedirect).toHaveBeenCalled();
    const urlArg = mockRedirect.mock.calls[0][0] as URL;
    expect(urlArg.pathname).toBe('/admin/login');
    expect(urlArg.host).toBe('myhost.example.com');
  });

  it('returns a response object', async () => {
    const result = await POST(makeRequest());
    expect(result).toBeDefined();
  });

  it('calls cookies() before deleting the cookie', async () => {
    const { cookies } = await import('next/headers');
    (cookies as jest.Mock).mockClear();

    await POST(makeRequest());

    expect(cookies).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
    // delete was called after cookies() resolved
    expect((cookies as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan(mockDelete.mock.invocationCallOrder[0]);
  });

  it('uses SESSION_COOKIE_NAME constant (admin_session)', async () => {
    // Import the constant to verify it matches what was deleted
    const { SESSION_COOKIE_NAME } = await import('@/lib/auth');
    await POST(makeRequest());
    expect(mockDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});
