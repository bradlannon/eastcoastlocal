import type { VenueGroup } from '@/lib/timelapse-utils';
import VenuePopup from './VenuePopup';

interface HeatmapPopupProps {
  venues: VenueGroup[];
}

export default function HeatmapPopup({ venues }: HeatmapPopupProps) {
  if (venues.length === 1) {
    return <VenuePopup venue={venues[0].venue} events={venues[0].events} />;
  }

  return (
    <div className="min-w-[220px] max-w-[280px] max-h-[300px] overflow-y-auto space-y-3">
      {venues.map((group) => (
        <div key={group.venue.id}>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            {group.venue.name}
          </div>
          <VenuePopup venue={group.venue} events={group.events} />
        </div>
      ))}
    </div>
  );
}
