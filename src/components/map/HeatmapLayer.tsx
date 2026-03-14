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
      radius: 35,
      blur: 20,
      maxZoom: 12,
      gradient: { 0.2: '#3b82f6', 0.5: '#f59e0b', 0.8: '#ef4444' }, // blue→amber→red
    });

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current); // CRITICAL: explicit removeLayer prevents ghost layers
        heatRef.current = null;
      }
    };
  }, [map]); // only create/destroy on map instance change

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
    heatRef.current.setLatLngs(latlngs);

    if (!map.hasLayer(heatRef.current)) {
      heatRef.current.addTo(map);
    }

    heatRef.current.redraw();
  }, [map, points, visible]);

  return null;
}
