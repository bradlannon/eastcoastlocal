'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import VenuePopup from './VenuePopup';
import type { Venue, EventWithVenue } from '@/types/index';

interface ClusterLayerProps {
  events: EventWithVenue[];
  highlightedVenueId?: number | null;
  markersRef?: React.RefObject<Map<number, L.Marker>>;
}

// ─── Cached icons ────────────────────────────────────────────────────────

const normalIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 14px; height: 14px;
    background-color: #E85D26;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -9],
});

const highlightedIcon = L.divIcon({
  className: 'ecl-marker-highlight',
  html: `<div style="position: relative; width: 20px; height: 20px;">
    <div class="ecl-pulse-ring"></div>
    <div style="
      position: relative;
      width: 20px; height: 20px;
      background-color: #E85D26;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35), 0 0 0 4px rgba(232,93,38,0.4);
      z-index: 1;
    "></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

// Inject pulse CSS once
if (typeof document !== 'undefined' && !document.getElementById('ecl-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'ecl-pulse-style';
  style.textContent = `
    .ecl-pulse-ring {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      width: 32px; height: 32px;
      border-radius: 50%;
      border: 2px solid #E85D26;
      animation: ecl-pulse 1s ease-out infinite;
    }
    @keyframes ecl-pulse {
      0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Component ───────────────────────────────────────────────────────────

export default function ClusterLayer({
  events,
  highlightedVenueId,
  markersRef,
}: ClusterLayerProps) {
  const prevHighlightRef = useRef<number | null>(null);

  // Imperatively swap icon on just the highlighted/unhighlighted marker
  // — avoids re-rendering all markers via React
  useEffect(() => {
    if (!markersRef?.current) return;

    const prev = prevHighlightRef.current;
    const next = highlightedVenueId ?? null;

    if (prev === next) return;

    // Restore previous marker to normal
    if (prev !== null) {
      const marker = markersRef.current.get(prev);
      if (marker) marker.setIcon(normalIcon);
    }

    // Highlight new marker
    if (next !== null) {
      const marker = markersRef.current.get(next);
      if (marker) {
        marker.setIcon(highlightedIcon);
        marker.setZIndexOffset(1000);
      }
    }

    // Reset z-index on previous
    if (prev !== null && prev !== next) {
      const marker = markersRef.current.get(prev);
      if (marker) marker.setZIndexOffset(0);
    }

    prevHighlightRef.current = next;
  }, [highlightedVenueId, markersRef]);

  // Group events by venue_id
  const venueMap = new Map<number, { venue: Venue; events: EventWithVenue[] }>();

  for (const item of events) {
    const { venues: venue } = item;
    if (!venue || venue.lat === null || venue.lat === undefined || venue.lng === null || venue.lng === undefined) {
      continue;
    }
    const existing = venueMap.get(venue.id);
    if (existing) {
      existing.events.push(item);
    } else {
      venueMap.set(venue.id, { venue, events: [item] });
    }
  }

  return (
    <MarkerClusterGroup chunkedLoading>
      {Array.from(venueMap.values()).map(({ venue, events: venueEvents }) => (
        <Marker
          key={venue.id}
          position={[venue.lat as number, venue.lng as number]}
          icon={normalIcon}
          ref={(markerInstance) => {
            if (markersRef?.current) {
              if (markerInstance) {
                markersRef.current.set(venue.id, markerInstance);
              } else {
                markersRef.current.delete(venue.id);
              }
            }
          }}
        >
          <Popup>
            <VenuePopup venue={venue} events={venueEvents} />
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
}
