/**
 * Characterization tests for src/app/api/submissions/route.ts
 *
 * POST /api/submissions:
 * - Valid payload → 200 + { success: true } + db.insert called
 * - Missing required fields → 400 + { error: 'Missing required fields' }
 * - Invalid province → 400
 * - Past event date → 400
 * - Invalid URL → 400
 * - Honeypot field filled → 200 (silent bot success)
 * - Rate limit exceeded → 429
 */

const mockInsert = jest.fn();
const mockValues = jest.fn().mockResolvedValue([]);
mockInsert.mockReturnValue({ values: mockValues });

jest.mock('@/lib/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

// Rate limit mock — allowed by default
const mockRateLimit = jest.fn().mockReturnValue({ allowed: true, remaining: 4 });
const mockGetClientIp = jest.fn().mockReturnValue('127.0.0.1');

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

import { POST } from './route';

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  performer: 'Test Band',
  venue_name: 'Test Venue',
  city: 'Halifax',
  province: 'NS',
  event_date: FUTURE_DATE,
  event_time: '20:00',
  event_category: 'live_music',
  price: 'Free',
  link: 'https://example.com/event',
  description: 'A great show',
};

beforeEach(() => {
  mockInsert.mockClear();
  mockValues.mockClear();
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue([]);
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 4 });
  mockGetClientIp.mockReturnValue('127.0.0.1');
});

describe('POST /api/submissions', () => {
  describe('valid payload', () => {
    it('returns 200 with { success: true }', async () => {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });

    it('calls db.insert with the submission data', async () => {
      await POST(makeRequest(VALID_BODY));
      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          performer: 'Test Band',
          venue_name: 'Test Venue',
          city: 'Halifax',
          province: 'NS',
        })
      );
    });

    it('inserts event_category from payload', async () => {
      await POST(makeRequest(VALID_BODY));
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ event_category: 'live_music' })
      );
    });

    it('trims whitespace from string fields', async () => {
      const body = { ...VALID_BODY, performer: '  Whitespace Band  ' };
      await POST(makeRequest(body));
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ performer: 'Whitespace Band' })
      );
    });
  });

  describe('missing required fields', () => {
    it('returns 400 when performer is missing', async () => {
      const { performer: _p, ...body } = VALID_BODY;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Missing required fields');
    });

    it('returns 400 when venue_name is missing', async () => {
      const { venue_name: _v, ...body } = VALID_BODY;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it('returns 400 when city is missing', async () => {
      const { city: _c, ...body } = VALID_BODY;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it('returns 400 when province is missing', async () => {
      const { province: _p, ...body } = VALID_BODY;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it('returns 400 when event_date is missing', async () => {
      const { event_date: _d, ...body } = VALID_BODY;
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });
  });

  describe('invalid fields', () => {
    it('returns 400 for invalid province', async () => {
      const body = { ...VALID_BODY, province: 'ON' }; // Ontario not in Atlantic list
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid province');
    });

    it('returns 400 for past event date', async () => {
      const body = { ...VALID_BODY, event_date: '2000-01-01' };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/future/i);
    });

    it('returns 400 for invalid URL in link field', async () => {
      const body = { ...VALID_BODY, link: 'not-a-valid-url' };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid URL');
    });

    it('accepts all valid Atlantic provinces', async () => {
      for (const province of ['NS', 'NB', 'PEI', 'NL']) {
        mockInsert.mockReturnValue({ values: mockValues });
        mockValues.mockResolvedValue([]);
        const res = await POST(makeRequest({ ...VALID_BODY, province }));
        expect(res.status).toBe(200);
      }
    });

    it('normalizes unknown event_category to "community"', async () => {
      const body = { ...VALID_BODY, event_category: 'unknown_category' };
      await POST(makeRequest(body));
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ event_category: 'community' })
      );
    });
  });

  describe('honeypot', () => {
    it('returns 200 silently when website honeypot field is filled', async () => {
      const body = { ...VALID_BODY, website: 'http://spammer.com' };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Should NOT call db.insert for bots
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0 });

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toMatch(/too many/i);
    });

    it('includes X-RateLimit-Remaining header when rate limited', async () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0 });

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('calls rateLimit with the client IP', async () => {
      mockGetClientIp.mockReturnValue('192.168.1.1');
      await POST(makeRequest(VALID_BODY));
      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.1'),
        expect.any(Object)
      );
    });

    it('does not call db.insert when rate limited', async () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0 });
      await POST(makeRequest(VALID_BODY));
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('optional fields', () => {
    it('works without optional fields (event_time, price, link, description)', async () => {
      const body = {
        performer: 'Solo Artist',
        venue_name: 'Local Bar',
        city: 'Moncton',
        province: 'NB',
        event_date: FUTURE_DATE,
      };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
    });
  });
});
