// Harvests questions people are actually asking into the QuestionCandidate review queue.
//
//   pnpm --filter @labprice/worker exec tsx scripts/harvest-questions.ts [--dry] [--reddit-only|--search-only]
//
// This is a listening tool, not a content pipeline. It stores a question, a ranking signal and (for
// forum sources) a link back to the thread — enough to judge whether a topic is worth writing about.
// It copies no post bodies, no comments and no usernames, and nothing it captures is published:
// every candidate must be approved by a human at /admin/questions before it can become even a draft.
// That gate is the point. Auto-publishing harvested topics on a health site is the exact pattern
// search engines treat as scaled content abuse.
//
// Two sources:
//
//   SEARCH_LOG  Our own searches that returned nothing. Highest-intent signal we have — someone came
//               to the site looking for this and left empty-handed — and unambiguously our data.
//               Always runs, needs no configuration.
//
//   REDDIT      Communities where bloodwork comes up constantly. Requires a registered Reddit app;
//               see the note on redditToken() below. Skipped with a message when unconfigured.
//
// Scope constraint, from the brief: we harvest from bodybuilding and biohacking communities, but keep
// only questions about TESTS AND PANELS. Anything reading as a question about compounds, dosing or
// cycles is dropped by REJECT below — the article angle is "which markers does this community track",
// never the substances themselves.
import 'dotenv/config';
import { prisma } from '@labprice/database';

const UA = 'LabTestCompare/1.0 topic-research (+https://labtestcompare.com/contact)';
const PAUSE_MS = 2000;

const SUBREDDITS = ['bloodwork', 'labtests', 'Testosterone', 'PeterAttia', 'Biohackers', 'bodybuilding', 'Supplements'];

// A candidate must look like a question AND mention testing — both, not either. "Best TSH range?" is
// useful; "how do I train legs?" is not, and neither is a statement about a result.
const TEST_WORDS =
  /\b(blood\s?work|bloods|blood test|lab(s| test| work| panel)|panel|test result|reference range|biomarker|assay|serum|ferritin|tsh|t3|t4|thyroid|testosterone|estradiol|shbg|prolactin|lh|fsh|igf-?1|a1c|hba1c|lipid|cholesterol|ldl|hdl|triglyceride|apob|lp\(a\)|crp|homocysteine|cortisol|dhea|psa|cmp|cbc|metabolic panel|vitamin d|b12|magnesium|uric acid|insulin|liver enzyme|alt|ast|creatinine)\b/i;
const QUESTION = /\?|^(what|which|why|how|when|do|does|is|are|should|can|could|would|has|have|any|anyone|need)\b/i;

// Out of scope for this site: what to take, how much, for how long, where to get it.
const REJECT =
  /\b(cycle|dosage|dosing|dose|mg\b|iu\b|ml\b|pct\b|aas\b|gear|source(s|ing)?\b|vendor for|where to buy|blast|cruise|trt dose|inject|pin(ning)?\b|ester|anavar|tren|deca|dbol|sarm|rad-?140|lgd|mk-?677|semaglutide|tirzepatide|bpc-?157|tb-?500|hgh dose|peptide (dose|source|vendor))/i;

interface Candidate {
  source: 'REDDIT' | 'SEARCH_LOG';
  sourceId: string;
  sourceUrl?: string;
  origin: string;
  title: string;
  score: number;
}

/**
 * Reddit blocks anonymous requests to its public JSON endpoints (HTTP 403 as of 2026), so this uses
 * the official API with a registered app — which is also the compliant route rather than a
 * workaround. Create a "script" app at https://www.reddit.com/prefs/apps and set REDDIT_CLIENT_ID
 * and REDDIT_CLIENT_SECRET. The free tier covers read-only research use at this volume; Reddit
 * restricts *commercial* use of its content without a licensing agreement, which is why nothing
 * harvested here is ever republished.
 */
async function redditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    console.warn(`Reddit auth failed: HTTP ${res.status}. Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.`);
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function harvestReddit(): Promise<Candidate[]> {
  const token = await redditToken();
  if (!token) {
    console.log('Reddit: not configured (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET unset) — skipping.');
    return [];
  }

  const out: Candidate[] = [];
  for (const sub of SUBREDDITS) {
    // `top` over a year surfaces what a community keeps coming back to, not today's noise.
    const res = await fetch(`https://oauth.reddit.com/r/${sub}/top?t=year&limit=100`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
    });
    if (!res.ok) {
      console.warn(`  r/${sub}: HTTP ${res.status} — skipped`);
      continue;
    }
    const json = (await res.json()) as {
      data?: { children?: { data: { name: string; title: string; score: number; permalink: string; subreddit: string; over_18: boolean; stickied: boolean } }[] };
    };
    let kept = 0;
    for (const { data: d } of json.data?.children ?? []) {
      if (d.over_18 || d.stickied) continue;
      const title = d.title.trim();
      if (!QUESTION.test(title) || !TEST_WORDS.test(title) || REJECT.test(title)) continue;
      out.push({
        source: 'REDDIT',
        sourceId: d.name,
        sourceUrl: `https://www.reddit.com${d.permalink}`,
        origin: `r/${d.subreddit}`,
        title,
        score: d.score,
      });
      kept += 1;
    }
    console.log(`  r/${sub}: ${kept} candidate(s)`);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return out;
}

