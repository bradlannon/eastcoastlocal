// Mock db client before importing reddit-discoverer (which imports db)
jest.mock('@/lib/db/client', () => ({
  db: {
    query: {
      discovered_sources: { findFirst: jest.fn() },
    },
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

// Mock discovery-orchestrator (scoreCandidate)
jest.mock('./discovery-orchestrator', () => ({
  scoreCandidate: jest.fn(),
}));

// Mock promote-source
jest.mock('./promote-source', () => ({
  promoteSource: jest.fn(),
}));

// Mock @ai-sdk/google
jest.mock('@ai-sdk/google', () => ({
  google: jest.fn(() => 'mocked-model'),
}));

// Mock ai (generateText, Output)
jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: {
    object: jest.fn(({ schema }) => ({ schema })),
  },
}));

import {
  REDDIT_SUBREDDITS,
  ALL_REDDIT_SUBREDDITS,
  fetchSubredditPosts,
  matchesVenueKeywords,
  runRedditDiscovery,
} from './reddit-discoverer';
import { db } from '@/lib/db/client';
import { scoreCandidate } from './discovery-orchestrator';
import { promoteSource } from './promote-source';
import { generateText } from 'ai';

// Typed mock accessors
const mockDb = db as unknown as {
  query: {
    discovered_sources: { findFirst: jest.Mock };
  };
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};
const mockScoreCandidate = scoreCandidate as jest.Mock;
const mockPromoteSource = promoteSource as jest.Mock;
const mockGenerateText = generateText as jest.Mock;

// ---------------------------------------------------------------------------
// Helper: create a fake Reddit post
// ---------------------------------------------------------------------------
function makePost(overrides?: Partial<{
  id: string;
  name: string;
  title: string;
  selftext: string;
  created_utc: number;
}>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'abc123',
    name: 't3_abc123',
    title: 'Check out the bar downtown',
    selftext: 'Great live music venue',
    created_utc: now - 60 * 60, // 1 hour ago
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a Reddit /new.json API response
// ---------------------------------------------------------------------------
function makeRedditResponse(posts: ReturnType<typeof makePost>[]) {
  return {
    ok: true,
    json: async () => ({
      data: {
        children: posts.map((post) => ({ kind: 't3', data: post })),
      },
    }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// 1. REDDIT_SUBREDDITS has keys for all 4 provinces
// ---------------------------------------------------------------------------
describe('REDDIT_SUBREDDITS', () => {
  it('has entries for all 4 Atlantic provinces', () => {
    expect(REDDIT_SUBREDDITS).toHaveProperty('NS');
    expect(REDDIT_SUBREDDITS).toHaveProperty('NB');
    expect(REDDIT_SUBREDDITS).toHaveProperty('PEI');
    expect(REDDIT_SUBREDDITS).toHaveProperty('NL');
  });

  it('each province has at least 1 subreddit entry', () => {
    for (const province of ['NS', 'NB', 'PEI', 'NL']) {
      expect(REDDIT_SUBREDDITS[province].length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. ALL_REDDIT_SUBREDDITS length equals sum of all province arrays
// ---------------------------------------------------------------------------
describe('ALL_REDDIT_SUBREDDITS', () => {
  it('length equals the sum of all province arrays', () => {
    const expectedLength = Object.values(REDDIT_SUBREDDITS).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    expect(ALL_REDDIT_SUBREDDITS.length).toBe(expectedLength);
  });
});

// ---------------------------------------------------------------------------
// 3. fetchSubredditPosts sends correct User-Agent header and URL
// ---------------------------------------------------------------------------
describe('fetchSubredditPosts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('sends correct User-Agent header and URL', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeRedditResponse([makePost()])
    );

    await fetchSubredditPosts('halifax');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.reddit.com/r/halifax/new.json?limit=100');
    expect((opts.headers as Record<string, string>)['User-Agent']).toContain('eastcoastlocal');
  });

  // ---------------------------------------------------------------------------
  // 4. fetchSubredditPosts filters posts older than 7 days
  // ---------------------------------------------------------------------------
  it('filters posts older than 7 days', async () => {
    const now = Math.floor(Date.now() / 1000);
    const recentPost = makePost({ id: 'recent', created_utc: now - 60 * 60 }); // 1 hour ago
    const oldPost = makePost({
      id: 'old',
      created_utc: now - 8 * 24 * 60 * 60, // 8 days ago
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      makeRedditResponse([recentPost, oldPost])
    );

    const posts = await fetchSubredditPosts('halifax');

    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('recent');
  });
});

// ---------------------------------------------------------------------------
// 5. matchesVenueKeywords returns true for venue-related content
// ---------------------------------------------------------------------------
describe('matchesVenueKeywords', () => {
  it('returns true for post mentioning a bar', () => {
    const post = makePost({ title: 'Great show at the bar tonight', selftext: '' });
    expect(matchesVenueKeywords(post)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 6. matchesVenueKeywords returns false for non-venue content
  // ---------------------------------------------------------------------------
  it('returns false for unrelated post', () => {
    const post = makePost({ title: 'Anyone know a good plumber?', selftext: 'Need help with pipes' });
    expect(matchesVenueKeywords(post)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runRedditDiscovery integration tests
// ---------------------------------------------------------------------------
describe('runRedditDiscovery', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, GEMINI_AUTO_APPROVE: '0.9' };

    // Default: no existing processed post IDs
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    // Default: promoteSource resolves
    mockPromoteSource.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // 7. Skips Gemini when no posts match keywords
  // ---------------------------------------------------------------------------
  it('does not call generateText when no posts match venue keywords', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      makeRedditResponse([
        makePost({ title: 'Anyone know a good plumber?', selftext: 'Need pipes fixed' }),
      ])
    );

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 8. Gemini extraction produces candidates with venue_name, city, province
  // ---------------------------------------------------------------------------
  it('calls generateText with post text for venue extraction', async () => {
    const post = makePost({ id: 'post1', title: 'Live music at The Seahorse tonight!' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        { venue_name: 'The Seahorse Tavern', city: 'Halifax', province: 'NS', address: null, venue_type: 'bar', website_url: null },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.75);
    mockDb.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue([]),
      }),
    });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('The Seahorse');
  });

  // ---------------------------------------------------------------------------
  // 9. Stages candidate with extracted URL: url=extracted, status=pending, discovery_method=reddit_gemini
  // ---------------------------------------------------------------------------
  it('stages candidate with extracted URL as pending with discovery_method=reddit_gemini', async () => {
    const post = makePost({ id: 'post1', title: 'Check out the pub on their website' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'The Pub',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'pub',
          website_url: 'https://thepub.ca',
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.75);

    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(insertValues).toHaveBeenCalledTimes(1);
    const insertedValues = insertValues.mock.calls[0][0];
    expect(insertedValues.url).toBe('https://thepub.ca');
    expect(insertedValues.status).toBe('pending');
    expect(insertedValues.discovery_method).toBe('reddit_gemini');
  });

  // ---------------------------------------------------------------------------
  // 10. Stages candidate without URL: url=reddit:t3_{id}, status=pending, domain=reddit-{subreddit}
  // ---------------------------------------------------------------------------
  it('stages candidate without URL using synthetic reddit:t3_ url', async () => {
    const post = makePost({ id: 'post1', name: 't3_post1', title: 'Great venue concert last night' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'Some Venue',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'bar',
          website_url: null,
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.75);

    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(insertValues).toHaveBeenCalledTimes(1);
    const insertedValues = insertValues.mock.calls[0][0];
    expect(insertedValues.url).toBe('reddit:t3_post1');
    expect(insertedValues.status).toBe('pending');
    expect(insertedValues.domain).toBe('reddit-halifax');
  });

  // ---------------------------------------------------------------------------
  // 11. Province hint from subreddit mapping used as fallback in province field
  // ---------------------------------------------------------------------------
  it('uses subreddit province hint as fallback when Gemini returns null province', async () => {
    const post = makePost({ id: 'post1', title: 'Live music at the bar' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'Bar',
          city: 'Halifax',
          province: null, // Gemini did not extract province
          address: null,
          venue_type: 'bar',
          website_url: null,
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.7);

    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(insertValues).toHaveBeenCalledTimes(1);
    const insertedValues = insertValues.mock.calls[0][0];
    expect(insertedValues.province).toBe('NS');
  });

  // ---------------------------------------------------------------------------
  // 12. Score >= 0.9 triggers promoteSource call (auto-approve)
  // ---------------------------------------------------------------------------
  it('calls promoteSource when score >= 0.9 and candidate has website URL', async () => {
    const post = makePost({ id: 'post1', title: 'Pub gig tonight' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'The Pub',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'pub',
          website_url: 'https://thepub.ca',
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.9);

    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    // Mock the query to find the inserted row
    mockDb.query.discovered_sources.findFirst.mockResolvedValue({
      id: 42,
      status: 'pending',
      url: 'https://thepub.ca',
    });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(mockPromoteSource).toHaveBeenCalledWith(42);
  });

  // ---------------------------------------------------------------------------
  // 13. Score < 0.9 does not call promoteSource
  // ---------------------------------------------------------------------------
  it('does not call promoteSource when score < 0.9', async () => {
    const post = makePost({ id: 'post1', title: 'Bar music show' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'Bar',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'bar',
          website_url: 'https://bar.ca',
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.75);

    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    expect(mockPromoteSource).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 14. Already-processed post IDs are skipped
  // ---------------------------------------------------------------------------
  it('skips posts whose IDs have already been processed', async () => {
    const processedPost = makePost({ id: 'processed1', title: 'Live concert venue show' });
    const newPost = makePost({ id: 'new1', title: 'Pub gig tonight music bar' });

    jest.spyOn(global, 'fetch').mockResolvedValue(
      makeRedditResponse([processedPost, newPost])
    );

    // Return processed IDs from DB query
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([
          { raw_context: 'reddit:t3_processed1' },
        ]),
      }),
    });

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'New Venue',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'bar',
          website_url: null,
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.7);
    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    await runRedditDiscovery(singleSub);

    // Gemini should be called with only the new post
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain('processed1');
  });

  // ---------------------------------------------------------------------------
  // 15. runRedditDiscovery returns correct result counts
  // ---------------------------------------------------------------------------
  it('returns correct result counts', async () => {
    const post = makePost({ id: 'post1', title: 'Music bar venue show' });

    jest.spyOn(global, 'fetch').mockResolvedValue(makeRedditResponse([post]));

    mockGenerateText.mockResolvedValue({
      experimental_output: [
        {
          venue_name: 'Bar',
          city: 'Halifax',
          province: 'NS',
          address: null,
          venue_type: 'bar',
          website_url: null,
        },
      ],
    });

    mockScoreCandidate.mockReturnValue(0.75);
    const insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({ values: insertValues });

    const singleSub = [{ subreddit: 'halifax', province: 'NS' }];
    const result = await runRedditDiscovery(singleSub);

    expect(result).toMatchObject({
      subredditsChecked: 1,
      postsScanned: expect.any(Number),
      postsFiltered: expect.any(Number),
      candidatesFound: expect.any(Number),
      staged: expect.any(Number),
      autoApproved: 0,
      errors: 0,
    });
    expect(result.postsScanned).toBeGreaterThanOrEqual(1);
    expect(result.postsFiltered).toBeGreaterThanOrEqual(1);
    expect(result.candidatesFound).toBeGreaterThanOrEqual(1);
    expect(result.staged).toBeGreaterThanOrEqual(1);
  });
});
