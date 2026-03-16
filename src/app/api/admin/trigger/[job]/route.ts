import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { discovery_runs } from '@/lib/db/schema';

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ job: string }> }
): Promise<Response> {
  // Session auth — admin browser session only (not CRON_SECRET)
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { job } = await params;

  try {
    switch (job) {
      case 'scrape': {
        const { runScrapeJob } = await import('@/lib/scraper/orchestrator');
        await runScrapeJob();
        return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
      }

      case 'archive': {
        const { archivePastEvents } = await import('@/lib/archiver');
        const result = await archivePastEvents();
        return NextResponse.json({
          success: true,
          archived: result.total,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover': {
        const { runDiscoveryJob } = await import('@/lib/scraper/discovery-orchestrator');
        const startedAt = new Date();
        const result = await runDiscoveryJob();
        await db.insert(discovery_runs).values({
          discovery_method: 'gemini_google_search',
          province: null,
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.queuedPending,
          skipped_dedup: 0,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover-reddit': {
        const { runRedditDiscovery, ALL_REDDIT_SUBREDDITS } = await import(
          '@/lib/scraper/reddit-discoverer'
        );
        const startedAt = new Date();
        const result = await runRedditDiscovery(ALL_REDDIT_SUBREDDITS);
        await db.insert(discovery_runs).values({
          discovery_method: 'reddit_gemini',
          province: null,
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.staged,
          skipped_dedup: 0,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover-places-ns': {
        const { runPlacesDiscovery, PLACES_CITIES } = await import(
          '@/lib/scraper/places-discoverer'
        );
        const startedAt = new Date();
        const result = await runPlacesDiscovery(PLACES_CITIES.NS);
        await db.insert(discovery_runs).values({
          discovery_method: 'google_places',
          province: 'NS',
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.stagedPending,
          skipped_dedup: result.enriched,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover-places-nb': {
        const { runPlacesDiscovery, PLACES_CITIES } = await import(
          '@/lib/scraper/places-discoverer'
        );
        const startedAt = new Date();
        const result = await runPlacesDiscovery(PLACES_CITIES.NB);
        await db.insert(discovery_runs).values({
          discovery_method: 'google_places',
          province: 'NB',
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.stagedPending,
          skipped_dedup: result.enriched,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover-places-pei': {
        const { runPlacesDiscovery, PLACES_CITIES } = await import(
          '@/lib/scraper/places-discoverer'
        );
        const startedAt = new Date();
        const result = await runPlacesDiscovery(PLACES_CITIES.PEI);
        await db.insert(discovery_runs).values({
          discovery_method: 'google_places',
          province: 'PEI',
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.stagedPending,
          skipped_dedup: result.enriched,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      case 'discover-places-nl': {
        const { runPlacesDiscovery, PLACES_CITIES } = await import(
          '@/lib/scraper/places-discoverer'
        );
        const startedAt = new Date();
        const result = await runPlacesDiscovery(PLACES_CITIES.NL);
        await db.insert(discovery_runs).values({
          discovery_method: 'google_places',
          province: 'NL',
          started_at: startedAt,
          completed_at: new Date(),
          candidates_found: result.candidatesFound,
          auto_approved: result.autoApproved,
          queued_pending: result.stagedPending,
          skipped_dedup: result.enriched,
          errors: result.errors,
        });
        return NextResponse.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 400 });
    }
  } catch (err) {
    console.error(`Admin trigger job '${job}' failed:`, err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
