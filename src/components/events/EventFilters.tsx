'use client';

import { useQueryState } from 'nuqs';
import { CATEGORY_META, PUBLIC_CATEGORIES, type EventCategory } from '@/lib/categories';

interface EventFiltersProps {
  eventCount: number;
}

const DATE_CHIPS = [
  { value: null, label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This Weekend' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'Next 30 Days' },
] as const;

export default function EventFilters({ eventCount }: EventFiltersProps) {
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
                  ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Category chip filters — right side */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
            !category
              ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
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
                  ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
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
          className="text-xs text-[#E85D26] hover:text-orange-700 underline whitespace-nowrap transition-colors flex-shrink-0"
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
