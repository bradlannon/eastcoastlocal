'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useQueryState } from 'nuqs';
import MapClientWrapper from '@/components/map/MapClientWrapper';
import EventList from '@/components/events/EventList';
import EventFilters from '@/components/events/EventFilters';
import MobileTabBar from '@/components/layout/MobileTabBar';
import { filterByBounds, filterByDateRange, filterByProvince } from '@/lib/filter-utils';
import { PROVINCE_LABELS } from '@/lib/province-bounds';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';
import type { FlyToTarget } from '@/components/map/MapViewController';

// Default export wraps content in Suspense (required for useSearchParams / nuqs)
export default function Home() {
  return (
    <Suspense fallback={<div className="flex flex-col" style={{ height: '100dvh' }} />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [allEvents, setAllEvents] = useState<EventWithVenue[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');
  const [loading, setLoading] = useState(true);
  const [highlightedVenueId, setHighlightedVenueId] = useState<number | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);

  // Filter state via URL query params
  const [when] = useQueryState('when');
  const [province] = useQueryState('province');

  useEffect(() => {
    fetch('/api/events')
      .then((res) => res.json())
      .then((data: EventWithVenue[]) => {
        setAllEvents(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Stacked filter chain: date -> province -> viewport
  const dateFiltered = filterByDateRange(allEvents, when);
  const provinceFiltered = filterByProvince(dateFiltered, province);
  const visibleEvents = filterByBounds(provinceFiltered, bounds);

  // Compute friendly empty state message
  function getEmptyMessage(): string {
    if (when && province) {
      return `No events matching your filters. Clear filters to see all events.`;
    }
    if (when) {
      const whenLabel =
        when === 'today' ? 'today'
        : when === 'weekend' ? 'this weekend'
        : when === 'week' ? 'this week'
        : when;
      return `No events ${whenLabel}. Try a different date range.`;
    }
    if (province) {
      const label = PROVINCE_LABELS[province] ?? province;
      return `No events in ${label}. Try All Provinces.`;
    }
    return 'No events in this area. Zoom out to see more.';
  }

  const handleClickVenue = useCallback(
    (venueId: number, lat: number, lng: number) => {
      setFlyToTarget({ lat, lng, venueId });
      // Switch to map tab on mobile so the pan is visible
      setActiveTab('map');
      // Clear fly target after a short window to avoid re-triggering on re-render
      setTimeout(() => setFlyToTarget(null), 2000);
    },
    []
  );

  // When province filter changes, notify MapViewController via MapClient prop directly
  // (province is read from URL by MapViewController via the prop passed below)

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="flex-shrink-0 flex items-center px-4 border-b border-gray-200 bg-white z-10 h-[52px]">
        <h1 className="text-base font-bold text-gray-900 tracking-tight whitespace-nowrap mr-3">
          East Coast Local
        </h1>
      </header>

      {/* Filter bar */}
      {loading ? (
        <div className="flex-shrink-0 h-[44px] bg-white border-b border-gray-200 animate-pulse" />
      ) : (
        <EventFilters
          eventCount={visibleEvents.length}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Map panel */}
        <div
          className={`relative flex-1 min-w-0 ${
            activeTab === 'list' ? 'hidden md:block' : 'block'
          }`}
        >
          {loading ? (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          ) : (
            <MapClientWrapper
              events={allEvents}
              onBoundsChange={setBounds}
              province={province}
              highlightedVenueId={highlightedVenueId}
              flyToTarget={flyToTarget}
            />
          )}
        </div>

        {/* List panel */}
        <div
          className={`
            md:w-[380px] md:flex-shrink-0 md:border-l md:border-gray-200
            ${activeTab === 'map' ? 'hidden md:flex' : 'flex'}
            flex-col min-h-0 w-full
            pb-[56px] md:pb-0
          `}
        >
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <EventList
              events={visibleEvents}
              emptyMessage={getEmptyMessage()}
              onHoverVenue={setHighlightedVenueId}
              onClickVenue={handleClickVenue}
            />
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
