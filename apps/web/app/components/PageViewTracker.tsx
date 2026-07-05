'use client';

// Fire-and-forget page view logging (feeds the admin Analytics dashboard's "most-viewed tests" view).
// Mounted on the test detail page with the resolved test id; drop it into other pages with testId
// omitted if broader traffic tracking is needed later.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function PageViewTracker({ testId }: { testId?: string }) {
  const pathname = usePathname();

  useEffect(() => {
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
