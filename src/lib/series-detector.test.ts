import {
  performerFuzzyRatio,
  hasRecurrenceKeyword,
  isWeekdayRegular,
  clusterPerformers,
  SERIES_LEVENSHTEIN_THRESHOLD,
  SERIES_MIN_OCCURRENCES,
  RECURRENCE_KEYWORDS,
} from './series-detector';

// ---------------------------------------------------------------------------
// describe('performerFuzzyRatio')
// ---------------------------------------------------------------------------

describe('performerFuzzyRatio', () => {
  // "open mic night" vs "open mic nights": distance=1, max=15 → 0.067 (should cluster)
  it('returns below threshold for "open mic night" vs "open mic nights" (should cluster)', () => {
    const ratio = performerFuzzyRatio('open mic night', 'open mic nights');
    expect(ratio).toBeLessThan(SERIES_LEVENSHTEIN_THRESHOLD);
  });

  // "jazz night" vs "open mic night": distance=9, max=14 → 0.64 (should NOT cluster)
  it('returns above threshold for "jazz night" vs "open mic night" (should NOT cluster)', () => {
    const ratio = performerFuzzyRatio('jazz night', 'open mic night');
    expect(ratio).toBeGreaterThan(SERIES_LEVENSHTEIN_THRESHOLD);
  });

  it('returns 0 for two empty strings', () => {
    expect(performerFuzzyRatio('', '')).toBe(0);
  });

  // "trivia night" vs "trivia nght": distance=1, max=12 → 0.083 (should cluster)
  it('returns below threshold for "trivia night" vs "trivia nght" (should cluster)', () => {
    const ratio = performerFuzzyRatio('trivia night', 'trivia nght');
    expect(ratio).toBeLessThan(SERIES_LEVENSHTEIN_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// describe('hasRecurrenceKeyword')
// ---------------------------------------------------------------------------

describe('hasRecurrenceKeyword', () => {
  it('returns true for "Weekly Open Mic"', () => {
    expect(hasRecurrenceKeyword('Weekly Open Mic')).toBe(true);
  });

  it('returns true for "Every Tuesday Trivia"', () => {
    expect(hasRecurrenceKeyword('Every Tuesday Trivia')).toBe(true);
  });

  it('returns true for "Bingo Night"', () => {
    expect(hasRecurrenceKeyword('Bingo Night')).toBe(true);
  });

  it('returns true for "karaoke"', () => {
    expect(hasRecurrenceKeyword('karaoke')).toBe(true);
  });

  it('returns true for "jam night"', () => {
    expect(hasRecurrenceKeyword('jam night')).toBe(true);
  });

  it('returns true for "quiz night"', () => {
    expect(hasRecurrenceKeyword('quiz night')).toBe(true);
  });

  it('returns true for "open stage"', () => {
    expect(hasRecurrenceKeyword('open stage')).toBe(true);
  });

  it('returns false for "John Smith Band"', () => {
    expect(hasRecurrenceKeyword('John Smith Band')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasRecurrenceKeyword('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe('isWeekdayRegular')
// ---------------------------------------------------------------------------

describe('isWeekdayRegular', () => {
  // Helper: generate dates on a specific weekday
  function datesOnWeekday(weekday: number, count: number): Date[] {
    const dates: Date[] = [];
    // Start from a known Monday: 2026-01-05 (UTC day=1)
    const base = new Date('2026-01-05T12:00:00Z');
    const offset = (weekday - 1 + 7) % 7; // days from Monday
    for (let i = 0; i < count; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + offset + i * 7);
      dates.push(d);
    }
    return dates;
  }

  it('returns true for 4 dates all on Tuesday (4 >= MIN_OCCURRENCES=3)', () => {
    const dates = datesOnWeekday(2, 4); // Tuesday = 2
    expect(isWeekdayRegular(dates)).toBe(true);
  });

  it('returns true for 3 dates on Monday and 1 on Wednesday (3 Mondays >= 3)', () => {
    const mondays = datesOnWeekday(1, 3);
    const wednesday = new Date('2026-01-07T12:00:00Z'); // Wednesday
    expect(isWeekdayRegular([...mondays, wednesday])).toBe(true);
  });

  it('returns false for 2 dates on Friday (below MIN_OCCURRENCES)', () => {
    const dates = datesOnWeekday(5, 2); // Friday = 5
    expect(isWeekdayRegular(dates)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isWeekdayRegular([])).toBe(false);
  });

  it('returns false when 5 dates are each on a different weekday', () => {
    const dates = [
      new Date('2026-01-05T12:00:00Z'), // Monday
      new Date('2026-01-06T12:00:00Z'), // Tuesday
      new Date('2026-01-07T12:00:00Z'), // Wednesday
      new Date('2026-01-08T12:00:00Z'), // Thursday
      new Date('2026-01-09T12:00:00Z'), // Friday
    ];
    expect(isWeekdayRegular(dates)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe('clusterPerformers')
// ---------------------------------------------------------------------------

describe('clusterPerformers', () => {
  // Use performers with distances actually below 0.20 threshold
  // "open mic night" vs "open mic nights" → 0.067 (clusters)
  // "open mic night" vs "open mic nightly" → dist=2/16=0.125 (clusters)
  it('clusters ["open mic night", "open mic nights", "open mic nightly"] into one group', () => {
    const clusters = clusterPerformers([
      'open mic night',
      'open mic nights',
      'open mic nightly',
    ]);
    expect(clusters.size).toBe(1);
    const [variants] = clusters.values();
    expect(variants).toHaveLength(3);
  });

  it('keeps "jazz night" and "open mic night" as two separate clusters', () => {
    const clusters = clusterPerformers(['jazz night', 'open mic night']);
    expect(clusters.size).toBe(2);
  });

  it('uses the most-frequent variant as the cluster representative (not first-encountered)', () => {
    // "open mic nights" appears 3 times, "open mic night" appears 1 time
    // distance("open mic night","open mic nights") = 1, max = 15, ratio = 0.067
    const performers = [
      'open mic night',   // 1 occurrence (first-encountered)
      'open mic nights',  // 3 occurrences (most frequent)
      'open mic nights',
      'open mic nights',
    ];
    const clusters = clusterPerformers(performers);
    expect(clusters.size).toBe(1);
    const [representative] = clusters.keys();
    expect(representative).toBe('open mic nights');
  });

  it('returns a single cluster with one performer as representative for a single input', () => {
    const clusters = clusterPerformers(['trivia night']);
    expect(clusters.size).toBe(1);
    const [representative] = clusters.keys();
    expect(representative).toBe('trivia night');
    const [variants] = clusters.values();
    expect(variants).toHaveLength(1);
    expect(variants[0]).toBe('trivia night');
  });
});

// ---------------------------------------------------------------------------
// Exported constants sanity checks
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('SERIES_LEVENSHTEIN_THRESHOLD is 0.20', () => {
    expect(SERIES_LEVENSHTEIN_THRESHOLD).toBe(0.20);
  });

  it('SERIES_MIN_OCCURRENCES is 3', () => {
    expect(SERIES_MIN_OCCURRENCES).toBe(3);
  });

  it('RECURRENCE_KEYWORDS includes expected terms', () => {
    expect(RECURRENCE_KEYWORDS).toContain('open mic');
    expect(RECURRENCE_KEYWORDS).toContain('trivia');
    expect(RECURRENCE_KEYWORDS).toContain('bingo');
    expect(RECURRENCE_KEYWORDS).toContain('weekly');
    expect(RECURRENCE_KEYWORDS).toContain('every');
    expect(RECURRENCE_KEYWORDS).toContain('karaoke');
    expect(RECURRENCE_KEYWORDS).toContain('open stage');
    expect(RECURRENCE_KEYWORDS).toContain('jam night');
    expect(RECURRENCE_KEYWORDS).toContain('quiz night');
  });
});
