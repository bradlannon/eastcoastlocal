'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  step: string;
  message: string;
}

const DISCOVERY_OPTIONS = [
  { label: 'Gemini Search', job: 'discover' },
  { label: 'Reddit', job: 'discover-reddit' },
  { label: 'Places NS', job: 'discover-places-ns' },
  { label: 'Places NB', job: 'discover-places-nb' },
  { label: 'Places PEI', job: 'discover-places-pei' },
  { label: 'Places NL', job: 'discover-places-nl' },
] as const;

// ─── Component ───────────────────────────────────────────────────────────

export default function TriggerActions() {
  const router = useRouter();
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [discoveryType, setDiscoveryType] = useState('discover');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const cancelledRef = useRef(false);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Auto-scroll log to bottom, but only if user hasn't scrolled up
  useEffect(() => {
    const container = logContainerRef.current;
    if (!container || userScrolledUpRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  // Restore logs from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('ecl-logs');
      if (stored) setLogs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Persist logs to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('ecl-logs', JSON.stringify(logs.slice(-200)));
    } catch { /* ignore */ }
  }, [logs]);

  const log = useCallback((level: LogEntry['level'], step: string, message: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-CA', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-199), { id: logIdRef.current++, timestamp: ts, level, step, message }]);
  }, []);

  const isAnyJobRunning = runningJob !== null;

  // ─── Job runners ─────────────────────────────────────────────────────

  async function triggerSingleJob(job: string) {
    setRunningJob(job);
    const label = jobLabel(job);
    log('info', label, 'Starting...');

    try {
      const res = await fetch(`/api/admin/trigger/${job}`, { method: 'POST' });
      const body = await res.json();
      if (body.success) {
        log('success', label, formatResult(job, body));
      } else {
        log('error', label, `Failed: ${body.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      log('error', label, `Request failed: ${String(err)}`);
    }
    setRunningJob(null);
    const scrollY = window.scrollY;
    router.refresh();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  async function triggerFeeds() {
    cancelledRef.current = false;
    setRunningJob('fetch-feeds');
    log('info', 'Feeds', 'Loading feed list...');

    let feeds: Array<{ id: string; name: string }> = [];
    let discordGuilds = 0;
    try {
      const listRes = await fetch('/api/admin/trigger/fetch-feeds?feed=list', { method: 'POST' });
      const listBody = await listRes.json();
      feeds = listBody.feeds ?? [];
      discordGuilds = listBody.discordGuilds ?? 0;
    } catch {
      log('error', 'Feeds', 'Failed to load feed list');
      setRunningJob(null);
      return;
    }

    log('info', 'Feeds', `${feeds.length} feeds + ${discordGuilds} Discord guilds`);
    let totalFound = 0, totalUpserted = 0, errors = 0;

    for (let i = 0; i < feeds.length; i++) {
      if (cancelledRef.current) {
        log('warn', 'Feeds', `Cancelled after ${i}/${feeds.length} feeds`);
        break;
      }
      try {
        const res = await fetch(`/api/admin/trigger/fetch-feeds?feed=${feeds[i].id}`, { method: 'POST' });
        const body = await res.json();
        if (body.success) {
          totalFound += body.eventsFound ?? 0;
          totalUpserted += body.eventsUpserted ?? 0;
          if ((body.eventsUpserted ?? 0) > 0) {
            log('success', 'Feeds', `${feeds[i].name}: ${body.eventsUpserted}/${body.eventsFound} events`);
          } else if ((body.errors ?? 0) > 0) {
            errors++;
            log('error', 'Feeds', `${feeds[i].name}: failed`);
          } else {
            log('info', 'Feeds', `${feeds[i].name}: 0 events`);
          }
        } else {
          errors++;
          log('error', 'Feeds', `${feeds[i].name}: ${body.error ?? 'failed'}`);
        }
      } catch (err) {
        errors++;
        log('error', 'Feeds', `${feeds[i].name}: ${String(err)}`);
      }
    }

    // Discord guilds
    if (!cancelledRef.current && discordGuilds > 0) {
      log('info', 'Feeds', `Scanning ${discordGuilds} Discord guilds...`);
      try {
        const res = await fetch('/api/admin/trigger/fetch-feeds?feed=discord', { method: 'POST' });
        const body = await res.json();
        if (body.success) {
          totalFound += body.eventsFound ?? 0;
          totalUpserted += body.eventsUpserted ?? 0;
          log('success', 'Feeds', `Discord: ${body.eventsUpserted}/${body.eventsFound} events from ${body.guilds} guilds`);
        } else {
          errors++;
          log('error', 'Feeds', `Discord: ${body.error ?? 'failed'}`);
        }
      } catch (err) {
        errors++;
        log('error', 'Feeds', `Discord: ${String(err)}`);
      }
    }

    log(errors > 0 ? 'warn' : 'success', 'Feeds', `Done: ${totalUpserted}/${totalFound} events, ${errors} errors`);
    setRunningJob(null);
    const scrollY = window.scrollY;
    router.refresh();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  async function triggerScrape() {
    cancelledRef.current = false;
    setRunningJob('scrape');
    log('info', 'Scrape', 'Loading stale sources...');

    let sources: Array<{ id: number; venueName: string; province: string; sourceType: string }> = [];
    try {
      const listRes = await fetch('/api/admin/trigger/scrape?source=list', { method: 'POST' });
      const listBody = await listRes.json();
      sources = listBody.sources ?? [];
    } catch {
      log('error', 'Scrape', 'Failed to load source list');
      setRunningJob(null);
      return;
    }

    if (sources.length === 0) {
      log('success', 'Scrape', 'No stale sources to scrape');
      setRunningJob(null);
      return;
    }

    log('info', 'Scrape', `${sources.length} stale sources to scrape`);
    let success = 0, failed = 0, totalEvents = 0;

    for (let i = 0; i < sources.length; i++) {
      if (cancelledRef.current) {
        log('warn', 'Scrape', `Cancelled after ${i}/${sources.length} (${success} ok, ${totalEvents} events)`);
        break;
      }
      const src = sources[i];
      try {
        const res = await fetch(`/api/admin/trigger/scrape?source=${src.id}`, { method: 'POST' });
        const body = await res.json();
        if (body.success) {
          success++;
          totalEvents += body.events ?? 0;
          if ((body.events ?? 0) > 0) {
            log('success', 'Scrape', `${src.venueName} (${src.province}): ${body.events} events`);
          } else {
            log('info', 'Scrape', `${src.venueName} (${src.province}): 0 events`);
          }
        } else {
          failed++;
          log('error', 'Scrape', `${src.venueName} (${src.province}): failed`);
        }
      } catch {
        failed++;
        log('error', 'Scrape', `${src.venueName} (${src.province}): timeout/error`);
      }
    }

    log(failed > 0 ? 'warn' : 'success', 'Scrape', `Done: ${success} ok, ${failed} failed, ${totalEvents} events`);
    setRunningJob(null);
    const scrollY = window.scrollY;
    router.refresh();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  async function triggerDiscovery() {
    const job = discoveryType;
    const isPlaces = job.startsWith('discover-places-');
    const isCityIterable = job === 'discover' || isPlaces;

    if (!isCityIterable) {
      return triggerSingleJob(job);
    }

    cancelledRef.current = false;
    setRunningJob(job);
    const label = jobLabel(job);
    log('info', label, 'Loading city list...');

    let cities: string[] = [];
    try {
      const listRes = await fetch(`/api/admin/trigger/${job}?city=list`, { method: 'POST' });
      const listBody = await listRes.json();
      cities = listBody.cities ?? [];
    } catch {
      log('error', label, 'Failed to load city list');
      setRunningJob(null);
      return;
    }

    log('info', label, `Searching ${cities.length} cities`);
    let totalFound = 0, totalApproved = 0, errors = 0;

    let totalPending = 0, totalNoWebsite = 0, totalEnriched = 0;

    for (let i = 0; i < cities.length; i++) {
      if (cancelledRef.current) {
        log('warn', label, `Cancelled after ${i}/${cities.length} cities`);
        break;
      }
      try {
        const res = await fetch(`/api/admin/trigger/${job}?city=${i}`, { method: 'POST' });
        const body = await res.json();
        if (body.success) {
          const found = body.candidatesFound ?? 0;
          const approved = body.autoApproved ?? 0;
          const pending = body.stagedPending ?? 0;
          const noWebsite = body.stagedNoWebsite ?? 0;
          const enriched = body.enriched ?? 0;
          totalFound += found;
          totalApproved += approved;
          totalPending += pending;
          totalNoWebsite += noWebsite;
          totalEnriched += enriched;
          if (found > 0) {
            const parts = [`${found} found`];
            if (approved > 0) parts.push(`${approved} approved`);
            if (pending > 0) parts.push(`${pending} pending review`);
            if (enriched > 0) parts.push(`${enriched} existing updated`);
            if (noWebsite > 0) parts.push(`${noWebsite} no website`);
            log(approved > 0 ? 'success' : 'info', label, `${cities[i]}: ${parts.join(', ')}`);
          }
        } else {
          errors++;
          log('error', label, `${cities[i]}: ${body.error ?? 'failed'}`);
        }
      } catch (err) {
        errors++;
        log('error', label, `${cities[i]}: ${String(err)}`);
      }
    }

    const summary = [`${totalFound} found`, `${totalApproved} auto-approved`, `${totalPending} pending review`];
    if (totalEnriched > 0) summary.push(`${totalEnriched} existing updated`);
    if (totalNoWebsite > 0) summary.push(`${totalNoWebsite} no website`);
    if (errors > 0) summary.push(`${errors} errors`);
    log(errors > 0 ? 'warn' : 'success', label, `Done: ${summary.join(', ')}`);
    setRunningJob(null);
    const scrollY = window.scrollY;
    router.refresh();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  async function runFullSync() {
    cancelledRef.current = false;
    setRunningJob('full-sync');
    log('info', 'Full Sync', '--- Starting full sync ---');

    const steps: Array<{ label: string; run: () => Promise<void> }> = [
      {
        label: 'Feeds + Discord',
        run: async () => {
          // Load feed list
          let feeds: Array<{ id: string; name: string }> = [];
          let discordGuilds = 0;
          try {
            const listRes = await fetch('/api/admin/trigger/fetch-feeds?feed=list', { method: 'POST' });
            const listBody = await listRes.json();
            feeds = listBody.feeds ?? [];
            discordGuilds = listBody.discordGuilds ?? 0;
          } catch {
            log('error', 'Feeds', 'Failed to load feed list');
            return;
          }

          log('info', 'Feeds', `${feeds.length} feeds + ${discordGuilds} Discord guilds`);
          let totalFound = 0, totalUpserted = 0, feedErrors = 0;

          for (const feed of feeds) {
            if (cancelledRef.current) { log('warn', 'Feeds', 'Cancelled'); break; }
            try {
              const res = await fetch(`/api/admin/trigger/fetch-feeds?feed=${feed.id}`, { method: 'POST' });
              const body = await res.json();
              if (body.success) {
                totalFound += body.eventsFound ?? 0;
                totalUpserted += body.eventsUpserted ?? 0;
                if ((body.eventsUpserted ?? 0) > 0) {
                  log('success', 'Feeds', `${feed.name}: ${body.eventsUpserted}/${body.eventsFound} events`);
                } else if ((body.errors ?? 0) > 0) {
                  feedErrors++;
                  log('error', 'Feeds', `${feed.name}: failed`);
                }
              } else {
                feedErrors++;
                log('error', 'Feeds', `${feed.name}: ${body.error ?? 'failed'}`);
              }
            } catch {
              feedErrors++;
              log('error', 'Feeds', `${feed.name}: timeout`);
            }
          }

          // Discord
          if (!cancelledRef.current && discordGuilds > 0) {
            log('info', 'Feeds', `Scanning ${discordGuilds} Discord guilds...`);
            try {
              const res = await fetch('/api/admin/trigger/fetch-feeds?feed=discord', { method: 'POST' });
              const body = await res.json();
              if (body.success) {
                totalFound += body.eventsFound ?? 0;
                totalUpserted += body.eventsUpserted ?? 0;
                log('success', 'Feeds', `Discord: ${body.eventsUpserted}/${body.eventsFound} events from ${body.guilds} guilds`);
              } else {
                feedErrors++;
                log('error', 'Feeds', `Discord: ${body.error ?? 'failed'}`);
              }
            } catch {
              feedErrors++;
              log('error', 'Feeds', 'Discord: timeout');
            }
          }

          log(feedErrors > 0 ? 'warn' : 'success', 'Feeds', `Done: ${totalUpserted}/${totalFound} events, ${feedErrors} errors`);
        },
      },
      {
        label: 'Scrape Venues',
        run: async () => {
          log('info', 'Scrape', 'Loading stale sources...');
          let sources: Array<{ id: number; venueName: string; province: string }> = [];
          try {
            const listRes = await fetch('/api/admin/trigger/scrape?source=list', { method: 'POST' });
            const listBody = await listRes.json();
            sources = listBody.sources ?? [];
          } catch {
            log('error', 'Scrape', 'Failed to load source list');
            return;
          }

          if (sources.length === 0) {
            log('info', 'Scrape', 'No stale sources');
            return;
          }

          log('info', 'Scrape', `${sources.length} stale sources`);
          let ok = 0, fail = 0, evts = 0;

          for (const src of sources) {
            if (cancelledRef.current) { log('warn', 'Scrape', 'Cancelled'); break; }
            try {
              const res = await fetch(`/api/admin/trigger/scrape?source=${src.id}`, { method: 'POST' });
              const body = await res.json();
              if (body.success) {
                ok++;
                evts += body.events ?? 0;
                if ((body.events ?? 0) > 0) log('success', 'Scrape', `${src.venueName}: ${body.events} events`);
              } else {
                fail++;
                log('error', 'Scrape', `${src.venueName}: failed`);
              }
            } catch {
              fail++;
              log('error', 'Scrape', `${src.venueName}: timeout`);
            }
          }
          log(fail > 0 ? 'warn' : 'success', 'Scrape', `Done: ${ok} ok, ${fail} failed, ${evts} events`);
        },
      },
      {
        label: 'Newsletters',
        run: async () => {
          log('info', 'Newsletters', 'Parsing...');
          try {
            const res = await fetch('/api/admin/trigger/parse-newsletters', { method: 'POST' });
            const body = await res.json();
            if (body.success) {
              log('success', 'Newsletters', `${body.emailsProcessed} emails, ${body.eventsUpserted}/${body.eventsFound} events`);
            } else {
              log('error', 'Newsletters', `Failed: ${body.error ?? 'Unknown'}`);
            }
          } catch (err) {
            log('error', 'Newsletters', `Request failed: ${String(err)}`);
          }
        },
      },
      {
        label: 'Series Detection',
        run: async () => {
          log('info', 'Series', 'Detecting recurring series...');
          try {
            const res = await fetch('/api/admin/trigger/detect-series', { method: 'POST' });
            const body = await res.json();
            if (body.success) {
              log('success', 'Series', `${body.seriesUpserted} series, ${body.eventsTagged} events tagged`);
            } else {
              log('error', 'Series', `Failed: ${body.error ?? 'Unknown'}`);
            }
          } catch (err) {
            log('error', 'Series', `Request failed: ${String(err)}`);
          }
        },
      },
      {
        label: 'Archive',
        run: async () => {
          log('info', 'Archive', 'Archiving past events...');
          try {
            const res = await fetch('/api/admin/trigger/archive', { method: 'POST' });
            const body = await res.json();
            if (body.success) {
              log('success', 'Archive', `${body.archived} events archived`);
            } else {
              log('error', 'Archive', `Failed: ${body.error ?? 'Unknown'}`);
            }
          } catch (err) {
            log('error', 'Archive', `Request failed: ${String(err)}`);
          }
        },
      },
    ];

    for (let i = 0; i < steps.length; i++) {
      if (cancelledRef.current) {
        log('warn', 'Full Sync', `Cancelled at step ${i + 1}/${steps.length}`);
        break;
      }
      log('info', 'Full Sync', `Step ${i + 1}/${steps.length}: ${steps[i].label}`);
      await steps[i].run();
    }

    if (!cancelledRef.current) {
      log('success', 'Full Sync', '--- Sync complete ---');
    }
    setRunningJob(null);
    const scrollY = window.scrollY;
    router.refresh();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  function jobLabel(job: string): string {
    const labels: Record<string, string> = {
      scrape: 'Scrape', archive: 'Archive', 'fetch-feeds': 'Feeds',
      'parse-newsletters': 'Newsletters', 'detect-series': 'Series',
      discover: 'Discovery', 'discover-reddit': 'Reddit Discovery',
      'discover-places-ns': 'Places NS', 'discover-places-nb': 'Places NB',
      'discover-places-pei': 'Places PEI', 'discover-places-nl': 'Places NL',
    };
    return labels[job] ?? job;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function formatResult(job: string, body: any): string {
    if (job === 'archive') return `${body.archived} events archived`;
    if (job === 'fetch-feeds') return `${body.eventsUpserted}/${body.eventsFound} events from ${body.feeds} feeds`;
    if (job === 'parse-newsletters') return `${body.emailsProcessed} emails, ${body.eventsUpserted}/${body.eventsFound} events`;
    if (job === 'detect-series') return `${body.seriesUpserted} series, ${body.eventsTagged} tagged`;
    if (job.startsWith('discover')) {
      const parts = [`${body.candidatesFound} found`, `${body.autoApproved} approved`];
      if (body.stagedPending) parts.push(`${body.stagedPending} pending review`);
      if (body.enriched) parts.push(`${body.enriched} existing updated`);
      if (body.stagedNoWebsite) parts.push(`${body.stagedNoWebsite} no website`);
      return parts.join(', ');
    }
    return 'Done';
  }

  const levelIcon: Record<string, string> = {
    info: '\u2022', success: '\u2713', warn: '\u26A0', error: '\u2717',
  };
  const levelColor: Record<string, string> = {
    info: 'text-gray-500', success: 'text-emerald-600', warn: 'text-amber-600', error: 'text-red-600',
  };
  const levelBg: Record<string, string> = {
    info: '', success: '', warn: '', error: 'bg-red-50/50',
  };

  // ─── Render ──────────────────────────────────────────────────────────

  const btnBase = 'px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5';
  const btnPrimary = `${btnBase} bg-gray-800 text-white hover:bg-gray-900`;
  const btnSync = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`;
  const btnCancel = `${btnBase} bg-red-600 text-white hover:bg-red-700`;
  const btnGhost = `${btnBase} bg-gray-100 text-gray-700 hover:bg-gray-200`;

  return (
    <div className="flex flex-col h-full">
      {/* ── Compact toolbar ────────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg shadow-sm px-4 py-2.5 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Full Sync */}
          {runningJob === 'full-sync' ? (
            <button className={btnCancel} onClick={() => { cancelledRef.current = true; }}>
              Cancel Sync
            </button>
          ) : (
            <button className={btnSync} disabled={isAnyJobRunning} onClick={runFullSync}>
              Full Sync
            </button>
          )}

          <div className="w-px h-5 bg-gray-200" />

          {/* Individual jobs */}
          <button className={btnPrimary} disabled={isAnyJobRunning} onClick={triggerFeeds}>
            Feeds
            {runningJob === 'fetch-feeds' && <Spinner />}
          </button>

          {runningJob === 'scrape' ? (
            <button className={btnCancel} onClick={() => { cancelledRef.current = true; }}>
              Cancel
            </button>
          ) : (
            <button className={btnPrimary} disabled={isAnyJobRunning} onClick={triggerScrape}>
              Scrape
            </button>
          )}

          <button className={btnPrimary} disabled={isAnyJobRunning} onClick={() => triggerSingleJob('parse-newsletters')}>
            Newsletters
            {runningJob === 'parse-newsletters' && <Spinner />}
          </button>

          <button className={btnPrimary} disabled={isAnyJobRunning} onClick={() => triggerSingleJob('detect-series')}>
            Series
            {runningJob === 'detect-series' && <Spinner />}
          </button>

          <button className={btnPrimary} disabled={isAnyJobRunning} onClick={() => triggerSingleJob('archive')}>
            Archive
            {runningJob === 'archive' && <Spinner />}
          </button>

          <div className="w-px h-5 bg-gray-200" />

          {/* Discovery */}
          <select
            className="px-2 py-1 border border-gray-200 text-xs rounded text-gray-700 bg-white disabled:opacity-40"
            value={discoveryType}
            disabled={isAnyJobRunning}
            onChange={(e) => setDiscoveryType(e.target.value)}
            aria-label="Discovery type"
          >
            {DISCOVERY_OPTIONS.map((opt) => (
              <option key={opt.job} value={opt.job}>{opt.label}</option>
            ))}
          </select>
          {runningJob === discoveryType || runningJob === 'discover' ? (
            <button className={btnCancel} onClick={() => { cancelledRef.current = true; }}>
              Cancel
            </button>
          ) : (
            <button className={btnPrimary} disabled={isAnyJobRunning} onClick={triggerDiscovery}>
              Discover
            </button>
          )}

          {/* Spacer + clear log */}
          <div className="flex-1" />
          {logs.length > 0 && !isAnyJobRunning && (
            <button className={btnGhost} onClick={() => setLogs([])}>
              Clear Log
            </button>
          )}
        </div>
      </div>

      {/* ── Live log ───────────────────────────────────────────────────── */}
      <div className="bg-gray-950 rounded-lg border border-gray-800 shadow-sm flex-1 min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isAnyJobRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Activity Log
            </span>
            {userScrolledUpRef.current && logs.length > 0 && (
              <button
                className="text-[10px] text-blue-400 hover:text-blue-300 ml-2"
                onClick={() => {
                  userScrolledUpRef.current = false;
                  const container = logContainerRef.current;
                  if (container) container.scrollTop = container.scrollHeight;
                }}
              >
                Jump to latest
              </button>
            )}
          </div>
          {isAnyJobRunning && (
            <span className="text-xs text-amber-400 animate-pulse">
              Running: {runningJob === 'full-sync' ? 'Full Sync' : jobLabel(runningJob!)}
            </span>
          )}
        </div>
        <div
          ref={logContainerRef}
          className="overflow-y-auto font-mono text-xs leading-relaxed"
          style={{ maxHeight: '60vh' }}
          onScroll={() => {
            const el = logContainerRef.current;
            if (!el) return;
            // User scrolled up if not near the bottom (within 40px)
            userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 40;
          }}
        >
          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No activity yet. Click a button above to start.
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id} className={`${levelBg[entry.level]} hover:bg-gray-900/50`}>
                    <td className="pl-4 pr-2 py-0.5 text-gray-600 whitespace-nowrap align-top select-none w-16">
                      {entry.timestamp}
                    </td>
                    <td className={`px-1 py-0.5 whitespace-nowrap align-top select-none w-4 ${levelColor[entry.level]}`}>
                      {levelIcon[entry.level]}
                    </td>
                    <td className="px-1 py-0.5 text-blue-400 whitespace-nowrap align-top w-24 truncate">
                      {entry.step}
                    </td>
                    <td className={`px-2 py-0.5 pr-4 ${entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : entry.level === 'success' ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {entry.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="animate-spin inline-block h-3 w-3 border-[1.5px] border-current border-t-transparent rounded-full"
    />
  );
}
