import { prisma } from '@labprice/database';
import type { TestSummaryDTO } from '@labprice/shared';

interface SearchResult {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  is_popular: boolean;
  category_id: string;
  cat_name: string;
  cat_slug: string;
  color_bg: string | null;
  color_text: string | null;
  rank: number;
}

function toSummary(row: SearchResult): Omit<TestSummaryDTO, 'codes' | 'minPrice' | 'vendorCount'> & { codes: []; minPrice: null; vendorCount: 0 } {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    slug: row.slug,
    category: {
      id: row.category_id,
      name: row.cat_name,
      slug: row.cat_slug,
      colorBg: row.color_bg,
      colorText: row.color_text,
    },
    codes: [],
    minPrice: null,
    vendorCount: 0,
    isPopular: row.is_popular,
  };
}

export async function search(query: string, limit = 25) {
  // Convert user query to tsquery format: split words, join with &
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(' & ');

  // Try full-text search first, fall back to trigram
  const results = await prisma.$queryRawUnsafe<SearchResult[]>(
    `
    SELECT
      t.id, t.name, t.short_name, t.slug, t.is_popular,
      c.id AS category_id, c.name AS cat_name, c.slug AS cat_slug,
      c.color_bg, c.color_text,
      ts_rank(t.search_vector, to_tsquery('english', $1)) AS rank
    FROM tests t
    JOIN categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL
      AND t.search_vector @@ to_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT $2
    `,
    tsQuery,
    limit,
  );

  if (results.length > 0) {
    return results.map(toSummary);
  }

  // Fallback: trigram similarity (pg_trgm)
  const trigramResults = await prisma.$queryRawUnsafe<SearchResult[]>(
    `
    SELECT
      t.id, t.name, t.short_name, t.slug, t.is_popular,
      c.id AS category_id, c.name AS cat_name, c.slug AS cat_slug,
      c.color_bg, c.color_text,
      similarity(t.name, $1) AS rank
    FROM tests t
    JOIN categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL
      AND similarity(t.name, $1) > 0.1
    ORDER BY rank DESC
    LIMIT $2
    `,
    query.trim(),
    limit,
  );

  return trigramResults.map(toSummary);
}

export async function autocomplete(query: string, limit = 8) {
  const prefix = `${query.trim()}%`;

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(
    `
    SELECT
      t.id, t.name, t.short_name, t.slug, t.is_popular,
      c.id AS category_id, c.name AS cat_name, c.slug AS cat_slug,
      c.color_bg, c.color_text,
      0 AS rank
    FROM tests t
    JOIN categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL
      AND (t.name ILIKE $1 OR t.short_name ILIKE $1)
    ORDER BY t.is_popular DESC, t.display_order ASC
    LIMIT $2
    `,
    prefix,
    limit,
  );

  return results.map(toSummary);
}
