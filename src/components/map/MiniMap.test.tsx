/**
 * Task 3.13f — MiniMap characterization tests
 */

jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility', () => ({}), { virtual: true });
jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom }: any) => (
    <div data-testid="mini-map" data-center={JSON.stringify(center)} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ title }: any) => <div data-testid="mini-marker" data-title={title} />,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMap: () => ({}),
  useMapEvents: () => ({}),
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({})),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

import { render, screen } from '@testing-library/react';
import MiniMap from './MiniMap';

describe('MiniMap', () => {
  const props = { lat: 44.6488, lng: -63.5752, venueName: 'Test Hall' };

  it('renders a map container', () => {
    render(<MiniMap {...props} />);
    expect(screen.getByTestId('mini-map')).toBeInTheDocument();
  });

  it('centers map on the provided lat/lng', () => {
    render(<MiniMap {...props} />);
    const map = screen.getByTestId('mini-map');
    expect(map).toHaveAttribute('data-center', JSON.stringify([44.6488, -63.5752]));
  });

  it('renders a marker for the venue', () => {
    render(<MiniMap {...props} />);
    expect(screen.getByTestId('mini-marker')).toBeInTheDocument();
  });

  it('passes venueName as title to the marker', () => {
    render(<MiniMap {...props} />);
    expect(screen.getByTestId('mini-marker')).toHaveAttribute('data-title', 'Test Hall');
  });

  it('renders a tile layer', () => {
    render(<MiniMap {...props} />);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });
});
