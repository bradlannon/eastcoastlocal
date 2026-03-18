'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface BoxZoomToolProps {
  active: boolean;
  onDeactivate: () => void;
}

/**
 * Draw-a-box zoom tool. Renders a transparent overlay that captures mouse
 * events and draws a selection rectangle. Zooms into the selected area on release.
 */
export default function BoxZoomTool({ active, onDeactivate }: BoxZoomToolProps) {
  const map = useMap();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  // Escape key to cancel
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
      const sw = map.containerPointToLatLng(
        L.point(Math.min(start.x, endX), Math.max(start.y, endY))
      );
      const ne = map.containerPointToLatLng(
        L.point(Math.max(start.x, endX), Math.min(start.y, endY))
      );
      map.fitBounds(L.latLngBounds(sw, ne), { animate: true });
    }

    setDragging(false);
    setStart(null);
    setCurrent(null);
    onDeactivate();
  }, [dragging, start, map, onDeactivate]);

  if (!active) return null;

  // Calculate selection box style
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
