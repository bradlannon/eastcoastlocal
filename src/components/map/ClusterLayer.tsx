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

// ─── Turquoise circle icons ──────────────────────────────────────────────

const ACCENT = '#2A9D8F';
const ACCENT_GLOW = 'rgba(42, 157, 143, 0.4)';

/**
 * Calculate circle size based on event count.
 * Min 28px (1 event), grows logarithmically, max 56px.
 */
function circleSize(count: number): number {
  if (count <= 1) return 28;
  return Math.min(28 + Math.log2(count) * 8, 56);
}

/**
 * Font size scales with circle size.
 */
function fontSize(size: number): number {
  if (size <= 30) return 11;
  if (size <= 40) return 13;
  return 14;
}

/**
 * Create a turquoise circle icon with a number.
 */
function createCircleIcon(count: number, highlighted = false): L.DivIcon {
  const size = circleSize(count);
  const font = fontSize(size);
  const border = highlighted ? `3px solid #ffffff` : `2px solid #ffffff`;
  const shadow = highlighted
    ? `0 1px 4px rgba(0,0,0,0.35), 0 0 0 4px ${ACCENT_GLOW}`
    : `0 1px 4px rgba(0,0,0,0.35)`;

  return L.divIcon({
    className: highlighted ? 'ecl-marker-highlight' : '',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background-color: ${ACCENT};
      border: ${border};
      border-radius: 50%;
      box-shadow: ${shadow};
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: ${font}px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1;
      ${highlighted ? 'position: relative; z-index: 1;' : ''}
    ">${count}</div>${highlighted ? '<div class="ecl-pulse-ring"></div>' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

/**
 * Create cluster icon — same turquoise circle, sized by child count.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  const size = circleSize(count);
  const font = fontSize(size);

  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background-color: ${ACCENT};
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: ${font}px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Inject pulse CSS once
if (typeof document !== 'undefined' && !document.getElementById('ecl-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'ecl-pulse-style';
  style.textContent = `
    .ecl-pulse-ring {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      width: 40px; height: 40px;
      border-radius: 50%;
      border: 2px solid ${ACCENT};
      animation: ecl-pulse 1s ease-out infinite;
      pointer-events: none;
    }
    .ecl-marker-highlight {
      position: relative;
    }
    @keyframes ecl-pulse {
      0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// Icon cache to avoid recreating icons for the same event count
const iconCache = new Map<string, L.DivIcon>();

function getCachedIcon(count: number, highlighted: boolean): L.DivIcon {
  const key = `${count}-${highlighted}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = createCircleIcon(count, highlighted);
    iconCache.set(key, icon);
  }
  return icon;
}

// ─── Component ───────────────────────────────────────────────────────────

export default function ClusterLayer({
  events,
  highlightedVenueId,
  markersRef,
}: ClusterLayerProps) {
  const prevHighlightRef = useRef<number | null>(null);

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

  // Imperatively swap icon on just the highlighted/unhighlighted marker
  useEffect(() => {
    if (!markersRef?.current) return;

    const prev = prevHighlightRef.current;
    const next = highlightedVenueId ?? null;

    if (prev === next) return;

    // Restore previous marker to normal
    if (prev !== null) {
      const marker = markersRef.current.get(prev);
      if (marker) {
        const count = venueMap.get(prev)?.events.length ?? 1;
        marker.setIcon(getCachedIcon(count, false));
        marker.setZIndexOffset(0);
      }
    }

    // Highlight new marker
    if (next !== null) {
      const marker = markersRef.current.get(next);
      if (marker) {
        const count = venueMap.get(next)?.events.length ?? 1;
        marker.setIcon(getCachedIcon(count, true));
        marker.setZIndexOffset(1000);
      }
    }

    prevHighlightRef.current = next;
  }, [highlightedVenueId, markersRef, venueMap]);

  return (
    <MarkerClusterGroup
      chunkedLoading
      iconCreateFunction={createClusterIcon}
      showCoverageOnHover={false}
    >
      {Array.from(venueMap.values()).map(({ venue, events: venueEvents }) => (
        <Marker
          key={venue.id}
          position={[venue.lat as number, venue.lng as number]}
          icon={getCachedIcon(venueEvents.length, false)}
          ref={(markerInstance) => {
            if (markersRef?.current) {
              if (markerInstance) {
                markersRef.current.set(venue.id, markerInstance);
              } else {
                markersRef.current.delete(venue.id);
              }
            }
          }}
          eventHandlers={{
            mouseover: (e) => e.target.openPopup(),
            mouseout: (e) => e.target.closePopup(),
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
