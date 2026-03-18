'use client';

import { useState } from 'react';
import { useMap } from 'react-leaflet';
import { ATLANTIC_CANADA_BOUNDS, PROVINCE_BOUNDS, PROVINCE_LABELS } from '@/lib/province-bounds';
import BoxZoomTool from './BoxZoomTool';

interface ZoomControlsProps {
  activeProvince?: string | null;
}

export default function ZoomControls({ activeProvince }: ZoomControlsProps) {
  const map = useMap();
  const [boxZoomActive, setBoxZoomActive] = useState(false);

  function zoomIn() {
    map.zoomIn(1, { animate: true });
  }

  function zoomOut() {
    map.zoomOut(1, { animate: true });
  }

  function resetView() {
    map.fitBounds(ATLANTIC_CANADA_BOUNDS, { animate: true, padding: [20, 20] });
  }

  function flyToProvince(code: string) {
    const bounds = PROVINCE_BOUNDS[code];
    if (bounds) {
      map.fitBounds(bounds, { animate: true, padding: [20, 20] });
    }
  }

  function handleGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 12, {
          animate: true,
          duration: 1.2,
        });
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  const provinces = Object.keys(PROVINCE_BOUNDS);

  const btnClass = (isActive = false) =>
    `w-9 h-8 flex items-center justify-center transition-colors ${
      isActive
        ? 'bg-orange-100 text-orange-600'
        : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
    }`;

  return (
    <>
      <BoxZoomTool active={boxZoomActive} onDeactivate={() => setBoxZoomActive(false)} />

      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col gap-1.5">
        {/* Province quick-jump pills */}
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 p-1 flex flex-col gap-0.5">
          {provinces.map((code) => (
            <button
              key={code}
              onClick={() => flyToProvince(code)}
              title={PROVINCE_LABELS[code]}
              className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                activeProvince === code
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {code}
            </button>
          ))}
        </div>

        {/* Zoom +/- and controls */}
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 flex flex-col divide-y divide-gray-100">
          <button
            onClick={zoomIn}
            title="Zoom in"
            aria-label="Zoom in"
            className={`${btnClass()} rounded-t-lg`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={zoomOut}
            title="Zoom out"
            aria-label="Zoom out"
            className={btnClass()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => setBoxZoomActive(!boxZoomActive)}
            title={boxZoomActive ? 'Cancel box zoom (Esc)' : 'Box zoom — draw a rectangle to zoom'}
            aria-label="Box zoom"
            className={btnClass(boxZoomActive)}
          >
            {/* Dashed rectangle with magnifier icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="13" height="13" rx="1" strokeDasharray="3 2" />
              <circle cx="18" cy="18" r="4" strokeDasharray="none" />
              <line x1="21" y1="21" x2="23" y2="23" strokeDasharray="none" />
            </svg>
          </button>
          <button
            onClick={resetView}
            title="Reset to all provinces"
            aria-label="Reset view"
            className={btnClass()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {typeof navigator !== 'undefined' && navigator.geolocation && (
            <button
              onClick={handleGeolocation}
              title="My location"
              aria-label="Center on my location"
              className={`${btnClass()} rounded-b-lg`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
