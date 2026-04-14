/**
 * Characterization tests for src/app/api/cron/discover-places-pei/route.ts
 *
 * GET /api/cron/discover-places-pei:
 * - 401 without valid CRON_SECRET bearer token
 * - 200 with valid token, calls runPlacesDiscovery(PLACES_CITIES.PEI)
 * - 500 when runPlacesDiscovery throws
 */

const CRON_SECRET = 'test-cron-secret-pei';

const mockRunPlacesDiscovery = jest.fn();
const mockDbInsert = jest.fn();
const mockDbValues = jest.fn().mockResolvedValue([]);
mockDbInsert.mockReturnValue({ values: mockDbValues });

jest.mock('@/lib/scraper/places-discoverer', () => ({
  runPlacesDiscovery: (...args: unknown[]) => mockRunPlacesDiscovery(...args),
  PLACES_CITIES: {
    NS: ['Halifax', 'Dartmouth'],
    NB: ['Fredericton', 'Moncton', 'Saint John'],
    PEI: ['Charlottetown', 'Summerside'],
    NL: ["St. John's"],
  },
}));

jest.mock('@/lib/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  discovery_runs: { name: 'discovery_runs' },
}));

import { GET } from './route';

const MOCK_RESULT = {
  candidatesFound: 4,
  autoApproved: 2,
  stagedPending: 2,
  enriched: 0,
  errors: 0,
};

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockRunPlacesDiscovery.mockReset();
  mockDbInsert.mockClear();
  mockDbValues.mockClear();
  mockRunPlacesDiscovery.mockResolvedValue(MOCK_RESULT);
  mockDbInsert.mockReturnValue({ values: mockDbValues });
  mockDbValues.mockResolvedValue([]);
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

function makeRequest(authHeader?: string) {
  return new Request('http://localhost/api/cron/discover-places-pei', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  }) as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/cron/discover-places-pei', () => {
  describe('authentication', () => {
    it('returns 401 without authorization header', async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 401 with wrong bearer token', async () => {
      const res = await GET(makeRequest('Bearer wrong-secret'));
      expect(res.status).toBe(401);
    });

    it('returns 401 without Bearer prefix', async () => {
      const res = await GET(makeRequest(CRON_SECRET));
      expect(res.status).toBe(401);
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

    it('calls runPlacesDiscovery with PEI cities', async () => {
      await GET(makeRequest(auth()));
      expect(mockRunPlacesDiscovery).toHaveBeenCalledWith(
        expect.arrayContaining(['Charlottetown'])
      );
    });

    it('returns discovery result fields', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        candidatesFound: 4,
        autoApproved: 2,
      });
    });

    it('includes timestamp in response', async () => {
      const res = await GET(makeRequest(auth()));
      const body = await res.json();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });

    it('logs the discovery run with province PEI', async () => {
      await GET(makeRequest(auth()));
      expect(mockDbValues).toHaveBeenCalledWith(
        expect.objectContaining({
          discovery_method: 'google_places',
          province: 'PEI',
        })
      );
    });

    it('does not call runPlacesDiscovery when unauthorized', async () => {
      await GET(makeRequest());
      expect(mockRunPlacesDiscovery).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when runPlacesDiscovery throws', async () => {
      mockRunPlacesDiscovery.mockRejectedValue(new Error('PEI discovery error'));

      const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('PEI discovery error');
    });
  });
});
