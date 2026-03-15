import { GET } from './route';

jest.mock('@/lib/scraper/discovery-orchestrator', () => ({
  runDiscoveryJob: jest.fn().mockResolvedValue(undefined),
}));

// Import after mock so we get the mocked version
import { runDiscoveryJob } from '@/lib/scraper/discovery-orchestrator';

const mockRunDiscoveryJob = runDiscoveryJob as jest.MockedFunction<typeof runDiscoveryJob>;

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
  return new Request('http://localhost:3000/api/cron/discover', { headers });
}

describe('GET /api/cron/discover', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRunDiscoveryJob).not.toHaveBeenCalled();
  });

  it('returns 401 when wrong Bearer token provided', async () => {
    const req = makeRequest('Bearer wrong-token');
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockRunDiscoveryJob).not.toHaveBeenCalled();
  });

  it('calls runDiscoveryJob and returns 200 with success JSON when correct Bearer token provided', async () => {
    const req = makeRequest('Bearer test-secret');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockRunDiscoveryJob).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 500 with error JSON when runDiscoveryJob throws', async () => {
    mockRunDiscoveryJob.mockRejectedValueOnce(new Error('Gemini unavailable'));
    const req = makeRequest('Bearer test-secret');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('Gemini unavailable');
  });
});
