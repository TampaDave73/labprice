// What "popular" actually means on the homepage.
//
// It used to mean `Test.isPopular` — a hand-set boolean that nobody revisits, so the six tests on
// the homepage were whatever someone thought was interesting when the catalog was seeded. This
// ranks them from behaviour instead: page views on the test page, click-outs to a vendor, and
// committed searches that name the test.
//
// The three signals are weighted by how much intent they carry. A view is a glance; a search is a
// deliberate ask; a click-out is someone about to spend money. A single hot day therefore can't
// outrank a test people keep buying, and the window is long enough (60 days) that a quiet week
// doesn't reshuffle the page.
//
// Everything here degrades: no analytics rows yet (a new deploy, an empty month, a DB hiccup) and
// the caller falls back to the curated `isPopular` list, so the homepage is never empty and never
// waits on this.
import { prisma } from '@labprice/database';
import { unstable_cache } from 'next/cache';

/** Days of history the ranking reads. Long enough to be stable, short enough to still be "now". */
const WINDOW_DAYS = 60;

/** Intent weights — see the note above. Click-out ≫ search ≫ view. */
const W_VIEW = 1;
const W_SEARCH = 3;
const W_CLICK = 8;

/**
 * Minimum total score before we believe the data. Below this, one bored visitor decides what the
 * whole country sees, so the curated list is the more honest answer.
 */
const MIN_TOTAL_SCORE = 25;

export interface TestPopularity {
  testId: string;
  views: number;
  searches: number;
  clicks: number;
  score: number;
}

/**
 * Ranked test ids, most-wanted first. Empty array means "not enough signal — use the curated list".
 *
 * The search term match is deliberately loose (`query ILIKE '%short name%'`): committed searches are
 * whole queries a human typed, and matching them to a test by its short name catches "vitamin d",
 * "vitamin d test", "cheapest vitamin d" without needing a search index. Only `committed` rows count
 * — the autocomplete logs every keystroke, and prefixes of prefixes are not demand.
 */
async function rank(): Promise<TestPopularity[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      { test_id: string; views: bigint; searches: bigint; clicks: bigint }[]
    >(
      `
      WITH v AS (
        SELECT test_id, COUNT(*) AS n
          FROM page_views
         WHERE test_id IS NOT NULL
           AND created_at > now() - ($1 || ' days')::interval
         GROUP BY test_id
      ),
      c AS (
        SELECT o.test_id, COUNT(*) AS n
          FROM affiliate_clicks ac
          JOIN offerings o ON o.id = ac.offering_id
         WHERE ac.clicked_at > now() - ($1 || ' days')::interval
         GROUP BY o.test_id
      ),
      s AS (
        SELECT t.id AS test_id, COUNT(*) AS n
          FROM search_logs sl
          JOIN tests t
            ON sl.query ILIKE '%' || COALESCE(NULLIF(t.short_name, ''), t.name) || '%'
         WHERE sl.committed
           AND sl.created_at > now() - ($1 || ' days')::interval
           AND t.deleted_at IS NULL
         GROUP BY t.id
      )
      SELECT t.id                       AS test_id,
             COALESCE(v.n, 0)           AS views,
             COALESCE(s.n, 0)           AS searches,
             COALESCE(c.n, 0)           AS clicks
        FROM tests t
        LEFT JOIN v ON v.test_id = t.id
        LEFT JOIN c ON c.test_id = t.id
        LEFT JOIN s ON s.test_id = t.id
       WHERE t.deleted_at IS NULL
         AND (v.n IS NOT NULL OR c.n IS NOT NULL OR s.n IS NOT NULL)
      `,
      String(WINDOW_DAYS),
    );

    return rows
      .map((r) => {
        const views = Number(r.views);
        const searches = Number(r.searches);
        const clicks = Number(r.clicks);
        return {
          testId: r.test_id,
          views,
          searches,
          clicks,
          score: views * W_VIEW + searches * W_SEARCH + clicks * W_CLICK,
        };
      })
      .sort((a, b) => b.score - a.score);
  } catch {
    // The homepage is not worth taking down over an analytics rollup.
    return [];
  }
}

/**
 * Cached for 15 minutes. This scans three append-only analytics tables and the answer moves slowly;
 * running it on every homepage request (the page is `force-dynamic`) would be pure waste.
 */
export const rankedTests = unstable_cache(rank, ['popular-tests-v1'], {
  revalidate: 900,
  tags: ['popular-tests'],
});

/**
 * The homepage's six. Returns ranked ids plus whether real behaviour drove them, so the page can
 * caption the section honestly instead of claiming data it doesn't have.
 */
export async function popularTestOrder(): Promise<{ ids: string[]; dataDriven: boolean }> {
  const ranked = await rankedTests();
  const total = ranked.reduce((sum, r) => sum + r.score, 0);
  if (total < MIN_TOTAL_SCORE) return { ids: [], dataDriven: false };
  return { ids: ranked.map((r) => r.testId), dataDriven: true };
}
