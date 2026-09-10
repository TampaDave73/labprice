// Top navigation. The signed-in/out state is rendered by <NavAuth/>, a client component that reads
// the session after hydration, so this stays a server component and every page that renders it
// remains statically renderable / ISR-cacheable.
//
// Two things live here that used to live in the homepage hero, because they belong on every page
// rather than only the one people arrive on:
//   - the search field (compact variant of the homepage's, same component so the two can't drift),
//   - the "live prices from N ordering services" badge, which is the site's core claim and was
//     previously visible only above the fold of `/`.
// Both together let the homepage hero shrink to roughly a third of its old height.
import Link from 'next/link';
import NavAuth from './NavAuth';
import Logo from './Logo';
import SearchBar from './SearchBar';
import { siteStats } from '@/lib/site-stats';

export default async function Navbar() {
  const { vendorCount } = await siteStats();

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.96)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      <div
        className="flex items-center gap-4 mx-auto"
        style={{ maxWidth: 1240, padding: '0 24px', height: 60 }}
      >
        <Link href="/" className="flex items-center no-underline" style={{ flexShrink: 0 }}>
          <Logo variant="light" iconSize={28} wordmarkSize={17} />
        </Link>

        {/* Hidden on narrow screens: at phone width the header can hold the logo or the field, not
            both, and every page that matters carries its own path to search. */}
        <div className="hidden md:flex flex-1 justify-center">
          <SearchBar variant="compact" />
        </div>
        <div className="flex-1 md:hidden" />

        {/* 0 means the count query failed — show nothing rather than "0 ordering services". */}
        {vendorCount > 0 && (
          <span
            className="hidden lg:inline-flex items-center"
            style={{
              gap: 7,
              flexShrink: 0,
              background: 'oklch(0.97 0.02 260)',
              border: '1px solid oklch(0.89 0.03 260)',
              borderRadius: 20,
              padding: '4px 11px',
              fontSize: 12,
              fontWeight: 500,
              color: 'oklch(0.38 0.06 260)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.6 0.15 155)', display: 'inline-block' }}
            />
            Live prices from {vendorCount} services
          </span>
        )}

        {/* The blog was reachable only from the footer, so the site's strongest pages sent it
            nothing. A nav link is the cheapest inbound path there is. */}
        <Link
          href="/blog"
          className="no-underline"
          style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.35 0.05 260)', flexShrink: 0 }}
        >
          Guides
        </Link>
        <NavAuth />
      </div>
    </nav>
  );
}
