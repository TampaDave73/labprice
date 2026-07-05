'use client';

// Fire-and-forget page view logging (feeds the admin Analytics dashboard's "most-viewed tests" view).
// Mounted on the test detail page with the resolved test id; drop it into other pages with testId
// omitted if broader traffic tracking is needed later.
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function PageViewTracker({ testId }: { testId?: string }) {
  const pathname = usePathname();
  // React Strict Mode double-invokes effects in dev (mount -> cleanup -> mount again on the same
  // fiber), which was firing this fetch twice per real page view. The ref survives that double-invoke
  // since it's the same instance, so it's a reliable per-mount-cycle guard against the duplicate POST.
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (firedFor.current === pathname) return;
    firedFor.current = pathname;
    fetch('/api/v1/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pageview', data: { path: pathname, testId } }),
      keepalive: true,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
