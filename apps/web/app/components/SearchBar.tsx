'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setOpen((data.results ?? []).length > 0);
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
    setOpen(false);
    setQuery('');
    router.push(`/test/${slug}`);
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
      } else if (suggestions.length > 0 && suggestions[0] != null) {
        navigate(suggestions[0]!.slug);
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
    <div ref={wrapperRef} className="relative max-w-[570px] mx-auto">
      <div className="flex items-center bg-white rounded-[14px] p-[5px] pl-[18px] shadow-[0_24px_64px_rgba(0,0,0,0.32)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
          <circle cx="7.5" cy="7.5" r="4.5" stroke="oklch(0.62 0.1 280)" strokeWidth="1.8" />
          <path d="M10.7 10.7l3.3 3.3" stroke="oklch(0.62 0.1 280)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Test name — Vitamin D, Testosterone, TSH..."
          className="flex-1 border-none outline-none bg-transparent text-base px-3.5 py-3 text-brand-900"
        />
        <button
          onClick={() => {
            if (suggestions.length > 0 && suggestions[0] != null) navigate(suggestions[0]!.slug);
          }}
          className="shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 text-white border-none rounded-btn px-6 py-3 text-[15px] font-semibold cursor-pointer"
        >
          Compare
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-[13px] shadow-[0_16px_48px_rgba(0,0,0,0.18)] overflow-hidden z-50 animate-[slideDown_0.15s_ease]">
          {suggestions.map((sug, i) => (
            <div
              key={sug.slug}
              onClick={() => navigate(sug.slug)}
              className="flex items-center justify-between px-[18px] py-3 cursor-pointer border-b border-[oklch(0.95_0.01_280)] transition-colors"
              style={{
                background: i === activeIdx ? 'oklch(0.97 0.03 280)' : undefined,
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div className="text-left">
                <div className="text-sm font-semibold text-[oklch(0.18_0.04_280)]">{sug.name}</div>
                <div className="text-[11px] text-[oklch(0.58_0.05_280)] mt-0.5">
                  {sug.questCode ? `Quest ${sug.questCode}` : ''}
                  {sug.questCode && sug.labcorpCode ? ' · ' : ''}
                  {sug.labcorpCode ? `LabCorp ${sug.labcorpCode}` : ''}
                </div>
              </div>
              {sug.minPrice != null && (
                <div className="text-sm font-bold text-[oklch(0.4_0.17_145)]">
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
