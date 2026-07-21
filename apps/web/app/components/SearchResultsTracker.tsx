'use client';

// Fires GA4's recommended `search` event with the real result count — the one thing SearchLog
// (logged server-side in app/search/page.tsx) doesn't give GA4's session/device context for. Mounted
// on the search results page only; the SearchBar's suggestion clicks fire their own event directly
// since they never land here (see SearchBar.tsx).
import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/gtag';

export default function SearchResultsTracker({ query, resultCount }: { query: string; resultCount: number }) {
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!query || firedFor.current === query) return;
    firedFor.current = query;
    trackEvent('search', { search_term: query, result_count: resultCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return null;
}
