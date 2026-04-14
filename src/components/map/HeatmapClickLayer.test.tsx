/**
 * Task 3.13e — HeatmapClickLayer characterization tests
 *
 * HeatmapClickLayer listens for map click events, finds nearby venues
 * in the current time window, then opens a Popup with HeatmapPopup.
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const clickHandlers: Function[] = [];

const mockMap = {
  on: jest.fn((event: string, handler: Function) => {
    if (event === 'click') clickHandlers.push(handler);
  }),
  off: jest.fn((event: string, handler: Function) => {
    const idx = clickHandlers.indexOf(handler);
    if (idx !== -1) clickHandlers.splice(idx, 1);
  }),
  getBounds: jest.fn(() => ({ contains: () => true })),
};

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: ({ children }: any) => <div data-testid="heatmap-popup-container">{children}</div>,
  useMap: () => mockMap,
  useMapEvents: () => mockMap,
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({})),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

jest.mock('./HeatmapPopup', () => ({ venues }: any) => (
  <div data-testid="heatmap-popup">venues: {venues.length}</div>
));

// Mock timelapse-utils so we can control findNearbyVenues return value
const mockFindNearbyVenues = jest.fn(() => []);

jest.mock('@/lib/timelapse-utils', () => ({
  positionToTimestamp: jest.fn(() => new Date('2026-05-01')),
  filterByTimeWindow: jest.fn(() => []),
  findNearbyVenues: (...args: any[]) => mockFindNearbyVenues(...args),
}));

import { render, screen, act } from '@testing-library/react';
import HeatmapClickLayer from './HeatmapClickLayer';
import type { EventWithVenue } from '@/types/index';

const defaultProps = {
  allEvents: [] as EventWithVenue[],
  timePosition: 0,
  referenceDate: new Date('2026-05-01'),
  onPause: jest.fn(),
};

describe('HeatmapClickLayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clickHandlers.length = 0;
    mockFindNearbyVenues.mockReturnValue([]);
  });

  it('renders null when no click state', () => {
    const { container } = render(<HeatmapClickLayer {...defaultProps} />);
    // The component returns null until clicked with results
    expect(screen.queryByTestId('heatmap-popup')).not.toBeInTheDocument();
  });

  it('registers a click handler on the map', () => {
    render(<HeatmapClickLayer {...defaultProps} />);
    expect(mockMap.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('does NOT show popup when click finds no nearby venues', () => {
    mockFindNearbyVenues.mockReturnValue([]);
    render(<HeatmapClickLayer {...defaultProps} />);

    act(() => {
      clickHandlers.forEach((h) => h({ latlng: { lat: 44.6, lng: -63.5 } }));
    });

    expect(screen.queryByTestId('heatmap-popup')).not.toBeInTheDocument();
  });

  it('shows popup when click finds nearby venues', () => {
    const mockVenueGroup = {
      venue: { id: 1, name: 'Test Venue', lat: 44.6, lng: -63.5 },
      events: [],
    };
    mockFindNearbyVenues.mockReturnValue([mockVenueGroup]);

    render(<HeatmapClickLayer {...defaultProps} />);

    act(() => {
      clickHandlers.forEach((h) => h({ latlng: { lat: 44.6, lng: -63.5 } }));
    });

    expect(screen.getByTestId('heatmap-popup')).toBeInTheDocument();
  });

  it('calls onPause before setting popup state', () => {
    const onPause = jest.fn();
    const mockVenueGroup = { venue: { id: 1, name: 'V', lat: 44.6, lng: -63.5 }, events: [] };
    mockFindNearbyVenues.mockReturnValue([mockVenueGroup]);

    render(<HeatmapClickLayer {...defaultProps} onPause={onPause} />);

    act(() => {
      clickHandlers.forEach((h) => h({ latlng: { lat: 44.6, lng: -63.5 } }));
    });

    expect(onPause).toHaveBeenCalled();
  });

  it('removes click listener on unmount', () => {
    const { unmount } = render(<HeatmapClickLayer {...defaultProps} />);
    unmount();
    expect(mockMap.off).toHaveBeenCalledWith('click', expect.any(Function));
  });
});
