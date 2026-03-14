'use client';

import { useMap } from 'react-leaflet';

export default function GeolocationButton() {
  const map = useMap();

  // Feature detect — don't render if geolocation not available
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  function handleClick() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.flyTo([position.coords.latitude, position.coords.longitude], 12, {
          animate: true,
          duration: 1.2,
        });
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        // Simple fallback — could be replaced with a toast if one is added
        alert('Could not access your location. Please allow location access and try again.');
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Center map on my location"
      title="Center map on my location"
      className="absolute bottom-6 right-4 z-[1000] w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors border border-gray-200"
    >
      {/* Location crosshair SVG */}
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
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
