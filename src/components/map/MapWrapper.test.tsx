/**
 * Task 3.13i — MapWrapper characterization tests
 *
 * MapWrapper exports MiniMapWrapper (a next/dynamic wrapper for MiniMap).
 * In tests, dynamic() should resolve to the MiniMap mock.
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility', () => ({}), { virtual: true });

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

jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

// Mock next/dynamic so MiniMapWrapper renders MiniMap directly in tests
jest.mock('next/dynamic', () => {
  return (_fn: () => Promise<any>, _opts?: any) => {
    const MiniMap = require('./MiniMap').default;
    return MiniMap;
  };
});

import { render, screen } from '@testing-library/react';
import { MiniMapWrapper } from './MapWrapper';

describe('MapWrapper (MiniMapWrapper)', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MiniMapWrapper lat={44.6488} lng={-63.5752} venueName="Test Hall" />
    );
    expect(container).toBeTruthy();
  });

  it('renders the mini map', () => {
    render(<MiniMapWrapper lat={44.6488} lng={-63.5752} venueName="Test Hall" />);
    expect(screen.getByTestId('mini-map')).toBeInTheDocument();
  });

  it('renders a marker with the venue name', () => {
    render(<MiniMapWrapper lat={44.6488} lng={-63.5752} venueName="The Marquee" />);
    expect(screen.getByTestId('mini-marker')).toHaveAttribute('data-title', 'The Marquee');
  });
});
