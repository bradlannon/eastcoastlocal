/**
 * Task 3.8 — HeatmapLayer characterization tests
 *
 * Behaviours:
 * - Creates a heatLayer on mount
 * - When visible=true, calls setLatLngs with [lat, lng, intensity] triples
 * - Dynamic max intensity scaling (fewer points → lower max so colours saturate)
 * - When visible=false, removes layer
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const mockHeatLayer = {
  addTo: jest.fn(),
  setLatLngs: jest.fn(),
  setOptions: jest.fn(),
  remove: jest.fn(),
};

const mockMap = {
  on: jest.fn(),
  off: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  hasLayer: jest.fn(() => false),
};

const mockHeatLayerFactory = jest.fn(() => mockHeatLayer);

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({ extend: jest.fn(), contains: () => true })),
  heatLayer: (...args: any[]) => mockHeatLayerFactory(...args),
  default: {},
}));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMap: () => mockMap,
  useMapEvents: () => mockMap,
}));

import { render, act } from '@testing-library/react';
import HeatmapLayer from './HeatmapLayer';
import type { HeatPoint } from '@/lib/timelapse-utils';

function makePoints(n: number): HeatPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: 44 + i * 0.01,
    lng: -63 + i * 0.01,
    intensity: 0.5 + i * 0.05,
  }));
}

describe('HeatmapLayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap.hasLayer.mockReturnValue(false);
  });

  it('renders null (no DOM output)', () => {
    const { container } = render(<HeatmapLayer points={[]} visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('creates a heatLayer on mount', () => {
    render(<HeatmapLayer points={[]} visible={true} />);
    expect(mockHeatLayerFactory).toHaveBeenCalled();
  });

  it('calls setLatLngs with correct [lat, lng, intensity] triples when visible', () => {
    const points = makePoints(3);
    render(<HeatmapLayer points={points} visible={true} />);
    expect(mockHeatLayer.setLatLngs).toHaveBeenCalledWith(
      points.map((p) => [p.lat, p.lng, p.intensity])
    );
  });

  it('adds layer to map when visible and layer not already present', () => {
    mockMap.hasLayer.mockReturnValue(false);
    const points = makePoints(2);
    render(<HeatmapLayer points={points} visible={true} />);
    expect(mockHeatLayer.addTo).toHaveBeenCalledWith(mockMap);
  });

  it('does NOT add layer again if already present', () => {
    mockMap.hasLayer.mockReturnValue(true);
    const points = makePoints(2);
    render(<HeatmapLayer points={points} visible={true} />);
    expect(mockHeatLayer.addTo).not.toHaveBeenCalled();
  });

  it('removes layer from map when visible=false', () => {
    render(<HeatmapLayer points={makePoints(2)} visible={false} />);
    expect(mockMap.removeLayer).toHaveBeenCalledWith(mockHeatLayer);
  });

  describe('dynamic max intensity scaling', () => {
    it('sets max=0.3 for ≤3 points', () => {
      render(<HeatmapLayer points={makePoints(3)} visible={true} />);
      expect(mockHeatLayer.setOptions).toHaveBeenCalledWith(expect.objectContaining({ max: 0.3 }));
    });

    it('sets max=0.5 for 4–8 points', () => {
      render(<HeatmapLayer points={makePoints(5)} visible={true} />);
      expect(mockHeatLayer.setOptions).toHaveBeenCalledWith(expect.objectContaining({ max: 0.5 }));
    });

    it('sets max=0.7 for 9–15 points', () => {
      render(<HeatmapLayer points={makePoints(10)} visible={true} />);
      expect(mockHeatLayer.setOptions).toHaveBeenCalledWith(expect.objectContaining({ max: 0.7 }));
    });

    it('sets max=1.0 for >15 points', () => {
      render(<HeatmapLayer points={makePoints(20)} visible={true} />);
      expect(mockHeatLayer.setOptions).toHaveBeenCalledWith(expect.objectContaining({ max: 1.0 }));
    });
  });

  it('removes layer on unmount', () => {
    const { unmount } = render(<HeatmapLayer points={[]} visible={true} />);
    unmount();
    expect(mockMap.removeLayer).toHaveBeenCalled();
  });
});
