export default function ArchivedLoading() {
  return (
    <div>
      {/* Heading skeleton */}
      <div className="mb-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Header row */}
        <div className="bg-gray-50 px-4 py-3 flex gap-4 border-b">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
        {/* Data rows */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4 border-b last:border-b-0">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
