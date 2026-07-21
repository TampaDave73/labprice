// GA4 tag (gtag.js), gated behind NEXT_PUBLIC_GA_MEASUREMENT_ID — renders nothing until that's set
// (unset in .env / Railway by default, so this is a true no-op for now; see .env.example). Loaded
// with next/script `afterInteractive` (Next's recommended strategy for analytics: doesn't block first
// paint or hydration). This is separate from our own SearchLog/PageView/AffiliateClick tables — GA
// covers the "full session/funnel/device/geo" picture those were never meant to; see SKILLS.md.
'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import Script from 'next/script';

export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();

  // gtag's automatic SPA page_view detection (History API listening) is unreliable with the App
  // Router's client-side navigation, so fire an explicit page_view on every route change instead of
  // trusting it — the initial load is already covered by the `gtag('config', ...)` call below.
  // Deliberately NOT using useSearchParams() here (it'd need a Suspense boundary at the root layout,
  // which we don't have) — losing the query string on SPA-navigation page_views is an acceptable
  // trade-off next to that blast radius.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!id || pathname?.startsWith('/admin')) return;
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    window.gtag?.('event', 'page_view', { page_path: pathname });
  }, [id, pathname]);

  // Never track admin usage — it's internal staff traffic, not the visitor behavior GA is for, and
  // would otherwise pollute every report with our own logins/clicks.
  if (!id || pathname?.startsWith('/admin')) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}
