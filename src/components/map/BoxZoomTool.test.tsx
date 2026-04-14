/**
 * Task 3.13d — BoxZoomTool characterization tests
 */

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
  icon: jest.fn(() => ({})),
  latLngBounds: jest.fn((sw, ne) => ({ sw, ne })),
  point: jest.fn((x, y) => ({ x, y })),
  heatLayer: jest.fn(() => ({ addTo: jest.fn(), setLatLngs: jest.fn(), setOptions: jest.fn() })),
  default: {},
}));

jest.mock('leaflet.heat', () => ({}));
jest.mock('react-leaflet-cluster', () => ({ __esModule: true, default: () => null }));

import { render, screen, fireEvent } from '@testing-library/react';
import BoxZoomTool from './BoxZoomTool';

const baseProps = {
  active: true,
  onDeactivate: jest.fn(),
  mapContainer: null,
  fitBounds: jest.fn(),
  containerPointToLatLng: jest.fn((pt: any) => ({ lat: pt.y, lng: pt.x })),
};

describe('BoxZoomTool', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns null when active=false', () => {
    const { container } = render(<BoxZoomTool {...baseProps} active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders crosshair overlay when active=true', () => {
    const { container } = render(<BoxZoomTool {...baseProps} active={true} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.style.cursor).toBe('crosshair');
  });

  it('calls onDeactivate when Escape key pressed', () => {
    const onDeactivate = jest.fn();
    render(<BoxZoomTool {...baseProps} onDeactivate={onDeactivate} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDeactivate).toHaveBeenCalled();
  });

  it('draws a selection rectangle on mousedown + mousemove', () => {
    const { container } = render(<BoxZoomTool {...baseProps} />);
    const overlay = container.firstChild as HTMLElement;

    // Simulate mousedown to start drag
    fireEvent.mouseDown(overlay, { button: 0, clientX: 10, clientY: 10 });
    // Simulate mousemove
    fireEvent.mouseMove(overlay, { clientX: 60, clientY: 60 });

    // A child div (the selection box) should exist
    const selectionBox = overlay.querySelector('div');
    expect(selectionBox).toBeTruthy();
  });

  it('calls fitBounds and onDeactivate on mouseup with large enough box', () => {
    const fitBounds = jest.fn();
    const onDeactivate = jest.fn();
    const { container } = render(
      <BoxZoomTool {...baseProps} fitBounds={fitBounds} onDeactivate={onDeactivate} />
    );
    const overlay = container.firstChild as HTMLElement;

    fireEvent.mouseDown(overlay, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(overlay, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(overlay, { clientX: 100, clientY: 100 });

    expect(fitBounds).toHaveBeenCalled();
    expect(onDeactivate).toHaveBeenCalled();
  });

  it('does NOT call fitBounds when box too small (<15px)', () => {
    const fitBounds = jest.fn();
    const onDeactivate = jest.fn();
    const { container } = render(
      <BoxZoomTool {...baseProps} fitBounds={fitBounds} onDeactivate={onDeactivate} />
    );
    const overlay = container.firstChild as HTMLElement;

    fireEvent.mouseDown(overlay, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(overlay, { clientX: 5, clientY: 5 });
    fireEvent.mouseUp(overlay, { clientX: 5, clientY: 5 });

    expect(fitBounds).not.toHaveBeenCalled();
    expect(onDeactivate).toHaveBeenCalled();
  });
});
