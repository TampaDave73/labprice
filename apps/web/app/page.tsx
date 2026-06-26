export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[oklch(0.17_0.1_280/0.9)] border-b border-white/10">
        <div className="max-w-[1240px] mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] bg-gradient-to-br from-brand-500 to-brand-600 rounded-[9px] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="3" fill="white"/>
                <line x1="9" y1="2" x2="9" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="9" y1="13" x2="9" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="9" x2="5" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="13" y1="9" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">LabPrice</span>
          </div>
          <div className="flex-1" />
          <div className="px-5 py-2 bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-pill text-sm font-semibold cursor-pointer">
            Free Account
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-[oklch(0.19_0.09_265)] px-6 py-24 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-5%,oklch(0.55_0.18_280/0.2),transparent)] pointer-events-none" />
        <div className="relative max-w-[700px] mx-auto animate-[fadeUp_0.6s_ease]">
          <div className="inline-flex items-center gap-2 bg-[oklch(0.95_0.06_280/0.12)] border border-[oklch(0.8_0.1_280/0.22)] rounded-pill px-3.5 py-1 mb-6">
            <span className="w-[7px] h-[7px] rounded-full bg-success-500 inline-block" />
            <span className="text-[13px] text-[oklch(0.85_0.06_280)] font-medium">Live prices from 10 ordering services</span>
          </div>
          <h1 className="text-5xl font-bold text-white leading-tight tracking-tighter mb-4">
            Compare blood test prices{' '}
            <span className="bg-gradient-to-r from-brand-500 to-[oklch(0.78_0.18_315)] bg-clip-text text-transparent">
              instantly
            </span>
          </h1>
          <p className="text-lg text-[oklch(0.7_0.05_280)] mb-11 leading-relaxed">
            Stop overpaying for lab tests. Search by test name or Quest/LabCorp test number.
          </p>
          <div className="relative max-w-[570px] mx-auto">
            <div className="flex items-center bg-white rounded-[14px] p-[5px] pl-[18px] shadow-[0_24px_64px_rgba(0,0,0,0.32)]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
                <circle cx="7.5" cy="7.5" r="4.5" stroke="oklch(0.62 0.1 280)" strokeWidth="1.8"/>
                <path d="M10.7 10.7l3.3 3.3" stroke="oklch(0.62 0.1 280)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <input
                placeholder="Test name — Vitamin D, Testosterone, TSH…"
                className="flex-1 border-none outline-none bg-transparent text-base px-3.5 py-3 text-brand-900"
              />
              <button className="shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 text-white border-none rounded-btn px-6 py-3 text-[15px] font-semibold cursor-pointer">
                Compare
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-[oklch(0.22_0.1_280)] px-6 py-3.5">
        <div className="max-w-[1240px] mx-auto flex items-center justify-center gap-12 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">10</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Ordering Services</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">12+</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Common Tests</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-success-500">Up to 70%</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Savings vs retail</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">No</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Insurance required</span>
          </div>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="max-w-[1240px] mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold tracking-tight text-brand-900 mb-4">Popular Tests</h2>
        <p className="text-brand-400">Phase 2 will build the full test catalog, search, and price comparison UI.</p>
      </div>

      {/* Footer */}
      <footer className="bg-brand-900 px-6 py-10 mt-auto">
        <div className="max-w-[1240px] mx-auto flex items-center justify-between flex-wrap gap-5">
          <div>
            <div className="text-base font-bold text-white mb-1.5">LabPrice</div>
            <p className="text-[13px] text-[oklch(0.65_0.05_280)] leading-relaxed">
              Compare blood test ordering prices. Blood drawn at Quest or LabCorp patient service centers.
            </p>
          </div>
          <p className="text-xs text-[oklch(0.5_0.04_280)] text-right leading-relaxed">
            Prices for informational purposes only.<br />© 2025 LabPrice. Not medical advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
