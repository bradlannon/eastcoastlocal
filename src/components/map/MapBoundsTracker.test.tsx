/**
 * Task 3.11 — MapBoundsTracker characterization tests
 *
 * Behaviours:
 * - Fires onBoundsChange immediately on mount (initial load)
 * - Fires onBoundsChange on moveend with correct {north,south,east,west}
 * - Fires onBoundsChange on zoomend
 * - Always uses latest callback (stable callbackRef pattern)
 * - Returns null (no DOM output)
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const moveEndHandlers: Function[] = [];
const zoomEndHandlers: Function[] = [];

const mockMapBounds = {
  getNorth: jest.fn(() => 50),
  getSouth: jest.fn(() => 44),
  getEast: jest.fn(() => -52),
  getWest: jest.fn(() => -68),
};

const mockMapInstance = {
  getBounds: jest.fn(() => mockMapBounds),
  on: jest.fn(),
  off: jest.fn(),
};

// useMapEvents is how MapBoundsTracker registers handlers
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMap: () => mockMapInstance,
  useMapEvents: (handlers: any) => {
    // Store handlers so tests can trigger them
    if (handlers.moveend) moveEndHandlers.push(handlers.moveend);
    if (handlers.zoomend) zoomEndHandlers.push(handlers.zoomend);
    return mockMapInstance;
  },
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({ extend: jest.fn(), contains: () => true })),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

import { render, act } from '@testing-library/react';
import MapBoundsTracker from './MapBoundsTracker';

describe('MapBoundsTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    moveEndHandlers.length = 0;
    zoomEndHandlers.length = 0;
  });

  it('renders null (no DOM output)', () => {
    const { container } = render(<MapBoundsTracker onBoundsChange={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('fires onBoundsChange immediately on mount with correct bounds', () => {
    const onBoundsChange = jest.fn();
    render(<MapBoundsTracker onBoundsChange={onBoundsChange} />);

    expect(onBoundsChange).toHaveBeenCalledWith({
      north: 50,
      south: 44,
      east: -52,
      west: -68,
    });
  });

  it('fires onBoundsChange when moveend fires', () => {
    const onBoundsChange = jest.fn();
    render(<MapBoundsTracker onBoundsChange={onBoundsChange} />);

    // Clear the initial call
    onBoundsChange.mockClear();

    act(() => {
      moveEndHandlers.forEach((h) => h(mockMapInstance));
    });

    expect(onBoundsChange).toHaveBeenCalledWith({
      north: 50,
      south: 44,
      east: -52,
      west: -68,
    });
  });

  it('fires onBoundsChange when zoomend fires', () => {
    const onBoundsChange = jest.fn();
    render(<MapBoundsTracker onBoundsChange={onBoundsChange} />);

    onBoundsChange.mockClear();

    act(() => {
      zoomEndHandlers.forEach((h) => h(mockMapInstance));
    });

    expect(onBoundsChange).toHaveBeenCalledWith({
      north: 50,
      south: 44,
      east: -52,
      west: -68,
    });
  });

  it('always calls the latest callback (callbackRef pattern)', () => {
    const first = jest.fn();
    const second = jest.fn();

    const { rerender } = render(<MapBoundsTracker onBoundsChange={first} />);
    first.mockClear();

    rerender(<MapBoundsTracker onBoundsChange={second} />);

    act(() => {
      moveEndHandlers.forEach((h) => h(mockMapInstance));
    });

    // second should be called, not first
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
