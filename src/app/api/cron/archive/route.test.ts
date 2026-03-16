import { GET } from './route';

// Mock the archiver module
jest.mock('@/lib/archiver', () => ({
  archivePastEvents: jest.fn(),
}));

import { archivePastEvents } from '@/lib/archiver';

const mockArchivePastEvents = archivePastEvents as jest.Mock;

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new Request('http://localhost/api/cron/archive', { headers });
}

describe('GET /api/cron/archive', () => {
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

  it('returns 200 with archived count on success', async () => {
    mockArchivePastEvents.mockResolvedValue({ total: 5, halifax: 3, nl: 2 });

    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.archived).toBe(5);
    expect(body).toHaveProperty('timestamp');
  });

  it('returns 500 when archivePastEvents throws', async () => {
    mockArchivePastEvents.mockRejectedValue(new Error('DB connection failed'));

    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
