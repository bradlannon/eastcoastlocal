/**
 * Task 3.13h — MapClientWrapper characterization tests
 *
 * MapClientWrapper uses next/dynamic (no SSR) to load MapClient.
 * In tests, dynamic() resolves synchronously with the mocked module.
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });
jest.mock('react-leaflet-cluster/dist/assets/MarkerCluster.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility', () => ({}), { virtual: true });

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: () => null,
  Popup: ({ children }: any) => <div>{children}</div>,
  useMap: () => ({ on: jest.fn(), off: jest.fn(), getBounds: () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0, contains: () => true }), getZoom: () => 10, getContainer: () => document.createElement('div'), flyTo: jest.fn(), fitBounds: jest.fn(), zoomIn: jest.fn(), zoomOut: jest.fn(), hasLayer: () => false, addLayer: jest.fn(), removeLayer: jest.fn(), containerPointToLatLng: jest.fn(() => ({ lat: 0, lng: 0 })) }),
  useMapEvents: () => ({ getBounds: () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 }) }),
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({})),
  point: jest.fn((x, y) => ({ x, y })),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

// Mock next/dynamic so it renders the inner component immediately
jest.mock('next/dynamic', () => {
  return (fn: () => Promise<any>) => {
    const ActualComponent = require('./MapClient').default;
    return ActualComponent;
  };
});

// Mock child components used by MapClient
jest.mock('./MapBoundsTracker', () => () => null);
jest.mock('./ClusterLayer', () => () => null);
jest.mock('./HeatmapLayer', () => () => null);
jest.mock('./ModeToggle', () => () => null);
jest.mock('./ZoomControls', () => () => null);
jest.mock('./PopupController', () => () => null);
jest.mock('./BoxZoomTool', () => () => null);
jest.mock('./MapRef', () => () => null);
jest.mock('./MapViewController', () => () => null);
jest.mock('./HeatmapClickLayer', () => () => null);
jest.mock('../timelapse/TimelineBar', () => () => null);
jest.mock('../events/CategoryChipsRow', () => () => null);

import { render, screen } from '@testing-library/react';
import MapClientWrapper from './MapClientWrapper';

describe('MapClientWrapper', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MapClientWrapper events={[]} onBoundsChange={jest.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it('renders the map container via the dynamic import', () => {
    render(<MapClientWrapper events={[]} onBoundsChange={jest.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('passes events prop through to MapClient', () => {
    // With 0 events, no "No events here" overlay should appear
    render(<MapClientWrapper events={[]} onBoundsChange={jest.fn()} />);
    expect(screen.queryByText(/No events here/i)).not.toBeInTheDocument();
  });
});
