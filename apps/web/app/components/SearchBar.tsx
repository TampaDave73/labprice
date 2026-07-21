'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/gtag';

interface Suggestion {
  name: string;
  slug: string;
  category: string;
  questCode: string | null;
  labcorpCode: string | null;
  minPrice: number | null;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/search/autocomplete?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        const results: Suggestion[] = json.data ?? [];
        setSuggestions(results);
        setOpen(results.length > 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onInput = (val: string) => {
    setQuery(val);
    setActiveIdx(-1);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const navigate = (slug: string) => {
    trackEvent('search_suggestion_click', { search_term: query.trim(), test_slug: slug });
    setOpen(false);
    setQuery('');
    router.push(`/test/${slug}`);
  };

  // Enter / the Compare button go to the full results page (unless the user arrow-selected a
  // specific suggestion, which deep-links straight to that test). The `search` GA4 event fires from
  // the results page itself (SearchResultsTracker), not here — that's the one place that knows the
  // actual result count, and it also covers direct/bookmarked /search?q= visits this button never sees.
  const goToResults = () => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx] != null) {
        navigate(suggestions[activeIdx]!.slug);
      } else {
        goToResults();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', maxWidth: 570, margin: '0 auto' }}>
      <div
        className="flex items-center"
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '5px 5px 5px 18px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.32)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
          <circle cx="7.5" cy="7.5" r="4.5" stroke="oklch(0.62 0.075 230)" strokeWidth="1.8" />
          <path d="M10.7 10.7l3.3 3.3" stroke="oklch(0.62 0.075 230)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Test name — Vitamin D, Testosterone, TSH..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 16,
            padding: '11px 14px',
            color: 'oklch(0.18 0.04 230)',
          }}
        />
        <button
          onClick={goToResults}
          style={{
            flexShrink: 0,
            background: 'linear-gradient(135deg, oklch(0.58 0.136 230), oklch(0.49 0.14 232))',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '13px 24px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Compare
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: '#fff',
            borderRadius: 13,
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            zIndex: 50,
            animation: 'slideDown 0.15s ease',
          }}
        >
          {suggestions.map((sug, i) => (
            <div
              key={sug.slug}
              onClick={() => navigate(sug.slug)}
              className="flex items-center justify-between"
              style={{
                padding: '12px 18px',
                cursor: 'pointer',
                borderBottom: '1px solid oklch(0.95 0.01 230)',
                transition: 'background 150ms',
                background: i === activeIdx ? 'oklch(0.97 0.03 230)' : undefined,
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'oklch(0.18 0.04 230)' }}>{sug.name}</div>
                <div style={{ fontSize: 11, color: 'oklch(0.58 0.05 230)', marginTop: 2 }}>
                  {sug.questCode ? `Quest ${sug.questCode}` : ''}
                  {sug.questCode && sug.labcorpCode ? ' · ' : ''}
                  {sug.labcorpCode ? `LabCorp ${sug.labcorpCode}` : ''}
                </div>
              </div>
              {sug.minPrice != null && (
                <div style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.4 0.17 145)' }}>
                  from ${Math.round(sug.minPrice)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
