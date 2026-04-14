/**
 * Task 3.13g — MapRef characterization tests
 *
 * MapRef is a bridge component: it calls onMap with the map instance on mount.
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const mockMapInstance = { flyTo: jest.fn(), fitBounds: jest.fn() };

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => mockMapInstance,
  useMapEvents: () => mockMapInstance,
}));

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn(() => ({})),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

import { render } from '@testing-library/react';
import MapRef from './MapRef';

describe('MapRef', () => {
  it('renders null (no DOM output)', () => {
    const { container } = render(<MapRef onMap={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onMap with the map instance on mount', () => {
    const onMap = jest.fn();
    render(<MapRef onMap={onMap} />);
    expect(onMap).toHaveBeenCalledWith(mockMapInstance);
  });

  it('calls onMap again if map instance changes', () => {
    const onMap = jest.fn();
    render(<MapRef onMap={onMap} />);
    expect(onMap).toHaveBeenCalledTimes(1);
  });
});
