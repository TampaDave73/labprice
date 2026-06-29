export default function TestDetailLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.97 0.01 280)' }}>
      {/* Navbar skeleton */}
      <div style={{ height: 64, background: '#fff', borderBottom: '1px solid oklch(0.92 0.02 280)' }} />

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 24px' }}>
        {/* Breadcrumb skeleton */}
        <div className="animate-pulse" style={{ height: 16, width: 192, background: 'oklch(0.92 0.03 280)', borderRadius: 6, marginBottom: 24 }} />

        {/* Title skeleton */}
        <div className="animate-pulse" style={{ height: 32, width: 320, background: 'oklch(0.9 0.03 280)', borderRadius: 6, marginBottom: 12 }} />
        <div className="animate-pulse" style={{ height: 20, width: 256, background: 'oklch(0.92 0.03 280)', borderRadius: 6, marginBottom: 32 }} />

        {/* Price table skeleton */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid oklch(0.92 0.02 280)', padding: 24, marginBottom: 32 }}>
          <div className="animate-pulse" style={{ height: 24, width: 160, background: 'oklch(0.92 0.03 280)', borderRadius: 6, marginBottom: 20 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid oklch(0.95 0.01 280)' }}
            >
              <div className="animate-pulse" style={{ height: 20, width: 144, background: 'oklch(0.93 0.02 280)', borderRadius: 6 }} />
              <div className="animate-pulse" style={{ height: 20, width: 80, background: 'oklch(0.93 0.02 280)', borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Accordion skeletons */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{ background: '#fff', borderRadius: 14, border: '1px solid oklch(0.92 0.02 280)', padding: 20, marginBottom: 12 }}
          >
            <div style={{ height: 20, width: 192, background: 'oklch(0.92 0.03 280)', borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
