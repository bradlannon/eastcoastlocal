'use client';

import { Fragment, useState, useEffect } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import {
  approveCandidate,
  batchApproveCandidate,
  rejectCandidate,
  revokeCandidate,
} from '../actions';

interface DiscoveryListProps {
  candidates: Array<{
    id: number;
    url: string;
    domain: string;
    source_name: string | null;
    province: string | null;
    city: string | null;
    status: string;
    discovery_method: string | null;
    raw_context: string | null;
    discovered_at: Date;
    reviewed_at: Date | null;
    discovery_score: number | null;
  }>;
  counts: { pending: number; approved: number; rejected: number; no_website: number };
  activeStatus: string;
}

const TABS = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'no_website', label: 'No Website' },
] as const;

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateUrl(url: string, maxLength = 50): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength) + '…';
}

function ApproveSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
    >
      {pending ? 'Approving…' : 'Approve'}
    </button>
  );
}

function RejectSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1 rounded text-sm transition-colors"
    >
      {pending ? 'Rejecting…' : 'Confirm Reject'}
    </button>
  );
}

function RevokeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-3 py-1 rounded text-sm transition-colors"
    >
      {pending ? 'Revoking…' : 'Confirm Revoke'}
    </button>
  );
}

function BatchApproveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
    >
      {pending ? 'Approving...' : `Batch Approve (${count})`}
    </button>
  );
}

function RejectForm({
  candidateId,
  onCancel,
}: {
  candidateId: number;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(rejectCandidate, {});

  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap mt-2">
      <input type="hidden" name="id" value={candidateId} />
      <input
        name="reason"
        placeholder="Reason (optional)"
        className="border rounded px-2 py-1 text-sm w-64"
      />
      <RejectSubmitButton />
      <button
        type="button"
        onClick={onCancel}
        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm transition-colors"
      >
        Cancel
      </button>
      {state?.error && (
        <p className="text-red-600 text-sm w-full">{state.error}</p>
      )}
    </form>
  );
}

export default function DiscoveryList({
  candidates,
  counts,
  activeStatus,
}: DiscoveryListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const isActionableTab = activeStatus === 'pending' || activeStatus === 'no_website';

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeStatus]);

  function handleRowClick(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
    // Close reject form if collapsing row
    if (expandedId === id) setRejectingId(null);
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  }

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        {TABS.map(({ status, label }) => {
          const isActive = activeStatus === status;
          const countValue = counts[status];
          return (
            <Link
              key={status}
              href={`/admin/discovery?status=${status}`}
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

      {/* Batch approve button (pending/no_website tabs, shown when selections exist) */}
      {isActionableTab && selectedIds.size > 0 && (
        <div className="mb-3">
          <form action={batchApproveCandidate}>
            <input
              type="hidden"
              name="ids"
              value={Array.from(selectedIds).join(',')}
            />
            <BatchApproveButton count={selectedIds.size} />
          </form>
        </div>
      )}

      {/* Table or empty state */}
      {candidates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-500">
          No {activeStatus} candidates
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {isActionableTab && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    <input
                      type="checkbox"
                      checked={
                        candidates.length > 0 &&
                        selectedIds.size === candidates.length
                      }
                      onChange={toggleAll}
                      className="rounded"
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  City
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Province
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((candidate) => (
                <Fragment key={candidate.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleRowClick(candidate.id)}
                  >
                    {isActionableTab && (
                      <td
                        className="px-4 py-3 w-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(candidate.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.id)}
                          onChange={() => toggleRow(candidate.id)}
                          className="rounded"
                          aria-label={`Select ${candidate.source_name ?? candidate.domain}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {candidate.source_name ?? candidate.domain}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span title={candidate.url}>
                        {truncateUrl(candidate.url)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {candidate.city ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {candidate.province ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {candidate.discovery_score !== null
                        ? candidate.discovery_score.toFixed(2)
                        : '—'}
                    </td>
                  </tr>

                  {expandedId === candidate.id && (
                    <tr>
                      <td
                        colSpan={isActionableTab ? 6 : 5}
                        className="px-4 py-4 bg-gray-50 border-t border-gray-200"
                      >
                        <div className="space-y-3">
                          {/* Discovery method */}
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Discovery Method
                            </span>
                            <p className="mt-1 text-sm text-gray-800">
                              {candidate.discovery_method ?? 'Unknown'}
                            </p>
                          </div>

                          {/* Raw context */}
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Raw Context
                            </span>
                            <pre className="mt-1 whitespace-pre-wrap bg-white border border-gray-200 p-3 rounded text-sm max-h-48 overflow-y-auto text-gray-700">
                              {candidate.raw_context ?? 'No context available'}
                            </pre>
                          </div>

                          {/* Discovered at */}
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Discovered At
                            </span>
                            <p className="mt-1 text-sm text-gray-600">
                              {formatDate(candidate.discovered_at)}
                            </p>
                          </div>

                          {/* Action area */}
                          {isActionableTab ? (
                            <div className="mt-3">
                              {/* Approve + open-reject buttons */}
                              <div className="flex gap-2">
                                {/* Approve form */}
                                <form action={approveCandidate}>
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={candidate.id}
                                  />
                                  <ApproveSubmitButton />
                                </form>

                                {/* Reject trigger button (only when reject form not open) */}
                                {rejectingId !== candidate.id && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRejectingId(candidate.id);
                                    }}
                                    className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>

                              {/* Inline reject form */}
                              {rejectingId === candidate.id && (
                                <RejectForm
                                  candidateId={candidate.id}
                                  onCancel={() => setRejectingId(null)}
                                />
                              )}
                            </div>
                          ) : (
                            /* Status badge for approved/rejected tabs */
                            <div className="flex items-center gap-3 mt-3 flex-wrap">
                              {candidate.status === 'approved' ? (
                                <>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Approved
                                  </span>
                                  {candidate.discovery_score !== null && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Auto-approved
                                    </span>
                                  )}
                                  {candidate.reviewed_at && (
                                    <span className="text-xs text-gray-500">
                                      {formatDate(candidate.reviewed_at)}
                                    </span>
                                  )}
                                  <div className="w-full mt-1">
                                    {revokingId !== candidate.id ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRevokingId(candidate.id);
                                        }}
                                        className="border border-amber-300 text-amber-700 hover:bg-amber-50 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                                      >
                                        Revoke
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <form action={revokeCandidate}>
                                          <input
                                            type="hidden"
                                            name="id"
                                            value={candidate.id}
                                          />
                                          <RevokeSubmitButton />
                                        </form>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRevokingId(null);
                                          }}
                                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    Rejected
                                  </span>
                                  {candidate.reviewed_at && (
                                    <span className="text-xs text-gray-500">
                                      {formatDate(candidate.reviewed_at)}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
