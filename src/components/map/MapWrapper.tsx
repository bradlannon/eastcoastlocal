import dynamic from 'next/dynamic';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';

// Loading skeleton shared between map wrappers
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 animate-pulse rounded flex items-center justify-center">
    <span className="text-gray-400 text-sm">Loading map...</span>
  </div>
);

// MiniMapWrapper: dynamically imports MiniMap (no SSR) for the event detail page
export const MiniMapWrapper = dynamic(() => import('./MiniMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// MapClientWrapper: dynamically imports MapClient (no SSR) for the main interactive map
export const MapClientWrapper = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <MapSkeleton />,
}) as React.ComponentType<{
  events: EventWithVenue[];
  onBoundsChange: (bounds: Bounds) => void;
}>;
