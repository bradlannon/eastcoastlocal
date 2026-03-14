'use client';

import { useState, useEffect } from 'react';
import MapClientWrapper from '@/components/map/MapClientWrapper';
import EventList from '@/components/events/EventList';
import MobileTabBar from '@/components/layout/MobileTabBar';
import { filterByBounds } from '@/lib/filter-utils';
import type { EventWithVenue } from '@/types/index';
import type { Bounds } from '@/lib/filter-utils';

const HEADER_HEIGHT = 52; // px

export default function Home() {
  const [allEvents, setAllEvents] = useState<EventWithVenue[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');
  const [loading, setLoading] = useState(true);

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

  const visibleEvents = filterByBounds(allEvents, bounds);

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 border-b border-gray-200 bg-white z-10"
        style={{ height: HEADER_HEIGHT }}
      >
        <h1 className="text-base font-bold text-gray-900 tracking-tight">
          East Coast Local
        </h1>
        <span className="text-xs text-gray-500">
          {loading ? (
            <span className="inline-block w-16 h-3 bg-gray-200 animate-pulse rounded" />
          ) : (
            `${visibleEvents.length} event${visibleEvents.length !== 1 ? 's' : ''}`
          )}
        </span>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop: Map (left) + List (right) */}
        {/* Mobile: show map or list based on activeTab */}

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
            <EventList events={visibleEvents} />
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
