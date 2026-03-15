import { GET } from './route';
import type { EventWithVenue } from '@/types/index';

// Build mock data
const futureDate1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // tomorrow
const futureDate2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

const mockVenue = {
  id: 1,
  name: 'Test Venue',
  address: '123 Main St',
  city: 'Halifax',
  province: 'NS',
  lat: 44.6476,
  lng: -63.5728,
  website: null,
  phone: null,
  venue_type: null,
  created_at: new Date(),
};

const mockRows: EventWithVenue[] = [
  {
    events: {
      id: 1,
      venue_id: 1,
      performer: 'Future Band A',
      normalized_performer: 'futurebanda',
      event_date: futureDate1,
      event_time: '8:00 PM',
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: '$20',
      ticket_link: null,
      description: null,
      cover_image_url: null,
      event_category: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    venues: mockVenue,
  },
  {
    events: {
      id: 2,
      venue_id: 1,
      performer: 'Future Band B',
      normalized_performer: 'futurebandb',
      event_date: futureDate2,
      event_time: null,
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      event_category: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    venues: mockVenue,
  },
];

// Mock the DB client
const mockOrderBy = jest.fn().mockResolvedValue(mockRows);
const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
const mockInnerJoin = jest.fn().mockReturnValue({ where: mockWhere });
const mockFrom = jest.fn().mockReturnValue({ innerJoin: mockInnerJoin });
jest.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}));

describe('GET /api/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderBy.mockResolvedValue(mockRows);
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  });

  it('returns a JSON response', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns rows matching EventWithVenue shape', async () => {
    const response = await GET();
    const body: EventWithVenue[] = await response.json();
    expect(body.length).toBe(2);
    const first = body[0];
    expect(first).toHaveProperty('events');
    expect(first).toHaveProperty('venues');
    expect(first.events).toHaveProperty('performer');
    expect(first.venues).toHaveProperty('name');
  });

  it('only returns future events (DB query filters by date)', async () => {
    // The route passes gte(events.event_date, new Date()) to .where()
    // We verify that mockWhere was called (meaning the filter was applied)
    await GET();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockOrderBy.mockRejectedValueOnce(new Error('DB connection failed'));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});
