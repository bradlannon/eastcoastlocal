import { POST } from './route';

// --- Mocks ---

const mockVerifyToken = jest.fn();
const mockGet = jest.fn();

jest.mock('@/lib/auth', () => ({
  SESSION_COOKIE_NAME: 'admin_session',
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(() =>
    Promise.resolve({
      get: mockGet,
    })
  ),
}));

const mockRunScrapeJob = jest.fn();
jest.mock('@/lib/scraper/orchestrator', () => ({
  runScrapeJob: (...args: unknown[]) => mockRunScrapeJob(...args),
}));

const mockArchivePastEvents = jest.fn();
jest.mock('@/lib/archiver', () => ({
  archivePastEvents: (...args: unknown[]) => mockArchivePastEvents(...args),
}));

const mockRunDiscoveryJob = jest.fn();
jest.mock('@/lib/scraper/discovery-orchestrator', () => ({
  runDiscoveryJob: (...args: unknown[]) => mockRunDiscoveryJob(...args),
}));

const mockRunRedditDiscovery = jest.fn();
jest.mock('@/lib/scraper/reddit-discoverer', () => ({
  runRedditDiscovery: (...args: unknown[]) => mockRunRedditDiscovery(...args),
  ALL_REDDIT_SUBREDDITS: ['r/halifax', 'r/newbrunswick'],
}));

const mockRunPlacesDiscovery = jest.fn();
jest.mock('@/lib/scraper/places-discoverer', () => ({
  runPlacesDiscovery: (...args: unknown[]) => mockRunPlacesDiscovery(...args),
  PLACES_CITIES: {
    NS: ['Halifax', 'Dartmouth'],
    NB: ['Moncton', 'Fredericton'],
    PEI: ['Charlottetown'],
    NL: ['St. Johns'],
  },
}));

const mockDbInsert = jest.fn();
jest.mock('@/lib/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  discovery_runs: 'discovery_runs_table',
}));

// Helper: create POST request with dynamic [job] param
function makeRequest(job: string): [Request, { params: Promise<{ job: string }> }] {
  const request = new Request(`http://localhost/api/admin/trigger/${job}`, {
    method: 'POST',
  });
  const params = Promise.resolve({ job });
  return [request, { params }];
}

describe('POST /api/admin/trigger/[job]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no session cookie
    mockGet.mockReturnValue(undefined);
    mockVerifyToken.mockResolvedValue(false);
    // DB insert mock chain: insert().values()
    mockDbInsert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
  });

  // --- Auth tests ---

  it('returns 401 when no session cookie is present', async () => {
    mockGet.mockReturnValue(undefined);
    const [req, ctx] = makeRequest('scrape');
    const response = await POST(req, ctx);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when session token is invalid', async () => {
    mockGet.mockReturnValue({ value: 'bad-token' });
    mockVerifyToken.mockResolvedValue(false);
    const [req, ctx] = makeRequest('scrape');
    const response = await POST(req, ctx);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  // --- Dispatch tests (authenticated) ---

  describe('authenticated requests', () => {
    beforeEach(() => {
      mockGet.mockReturnValue({ value: 'valid-token' });
      mockVerifyToken.mockResolvedValue(true);
    });

    it('job=scrape calls runScrapeJob and returns success with stats', async () => {
      mockRunScrapeJob.mockResolvedValue([
        { province: 'NS', success: 3, failed: 0, skipped: 1, events: 8 },
        { province: 'NB', success: 2, failed: 1, skipped: 0, events: 5 },
        { province: 'PEI', success: 1, failed: 0, skipped: 0, events: 2 },
        { province: 'NL', success: 1, failed: 0, skipped: 0, events: 3 },
      ]);
      const [req, ctx] = makeRequest('scrape');
      const response = await POST(req, ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.scraped).toBe(7);
      expect(body.events).toBe(18);
      expect(body.skipped).toBe(1);
      expect(body.failed).toBe(1);
      expect(body).toHaveProperty('timestamp');
      expect(mockRunScrapeJob).toHaveBeenCalledTimes(1);
    });

    it('job=archive calls archivePastEvents and returns archived count', async () => {
      mockArchivePastEvents.mockResolvedValue({ total: 42 });
      const [req, ctx] = makeRequest('archive');
      const response = await POST(req, ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.archived).toBe(42);
      expect(body).toHaveProperty('timestamp');
      expect(mockArchivePastEvents).toHaveBeenCalledTimes(1);
    });

    it('job=discover calls runDiscoveryJob and returns discovery stats', async () => {
      mockRunDiscoveryJob.mockResolvedValue({
        candidatesFound: 10,
        autoApproved: 3,
        queuedPending: 7,
        errors: 0,
      });
      const [req, ctx] = makeRequest('discover');
      const response = await POST(req, ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.candidatesFound).toBe(10);
      expect(body.autoApproved).toBe(3);
      expect(body.queuedPending).toBe(7);
      expect(body.errors).toBe(0);
      expect(body).toHaveProperty('timestamp');
      expect(mockRunDiscoveryJob).toHaveBeenCalledTimes(1);
    });

    it('job=discover-reddit calls runRedditDiscovery and returns result', async () => {
      mockRunRedditDiscovery.mockResolvedValue({
        candidatesFound: 5,
        autoApproved: 2,
        staged: 3,
        errors: 0,
      });
      const [req, ctx] = makeRequest('discover-reddit');
      const response = await POST(req, ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.candidatesFound).toBe(5);
      expect(body.autoApproved).toBe(2);
      expect(body.staged).toBe(3);
      expect(body).toHaveProperty('timestamp');
      expect(mockRunRedditDiscovery).toHaveBeenCalledTimes(1);
    });

    it('job=discover-places-ns calls runPlacesDiscovery with PLACES_CITIES.NS and returns result', async () => {
      mockRunPlacesDiscovery.mockResolvedValue({
        candidatesFound: 8,
        autoApproved: 4,
        stagedPending: 4,
        enriched: 2,
        errors: 0,
      });
      const [req, ctx] = makeRequest('discover-places-ns');
      const response = await POST(req, ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.candidatesFound).toBe(8);
      expect(body.autoApproved).toBe(4);
      expect(body.stagedPending).toBe(4);
      expect(body).toHaveProperty('timestamp');
      expect(mockRunPlacesDiscovery).toHaveBeenCalledWith(['Halifax', 'Dartmouth']);
    });

    it('returns 400 for unknown job slug', async () => {
      const [req, ctx] = makeRequest('unknown-job');
      const response = await POST(req, ctx);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ success: false, error: 'Unknown job' });
    });

    it('returns 500 when the cron function throws', async () => {
      mockRunScrapeJob.mockRejectedValue(new Error('Scrape failed badly'));
      const [req, ctx] = makeRequest('scrape');
      const response = await POST(req, ctx);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Scrape failed badly');
    });
  });
});
