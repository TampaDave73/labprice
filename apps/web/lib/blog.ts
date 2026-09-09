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
