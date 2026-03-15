'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { mergePair, keepSeparate } from '../actions';
import type { MergeCandidate } from '../page';

interface MergeReviewListProps {
  candidates: MergeCandidate[];
  counts: { pending: number; merged: number; kept_separate: number };
  activeStatus: string;
}

const TABS = [
  { status: 'pending', label: 'Pending' },
  { status: 'merged', label: 'Merged' },
  { status: 'kept_separate', label: 'Kept Separate' },
] as const;

const REASON_LABELS: Record<string, string> = {
  name_match_no_geo: 'Name match, no coordinates',
  name_match_geo_distant: 'Name match, locations too far apart',
  name_match_geo_uncertain: 'Name match, locations borderline distance',
  geo_close_name_differs: 'Locations close, names differ',
};

function formatCoord(val: number | null): string {
  if (val === null) return '—';
  return val.toFixed(5);
}

function formatDistance(meters: number | null): string {
  if (meters === null) return 'No coordinates';
  if (meters < 1000) return `${Math.round(meters)}m apart`;
  return `${(meters / 1000).toFixed(1)}km apart`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ConfirmMergeButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
    >
      {pending ? 'Merging...' : 'Confirm merge?'}
    </button>
  );
}

function KeepSeparateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition-colors border border-gray-300"
    >
      {pending ? 'Saving...' : 'Keep Separate'}
    </button>
  );
}

interface VenueCardProps {
  venue: MergeCandidate['venue_a'];
  label: string;
}

function VenueCard({ venue, label }: VenueCardProps) {
  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border p-4 min-w-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="font-semibold text-gray-900 text-sm truncate">{venue.name}</div>
      <div className="text-sm text-gray-600 mt-1">
        {venue.city}, {venue.province}
      </div>
      {(venue.lat !== null || venue.lng !== null) && (
        <div className="text-xs text-gray-400 mt-1">
          {formatCoord(venue.lat)}, {formatCoord(venue.lng)}
        </div>
      )}
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        <span>{venue.event_count} events</span>
        <span>{venue.source_count} sources</span>
      </div>
    </div>
  );
}

export default function MergeReviewList({
  candidates,
  counts,
  activeStatus,
}: MergeReviewListProps) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 mb-4">
        {TABS.map(({ status, label }) => {
          const isActive = activeStatus === status;
          const countValue = counts[status as keyof typeof counts];
          return (
            <Link
              key={status}
              href={`/admin/merge-review?status=${status}`}
              className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label} ({countValue})
            </Link>
          );
        })}
      </div>

      {/* Empty state */}
      {candidates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-500">
          {activeStatus === 'pending'
            ? 'No pending merge candidates. Candidates appear after Ticketmaster ingests detect near-match venues.'
            : `No ${activeStatus.replace('_', ' ')} candidates.`}
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => {
            const isConfirming = confirmingId === candidate.id;
            return (
              <div
                key={candidate.id}
                className="bg-gray-50 rounded-lg border shadow-sm p-4"
              >
                {/* Side-by-side venue cards + center metadata */}
                <div className="flex flex-col md:flex-row gap-4 items-stretch">
                  <VenueCard venue={candidate.venue_a} label="Venue A" />

                  {/* Center metadata */}
                  <div className="flex flex-col items-center justify-center py-2 px-4 min-w-[160px] text-center">
                    <div className="text-lg font-bold text-gray-800">
                      {Math.round(candidate.name_score * 100)}% name match
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {formatDistance(candidate.distance_meters)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 italic">
                      {REASON_LABELS[candidate.reason] ?? candidate.reason}
                    </div>
                  </div>

                  <VenueCard venue={candidate.venue_b} label="Venue B" />
                </div>

                {/* Action buttons (pending only) */}
                {activeStatus === 'pending' && (
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    {!isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(candidate.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                        >
                          Merge
                        </button>
                        <form action={keepSeparate}>
                          <input
                            type="hidden"
                            name="candidateId"
                            value={candidate.id}
                          />
                          <KeepSeparateButton />
                        </form>
                      </>
                    ) : (
                      <>
                        <form action={mergePair}>
                          <input
                            type="hidden"
                            name="candidateId"
                            value={candidate.id}
                          />
                          <ConfirmMergeButton />
                        </form>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition-colors border border-gray-300"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Reviewed at timestamp (merged/kept_separate tabs) */}
                {activeStatus !== 'pending' && candidate.reviewed_at && (
                  <div className="mt-3 text-xs text-gray-400">
                    Reviewed {formatDate(candidate.reviewed_at)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
