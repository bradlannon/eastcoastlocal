'use client';

import { useQueryState } from 'nuqs';
import { PROVINCE_LABELS } from '@/lib/province-bounds';

interface EventFiltersProps {
  eventCount: number;
  onProvinceChange?: (province: string | null) => void;
}

const DATE_CHIPS = [
  { value: null, label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This Weekend' },
  { value: 'week', label: 'This Week' },
] as const;

export default function EventFilters({ eventCount, onProvinceChange }: EventFiltersProps) {
  const [when, setWhen] = useQueryState('when');
  const [province, setProvince] = useQueryState('province');

  const hasFilters = !!(when || province);

  function handleChipClick(value: string | null) {
    setWhen(value);
  }

  function handleProvinceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    setProvince(value);
    onProvinceChange?.(value);
  }

  function handleClearFilters() {
    setWhen(null);
    setProvince(null);
    onProvinceChange?.(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0">
      {/* Event count */}
      <span className="text-sm font-semibold text-gray-800 mr-1 whitespace-nowrap">
        {eventCount} event{eventCount !== 1 ? 's' : ''}
      </span>

      {/* Date chip filters */}
      <div className="flex flex-wrap gap-1">
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

      {/* Province dropdown */}
      <select
        value={province ?? ''}
        onChange={handleProvinceChange}
        className="text-xs border border-gray-300 rounded-full px-3 py-1 bg-white text-gray-600 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-[#E85D26] focus:border-[#E85D26] cursor-pointer"
      >
        <option value="">All Provinces</option>
        {Object.entries(PROVINCE_LABELS).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={handleClearFilters}
          className="text-xs text-[#E85D26] hover:text-orange-700 underline whitespace-nowrap transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// Export current filter state so parent can read without extra query calls
export function useEventFilters() {
  const [when] = useQueryState('when');
  const [province] = useQueryState('province');
  return { when, province };
}
