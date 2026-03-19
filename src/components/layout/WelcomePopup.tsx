'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ecl-welcome-seen';

export default function WelcomePopup() {
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(20);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch { /* SSR or private browsing */ }
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* ignore */ }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!visible) return;
    if (countdown <= 0) {
      close();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, countdown, close]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={close} />

      {/* Popup */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ fontFamily: '"Nunito Sans", sans-serif' }}>
        {/* Header accent bar */}
        <div className="h-1.5 bg-[#2A9D8F]" />

        <div className="px-8 py-8">
          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-1 text-center">
            Welcome to East Coast Local
          </h2>
          <p className="text-sm text-[#2A9D8F] font-semibold text-center mb-6">
            Your guide to what's happening in Atlantic Canada
          </p>

          {/* Features */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E8F6F3] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[#2A9D8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Explore the Map</p>
                <p className="text-xs text-gray-500">Browse events across Nova Scotia, New Brunswick, PEI, and Newfoundland & Labrador. Hover over any pin to see what's happening.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E8F6F3] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[#2A9D8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Filter & Search</p>
                <p className="text-xs text-gray-500">Filter by date, category, or search for your favourite artists and venues. Find live music, comedy, theatre, arts, and community events.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E8F6F3] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[#2A9D8F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Submit an Event</p>
                <p className="text-xs text-gray-500">Know about an event we're missing? Click "+ Submit Event" to let us know. Community submissions help us cover more of the region.</p>
              </div>
            </div>
          </div>

          {/* Close button + countdown */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={close}
              className="px-8 py-2.5 bg-[#2A9D8F] text-white font-semibold rounded-lg hover:bg-[#237d72] transition-colors text-sm"
            >
              Get Started
            </button>
            <span className="text-xs text-gray-400 tabular-nums w-8">
              {countdown}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
