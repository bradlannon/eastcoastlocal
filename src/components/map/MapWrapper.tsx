import dynamic from 'next/dynamic';

// Loading skeleton shared between map wrappers
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 animate-pulse rounded" />
);

// MiniMapWrapper: dynamically imports MiniMap (no SSR) for the event detail page
export const MiniMapWrapper = dynamic(() => import('./MiniMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// MapClientWrapper: placeholder for the full interactive map (built in Plan 02).
// Uses a React component directly until MapClient.tsx is created.
const MapPlaceholder = () => (
  <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
    Map coming soon
  </div>
);

// This will be replaced with `dynamic(() => import('./MapClient'), { ssr: false })`
// once MapClient is implemented in Plan 03-02.
export const MapClientWrapper = MapPlaceholder;
