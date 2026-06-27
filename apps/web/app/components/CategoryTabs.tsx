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
                ? 'linear-gradient(135deg, oklch(0.55 0.2 280), oklch(0.48 0.2 280))'
                : '#fff',
              color: isActive ? '#fff' : 'oklch(0.45 0.12 280)',
              borderColor: isActive ? 'oklch(0.55 0.2 280)' : 'oklch(0.88 0.03 280)',
            }}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}
