import type { LatLngBoundsLiteral } from 'leaflet';

// Center of Atlantic Canada — focused on the populated region
// (NS/NB/PEI + island of Newfoundland, not Labrador)
export const ATLANTIC_CANADA_CENTER: [number, number] = [46.8, -62.5];

// Initial zoom to frame NS, NB, PEI, and island of Newfoundland without Labrador
export const INITIAL_ZOOM = 6;

// Minimum zoom — still allows seeing all four provinces at a glance
export const MIN_ZOOM = 5;

// Bounding box for the populated region of Atlantic Canada
// (southern Labrador coast is the northern extent, not full Labrador)
export const ATLANTIC_CANADA_BOUNDS: LatLngBoundsLiteral = [
  [43.0, -68.0],
  [52.0, -52.5],
];

// Max bounds — allows panning up into Labrador if desired but doesn't center on it
export const ATLANTIC_CANADA_MAX_BOUNDS: LatLngBoundsLiteral = [
  [42.5, -69.0],
  [55.0, -51.0],
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
