/**
 * Characterization tests for src/app/api/cron/parse-newsletters/route.ts
 *
 * GET /api/cron/parse-newsletters:
 * - 401 without valid CRON_SECRET bearer token
 * - 200 with valid token, calls parseNewsletters() and returns result
 * - 500 when parseNewsletters throws
 */

const CRON_SECRET = 'test-cron-secret-newsletters';

const mockParseNewsletters = jest.fn();

jest.mock('@/lib/scraper/newsletter-parser', () => ({
  parseNewsletters: (...args: unknown[]) => mockParseNewsletters(...args),
}));

import { GET } from './route';

const MOCK_RESULT = {
  emailsProcessed: 3,
  eventsFound: 12,
  eventsUpserted: 10,
  errors: 0,
  details: [
    { subject: 'Newsletter 1', from: 'test@example.com', eventsFound: 5, eventsUpserted: 4 },
    { subject: 'Newsletter 2', from: 'other@example.com', eventsFound: 7, eventsUpserted: 6 },
  ],
};

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockParseNewsletters.mockReset();
  mockParseNewsletters.mockResolvedValue(MOCK_RESULT);
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/parse-newsletters', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  }) as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/cron/parse-newsletters', () => {
  describe('authentication', () => {
    it('returns 401 without authorization header', async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong bearer token', async () => {
      const res = await GET(makeRequest('Bearer bad-token'));
      expect(res.status).toBe(401);
    });

    it('returns 401 without Bearer prefix', async () => {
      const res = await GET(makeRequest(CRON_SECRET));
      expect(res.status).toBe(401);
    });

    it('does not call parseNewsletters when unauthorized', async () => {
      await GET(makeRequest());
      expect(mockParseNewsletters).not.toHaveBeenCalled();
    });
  });

  describe('with valid auth', () => {
    const auth = () => `Bearer ${CRON_SECRET}`;

    it('returns 200 with success:true', async () => {
      const res = await GET(makeRequest(auth()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('calls parseNewsletters()', async () => {
      await GET(makeRequest(auth()));
      expect(mockParseNewsletters).toHaveBeenCalledTimes(1);
    });

    it('returns emailsProcessed count in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.emailsProcessed).toBe(3);
    });

    it('returns eventsFound count in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.eventsFound).toBe(12);
    });

    it('returns eventsUpserted count in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.eventsUpserted).toBe(10);
    });

    it('includes timestamp in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });

    it('returns 0 emailsProcessed when no newsletters found', async () => {
      mockParseNewsletters.mockResolvedValue({
        emailsProcessed: 0,
        eventsFound: 0,
        eventsUpserted: 0,
        errors: 0,
        details: [],
      });
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body.emailsProcessed).toBe(0);
      expect(body.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 500 when parseNewsletters throws', async () => {
      mockParseNewsletters.mockRejectedValue(new Error('Gmail API unavailable'));

      const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Gmail API unavailable');
    });

    it('returns 500 with error message from thrown error', async () => {
      mockParseNewsletters.mockRejectedValue(new Error('Token expired'));

      const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('Token expired');
    });
  });
});
