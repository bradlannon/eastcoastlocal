'use client';

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

// Custom orange-red accent icon for venue markers
function createVenueIcon(highlighted = false) {
  const size = highlighted ? 20 : 14;
  const border = highlighted ? 3 : 2;
  // Highlighted marker gets a pulsing ring animation
  const pulseRing = highlighted
    ? `<div style="
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 32px; height: 32px;
        border-radius: 50%;
        border: 2px solid #E85D26;
        animation: ecl-pulse 1s ease-out infinite;
      "></div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="position: relative; width: ${size}px; height: ${size}px;">
      ${pulseRing}
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        background-color: #E85D26;
        border: ${border}px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35)${highlighted ? ', 0 0 0 4px rgba(232,93,38,0.4)' : ''};
        transition: all 0.15s ease;
        z-index: 1;
      "></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

// Inject pulse keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ecl-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'ecl-pulse-style';
  style.textContent = `
    @keyframes ecl-pulse {
      0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export default function ClusterLayer({
  events,
  highlightedVenueId,
  markersRef,
}: ClusterLayerProps) {
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
      {Array.from(venueMap.values()).map(({ venue, events: venueEvents }) => {
        const isHighlighted = highlightedVenueId === venue.id;
        const icon = createVenueIcon(isHighlighted);

        return (
          <Marker
            key={venue.id}
            position={[venue.lat as number, venue.lng as number]}
            icon={icon}
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
        );
      })}
    </MarkerClusterGroup>
  );
}
