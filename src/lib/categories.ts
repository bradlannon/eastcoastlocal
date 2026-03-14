import { EVENT_CATEGORIES } from './db/schema';

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_META: Record<EventCategory, { label: string; color: string; icon: string }> = {
  live_music: { label: 'Live Music', color: '#E53E3E', icon: '🎵' },
  comedy:     { label: 'Comedy',     color: '#DD6B20', icon: '😂' },
  theatre:    { label: 'Theatre',    color: '#805AD5', icon: '🎭' },
  arts:       { label: 'Arts',       color: '#D69E2E', icon: '🎨' },
  sports:     { label: 'Sports',     color: '#38A169', icon: '⚽' },
  festival:   { label: 'Festival',   color: '#D53F8C', icon: '🎪' },
  community:  { label: 'Community',  color: '#3182CE', icon: '🏘️' },
  other:      { label: 'Other',      color: '#718096', icon: '📅' },
};
