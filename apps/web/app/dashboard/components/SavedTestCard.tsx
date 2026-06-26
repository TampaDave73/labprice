'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SavedTestProps {
  savedTest: {
    id: string;
    testId: string;
    name: string;
    slug: string;
    category: string;
    bestPrice: number | null;
  };
}

export default function SavedTestCard({ savedTest }: SavedTestProps) {
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (removed) return null;

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/v1/me/saved-tests/${savedTest.id}`, { method: 'DELETE' });
      if (res.ok) setRemoved(true);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="bg-white rounded-card p-5 border-[1.5px] border-[oklch(0.92_0.02_280)]">
      <div className="flex items-start justify-between mb-2">
        <span
          className="inline-block px-2.5 py-0.5 rounded-pill text-[10px] font-bold uppercase tracking-[0.4px]"
          style={{ background: 'oklch(0.95 0.05 280)', color: 'oklch(0.45 0.12 280)' }}
        >
          {savedTest.category}
        </span>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="text-xs text-[oklch(0.55_0.04_280)] hover:text-red-600 cursor-pointer bg-transparent border-none disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <Link
        href={`/test/${savedTest.slug}`}
        className="block text-[15px] font-semibold text-[oklch(0.18_0.04_280)] mb-2 no-underline hover:underline leading-snug"
      >
        {savedTest.name}
      </Link>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] text-[oklch(0.6_0.04_280)]">best price</span>
        <span className="text-xl font-bold text-success-700">
          {savedTest.bestPrice != null ? `$${savedTest.bestPrice.toFixed(2)}` : '--'}
        </span>
      </div>
    </div>
  );
}
