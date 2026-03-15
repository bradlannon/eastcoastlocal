'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { Bounds } from '@/lib/filter-utils';

interface MapBoundsTrackerProps {
  onBoundsChange: (bounds: Bounds) => void;
}

export default function MapBoundsTracker({ onBoundsChange }: MapBoundsTrackerProps) {
  const callbackRef = useRef(onBoundsChange);
  useEffect(() => {
    callbackRef.current = onBoundsChange;
  }, [onBoundsChange]);

  const fireBounds = useCallback((map: L.Map) => {
    const b = map.getBounds();
    callbackRef.current({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, []);

  const map = useMapEvents({
    moveend() {
      fireBounds(map);
    },
    zoomend() {
      fireBounds(map);
    },
  });

  // Fire on initial load
  useEffect(() => {
    fireBounds(map);
  }, [fireBounds, map]);

  return null;
}
