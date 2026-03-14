'use client';

import dynamic from 'next/dynamic';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';
import type { FlyToTarget } from './MapViewController';

// Loading skeleton
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 animate-pulse rounded flex items-center justify-center">
    <span className="text-gray-400 text-sm">Loading map...</span>
  </div>
);

// MapClientWrapper: dynamically imports the full interactive map (no SSR).
// Must only be used inside Client Components.
const MapClientWrapperInner = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export interface MapClientWrapperProps {
  events: EventWithVenue[];
  onBoundsChange: (bounds: Bounds) => void;
  province?: string | null;
  highlightedVenueId?: number | null;
  flyToTarget?: FlyToTarget | null;
}

export default function MapClientWrapper(props: MapClientWrapperProps) {
  return <MapClientWrapperInner {...props} />;
}
