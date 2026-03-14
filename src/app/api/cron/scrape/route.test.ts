import { GET } from './route';

jest.mock('@/lib/scraper/orchestrator', () => ({
  runScrapeJob: jest.fn().mockResolvedValue(undefined),
}));

// Import after mock so we get the mocked version
import { runScrapeJob } from '@/lib/scraper/orchestrator';

const mockRunScrapeJob = runScrapeJob as jest.MockedFunction<typeof runScrapeJob>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return new Request('http://localhost:3000/api/cron/scrape', { headers });
}

describe('GET /api/cron/scrape', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRunScrapeJob).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has wrong token', async () => {
    const req = makeRequest('Bearer wrong-token');
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRunScrapeJob).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header uses wrong scheme', async () => {
    const req = makeRequest('Basic test-secret');
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRunScrapeJob).not.toHaveBeenCalled();
  });

  it('calls runScrapeJob and returns 200 with success JSON when correct Bearer token is provided', async () => {
    const req = makeRequest('Bearer test-secret');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockRunScrapeJob).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 500 with error JSON when runScrapeJob throws', async () => {
    mockRunScrapeJob.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = makeRequest('Bearer test-secret');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('DB connection failed');
  });
});
