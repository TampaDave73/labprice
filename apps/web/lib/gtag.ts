// Client-side helper for firing GA4 custom events via gtag.js. Safe to call from anywhere (admin
// pages, GA4 unconfigured, SSR) — no-ops unless `window.gtag` exists, which GoogleAnalytics.tsx only
// defines on public pages with NEXT_PUBLIC_GA_MEASUREMENT_ID set. This is a SUPPLEMENT to our own
// PageView/SearchLog/AffiliateClick tables (see analytics-service.ts), not a replacement — GA4 adds
// session/device/geo context and funnel drop-off (e.g. "opened the suggestion form but didn't submit")
// that those tables were never built to capture. See SKILLS.md for the full event list.
'use client';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean | undefined>) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}
