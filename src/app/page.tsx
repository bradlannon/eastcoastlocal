'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useQueryState } from 'nuqs';
import { format } from 'date-fns';
import MapClientWrapper from '@/components/map/MapClientWrapper';
import EventList from '@/components/events/EventList';
import EventFilters from '@/components/events/EventFilters';
import MobileTabBar from '@/components/layout/MobileTabBar';
import SubmitEventModal from '@/components/events/SubmitEventModal';
import { filterByBounds, filterByDateRange, filterByProvince, filterByCategory, filterBySearch } from '@/lib/filter-utils';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';
import {
  STEP_SIZE,
  positionToTimestamp,
  positionToBlockName,
  filterByTimeWindow,
  computeVenueHeatPoints,
} from '@/lib/timelapse-utils';
import { PROVINCE_LABELS } from '@/lib/province-bounds';
import type { MapMode } from '@/components/map/ModeToggle';
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
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Timelapse state
  const [mapMode, setMapMode] = useState<MapMode>('cluster');
  const [timePosition, setTimePosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [referenceDate] = useState(() => new Date());

  // Play loop: advance scrubber at 1s per step
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setTimePosition((p) => {
          if (p >= 1) { setIsPlaying(false); return 1; }
          return Math.min(p + STEP_SIZE, 1);
        });
      }, 1000);
    }
    return () => {
      if (playRef.current) { clearInterval(playRef.current); playRef.current = null; }
    };
  }, [isPlaying]);

  // Filter state via URL query params
  const [when] = useQueryState('when');
  const [province] = useQueryState('province');
  const [category] = useQueryState('category');
  const [search, setSearch] = useQueryState('q');

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

  // Mode-aware filter chain: derives sidebarEvents, heatPoints, and timeFilteredEvents
  const { sidebarEvents, heatPoints, timeFilteredEvents, mapEvents } = useMemo(() => {
    if (mapMode === 'timelapse') {
      const center = positionToTimestamp(timePosition, referenceDate);
      const timeWindowed = filterByTimeWindow(allEvents, center.getTime(), 24);
      const provinceFiltered = filterByProvince(timeWindowed, province);
      const categoryFiltered = filterByCategory(provinceFiltered, category);
      const searched = filterBySearch(categoryFiltered, search);
      return {
        sidebarEvents: filterByBounds(searched, bounds),
        heatPoints: computeVenueHeatPoints(searched),
        timeFilteredEvents: searched,
        mapEvents: searched,
      };
    }
    const dateFiltered = filterByDateRange(allEvents, when);
    const provinceFiltered = filterByProvince(dateFiltered, province);
    const categoryFiltered = filterByCategory(provinceFiltered, category);
    const searched = filterBySearch(categoryFiltered, search);
    return {
      sidebarEvents: filterByBounds(searched, bounds),
      heatPoints: [],
      timeFilteredEvents: [],
      mapEvents: searched,
    };
  }, [mapMode, timePosition, allEvents, when, province, category, search, bounds, referenceDate]);

  // Current time label for TimelineBar
  const currentLabel = useMemo(() => {
    const ts = positionToTimestamp(timePosition, referenceDate);
    const dayStr = format(ts, 'EEE MMM d');
    const block = positionToBlockName(timePosition);
    return `${dayStr} - ${block}`;
  }, [timePosition, referenceDate]);

  // Timelapse handler functions
  const handleModeToggle = useCallback(() => {
    setMapMode((m) => {
      if (m === 'cluster') return 'timelapse';
      setIsPlaying(false); // stop playback when leaving timelapse
      return 'cluster';
    });
  }, []);
  const handleScrubStart = useCallback(() => setIsPlaying(false), []);
  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);
  const handleToggleHeatmap = useCallback(() => setShowHeatmap((p) => !p), []);

  // Compute friendly empty state message
  function getEmptyMessage(): string {
    if ((when && province) || (when && category) || (province && category)) {
      return `No events matching your filters. Clear filters to see all events.`;
    }
    if (when) {
      const whenLabel =
        when === 'today' ? 'today'
        : when === 'weekend' ? 'this weekend'
        : when === 'week' ? 'this week'
        : when === 'month' ? 'in the next 30 days'
        : when;
      return `No events ${whenLabel}. Try a different date range.`;
    }
    if (province) {
      const label = PROVINCE_LABELS[province] ?? province;
      return `No events in ${label}. Try All Provinces.`;
    }
    if (category) {
      const label = CATEGORY_META[category as EventCategory]?.label ?? category;
      return `No ${label} events in this area. Try All categories.`;
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
      {/* Header — matches bradlannon.ca portfolio nav */}
      <header className="flex-shrink-0 flex items-center justify-between bg-white z-10 h-[64px] border-b-2 border-[#2A9D8F]" style={{ padding: '0 60px', fontFamily: '"Nunito Sans", sans-serif' }}>
        <nav className="flex items-center gap-9">
          <a href="https://www.bradlannon.ca/#portfolio" className="text-[15px] font-semibold uppercase tracking-[0.5px] text-[#6B6B6B] hover:text-[#2A9D8F] transition-colors no-underline">
            Portfolio
          </a>
          <a href="https://www.bradlannon.ca/apps.html" className="text-[15px] font-semibold uppercase tracking-[0.5px] text-[#2A9D8F] no-underline">
            Apps
          </a>
          <a href="https://www.bradlannon.ca/av.html" className="text-[15px] font-semibold uppercase tracking-[0.5px] text-[#6B6B6B] hover:text-[#2A9D8F] transition-colors no-underline">
            A/V
          </a>
          <a href="https://www.bradlannon.ca/#about" className="text-[15px] font-semibold uppercase tracking-[0.5px] text-[#6B6B6B] hover:text-[#2A9D8F] transition-colors no-underline">
            About me
          </a>
        </nav>
      </header>

      {/* Filter bar — hidden in timelapse mode (TimelineBar replaces date filtering) */}
      {loading ? (
        <div className="flex-shrink-0 h-[44px] bg-white border-b border-gray-200 animate-pulse" />
      ) : mapMode === 'cluster' ? (
        <EventFilters
          eventCount={mapEvents.length}
          search={search}
          onSearchChange={setSearch}
          onSubmitEvent={() => setSubmitModalOpen(true)}
        />
      ) : null}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Map panel */}
        <div
          className={`relative flex-1 min-w-0 ${
            activeTab === 'list' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* Event count — bottom left corner of map */}
          {!loading && (
            <div className="absolute bottom-3 left-3 z-[500] bg-white/90 backdrop-blur-sm text-xs font-semibold text-gray-700 px-2.5 py-1 rounded-full shadow-sm border border-gray-200">
              {mapEvents.length} event{mapEvents.length !== 1 ? 's' : ''}
            </div>
          )}
          {loading ? (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          ) : (
            <MapClientWrapper
              events={mapEvents}
              onBoundsChange={setBounds}
              province={province}
              highlightedVenueId={highlightedVenueId}
              flyToTarget={flyToTarget}
              mapMode={mapMode}
              heatPoints={heatPoints}
              onModeToggle={handleModeToggle}
              isPlaying={isPlaying}
              timePosition={timePosition}
              currentLabel={currentLabel}
              eventCount={mapEvents.length}
              onTimePositionChange={setTimePosition}
              onScrubStart={handleScrubStart}
              onPlayPause={handlePlayPause}
              showHeatmap={showHeatmap}
              onToggleHeatmap={handleToggleHeatmap}
              referenceDate={referenceDate}
              timeFilteredEvents={timeFilteredEvents}
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
              events={sidebarEvents}
              emptyMessage={getEmptyMessage()}
              onHoverVenue={setHighlightedVenueId}
              onClickVenue={handleClickVenue}
            />
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Submit event modal */}
      <SubmitEventModal open={submitModalOpen} onClose={() => setSubmitModalOpen(false)} />
    </div>
  );
}
