'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type JobResult = { success: boolean; message: string; isWarning?: boolean; progress?: string } | null;

const DISCOVERY_OPTIONS = [
  { label: 'Gemini Search', job: 'discover' },
  { label: 'Reddit', job: 'discover-reddit' },
  { label: 'Places NS', job: 'discover-places-ns' },
  { label: 'Places NB', job: 'discover-places-nb' },
  { label: 'Places PEI', job: 'discover-places-pei' },
  { label: 'Places NL', job: 'discover-places-nl' },
] as const;

const TOOLTIPS: Record<string, string> = {
  scrape:
    'Scrape all enabled venue websites for new events. Runs all 4 provinces concurrently. Sources scraped within the last 4 hours are skipped. Uses Gemini AI to extract event data from venue pages, or JSON-LD structured data when available. Runs daily at 6:00 AM UTC.',
  discover:
    'Use Gemini Google Search to find new venue websites across Atlantic Canada. Discovered candidates appear in the Discovery Review tab for approval. Approved venues are added to the scraper. Runs weekly on Mondays.',
  'discover-reddit':
    'Scan Atlantic Canada subreddits (r/halifax, r/newbrunswick, etc.) for posts mentioning events or venues. Uses Gemini to extract venue candidates from Reddit posts. Runs weekly on Fridays.',
  'discover-places-ns':
    'Search Google Places API for bars, music venues, theatres, and event spaces in Nova Scotia cities. Pre-geocodes results and checks for duplicates against existing venues.',
  'discover-places-nb':
    'Search Google Places API for event venues in New Brunswick cities (Moncton, Fredericton, Saint John, etc.).',
  'discover-places-pei':
    'Search Google Places API for event venues in PEI (Charlottetown, Summerside, etc.).',
  'discover-places-nl':
    "Search Google Places API for event venues in Newfoundland & Labrador (St. John's, Corner Brook, etc.).",
  archive:
    'Move past events (event_date < today) to archived status. Archived events are hidden from the public map but preserved in the database. Runs daily at 7:00 AM UTC.',
  'fetch-feeds':
    'Pull events from 6 regional API feeds: Tourism Nova Scotia, Halifax Events, Destination St. John\'s, Theatre Nova Scotia, Dalhousie University, and Tourism PEI. Creates venues automatically with dedup matching. Runs daily at 6:30 AM UTC.',
  'parse-newsletters':
    'Read unread emails from the Gmail label "ECL/events" and use Gemini AI to extract events from newsletter content. Automatically creates venues and upserts events. Subscribe to tourism boards, venue mailing lists, and arts councils to populate events passively. Runs daily at 7:30 AM UTC.',
  'detect-series':
    'Scan events for recurring weekly patterns (same performer at same venue). Groups them into recurring series and tags events with series IDs. Series events show a "Recurring" badge on the public map. Runs daily at 6:10 AM UTC.',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatSuccessMessage(job: string, body: any): string {
  if (job === 'scrape') {
    const parts = [`${body.scraped} scraped`, `${body.events} events`];
    if (body.skipped > 0) parts.push(`${body.skipped} skipped`);
    if (body.failed > 0) parts.push(`${body.failed} failed`);
    return `Scrape complete — ${parts.join(', ')}`;
  }
  if (job === 'archive') {
    return `Archived ${body.archived} events`;
  }
  if (job === 'discover') {
    return `Discovery complete — ${body.candidatesFound} found, ${body.autoApproved} approved`;
  }
  if (job === 'discover-reddit') {
    return `Reddit discovery — ${body.candidatesFound} found, ${body.autoApproved} approved`;
  }
  if (job.startsWith('discover-places-')) {
    return `Places discovery — ${body.candidatesFound} found, ${body.autoApproved} approved`;
  }
  if (job === 'fetch-feeds') {
    return `Feeds complete — ${body.eventsUpserted}/${body.eventsFound} events from ${body.feeds} feeds`;
  }
  if (job === 'parse-newsletters') {
    const parts = [`${body.emailsProcessed} emails`, `${body.eventsUpserted}/${body.eventsFound} events`];
    if (body.errors > 0) parts.push(`${body.errors} errors`);
    return `Newsletters — ${parts.join(', ')}`;
  }
  if (job === 'detect-series') {
    return `Series detection — ${body.seriesUpserted} series, ${body.eventsTagged} events tagged`;
  }
  return 'Job complete';
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1.5 cursor-help">
      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg z-50 leading-relaxed">
        {text}
      </span>
    </span>
  );
}

