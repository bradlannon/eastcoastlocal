import { GET } from './route';

jest.mock('@/lib/scraper/reddit-discoverer', () => ({
  runRedditDiscovery: jest.fn(),
  ALL_REDDIT_SUBREDDITS: [
    { subreddit: 'halifax', province: 'NS' },
    { subreddit: 'novascotia', province: 'NS' },
  ],
}));

import { runRedditDiscovery, ALL_REDDIT_SUBREDDITS } from '@/lib/scraper/reddit-discoverer';

const mockRunRedditDiscovery = runRedditDiscovery as jest.MockedFunction<typeof runRedditDiscovery>;

const MOCK_RESULT = {
  subredditsChecked: 2,
  postsScanned: 50,
  postsFiltered: 10,
  candidatesFound: 3,
  staged: 3,
  autoApproved: 1,
  errors: 0,
};

function makeRequest(authHeader?: string): Request {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? (authHeader ?? null) : null),
    },
  } as unknown as Request;
}

describe('GET /api/cron/discover-reddit', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    jest.clearAllMocks();
  });

  it('returns 401 when authorization header is missing', async () => {
    const request = makeRequest(undefined);
    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when authorization header has wrong token', async () => {
    const request = makeRequest('Bearer wrong-secret');
    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 200 with success:true and result fields when auth valid and runRedditDiscovery succeeds', async () => {
    mockRunRedditDiscovery.mockResolvedValue(MOCK_RESULT);
    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.subredditsChecked).toBe(2);
    expect(body.postsScanned).toBe(50);
    expect(body.postsFiltered).toBe(10);
    expect(body.candidatesFound).toBe(3);
    expect(body.staged).toBe(3);
    expect(body.autoApproved).toBe(1);
    expect(body.errors).toBe(0);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 500 with error string when runRedditDiscovery throws', async () => {
    mockRunRedditDiscovery.mockRejectedValue(new Error('DB connection failed'));
    const request = makeRequest('Bearer test-secret');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('DB connection failed');
  });

  it('calls runRedditDiscovery with ALL_REDDIT_SUBREDDITS', async () => {
    mockRunRedditDiscovery.mockResolvedValue(MOCK_RESULT);
    const request = makeRequest('Bearer test-secret');
    await GET(request);
    expect(mockRunRedditDiscovery).toHaveBeenCalledWith(ALL_REDDIT_SUBREDDITS);
  });
});
