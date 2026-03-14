'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

import { MapContainer, TileLayer } from 'react-leaflet';
import MapBoundsTracker from './MapBoundsTracker';
import ClusterLayer from './ClusterLayer';
import { ATLANTIC_CANADA_CENTER, INITIAL_ZOOM } from '@/lib/province-bounds';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';

interface MapClientProps {
  events: EventWithVenue[];
  onBoundsChange: (bounds: Bounds) => void;
}

export default function MapClient({ events, onBoundsChange }: MapClientProps) {
  const visibleVenueCount = new Set(
    events
      .filter((e) => e.venues.lat !== null && e.venues.lng !== null)
      .map((e) => e.venues.id)
  ).size;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={ATLANTIC_CANADA_CENTER}
        zoom={INITIAL_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
        <MapBoundsTracker onBoundsChange={onBoundsChange} />
        <ClusterLayer events={events} />
      </MapContainer>

      {/* No events overlay */}
      {visibleVenueCount === 0 && events.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 rounded-lg px-4 py-3 shadow text-sm text-gray-600 text-center">
            No events here. Zoom out to see more.
          </div>
        </div>
      )}
    </div>
  );
}
