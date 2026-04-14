/**
 * Task 3.9a — VenuePopup characterization tests
 *
 * VenuePopup is a pure React component (no leaflet imports).
 * Behaviours:
 * - Shows venue name
 * - Shows event count
 * - Shows performer name per event
 * - Shows formatted date and optional event_time
 * - Renders a "Details" link to /event/{id} for each event
 * - Events are sorted by event_date ascending
 */

import { render, screen } from '@testing-library/react';
import VenuePopup from './VenuePopup';
import type { Venue, EventWithVenue } from '@/types/index';

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 1,
    name: 'The Test Venue',
    address: '1 Main St',
    city: 'Halifax',
    province: 'NS',
    lat: 44.6488,
    lng: -63.5752,
    website: null,
    venue_type: null,
    google_place_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeEventItem(id: number, eventDate: string, overrides: Partial<EventWithVenue['events']> = {}): EventWithVenue {
  return {
    events: {
      id,
      venue_id: 1,
      performer: `Performer ${id}`,
      normalized_performer: `performer ${id}`,
      event_date: new Date(eventDate),
      event_time: null,
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
      series_id: null,
      ...overrides,
    },
    venues: makeVenue(),
  };
}

describe('VenuePopup', () => {
  const venue = makeVenue();

  it('displays the venue name', () => {
    render(<VenuePopup venue={venue} events={[makeEventItem(1, '2026-05-01')]} />);
    expect(screen.getByText('The Test Venue')).toBeInTheDocument();
  });

  it('shows "1 event" (singular) for a single event', () => {
    render(<VenuePopup venue={venue} events={[makeEventItem(1, '2026-05-01')]} />);
    expect(screen.getByText(/1 event\b/)).toBeInTheDocument();
  });

  it('shows "N events" (plural) for multiple events', () => {
    const events = [makeEventItem(1, '2026-05-01'), makeEventItem(2, '2026-05-02')];
    render(<VenuePopup venue={venue} events={events} />);
    expect(screen.getByText(/2 events/)).toBeInTheDocument();
  });

  it('shows performer name for each event', () => {
    const events = [makeEventItem(1, '2026-05-01'), makeEventItem(2, '2026-05-02')];
    render(<VenuePopup venue={venue} events={events} />);
    expect(screen.getByText('Performer 1')).toBeInTheDocument();
    expect(screen.getByText('Performer 2')).toBeInTheDocument();
  });

  it('renders a Details link pointing to /event/{id}', () => {
    render(<VenuePopup venue={venue} events={[makeEventItem(42, '2026-05-01')]} />);
    const link = screen.getByRole('link', { name: /details/i });
    expect(link).toHaveAttribute('href', '/event/42');
  });

  it('renders a Details link for each event', () => {
    const events = [makeEventItem(10, '2026-05-01'), makeEventItem(20, '2026-05-02')];
    render(<VenuePopup venue={venue} events={events} />);
    const links = screen.getAllByRole('link', { name: /details/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/event/10');
    expect(links[1]).toHaveAttribute('href', '/event/20');
  });

  it('shows event_time when provided', () => {
    const events = [makeEventItem(1, '2026-05-01', { event_time: '8:00 PM' })];
    render(<VenuePopup venue={venue} events={events} />);
    expect(screen.getByText(/8:00 PM/)).toBeInTheDocument();
  });

  it('does NOT show "·" time separator when event_time is null', () => {
    const events = [makeEventItem(1, '2026-05-01', { event_time: null })];
    render(<VenuePopup venue={venue} events={events} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('sorts events by date ascending', () => {
    // Provide events in reverse order; they should appear earliest first
    const events = [
      makeEventItem(3, '2026-05-03', { performer: 'Third' }),
      makeEventItem(1, '2026-05-01', { performer: 'First' }),
      makeEventItem(2, '2026-05-02', { performer: 'Second' }),
    ];
    render(<VenuePopup venue={venue} events={events} />);
    const performers = screen.getAllByText(/First|Second|Third/);
    expect(performers[0]).toHaveTextContent('First');
    expect(performers[1]).toHaveTextContent('Second');
    expect(performers[2]).toHaveTextContent('Third');
  });
});
