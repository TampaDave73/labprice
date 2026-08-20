// Test search. `search()` uses Postgres full-text (to_tsquery on tests.search_vector) and falls
// back to pg_trgm similarity when FTS finds nothing. `autocomplete()` does a fast substring match
// across name/short-name/codes and returns the min price for the suggestion dropdown.
import { unstable_cache } from 'next/cache';
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
  // Build a prefix tsquery from user input. We strip every non-alphanumeric character from each
  // token first: `to_tsquery` throws on raw operators (`&`, `|`, `!`, `:`, `'`, unbalanced parens),
  // so an unsanitized "mom's & dad's" would 500. Stripping keeps prefix matching (`word:*`) while
  // making any input safe. (We deliberately don't use websearch_to_tsquery — it has no prefix mode.)
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  // Nothing searchable after stripping (e.g. query was all punctuation) — skip FTS, try trigram.
  const tsQuery = tokens.map((w) => `${w}:*`).join(' & ');

  // Try full-text search first, fall back to trigram
  const results = tsQuery
    ? await prisma.$queryRawUnsafe<SearchResult[]>(
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
      )
    : [];

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

export interface AutocompleteSuggestion {
  name: string;
  slug: string;
  category: string;
  questCode: string | null;
  labcorpCode: string | null;
  minPrice: number | null;
}

// The actual autocomplete query, wrapped in unstable_cache: this runs on every debounced keystroke
// and joins offerings, but the catalog changes at most a few times a day. A 60s cache (keyed on
// term+limit) turns repeat prefixes into cache hits without making suggestions feel stale.
const cachedAutocomplete = unstable_cache(
  async (term: string, limit: number): Promise<AutocompleteSuggestion[]> => {
    // Substring match across name, short name, and Quest/LabCorp codes — mirrors the
    // prototype's "smart suggestions" which match on any of those fields.
    const tests = await prisma.test.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { shortName: { contains: term, mode: 'insensitive' } },
          { questCode: { contains: term, mode: 'insensitive' } },
          { labcorpCode: { contains: term, mode: 'insensitive' } },
        ],
      },
      include: {
        category: { select: { name: true } },
        offerings: {
          // Exclude offerings from vendors that were removed (e.g. gone-out-of-business) —
          // isActive/deletedAt live on the offering row and don't auto-follow the vendor's.
          where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
          select: { currentPrice: true },
        },
      },
      orderBy: [{ isPopular: 'desc' }, { displayOrder: 'asc' }],
      take: limit,
    });

    return tests.map((t) => {
      const prices = t.offerings.map((o) => Number(o.currentPrice));
      return {
        name: t.name,
        slug: t.slug,
        category: t.category.name,
        questCode: t.questCode,
        labcorpCode: t.labcorpCode,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
      };
    });
  },
  ['test-autocomplete'],
  { revalidate: 60 },
);

export async function autocomplete(query: string, limit = 8): Promise<AutocompleteSuggestion[]> {
  const term = query.trim();
  if (!term) return [];
  return cachedAutocomplete(term, limit);
}
