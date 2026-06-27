'use client';

interface CategoryTabsProps {
  categories: { name: string; slug: string }[];
  active: string;
  onChange: (slug: string) => void;
}

export default function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  const allCats = [{ name: 'All', slug: 'all' }, ...categories];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {allCats.map((cat) => {
        const isActive = active === cat.slug;
        return (
          <button
            key={cat.slug}
            onClick={() => onChange(cat.slug)}
            className="px-3.5 py-1.5 rounded-pill text-xs font-medium cursor-pointer transition-all duration-150 border-[1.5px]"
            style={{
              background: isActive ? 'oklch(0.55 0.2 280)' : '#fff',
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
