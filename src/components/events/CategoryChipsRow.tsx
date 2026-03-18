'use client';

import { useQueryState } from 'nuqs';
import { PUBLIC_CATEGORIES } from '@/lib/categories';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface CategoryChipsRowProps {
  eventCount: number;
}

export default function CategoryChipsRow({ eventCount }: CategoryChipsRowProps) {
  const [category, setCategory] = useQueryState('category');

  return (
    <div className="backdrop-blur-md bg-white/70 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
      {/* Event count badge */}
      <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
        {eventCount} event{eventCount !== 1 ? 's' : ''}
      </span>

      {/* Category chips */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {/* All button */}
        <button
          onClick={() => setCategory(null)}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
            !category
              ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
              : 'bg-white/80 text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          All
        </button>

        {/* Category buttons */}
        {PUBLIC_CATEGORIES.map((cat) => {
          const isActive = category === cat;
          const meta = CATEGORY_META[cat as EventCategory];
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
                  : 'bg-white/80 text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
