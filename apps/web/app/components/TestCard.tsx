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
  return (
    <Link
      href={`/test/${slug}`}
      className="block bg-white rounded-card p-5 border-[1.5px] border-[oklch(0.92_0.02_280)] no-underline transition-all duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_oklch(0.55_0.15_280/0.11)] hover:border-[oklch(0.75_0.12_280)]"
    >
      <span
        className="inline-block px-2.5 py-0.5 rounded-pill text-[11px] font-bold tracking-[0.4px] uppercase mb-2.5"
        style={{ background: cat.bg, color: cat.color }}
      >
        {category}
      </span>
      <h3 className="text-[15px] font-semibold text-[oklch(0.18_0.04_280)] mb-1.5 leading-snug">{name}</h3>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] text-[oklch(0.6_0.04_280)]">from</span>
        <span className="text-[22px] font-bold text-success-700">
          {minPrice != null ? `$${Math.round(minPrice)}` : '--'}
        </span>
      </div>
    </Link>
  );
}
