/**
 * Task 3.13b — GeolocationButton characterization tests
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const mockMap = {
  on: jest.fn(), off: jest.fn(), flyTo: jest.fn(), fitBounds: jest.fn(),
};

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
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

import { render, screen, fireEvent } from '@testing-library/react';
import GeolocationButton from './GeolocationButton';

describe('GeolocationButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a button when geolocation is available', () => {
    // jsdom provides navigator.geolocation by default (or we mock it)
    const mockGeo = {
      getCurrentPosition: jest.fn(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeo,
      writable: true,
      configurable: true,
    });

    render(<GeolocationButton />);
    expect(screen.getByRole('button', { name: /center map on my location/i })).toBeInTheDocument();
  });

  it('calls navigator.geolocation.getCurrentPosition on click', () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      writable: true,
      configurable: true,
    });

    render(<GeolocationButton />);
    fireEvent.click(screen.getByRole('button', { name: /center map on my location/i }));
    expect(getCurrentPosition).toHaveBeenCalled();
  });

  it('calls map.flyTo with user coordinates on success', () => {
    const getCurrentPosition = jest.fn((success) => {
      success({ coords: { latitude: 44.6, longitude: -63.5 } });
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      writable: true,
      configurable: true,
    });

    render(<GeolocationButton />);
    fireEvent.click(screen.getByRole('button', { name: /center map on my location/i }));
    expect(mockMap.flyTo).toHaveBeenCalledWith([44.6, -63.5], 12, expect.objectContaining({ animate: true }));
  });
});
