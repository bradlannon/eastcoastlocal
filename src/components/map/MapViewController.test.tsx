/**
 * Task 3.12 — MapViewController characterization tests
 *
 * Behaviours:
 * - Returns null (no DOM output)
 * - On province change (not first mount): calls map.fitBounds with province bounds
 * - When province is null on change: calls map.fitBounds with Atlantic Canada bounds
 * - When flyToTarget changes: calls map.flyTo with lat/lng/zoom=15
 * - After flyTo moveend: opens popup on the target marker
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const moveEndHandlers: Function[] = [];

const mockMap = {
  on: jest.fn((event: string, handler: Function) => {
    if (event === 'moveend') moveEndHandlers.push(handler);
  }),
  off: jest.fn((event: string, handler: Function) => {
    const idx = moveEndHandlers.indexOf(handler);
    if (idx !== -1) moveEndHandlers.splice(idx, 1);
  }),
  fitBounds: jest.fn(),
  flyTo: jest.fn(),
  getBounds: jest.fn(() => ({
    getNorth: () => 50, getSouth: () => 44, getEast: () => -52, getWest: () => -68,
  })),
};

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMap: () => mockMap,
  useMapEvents: () => mockMap,
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({ extend: jest.fn(), contains: () => true })),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import MapViewController from './MapViewController';
import type { FlyToTarget } from './MapViewController';
import type L from 'leaflet';

describe('MapViewController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    moveEndHandlers.length = 0;
  });

  it('renders null (no DOM output)', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const { container } = render(
      <MapViewController province={null} flyToTarget={null} markersRef={markersRef} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does NOT call fitBounds on initial render (skips first mount)', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    render(<MapViewController province="NS" flyToTarget={null} markersRef={markersRef} />);
    expect(mockMap.fitBounds).not.toHaveBeenCalled();
  });

  it('calls fitBounds with province bounds when province changes', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const { rerender } = render(
      <MapViewController province={null} flyToTarget={null} markersRef={markersRef} />
    );
    // Province starts null; change to 'NS'
    rerender(<MapViewController province="NS" flyToTarget={null} markersRef={markersRef} />);
    expect(mockMap.fitBounds).toHaveBeenCalled();
  });

  it('calls fitBounds with Atlantic Canada bounds when province changes to null', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const { rerender } = render(
      <MapViewController province="NS" flyToTarget={null} markersRef={markersRef} />
    );
    // Change NS → null (prevProvince is now NS)
    rerender(<MapViewController province={null} flyToTarget={null} markersRef={markersRef} />);
    expect(mockMap.fitBounds).toHaveBeenCalled();
  });

  it('calls map.flyTo when flyToTarget is set', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const target: FlyToTarget = { lat: 44.6, lng: -63.5, venueId: 42 };

    render(<MapViewController province={null} flyToTarget={target} markersRef={markersRef} />);

    expect(mockMap.flyTo).toHaveBeenCalledWith([44.6, -63.5], 15, expect.objectContaining({ animate: true }));
  });

  it('opens marker popup after moveend following flyTo', () => {
    const mockMarker = { openPopup: jest.fn() };
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map([[42, mockMarker as any]]);

    const target: FlyToTarget = { lat: 44.6, lng: -63.5, venueId: 42 };
    render(<MapViewController province={null} flyToTarget={target} markersRef={markersRef} />);

    act(() => {
      moveEndHandlers.forEach((h) => h());
    });

    expect(mockMarker.openPopup).toHaveBeenCalled();
  });

  it('does NOT call flyTo when flyToTarget is null', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    render(<MapViewController province={null} flyToTarget={null} markersRef={markersRef} />);
    expect(mockMap.flyTo).not.toHaveBeenCalled();
  });
});
