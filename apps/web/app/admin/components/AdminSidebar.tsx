'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Logo from '../../components/Logo';

const navItems = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Change Queue',
    href: '/admin/changes',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="2" width="14" height="16" rx="2" />
        <line x1="7" y1="6" x2="13" y2="6" />
        <line x1="7" y1="10" x2="13" y2="10" />
        <line x1="7" y1="14" x2="11" y2="14" />
      </svg>
    ),
  },
  {
    label: 'Tests',
    href: '/admin/tests',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2v6L5 14a2 2 0 002 2h6a2 2 0 002-2l-3-6V2" />
        <line x1="6" y1="2" x2="14" y2="2" />
      </svg>
    ),
  },
  {
    label: 'Categories',
    href: '/admin/categories',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />
      </svg>
    ),
  },
  {
    label: 'Vendors',
    href: '/admin/vendors',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 7l1-5h12l1 5" />
        <rect x="3" y="7" width="14" height="11" rx="1" />
        <rect x="7" y="12" width="6" height="6" />
      </svg>
    ),
  },
  {
    label: 'Discovered',
    href: '/admin/discovered',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13 13l4.5 4.5" />
      </svg>
    ),
  },
  {
    label: 'Coverage',
    href: '/admin/coverage',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="14" height="14" rx="1" />
        <path d="M3 8h14M3 13h14M8 3v14M13 3v14" />
      </svg>
    ),
  },
  {
    label: 'Offerings',
    href: '/admin/offerings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 5l8-3 8 3v2l-8 3-8-3V5z" />
        <path d="M2 10l8 3 8-3" />
        <path d="M2 14l8 3 8-3" />
      </svg>
    ),
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 17V3" />
        <path d="M3 17h14" />
        <path d="M6 14V9M10 14V6M14 14v-4" />
      </svg>
    ),
  },
  {
    label: 'Suggestions',
    href: '/admin/suggestions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 2a6 6 0 00-3.5 10.9c.4.3.6.8.6 1.3v.3a1 1 0 001 1h3.8a1 1 0 001-1v-.3c0-.5.2-1 .6-1.3A6 6 0 0010 2z" />
        <line x1="8" y1="18" x2="12" y2="18" />
      </svg>
    ),
  },
  {
    label: 'Audit Log',
    href: '/admin/audit',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.5 2.5" />
      </svg>
    ),
  },
  {
    label: 'Users',
    href: '/admin/users',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    label: 'Questions',
    href: '/admin/questions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M8 8a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.9v.7M10 14.2h.01" />
      </svg>
    ),
  },
  {
    label: 'Blog',
    href: '/admin/blog',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4h14v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
        <path d="M6 8h8M6 11h8M6 14h5" />
      </svg>
    ),
  },
  {
    label: 'Pages',
    href: '/admin/pages',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 2h6l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M11 2v4h4M7 10h6M7 13h6M7 7h2" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v2m0 12v2m-6-8H2m16 0h-2m-1.3-4.7l-1.4 1.4M6.7 13.3l-1.4 1.4m0-9.4l1.4 1.4m7.6 7.6l1.4 1.4" />
      </svg>
    ),
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-5">
        <Logo variant="dark" iconSize={22} wordmarkSize={13} />
        <span className="shrink-0 whitespace-nowrap rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          Admin
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(item.href)
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-brand-900 p-2 text-white shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 md:block">
        {sidebarContent}
      </div>
    </>
  );
}
