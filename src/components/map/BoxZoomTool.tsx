'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';

interface BoxZoomToolProps {
  active: boolean;
  onDeactivate: () => void;
  mapContainer: HTMLElement | null;
  fitBounds: (bounds: L.LatLngBounds) => void;
  containerPointToLatLng: (point: L.Point) => L.LatLng;
}

/**
 * Draw-a-box zoom overlay. Renders on top of the map, captures mouse
 * events, draws a selection rectangle, and zooms into the area on release.
 *
 * Does NOT use useMap() — receives map functions as props so it can render
 * outside <MapContainer>.
 */
export default function BoxZoomTool({
  active,
  onDeactivate,
  containerPointToLatLng,
  fitBounds,
}: BoxZoomToolProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDeactivate();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onDeactivate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStart({ x, y });
    setCurrent({ x, y });
    setDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [dragging]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging || !start) {
      setDragging(false);
      return;
    }

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) { setDragging(false); return; }

    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const width = Math.abs(endX - start.x);
    const height = Math.abs(endY - start.y);

    if (width > 15 && height > 15) {
      const sw = containerPointToLatLng(
        L.point(Math.min(start.x, endX), Math.max(start.y, endY))
      );
      const ne = containerPointToLatLng(
        L.point(Math.max(start.x, endX), Math.min(start.y, endY))
      );
      fitBounds(L.latLngBounds(sw, ne));
    }

    setDragging(false);
    setStart(null);
    setCurrent(null);
    onDeactivate();
  }, [dragging, start, containerPointToLatLng, fitBounds, onDeactivate]);

  if (!active) return null;

  let boxStyle: React.CSSProperties | null = null;
  if (dragging && start && current) {
    boxStyle = {
      position: 'absolute',
      left: Math.min(start.x, current.x),
      top: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
      border: '2px dashed #E85D26',
      backgroundColor: 'rgba(232, 93, 38, 0.1)',
      borderRadius: 2,
      pointerEvents: 'none' as const,
    };
  }

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1001,
        cursor: 'crosshair',
      }}
    >
      {boxStyle && <div style={boxStyle} />}
    </div>
  );
}
