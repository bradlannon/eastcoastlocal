import { GET } from './route';

// Mock the series-detector module
jest.mock('@/lib/series-detector', () => ({
  detectAndTagSeries: jest.fn(),
}));

import { detectAndTagSeries } from '@/lib/series-detector';

const mockDetectAndTagSeries = detectAndTagSeries as jest.Mock;

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new Request('http://localhost/api/cron/detect-series', { headers });
}

describe('GET /api/cron/detect-series', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 when no authorization header is provided', async () => {
    const request = makeRequest();
    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when authorization header has wrong token', async () => {
    const request = makeRequest('Bearer wrong-secret');
    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 with seriesUpserted and eventsTagged on success', async () => {
    mockDetectAndTagSeries.mockResolvedValue({ seriesUpserted: 3, eventsTagged: 12 });

    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.seriesUpserted).toBe(3);
    expect(body.eventsTagged).toBe(12);
    expect(body).toHaveProperty('timestamp');
  });

  it('returns 500 when detectAndTagSeries throws', async () => {
    mockDetectAndTagSeries.mockRejectedValue(new Error('DB connection failed'));

    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
