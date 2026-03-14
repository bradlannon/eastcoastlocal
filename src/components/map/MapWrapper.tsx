'use client';

import dynamic from 'next/dynamic';

// Loading skeleton for map components
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 animate-pulse rounded flex items-center justify-center">
    <span className="text-gray-400 text-sm">Loading map...</span>
  </div>
);

// MiniMapWrapper: dynamically imports MiniMap (no SSR) for the event detail page.
export const MiniMapWrapper = dynamic(() => import('./MiniMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});
