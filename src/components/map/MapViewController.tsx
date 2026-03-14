'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';
import {
  PROVINCE_BOUNDS,
  ATLANTIC_CANADA_BOUNDS,
} from '@/lib/province-bounds';

export interface FlyToTarget {
  lat: number;
  lng: number;
  venueId: number;
}

interface MapViewControllerProps {
  province: string | null;
  flyToTarget: FlyToTarget | null;
  markersRef: React.RefObject<Map<number, L.Marker>>;
}

export default function MapViewController({
  province,
  flyToTarget,
  markersRef,
}: MapViewControllerProps) {
  const map = useMap();
  const prevProvinceRef = useRef<string | null>(undefined);

  // Province zoom effect
  useEffect(() => {
    // Skip on first mount if province hasn't changed
    if (prevProvinceRef.current === undefined) {
      prevProvinceRef.current = province;
      return;
    }
    if (prevProvinceRef.current === province) return;
    prevProvinceRef.current = province;

    if (province && PROVINCE_BOUNDS[province]) {
      map.fitBounds(PROVINCE_BOUNDS[province], { animate: true });
    } else {
      map.fitBounds(ATLANTIC_CANADA_BOUNDS, { animate: true });
    }
  }, [map, province]);

  // Fly-to-target effect
  useEffect(() => {
    if (!flyToTarget) return;

    map.flyTo([flyToTarget.lat, flyToTarget.lng], 15, {
      animate: true,
      duration: 0.8,
    });

    const handleMoveEnd = () => {
      map.off('moveend', handleMoveEnd);
      const marker = markersRef.current?.get(flyToTarget.venueId);
      if (marker) {
        marker.openPopup();
      }
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, flyToTarget, markersRef]);

  // Pure side-effect component — renders nothing
  return null;
}
