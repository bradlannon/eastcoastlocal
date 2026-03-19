'use client';

import { useQueryState } from 'nuqs';
import { CATEGORY_META, PUBLIC_CATEGORIES, type EventCategory } from '@/lib/categories';

interface EventFiltersProps {
  eventCount: number;
  search: string | null;
  onSearchChange: (value: string | null) => void;
  onSubmitEvent: () => void;
}

const DATE_CHIPS = [
  { value: null, label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This Weekend' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'Next 30 Days' },
] as const;

export default function EventFilters({ eventCount, search, onSearchChange, onSubmitEvent }: EventFiltersProps) {
  const [when, setWhen] = useQueryState('when');
  const [category, setCategory] = useQueryState('category');

  const hasFilters = !!(when || category);

  function handleChipClick(value: string | null) {
    setWhen(value);
  }

  function handleClearFilters() {
    setWhen(null);
    setCategory(null);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0">
      {/* Date chip filters — left side */}
      <div className="flex gap-1 flex-shrink-0">
        {DATE_CHIPS.map((chip) => {
          const isActive = when === chip.value;
          return (
            <button
              key={chip.label}
              onClick={() => handleChipClick(chip.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-[#2A9D8F] text-white border-[#2A9D8F] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Center: Search + Submit */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        <div className="relative w-48">
          <input
            type="text"
            placeholder="Search..."
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value || null)}
            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-300 rounded-full bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2A9D8F] focus:border-[#2A9D8F] placeholder-gray-400"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={onSubmitEvent}
          className="text-xs font-medium text-gray-500 hover:text-[#2A9D8F] transition-colors whitespace-nowrap"
        >
          + Submit Event
        </button>
      </div>

      {/* Category chip filters — right side */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
            !category
              ? 'bg-[#2A9D8F] text-white border-[#2A9D8F] shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          All Types
        </button>
        {PUBLIC_CATEGORIES.map((cat) => {
          const isActive = category === cat;
          const meta = CATEGORY_META[cat as EventCategory];
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-[#2A9D8F] text-white border-[#2A9D8F] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={handleClearFilters}
          className="text-xs text-[#2A9D8F] hover:text-[#237d72] underline whitespace-nowrap transition-colors flex-shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// Export current filter state so parent can read without extra query calls
export function useEventFilters() {
  const [when] = useQueryState('when');
  const [province] = useQueryState('province');
  const [category] = useQueryState('category');
  return { when, province, category };
}
