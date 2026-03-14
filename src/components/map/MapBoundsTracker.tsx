'use client';

import { useEffect } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { Bounds } from '@/lib/filter-utils';

interface MapBoundsTrackerProps {
  onBoundsChange: (bounds: Bounds) => void;
}

export default function MapBoundsTracker({ onBoundsChange }: MapBoundsTrackerProps) {
  const map = useMapEvents({
    moveend() {
      const b = map.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
    zoomend() {
      const b = map.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
  });

  // Fire on initial load
  useEffect(() => {
    const b = map.getBounds();
    onBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
