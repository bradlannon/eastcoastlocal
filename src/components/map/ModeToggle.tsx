'use client';

export type MapMode = 'cluster' | 'timelapse';

interface ModeToggleProps {
  mapMode: MapMode;
  onToggle: () => void;
}

export default function ModeToggle({ mapMode, onToggle }: ModeToggleProps) {
  const ariaLabel =
    mapMode === 'cluster' ? 'Switch to heatmap view' : 'Switch to pin view';

  return (
    <button
      onClick={onToggle}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="absolute top-4 right-4 z-[1000] w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors border border-gray-200"
    >
      {mapMode === 'cluster' ? (
        /* Heatmap/layers icon — shown when in cluster mode (click to switch TO heatmap) */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#555"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Concentric arcs representing a heatmap gradient */}
          <circle cx="12" cy="12" r="3" fill="#ef4444" stroke="none" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="#f59e0b" strokeOpacity="0.6" />
          <circle cx="12" cy="12" r="10" fill="none" stroke="#3b82f6" strokeOpacity="0.4" />
        </svg>
      ) : (
        /* Pin/marker icon — shown when in heatmap mode (click to switch TO pins) */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#555"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      )}
    </button>
  );
}
