'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface BoxZoomToolProps {
  active: boolean;
  onDeactivate: () => void;
}

/**
 * Draw-a-box zoom tool. When active, click+drag draws a selection rectangle
 * and zooms into that area on release.
 */
export default function BoxZoomTool({ active, onDeactivate }: BoxZoomToolProps) {
  const map = useMap();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (boxRef.current) {
      boxRef.current.remove();
      boxRef.current = null;
    }
    startRef.current = null;
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    if (!active) {
      cleanup();
      return;
    }

    const container = map.getContainer();

    // Disable map dragging while box zoom is active
    map.dragging.disable();
    container.style.cursor = 'crosshair';

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return; // left click only
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      startRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      draggingRef.current = true;

      // Create the selection box element
      const box = document.createElement('div');
      box.style.position = 'absolute';
      box.style.border = '2px dashed #E85D26';
      box.style.backgroundColor = 'rgba(232, 93, 38, 0.1)';
      box.style.borderRadius = '2px';
      box.style.pointerEvents = 'none';
      box.style.zIndex = '1001';
      box.style.left = `${startRef.current.x}px`;
      box.style.top = `${startRef.current.y}px`;
      box.style.width = '0px';
      box.style.height = '0px';
      container.appendChild(box);
      boxRef.current = box;
    }

    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current || !startRef.current || !boxRef.current) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const left = Math.min(startRef.current.x, x);
      const top = Math.min(startRef.current.y, y);
      const width = Math.abs(x - startRef.current.x);
      const height = Math.abs(y - startRef.current.y);

      boxRef.current.style.left = `${left}px`;
      boxRef.current.style.top = `${top}px`;
      boxRef.current.style.width = `${width}px`;
      boxRef.current.style.height = `${height}px`;
    }

    function onMouseUp(e: MouseEvent) {
      if (!draggingRef.current || !startRef.current) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const minSize = 20; // minimum drag size in pixels
      const width = Math.abs(endX - startRef.current.x);
      const height = Math.abs(endY - startRef.current.y);

      if (width > minSize && height > minSize) {
        // Convert pixel coordinates to lat/lng
        const sw = map.containerPointToLatLng(
          L.point(Math.min(startRef.current.x, endX), Math.max(startRef.current.y, endY))
        );
        const ne = map.containerPointToLatLng(
          L.point(Math.max(startRef.current.x, endX), Math.min(startRef.current.y, endY))
        );

        map.fitBounds(L.latLngBounds(sw, ne), { animate: true });
      }

      cleanup();
      map.dragging.enable();
      container.style.cursor = '';
      onDeactivate();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        map.dragging.enable();
        container.style.cursor = '';
        onDeactivate();
      }
    }

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      cleanup();
      map.dragging.enable();
      container.style.cursor = '';
    };
  }, [active, map, cleanup, onDeactivate]);

  return null;
}
