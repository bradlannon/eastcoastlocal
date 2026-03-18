'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';

interface MapRefProps {
  onMap: (map: L.Map) => void;
}

/** Bridge component: lives inside MapContainer, exposes the map instance to parent. */
export default function MapRef({ onMap }: MapRefProps) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}
