'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

import { useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type L from 'leaflet';
import MapBoundsTracker from './MapBoundsTracker';
import ClusterLayer from './ClusterLayer';
import HeatmapLayer from './HeatmapLayer';
import ModeToggle from './ModeToggle';
import GeolocationButton from './GeolocationButton';
import MapViewController from './MapViewController';
import type { FlyToTarget } from './MapViewController';
import TimelineBar from '../timelapse/TimelineBar';
import CategoryChipsRow from '../events/CategoryChipsRow';
import { ATLANTIC_CANADA_CENTER, ATLANTIC_CANADA_MAX_BOUNDS, INITIAL_ZOOM, MIN_ZOOM } from '@/lib/province-bounds';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';
import type { HeatPoint } from '@/lib/timelapse-utils';
import HeatmapClickLayer from './HeatmapClickLayer';

interface MapClientProps {
  events: EventWithVenue[];
  onBoundsChange: (bounds: Bounds) => void;
  province?: string | null;
  highlightedVenueId?: number | null;
  flyToTarget?: FlyToTarget | null;
  mapMode?: 'cluster' | 'timelapse';
  heatPoints?: HeatPoint[];
  onModeToggle?: () => void;
  isPlaying?: boolean;
  timePosition?: number;
  currentLabel?: string;
  eventCount?: number;
  onTimePositionChange?: (pos: number) => void;
  onScrubStart?: () => void;
  onPlayPause?: () => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  referenceDate?: Date;
  timeFilteredEvents?: EventWithVenue[];
}

export default function MapClient({
  events,
  onBoundsChange,
  province,
  highlightedVenueId,
  flyToTarget,
  mapMode,
  heatPoints,
  onModeToggle,
  isPlaying,
  timePosition,
  currentLabel,
  eventCount,
  onTimePositionChange,
  onScrubStart,
  onPlayPause,
  showHeatmap,
  onToggleHeatmap,
  referenceDate,
  timeFilteredEvents,
}: MapClientProps) {
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

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
        maxBounds={ATLANTIC_CANADA_MAX_BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={MIN_ZOOM}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
        <MapBoundsTracker onBoundsChange={onBoundsChange} />
        <ClusterLayer
          events={mapMode === 'timelapse' ? (timeFilteredEvents ?? []) : events}
          highlightedVenueId={highlightedVenueId}
          markersRef={markersRef}
        />
        {mapMode === 'timelapse' && showHeatmap && (
          <>
            <HeatmapLayer points={heatPoints ?? []} visible={true} />
            <HeatmapClickLayer
              allEvents={events}
              timePosition={timePosition ?? 0}
              referenceDate={referenceDate ?? new Date()}
              onPause={onScrubStart ?? (() => {})}
            />
          </>
        )}
        <GeolocationButton />
        <MapViewController
          province={province ?? null}
          flyToTarget={flyToTarget ?? null}
          markersRef={markersRef}
        />
      </MapContainer>

      {/* Mode toggle button */}
      <ModeToggle
        mapMode={mapMode ?? 'cluster'}
        onToggle={onModeToggle ?? (() => {})}
      />

      {/* Timeline bar + category chips — shown only in timelapse mode */}
      {mapMode === 'timelapse' && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] px-4 pb-4 flex flex-col gap-2">
          <CategoryChipsRow eventCount={eventCount ?? 0} />
          <TimelineBar
            timePosition={timePosition ?? 0}
            isPlaying={isPlaying ?? false}
            currentLabel={currentLabel ?? ''}
            eventCount={eventCount ?? 0}
            showHeatmap={showHeatmap ?? false}
            onPositionChange={onTimePositionChange ?? (() => {})}
            onScrubStart={onScrubStart ?? (() => {})}
            onPlayPause={onPlayPause ?? (() => {})}
            onToggleHeatmap={onToggleHeatmap ?? (() => {})}
          />
        </div>
      )}

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
