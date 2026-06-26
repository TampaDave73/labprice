export default function TestDetailLoading() {
  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.01 280)' }}>
      {/* Navbar skeleton */}
      <div className="h-16 bg-white border-b border-[oklch(0.92_0.02_280)]" />

      <div className="max-w-[1240px] mx-auto px-6 py-10">
        {/* Breadcrumb skeleton */}
        <div className="h-4 w-48 bg-[oklch(0.92_0.03_280)] rounded mb-6 animate-pulse" />

        {/* Title skeleton */}
        <div className="h-8 w-80 bg-[oklch(0.9_0.03_280)] rounded mb-3 animate-pulse" />
        <div className="h-5 w-64 bg-[oklch(0.92_0.03_280)] rounded mb-8 animate-pulse" />

        {/* Price table skeleton */}
        <div className="bg-white rounded-card border border-[oklch(0.92_0.02_280)] p-6 mb-8">
          <div className="h-6 w-40 bg-[oklch(0.92_0.03_280)] rounded mb-5 animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-4 border-b border-[oklch(0.95_0.01_280)]"
            >
              <div className="h-5 w-36 bg-[oklch(0.93_0.02_280)] rounded animate-pulse" />
              <div className="h-5 w-20 bg-[oklch(0.93_0.02_280)] rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Accordion skeletons */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-card border border-[oklch(0.92_0.02_280)] p-5 mb-3 animate-pulse"
          >
            <div className="h-5 w-48 bg-[oklch(0.92_0.03_280)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
