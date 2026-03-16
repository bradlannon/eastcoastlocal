import { GET } from './route';

const mockArchivedEvents = [
  {
    id: 1,
    performer: 'Past Band A',
    venue_name: 'Test Venue',
    event_date: new Date('2025-01-10T20:00:00Z'),
    archived_at: new Date('2025-02-01T12:00:00Z'),
  },
  {
    id: 2,
    performer: 'Past Band B',
    venue_name: 'Another Venue',
    event_date: new Date('2025-01-05T19:00:00Z'),
    archived_at: new Date('2025-01-20T10:00:00Z'),
  },
];

const mockCountResult = [{ count: 2 }];

// Chainable mock for events query (select -> from -> innerJoin -> where -> orderBy -> limit -> offset)
const mockOffset = jest.fn().mockResolvedValue(mockArchivedEvents);
const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
const mockInnerJoin = jest.fn().mockReturnValue({ where: mockWhere });
const mockFrom = jest.fn().mockReturnValue({ innerJoin: mockInnerJoin });

// Chainable mock for count query (select -> from -> where)
const mockCountWhere = jest.fn().mockResolvedValue(mockCountResult);
const mockCountFrom = jest.fn().mockReturnValue({ where: mockCountWhere });

let selectCallCount = 0;

jest.mock('@/lib/db/client', () => ({
  db: {
    select: jest.fn().mockImplementation(() => {
      selectCallCount++;
      // First call is events query, second is count query
      if (selectCallCount % 2 === 1) {
        return { from: mockFrom };
      } else {
        return { from: mockCountFrom };
      }
    }),
  },
}));

describe('GET /api/admin/archived', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectCallCount = 0;
    mockOffset.mockResolvedValue(mockArchivedEvents);
    mockLimit.mockReturnValue({ offset: mockOffset });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockCountWhere.mockResolvedValue(mockCountResult);
    mockCountFrom.mockReturnValue({ where: mockCountWhere });
  });

  it('returns 200 with events array and pagination metadata', async () => {
    const request = new Request('http://localhost/api/admin/archived');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('page', 1);
    expect(body).toHaveProperty('totalPages');
    expect(body).toHaveProperty('total', 2);
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('respects page query param for offset calculation', async () => {
    const request = new Request('http://localhost/api/admin/archived?page=2');
    await GET(request);
    expect(mockOffset).toHaveBeenCalledWith(50); // page 2 offset = (2-1) * 50 = 50
  });

  it('defaults to page 1 when no page param', async () => {
    const request = new Request('http://localhost/api/admin/archived');
    await GET(request);
    expect(mockOffset).toHaveBeenCalledWith(0); // page 1 offset = (1-1) * 50 = 0
  });

  it('returns empty array when no archived events exist', async () => {
    mockOffset.mockResolvedValueOnce([]);
    mockCountWhere.mockResolvedValueOnce([{ count: 0 }]);
    const request = new Request('http://localhost/api/admin/archived');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockOffset.mockRejectedValueOnce(new Error('DB connection failed'));
    const request = new Request('http://localhost/api/admin/archived');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});
