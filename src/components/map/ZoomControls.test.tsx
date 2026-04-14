/**
 * Task 3.13a — ZoomControls characterization tests
 */

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

const mockMap = {
  on: jest.fn(), off: jest.fn(),
  zoomIn: jest.fn(), zoomOut: jest.fn(), flyTo: jest.fn(), fitBounds: jest.fn(),
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
import ZoomControls from './ZoomControls';

describe('ZoomControls', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders zoom in button', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
  });

  it('renders zoom out button', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
  });

  it('renders reset view button', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: /reset view/i })).toBeInTheDocument();
  });

  it('renders box zoom button', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: /box zoom/i })).toBeInTheDocument();
  });

  it('calls map.zoomIn(1) when zoom in button is clicked', () => {
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(mockMap.zoomIn).toHaveBeenCalledWith(1, { animate: true });
  });

  it('calls map.zoomOut(1) when zoom out button is clicked', () => {
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(mockMap.zoomOut).toHaveBeenCalledWith(1, { animate: true });
  });

  it('calls map.fitBounds (reset view) when reset button clicked', () => {
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(mockMap.fitBounds).toHaveBeenCalled();
  });

  it('calls onToggleBoxZoom when box zoom button clicked', () => {
    const onToggle = jest.fn();
    render(<ZoomControls onToggleBoxZoom={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /box zoom/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('highlights active province button', () => {
    render(<ZoomControls activeProvince="NS" />);
    const nsBtn = screen.getByRole('button', { name: /NS/ });
    expect(nsBtn).toHaveClass('bg-gray-800');
  });

  it('renders province quick-jump buttons (NS, NB, NL, PEI)', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: /NS/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NB/ })).toBeInTheDocument();
  });
});
