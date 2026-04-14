/**
 * Task 3.7 — ClusterLayer characterization tests
 *
 * Key behaviour (commit 557f5f8): cluster icon sums eventCount from child markers,
 * not just counts the markers themselves.
 */

jest.mock('leaflet.heat', () => ({}));

const mockMapInstance = {
  on: jest.fn(),
  off: jest.fn(),
  getBounds: jest.fn(() => ({
    getNorth: () => 50,
    getSouth: () => 44,
    getEast: () => -50,
    getWest: () => -70,
    contains: () => true,
  })),
  getZoom: jest.fn(() => 10),
  getContainer: jest.fn(() => {
    const el = document.createElement('div');
    return el;
  }),
  setView: jest.fn(),
  flyTo: jest.fn(),
  fitBounds: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  hasLayer: jest.fn(() => false),
};

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position, eventHandlers, icon, ref: _ref }: any) => (
    <div
      data-testid="marker"
      data-pos={JSON.stringify(position)}
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  useMap: () => mockMapInstance,
  useMapEvents: () => mockMapInstance,
}));

const mockDivIcon = jest.fn(() => ({}));
jest.mock('leaflet', () => ({
  divIcon: (...args: any[]) => mockDivIcon(...args),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({ extend: jest.fn(), contains: () => true })),
  heatLayer: jest.fn(() => ({
    addTo: jest.fn(),
    setLatLngs: jest.fn(),
    setOptions: jest.fn(),
    remove: jest.fn(),
  })),
  default: {},
}));

jest.mock('react-leaflet-cluster', () => ({
  __esModule: true,
  default: ({ children, iconCreateFunction }: any) => {
    // Expose the iconCreateFunction via a data attribute so tests can call it
    return (
      <div data-testid="cluster-group" data-has-icon-fn={!!iconCreateFunction}>
        {children}
      </div>
    );
  },
}));

jest.mock('./VenuePopup', () => ({ venue, events }: any) => (
  <div data-testid="venue-popup" data-venue-id={venue.id}>
    {events.length} events
  </div>
));

import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import ClusterLayer from './ClusterLayer';
import type { EventWithVenue } from '@/types/index';

function makeEvent(id: number, venueId: number, lat = 44.6, lng = -63.5): EventWithVenue {
  return {
    events: {
      id,
      venue_id: venueId,
      performer: `Band ${id}`,
      normalized_performer: `band ${id}`,
      event_date: new Date('2026-05-01T20:00:00Z'),
      event_time: null,
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
      name: `Venue ${venueId}`,
      address: '1 Main St',
      city: 'Halifax',
      province: 'NS',
      lat,
      lng,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
    },
  };
}

describe('ClusterLayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing with empty events', () => {
    render(<ClusterLayer events={[]} />);
    expect(screen.getByTestId('cluster-group')).toBeInTheDocument();
  });

  it('renders a marker for each unique venue', () => {
    const events = [makeEvent(1, 10), makeEvent(2, 20), makeEvent(3, 30)];
    render(<ClusterLayer events={events} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(3);
  });

  it('groups multiple events per venue into a single marker', () => {
    // venueId=10 gets 3 events, venueId=20 gets 1
    const events = [
      makeEvent(1, 10),
      makeEvent(2, 10),
      makeEvent(3, 10),
      makeEvent(4, 20),
    ];
    render(<ClusterLayer events={events} />);
    // Only 2 unique venues → 2 markers
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
  });

  it('skips events with null lat/lng', () => {
    const events = [
      makeEvent(1, 10, 44.6, -63.5),
      // venueId=99 has no lat/lng
      {
        ...makeEvent(2, 99),
        venues: { ...makeEvent(2, 99).venues, lat: null, lng: null },
      },
    ];
    render(<ClusterLayer events={events} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(1);
  });

  it('renders a VenuePopup inside each marker', () => {
    const events = [makeEvent(1, 10), makeEvent(2, 20)];
    render(<ClusterLayer events={events} />);
    const popups = screen.getAllByTestId('venue-popup');
    expect(popups).toHaveLength(2);
  });

  it('passes multiple events to VenuePopup for the same venue', () => {
    const events = [makeEvent(1, 10), makeEvent(2, 10), makeEvent(3, 10)];
    render(<ClusterLayer events={events} />);
    const popup = screen.getByTestId('venue-popup');
    expect(popup).toHaveTextContent('3 events');
  });

  it('passes iconCreateFunction to MarkerClusterGroup (for event-count summing)', () => {
    render(<ClusterLayer events={[makeEvent(1, 10)]} />);
    expect(screen.getByTestId('cluster-group')).toHaveAttribute('data-has-icon-fn', 'true');
  });

  it('creates divIcon for each marker with event count', () => {
    const events = [makeEvent(1, 10), makeEvent(2, 10)];
    render(<ClusterLayer events={events} />);
    // L.divIcon is called to build the icon; it should have been called at least once
    expect(mockDivIcon).toHaveBeenCalled();
    // The html should contain count=2
    const calls = mockDivIcon.mock.calls;
    const htmls = calls.map((c: any[]) => c[0]?.html ?? '');
    const hasTwo = htmls.some((h: string) => h.includes('>2<'));
    expect(hasTwo).toBe(true);
  });
});
