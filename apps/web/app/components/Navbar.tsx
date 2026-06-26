'use client';

import Link from 'next/link';

export default function Navbar({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const isDark = variant === 'dark';
  return (
    <nav
      className="sticky top-0 z-[200] backdrop-blur-[20px]"
      style={{
        background: isDark ? 'rgba(15,12,36,0.9)' : 'rgba(255,255,255,0.96)',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 no-underline">
          <div className="w-[34px] h-[34px] bg-gradient-to-br from-brand-500 to-brand-600 rounded-[9px] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3" fill="white" />
              <line x1="9" y1="2" x2="9" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="9" y1="13" x2="9" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="9" x2="5" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="13" y1="9" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span
            className="text-lg font-bold tracking-[-0.3px]"
            style={{ color: isDark ? '#fff' : 'oklch(0.18 0.04 280)' }}
          >
            LabPrice
          </span>
        </Link>
        <div className="flex-1" />
        <div className="px-5 py-2 bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-pill text-sm font-semibold cursor-pointer">
          Free Account
        </div>
      </div>
    </nav>
  );
}
