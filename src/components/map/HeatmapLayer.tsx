'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import type { HeatPoint } from '@/lib/timelapse-utils';

interface HeatmapLayerProps {
  points: HeatPoint[];
  visible: boolean;
}

export default function HeatmapLayer({ points, visible }: HeatmapLayerProps) {
  const map = useMap();
  const heatRef = useRef<L.HeatLayer | null>(null);

  // Create once on mount, destroy on unmount
  useEffect(() => {
    heatRef.current = L.heatLayer([], {
      radius: 40,
      blur: 25,
      maxZoom: 12,
      gradient: { 0.2: '#3b82f6', 0.5: '#f59e0b', 0.8: '#ef4444' },
    });

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
    };
  }, [map]);

  // Update points when data or visibility changes
  useEffect(() => {
    if (!heatRef.current) return;

    if (!visible) {
      map.removeLayer(heatRef.current);
      return;
    }

    const latlngs = points.map(
      (p) => [p.lat, p.lng, p.intensity] as [number, number, number]
    );

    // Dynamic max: when few points, lower the ceiling so the gradient
    // reaches hot colors. With many points the default 1.0 works fine.
    const pointCount = points.length;
    const dynamicMax = pointCount <= 3 ? 0.3
      : pointCount <= 8 ? 0.5
      : pointCount <= 15 ? 0.7
      : 1.0;

    heatRef.current.setOptions({ max: dynamicMax });
    heatRef.current.setLatLngs(latlngs);

    if (!map.hasLayer(heatRef.current)) {
      heatRef.current.addTo(map);
    }
  }, [map, points, visible]);

  return null;
}
