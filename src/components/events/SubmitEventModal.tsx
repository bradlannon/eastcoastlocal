'use client';

import { useState } from 'react';
import { PUBLIC_CATEGORIES } from '@/lib/categories';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface SubmitEventModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SubmitEventModal({ open, onClose }: SubmitEventModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const body = {
      performer: data.get('performer'),
      venue_name: data.get('venue_name'),
      city: data.get('city'),
      province: data.get('province'),
      event_date: data.get('event_date'),
      event_time: data.get('event_time'),
      event_category: data.get('event_category'),
      price: data.get('price'),
      link: data.get('link'),
      description: data.get('description'),
      website: data.get('website'), // honeypot
    };

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Submission failed');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Submit an Event</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="px-5 py-12 text-center">
            <div className="text-2xl mb-2">&#10003;</div>
            <p className="text-gray-800 font-semibold">Thanks!</p>
            <p className="text-sm text-gray-500 mt-1">Your event will be reviewed shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
            {/* Honeypot — hidden from real users */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px]" aria-hidden="true" />

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Event / Performer Name *</label>
              <input name="performer" required className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Venue Name *</label>
              <input name="venue_name" required className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">City *</label>
                <input name="city" required className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Province *</label>
                <select name="province" required defaultValue="" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F] bg-white">
                  <option value="" disabled>Select</option>
                  <option value="NS">Nova Scotia</option>
                  <option value="NB">New Brunswick</option>
                  <option value="PEI">Prince Edward Island</option>
                  <option value="NL">Newfoundland &amp; Labrador</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                <input name="event_date" type="date" required min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                <input name="event_time" placeholder="e.g. 8pm" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
              <select name="event_category" required defaultValue="community" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F] bg-white">
                {PUBLIC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_META[cat as EventCategory].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
              <input name="price" placeholder="e.g. $20, Free" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Link (tickets or website)</label>
              <input name="link" type="url" placeholder="https://..." className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F]" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" rows={3} placeholder="Tell us about this event..." className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F] resize-none" />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[#2A9D8F] text-white font-semibold rounded-lg hover:bg-[#237d72] transition-colors disabled:opacity-50 text-sm"
            >
              {submitting ? 'Submitting...' : 'Submit Event'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
