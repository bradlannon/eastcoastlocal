import { render, screen, fireEvent } from '@testing-library/react';

// Mock next/link for EventCard
jest.mock('next/link', () => {
  const Link = ({ href, children, onClick, className }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    className?: string;
  }) => <a href={href} onClick={onClick} className={className}>{children}</a>;
  Link.displayName = 'Link';
  return Link;
});

import EventList from './EventList';
import type { EventWithVenue } from '@/types/index';

function makeEvent(id: number, performer: string, dateOffset = 0, seriesId?: number): EventWithVenue {
  const date = new Date('2026-05-01T20:00:00Z');
  date.setDate(date.getDate() + dateOffset);
  return {
    events: {
      id,
      venue_id: 10,
      performer,
      normalized_performer: performer.toLowerCase(),
      event_date: date,
      event_time: '8pm',
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      event_category: 'live_music',
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
      series_id: seriesId ?? null,
    },
    venues: {
      id: 10,
      name: 'Test Venue',
      address: '1 Main St',
      city: 'Halifax',
      province: 'NS',
      lat: 44.6488,
      lng: -63.5752,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
    },
  };
}

describe('EventList', () => {
  it('renders default empty state message when no events', () => {
    render(<EventList events={[]} />);
    expect(screen.getByText(/No events in this area/)).toBeInTheDocument();
  });

  it('renders custom empty message when provided', () => {
    render(<EventList events={[]} emptyMessage="Nothing here!" />);
    expect(screen.getByText('Nothing here!')).toBeInTheDocument();
  });

  it('renders an EventCard for each event', () => {
    const events = [
      makeEvent(1, 'Artist A', 0),
      makeEvent(2, 'Artist B', 1),
      makeEvent(3, 'Artist C', 2),
    ];
    render(<EventList events={events} />);
    expect(screen.getByText('Artist A')).toBeInTheDocument();
    expect(screen.getByText('Artist B')).toBeInTheDocument();
    expect(screen.getByText('Artist C')).toBeInTheDocument();
  });

  it('renders correct number of View Details links', () => {
    const events = [
      makeEvent(1, 'Artist A', 0),
      makeEvent(2, 'Artist B', 1),
    ];
    render(<EventList events={events} />);
    const links = screen.getAllByRole('link', { name: 'View Details' });
    expect(links).toHaveLength(2);
  });

  it('collapses series events to one representative per series_id', () => {
    // series_id=5 has 3 occurrences — should collapse to 1 card
    const events = [
      makeEvent(1, 'Artist A', 0),           // non-series
      makeEvent(2, 'Recurring Band', 1, 5),  // series 5 occurrence 1
      makeEvent(3, 'Recurring Band', 8, 5),  // series 5 occurrence 2
      makeEvent(4, 'Recurring Band', 15, 5), // series 5 occurrence 3
    ];
    render(<EventList events={events} />);
    // Should only show 2 cards: Artist A + one Recurring Band representative
    const viewLinks = screen.getAllByRole('link', { name: 'View Details' });
    expect(viewLinks).toHaveLength(2);
  });

  it('shows "+N more upcoming" on collapsed series representative', () => {
    const events = [
      makeEvent(1, 'Recurring Band', 0, 5),
      makeEvent(2, 'Recurring Band', 7, 5),
      makeEvent(3, 'Recurring Band', 14, 5),
    ];
    render(<EventList events={events} />);
    // 3 occurrences → "+2 more upcoming"
    expect(screen.getByText('+2 more upcoming')).toBeInTheDocument();
  });

  it('sorts events by date ascending', () => {
    // Provide events out of order
    const events = [
      makeEvent(3, 'Third Artist', 2),
      makeEvent(1, 'First Artist', 0),
      makeEvent(2, 'Second Artist', 1),
    ];
    render(<EventList events={events} />);
    const performers = screen.getAllByRole('link').filter(
      (el) => el.getAttribute('href')?.startsWith('/event/')
        && (el.textContent === 'First Artist' || el.textContent === 'Second Artist' || el.textContent === 'Third Artist')
    );
    // First link should be First Artist
    expect(performers[0]).toHaveTextContent('First Artist');
    expect(performers[1]).toHaveTextContent('Second Artist');
    expect(performers[2]).toHaveTextContent('Third Artist');
  });

  it('passes onHoverVenue to EventCard', async () => {
    const onHoverVenue = jest.fn();
    const events = [makeEvent(1, 'Jazz Night', 0)];
    render(<EventList events={events} onHoverVenue={onHoverVenue} />);
    const card = screen.getByText('Jazz Night').closest('[data-venue-id]') as HTMLElement;
    fireEvent.mouseEnter(card);
    expect(onHoverVenue).toHaveBeenCalledWith(10);
  });
});
