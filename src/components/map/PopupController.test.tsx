/**
 * Task 3.10 — PopupController characterization tests
 *
 * PopupController is a pure side-effect component (returns null).
 * Key behaviours (commit 5c0de2d):
 * - Registers movestart/zoomstart/moveend/zoomend on the map
 * - On movestart: fades out popups (opacity → 0)
 * - On moveend: fades in popups (opacity → 1), auto-opens single visible marker
 * - Auto-open only when zoom >= 10 and exactly 1 marker in bounds
 * - Cleans up listeners on unmount
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const eventHandlers: Record<string, Function> = {};

const mockMap = {
  on: jest.fn((event: string, handler: Function) => {
    eventHandlers[event] = handler;
  }),
  off: jest.fn((event: string) => {
    delete eventHandlers[event];
  }),
  getBounds: jest.fn(),
  getZoom: jest.fn(() => 12),
  getContainer: jest.fn(),
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
import PopupController from './PopupController';
import type L from 'leaflet';

function makeMockMarker(lat: number, lng: number) {
  return {
    getLatLng: () => ({ lat, lng }),
    openPopup: jest.fn(),
    closePopup: jest.fn(),
    isPopupOpen: jest.fn(() => false),
    setIcon: jest.fn(),
    setZIndexOffset: jest.fn(),
  };
}

// Build a container with mocked popup elements and return a ref to the map container
function setupMapContainer(popupCount = 0) {
  const container = document.createElement('div');
  for (let i = 0; i < popupCount; i++) {
    const popup = document.createElement('div');
    popup.className = 'leaflet-popup';
    container.appendChild(popup);
  }
  mockMap.getContainer.mockReturnValue(container);
  return container;
}

describe('PopupController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the eventHandlers object
    Object.keys(eventHandlers).forEach((k) => delete eventHandlers[k]);
  });

  it('renders null', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    setupMapContainer();
    mockMap.getBounds.mockReturnValue({ contains: () => false });

    const { container } = render(<PopupController markersRef={markersRef} />);
    expect(container.firstChild).toBeNull();
  });

  it('registers movestart, zoomstart, moveend, zoomend on map', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    setupMapContainer();
    mockMap.getBounds.mockReturnValue({ contains: () => false });

    render(<PopupController markersRef={markersRef} />);

    expect(mockMap.on).toHaveBeenCalledWith('movestart', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('zoomstart', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
  });

  it('fades out popups on movestart (opacity → 0)', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const container = setupMapContainer(2);
    mockMap.getBounds.mockReturnValue({ contains: () => false });

    render(<PopupController markersRef={markersRef} />);

    act(() => {
      eventHandlers['movestart']?.();
    });

    const popups = container.querySelectorAll('.leaflet-popup');
    popups.forEach((popup: any) => {
      expect(popup.style.opacity).toBe('0');
    });
  });

  it('fades in popups on moveend (opacity → 1)', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    const container = setupMapContainer(1);
    mockMap.getBounds.mockReturnValue({ contains: () => false });
    mockMap.getZoom.mockReturnValue(12);

    render(<PopupController markersRef={markersRef} />);

    act(() => {
      eventHandlers['moveend']?.();
    });

    const popups = container.querySelectorAll('.leaflet-popup');
    popups.forEach((popup: any) => {
      expect(popup.style.opacity).toBe('1');
    });
  });

  it('auto-opens popup for the single visible marker on moveend at zoom >= 10', () => {
    const marker = makeMockMarker(44.6, -63.5);
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map([[1, marker as any]]);
    setupMapContainer();
    mockMap.getZoom.mockReturnValue(12);
    mockMap.getBounds.mockReturnValue({ contains: () => true });

    render(<PopupController markersRef={markersRef} />);

    // Initial check auto-opens
    expect(marker.openPopup).toHaveBeenCalled();
  });

  it('does NOT auto-open popup when zoom < 10', () => {
    const marker = makeMockMarker(44.6, -63.5);
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map([[1, marker as any]]);
    setupMapContainer();
    mockMap.getZoom.mockReturnValue(8);
    mockMap.getBounds.mockReturnValue({ contains: () => true });

    render(<PopupController markersRef={markersRef} />);

    expect(marker.openPopup).not.toHaveBeenCalled();
  });

  it('does NOT auto-open when multiple markers are visible (multiple popups can coexist)', () => {
    const m1 = makeMockMarker(44.6, -63.5);
    const m2 = makeMockMarker(44.7, -63.6);
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map([[1, m1 as any], [2, m2 as any]]);
    setupMapContainer();
    mockMap.getZoom.mockReturnValue(12);
    mockMap.getBounds.mockReturnValue({ contains: () => true });

    render(<PopupController markersRef={markersRef} />);

    // With 2 visible markers, no auto-open
    expect(m1.openPopup).not.toHaveBeenCalled();
    expect(m2.openPopup).not.toHaveBeenCalled();
  });

  it('removes event listeners on unmount', () => {
    const markersRef = createRef<Map<number, L.Marker>>() as any;
    markersRef.current = new Map();
    setupMapContainer();
    mockMap.getBounds.mockReturnValue({ contains: () => false });

    const { unmount } = render(<PopupController markersRef={markersRef} />);
    unmount();

    expect(mockMap.off).toHaveBeenCalledWith('movestart', expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith('moveend', expect.any(Function));
  });
});
