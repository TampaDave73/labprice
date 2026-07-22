'use client';

interface CategoryTabsProps {
  categories: { name: string; slug: string }[];
  active: string;
  onChange: (slug: string) => void;
}

export default function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  const allCats = [{ name: 'All', slug: 'all' }, ...categories];
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {allCats.map((cat) => {
        const isActive = active === cat.slug;
        return (
          <button
            key={cat.slug}
            onClick={() => onChange(cat.slug)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms',
              border: '1.5px solid',
              background: isActive
                ? 'linear-gradient(135deg, oklch(0.58 0.136 260), oklch(0.49 0.14 262))'
                : '#fff',
              color: isActive ? '#fff' : 'oklch(0.45 0.074 260)',
              borderColor: isActive ? 'oklch(0.58 0.136 260)' : 'oklch(0.88 0.03 260)',
            }}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}
