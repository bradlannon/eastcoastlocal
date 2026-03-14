'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMap, Popup } from 'react-leaflet';
import type L from 'leaflet';
import {
  findNearbyVenues,
  filterByTimeWindow,
  positionToTimestamp,
  type VenueGroup,
} from '@/lib/timelapse-utils';
import type { EventWithVenue } from '@/types/index';
import HeatmapPopup from './HeatmapPopup';

interface HeatmapClickLayerProps {
  allEvents: EventWithVenue[];
  timePosition: number;
  referenceDate: Date;
  onPause: () => void;
}

export default function HeatmapClickLayer({
  allEvents,
  timePosition,
  referenceDate,
  onPause,
}: HeatmapClickLayerProps) {
  const map = useMap();
  const [clickState, setClickState] = useState<{
    latlng: L.LatLng;
    venues: VenueGroup[];
  } | null>(null);

  // Derive time-windowed venue groups from current position
  const venueGroups = useMemo((): Map<number, VenueGroup> => {
    const center = positionToTimestamp(timePosition, referenceDate);
    const windowed = filterByTimeWindow(allEvents, center.getTime(), 24);

    const groups = new Map<number, VenueGroup>();
    for (const e of windowed) {
      const { id, lat, lng } = e.venues;
      if (lat == null || lng == null) continue;
      const existing = groups.get(id);
      if (existing) {
        existing.events.push(e);
      } else {
        groups.set(id, { venue: e.venues, events: [e] });
      }
    }
    return groups;
  }, [allEvents, timePosition, referenceDate]);

  // Clear popup when time position changes (prevents stale popups after scrubbing)
  useEffect(() => {
    setClickState(null);
  }, [timePosition]);

  // Map click handler
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      const results = findNearbyVenues(e.latlng.lat, e.latlng.lng, venueGroups);
      if (results.length === 0) return;
      // Per research Pitfall 4: pause BEFORE setting state
      onPause();
      setClickState({ latlng: e.latlng, venues: results });
    };

    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, venueGroups, onPause]);

  // Cleanup on unmount (Pitfall 2: popup cleanup on mode switch)
  useEffect(() => {
    return () => {
      setClickState(null);
    };
  }, []);

  if (!clickState) return null;

  return (
    <Popup
      position={clickState.latlng}
      eventHandlers={{ remove: () => setClickState(null) }}
    >
      <HeatmapPopup venues={clickState.venues} />
    </Popup>
  );
}
