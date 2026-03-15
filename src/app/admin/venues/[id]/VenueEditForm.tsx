'use client';

import { useActionState } from 'react';
import { updateVenue } from '../actions';

interface Venue {
  id: number;
  name: string;
  address: string;
  city: string;
  province: string;
}

interface VenueEditFormProps {
  venue: Venue;
}

const PROVINCES = ['NB', 'NS', 'PEI', 'NL'] as const;

const initialState: { error?: string; success?: boolean } = {};

export default function VenueEditForm({ venue }: VenueEditFormProps) {
  const [state, formAction] = useActionState(updateVenue, initialState);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Venue</h2>

      <form action={formAction} className="space-y-4 max-w-lg">
        <input type="hidden" name="id" value={venue.id} />

        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={venue.name}
            required
            maxLength={100}
            className="border border-gray-300 rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Address
          </label>
          <input
            id="address"
            name="address"
            type="text"
            defaultValue={venue.address}
            required
            className="border border-gray-300 rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={venue.city}
            required
            className="border border-gray-300 rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="province"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Province
          </label>
          <select
            id="province"
            name="province"
            defaultValue={venue.province}
            className="border border-gray-300 rounded px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}
