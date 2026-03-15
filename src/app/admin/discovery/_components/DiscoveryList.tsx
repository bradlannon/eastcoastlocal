'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';

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
  }>;
  counts: { pending: number; approved: number; rejected: number };
  activeStatus: string;
}

const TABS = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
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

export default function DiscoveryList({
  candidates,
  counts,
  activeStatus,
}: DiscoveryListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function handleRowClick(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((candidate) => (
                <Fragment key={candidate.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleRowClick(candidate.id)}
                  >
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
                  </tr>

                  {expandedId === candidate.id && (
                    <tr>
                      <td
                        colSpan={4}
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

                          {/* Action buttons placeholder */}
                          <div className="flex gap-2 mt-3">
                            {/* Approve/Reject buttons added in Plan 02 */}
                          </div>
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
