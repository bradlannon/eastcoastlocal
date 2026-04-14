import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/link to render a plain anchor
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

import EventCard from './EventCard';
import type { EventWithVenue } from '@/types/index';

function makeEvent(overrides: Partial<EventWithVenue['events']> = {}): EventWithVenue {
  return {
    events: {
      id: 1,
      venue_id: 10,
      performer: 'Jazz Night',
      normalized_performer: 'jazz night',
      event_date: new Date('2026-05-01T20:00:00Z'),
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
      series_id: null,
      ...overrides,
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

describe('EventCard', () => {
  it('renders performer name', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByText('Jazz Night')).toBeInTheDocument();
  });

  it('renders venue name and city', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.getByText(/Test Venue/)).toBeInTheDocument();
    expect(screen.getByText(/Halifax/)).toBeInTheDocument();
  });

  it('renders formatted event date', () => {
    render(<EventCard event={makeEvent()} />);
    // event_date is 2026-05-01 — formatted as "Thu, May 1"
    expect(screen.getByText(/May 1/)).toBeInTheDocument();
  });

  it('renders event time when provided', () => {
    render(<EventCard event={makeEvent({ event_time: '9pm' })} />);
    expect(screen.getByText(/9pm/)).toBeInTheDocument();
  });

  it('does not render time separator when event_time is null', () => {
    render(<EventCard event={makeEvent({ event_time: null })} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('renders category badge for live_music', () => {
    render(<EventCard event={makeEvent({ event_category: 'live_music' })} />);
    expect(screen.getByText('Live Music')).toBeInTheDocument();
  });

  it('renders category badge for comedy', () => {
    render(<EventCard event={makeEvent({ event_category: 'comedy' })} />);
    expect(screen.getByText('Comedy')).toBeInTheDocument();
  });

  it('does not render category badge when event_category is null', () => {
    render(<EventCard event={makeEvent({ event_category: null as any })} />);
    expect(screen.queryByText('Live Music')).not.toBeInTheDocument();
  });

  it('renders price badge when price is set', () => {
    render(<EventCard event={makeEvent({ price: '$20' })} />);
    expect(screen.getByText('$20')).toBeInTheDocument();
  });

  it('does not render price badge when price is null', () => {
    render(<EventCard event={makeEvent({ price: null })} />);
    // no price element visible
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('renders "Recurring" badge when series_id is set', () => {
    render(<EventCard event={makeEvent({ series_id: 5 })} />);
    expect(screen.getByText('Recurring')).toBeInTheDocument();
  });

  it('does not render "Recurring" badge when series_id is null', () => {
    render(<EventCard event={makeEvent({ series_id: null })} />);
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument();
  });

  it('performer name links to /event/:id', () => {
    render(<EventCard event={makeEvent()} />);
    const link = screen.getByRole('link', { name: 'Jazz Night' });
    expect(link).toHaveAttribute('href', '/event/1');
  });

  it('"View Details" links to /event/:id', () => {
    render(<EventCard event={makeEvent()} />);
    const link = screen.getByRole('link', { name: 'View Details' });
    expect(link).toHaveAttribute('href', '/event/1');
  });

  it('shows map pin icon when venue has lat/lng', () => {
    render(<EventCard event={makeEvent()} />);
    // The SVG path element for map pin is rendered; check by aria-hidden svg presence
    const card = screen.getByText('Jazz Night').closest('.group');
    expect(card?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders occurrence count when occurrenceCount > 1', () => {
    render(<EventCard event={makeEvent()} occurrenceCount={3} />);
    expect(screen.getByText('+2 more upcoming')).toBeInTheDocument();
  });

  it('does not render occurrence count when occurrenceCount is 1', () => {
    render(<EventCard event={makeEvent()} occurrenceCount={1} />);
    expect(screen.queryByText(/more upcoming/)).not.toBeInTheDocument();
  });

  it('renders Ticketmaster attribution when source_types includes ticketmaster', () => {
    const event = makeEvent();
    render(<EventCard event={{ ...event, source_types: ['ticketmaster'] }} />);
    expect(screen.getByText(/via Ticketmaster/)).toBeInTheDocument();
  });

  it('does not render Ticketmaster attribution when not ticketmaster source', () => {
    render(<EventCard event={makeEvent()} />);
    expect(screen.queryByText(/via Ticketmaster/)).not.toBeInTheDocument();
  });

  it('calls onHover with venue id on mouse enter', () => {
    const onHover = jest.fn();
    render(<EventCard event={makeEvent()} onHover={onHover} />);
    const card = screen.getByText('Jazz Night').closest('[data-venue-id]') as HTMLElement;
    fireEvent.mouseEnter(card);
    expect(onHover).toHaveBeenCalledWith(10);
  });

  it('calls onHover with null on mouse leave', () => {
    const onHover = jest.fn();
    render(<EventCard event={makeEvent()} onHover={onHover} />);
    const card = screen.getByText('Jazz Night').closest('[data-venue-id]') as HTMLElement;
    fireEvent.mouseLeave(card);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('calls onClickVenue when card is clicked and venue has coordinates', async () => {
    const user = userEvent.setup();
    const onClickVenue = jest.fn();
    render(<EventCard event={makeEvent()} onClickVenue={onClickVenue} />);
    const card = screen.getByText('Jazz Night').closest('[data-venue-id]') as HTMLElement;
    await user.click(card);
    expect(onClickVenue).toHaveBeenCalledWith(10, 44.6488, -63.5752);
  });
});
