'use client';

import { TOTAL_STEPS } from '@/lib/timelapse-utils';

interface TimelineBarProps {
  timePosition: number;
  isPlaying: boolean;
  currentLabel: string;
  eventCount: number;
  showPins: boolean;
  onPositionChange: (pos: number) => void;
  onScrubStart: () => void;
  onPlayPause: () => void;
  onTogglePins: () => void;
}

export default function TimelineBar({
  timePosition,
  isPlaying,
  currentLabel,
  eventCount,
  showPins,
  onPositionChange,
  onScrubStart,
  onPlayPause,
  onTogglePins,
}: TimelineBarProps) {
  return (
    <div className="backdrop-blur-md bg-white/70 rounded-xl shadow-lg px-4 py-3 flex flex-row items-center gap-2">
      {/* Play / Pause button */}
      <button
        onClick={onPlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center cursor-pointer text-gray-700 hover:text-blue-600 transition-colors"
      >
        {isPlaying ? (
          /* Pause icon — two vertical bars */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="5" y="4" width="4" height="16" rx="1" />
            <rect x="15" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          /* Play icon — right-pointing triangle */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Range scrubber */}
      <input
        type="range"
        min="0"
        max="1"
        step={String(1 / TOTAL_STEPS)}
        value={timePosition}
        aria-label="Timeline scrubber"
        className="accent-blue-600 w-full mx-3 flex-1"
        onChange={(e) => onPositionChange(e.target.valueAsNumber)}
        onMouseDown={onScrubStart}
        onTouchStart={onScrubStart}
      />

      {/* Date/block label and event count badge */}
      <div className="flex items-center flex-shrink-0 gap-1">
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
          {currentLabel}
        </span>
        <span
          role="status"
          className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 ml-2"
        >
          {eventCount}
        </span>
        {/* Pin visibility toggle */}
        <button
          onClick={onTogglePins}
          aria-label={showPins ? 'Hide venue pins' : 'Show venue pins'}
          title={showPins ? 'Hide pins' : 'Show pins'}
          className={`ml-2 w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${
            showPins ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
