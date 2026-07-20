// GA4 tag (gtag.js), gated behind NEXT_PUBLIC_GA_MEASUREMENT_ID — renders nothing until that's set
// (unset in .env / Railway by default, so this is a true no-op for now; see .env.example). Loaded
// with next/script `afterInteractive` (Next's recommended strategy for analytics: doesn't block first
// paint or hydration). This is separate from our own SearchLog/PageView/AffiliateClick tables — GA
// covers the "full session/funnel/device/geo" picture those were never meant to; see SKILLS.md.
'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';

export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();
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
