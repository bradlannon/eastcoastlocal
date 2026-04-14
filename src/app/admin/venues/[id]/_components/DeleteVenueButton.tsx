'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteVenue } from '@/app/admin/venues/actions';

interface DeleteVenueButtonProps {
  venueId: number;
  eventCount: number;
  sourceCount: number;
}

export default function DeleteVenueButton({
  venueId,
  eventCount,
  sourceCount,
}: DeleteVenueButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isBlocked = eventCount > 0 || sourceCount > 0;

  // Build tooltip text when blocked
  const tooltipParts: string[] = [];
  if (eventCount > 0) tooltipParts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
  if (sourceCount > 0) tooltipParts.push(`${sourceCount} source${sourceCount === 1 ? '' : 's'}`);
  const tooltip = isBlocked
    ? `Venue has ${tooltipParts.join(' and ')} — detach or archive them first.`
    : undefined;

  async function handleClick() {
    if (isBlocked) return;

    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this venue? This cannot be undone.'
    );
    if (!confirmed) return;

    setIsPending(true);
    setError(null);

    try {
      const result = await deleteVenue(String(venueId));
      if (result.success) {
        router.push('/admin/venues');
      } else {
        setError(result.error);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBlocked || isPending}
        title={tooltip}
        className={[
          'px-4 py-2 rounded text-sm font-medium transition-colors',
          isBlocked
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-red-600 text-white hover:bg-red-700',
        ].join(' ')}
        aria-label="Delete venue"
      >
        {isPending ? 'Deleting…' : 'Delete venue'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
