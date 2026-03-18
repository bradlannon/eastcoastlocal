import { EVENT_CATEGORIES } from './db/schema';

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Full category metadata (all values including deprecated ones for admin). */
export const CATEGORY_META: Record<EventCategory, { label: string; color: string; icon: string }> = {
  live_music: { label: 'Live Music', color: '#E53E3E', icon: '🎵' },
  comedy:     { label: 'Comedy',     color: '#DD6B20', icon: '😂' },
  theatre:    { label: 'Theatre',    color: '#805AD5', icon: '🎭' },
  arts:       { label: 'Arts',       color: '#D69E2E', icon: '🎨' },
  sports:     { label: 'Other',      color: '#718096', icon: '📅' },
  festival:   { label: 'Other',      color: '#718096', icon: '📅' },
  community:  { label: 'Community',  color: '#3182CE', icon: '🏘️' },
  other:      { label: 'Other',      color: '#718096', icon: '📅' },
};

/** Categories shown in public-facing filter UI (sports/festival/other merged). */
export const PUBLIC_CATEGORIES = [
  'live_music', 'comedy', 'theatre', 'arts', 'community', 'other',
] as const;
