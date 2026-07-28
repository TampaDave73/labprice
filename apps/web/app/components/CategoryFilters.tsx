'use client';

// Two-facet homepage category filter: primary categories render as always-visible toggle chips
// (multi-select, OR-matched), secondary categories live behind a "More filters" disclosure (also
// multi-select, OR-matched). HomeTestList ANDs the two facets together. Replaces the old
// single-select CategoryTabs (radio-style, one active category at a time).
import { useState } from 'react';

interface Cat { name: string; slug: string; isPrimary: boolean }
interface Props {
  categories: Cat[];
  activePrimary: Set<string>;
  activeSecondary: Set<string>;
  onTogglePrimary: (slug: string) => void;
  onToggleSecondary: (slug: string) => void;
}

const chipStyle = (active: boolean) => ({
  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer' as const,
  transition: 'all 150ms', border: '1.5px solid',
  background: active ? 'linear-gradient(135deg, oklch(0.58 0.136 260), oklch(0.49 0.14 262))' : '#fff',
  color: active ? '#fff' : 'oklch(0.45 0.074 260)',
  borderColor: active ? 'oklch(0.58 0.136 260)' : 'oklch(0.88 0.03 260)',
});

export default function CategoryFilters({ categories, activePrimary, activeSecondary, onTogglePrimary, onToggleSecondary }: Props) {
  const [expanded, setExpanded] = useState(false);
  const primary = categories.filter((c) => c.isPrimary);
  const secondary = categories.filter((c) => !c.isPrimary);
  const secondaryActiveCount = secondary.filter((c) => activeSecondary.has(c.slug)).length;

  return (
    <div>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {primary.map((cat) => (
          <button key={cat.slug} onClick={() => onTogglePrimary(cat.slug)} style={chipStyle(activePrimary.has(cat.slug))}>
            {cat.name}
          </button>
        ))}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ ...chipStyle(secondaryActiveCount > 0), fontWeight: 600 }}
        >
          More filters{secondaryActiveCount > 0 ? ` (${secondaryActiveCount})` : ''} {expanded ? '−' : '+'}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
          {secondary.map((cat) => (
            <button key={cat.slug} onClick={() => onToggleSecondary(cat.slug)} style={chipStyle(activeSecondary.has(cat.slug))}>
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
