/**
 * Task 3.6 — MapClient characterization tests
 */

// CSS imports that don't exist in test environment
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });
jest.mock('react-leaflet-cluster/dist/assets/MarkerCluster.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css', () => ({}), { virtual: true });
jest.mock('leaflet-defaulticon-compatibility', () => ({}), { virtual: true });
jest.mock('leaflet.heat', () => ({}));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position }: any) => (
    <div data-testid="marker" data-pos={JSON.stringify(position)}>{children}</div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    on: jest.fn(),
    off: jest.fn(),
    getBounds: () => ({
      getNorth: () => 1,
      getSouth: () => 0,
      getEast: () => 1,
      getWest: () => 0,
      contains: () => true,
    }),
    getZoom: () => 10,
    getContainer: () => document.createElement('div'),
    setView: jest.fn(),
    flyTo: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
    hasLayer: jest.fn(() => false),
    fitBounds: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    containerPointToLatLng: jest.fn(() => ({ lat: 0, lng: 0 })),
  }),
  useMapEvents: (_handlers: any) => ({
    getBounds: () => ({
      getNorth: () => 1,
      getSouth: () => 0,
      getEast: () => 1,
      getWest: () => 0,
    }),
  }),
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn((a, b) => ({ extend: jest.fn(), contains: () => true })),
  heatLayer: jest.fn(() => ({
    addTo: jest.fn(),
    setLatLngs: jest.fn(),
    setOptions: jest.fn(),
    remove: jest.fn(),
  })),
  point: jest.fn((x, y) => ({ x, y })),
  default: {},
}));

jest.mock('react-leaflet-cluster', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="cluster">{children}</div>,
}));

// Mock child components to simplify
jest.mock('./MapBoundsTracker', () => () => <div data-testid="map-bounds-tracker" />);
jest.mock('./ClusterLayer', () => () => <div data-testid="cluster-layer" />);
jest.mock('./HeatmapLayer', () => () => <div data-testid="heatmap-layer" />);
jest.mock('./ModeToggle', () => () => <div data-testid="mode-toggle" />);
jest.mock('./ZoomControls', () => () => <div data-testid="zoom-controls" />);
jest.mock('./PopupController', () => () => <div data-testid="popup-controller" />);
jest.mock('./BoxZoomTool', () => () => <div data-testid="box-zoom-tool" />);
jest.mock('./MapRef', () => () => <div data-testid="map-ref" />);
jest.mock('./MapViewController', () => () => <div data-testid="map-view-controller" />);
jest.mock('./HeatmapClickLayer', () => () => <div data-testid="heatmap-click-layer" />);
jest.mock('../timelapse/TimelineBar', () => () => <div data-testid="timeline-bar" />);
jest.mock('../events/CategoryChipsRow', () => () => <div data-testid="category-chips-row" />);

import { render, screen } from '@testing-library/react';
import MapClient from './MapClient';
import type { EventWithVenue } from '@/types/index';

function makeEvent(venueId = 1, overrides: Partial<EventWithVenue['venues']> = {}): EventWithVenue {
  return {
    events: {
      id: 1,
      venue_id: venueId,
      performer: 'Test Band',
      normalized_performer: 'test band',
      event_date: new Date('2026-05-01T20:00:00Z'),
      event_time: '8pm',
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      event_category: 'live_music',
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
      series_id: null,
    },
    venues: {
      id: venueId,
      name: 'Test Venue',
      address: '1 Main St',
      city: 'Halifax',
      province: 'NS',
      lat: 44.6488,
      lng: -63.5752,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
      ...overrides,
    },
  };
}

const defaultProps = {
  events: [makeEvent()],
  onBoundsChange: jest.fn(),
};

describe('MapClient', () => {
  it('renders the map container', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders the tile layer inside container', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });

  it('mounts MapBoundsTracker', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('map-bounds-tracker')).toBeInTheDocument();
  });

  it('mounts ClusterLayer', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('cluster-layer')).toBeInTheDocument();
  });

  it('mounts ModeToggle', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument();
  });

  it('mounts PopupController', () => {
    render(<MapClient {...defaultProps} />);
    expect(screen.getByTestId('popup-controller')).toBeInTheDocument();
  });

  it('does NOT render HeatmapLayer in cluster mode', () => {
    render(<MapClient {...defaultProps} mapMode="cluster" />);
    expect(screen.queryByTestId('heatmap-layer')).not.toBeInTheDocument();
  });

  it('renders HeatmapLayer in timelapse mode with showHeatmap=true', () => {
    render(
      <MapClient
        {...defaultProps}
        mapMode="timelapse"
        showHeatmap={true}
        heatPoints={[]}
        timePosition={0}
        referenceDate={new Date()}
      />
    );
    expect(screen.getByTestId('heatmap-layer')).toBeInTheDocument();
  });

  it('renders TimelineBar in timelapse mode', () => {
    render(
      <MapClient
        {...defaultProps}
        mapMode="timelapse"
        timePosition={0}
        isPlaying={false}
        currentLabel="May 1"
        eventCount={3}
      />
    );
    expect(screen.getByTestId('timeline-bar')).toBeInTheDocument();
  });

  it('does NOT render TimelineBar in cluster mode', () => {
    render(<MapClient {...defaultProps} mapMode="cluster" />);
    expect(screen.queryByTestId('timeline-bar')).not.toBeInTheDocument();
  });

  it('shows "No events here" overlay when events have no lat/lng but events.length > 0', () => {
    const noLocEvents = [makeEvent(2, { lat: null, lng: null })];
    render(<MapClient events={noLocEvents} onBoundsChange={jest.fn()} />);
    expect(screen.getByText(/No events here/i)).toBeInTheDocument();
  });

  it('does NOT show overlay when events array is empty', () => {
    render(<MapClient events={[]} onBoundsChange={jest.fn()} />);
    expect(screen.queryByText(/No events here/i)).not.toBeInTheDocument();
  });
});
