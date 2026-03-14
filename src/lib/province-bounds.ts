import type { LatLngBoundsLiteral } from 'leaflet';

// Center of Atlantic Canada for initial map view
export const ATLANTIC_CANADA_CENTER: [number, number] = [47.0, -62.0];

// Initial zoom level to show all four Atlantic provinces
export const INITIAL_ZOOM = 6;

// Bounding box for all of Atlantic Canada
export const ATLANTIC_CANADA_BOUNDS: LatLngBoundsLiteral = [
  [43.0, -68.0],
  [55.0, -52.5],
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
