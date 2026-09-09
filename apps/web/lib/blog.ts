// Shared blog helpers: the FAQ mini-format and reading time.
//
// The FAQ lives in one text column (`Post.faq`) rather than its own table because it is authored and
// edited as prose alongside the article. It is parsed once and used twice — rendered on the page AND
// emitted as FAQPage JSON-LD — so the structured data can never describe a question that isn't
// visible, which is the thing Google actually penalises.

export interface Faq {
  q: string;
  a: string;
}

/**
 * Parses `Q: …` / `A: …` pairs. An answer may run over several lines; a new `Q:` starts a new pair.
 * Anything before the first `Q:` is ignored, and a `Q:` with no answer is dropped — a half-written
 * entry in the admin editor must not reach the page or the schema.
 */
export function parseFaq(raw: string | null | undefined): Faq[] {
  if (!raw) return [];
  const out: Faq[] = [];
  let cur: { q: string; a: string[] } | null = null;

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const q = /^\s*Q:\s*(.+)$/.exec(line);
    if (q) {
      if (cur && cur.a.length) out.push({ q: cur.q, a: cur.a.join(' ').trim() });
      cur = { q: q[1]!.trim(), a: [] };
      continue;
    }
    const a = /^\s*A:\s*(.*)$/.exec(line);
    if (a && cur) {
      cur.a.push(a[1]!.trim());
      continue;
    }
    // Continuation of the current answer (a hard-wrapped line).
    if (cur && cur.a.length && line.trim()) cur.a.push(line.trim());
  }
  if (cur && cur.a.length) out.push({ q: cur.q, a: cur.a.join(' ').trim() });

  return out.filter((f) => f.q && f.a);
}

/** Rounded up, 220 wpm, figure/table markup stripped. Shown on the index and article header. */
export function readingTimeMinutes(body: string): number {
  const words = body
    .replace(/\[FIG:[a-z0-9-]+\]/g, '')
    .replace(/[|#>*\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** 9 September 2026 — spelled out, unambiguous across locales, stable between server and client. */
export function formatPostDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

// ─────────────────────────── Live price tokens ───────────────────────────
//
// An article that quotes a price goes stale the moment a scraper runs. Rather than banning prices
// from the copy — they're the most citable thing we have — a post body writes a token and the
// renderer resolves it at request time from the same offerings the "compare prices" cards use, so
// the prose and the cards can never disagree.
//
//   [PRICE:lipid-panel]        → $7.42            (cheapest live price)
//   [PRICE-RANGE:lipid-panel]  → $7.42 to $59.00
//   [PRICE-COUNT:lipid-panel]  → 17               (services with a live price)
//   [PRICE-DATE:lipid-panel]   → 9 September 2026 (freshest price check)

export interface PriceFacts {
  /** Display name, so a chart can label a bar without a second query. */
  name: string;
  min: number;
  max: number;
  count: number;
  checkedAt: Date | null;
}

export const PRICE_TOKEN = /\[PRICE(-RANGE|-COUNT|-DATE)?:([a-z0-9-]+)\]/;
const PRICE_TOKEN_G = new RegExp(PRICE_TOKEN.source, 'g');

/** `[PRICE-CHART:a,b,c]` on its own line — a live bar chart of the spread for those tests. */
export const PRICE_CHART = /^\[PRICE-CHART:([a-z0-9,\-\s]+)\]$/;

/** The slugs a chart block asks for, in the author's order. */
export function priceChartSlugs(block: string): string[] {
  const m = PRICE_CHART.exec(block.trim());
  if (!m) return [];
  return m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Every test slug a body asks for a price of — inline tokens and chart blocks alike. The page
 * fetches exactly these and nothing else, so adding a chart never costs an extra round trip.
 */
export function priceTokenSlugs(body: string): string[] {
  const inline = Array.from(body.matchAll(PRICE_TOKEN_G), (m) => m[2]!);
  const charts = body.split('\n').flatMap((line) => priceChartSlugs(line));
  return Array.from(new Set([...inline, ...charts]));
}

/**
 * Resolves one token. Fallbacks are deliberately words rather than blanks or zeros: a test that
 * loses all its live prices must leave the sentence still reading as English ("a lipid panel runs
 * varies by service" is worse than a stale number, so the fallbacks are chosen to fit the phrasing
 * the articles actually use).
 */
export function renderPriceToken(token: string, facts: PriceFacts | undefined): string {
  const m = PRICE_TOKEN.exec(token);
  if (!m) return token;
  const kind = m[1] ?? '';

  if (!facts || facts.count === 0) {
    if (kind === '-COUNT') return 'several';
    if (kind === '-DATE') return 'our last check';
    return 'a price that varies by service';
  }

  switch (kind) {
    case '-RANGE':
      return `$${facts.min.toFixed(2)} to $${facts.max.toFixed(2)}`;
    case '-COUNT':
      return String(facts.count);
    case '-DATE':
      return facts.checkedAt ? formatPostDate(facts.checkedAt) : 'our last check';
    default:
      return `$${facts.min.toFixed(2)}`;
  }
}

/**
 * Hero images are stored as `<name>-1600.webp` with an 800px sibling beside them. Deriving the
 * srcset from the stored URL keeps the database to one column while still serving a phone the
 * smaller file — a hero is the largest thing on an article page, and 1600px of it is wasted on a
 * 390px screen. Returns undefined for any URL not following the convention, so a hand-entered
 * image in the admin editor simply renders without a srcset instead of 404ing a made-up variant.
 */
export function heroSrcSet(url: string | null | undefined): string | undefined {
  if (!url || !url.endsWith('-1600.webp')) return undefined;
  return `${url.replace('-1600.webp', '-800.webp')} 800w, ${url} 1600w`;
}
