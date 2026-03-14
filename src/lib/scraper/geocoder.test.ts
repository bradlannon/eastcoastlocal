import { geocodeAddress } from './geocoder';

describe('geocodeAddress', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockGeocode(response: object) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
  }

  it('returns lat/lng for valid address with ROOFTOP precision', async () => {
    mockGeocode({
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 44.6476, lng: -63.5728 },
            location_type: 'ROOFTOP',
          },
        },
      ],
    });

    const result = await geocodeAddress('1234 Main St, Halifax NS');
    expect(result).toEqual({ lat: 44.6476, lng: -63.5728 });
  });

  it('returns lat/lng for RANGE_INTERPOLATED precision', async () => {
    mockGeocode({
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 46.1351, lng: -60.1831 },
            location_type: 'RANGE_INTERPOLATED',
          },
        },
      ],
    });

    const result = await geocodeAddress('456 Elm St, Sydney NS');
    expect(result).toEqual({ lat: 46.1351, lng: -60.1831 });
  });

  it('returns null when API returns APPROXIMATE precision', async () => {
    mockGeocode({
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 44.0, lng: -63.0 },
            location_type: 'APPROXIMATE',
          },
        },
      ],
    });

    const result = await geocodeAddress('Somewhere, Nova Scotia');
    expect(result).toBeNull();
  });

  it('returns null when API returns ZERO_RESULTS', async () => {
    mockGeocode({
      status: 'ZERO_RESULTS',
      results: [],
    });

    const result = await geocodeAddress('Fake Place That Does Not Exist 99999');
    expect(result).toBeNull();
  });

  it('returns null when API returns non-OK status', async () => {
    mockGeocode({
      status: 'REQUEST_DENIED',
      results: [],
    });

    const result = await geocodeAddress('123 Some St');
    expect(result).toBeNull();
  });

  it('includes region=ca in the request URL', async () => {
    mockGeocode({
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 44.6, lng: -63.5 },
            location_type: 'ROOFTOP',
          },
        },
      ],
    });

    await geocodeAddress('Test Address');

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('region=ca');
  });

  it('includes components=country:CA in the request URL', async () => {
    mockGeocode({
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 44.6, lng: -63.5 },
            location_type: 'ROOFTOP',
          },
        },
      ],
    });

    await geocodeAddress('Test Address');

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('components=country%3ACA');
  });
});
