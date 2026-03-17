import type { LatLngBoundsLiteral } from 'leaflet';

// Center of Atlantic Canada (adjusted for Labrador) for initial map view
export const ATLANTIC_CANADA_CENTER: [number, number] = [49.5, -61.0];

// Initial zoom level to show all four Atlantic provinces including Labrador
export const INITIAL_ZOOM = 5;

// Minimum zoom — the level at which all four provinces are visible.
// Further zoom-out is disabled.
export const MIN_ZOOM = 5;

// Bounding box for all of Atlantic Canada (NB, NS, PEI, NL including Labrador)
export const ATLANTIC_CANADA_BOUNDS: LatLngBoundsLiteral = [
  [43.0, -68.0],
  [61.0, -52.0],
];

// Tight bounds used as maxBounds to constrain map panning to Atlantic Canada only.
// Small padding around the province extents to allow comfortable panning at zoom.
export const ATLANTIC_CANADA_MAX_BOUNDS: LatLngBoundsLiteral = [
  [42.5, -69.0],
  [61.5, -51.0],
];

// Per-province bounding boxes
export const PROVINCE_BOUNDS: Record<string, LatLngBoundsLiteral> = {
  NB: [
    [44.5, -67.1],
    [48.1, -63.8],
  ],
  NS: [
    [43.4, -66.3],
    [47.1, -59.7],
  ],
  PEI: [
    [45.9, -64.5],
    [47.1, -61.9],
  ],
  NL: [
    [46.6, -67.8],
    [60.4, -52.6],
  ],
};

// Full province names for display
export const PROVINCE_LABELS: Record<string, string> = {
  NB: 'New Brunswick',
  NS: 'Nova Scotia',
  PEI: 'Prince Edward Island',
  NL: 'Newfoundland & Labrador',
};
