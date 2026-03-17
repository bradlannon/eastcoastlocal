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
        const url = new URL(_request.url);
        const sourceParam = url.searchParams.get('source');

        if (sourceParam === 'list') {
          const { getStaleSources } = await import('@/lib/scraper/orchestrator');
          const sources = await getStaleSources();
          return NextResponse.json({ success: true, sources });
        }

        if (sourceParam !== null) {
          const sourceId = parseInt(sourceParam, 10);
          if (isNaN(sourceId)) {
            return NextResponse.json({ success: false, error: 'Invalid source ID' }, { status: 400 });
          }
          const { scrapeOneSource } = await import('@/lib/scraper/orchestrator');
          const result = await scrapeOneSource(sourceId);
          return NextResponse.json({
            success: true,
            scraped: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            events: result.events,
            venueName: result.venueName,
            timestamp: new Date().toISOString(),
          });
        }

        // Legacy: run all at once
        const { runScrapeJob } = await import('@/lib/scraper/orchestrator');
        const results = await runScrapeJob();
        const totals = results.reduce(
          (acc, r) => ({ scraped: acc.scraped + r.success, failed: acc.failed + r.failed, skipped: acc.skipped + r.skipped, events: acc.events + r.events }),
          { scraped: 0, failed: 0, skipped: 0, events: 0 }
        );
        return NextResponse.json({ success: true, ...totals, timestamp: new Date().toISOString() });
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
        const { runDiscoveryForCity, ATLANTIC_CITIES } = await import(
          '@/lib/scraper/discovery-orchestrator'
        );
        const url = new URL(_request.url);
        const cityParam = url.searchParams.get('city');

        // Return city list for the frontend progress display
        if (cityParam === 'list') {
          return NextResponse.json({
            success: true,
            cities: ATLANTIC_CITIES.map((c) => `${c.city}, ${c.province}`),
          });
        }

        if (cityParam === null) {
          // Legacy: run all cities (may timeout)
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

        // Single-city mode: ?city=0..5
        const cityIndex = parseInt(cityParam, 10);
        if (isNaN(cityIndex) || cityIndex < 0 || cityIndex >= ATLANTIC_CITIES.length) {
          return NextResponse.json(
            { success: false, error: `Invalid city index (0-${ATLANTIC_CITIES.length - 1})` },
            { status: 400 }
          );
        }

        const startedAt = new Date();
        const result = await runDiscoveryForCity(cityIndex);
        const cityInfo = ATLANTIC_CITIES[cityIndex];

        await db.insert(discovery_runs).values({
          discovery_method: 'gemini_google_search',
          province: cityInfo.province,
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
          cityIndex,
          cityName: cityInfo.city,
          totalCities: ATLANTIC_CITIES.length,
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

      case 'fetch-feeds': {
        const { fetchAllWpEventFeeds } = await import('@/lib/scraper/wordpress-events');
        const results = await fetchAllWpEventFeeds();
        const totals = results.reduce(
          (acc, r) => ({
            feeds: acc.feeds + 1,
            eventsFound: acc.eventsFound + r.eventsFound,
            eventsUpserted: acc.eventsUpserted + r.eventsUpserted,
            errors: acc.errors + r.errors,
          }),
          { feeds: 0, eventsFound: 0, eventsUpserted: 0, errors: 0 }
        );
        return NextResponse.json({
          success: true,
          ...totals,
          timestamp: new Date().toISOString(),
        });
      }

      case 'parse-newsletters': {
        const { parseNewsletters } = await import('@/lib/scraper/newsletter-parser');
        const result = await parseNewsletters();
        return NextResponse.json({
          success: true,
          emailsProcessed: result.emailsProcessed,
          eventsFound: result.eventsFound,
          eventsUpserted: result.eventsUpserted,
          errors: result.errors,
          timestamp: new Date().toISOString(),
        });
      }

      case 'detect-series': {
        const { detectAndTagSeries } = await import('@/lib/series-detector');
        const result = await detectAndTagSeries();
        return NextResponse.json({
          success: true,
          seriesUpserted: result.seriesUpserted,
          eventsTagged: result.eventsTagged,
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
