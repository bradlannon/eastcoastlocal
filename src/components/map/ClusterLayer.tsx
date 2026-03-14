'use client';

import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import VenuePopup from './VenuePopup';
import type { Venue, EventWithVenue } from '@/types/index';

interface ClusterLayerProps {
  events: EventWithVenue[];
}

// Custom orange-red accent icon for venue markers
function createVenueIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 14px;
      height: 14px;
      background-color: #E85D26;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

export default function ClusterLayer({ events }: ClusterLayerProps) {
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

  const venueIcon = createVenueIcon();

  return (
    <MarkerClusterGroup chunkedLoading>
      {Array.from(venueMap.values()).map(({ venue, events: venueEvents }) => (
        <Marker
          key={venue.id}
          position={[venue.lat as number, venue.lng as number]}
          icon={venueIcon}
        >
          <Popup>
            <VenuePopup venue={venue} events={venueEvents} />
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
}
