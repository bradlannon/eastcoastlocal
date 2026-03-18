'use client';

import { format } from 'date-fns';
import { approveSubmission, rejectSubmission } from '../actions';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface Submission {
  id: number;
  performer: string;
  venue_name: string;
  city: string;
  province: string;
  event_date: Date;
  event_time: string | null;
  event_category: string | null;
  price: string | null;
  link: string | null;
  description: string | null;
  status: string;
  created_at: Date;
}

interface SubmissionsListProps {
  submissions: Submission[];
}

export default function SubmissionsList({ submissions }: SubmissionsListProps) {
  if (submissions.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">No pending submissions.</p>
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((s) => (
        <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 truncate">{s.performer}</h3>
                {s.event_category && (
                  <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                    {CATEGORY_META[s.event_category as EventCategory]?.label ?? s.event_category}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  s.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                  s.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {s.status}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {s.venue_name} &middot; {s.city}, {s.province}
              </p>
              <p className="text-sm text-gray-500">
                {format(new Date(s.event_date), 'EEE, MMM d, yyyy')}
                {s.event_time ? ` at ${s.event_time}` : ''}
                {s.price ? ` · ${s.price}` : ''}
              </p>
              {s.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{s.description}</p>
              )}
              {s.link && (
                <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                  {s.link}
                </a>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Submitted {format(new Date(s.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>

            {s.status === 'pending' && (
              <div className="flex gap-2 flex-shrink-0">
                <form action={approveSubmission}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    Approve
                  </button>
                </form>
                <form action={rejectSubmission}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                    Reject
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
