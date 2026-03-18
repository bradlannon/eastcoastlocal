'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';

interface PopupControllerProps {
  markersRef: React.RefObject<Map<number, L.Marker>>;
}

/**
 * Controls popup behavior:
 * - Auto-opens popup when a single unclustered marker is visible
 * - Fades popups out during map movement, fades back in when stopped
 */
export default function PopupController({ markersRef }: PopupControllerProps) {
  const map = useMap();
  const autoOpenedRef = useRef<number | null>(null);

  useEffect(() => {
    const popupContainer = () =>
      map.getContainer().querySelectorAll<HTMLElement>('.leaflet-popup');

    function fadeOut() {
      popupContainer().forEach((el) => {
        el.style.transition = 'opacity 0.15s ease-out';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      });
    }

    function fadeIn() {
      popupContainer().forEach((el) => {
        el.style.transition = 'opacity 0.2s ease-in';
        el.style.opacity = '1';
        el.style.pointerEvents = '';
      });
    }

    function autoOpenSingleMarker() {
      if (!markersRef.current) return;

      const bounds = map.getBounds();
      const zoom = map.getZoom();

      // Only auto-open at higher zoom levels (zoomed in)
      if (zoom < 10) {
        // Close any auto-opened popup if we zoomed out
        if (autoOpenedRef.current !== null) {
          const prev = markersRef.current.get(autoOpenedRef.current);
          if (prev) prev.closePopup();
          autoOpenedRef.current = null;
        }
        return;
      }

      // Find markers visible in current bounds
      const visibleIds: number[] = [];
      markersRef.current.forEach((marker, venueId) => {
        const pos = marker.getLatLng();
        if (bounds.contains(pos)) {
          visibleIds.push(venueId);
        }
      });

      // Auto-open if exactly 1 visible marker
      if (visibleIds.length === 1) {
        const venueId = visibleIds[0];
        if (autoOpenedRef.current !== venueId) {
          // Close previous auto-opened popup
          if (autoOpenedRef.current !== null) {
            const prev = markersRef.current.get(autoOpenedRef.current);
            if (prev) prev.closePopup();
          }
          const marker = markersRef.current.get(venueId);
          if (marker) {
            marker.openPopup();
            autoOpenedRef.current = venueId;
          }
        }
      } else if (autoOpenedRef.current !== null) {
        // Multiple or zero visible — close auto-opened popup
        const prev = markersRef.current.get(autoOpenedRef.current);
        if (prev) prev.closePopup();
        autoOpenedRef.current = null;
      }
    }

    function onMoveStart() {
      fadeOut();
    }

    function onMoveEnd() {
      fadeIn();
      autoOpenSingleMarker();
    }

    map.on('movestart', onMoveStart);
    map.on('zoomstart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);

    // Initial check
    autoOpenSingleMarker();

    return () => {
      map.off('movestart', onMoveStart);
      map.off('zoomstart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onMoveEnd);
    };
  }, [map, markersRef]);

  return null;
}
