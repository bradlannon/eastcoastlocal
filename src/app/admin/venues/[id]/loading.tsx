export default function VenueDetailLoading() {
  return (
    <div>
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2 mb-6">
        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-2 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* H1 skeleton */}
      <div className="h-8 w-56 bg-gray-200 rounded animate-pulse mb-6" />

      {/* Form card skeleton */}
      <div className="bg-white rounded-lg shadow-sm border p-6 max-w-lg">
        <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {/* 4 input fields */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-9 w-full bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
          {/* Button */}
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
