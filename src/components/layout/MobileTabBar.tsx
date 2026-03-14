'use client';

interface MobileTabBarProps {
  activeTab: 'map' | 'list';
  onTabChange: (tab: 'map' | 'list') => void;
}

const MapIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ListIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[1001] bg-white border-t border-gray-200 flex">
      <button
        onClick={() => onTabChange('map')}
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
          activeTab === 'map'
            ? 'text-orange-600'
            : 'text-gray-500'
        }`}
        aria-label="Map view"
      >
        <MapIcon />
        Map
      </button>
      <button
        onClick={() => onTabChange('list')}
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
          activeTab === 'list'
            ? 'text-orange-600'
            : 'text-gray-500'
        }`}
        aria-label="List view"
      >
        <ListIcon />
        List
      </button>
    </div>
  );
}
