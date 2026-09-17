export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse p-2">
      {/* Header Skeleton */}
      <div className="h-14 bg-white border border-[#E2E5E9] rounded-xl w-full" />

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-white border border-[#E2E5E9] rounded-xl p-4 space-y-3">
            <div className="h-4 bg-[#EEF0F3] rounded w-1/2" />
            <div className="h-8 bg-[#EEF0F3] rounded w-3/4" />
          </div>
        ))}
      </div>

      {/* Main Content Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-white border border-[#E2E5E9] rounded-xl" />
        <div className="h-72 bg-white border border-[#E2E5E9] rounded-xl" />
      </div>
    </div>
  );
}
