'use client';

import { useState } from 'react';
import Link from 'next/link';

const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  'Vitamins & Minerals': { bg: 'oklch(0.95 0.06 145)', color: 'oklch(0.35 0.14 145)' },
  Hormones: { bg: 'oklch(0.95 0.06 310)', color: 'oklch(0.38 0.14 310)' },
  Metabolic: { bg: 'oklch(0.95 0.05 220)', color: 'oklch(0.38 0.12 220)' },
  'Blood Count': { bg: 'oklch(0.95 0.06 30)', color: 'oklch(0.4 0.14 30)' },
  'Cancer Markers': { bg: 'oklch(0.95 0.05 15)', color: 'oklch(0.4 0.14 15)' },
};

interface TestCardProps {
  name: string;
  slug: string;
  category: string;
  minPrice: number | null;
}

export default function TestCard({ name, slug, category, minPrice }: TestCardProps) {
  const cat = CAT_COLORS[category] ?? { bg: '#f0f0f0', color: '#555' };
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={`/test/${slug}`}
      className="block no-underline"
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 20,
        border: `1.5px solid ${hovered ? 'oklch(0.75 0.074 230)' : 'oklch(0.92 0.02 230)'}`,
        transition: 'all 180ms',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 28px oklch(0.55 0.093 230 / 0.11)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          marginBottom: 10,
          background: cat.bg,
          color: cat.color,
        }}
      >
        {category}
      </span>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'oklch(0.18 0.04 230)',
          marginBottom: 5,
          lineHeight: 1.35,
          margin: '0 0 5px',
        }}
      >
        {name}
      </h3>
      <div className="flex items-baseline" style={{ gap: 5 }}>
        <span style={{ fontSize: 11, color: 'oklch(0.6 0.04 230)' }}>from</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.38 0.17 145)' }}>
          {minPrice != null ? `$${Math.round(minPrice)}` : '--'}
        </span>
      </div>
    </Link>
  );
}
