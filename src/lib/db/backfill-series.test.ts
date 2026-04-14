/**
 * Characterization tests for src/lib/db/backfill-series.ts
 *
 * The script calls detectAndTagSeries() from @/lib/series-detector
 * and logs the result. We mock the series-detector module.
 */

const mockDetectAndTagSeries = jest.fn().mockResolvedValue({
  seriesUpserted: 0,
  eventsTagged: 0,
});

jest.mock('@/lib/series-detector', () => ({
  detectAndTagSeries: (...args: unknown[]) => mockDetectAndTagSeries(...args),
}));

// Prevent dotenv from loading real .env files
jest.mock('dotenv/config', () => ({}));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Load the script once and wait for it to run
beforeAll(async () => {
  await import('./backfill-series');
  await new Promise((r) => setTimeout(r, 100));
});

describe('backfill-series script', () => {
  it('calls detectAndTagSeries()', () => {
    expect(mockDetectAndTagSeries).toHaveBeenCalled();
  });

  it('calls detectAndTagSeries() exactly once', () => {
    expect(mockDetectAndTagSeries).toHaveBeenCalledTimes(1);
  });

  it('logs seriesUpserted count from the result', async () => {
    // Reset to test logging behavior with known values
    jest.resetModules();
    jest.mock('@/lib/series-detector', () => ({
      detectAndTagSeries: jest.fn().mockResolvedValue({ seriesUpserted: 5, eventsTagged: 12 }),
    }));
    jest.mock('dotenv/config', () => ({}));
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await import('./backfill-series');
    await new Promise((r) => setTimeout(r, 100));

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toMatch(/5/);
    expect(output).toMatch(/12/);
  });

  it('logs 0 series upserted when no series detected', async () => {
    jest.resetModules();
    jest.mock('@/lib/series-detector', () => ({
      detectAndTagSeries: jest.fn().mockResolvedValue({ seriesUpserted: 0, eventsTagged: 0 }),
    }));
    jest.mock('dotenv/config', () => ({}));
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await import('./backfill-series');
    await new Promise((r) => setTimeout(r, 100));

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toMatch(/0/);
  });

  it('handles detectAndTagSeries rejection without crashing', async () => {
    jest.resetModules();
    jest.mock('@/lib/series-detector', () => ({
      detectAndTagSeries: jest.fn().mockRejectedValue(new Error('DB error')),
    }));
    jest.mock('dotenv/config', () => ({}));
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await import('./backfill-series');
    await new Promise((r) => setTimeout(r, 100));

    // Script calls .catch(console.error) so error should be logged
    const output = errorSpy.mock.calls.flat().join(' ');
    expect(output).toMatch(/DB error/);
  });
});
