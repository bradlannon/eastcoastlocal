'use client';

import { useActionState } from 'react';
import { addSource, toggleSource } from '../actions';

interface ScrapeSource {
  id: number;
  url: string;
  source_type: string;
  enabled: boolean;
}

interface SourceManagementProps {
  venueId: number;
  sources: ScrapeSource[];
}

const initialState: { error?: string } = {};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  eventbrite: 'Eventbrite',
  bandsintown: 'Bandsintown',
  ticketmaster: 'Ticketmaster',
  venue_website: 'Website',
  facebook_page: 'Facebook',
};

function SourceTypeBadge({ type }: { type: string }) {
  const label = SOURCE_TYPE_LABELS[type] ?? type;
  const colorClass =
    type === 'eventbrite'
      ? 'bg-orange-100 text-orange-700'
      : type === 'bandsintown'
      ? 'bg-green-100 text-green-700'
      : type === 'ticketmaster'
      ? 'bg-blue-100 text-blue-800'
      : type === 'facebook_page'
      ? 'bg-indigo-100 text-indigo-700'
      : 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export default function SourceManagement({ venueId, sources }: SourceManagementProps) {
  const [addState, addAction] = useActionState(addSource, initialState);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Scrape Sources</h2>
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {sources.length}
        </span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        {sources.length === 0 ? (
          <div className="px-6 py-4 text-sm text-gray-500">
            No scrape sources configured
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm text-gray-800 truncate"
                    title={source.url}
                  >
                    {source.url}
                  </p>
                </div>
                <SourceTypeBadge type={source.source_type} />
                <form action={toggleSource}>
                  <input type="hidden" name="source_id" value={source.id} />
                  <input type="hidden" name="venue_id" value={venueId} />
                  <button
                    type="submit"
                    className={`inline-flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${
                      source.enabled
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {source.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* Add Source form */}
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">Add Source</p>
          <form action={addAction} className="flex items-start gap-2">
            <input type="hidden" name="venue_id" value={venueId} />
            <div className="flex-1">
              <input
                name="url"
                type="url"
                placeholder="https://example.com/events"
                className="border border-gray-300 rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {addState?.error && (
                <p className="text-xs text-red-600 mt-1">{addState.error}</p>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