export default function TriggerActions() {
  const router = useRouter();
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [result, setResultRaw] = useState<JobResult>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('ecl-job-result');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [discoveryType, setDiscoveryType] = useState('discover');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Wrapper that persists result to localStorage
  function setResult(value: JobResult | ((prev: JobResult) => JobResult)) {
    setResultRaw((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        if (next) {
          localStorage.setItem('ecl-job-result', JSON.stringify(next));
        } else {
          localStorage.removeItem('ecl-job-result');
        }
      } catch { /* ignore */ }
      return next;
    });
  }

  // Auto-dismiss toast after 8 seconds (only for final results, not progress)
  useEffect(() => {
    if (result && !result.isWarning) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = setTimeout(() => {
        setResult(null);
      }, 8_000);
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [result]);

  async function trigger(job: string) {
    setRunningJob(job);
    setResult(null);

    // Gemini discovery: run one city at a time to avoid 60s timeout
    if (job === 'discover') {
      cancelledRef.current = false;
      const totals = { candidatesFound: 0, autoApproved: 0, queuedPending: 0, errors: 0 };

      // Fetch city list first
      setResult({ success: true, message: 'Loading city list...', isWarning: true });
      let cities: string[] = [];
      try {
        const listRes = await fetch('/api/admin/trigger/discover?city=list', { method: 'POST' });
        const listBody = await listRes.json();
        cities = listBody.cities ?? [];
      } catch {
        setResult({ success: false, message: 'Failed to load city list' });
        setRunningJob(null);
        return;
      }

      for (let i = 0; i < cities.length; i++) {
        if (cancelledRef.current) {
          setResult({
            success: true,
            message: `Cancelled after ${i}/${cities.length} — ${totals.candidatesFound} found, ${totals.autoApproved} approved`,
            isWarning: true,
          });
          // Let auto-dismiss handle it by marking as non-warning after a moment
          setTimeout(() => setResult((prev) => prev ? { ...prev, isWarning: false } : null), 100);
          setRunningJob(null);
          router.refresh();
          return;
        }

        setResult({
          success: true,
          message: `Searching ${i + 1}/${cities.length}... ${cities[i]}`,
          isWarning: true,
        });

        try {
          const res = await fetch(`/api/admin/trigger/discover?city=${i}`, { method: 'POST' });
          const body = await res.json();
          if (body.success) {
            totals.candidatesFound += body.candidatesFound ?? 0;
            totals.autoApproved += body.autoApproved ?? 0;
            totals.queuedPending += body.queuedPending ?? 0;
            totals.errors += body.errors ?? 0;
          } else {
            totals.errors++;
          }
        } catch {
          totals.errors++;
        }
      }

      setResult({
        success: totals.errors === 0,
        message: `Discovery complete — ${totals.candidatesFound} found, ${totals.autoApproved} approved${totals.errors > 0 ? `, ${totals.errors} errors` : ''}`,
      });
      setRunningJob(null);
      router.refresh();
      return;
    }

    // Scrape: run one source at a time to avoid 60s timeout
    if (job === 'scrape') {
      cancelledRef.current = false;
      const totals = { scraped: 0, failed: 0, events: 0 };

      setResult({ success: true, message: 'Loading sources...', isWarning: true });
      let sources: Array<{ id: number; venueName: string; province: string }> = [];
      try {
        const listRes = await fetch('/api/admin/trigger/scrape?source=list', { method: 'POST' });
        const listBody = await listRes.json();
        sources = listBody.sources ?? [];
      } catch {
        setResult({ success: false, message: 'Failed to load source list' });
        setRunningJob(null);
        return;
      }

      if (sources.length === 0) {
        setResult({ success: true, message: 'No stale sources to scrape' });
        setRunningJob(null);
        return;
      }

      for (let i = 0; i < sources.length; i++) {
        if (cancelledRef.current) {
          setResult({
            success: true,
            message: `Cancelled after ${i}/${sources.length} — ${totals.scraped} scraped, ${totals.events} events`,
            isWarning: true,
          });
          setTimeout(() => setResult((prev) => prev ? { ...prev, isWarning: false } : null), 100);
          setRunningJob(null);
          router.refresh();
          return;
        }

        const src = sources[i];
        setResult({
          success: true,
          message: `Scraping ${i + 1}/${sources.length}... ${src.venueName} (${src.province})`,
          isWarning: true,
        });

        try {
          const res = await fetch(`/api/admin/trigger/scrape?source=${src.id}`, { method: 'POST' });
          const body = await res.json();
          if (body.success) {
            totals.scraped += body.scraped ?? 0;
            totals.failed += body.failed ?? 0;
            totals.events += body.events ?? 0;
          } else {
            totals.failed++;
          }
        } catch {
          totals.failed++;
        }
      }

      const parts = [`${totals.scraped} scraped`, `${totals.events} events`];
      if (totals.failed > 0) parts.push(`${totals.failed} failed`);
      setResult({
        success: totals.failed === 0,
        message: `Scrape complete — ${parts.join(', ')}`,
      });
      setRunningJob(null);
      router.refresh();
      return;
    }

    // All other jobs: single request
    const startTime = Date.now();
    const warningTimer = setTimeout(() => {
      setResult({
        success: true,
        message: 'Still running... (Vercel timeout at 60s)',
        isWarning: true,
      });
    }, 30_000);

    try {
      const res = await fetch(`/api/admin/trigger/${job}`, { method: 'POST' });
      clearTimeout(warningTimer);
      const body = await res.json();
      if (body.success) {
        const msg = formatSuccessMessage(job, body);
        setResult({ success: true, message: msg });
        router.refresh();
      } else {
        setResult({ success: false, message: `Failed: ${body.error}` });
      }
    } catch (err) {
      clearTimeout(warningTimer);
      const elapsed = Date.now() - startTime;
      if (elapsed >= 58_000) {
        setResult({ success: false, message: 'Job may still be running on the server' });
      } else {
        setResult({ success: false, message: `Failed: ${String(err)}` });
      }
    } finally {
      setRunningJob(null);
    }
  }

  const isAnyJobRunning = runningJob !== null;

  function Spinner() {
    return (
      <span
        aria-hidden="true"
        className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full ml-2"
      />
    );
  }

  const buttonClass =
    'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center';

  const selectClass =
    'px-3 py-2 border border-gray-300 text-sm rounded-md text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Actions</h2>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex flex-wrap gap-4">
          {/* Run Scrape */}
          <div className="inline-flex items-center">
            {runningJob === 'scrape' ? (
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 inline-flex items-center"
                onClick={() => { cancelledRef.current = true; }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={isAnyJobRunning}
                onClick={() => trigger('scrape')}
              >
                Run Scrape
              </button>
            )}
            <Tooltip text={TOOLTIPS.scrape} />
          </div>

          {/* Discovery group */}
          <div className="inline-flex items-center gap-2">
            <select
              className={selectClass}
              value={discoveryType}
              disabled={isAnyJobRunning}
              onChange={(e) => setDiscoveryType(e.target.value)}
              aria-label="Discovery type"
            >
              {DISCOVERY_OPTIONS.map((opt) => (
                <option key={opt.job} value={opt.job}>
                  {opt.label}
                </option>
              ))}
            </select>
            {runningJob === 'discover' ? (
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 inline-flex items-center"
                onClick={() => { cancelledRef.current = true; }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={isAnyJobRunning}
                onClick={() => trigger(discoveryType)}
              >
                Run Discovery
                {runningJob === discoveryType &&
                  DISCOVERY_OPTIONS.some((o) => o.job === discoveryType) && <Spinner />}
              </button>
            )}
            <Tooltip text={TOOLTIPS[discoveryType] ?? 'Run the selected discovery method.'} />
          </div>

          {/* Run Archive */}
          <div className="inline-flex items-center">
            <button
              type="button"
              className={buttonClass}
              disabled={isAnyJobRunning}
              onClick={() => trigger('archive')}
            >
              Run Archive
              {runningJob === 'archive' && <Spinner />}
            </button>
            <Tooltip text={TOOLTIPS.archive} />
          </div>

          {/* Fetch Feeds */}
          <div className="inline-flex items-center">
            <button
              type="button"
              className={buttonClass}
              disabled={isAnyJobRunning}
              onClick={() => trigger('fetch-feeds')}
            >
              Fetch Feeds
              {runningJob === 'fetch-feeds' && <Spinner />}
            </button>
            <Tooltip text={TOOLTIPS['fetch-feeds']} />
          </div>

          {/* Parse Newsletters */}
          <div className="inline-flex items-center">
            <button
              type="button"
              className={buttonClass}
              disabled={isAnyJobRunning}
              onClick={() => trigger('parse-newsletters')}
            >
              Parse Newsletters
              {runningJob === 'parse-newsletters' && <Spinner />}
            </button>
            <Tooltip text={TOOLTIPS['parse-newsletters']} />
          </div>

          {/* Detect Series */}
          <div className="inline-flex items-center">
            <button
              type="button"
              className={buttonClass}
              disabled={isAnyJobRunning}
              onClick={() => trigger('detect-series')}
            >
              Detect Series
              {runningJob === 'detect-series' && <Spinner />}
            </button>
            <Tooltip text={TOOLTIPS['detect-series']} />
          </div>
        </div>

        {/* Result toast */}
        {result && (
          <div
            className={`text-sm rounded-md px-4 py-2 mt-4 ${
              result.isWarning
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : result.success
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
