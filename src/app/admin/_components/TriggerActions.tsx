'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type JobResult = { success: boolean; message: string; isWarning?: boolean } | null;

const DISCOVERY_OPTIONS = [
  { label: 'Gemini Search', job: 'discover' },
  { label: 'Reddit', job: 'discover-reddit' },
  { label: 'Places NS', job: 'discover-places-ns' },
  { label: 'Places NB', job: 'discover-places-nb' },
  { label: 'Places PEI', job: 'discover-places-pei' },
  { label: 'Places NL', job: 'discover-places-nl' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatSuccessMessage(job: string, body: any): string {
  if (job === 'scrape') {
    return 'Scrape complete';
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
  return 'Job complete';
}

export default function TriggerActions() {
  const router = useRouter();
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult>(null);
  const [discoveryType, setDiscoveryType] = useState('discover');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss toast after 8 seconds
  useEffect(() => {
    if (result) {
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
    const startTime = Date.now();

    // Show "still running" warning after 30s
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
    'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';

  const selectClass =
    'px-3 py-2 border border-gray-300 text-sm rounded-md text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Actions</h2>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex flex-wrap gap-4">
          {/* Run Scrape */}
          <button
            type="button"
            className={buttonClass}
            disabled={isAnyJobRunning}
            onClick={() => trigger('scrape')}
          >
            Run Scrape
            {runningJob === 'scrape' && <Spinner />}
          </button>

          {/* Discovery group */}
          <div className="flex gap-2">
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
          </div>

          {/* Run Archive */}
          <button
            type="button"
            className={buttonClass}
            disabled={isAnyJobRunning}
            onClick={() => trigger('archive')}
          >
            Run Archive
            {runningJob === 'archive' && <Spinner />}
          </button>
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
