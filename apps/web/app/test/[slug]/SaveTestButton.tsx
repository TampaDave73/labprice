'use client';

import { useState, useEffect } from 'react';

interface Props {
  testId: string;
  initialSavedId?: string | null;
}

export default function SaveTestButton({ testId, initialSavedId }: Props) {
  const [savedId, setSavedId] = useState<string | null>(initialSavedId ?? null);
  const [loading, setLoading] = useState(false);
  const isSaved = savedId != null;

  async function toggle() {
    setLoading(true);
    try {
      if (isSaved) {
        const res = await fetch(`/api/v1/me/saved-tests/${savedId}`, { method: 'DELETE' });
        if (res.ok) setSavedId(null);
      } else {
        const res = await fetch('/api/v1/me/saved-tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testId }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setSavedId(data.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isSaved ? 'Remove from saved tests' : 'Save this test'}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] border-[1.5px] text-sm font-medium cursor-pointer transition-all disabled:opacity-50"
      style={{
        background: isSaved ? 'oklch(0.95 0.06 15)' : '#fff',
        borderColor: isSaved ? 'oklch(0.82 0.12 15)' : 'oklch(0.88 0.03 280)',
        color: isSaved ? 'oklch(0.4 0.16 15)' : 'oklch(0.45 0.05 280)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill={isSaved ? 'currentColor' : 'none'}>
        <path
          d="M4 2h8a1 1 0 0 1 1 1v11.5l-5-3-5 3V3a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}
