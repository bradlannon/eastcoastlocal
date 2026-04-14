/**
 * Task 3.9b — HeatmapPopup characterization tests
 *
 * Behaviours:
 * - With a single venue group → delegates directly to VenuePopup
 * - With multiple venue groups → shows each venue name header + VenuePopup
 */

jest.mock('./VenuePopup', () => ({ venue, events }: any) => (
  <div data-testid="venue-popup" data-venue-id={venue.id}>
    {venue.name} — {events.length} events
  </div>
));

import { render, screen } from '@testing-library/react';
import HeatmapPopup from './HeatmapPopup';
import type { Venue, EventWithVenue } from '@/types/index';
import type { VenueGroup } from '@/lib/timelapse-utils';

function makeVenue(id: number, name: string): Venue {
  return {
    id,
    name,
    address: '1 Main St',
    city: 'Halifax',
    province: 'NS',
    lat: 44.6 + id * 0.01,
    lng: -63.5,
    website: null,
    venue_type: null,
    google_place_id: null,
    created_at: new Date(),
  };
}

function makeEventItem(id: number, venueId: number): EventWithVenue {
  return {
    events: {
      id,
      venue_id: venueId,
      performer: `Performer ${id}`,
      normalized_performer: `performer ${id}`,
      event_date: new Date('2026-05-01'),
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
    },
    venues: makeVenue(venueId, `Venue ${venueId}`),
  };
}

function makeGroup(venueId: number, name: string, eventIds: number[]): VenueGroup {
  const venue = makeVenue(venueId, name);
  const events = eventIds.map((id) => makeEventItem(id, venueId));
  return { venue, events };
}

describe('HeatmapPopup', () => {
  it('renders a single VenuePopup when only one venue group', () => {
    const groups = [makeGroup(1, 'Venue One', [1, 2])];
    render(<HeatmapPopup venues={groups} />);
    const popup = screen.getByTestId('venue-popup');
    expect(popup).toBeInTheDocument();
    expect(popup).toHaveTextContent('Venue One');
    expect(popup).toHaveTextContent('2 events');
  });

  it('does NOT render venue name header for single venue (uses VenuePopup directly)', () => {
    const groups = [makeGroup(1, 'Venue One', [1])];
    render(<HeatmapPopup venues={groups} />);
    // With a single venue the component returns <VenuePopup> directly, no wrapping header
    // So there should be exactly 1 venue-popup and no explicit "Venue One" text outside it
    expect(screen.getAllByTestId('venue-popup')).toHaveLength(1);
  });

  it('renders one VenuePopup per venue group for multiple venues', () => {
    const groups = [
      makeGroup(1, 'Venue A', [1]),
      makeGroup(2, 'Venue B', [2, 3]),
    ];
    render(<HeatmapPopup venues={groups} />);
    const popups = screen.getAllByTestId('venue-popup');
    expect(popups).toHaveLength(2);
  });

  it('shows each venue name as a header when multiple groups', () => {
    const groups = [
      makeGroup(1, 'Venue Alpha', [1]),
      makeGroup(2, 'Venue Beta', [2]),
    ];
    render(<HeatmapPopup venues={groups} />);
    expect(screen.getByText('Venue Alpha')).toBeInTheDocument();
    expect(screen.getByText('Venue Beta')).toBeInTheDocument();
  });

  it('passes correct event counts to each VenuePopup in multi-venue layout', () => {
    const groups = [
      makeGroup(1, 'One', [1, 2, 3]),
      makeGroup(2, 'Two', [4]),
    ];
    render(<HeatmapPopup venues={groups} />);
    const popups = screen.getAllByTestId('venue-popup');
    expect(popups[0]).toHaveTextContent('3 events');
    expect(popups[1]).toHaveTextContent('1 events');
  });
});