/**
 * Searches on our own site that returned nothing. Someone wanted this and we had no answer, which is
 * a stronger signal than an upvote — and it needs no third party at all.
 *
 * The raw log is noisy in a specific way: the search box logs a query per keystroke, so a single
 * person typing "semaglutide" leaves "Sem", "Sema", "Semag"… behind. Three filters clean that up —
 * drop fragments, drop bare numbers (those are people pasting a Quest/LabCorp order code, not a
 * topic), and drop any query that is a strict prefix of a longer one we also captured.
 */
async function harvestSearchLogs(): Promise<Candidate[]> {
  const rows = await prisma.searchLog.groupBy({
    by: ['query'],
    // `committed: true` excludes the SearchBar's per-keystroke autocomplete lookups. Rows written
    // before that column existed all default to true, which is why the text filters below still
    // matter — they are what keeps legacy fragments ("Tezt", "insi") out of the queue.
    where: { resultsCount: 0, committed: true, createdAt: { gte: new Date(Date.now() - 180 * 86_400_000) } },
    _count: { query: true },
    orderBy: { _count: { query: 'desc' } },
    take: 400,
  });

  const cleaned = rows
    .map((r) => ({ q: r.query.trim(), n: r._count.query }))
    // A phrase, or a whole word. "Tezt" and "insi" are four characters and pass any length-only
    // test, so the rule is: multi-word, or long enough to be a word rather than the start of one.
    .filter(({ q }) => q.includes(' ') || q.length >= 6)
    .filter(({ q }) => !/^[\d\s.-]+$/.test(q)) // an order code, not a subject
    .filter(({ q }) => !REJECT.test(q)); // same scope rule as the forums: markers, not compounds

  // Keep the longest form of any query someone typed their way into.
  const byLength = [...cleaned].sort((a, b) => b.q.length - a.q.length);
  const kept: typeof cleaned = [];
  for (const row of byLength) {
    const lower = row.q.toLowerCase();
    const isPrefix = kept.some((k) => k.q.toLowerCase().startsWith(lower) && k.q.length > row.q.length);
    if (!isPrefix) kept.push(row);
  }

  return kept.map(({ q, n }) => ({
    source: 'SEARCH_LOG' as const,
    // The query itself is the stable identity — the same search recurring is the same candidate.
    sourceId: q.toLowerCase(),
    origin: 'site search (0 results)',
    title: q,
    score: n,
  }));
}

/** Rough tie to something we can price. A topic we can't link to a test makes a weaker article. */
function matchTests(title: string, tests: { slug: string; name: string }[]): string[] {
  const t = title.toLowerCase();
  return tests
    .filter(({ name }) => {
      const head = name.toLowerCase().split(/[,(]/)[0]!.trim();
      return head.length > 3 && t.includes(head);
    })
    .map((x) => x.slug)
    .slice(0, 4);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const only = process.argv.includes('--reddit-only') ? 'reddit' : process.argv.includes('--search-only') ? 'search' : 'both';

  const candidates: Candidate[] = [];
  if (only !== 'search') candidates.push(...(await harvestReddit()));
  if (only !== 'reddit') {
    const s = await harvestSearchLogs();
    console.log(`Site search: ${s.length} zero-result quer${s.length === 1 ? 'y' : 'ies'}`);
    candidates.push(...s);
  }

  const tests = await prisma.test.findMany({ where: { deletedAt: null }, select: { slug: true, name: true } });

  if (dry) {
    for (const c of candidates.sort((a, b) => b.score - a.score).slice(0, 40)) {
      console.log(`  [${String(c.score).padStart(5)}] ${c.origin.padEnd(24)} ${c.title}`);
    }
    console.log(`\n${candidates.length} candidate(s) — dry run, nothing written.`);
    return;
  }

  for (const c of candidates) {
    await prisma.questionCandidate.upsert({
      where: { source_sourceId: { source: c.source, sourceId: c.sourceId } },
      create: { ...c, matchedTests: matchTests(c.title, tests) },
      // The ranking signal moves; a human's decision doesn't. Only score is refreshed on re-harvest.
      update: { score: c.score },
    });
  }

  const pending = await prisma.questionCandidate.count({ where: { status: 'NEW' } });
  console.log(`\n${candidates.length} candidate(s) written. ${pending} awaiting review at /admin/questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
