/**
 * Characterization tests for src/lib/categories.ts
 *
 * The module exports CATEGORY_META (metadata for every category including
 * deprecated ones) and PUBLIC_CATEGORIES (the subset shown in public UI).
 * There is no runtime normalization function; tests characterize the shape
 * and consistency of the exported constants.
 */

import { CATEGORY_META, PUBLIC_CATEGORIES } from './categories';
import type { EventCategory } from './categories';
import { EVENT_CATEGORIES } from './db/schema';

describe('EVENT_CATEGORIES (schema)', () => {
  it('contains the expected canonical categories', () => {
    expect(EVENT_CATEGORIES).toContain('live_music');
    expect(EVENT_CATEGORIES).toContain('comedy');
    expect(EVENT_CATEGORIES).toContain('theatre');
    expect(EVENT_CATEGORIES).toContain('arts');
    expect(EVENT_CATEGORIES).toContain('sports');
    expect(EVENT_CATEGORIES).toContain('festival');
    expect(EVENT_CATEGORIES).toContain('community');
    expect(EVENT_CATEGORIES).toContain('other');
  });
});

describe('CATEGORY_META', () => {
  it('has an entry for every EVENT_CATEGORY value', () => {
    for (const cat of EVENT_CATEGORIES) {
      expect(CATEGORY_META).toHaveProperty(cat);
    }
  });

  it('each entry has label, color, and icon fields', () => {
    for (const cat of EVENT_CATEGORIES) {
      const meta = CATEGORY_META[cat as EventCategory];
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.color).toBe('string');
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof meta.icon).toBe('string');
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });

  it('live_music maps to Live Music label', () => {
    expect(CATEGORY_META.live_music.label).toBe('Live Music');
  });

  it('comedy maps to Comedy label', () => {
    expect(CATEGORY_META.comedy.label).toBe('Comedy');
  });

  it('theatre maps to Theatre label', () => {
    expect(CATEGORY_META.theatre.label).toBe('Theatre');
  });

  it('arts maps to Arts label', () => {
    expect(CATEGORY_META.arts.label).toBe('Arts');
  });

  it('community maps to Community label', () => {
    expect(CATEGORY_META.community.label).toBe('Community');
  });

  it('sports, festival, and other all map to Other label (merged)', () => {
    // These are deprecated/merged categories — characterize actual current values
    expect(CATEGORY_META.sports.label).toBe('Other');
    expect(CATEGORY_META.festival.label).toBe('Other');
    expect(CATEGORY_META.other.label).toBe('Other');
  });
});

describe('PUBLIC_CATEGORIES', () => {
  it('includes the primary public-facing categories', () => {
    expect(PUBLIC_CATEGORIES).toContain('live_music');
    expect(PUBLIC_CATEGORIES).toContain('comedy');
    expect(PUBLIC_CATEGORIES).toContain('theatre');
    expect(PUBLIC_CATEGORIES).toContain('arts');
    expect(PUBLIC_CATEGORIES).toContain('community');
    expect(PUBLIC_CATEGORIES).toContain('other');
  });

  it('excludes sports and festival (merged into other for public UI)', () => {
    expect(PUBLIC_CATEGORIES).not.toContain('sports');
    expect(PUBLIC_CATEGORIES).not.toContain('festival');
  });

  it('is a subset of EVENT_CATEGORIES', () => {
    for (const cat of PUBLIC_CATEGORIES) {
      expect(EVENT_CATEGORIES).toContain(cat);
    }
  });
});
