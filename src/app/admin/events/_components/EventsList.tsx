'use client';

import { useRef } from 'react';
import { format } from 'date-fns';
import { updateEventCategory } from '../actions';
import { EVENT_CATEGORIES } from '@/lib/db/schema';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface EventRow {
  id: number;
  performer: string;
  eventDate: string;
  eventTime: string | null;
  eventCategory: string | null;
  venueName: string;
  city: string;
  province: string;
}

export default function EventsList({ rows }: { rows: EventRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">No events found.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performer</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">Category</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => (
            <EventRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ row }: { row: EventRow }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    formData.set('category', e.target.value);
    await updateEventCategory(formData);
  }

  const meta = CATEGORY_META[(row.eventCategory ?? 'other') as EventCategory];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate" title={row.performer}>
        {row.performer}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate" title={row.venueName}>
        {row.venueName}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
        {row.city}, {row.province}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
        {format(new Date(row.eventDate), 'MMM d, yyyy')}
        {row.eventTime && <span className="text-gray-400 ml-1">{row.eventTime}</span>}
      </td>
      <td className="px-4 py-3 text-sm">
        <form ref={formRef}>
          <input type="hidden" name="eventId" value={row.id} />
          <select
            name="category"
            defaultValue={row.eventCategory ?? 'other'}
            onChange={handleChange}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#E85D26] focus:border-[#E85D26] cursor-pointer"
          >
            {EVENT_CATEGORIES.map((cat) => {
              const m = CATEGORY_META[cat as EventCategory];
              return (
                <option key={cat} value={cat}>
                  {m.label}
                </option>
              );
            })}
          </select>
        </form>
      </td>
    </tr>
  );
}
