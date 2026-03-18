/**
 * Reddit discovery engine.
 *
 * Mines Atlantic Canada subreddits for venue mentions, extracts structured data
 * via Gemini, and flows candidates through the existing discovered_sources pipeline.
 *
 * Exports: REDDIT_SUBREDDITS, ALL_REDDIT_SUBREDDITS, runRedditDiscovery,
 *          fetchSubredditPosts, matchesVenueKeywords
 */
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { like } from 'drizzle-orm';
import { getExtractionModel } from '@/lib/ai/model';
import { db } from '@/lib/db/client';
import { discovered_sources } from '@/lib/db/schema';
import { scoreCandidate } from './discovery-orchestrator';
import { promoteSource } from './promote-source';

// ---------------------------------------------------------------------------
// Subreddit configuration
// ---------------------------------------------------------------------------

export interface SubredditEntry {
  subreddit: string;
  province: string;
}

/**
 * Subreddits organized by province.
 * Includes major city subs and province-wide subs for all 4 Atlantic provinces.
 */
export const REDDIT_SUBREDDITS: Record<string, SubredditEntry[]> = {
  NS: [
    { subreddit: 'halifax', province: 'NS' },
    { subreddit: 'novascotia', province: 'NS' },
    { subreddit: 'CapeBreton', province: 'NS' },
    { subreddit: 'lunenburg', province: 'NS' },
  ],
  NB: [
    { subreddit: 'fredericton', province: 'NB' },
    { subreddit: 'moncton', province: 'NB' },
    { subreddit: 'saintjohn', province: 'NB' },
    { subreddit: 'newbrunswickcanada', province: 'NB' },
  ],
  PEI: [
    { subreddit: 'charlottetown', province: 'PEI' },
    { subreddit: 'PEI', province: 'PEI' },
  ],
  NL: [
    { subreddit: 'stjohnsnl', province: 'NL' },
    { subreddit: 'newfoundland', province: 'NL' },
    { subreddit: 'cornerbrook', province: 'NL' },
  ],
};

/** Flat array of all subreddit entries across all provinces. */
export const ALL_REDDIT_SUBREDDITS: SubredditEntry[] = Object.values(REDDIT_SUBREDDITS).flat();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REDDIT_USER_AGENT = 'eastcoastlocal/1.0 (atlantic canada venue discovery)';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

const GEMINI_AUTO_APPROVE = parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9');

/**
 * Keywords for pre-filtering Reddit posts before sending to Gemini.
 * Keeps costs low by skipping posts with no venue/event relevance.
 */
const VENUE_KEYWORDS = [
  'bar',
  'pub',
  'show',
  'concert',
  'gig',
  'venue',
  'music',
  'live',
  'theatre',
  'theater',
  'nightclub',
  'club',
  'tavern',
  'lounge',
  'brewery',
  'festival',
  'performance',
  'band',
  'stage',
  'ticket',
];

// ---------------------------------------------------------------------------
// Types and Schemas
// ---------------------------------------------------------------------------

export interface RedditPost {
  id: string;
  name: string;
  title: string;
  selftext: string;
  created_utc: number;
}

/** Zod schema for Gemini venue extraction output. */
const RedditCandidateSchema = z.array(
  z.object({
    venue_name: z.string(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    address: z.string().nullable(),
    venue_type: z.string().nullable(),
    website_url: z.string().nullable(),
  })
);

export interface RedditDiscoveryRunResult {
  subredditsChecked: number;
  postsScanned: number;
  postsFiltered: number;
  candidatesFound: number;
  staged: number;
  autoApproved: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// fetchSubredditPosts
// ---------------------------------------------------------------------------

/**
 * Fetches the /new.json listing for a subreddit and returns posts within
 * the 7-day recency window. Uses custom User-Agent per Reddit API guidelines.
 */
export async function fetchSubredditPosts(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit API error for r/${subreddit}: ${response.status}`);
  }

  const data = await response.json() as {
    data: {
      children: Array<{ kind: string; data: RedditPost }>;
    };
  };

  const cutoffUtc = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;

  return data.data.children
    .filter((child) => child.kind === 't3')
    .map((child) => child.data)
    .filter((post) => post.created_utc >= cutoffUtc);
}

// ---------------------------------------------------------------------------
// matchesVenueKeywords
// ---------------------------------------------------------------------------

/**
 * Returns true if the post title or selftext contains at least one venue/event keyword.
 * Used as a pre-filter to reduce Gemini API calls.
 */
export function matchesVenueKeywords(post: RedditPost): boolean {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  return VENUE_KEYWORDS.some((keyword) => text.includes(keyword));
}

// ---------------------------------------------------------------------------
// extractVenueCandidates
// ---------------------------------------------------------------------------

/**
 * Sends a batch of posts to Gemini for venue extraction.
 * Returns an array of extracted venue candidates.
 */
async function extractVenueCandidates(
  posts: RedditPost[],
  subreddit: string,
  provinceHint: string
): Promise<z.infer<typeof RedditCandidateSchema>> {
  const postTexts = posts
    .map((p, i) => `[Post ${i + 1} | id: ${p.id}]\nTitle: ${p.title}\n${p.selftext ? `Body: ${p.selftext}` : ''}`)
    .join('\n\n');

  const model = await getExtractionModel();

  const { experimental_output } = await generateText({
    model,
    output: Output.object({ schema: RedditCandidateSchema }),
    prompt: `You are extracting Atlantic Canada venue information from Reddit posts.

For each Reddit post below, identify any specific venues (bars, pubs, theatres, clubs, concert halls, breweries, music venues) that are mentioned by name.

For each venue found:
- venue_name: The venue's name (required)
- city: Extract city from post text if mentioned; otherwise null
- province: Extract province from post text if mentioned; otherwise default to "${provinceHint}"
- address: Street address if mentioned, otherwise null
- venue_type: Type of venue (bar/pub/theatre/club/brewery/etc), or null
- website_url: Website URL if mentioned in post text, otherwise null

Only extract real, named venues. Do not extract general references like "a bar" or "some pub".
Return an empty array if no specific named venues are mentioned.

Subreddit: r/${subreddit} (${provinceHint})

Posts:
${postTexts}`,
  });

  return experimental_output ?? [];
}

// ---------------------------------------------------------------------------
// runRedditDiscovery
// ---------------------------------------------------------------------------

/**
 * Main orchestrator: iterates subreddits, fetches posts, filters by keyword,
 * deduplicates against processed IDs, extracts venues via Gemini, scores,
 * stages in discovered_sources, and auto-approves high-scoring candidates.
 */
export async function runRedditDiscovery(
  subreddits: SubredditEntry[] = ALL_REDDIT_SUBREDDITS
): Promise<RedditDiscoveryRunResult> {
  const result: RedditDiscoveryRunResult = {
    subredditsChecked: 0,
    postsScanned: 0,
    postsFiltered: 0,
    candidatesFound: 0,
    staged: 0,
    autoApproved: 0,
    errors: 0,
  };

  // Step 1: Build set of already-processed post IDs from raw_context
  // raw_context for Reddit posts is stored as 'reddit:t3_{postId}'
  const processedRows = await db
    .select({ raw_context: discovered_sources.raw_context })
    .from(discovered_sources)
    .where(like(discovered_sources.raw_context, 'reddit:t3_%'));

  const processedPostIds = new Set<string>(
    processedRows
      .map((row) => {
        const match = row.raw_context?.match(/^reddit:t3_(.+)$/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null)
  );

  // Step 2: Loop over each subreddit with delay between fetches
  for (let i = 0; i < subreddits.length; i++) {
    const { subreddit, province } = subreddits[i];

    if (i > 0) {
      await delay(1500);
    }

    result.subredditsChecked++;

    try {
      // Fetch posts within 7-day window
      const allPosts = await fetchSubredditPosts(subreddit);
      result.postsScanned += allPosts.length;

      // Keyword pre-filter
      const keywordMatched = allPosts.filter((p) => matchesVenueKeywords(p));

      // Remove already-processed post IDs
      const unprocessedPosts = keywordMatched.filter((p) => !processedPostIds.has(p.id));
      result.postsFiltered += unprocessedPosts.length;

      // Skip Gemini if no posts remain
      if (unprocessedPosts.length === 0) {
        continue;
      }

      // Step 3: Extract venue candidates via Gemini
      const candidates = await extractVenueCandidates(unprocessedPosts, subreddit, province);
      result.candidatesFound += candidates.length;

      // Step 4: Score and stage each candidate
      for (let ci = 0; ci < candidates.length; ci++) {
        const candidate = candidates[ci];

        // Use the first post in the batch as the post ID reference
        // (best effort — batch-level association)
        const sourcePost = unprocessedPosts[ci] ?? unprocessedPosts[0];
        const postId = sourcePost.id;
        const rawContext = `reddit:t3_${postId}`;

        // Determine URL and domain
        const hasWebsiteUrl = Boolean(candidate.website_url);
        const url = hasWebsiteUrl ? candidate.website_url! : rawContext;
        let domain: string;

        if (hasWebsiteUrl) {
          try {
            domain = new URL(candidate.website_url!).hostname;
          } catch {
            domain = `reddit-${subreddit}`;
          }
        } else {
          domain = `reddit-${subreddit}`;
        }

        // Province: use extracted province or fall back to subreddit hint
        const resolvedProvince = candidate.province ?? province;

        // Score the candidate
        const score = scoreCandidate({
          url,
          city: candidate.city ?? null,
          province: resolvedProvince,
          source_name: candidate.venue_name,
        });

        // Stage in discovered_sources
        await db
          .insert(discovered_sources)
          .values({
            url,
            domain,
            source_name: candidate.venue_name,
            province: resolvedProvince,
            city: candidate.city ?? null,
            status: 'pending',
            discovery_method: 'reddit_gemini',
            raw_context: rawContext,
            discovery_score: score,
            address: candidate.address ?? null,
          })
          .onConflictDoNothing();

        result.staged++;

        // Mark this post ID as processed in-memory
        processedPostIds.add(postId);

        // Auto-approve: only for candidates with a real website URL and high score
        if (score >= GEMINI_AUTO_APPROVE && hasWebsiteUrl) {
          const staged = await db.query.discovered_sources.findFirst({
            where: (ds, { eq }) => eq(ds.url, url),
          });

          if (staged && staged.status === 'pending') {
            await promoteSource(staged.id);
            result.autoApproved++;
            console.log(`Reddit auto-approved: ${url} (score: ${score.toFixed(2)})`);
          }
        }
      }
    } catch (err) {
      result.errors++;
      console.error(`Reddit discovery error for r/${subreddit}:`, err);
    }
  }

  console.log(
    `Reddit discovery complete: ${result.subredditsChecked} subreddits, ` +
    `${result.postsScanned} posts scanned, ${result.postsFiltered} filtered, ` +
    `${result.candidatesFound} candidates, ${result.staged} staged, ` +
    `${result.autoApproved} auto-approved, ${result.errors} errors`
  );

  return result;
}
